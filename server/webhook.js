import express from 'express';
import cors from 'cors';
import multer from 'multer';
import OpenAI from 'openai';
import { execSync } from 'child_process';

const app = express();
const PORT = process.env.PORT || 3001;
const upload = multer();

// Initialize OpenAI with Replit AI Integrations
const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

// Airtable configuration
const AIRTABLE_PAT = process.env.AIRTABLE_PAT;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const TABLE_NAME = 'Sales';
const PICKS_TABLE_NAME = 'Picks';

// Admin password
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// Helper function to clean URLs (remove all tracking parameters)
function cleanUrl(url) {
  if (!url) return url;
  try {
    const urlObj = new URL(url);
    // Return just origin + pathname (no query params or hash)
    return `${urlObj.origin}${urlObj.pathname}`;
  } catch (e) {
    return url;
  }
}

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.text({ type: 'text/*' }));

// Debug middleware to log requests (excluding sensitive headers)
app.use((req, res, next) => {
  console.log(`📨 ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Webhook server is running' });
});

// ============================================
// PUBLIC ENDPOINTS
// ============================================

// Get live sales with picks (no auth required - for public homepage)
app.get('/sales', async (req, res) => {
  try {
    // Build filter to only get Live=YES sales
    // Fetch all fields (including formula fields like ShopMyURL)
    const filterFormula = `{Live}='YES'`;
    const params = new URLSearchParams({
      filterByFormula: filterFormula,
      pageSize: '100'
    });
    
    // Fetch sales (all fields including ShopMyURL)
    const salesResponse = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE_NAME}?${params}`, {
      headers: {
        'Authorization': `Bearer ${AIRTABLE_PAT}`
      }
    });
    
    if (!salesResponse.ok) {
      throw new Error(`Airtable error: ${salesResponse.status}`);
    }
    
    const salesData = await salesResponse.json();
    
    // Fetch all picks
    const picksResponse = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${PICKS_TABLE_NAME}`, {
      headers: {
        'Authorization': `Bearer ${AIRTABLE_PAT}`
      }
    });
    
    const picksData = picksResponse.ok ? await picksResponse.json() : { records: [] };
    
    // Group picks by SaleID
    const picksBySale = new Map();
    picksData.records.forEach(record => {
      const saleIds = record.fields.SaleID || [];
      saleIds.forEach(saleId => {
        if (!picksBySale.has(saleId)) {
          picksBySale.set(saleId, []);
        }
        picksBySale.get(saleId).push({
          id: record.id,
          name: record.fields.ProductName || '',
          url: record.fields.ProductURL || '',
          imageUrl: record.fields.ImageURL || '',
          originalPrice: record.fields.OriginalPrice || 0,
          salePrice: record.fields.SalePrice || 0,
          percentOff: record.fields.PercentOff || 0,
          shopMyUrl: record.fields.ShopMyURL || '#'
        });
      });
    });
    
    // Map sales to frontend format
    const sales = salesData.records.map(record => {
      // Generate clean ShopMy URL by stripping tracking params
      let saleUrl = '#';
      const rawUrl = record.fields.CleanURL || record.fields.SaleURL;
      if (rawUrl) {
        const cleanedUrl = cleanUrl(rawUrl);
        saleUrl = `https://go.shopmy.us/ap/l9N1lH?url=${encodeURIComponent(cleanedUrl)}`;
      }
      
      return {
        id: record.id,
        brandName: record.fields.Company || 'Unknown Brand',
        brandLogo: record.fields.Company || 'BRAND',
        discount: `${record.fields.PercentOff || 0}% Off`,
        discountCode: record.fields.PromoCode || record.fields.DiscountCode || undefined,
        startDate: record.fields.StartDate,
        endDate: record.fields.EndDate,
        saleUrl: saleUrl,
        featured: record.fields.Featured === 'YES',
        imageUrl: record.fields.Image && record.fields.Image.length > 0 ? record.fields.Image[0].url : undefined,
        createdTime: record.createdTime,
        picks: picksBySale.get(record.id) || []
      };
    });
    
    res.json({ success: true, sales });
  } catch (error) {
    console.error('❌ Error fetching sales:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================
// ADMIN ENDPOINTS
// ============================================

// Admin authentication
app.post('/admin/auth', (req, res) => {
  const { password } = req.body;
  
  if (password === ADMIN_PASSWORD) {
    return res.json({ success: true, token: 'admin-authenticated' });
  }
  
  return res.status(401).json({ success: false, message: 'Invalid password' });
});

// Get all sales for admin
app.get('/admin/sales', (req, res) => {
  const { auth } = req.headers;
  
  if (auth !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  // Fetch all sales from Airtable, sorted by created time (newest first)
  fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE_NAME}?sort%5B0%5D%5Bfield%5D=Created&sort%5B0%5D%5Bdirection%5D=desc`, {
    headers: {
      'Authorization': `Bearer ${AIRTABLE_PAT}`
    }
  })
  .then(response => response.json())
  .then(data => {
    const sales = data.records.map(record => ({
      id: record.id,
      saleName: record.fields.SaleName || record.fields.Company || 'Unnamed Sale',
      company: record.fields.Company,
      percentOff: record.fields.PercentOff,
      startDate: record.fields.StartDate,
      endDate: record.fields.EndDate,
      live: record.fields.Live
    }));
    res.json({ success: true, sales });
  })
  .catch(error => {
    console.error('Error fetching sales:', error);
    res.status(500).json({ success: false, message: error.message });
  });
});

// Clean all CleanURL fields in Airtable (remove tracking parameters)
app.post('/admin/clean-urls', async (req, res) => {
  const { auth } = req.headers;
  
  if (auth !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  try {
    console.log('🧹 Starting URL cleanup process...');
    
    // Fetch all sales
    const response = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE_NAME}`, {
      headers: {
        'Authorization': `Bearer ${AIRTABLE_PAT}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch sales: ${response.status}`);
    }
    
    const data = await response.json();
    const updates = [];
    
    // Process each sale
    for (const record of data.records) {
      const saleUrl = record.fields.SaleURL;
      const currentCleanUrl = record.fields.CleanURL;
      
      if (saleUrl) {
        const cleaned = cleanUrl(saleUrl);
        
        // Only update if CleanURL is different from cleaned version
        if (cleaned !== currentCleanUrl) {
          updates.push({
            id: record.id,
            company: record.fields.Company,
            old: currentCleanUrl || 'empty',
            new: cleaned
          });
          
          // Update Airtable
          await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE_NAME}/${record.id}`, {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${AIRTABLE_PAT}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              fields: {
                CleanURL: cleaned
              }
            })
          });
          
          console.log(`✅ Updated ${record.fields.Company}: ${cleaned}`);
        }
      }
    }
    
    console.log(`🎉 Cleanup complete! Updated ${updates.length} records.`);
    res.json({ 
      success: true, 
      message: `Cleaned ${updates.length} URLs`,
      updates 
    });
    
  } catch (error) {
    console.error('❌ Error cleaning URLs:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Scrape product data from URL using OpenAI
app.post('/admin/scrape-product', async (req, res) => {
  const { auth } = req.headers;
  const { url } = req.body;
  
  if (auth !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  if (!url) {
    return res.status(400).json({ success: false, message: 'URL is required' });
  }
  
  // Comprehensive URL validation to prevent SSRF
  try {
    const urlObj = new URL(url);
    
    // Only allow HTTP(S)
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return res.status(400).json({ success: false, message: 'Invalid URL protocol' });
    }
    
    // Block private/internal IPs and hostnames
    const hostname = urlObj.hostname.toLowerCase();
    
    // Block common localhost/loopback names
    const blockedHosts = ['localhost', 'localhost.localdomain', '0.0.0.0'];
    if (blockedHosts.includes(hostname)) {
      return res.status(400).json({ success: false, message: 'Private URLs not allowed' });
    }
    
    // Block IPv4 private ranges (10.x, 127.x, 169.254.x, 172.16-31.x, 192.168.x)
    const ipv4Pattern = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const ipMatch = hostname.match(ipv4Pattern);
    if (ipMatch) {
      const [, a, b, c, d] = ipMatch.map(Number);
      if (a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)) {
        return res.status(400).json({ success: false, message: 'Private URLs not allowed' });
      }
    }
    
    // Block IPv6 loopback and link-local (::1, fe80::, etc.)
    if (hostname.includes(':')) {
      if (hostname === '::1' || hostname.startsWith('fe80:') || hostname.startsWith('::ffff:127')) {
        return res.status(400).json({ success: false, message: 'Private URLs not allowed' });
      }
    }
    
  } catch (e) {
    return res.status(400).json({ success: false, message: 'Invalid URL format' });
  }
  
  try {
    console.log(`🔍 Scraping product: ${url}`);
    
    // Fetch the product page HTML
    const response = await fetch(url, { 
      redirect: 'follow',
      timeout: 10000
    });
    const html = await response.text();
    
    // Extract a larger portion of HTML to capture JavaScript-rendered prices
    // Many Shopify sites have price data beyond 100KB into the HTML
    const htmlSnippet = html.substring(0, 200000); // Increased to 200KB to capture deep price data
    
    console.log(`📄 HTML snippet length: ${htmlSnippet.length} characters (total: ${html.length})`);
    
    // Use OpenAI to extract product data
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a product page parser. Extract product information from HTML and return ONLY valid JSON.

CRITICAL INSTRUCTIONS FOR PRICE EXTRACTION:
1. Look for TWO distinct prices on the page:
   - Original/Compare-at/Regular price (usually crossed out or higher price)
   - Current/Sale price (the active selling price)

2. SHOPIFY-SPECIFIC PATTERNS (check these FIRST):
   - <compare-at-price> tags containing the regular price
   - <sale-price> tags containing the sale price  
   - JSON in <script type="application/json"> with "compare_at_price" and "price" fields (prices in CENTS, divide by 100)
   - Example: "price":13100,"compare_at_price":43500 means salePrice=$131, originalPrice=$435

3. OTHER HTML PATTERNS:
   - <s>, <del>, <strike> tags with higher price
   - Classes: "compare-price", "was-price", "original-price", "line-through"
   - Text: "Was $X", "Originally $X", "Compare at $X", "Regular price $X"
   - JSON-LD: "price" and "compareAtPrice"

4. If BOTH prices exist, originalPrice MUST be HIGHER than salePrice
5. If only ONE price exists, set originalPrice to null and percentOff to 0

Return this exact structure:
{
  "name": "Product Name",
  "imageUrl": "https://cdn.example.com/image.jpg",
  "originalPrice": 435.00,
  "salePrice": 131.00,
  "percentOff": 70
}

Rules:
- name: Extract product title/name (required)
- imageUrl: Find the main product image URL - must be a full absolute URL starting with http:// or https:// (required)
- originalPrice: The HIGHER regular/compare-at price. Set to null if only one price exists.
- salePrice: The CURRENT selling price (required)
- percentOff: Calculate as Math.round(((originalPrice - salePrice) / originalPrice) * 100). Set to 0 if originalPrice is null.
- For Shopify JSON prices in cents, divide by 100 to get dollar amounts
- NEVER set originalPrice equal to salePrice
- Return ONLY the JSON object, no markdown, no explanations
- If you can't extract basic product info, return: {"error": "Could not extract product data"}`
        },
        {
          role: 'user',
          content: htmlSnippet
        }
      ],
      temperature: 0.1,
    });
    
    const aiResponse = completion.choices[0].message.content.trim();
    console.log('🤖 AI Response:', aiResponse);
    
    // Parse the AI response
    let productData;
    try {
      const jsonString = aiResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      productData = JSON.parse(jsonString);
    } catch (parseError) {
      console.error('❌ Failed to parse AI response:', parseError);
      return res.status(500).json({ success: false, message: 'Failed to parse product data' });
    }
    
    if (productData.error) {
      return res.status(400).json({ success: false, message: productData.error });
    }
    
    // Validate required fields
    if (!productData.name || !productData.imageUrl || !productData.salePrice) {
      return res.status(400).json({ success: false, message: 'Missing required product fields' });
    }
    
    // Parse prices - originalPrice can be null if not on sale, salePrice is always required
    let originalPrice = productData.originalPrice !== null ? parseFloat(productData.originalPrice) : null;
    const salePrice = parseFloat(productData.salePrice);
    let percentOff = productData.percentOff !== null && productData.percentOff !== undefined ? parseFloat(productData.percentOff) : 0;
    
    if (isNaN(salePrice) || (originalPrice !== null && isNaN(originalPrice))) {
      return res.status(400).json({ success: false, message: 'Invalid price data' });
    }
    
    // Defensive validation: originalPrice must be HIGHER than salePrice
    // If they're equal or originalPrice is lower, the item is not on sale
    if (originalPrice !== null && originalPrice <= salePrice) {
      console.log(`⚠️  Invalid discount: originalPrice (${originalPrice}) <= salePrice (${salePrice}). Setting originalPrice to null.`);
      originalPrice = null;
      percentOff = 0;
    }
    
    // Recalculate percentOff to ensure accuracy
    if (originalPrice !== null && originalPrice > salePrice) {
      percentOff = Math.round(((originalPrice - salePrice) / originalPrice) * 100);
    }
    
    console.log('✅ Extracted product:', productData);
    
    res.json({ 
      success: true, 
      product: {
        name: productData.name,
        imageUrl: productData.imageUrl,
        originalPrice: originalPrice,
        salePrice: salePrice,
        percentOff: percentOff,
        url: url
      }
    });
    
  } catch (error) {
    console.error('❌ Product scraping error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Save picks to Airtable
app.post('/admin/picks', async (req, res) => {
  const { auth } = req.headers;
  const { saleId, picks } = req.body;
  
  if (auth !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  if (!saleId || !picks || !Array.isArray(picks)) {
    return res.status(400).json({ success: false, message: 'saleId and picks array required' });
  }
  
  try {
    console.log(`💾 Saving ${picks.length} picks for sale ${saleId}`);
    
    // Helper function to clean URLs
    function cleanProductUrl(url) {
      try {
        const urlObj = new URL(url);
        return `${urlObj.origin}${urlObj.pathname}`;
      } catch (e) {
        return url;
      }
    }
    
    // Create records for each pick
    // Note: ShopMyURL and PercentOff are computed fields in Airtable, don't send them
    const records = picks.map(pick => {
      const fields = {
        ProductURL: pick.url,
        ProductName: pick.name,
        ImageURL: pick.imageUrl,
        SaleID: [saleId] // Link to Sales table
      };
      
      // Only add prices if they exist
      if (pick.originalPrice) {
        fields.OriginalPrice = pick.originalPrice;
      }
      if (pick.salePrice) {
        fields.SalePrice = pick.salePrice;
      }
      
      return { fields };
    });
    
    // Airtable has a 10-record limit per request, so batch the picks
    const BATCH_SIZE = 10;
    const allRecordIds = [];
    
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      
      const airtableUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${PICKS_TABLE_NAME}`;
      const airtableResponse = await fetch(airtableUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${AIRTABLE_PAT}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ records: batch })
      });
      
      if (!airtableResponse.ok) {
        const errorText = await airtableResponse.text();
        console.error('❌ Airtable error:', errorText);
        return res.status(500).json({ 
          success: false, 
          message: `Failed to save picks (batch ${Math.floor(i / BATCH_SIZE) + 1})` 
        });
      }
      
      const data = await airtableResponse.json();
      allRecordIds.push(...data.records.map(r => r.id));
      console.log(`✅ Saved batch ${Math.floor(i / BATCH_SIZE) + 1}: ${data.records.length} picks`);
    }
    
    console.log(`✅ Total saved: ${allRecordIds.length} picks`);
    
    res.json({ 
      success: true, 
      message: `Saved ${allRecordIds.length} picks`,
      recordIds: allRecordIds
    });
    
  } catch (error) {
    console.error('❌ Save picks error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// CloudMailin/AgentMail webhook endpoint - handle both JSON and multipart
app.post('/webhook/agentmail', upload.none(), async (req, res) => {
  console.log('📧 Received email webhook');
  
  try {
    // CloudMailin can send data as JSON or form-data
    const emailData = req.body;
    
    // Log the entire request body to understand the format
    console.log('📦 Request body type:', typeof emailData);
    console.log('📦 Request body:', JSON.stringify(emailData, null, 2));
    console.log('📦 Request body keys:', Object.keys(emailData || {}));
    
    // CloudMailin format: { envelope: {...}, headers: {...}, plain: "...", html: "..." }
    // Extract email metadata and content based on CloudMailin's format
    const from = emailData.envelope?.from || emailData.from || 'unknown';
    const subject = emailData.headers?.subject || emailData.subject || 'No subject';
    
    // Log the incoming email for debugging
    console.log('Email from:', from);
    console.log('Subject:', subject);
    
    // Extract email content (try both plain and HTML)
    const emailContent = emailData.plain || emailData.html || emailData.text || emailData.body || '';
    
    if (!emailContent) {
      console.log('⚠️  No email content found');
      return res.status(200).json({ success: false, message: 'No content' });
    }
    
    console.log('📝 Extracting sale information with AI...');
    
    // Use OpenAI to extract structured sale information from email
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a sales email parser. Extract sale information from emails and return ONLY valid JSON.
          
Return this exact structure:
{
  "company": "Brand Name",
  "percentOff": 30,
  "saleUrl": "https://example.com/sale",
  "discountCode": "CODE123",
  "startDate": "2025-11-04",
  "endDate": "2025-11-10",
  "confidence": 95
}

Rules:
- company: Extract brand/company name (required)
- percentOff: Extract discount percentage as a number (required, use best estimate if not explicit)
- saleUrl: Find the main sale/shopping URL (required)
- discountCode: Extract promo code if mentioned (optional, use null if not found)
- startDate: Use today's date in YYYY-MM-DD format (required)
- endDate: Extract end date or use null if not mentioned
- confidence: Rate your confidence in the extraction accuracy from 1-100 (required). Use 90-100 for very clear sales emails with explicit information, 70-89 for emails with some ambiguity, 50-69 for estimates, below 50 for highly uncertain extractions.
- Return ONLY the JSON object, no markdown, no explanations
- If the email is not about a sale, return: {"error": "Not a sale email"}`
        },
        {
          role: 'user',
          content: emailContent.substring(0, 4000) // Limit content length
        }
      ],
      temperature: 0.1,
    });
    
    const aiResponse = completion.choices[0].message.content.trim();
    console.log('🤖 AI Response:', aiResponse);
    
    // Parse the AI response
    let saleData;
    try {
      // Remove markdown code blocks if present
      const jsonString = aiResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      saleData = JSON.parse(jsonString);
    } catch (parseError) {
      console.error('❌ Failed to parse AI response as JSON:', parseError);
      return res.status(200).json({ success: false, message: 'AI response parsing failed' });
    }
    
    // Check if it's a valid sale
    if (saleData.error) {
      console.log('ℹ️  Not a sale email');
      return res.status(200).json({ success: false, message: saleData.error });
    }
    
    // Validate required fields
    if (!saleData.company || !saleData.saleUrl || !saleData.percentOff) {
      console.log('❌ Missing required fields');
      return res.status(200).json({ success: false, message: 'Missing required fields' });
    }
    
    console.log('✅ Parsed sale data:', saleData);
    
    // Check for duplicates in Airtable (same company + percent within 2 weeks)
    console.log('🔍 Checking for duplicates...');
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const twoWeeksAgoStr = twoWeeksAgo.toISOString().split('T')[0];
    
    const duplicateCheckUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE_NAME}?filterByFormula=AND({Company}='${saleData.company.replace(/'/g, "\\'")}',{PercentOff}=${saleData.percentOff},IS_AFTER({StartDate},'${twoWeeksAgoStr}'))`;
    
    const duplicateResponse = await fetch(duplicateCheckUrl, {
      headers: {
        'Authorization': `Bearer ${AIRTABLE_PAT}`
      }
    });
    
    if (duplicateResponse.ok) {
      const duplicateData = await duplicateResponse.json();
      if (duplicateData.records && duplicateData.records.length > 0) {
        console.log(`⏭️  Duplicate found: ${saleData.company} ${saleData.percentOff}% already exists from the past 2 weeks`);
        return res.status(200).json({ 
          success: false, 
          message: 'Duplicate sale - already exists in past 2 weeks',
          existingRecordId: duplicateData.records[0].id
        });
      }
    }
    console.log('✅ No duplicates found');
    
    // Clean the URL using curl redirect following
    console.log('🔄 Cleaning URL...');
    let cleanUrl = saleData.saleUrl;
    try {
      cleanUrl = execSync(
        `curl -sL -o /dev/null -w '%{url_effective}' '${saleData.saleUrl}'`,
        { encoding: 'utf-8', timeout: 10000 }
      ).trim();
      console.log('✅ Clean URL:', cleanUrl);
    } catch (error) {
      console.error('⚠️  URL cleaning failed, using original URL:', error.message);
    }
    
    // Create Airtable record
    console.log('💾 Creating Airtable record...');
    const airtableUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE_NAME}`;
    
    const airtableResponse = await fetch(airtableUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_PAT}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fields: {
          Company: saleData.company,
          PercentOff: saleData.percentOff,
          SaleURL: saleData.saleUrl,
          CleanURL: cleanUrl !== saleData.saleUrl ? cleanUrl : saleData.saleUrl,
          PromoCode: saleData.discountCode || '',
          StartDate: saleData.startDate,
          EndDate: saleData.endDate || '',
          Confidence: saleData.confidence || 50, // AI confidence rating 1-100
          Live: 'NO', // Default to NO - user will review and set to YES
          Featured: '', // User will set this manually
          Description: JSON.stringify({
            source: 'email',
            originalEmail: {
              from: from,
              subject: subject,
              receivedAt: new Date().toISOString()
            }
          })
        }
      })
    });
    
    if (!airtableResponse.ok) {
      const errorText = await airtableResponse.text();
      console.error('❌ Airtable error:', errorText);
      return res.status(200).json({ success: false, message: 'Airtable error' });
    }
    
    const airtableData = await airtableResponse.json();
    console.log('✅ Created Airtable record:', airtableData.id);
    
    res.status(200).json({ 
      success: true, 
      message: 'Sale processed and added to Airtable',
      recordId: airtableData.id,
      saleData: {
        company: saleData.company,
        percentOff: saleData.percentOff,
        cleanUrl: cleanUrl
      }
    });
    
  } catch (error) {
    console.error('❌ Webhook processing error:', error);
    res.status(200).json({ success: false, message: error.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Webhook server running on port ${PORT}`);
  console.log(`📬 AgentMail webhook endpoint: http://0.0.0.0:${PORT}/webhook/agentmail`);
});
