import express from 'express';
import cors from 'cors';
import multer from 'multer';
import OpenAI from 'openai';
import { execSync } from 'child_process';
import { scrapeProduct } from './scrapers/index.js';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeTelegramBot } from './telegram-bot.js';
import { scrapeGemItems } from './gem-scraper.js';
import { generateMultipleFeaturedAssets } from './featured-assets-generator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// Auto-detect environment and use appropriate Airtable base
// Production deployments have REPLIT_DEPLOYMENT env var set
const isProduction = !!process.env.REPLIT_DEPLOYMENT;
const AIRTABLE_BASE_ID = isProduction 
  ? process.env.AIRTABLE_BASE_ID 
  : (process.env.AIRTABLE_BASE_ID_DEV || process.env.AIRTABLE_BASE_ID);

console.log(`🔧 Environment: ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);
console.log(`📊 Using Airtable Base: ${AIRTABLE_BASE_ID?.substring(0, 10)}...`);

const TABLE_NAME = 'Sales';
const PICKS_TABLE_NAME = 'Picks';

// Admin password
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// CloudMailin webhook secret for HMAC verification
const CLOUDMAIL_SECRET = process.env.CLOUDMAIL_SECRET;

// Telegram configuration
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Gem configuration
const GEM_EMAIL = process.env.GEM_EMAIL;
const GEM_TABLE_NAME = 'Gem';

// Simple in-memory cache for sales data
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const cache = {
  sales: {
    data: null,
    expiresAt: 0
  }
};

// In-memory storage for Gem magic links (expires after 5 minutes)
const gemMagicLinks = {
  link: null,
  expiresAt: 0,
  pendingRequest: null // Promise resolver for sync endpoint waiting for link
};

// Helper functions for cache management
function getCachedSales() {
  if (cache.sales.data && Date.now() < cache.sales.expiresAt) {
    console.log('✨ Cache HIT - returning cached sales data');
    return cache.sales.data;
  }
  console.log('💾 Cache MISS - fetching fresh data from Airtable');
  return null;
}

function setCachedSales(data) {
  cache.sales.data = data;
  cache.sales.expiresAt = Date.now() + CACHE_TTL_MS;
  console.log(`📦 Cached ${data.length} sales (expires in ${CACHE_TTL_MS / 1000}s)`);
}

function clearSalesCache() {
  cache.sales.data = null;
  cache.sales.expiresAt = 0;
  console.log('🗑️  Sales cache cleared');
}

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

// Helper function to fetch all records from Airtable with automatic pagination
async function fetchAllAirtableRecords(tableName, params = {}) {
  const allRecords = [];
  let offset = null;
  
  do {
    // Build URL with params and offset
    const urlParams = new URLSearchParams(params);
    if (offset) {
      urlParams.set('offset', offset);
    }
    
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${tableName}?${urlParams}`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${AIRTABLE_PAT}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`Airtable error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    allRecords.push(...data.records);
    offset = data.offset || null;
    
    console.log(`📦 Fetched ${data.records.length} records from ${tableName} (total: ${allRecords.length})`);
  } while (offset);
  
  return allRecords;
}

// Verify CloudMailin HMAC signature to prevent fake webhook requests
function verifyCloudMailSignature(requestBody, signature) {
  if (!CLOUDMAIL_SECRET) {
    console.warn('⚠️  CLOUDMAIL_SECRET not configured - skipping signature verification');
    return true; // Allow during setup, but log warning
  }
  
  if (!signature) {
    console.error('❌ No signature provided in request');
    return false;
  }
  
  try {
    // CloudMailin sends the request body as JSON
    const payload = typeof requestBody === 'string' ? requestBody : JSON.stringify(requestBody);
    
    // Compute HMAC-SHA256 signature
    const hmac = crypto.createHmac('sha256', CLOUDMAIL_SECRET);
    hmac.update(payload);
    const computedSignature = hmac.digest('hex');
    
    // Compare signatures (timing-safe comparison)
    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(computedSignature, 'hex')
    );
    
    if (!isValid) {
      console.error('❌ Invalid signature - possible fake webhook request');
    }
    
    return isValid;
  } catch (error) {
    console.error('❌ Signature verification error:', error.message);
    return false;
  }
}

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.text({ type: 'text/*' }));

// Strip /api prefix from requests (for production compatibility with frontend)
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    req.url = req.url.replace(/^\/api/, '');
  }
  next();
});

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
    // Check cache first
    const cachedSales = getCachedSales();
    if (cachedSales) {
      return res.json({ success: true, sales: cachedSales });
    }
    
    // Fetch ALL live sales with pagination
    const salesRecords = await fetchAllAirtableRecords(TABLE_NAME, {
      filterByFormula: `{Live}='YES'`,
      pageSize: '100'
    });
    
    // Extract sale IDs to filter picks efficiently
    const liveSaleIds = salesRecords.map(record => record.id);
    
    console.log(`📊 Found ${liveSaleIds.length} live sales, fetching only their picks...`);
    
    // Build filter formula to only fetch picks for live sales
    // Uses SaleRecordIDs lookup field to search for record IDs
    // Example: OR(FIND("rec123", {SaleRecordIDs} & ''), FIND("rec456", {SaleRecordIDs} & ''))
    let picksRecords = [];
    
    if (liveSaleIds.length > 0) {
      const filterConditions = liveSaleIds.map(saleId => 
        `FIND("${saleId}", {SaleRecordIDs} & '')`
      ).join(', ');
      
      const picksFilter = liveSaleIds.length === 1 
        ? filterConditions  // No OR needed for single sale
        : `OR(${filterConditions})`;
      
      console.log(`🔍 Picks filter formula: ${picksFilter}`);
      
      // Fetch ONLY picks linked to live sales with pagination
      picksRecords = await fetchAllAirtableRecords(PICKS_TABLE_NAME, {
        filterByFormula: picksFilter,
        pageSize: '100'
      });
    } else {
      console.log('⚠️  No live sales found, skipping picks fetch');
    }
    
    // Group picks by SaleID
    const picksBySale = new Map();
    picksRecords.forEach(record => {
      const saleIds = record.fields.SaleID || [];
      saleIds.forEach(saleId => {
        if (!picksBySale.has(saleId)) {
          picksBySale.set(saleId, []);
        }
        picksBySale.get(saleId).push({
          id: record.id,
          name: record.fields.ProductName || '',
          brand: record.fields.Brand || null,
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
    const sales = salesRecords.map(record => {
      // Generate clean ShopMy URL by stripping tracking params
      let saleUrl = '#';
      const rawUrl = record.fields.CleanURL || record.fields.SaleURL;
      if (rawUrl) {
        const cleanedUrl = cleanUrl(rawUrl);
        saleUrl = `https://go.shopmy.us/apx/l9N1lH?url=${encodeURIComponent(cleanedUrl)}`;
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
    
    // Cache the sales data before returning
    setCachedSales(sales);
    
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
    return res.json({ success: true });
  }
  
  return res.status(401).json({ success: false, message: 'Invalid password' });
});

// Get all sales for admin
app.get('/admin/sales', async (req, res) => {
  const { auth } = req.headers;
  
  if (auth !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  try {
    // Fetch ALL sales from Airtable with pagination, sorted by created time (newest first)
    const salesRecords = await fetchAllAirtableRecords(TABLE_NAME, {
      'sort[0][field]': 'Created',
      'sort[0][direction]': 'desc',
      pageSize: '100'
    });
    
    const sales = salesRecords.map(record => ({
      id: record.id,
      saleName: record.fields.SaleName || record.fields.Company || 'Unnamed Sale',
      company: record.fields.Company,
      percentOff: record.fields.PercentOff,
      startDate: record.fields.StartDate,
      endDate: record.fields.EndDate,
      live: record.fields.Live
    }));
    
    res.json({ success: true, sales });
  } catch (error) {
    console.error('Error fetching sales:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Clean all CleanURL fields in Airtable (remove tracking parameters)
app.post('/admin/clean-urls', async (req, res) => {
  const { auth } = req.headers;
  
  if (auth !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  try {
    console.log('🧹 Starting URL cleanup process...');
    
    // Fetch ALL sales with pagination
    const salesRecords = await fetchAllAirtableRecords(TABLE_NAME, {
      pageSize: '100'
    });
    
    const updates = [];
    
    // Process each sale
    for (const record of salesRecords) {
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
    
    // Clear sales cache if any URLs were updated
    if (updates.length > 0) {
      clearSalesCache();
    }
    
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

// Extract just the og:image from a URL (lightweight, no AI)
app.post('/admin/extract-image', async (req, res) => {
  const { auth } = req.headers;
  const { url } = req.body;
  
  if (auth !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  if (!url) {
    return res.status(400).json({ success: false, message: 'URL is required' });
  }
  
  try {
    console.log(`🖼️  Extracting image from: ${url}`);
    
    // Fetch the page
    const response = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; WellSpentStyle/1.0)'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch page: ${response.status}`);
    }
    
    const html = await response.text();
    
    // Extract og:image or twitter:image using same logic as fast-scraper
    const ogImageMatch = html.match(/<meta[^>]*(?:property|name)=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']og:image["']/i);
    const twitterImageMatch = html.match(/<meta[^>]*(?:property|name)=["']twitter:image["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']twitter:image["']/i);
    
    let imageUrl = null;
    
    if (ogImageMatch && ogImageMatch[1] && ogImageMatch[1].startsWith('http')) {
      imageUrl = ogImageMatch[1];
      console.log(`✅ Found og:image: ${imageUrl}`);
    } else if (twitterImageMatch && twitterImageMatch[1] && twitterImageMatch[1].startsWith('http')) {
      imageUrl = twitterImageMatch[1];
      console.log(`✅ Found twitter:image: ${imageUrl}`);
    }
    
    if (!imageUrl) {
      return res.status(404).json({ 
        success: false, 
        message: 'No og:image or twitter:image found on page' 
      });
    }
    
    res.json({ 
      success: true, 
      imageUrl 
    });
    
  } catch (error) {
    console.error('❌ Image extraction error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Extract domain from URL for skip logic
function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, ''); // Remove www prefix for consistency
  } catch (error) {
    return url; // Return original if parsing fails
  }
}

// Scrape product data from URL(s) using intelligent orchestrator (fast scraper + Playwright fallback)
app.post('/admin/scrape-product', async (req, res) => {
  const { auth } = req.headers;
  const { url, urls, test } = req.body;
  
  if (auth !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  const urlsToScrape = urls || (url ? [url] : []);
  
  if (!urlsToScrape || urlsToScrape.length === 0) {
    return res.status(400).json({ success: false, message: 'URL or URLs array is required' });
  }
  
  try {
    console.log(`🔍 Scraping ${urlsToScrape.length} product(s)`);
    
    const successes = [];
    const failures = [];
    const failedDomains = new Set(); // Track domains that failed scraping
    
    for (const productUrl of urlsToScrape) {
      const domain = extractDomain(productUrl);
      
      // Skip if this domain already failed
      if (failedDomains.has(domain)) {
        console.log(`  ⏩ Skipping ${productUrl} (domain ${domain} already failed)`);
        failures.push({
          url: productUrl,
          error: `Skipped - domain ${domain} failed on previous URL`,
          skipped: true
        });
        continue;
      }
      
      try {
        console.log(`  → ${productUrl}`);
        
        const result = await scrapeProduct(productUrl, {
          openai,
          enableTestMetadata: test || false,
          logger: console
        });
        
        if (!result.success) {
          const errorMsg = result.error || 'Could not extract product data';
          console.error(`  ❌ Failed: ${errorMsg}`);
          
          // Mark this domain as failed
          failedDomains.add(domain);
          console.log(`  🚫 Domain ${domain} marked as failed - will skip remaining URLs from this domain`);
          
          failures.push({
            url: productUrl,
            error: errorMsg,
            meta: result.meta
          });
        } else {
          console.log(`  ✅ Success via ${result.meta.extractionMethod} (confidence: ${result.meta.confidence}%)`);
          successes.push({
            url: productUrl,
            product: result.product,
            extractionMethod: result.meta.extractionMethod,
            confidence: result.meta.confidence,
            ...(test && { testMetadata: result.meta.testMetadata, attempts: result.meta.attempts })
          });
        }
      } catch (error) {
        console.error(`  ❌ Error scraping ${productUrl}:`, error.message);
        
        // Mark this domain as failed
        failedDomains.add(domain);
        console.log(`  🚫 Domain ${domain} marked as failed - will skip remaining URLs from this domain`);
        
        failures.push({
          url: productUrl,
          error: error.message
        });
      }
    }
    
    const skippedCount = failures.filter(f => f.skipped).length;
    console.log(`\n📊 Results: ${successes.length} succeeded, ${failures.length} failed (${skippedCount} skipped)`);
    
    res.json({
      success: true,
      successes,
      failures,
      total: urlsToScrape.length
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
    
    // Create records for each pick
    // Note: ShopMyURL and PercentOff are computed fields in Airtable, don't send them
    const records = picks.map(pick => {
      const fields = {
        ProductURL: cleanUrl(pick.url), // Clean URL to remove tracking parameters
        ProductName: pick.name,
        ImageURL: pick.imageUrl,
        SaleID: [saleId] // Link to Sales table
      };
      
      // Add brand if available
      if (pick.brand) {
        fields.Brand = pick.brand;
      }
      
      // Only add prices if they exist
      if (pick.originalPrice) {
        fields.OriginalPrice = pick.originalPrice;
      }
      if (pick.salePrice) {
        fields.SalePrice = pick.salePrice;
      }
      
      // Add confidence score if available (manual entries always get 100)
      if (pick.confidence !== undefined && pick.confidence !== null) {
        fields.Confidence = pick.confidence;
      }
      
      // Add entry type (manual vs automatic)
      if (pick.entryType) {
        fields.EntryType = pick.entryType;
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
    
    // Clear sales cache since picks changed
    clearSalesCache();
    
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

// Sync Gem items - trigger login email and scrape saved items
app.post('/admin/sync-gem', async (req, res) => {
  const { auth } = req.headers;
  
  if (auth !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  if (!GEM_EMAIL) {
    return res.status(500).json({ 
      success: false, 
      message: 'GEM_EMAIL not configured. Please set GEM_EMAIL environment variable.' 
    });
  }
  
  let browser;
  try {
    console.log('💎 Starting Gem sync process...');
    console.log('📧 Requesting login email from Gem using browser automation...');
    
    // Use Playwright to trigger login email (gem.app blocks direct API calls)
    const { chromium } = await import('playwright');
    
    // Try to find Chromium executable (different paths in dev vs production)
    let chromiumPath = null;
    try {
      chromiumPath = execSync('which chromium', { encoding: 'utf-8' }).trim();
      console.log(`✅ Found Chromium at: ${chromiumPath}`);
    } catch (e) {
      console.log('⚠️  Could not find chromium with which, trying default path...');
    }
    
    const launchOptions = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    };
    
    if (chromiumPath) {
      launchOptions.executablePath = chromiumPath;
    }
    
    console.log('🚀 Launching browser with options:', JSON.stringify(launchOptions, null, 2));
    browser = await chromium.launch(launchOptions);
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    });
    const page = await context.newPage();
    
    try {
      // Navigate to login page
      console.log('🌐 Navigating to gem.app/requestEmailLogIn...');
      await page.goto('https://gem.app/requestEmailLogIn', { waitUntil: 'domcontentloaded', timeout: 30000 });
      
      // Take screenshot for debugging
      await page.screenshot({ path: '/tmp/gem-login-1-loaded.png' });
      console.log('📸 Screenshot saved: /tmp/gem-login-1-loaded.png');
      
      // Wait for page to fully load
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {
        console.log('⚠️ Network not idle, continuing anyway...');
      });
      
      // Log page title and URL for debugging
      const title = await page.title();
      const url = page.url();
      console.log(`📄 Page loaded: "${title}" at ${url}`);
      
      // Try to find email input with multiple selectors
      const emailSelectors = [
        'input[type="email"]',
        'input[name="email"]',
        'input[placeholder*="email" i]',
        'input[autocomplete="email"]',
        '#email',
        'input'
      ];
      
      let emailInput = null;
      for (const selector of emailSelectors) {
        emailInput = await page.$(selector);
        if (emailInput) {
          console.log(`✅ Found email input with selector: ${selector}`);
          break;
        }
      }
      
      if (!emailInput) {
        // Log all inputs on the page
        const inputs = await page.$$eval('input', els => els.map(el => ({
          type: el.type,
          name: el.name,
          id: el.id,
          placeholder: el.placeholder,
          className: el.className
        })));
        console.log('🔍 All inputs found on page:', JSON.stringify(inputs, null, 2));
        throw new Error('Could not find email input field');
      }
      
      // Fill in email
      console.log('✏️ Filling email field...');
      await page.fill('input[type="email"]', GEM_EMAIL);
      await page.screenshot({ path: '/tmp/gem-login-2-filled.png' });
      console.log('📸 Screenshot saved: /tmp/gem-login-2-filled.png');
      
      // Try to find submit button with multiple selectors
      const submitSelectors = [
        'button[type="submit"]',
        'button:has-text("Continue")',
        'button:has-text("Log in")',
        'button:has-text("Sign in")',
        'input[type="submit"]',
        'button'
      ];
      
      let submitButton = null;
      for (const selector of submitSelectors) {
        submitButton = await page.$(selector);
        if (submitButton) {
          console.log(`✅ Found submit button with selector: ${selector}`);
          break;
        }
      }
      
      if (!submitButton) {
        // Log all buttons on the page
        const buttons = await page.$$eval('button', els => els.map(el => ({
          type: el.type,
          textContent: el.textContent,
          className: el.className,
          id: el.id
        })));
        console.log('🔍 All buttons found on page:', JSON.stringify(buttons, null, 2));
        
        // Also check for divs that might be styled as buttons
        const divButtons = await page.$$eval('div[role="button"], div[onclick], a[role="button"]', els => els.map(el => ({
          tagName: el.tagName,
          textContent: el.textContent.trim(),
          className: el.className,
          role: el.getAttribute('role')
        })));
        console.log('🔍 Div/link elements that might be buttons:', JSON.stringify(divButtons, null, 2));
        
        // Try pressing Enter in the email field as alternative
        console.log('⚠️ No button found, trying to press Enter in email field instead...');
        await page.focus('input[type="email"]');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(3000);
        console.log('✅ Pressed Enter in email field');
        await page.screenshot({ path: '/tmp/gem-login-3-submitted.png' });
        console.log('📸 Screenshot saved: /tmp/gem-login-3-submitted.png');
      } else {
        // Click submit
        console.log('🖱️ Clicking submit button...');
        await page.click('button[type="submit"]');
        
        // Wait for submission to complete
        await page.waitForTimeout(3000);
        await page.screenshot({ path: '/tmp/gem-login-3-submitted.png' });
        console.log('📸 Screenshot saved: /tmp/gem-login-3-submitted.png');
      }
      
      console.log('✅ Login email requested successfully');
    } catch (error) {
      console.error('❌ Browser automation error:', error.message);
      console.error('Full error:', error);
      // Try to capture screenshot on error
      try {
        await page.screenshot({ path: '/tmp/gem-login-error.png' });
        console.log('📸 Error screenshot saved: /tmp/gem-login-error.png');
      } catch (screenshotError) {
        console.log('⚠️ Could not capture error screenshot');
      }
      throw new Error(`Browser automation failed: ${error.message}`);
    } finally {
      if (browser) {
        await browser.close().catch(e => console.log('⚠️  Browser already closed'));
      }
    }
    
    console.log('⏳ Waiting for magic link email (max 2 minutes)...');
    console.log('🔍 Current magic link cache status:');
    console.log('   - Has link:', !!gemMagicLinks.link);
    console.log('   - Expires at:', new Date(gemMagicLinks.expiresAt).toISOString());
    console.log('   - Is valid:', gemMagicLinks.link && Date.now() < gemMagicLinks.expiresAt);
    
    // Wait for magic link with timeout (2 minutes)
    const magicLink = await new Promise((resolve, reject) => {
      const startTime = Date.now();
      const timeout = setTimeout(() => {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        console.log(`⏰ Timeout after ${elapsed} seconds - no magic link received`);
        gemMagicLinks.pendingRequest = null;
        reject(new Error('Timeout waiting for magic link email (2 minutes)'));
      }, 120000); // 2 minutes
      
      console.log('📝 Registered pending request resolver');
      
      // Store resolver so webhook can notify us when email arrives
      gemMagicLinks.pendingRequest = {
        resolve: (link) => {
          const elapsed = Math.round((Date.now() - startTime) / 1000);
          console.log(`✅ Promise resolved after ${elapsed} seconds with magic link`);
          clearTimeout(timeout);
          resolve(link);
        },
        reject: (error) => {
          const elapsed = Math.round((Date.now() - startTime) / 1000);
          console.log(`❌ Promise rejected after ${elapsed} seconds: ${error.message}`);
          clearTimeout(timeout);
          reject(error);
        }
      };
      
      // Check if we already have a valid link in memory
      if (gemMagicLinks.link && Date.now() < gemMagicLinks.expiresAt) {
        clearTimeout(timeout);
        console.log('✅ Using existing magic link from memory (cached)');
        resolve(gemMagicLinks.link);
      } else {
        console.log('⏳ No cached link - waiting for webhook to receive email...');
      }
    });
    
    console.log('🔓 Magic link received, starting scraper...');
    
    // Clear the cached magic link since it's single-use
    gemMagicLinks.link = null;
    gemMagicLinks.expiresAt = 0;
    
    // Scrape Gem items using magic link
    const scrapeResult = await scrapeGemItems(magicLink, {
      maxItems: 5, // Limit to 5 items for initial test
      logger: console
    });
    
    if (!scrapeResult.success) {
      return res.status(500).json({ 
        success: false, 
        message: scrapeResult.error || 'Scraping failed'
      });
    }
    
    res.json({
      success: true,
      message: scrapeResult.message,
      itemsScraped: scrapeResult.itemsScraped,
      itemsSaved: scrapeResult.itemsSaved,
      items: scrapeResult.items
    });
    
  } catch (error) {
    console.error('❌ Gem sync error:', error.message);
    console.error('Error stack:', error.stack);
    
    // Provide user-friendly error messages
    let userMessage = error.message;
    if (error.message.includes('Browser automation failed')) {
      userMessage = `Browser automation failed. This could be due to Chromium not being available or the Gem login page structure changing. Error: ${error.message}`;
    } else if (error.message.includes('Timeout waiting for magic link')) {
      userMessage = 'Timeout waiting for magic link email. Please check that CloudMailin is configured correctly and emails from gem.app are being forwarded.';
    }
    
    res.status(500).json({ success: false, message: userMessage });
  }
});

// Generate featured sales assets
app.post('/admin/generate-featured-assets', async (req, res) => {
  const { auth } = req.headers;
  
  if (auth !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  try {
    const { saleIds } = req.body;
    
    if (!saleIds || !Array.isArray(saleIds) || saleIds.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Please provide an array of sale IDs' 
      });
    }
    
    console.log(`\n📸 Generating featured assets for ${saleIds.length} sales...`);
    
    const results = await generateMultipleFeaturedAssets(saleIds);
    
    const successCount = results.filter(r => r.success).length;
    
    res.json({
      success: true,
      message: `Generated ${successCount}/${saleIds.length} assets`,
      results
    });
    
  } catch (error) {
    console.error('❌ Featured assets generation error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// CloudMailin/AgentMail webhook endpoint - handle both JSON and multipart
app.post('/webhook/agentmail', upload.none(), async (req, res) => {
  console.log('📧 Received email webhook');
  
  // SECURITY: Verify webhook authenticity
  // CloudMailin recommends Basic Authentication over HTTPS
  if (CLOUDMAIL_SECRET) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      console.error('❌ Unauthorized webhook request - missing Basic Auth');
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    
    // Decode Basic Auth credentials
    const base64Credentials = authHeader.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    // Split only on first colon to support passwords containing colons
    const colonIndex = credentials.indexOf(':');
    const username = credentials.substring(0, colonIndex);
    const password = credentials.substring(colonIndex + 1);
    
    // Verify password matches CLOUDMAIL_SECRET
    // (CloudMailin sends the secret as the password)
    if (password !== CLOUDMAIL_SECRET) {
      console.error('❌ Unauthorized webhook request - invalid credentials');
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    
    console.log('✅ Webhook authenticated successfully');
  } else {
    console.warn('⚠️  CLOUDMAIL_SECRET not configured - webhook is UNPROTECTED!');
  }
  
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
    
    // Check if this is a Gem login email
    if (from.includes('gem.app') || subject.toLowerCase().includes('log in to gem')) {
      console.log('🔐 Detected Gem login email');
      console.log('📧 Email content preview:', emailContent.substring(0, 500));
      
      // Extract magic link from email content
      // Gem sends links like: https://gem.app/emailLogIn?email=...&token=...
      const magicLinkMatch = emailContent.match(/https:\/\/gem\.app\/emailLogIn\?[^\s<>"'\r\n]+/i);
      
      if (magicLinkMatch) {
        const magicLink = magicLinkMatch[0];
        console.log('✅ Extracted Gem magic link:', magicLink);
        console.log('🔍 Pending request status:', gemMagicLinks.pendingRequest ? 'WAITING' : 'NONE');
        
        // Store magic link in memory (expires in 5 minutes)
        gemMagicLinks.link = magicLink;
        gemMagicLinks.expiresAt = Date.now() + (5 * 60 * 1000);
        
        // Resolve pending request if sync endpoint is waiting
        if (gemMagicLinks.pendingRequest) {
          console.log('🔓 Resolving pending sync request with magic link');
          gemMagicLinks.pendingRequest.resolve(magicLink);
          gemMagicLinks.pendingRequest = null;
        } else {
          console.log('💾 No pending request - magic link stored in memory for 5 minutes');
        }
        
        return res.status(200).json({ 
          success: true, 
          message: 'Gem magic link received and stored'
        });
      } else {
        console.log('❌ Could not extract magic link from Gem email');
        console.log('📧 Full email content:', emailContent);
        
        // Still resolve pending request with error
        if (gemMagicLinks.pendingRequest) {
          gemMagicLinks.pendingRequest.reject(new Error('Magic link not found in email'));
          gemMagicLinks.pendingRequest = null;
        }
        
        return res.status(200).json({ 
          success: false, 
          message: 'Magic link not found in email' 
        });
      }
    }
    
    console.log('📝 Extracting sale information with AI...');
    
    // Use OpenAI to extract structured sale information from email
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a sales email parser. Extract sale information from PROMOTIONAL SALE emails and return ONLY valid JSON.

IMPORTANT: Only extract information from TIME-LIMITED PROMOTIONAL SALES. DO NOT process:
- Welcome emails (e.g., "Welcome! Get 10% off your first order")
- Account creation emails or signup bonuses
- Newsletter emails or general marketing emails
- Referral program emails
- Emails containing "welcome", "welcome to", "thanks for signing up", "verify your account"
- Ongoing/permanent new customer discounts
For these, return: {"error": "Not a promotional sale email"}

Return this exact structure for PROMOTIONAL SALES ONLY:
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
- confidence: Rate your confidence in the extraction accuracy from 1-100 (required). Use 90-100 for very clear sales emails with explicit information, 70-89 for emails with some ambiguity. Use confidence below 70 for welcome emails, signup bonuses, or uncertain extractions.
- Return ONLY the JSON object, no markdown, no explanations
- If the email is not a promotional sale, return: {"error": "Not a promotional sale email"}`
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
      console.log('ℹ️  Not a promotional sale email:', saleData.error);
      return res.status(200).json({ success: false, message: saleData.error });
    }
    
    // Validate required fields
    if (!saleData.company || !saleData.saleUrl || !saleData.percentOff) {
      console.log('❌ Missing required fields');
      return res.status(200).json({ success: false, message: 'Missing required fields' });
    }
    
    // Validate confidence threshold (reject low confidence extractions)
    const confidenceThreshold = 70;
    if (saleData.confidence && saleData.confidence < confidenceThreshold) {
      console.log(`⚠️  Low confidence (${saleData.confidence}%) - likely not a promotional sale. Rejecting.`);
      return res.status(200).json({ 
        success: false, 
        message: `Low confidence extraction (${saleData.confidence}%) - likely not a promotional sale` 
      });
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
    
    // Determine if sale should be live based on start date
    const today = new Date().toISOString().split('T')[0];
    const isLive = saleData.startDate <= today ? 'YES' : 'NO';
    
    // Build fields object, only including fields with actual values
    const fields = {
      Company: saleData.company,
      PercentOff: saleData.percentOff,
      SaleURL: saleData.saleUrl,
      CleanURL: cleanUrl !== saleData.saleUrl ? cleanUrl : saleData.saleUrl,
      StartDate: saleData.startDate,
      Confidence: saleData.confidence || 50, // AI confidence rating 1-100
      Live: isLive, // YES if starting today or earlier, NO if future date
      Description: JSON.stringify({
        source: 'email',
        originalEmail: {
          from: from,
          subject: subject,
          receivedAt: new Date().toISOString()
        }
      })
    };
    
    // Only add optional fields if they have values
    if (saleData.discountCode) {
      fields.PromoCode = saleData.discountCode;
    }
    if (saleData.endDate) {
      fields.EndDate = saleData.endDate;
    }
    
    const airtableResponse = await fetch(airtableUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_PAT}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ fields })
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

// ============================================
// AIRTABLE STORY GENERATION WEBHOOK
// ============================================

app.post('/webhook/airtable-story', async (req, res) => {
  try {
    console.log('\n📸 Airtable story generation webhook triggered');
    console.log('Request body:', req.body);
    
    const recordId = req.body?.recordId || req.body?.record_id;
    
    if (!recordId) {
      console.error('❌ No record ID provided');
      return res.status(400).json({ success: false, error: 'Record ID is required' });
    }
    
    console.log(`Processing story for record: ${recordId}`);
    
    // Fetch the specific record from Airtable
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Picks/${recordId}`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${AIRTABLE_PAT}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`Airtable API error: ${response.status}`);
    }
    
    const data = await response.json();
    const fields = data.fields;
    
    // Build pick object
    const pick = {
      id: recordId,
      name: fields.ProductName || 'Product',
      brand: fields.Brand || null,
      imageUrl: fields.ImageURL,
      productUrl: fields.ProductURL || null,
      originalPrice: fields.OriginalPrice,
      salePrice: fields.SalePrice,
      shopMyUrl: fields.ShopMyURL || '#',
      company: fields.Company || 'Unknown',
      saleName: fields.SaleName ? fields.SaleName[0] : 'Unknown Sale'
    };
    
    console.log(`📸 Generating story for: ${pick.name}`);
    
    // Import story generator functions
    const { generateStoryImage } = await import('./story-generator.js');
    const { sendStoryToTelegram } = await import('./telegram-bot.js');
    
    // Generate and send story
    const storyImage = await generateStoryImage(pick);
    const caption = `*${pick.name}*\n\nShop now: ${pick.shopMyUrl}`;
    
    await sendStoryToTelegram(TELEGRAM_CHAT_ID, storyImage.buffer, caption);
    
    // Update Airtable field to "Story Created"
    await fetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_PAT}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fields: {
          CreateStory: 'Story Created'
        }
      })
    });
    
    console.log(`✅ Story created and sent for: ${pick.name}`);
    
    res.json({ success: true, message: 'Story generated successfully' });
    
  } catch (error) {
    console.error('❌ Story generation error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// SERVE REACT BUILD IN PRODUCTION
// ============================================

// Serve static files from the React build directory
const buildPath = path.join(__dirname, '..', 'build');
app.use(express.static(buildPath));

// Handle client-side routing - serve index.html for all non-API/webhook routes
// This must be the LAST route to avoid intercepting API calls
app.use((req, res) => {
  // Only serve index.html for GET requests
  if (req.method !== 'GET') {
    return res.status(404).json({ error: 'Not found' });
  }
  
  // Don't serve index.html for /api or /webhook paths that didn't match earlier routes
  if (req.path.startsWith('/api') || req.path.startsWith('/webhook')) {
    return res.status(404).json({ error: 'Not found' });
  }
  
  // Everything else (/, /admin, etc.) is a SPA route and should get index.html
  res.sendFile(path.join(buildPath, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Webhook server running on port ${PORT}`);
  console.log(`📬 AgentMail webhook endpoint: http://0.0.0.0:${PORT}/webhook/agentmail`);
  console.log(`📦 Serving React build from: ${buildPath}`);
  
  if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
    console.log('📱 Initializing Telegram bot...');
    initializeTelegramBot(TELEGRAM_BOT_TOKEN);
    console.log('📸 Story generation via webhook: /webhook/airtable-story');
    console.log('   (Polling disabled - use Airtable Automation to trigger)');
    // Polling watcher disabled - now using webhook-based triggering from Airtable
    // startStoryWatcher();
  } else {
    console.log('⚠️  Telegram not configured - story generation disabled');
    console.log('   Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to enable');
  }
});
