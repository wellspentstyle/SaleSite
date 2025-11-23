import express from 'express';
import cors from 'cors';
import multer from 'multer';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
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

// Initialize Anthropic with API key
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
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
const COMPANY_TABLE_NAME = 'Companies';

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

// In-memory progress tracking for Gem sync (runs in background)
const gemSyncProgress = {
  isRunning: false,
  currentStep: '',
  progress: 0, // 0-100
  startedAt: null,
  result: null,
  error: null
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

// Helper function to fetch categories from brand's website using Serper and product data
async function fetchBrandCategories(officialDomain, brandName, products) {
  try {
    // Search for site navigation pages
    const searchQuery = `site:${officialDomain}`;
    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': process.env.SERPER_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        q: searchQuery,
        num: 10
      })
    });
    
    if (!response.ok) return [];
    
    const data = await response.json();
    const results = data.organic?.slice(0, 10) || [];
    
    // Combine search results with product names for category detection
    const searchText = results.map(r => `${r.title} ${r.snippet}`).join(' ').toLowerCase();
    const productText = products.map(p => p.name).join(' ').toLowerCase();
    const combinedText = `${searchText} ${productText}`;
    
    // Category keywords to look for
    const categoryKeywords = {
      'Clothing': ['clothing', 'apparel', 'ready-to-wear', 'rtw', 'dress', 'top', 'pant', 'shirt', 'jacket', 'coat'],
      'Shoes': ['shoe', 'footwear', 'sneaker', 'boot', 'heel', 'sandal'],
      'Bags': ['bag', 'handbag', 'purse', 'tote', 'clutch'],
      'Accessories': ['accessories', 'belt', 'scarf', 'hat', 'glove'],
      'Jewelry': ['jewelry', 'jewellery', 'necklace', 'earring', 'ring', 'bracelet', 'bangle'],
      'Swimwear': ['swimwear', 'swim', 'bikini', 'swimsuit'],
      'Homewares': ['home', 'homeware', 'tableware', 'decor', 'bowl', 'vase', 'plate', 'platter', 'coaster']
    };
    
    const foundCategories = new Set();
    
    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      // Check if any keyword appears in the combined text
      if (keywords.some(keyword => combinedText.includes(keyword))) {
        foundCategories.add(category);
      }
    }
    
    return Array.from(foundCategories);
  } catch (error) {
    console.error(`Error fetching categories for ${officialDomain}:`, error.message);
    return [];
  }
}

// Helper function to fetch size chart data from brand's website using Serper
async function fetchBrandSizes(officialDomain, brandName) {
  try {
    // Search for size chart/guide pages
    const searchQuery = `site:${officialDomain} size chart OR size guide women`;
    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': process.env.SERPER_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        q: searchQuery,
        num: 5
      })
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    const results = data.organic?.slice(0, 3) || [];
    
    if (results.length === 0) {
      return null;
    }
    
    // Strategy: Try to fetch full page content first, fallback to snippets
    let sizeText = '';
    let usedFullPage = false;
    
    // Try to fetch the first size chart URL's full content
    if (results[0]?.link) {
      try {
        console.log(`📄 Fetching full size chart page: ${results[0].link}`);
        const pageResponse = await fetch(results[0].link, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          timeout: 10000 // 10 second timeout
        });
        
        if (pageResponse.ok) {
          const html = await pageResponse.text();
          
          // Extract text from HTML (simple approach: remove tags and decode entities)
          const textContent = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Remove scripts
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // Remove styles
            .replace(/<[^>]+>/g, ' ') // Remove HTML tags
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim();
          
          // Look for size-related content (limit to reasonable size for AI)
          const sizeKeywords = ['size chart', 'size guide', 'sizing', 'measurements', 'fit guide'];
          const lines = textContent.split(/[.\n]/);
          const relevantLines = lines.filter(line => 
            sizeKeywords.some(keyword => line.toLowerCase().includes(keyword)) ||
            /\b(XS|S|M|L|XL|XXL|\d{1,2})\b/.test(line) // Contains size indicators
          );
          
          if (relevantLines.length > 0) {
            // Take first 100 relevant lines to avoid token limits
            sizeText = relevantLines.slice(0, 100).join('\n');
            usedFullPage = true;
            console.log(`✅ Extracted ${relevantLines.length} relevant lines from full page`);
          }
        }
      } catch (fetchError) {
        console.log(`⚠️  Failed to fetch full page, falling back to snippets: ${fetchError.message}`);
      }
    }
    
    // Fallback: Use snippets if full page fetch failed or no relevant content found
    if (!usedFullPage) {
      sizeText = results.map(r => `${r.title} ${r.snippet}`).join('\n');
      console.log(`📝 Using search result snippets for size extraction`);
    }
    
    // Use AI to extract max women's size from the text
    const sizeCompletion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `Extract the maximum women's clothing size available from the size chart information provided. Look for the highest numeric size, letter size (XS-XXL), or European size in women's/ladies' size charts.

Return ONLY the size value (e.g., "16", "L", "XL", "44"). If multiple size systems are shown, prefer US numeric sizes.

If no clear maximum women's size is found, return nothing (blank response). Do not return quotes, do not estimate or guess. Be precise - use only what's explicitly stated in the current size chart.`
        },
        {
          role: 'user',
          content: `Size information for ${brandName}:\n\n${sizeText.substring(0, 8000)}`
        }
      ],
      temperature: 0.1
    });
    
    const maxSize = sizeCompletion.choices[0]?.message?.content?.trim() || '';
    return maxSize;
    
  } catch (error) {
    console.error(`Error fetching sizes for ${officialDomain}:`, error.message);
    return null;
  }
}

// Helper function to convert S/M/L or European sizes to US numeric equivalents
function convertSizeToUS(sizeString) {
  if (!sizeString || sizeString === '""' || sizeString.trim() === '') {
    return '';
  }
  
  // Letter size mapping (S/M/L/XL)
  const letterSizeMap = {
    'S': 6,
    'M': 8,
    'L': 10,
    'XL': 14,
    'XXL': 18,
    '1X': 14,
    '2X': 18,
    '3X': 22
  };
  
  // European to US size conversion (women's)
  const euToUSMap = {
    32: 0, 34: 0, 36: 2, 38: 4, 40: 6, 
    42: 8, 44: 10, 46: 12, 48: 14, 50: 16, 
    52: 18, 54: 20
  };
  
  // Try to extract European numeric size (e.g., "44", "Up to 44", "EU 44")
  const euMatch = sizeString.match(/(\d{2})/);
  if (euMatch) {
    const euSize = parseInt(euMatch[1]);
    if (euToUSMap[euSize]) {
      return `Up to ${euToUSMap[euSize]}`;
    }
  }
  
  // Try to extract letter size (e.g., "L", "Up to L", "XL")
  const letterMatch = sizeString.match(/(XXL|XL|L|M|S|1X|2X|3X)/i);
  if (letterMatch) {
    const size = letterMatch[1].toUpperCase();
    if (letterSizeMap[size]) {
      return `Up to ${letterSizeMap[size]}`;
    }
  }
  
  // If already in US numeric format (e.g., "10", "14"), ensure "Up to" prefix
  const usMatch = sizeString.match(/^(?:Up to )?(\d{1,2})$/i);
  if (usMatch) {
    return `Up to ${usMatch[1]}`;
  }
  
  // If no match found, return empty string
  return '';
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
          shopMyUrl: record.fields.ShopMyURL || '#',
          company: record.fields.Company || [], // Company lookup for display
          companyLink: record.fields.CompanyLink || [] // Linked record IDs for relationships
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
      
      // Extract company data (use CompanyName for display, Type/PriceRange/etc are lookup fields)
      const companyName = record.fields.CompanyName || 'Unknown Brand';
      
      const priceRange = Array.isArray(record.fields.PriceRange) 
        ? record.fields.PriceRange[0] 
        : record.fields.PriceRange;
      
      const companyType = Array.isArray(record.fields.Type) 
        ? record.fields.Type[0] 
        : record.fields.Type;
      
      const maxWomensSize = Array.isArray(record.fields.MaxWomensSize) 
        ? record.fields.MaxWomensSize[0] 
        : record.fields.MaxWomensSize;
      
      // Values is likely a multi-select, keep as array
      let values = Array.isArray(record.fields.Values) 
        ? record.fields.Values 
        : (record.fields.Values ? [record.fields.Values] : []);
      
      // Normalize legacy values for backward compatibility
      values = values.map(v => {
        if (v === 'Female-founded') return 'Women-owned';
        if (v === 'BIPOC-founded') return 'BIPOC-owned';
        if (v === 'Ethical manufacturing') return null; // Remove deprecated value
        return v;
      }).filter(v => v !== null); // Remove nulls
      
      // Extract description from Company lookup field
      const description = Array.isArray(record.fields.Description) 
        ? record.fields.Description[0] 
        : record.fields.Description;
      
      return {
        id: record.id,
        brandName: companyName,
        brandLogo: companyName,
        discount: `${record.fields.PercentOff || 0}% Off`,
        discountCode: record.fields.PromoCode || record.fields.DiscountCode || undefined,
        startDate: record.fields.StartDate,
        endDate: record.fields.EndDate,
        saleUrl: saleUrl,
        featured: record.fields.Featured === 'YES',
        imageUrl: record.fields.Image && record.fields.Image.length > 0 ? record.fields.Image[0].url : undefined,
        createdTime: record.createdTime,
        picks: picksBySale.get(record.id) || [],
        // Company metadata for filtering
        priceRange: priceRange,
        companyType: companyType,
        maxWomensSize: maxWomensSize,
        values: values,
        description: description
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

// Get all companies/brands (no auth required - for public brands directory)
app.get('/companies', async (req, res) => {
  try {
    // Fetch ALL companies from Airtable with pagination
    const companyRecords = await fetchAllAirtableRecords(COMPANY_TABLE_NAME, {
      pageSize: '100'
    });
    
    console.log(`📦 Fetched ${companyRecords.length} companies from Airtable`);
    
    // Map companies to frontend format
    const companies = companyRecords.map(record => {
      // Values is likely a multi-select, keep as array
      let values = Array.isArray(record.fields.Values) 
        ? record.fields.Values 
        : (record.fields.Values ? [record.fields.Values] : []);
      
      // Normalize legacy values for backward compatibility
      values = values.map(v => {
        if (v === 'Female-founded') return 'Women-owned';
        if (v === 'BIPOC-founded') return 'BIPOC-owned';
        if (v === 'Ethical manufacturing') return null; // Remove deprecated value
        return v;
      }).filter(v => v !== null); // Remove nulls
      
      return {
        id: record.id,
        name: record.fields.Name || '',
        type: record.fields.Type || '',
        priceRange: record.fields.PriceRange || '',
        category: record.fields.Category || '',
        maxWomensSize: record.fields.MaxWomensSize || '',
        values: values,
        description: record.fields.Description || '',
        url: record.fields.URL || '', // Keep for backward compatibility
        shopmyUrl: record.fields.ShopmyURL || '' // Primary affiliate link
      };
    });
    
    res.json({ success: true, companies });
  } catch (error) {
    console.error('❌ Error fetching companies:', error);
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

// Check URL protection level
app.post('/admin/check-url-protection', (req, res) => {
  const { auth } = req.headers;
  const { url } = req.body;
  
  if (auth !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  if (!url) {
    return res.status(400).json({ success: false, message: 'URL is required' });
  }
  
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    
    // Department store protection levels based on testing
    const protectionLevels = {
      // Ultra-high protection (5-10% success rate)
      'nordstrom.com': { 
        level: 'ultra-high', 
        store: 'Nordstrom', 
        successRate: '5-10%',
        recommendation: 'We recommend manual entry for faster, more reliable results.'
      },
      'saksfifthavenue.com': { 
        level: 'ultra-high', 
        store: 'Saks Fifth Avenue', 
        successRate: '5-10%',
        recommendation: 'We recommend manual entry for faster, more reliable results.'
      },
      'neimanmarcus.com': { 
        level: 'ultra-high', 
        store: 'Neiman Marcus', 
        successRate: '5-10%',
        recommendation: 'We recommend manual entry for faster, more reliable results.'
      },
      'bergdorfgoodman.com': { 
        level: 'ultra-high', 
        store: 'Bergdorf Goodman', 
        successRate: '5-10%',
        recommendation: 'We recommend manual entry for faster, more reliable results.'
      },
      'bloomingdales.com': { 
        level: 'ultra-high', 
        store: 'Bloomingdales', 
        successRate: '5-10%',
        recommendation: 'We recommend manual entry for faster, more reliable results.'
      },
      
      // Medium protection (50-60% success rate)
      'farfetch.com': { 
        level: 'medium', 
        store: 'Farfetch', 
        successRate: '50-60%',
        recommendation: 'Automated scraping usually works, but data quality may vary.'
      },
      
      // Low protection (85%+ success rate)
      'shopbop.com': { 
        level: 'low', 
        store: 'Shopbop', 
        successRate: '85%+',
        recommendation: 'Automated scraping works reliably.'
      },
      'ssense.com': { 
        level: 'low', 
        store: 'SSENSE', 
        successRate: '85%+',
        recommendation: 'Automated scraping works reliably.'
      }
    };
    
    // Check if URL matches any protected store
    const protectedStore = Object.keys(protectionLevels).find(domain => 
      hostname.includes(domain)
    );
    
    if (protectedStore) {
      const storeInfo = protectionLevels[protectedStore];
      return res.json({
        success: true,
        protected: true,
        store: storeInfo
      });
    }
    
    // Not a known protected store
    return res.json({
      success: true,
      protected: false,
      store: null
    });
    
  } catch (error) {
    console.error('❌ Error checking URL protection:', error);
    return res.status(400).json({ success: false, message: 'Invalid URL' });
  }
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
    
    // Fetch ALL picks to count them per sale
    const picksRecords = await fetchAllAirtableRecords('Picks', {
      pageSize: '100'
    });
    
    // Count picks per sale
    const picksCountBySale = new Map();
    picksRecords.forEach(record => {
      const saleIds = record.fields.SaleID || [];
      saleIds.forEach(saleId => {
        picksCountBySale.set(saleId, (picksCountBySale.get(saleId) || 0) + 1);
      });
    });
    
    const sales = salesRecords.map(record => ({
      id: record.id,
      saleName: record.fields.SaleName || record.fields.Company || 'Unnamed Sale',
      company: record.fields.Company,
      percentOff: record.fields.PercentOff,
      startDate: record.fields.StartDate,
      endDate: record.fields.EndDate,
      live: record.fields.Live,
      saleUrl: record.fields.SaleURL || record.fields.CleanURL,
      picksCount: picksCountBySale.get(record.id) || 0
    }));
    
    res.json({ success: true, sales });
  } catch (error) {
    console.error('Error fetching sales:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update a sale (PATCH)
app.patch('/admin/sales/:saleId', async (req, res) => {
  const { auth } = req.headers;
  const { saleId } = req.params;
  const { percentOff } = req.body;
  
  if (auth !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  if (!percentOff || isNaN(percentOff)) {
    return res.status(400).json({ success: false, message: 'Valid percentOff is required' });
  }
  
  try {
    const response = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE_NAME}/${saleId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_PAT}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fields: {
          PercentOff: parseInt(percentOff)
        }
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      console.error('❌ Airtable PATCH error:', error);
      return res.status(500).json({ success: false, message: 'Failed to update sale in Airtable' });
    }
    
    const data = await response.json();
    console.log(`✅ Updated sale ${saleId} with ${percentOff}% off`);
    
    res.json({ success: true, sale: data });
  } catch (error) {
    console.error('Error updating sale:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update or create a brand in Airtable Companies table
app.post('/admin/update-brand-in-airtable', async (req, res) => {
  const { auth } = req.headers;
  const { brandData } = req.body;
  
  if (auth !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  if (!brandData || !brandData.name) {
    return res.status(400).json({ success: false, message: 'Brand data with name is required' });
  }
  
  try {
    console.log(`🔍 Looking up brand "${brandData.name}" in Airtable...`);
    
    // Search for existing brand by name
    const searchUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${COMPANY_TABLE_NAME}`;
    // Properly escape Airtable formula - single quotes in names must be doubled
    const escapedName = brandData.name.replace(/'/g, "''");
    const searchParams = new URLSearchParams({
      filterByFormula: `{Name} = '${escapedName}'`,
      maxRecords: '1'
    });
    
    const searchResponse = await fetch(`${searchUrl}?${searchParams}`, {
      headers: {
        'Authorization': `Bearer ${AIRTABLE_PAT}`
      }
    });
    
    if (!searchResponse.ok) {
      const error = await searchResponse.json();
      console.error('❌ Airtable search error:', error);
      return res.status(500).json({ success: false, message: 'Failed to search Airtable' });
    }
    
    const searchData = await searchResponse.json();
    const existingRecord = searchData.records && searchData.records.length > 0 ? searchData.records[0] : null;
    
    // Prepare fields for Airtable
    // Category and Values may already be arrays from frontend
    const categoryArray = Array.isArray(brandData.category)
      ? brandData.category
      : (brandData.category ? brandData.category.split(',').map(c => c.trim()) : []);
    
    const valuesArray = Array.isArray(brandData.values)
      ? brandData.values
      : (brandData.values ? brandData.values.split(',').map(v => v.trim()).filter(v => v) : []);
    
    const fields = {
      Name: brandData.name,
      Type: brandData.type || 'Brand',
      PriceRange: brandData.priceRange || '',
      Category: categoryArray,
      MaxWomensSize: brandData.maxWomensSize || '',
      Values: valuesArray,
      Description: brandData.description || '',
      URL: brandData.url || ''
    };
    
    let result;
    
    if (existingRecord) {
      // Update existing record
      console.log(`✏️ Updating existing brand record ${existingRecord.id}...`);
      
      const updateResponse = await fetch(`${searchUrl}/${existingRecord.id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${AIRTABLE_PAT}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fields })
      });
      
      if (!updateResponse.ok) {
        const error = await updateResponse.json();
        console.error('❌ Airtable update error:', error);
        return res.status(500).json({ success: false, message: 'Failed to update brand in Airtable' });
      }
      
      result = await updateResponse.json();
      console.log(`✅ Updated brand "${brandData.name}" in Airtable`);
      
      res.json({ success: true, action: 'updated', record: result });
    } else {
      // Create new record
      console.log(`➕ Creating new brand record...`);
      
      const createResponse = await fetch(searchUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${AIRTABLE_PAT}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fields })
      });
      
      if (!createResponse.ok) {
        const error = await createResponse.json();
        console.error('❌ Airtable create error:', error);
        return res.status(500).json({ success: false, message: 'Failed to create brand in Airtable' });
      }
      
      result = await createResponse.json();
      console.log(`✅ Created new brand "${brandData.name}" in Airtable`);
      
      res.json({ success: true, action: 'created', record: result });
    }
  } catch (error) {
    console.error('❌ Error updating brand in Airtable:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Improved brand research endpoint - uses Serper web search + AI with strict validation
app.post('/admin/brand-research', async (req, res) => {
  const { auth } = req.headers;
  const { brandName } = req.body;
  
  if (auth !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  if (!brandName || typeof brandName !== 'string') {
    return res.status(400).json({ success: false, error: 'Brand name is required' });
  }
  
  try {
    console.log(`🔍 Researching brand: ${brandName}`);
    
    // ============================================
    // PHASE 1: FIND OFFICIAL DOMAIN
    // ============================================
    console.log(`🌐 Phase 1: Finding official domain...`);
    
    const domainSearchQuery = `${brandName} official website`;
    const domainResponse = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': process.env.SERPER_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        q: domainSearchQuery,
        num: 10
      })
    });
    
    if (!domainResponse.ok) {
      const errorText = await domainResponse.text();
      console.error(`❌ Serper API error (${domainResponse.status}):`, errorText);
      return res.json({
        success: false,
        error: domainResponse.status === 401 
          ? 'Search API authentication failed - check API key'
          : domainResponse.status === 429
          ? 'Search API rate limit exceeded - try again later'
          : `Search API error: ${domainResponse.status}`
      });
    }
    
    const domainSearchData = await domainResponse.json();
    console.log(`📦 Domain search returned ${domainSearchData.organic?.length || 0} results`);
    
    if (!domainSearchData.organic || domainSearchData.organic.length === 0) {
      return res.json({
        success: false,
        error: 'No search results found for this brand'
      });
    }
    
    // Expanded resale/marketplace domains to block
    const resaleDomains = [
      'therealreal.com', 'vestiairecollective.com', 'poshmark.com', 'ebay.com',
      'tradesy.com', 'etsy.com', 'depop.com', 'grailed.com', 'mercari.com',
      'vinted.com', 'thredup.com', 'rebag.com', 'fashionphile.com',
      'yoox.com', 'farfetch.com', 'ssense.com', 'net-a-porter.com',
      'mrporter.com', 'nordstrom.com', 'saksfifthavenue.com', 'bergdorfgoodman.com',
      'neimanmarcus.com', 'bloomingdales.com', 'shopbop.com', 'revolve.com',
      'fwrd.com', 'matchesfashion.com', 'mytheresa.com', 'selfridges.com',
      'harrods.com', 'davidjones.com', 'lyst.com', 'lovethesales.com',
      'shopstyle.com', 'modesens.com', 'intermixonline.com', 'amazon.com',
      'walmart.com', 'target.com', 'shopual.com'
    ];
    
    // Find official brand domain
    const brandNameLower = brandName.toLowerCase().replace(/[^a-z0-9]/g, '');
    let officialDomain = null;
    
    for (const result of domainSearchData.organic.slice(0, 10)) {
      if (!result.link) continue;
      
      const hostname = new URL(result.link).hostname.replace('www.', '').toLowerCase();
      
      // Skip resale/marketplace domains
      if (resaleDomains.some(resale => hostname.includes(resale))) {
        continue;
      }
      
      // Check if domain contains brand name
      const domainParts = hostname.split('.')[0].replace(/[-_]/g, '');
      if (domainParts.includes(brandNameLower) || brandNameLower.includes(domainParts)) {
        officialDomain = hostname;
        break;
      }
    }
    
    if (!officialDomain) {
      console.warn(`⚠️  Could not identify official domain for ${brandName}`);
      return res.json({
        success: false,
        error: 'Could not identify official brand website'
      });
    }
    
    console.log(`🏢 Official domain: ${officialDomain}`);
    
    // ============================================
    // PHASE 2: SEARCH FOR PRODUCTS WITH PRICES
    // ============================================
    console.log(`🌐 Phase 2: Searching for products with prices...`);
    
    // Search specifically on the official domain for products
    const productSearchQuery = `site:${officialDomain} price $ shop`;
    const productResponse = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': process.env.SERPER_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        q: productSearchQuery,
        num: 12
      })
    });
    
    if (!productResponse.ok) {
      console.warn(`⚠️  Product search failed, falling back to general search`);
    }
    
    const productSearchData = productResponse.ok ? await productResponse.json() : {};
    const productResults = productSearchData.organic?.slice(0, 10) || [];
    
    console.log(`📦 Product search returned ${productResults.length} results`);
    
    // ============================================
    // PHASE 3: AI EXTRACTION WITH STRICT VALIDATION
    // ============================================
    console.log(`🤖 Phase 3: Extracting product data with AI...`);
    
    const searchResults = productResults.map(r => ({
      title: r.title,
      snippet: r.snippet,
      link: r.link
    }));
    
    const extractionCompletion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You extract product information from search results. Be EXTREMELY strict about prices.

CRITICAL RULES FOR PRICES:
- ONLY extract prices you can LITERALLY see in the title or snippet
- Valid examples: "$450", "Price: $200", "$89.99", "Was $400 Now $200"
- NEVER extract if you see: "view price", "see price", "from $X", just a product name
- If you see "Was $400 Now $200" - use $400 (the ORIGINAL price)
- NEVER guess or estimate prices based on product type
- If fewer than 3 products have clearly visible prices, return empty products array

Return ONLY valid JSON:
{
  "products": [
    {"name": "Product Name", "price": 450, "url": "https://..."}
  ],
  "isShop": false
}

Requirements:
- Extract 3-5 products maximum
- URLs must be from ${officialDomain}
- Price must be numeric (e.g., 450 not "$450")
- ALWAYS use ORIGINAL/REGULAR price if both sale and original shown
- If no clear prices visible, return empty products array`
        },
        {
          role: 'user',
          content: `Extract products with VISIBLE prices from "${brandName}":\n\n${JSON.stringify(searchResults, null, 2)}`
        }
      ],
      temperature: 0.1
    });
    
    const extractionResponse = extractionCompletion.choices[0]?.message?.content;
    
    if (!extractionResponse) {
      throw new Error('No response from product extraction');
    }
    
    console.log(`📦 Extraction response: ${extractionResponse.substring(0, 200)}...`);
    
    // Parse product data
    let productData;
    try {
      const jsonMatch = extractionResponse.match(/\{[\s\S]*\}/);
      productData = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(extractionResponse);
    } catch (parseError) {
      console.error('Failed to parse product data:', parseError);
      return res.json({
        success: false,
        error: 'Could not extract product information from search results'
      });
    }
    
    let products = productData.products || [];
    const isShop = productData.isShop || false;
    
    // ============================================
    // PHASE 4: VALIDATE EXTRACTED PRODUCTS
    // ============================================
    console.log(`✅ Phase 4: Validating ${products.length} products...`);
    
    const validatedProducts = [];
    for (const product of products) {
      // Price sanity check (fashion items typically $10 - $10,000)
      if (product.price < 10 || product.price > 10000) {
        console.log(`⚠️  Suspicious price for "${product.name}": $${product.price} - skipping`);
        continue;
      }
      
      // URL validation - must be from official domain
      try {
        const urlObj = new URL(product.url);
        const urlDomain = urlObj.hostname.replace('www.', '');
        if (urlDomain === officialDomain) {
          validatedProducts.push(product);
          console.log(`✅ Valid: "${product.name}" - $${product.price}`);
        } else {
          console.log(`⚠️  Wrong domain for "${product.name}": ${urlDomain}`);
        }
      } catch (e) {
        console.log(`⚠️  Invalid URL: ${product.url}`);
      }
    }
    
    products = validatedProducts;
    
    // Flag for partial data
    const partialData = products.length === 0;
    
    if (partialData) {
      console.log(`⚠️  No valid products with prices found`);
    } else {
      console.log(`✅ Validated ${products.length} products`);
    }
    
    // ============================================
    // PHASE 5: CALCULATE PRICE TIER
    // ============================================
    let priceRange = '';
    let medianPrice = 0;
    
    if (products.length > 0) {
      const prices = products.map(p => p.price).sort((a, b) => a - b);
      medianPrice = prices.length % 2 === 0 
        ? (prices[prices.length/2 - 1] + prices[prices.length/2]) / 2 
        : prices[Math.floor(prices.length/2)];
      
      if (medianPrice < 250) priceRange = '$';
      else if (medianPrice < 500) priceRange = '$$';
      else if (medianPrice < 1100) priceRange = '$$$';
      else priceRange = '$$$$';
      
      console.log(`💰 Median price: $${Math.round(medianPrice)} → ${priceRange}`);
    }
    
    // ============================================
    // PHASE 6: DETERMINE CATEGORIES WITH AI
    // ============================================
    console.log(`🤖 Phase 6: Determining product categories...`);
    
    let categories = [];
    if (products.length > 0) {
      const categoryCompletion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `Analyze product names and determine which categories apply.

Return ONLY categories from this exact list:
- Clothing
- Shoes
- Bags
- Accessories
- Jewelry
- Swimwear
- Homewares

Rules:
- Return as comma-separated list (e.g., "Clothing, Shoes, Bags")
- Only include categories with clear evidence
- If products don't clearly fit any category, return empty string
- Be selective - don't guess`
          },
          {
            role: 'user',
            content: `Brand: ${brandName}\nProducts: ${products.map(p => p.name).join(', ')}`
          }
        ],
        temperature: 0.1
      });
      
      const categoryResponse = categoryCompletion.choices[0]?.message?.content?.trim() || '';
      categories = categoryResponse.split(',').map(c => c.trim()).filter(c => c);
      console.log(`✅ Categories: ${categories.join(', ') || 'none'}`);
    }
    
    const finalCategory = categories.join(', ');
    
    // ============================================
    // PHASE 7: FETCH SIZE INFORMATION
    // ============================================
    console.log(`🌐 Phase 7: Fetching size information...`);
    
    let finalMaxSize = '';
    const sellsClothing = categories.includes('Clothing') || categories.includes('Swimwear');
    
    if (sellsClothing) {
      try {
        const sizeSearchQuery = `site:${officialDomain} size chart OR size guide women`;
        const sizeResponse = await fetch('https://google.serper.dev/search', {
          method: 'POST',
          headers: {
            'X-API-KEY': process.env.SERPER_API_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            q: sizeSearchQuery,
            num: 5
          })
        });
        
        if (sizeResponse.ok) {
          const sizeData = await sizeResponse.json();
          const sizeResults = sizeData.organic?.slice(0, 3) || [];
          
          if (sizeResults.length > 0) {
            // Try to fetch full page content with better timeout
            let sizeText = '';
            
            try {
              console.log(`📄 Fetching size chart: ${sizeResults[0].link}`);
              
              const controller = new AbortController();
              const timeout = setTimeout(() => controller.abort(), 15000);
              
              const pageResponse = await fetch(sizeResults[0].link, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                signal: controller.signal
              });
              
              clearTimeout(timeout);
              
              if (pageResponse.ok) {
                const html = await pageResponse.text();
                
                // Extract text content
                const textContent = html
                  .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                  .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                  .replace(/<[^>]+>/g, ' ')
                  .replace(/&nbsp;/g, ' ')
                  .replace(/&amp;/g, '&')
                  .replace(/\s+/g, ' ')
                  .trim();
                
                // Find size-related content
                const sizeKeywords = ['size chart', 'size guide', 'sizing', 'measurements'];
                const lines = textContent.split(/[.\n]/);
                const relevantLines = lines.filter(line => 
                  sizeKeywords.some(kw => line.toLowerCase().includes(kw)) ||
                  /\b(XS|S|M|L|XL|XXL|\d{1,2})\b/.test(line)
                );
                
                if (relevantLines.length > 0) {
                  sizeText = relevantLines.slice(0, 100).join('\n');
                  console.log(`✅ Extracted ${relevantLines.length} relevant lines`);
                }
              }
            } catch (fetchError) {
              console.log(`⚠️  Page fetch failed: ${fetchError.message}`);
              // Fallback to snippets
              sizeText = sizeResults.map(r => `${r.title} ${r.snippet}`).join('\n');
            }
            
            if (sizeText) {
              // Use AI to extract max size with improved prompt
              const sizeCompletion = await openai.chat.completions.create({
                model: 'gpt-4o',
                messages: [
                  {
                    role: 'system',
                    content: `Find the LARGEST women's size available in this size chart.

Look for:
- Numeric sizes: 0, 2, 4... 16, 18, 20, 22, 24, 26, 28
- Letter sizes: XS, S, M, L, XL, XXL, XXXL, 4XL, 5XL
- Plus sizes: 1X, 2X, 3X, 4X, 5X
- European: 32-54

Examples:
- "Sizes 0-16" → return "16"
- "XS to XL available" → return "XL"
- "Regular (0-14) Plus (16-24)" → return "24"
- "Up to 3X" → return "3X"

Return ONLY the maximum size. No explanations. Blank if not found.`
                  },
                  {
                    role: 'user',
                    content: `${brandName} size information:\n\n${sizeText.substring(0, 8000)}`
                  }
                ],
                temperature: 0.1
              });
              
              const maxSize = sizeCompletion.choices[0]?.message?.content?.trim() || '';
              if (maxSize) {
                finalMaxSize = convertSizeToUS(maxSize);
                console.log(`✅ Max size: ${finalMaxSize}`);
              }
            }
          }
        }
      } catch (error) {
        console.error(`❌ Size fetch error: ${error.message}`);
      }
    } else {
      console.log(`⏭️  Skipping size fetch (no clothing detected)`);
    }
    
    // ============================================
    // PHASE 8: OWNERSHIP & VALUES RESEARCH
    // ============================================
    console.log(`🌐 Phase 8: Researching ownership and values...`);
    
    // Ownership check
    const ownershipQuery = `${brandName} owned by parent company conglomerate`;
    const ownershipResponse = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': process.env.SERPER_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ q: ownershipQuery, num: 6 })
    });
    
    const ownershipData = ownershipResponse.ok ? await ownershipResponse.json() : {};
    const ownershipResults = ownershipData.organic?.slice(0, 5) || [];
    
    // Sustainability check
    const sustainabilityQuery = `${brandName} sustainable B Corp Fair Trade GOTS certified`;
    const sustainabilityResponse = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': process.env.SERPER_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ q: sustainabilityQuery, num: 6 })
    });
    
    const sustainabilityData = sustainabilityResponse.ok ? await sustainabilityResponse.json() : {};
    const sustainabilityResults = sustainabilityData.organic?.slice(0, 5) || [];
    
    // Diversity check
    const diversityQuery = `${brandName} women-owned female-founded BIPOC-owned founder`;
    const diversityResponse = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': process.env.SERPER_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ q: diversityQuery, num: 6 })
    });
    
    const diversityData = diversityResponse.ok ? await diversityResponse.json() : {};
    const diversityResults = diversityData.organic?.slice(0, 5) || [];
    
    // AI analysis of values
    console.log(`🤖 Phase 9: Analyzing values with AI...`);
    
    const valuesCompletion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `Analyze brand values from search results. Be VERY selective and conservative.

VALUES (select only with clear evidence):
- "Independent label" - Include ONLY if ownership results show NO parent company (LVMH, Kering, Richemont, H&M Group, VF Corp, PVH, Tapestry, Capri Holdings, etc.)
- "Sustainable" - Include ONLY if you see MULTIPLE mentions of: certifications (B Corp, Fair Trade, GOTS), organic/recycled materials, transparent supply chain. NOT just vague marketing.
- "Women-owned" - Include ONLY if you see explicit mention of female founder name/pronouns or "women-owned" label
- "BIPOC-owned" - Include ONLY if explicitly stated as "BIPOC-owned", "Black-owned", or you see BIPOC founder names with confirmation
- "Secondhand" - Include ONLY if it's a resale/vintage platform

Return ONLY valid JSON:
{
  "values": "Independent label, Sustainable"
}

CRITICAL: If a brand is owned by a conglomerate, it CANNOT be "Women-owned" or "BIPOC-owned". Be strict.`
        },
        {
          role: 'user',
          content: `Brand: ${brandName}

OWNERSHIP RESULTS:
${JSON.stringify(ownershipResults, null, 2)}

SUSTAINABILITY RESULTS:
${JSON.stringify(sustainabilityResults, null, 2)}

DIVERSITY RESULTS:
${JSON.stringify(diversityResults, null, 2)}`
        }
      ],
      temperature: 0.1
    });
    
    const valuesResponse = valuesCompletion.choices[0]?.message?.content;
    
    let valuesData = { values: '' };
    try {
      const jsonMatch = valuesResponse.match(/\{[\s\S]*\}/);
      valuesData = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(valuesResponse);
    } catch (parseError) {
      console.error('Failed to parse values:', parseError);
    }
    
    console.log(`✅ Values: ${valuesData.values || 'none'}`);
    
    // ============================================
    // PHASE 10: GENERATE BRAND DESCRIPTION
    // ============================================
    console.log(`🤖 Phase 10: Generating brand description...`);
    
    let brandDescription = '';
    try {
      const descriptionResponse = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 180,
        messages: [{
          role: 'user',
          content: `Write a concise 1-2 sentence brand description for ${brandName} (~60 words). The audience is a smart shopper who knows similar brands. The description should: (1) position the brand relative to others they'd know, (2) describe design philosophy in specific terms (fabrics, cuts, details), not vague words like "elevated" or "timeless".

Context:
- Type: ${isShop ? 'Shop' : 'Brand'}
- Categories: ${finalCategory || 'Not specified'}
- Price Range: ${priceRange || 'Not available'}
- Values: ${valuesData.values || 'None'}
- Products: ${products.length > 0 ? products.slice(0, 5).map(p => p.name).join(', ') : 'Not available'}

Write ONLY the description, no preamble.`
        }]
      });
      
      brandDescription = descriptionResponse.content[0]?.text?.trim() || '';
      console.log(`✅ Generated description`);
    } catch (error) {
      console.error(`❌ Description generation failed: ${error.message}`);
    }
    
    // ============================================
    // FINAL RESPONSE
    // ============================================
    const brandUrl = `https://${officialDomain}`;
    
    console.log(`✅ Research complete for ${brandName}`);
    
    res.json({
      success: true,
      partialData: partialData,
      brand: {
        type: 'Brand',
        priceRange: priceRange,
        category: finalCategory,
        values: valuesData.values || '',
        maxWomensSize: finalMaxSize,
        description: brandDescription,
        url: brandUrl,
        evidence: {
          products: products.slice(0, 5).map(p => ({
            name: p.name,
            price: p.price,
            url: p.url
          })),
          medianPrice: products.length > 0 ? Math.round(medianPrice) : null,
          productsFound: products.length,
          officialDomain: officialDomain
        }
      }
    });
    
  } catch (error) {
    console.error(`❌ Error researching brand ${brandName}:`, error);
    res.json({
      success: false,
      error: error.message || 'Failed to research brand'
    });
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
    
    // Fetch the sale record to get its Company field
    const saleUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE_NAME}/${saleId}`;
    const saleResponse = await fetch(saleUrl, {
      headers: {
        'Authorization': `Bearer ${AIRTABLE_PAT}`,
      },
    });
    
    if (!saleResponse.ok) {
      throw new Error('Failed to fetch sale record');
    }
    
    const saleData = await saleResponse.json();
    const companyIds = saleData.fields.Company || [];
    
    console.log(`📦 Sale company: ${companyIds.length > 0 ? companyIds[0] : 'None'}`);
    
    // Create records for each pick
    // Note: ShopMyURL and PercentOff are computed fields in Airtable, don't send them
    const records = picks.map(pick => {
      const fields = {
        ProductURL: cleanUrl(pick.url), // Clean URL to remove tracking parameters
        ProductName: pick.name,
        ImageURL: pick.imageUrl,
        SaleID: [saleId] // Link to Sales table
      };
      
      // Link to Company if available from the sale
      if (companyIds.length > 0) {
        fields.CompanyLink = companyIds; // Link to Companies table
      }
      
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

// Background function for Gem sync that updates progress
async function runGemSyncInBackground() {
  let browser;
  try {
    // Reset progress
    gemSyncProgress.isRunning = true;
    gemSyncProgress.currentStep = 'Launching browser...';
    gemSyncProgress.progress = 10;
    gemSyncProgress.startedAt = new Date().toISOString();
    gemSyncProgress.result = null;
    gemSyncProgress.error = null;
    
    console.log('💎 Starting Gem sync process in background...');
    
    // Use Playwright to trigger login email (gem.app blocks direct API calls)
    const { chromium } = await import('playwright');
    
    // Try to find Chromium executable
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
    
    gemSyncProgress.currentStep = 'Requesting magic link email...';
    gemSyncProgress.progress = 20;
    
    console.log('🚀 Launching browser...');
    browser = await chromium.launch(launchOptions);
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    });
    const page = await context.newPage();
    
    try {
      // Navigate to login page
      console.log('🌐 Navigating to gem.app/requestEmailLogIn...');
      await page.goto('https://gem.app/requestEmailLogIn', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.screenshot({ path: '/tmp/gem-login-1-loaded.png' });
      
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {
        console.log('⚠️ Network not idle, continuing anyway...');
      });
      
      const title = await page.title();
      const url = page.url();
      console.log(`📄 Page loaded: "${title}" at ${url}`);
      
      // Find email input
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
        throw new Error('Could not find email input field');
      }
      
      // Fill in email
      console.log('✏️ Filling email field...');
      await page.fill('input[type="email"]', GEM_EMAIL);
      await page.screenshot({ path: '/tmp/gem-login-2-filled.png' });
      
      // Submit form
      console.log('⚠️ Trying to press Enter in email field...');
      await page.focus('input[type="email"]');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(3000);
      console.log('✅ Pressed Enter in email field');
      await page.screenshot({ path: '/tmp/gem-login-3-submitted.png' });
      
      console.log('✅ Login email requested successfully');
    } catch (error) {
      console.error('❌ Browser automation error:', error.message);
      try {
        await page.screenshot({ path: '/tmp/gem-login-error.png' });
      } catch (e) {
        console.log('⚠️ Could not capture error screenshot');
      }
      throw new Error(`Browser automation failed: ${error.message}`);
    } finally {
      if (browser) {
        await browser.close().catch(e => console.log('⚠️  Browser already closed'));
      }
    }
    
    gemSyncProgress.currentStep = 'Waiting for magic link email...';
    gemSyncProgress.progress = 40;
    console.log('⏳ Waiting for magic link email (max 2 minutes)...');
    
    // Wait for magic link
    const magicLink = await new Promise((resolve, reject) => {
      const startTime = Date.now();
      const timeout = setTimeout(() => {
        gemMagicLinks.pendingRequest = null;
        reject(new Error('Timeout waiting for magic link email (2 minutes)'));
      }, 120000);
      
      gemMagicLinks.pendingRequest = {
        resolve: (link) => {
          clearTimeout(timeout);
          resolve(link);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      };
      
      if (gemMagicLinks.link && Date.now() < gemMagicLinks.expiresAt) {
        clearTimeout(timeout);
        console.log('✅ Using cached magic link');
        resolve(gemMagicLinks.link);
      } else {
        console.log('⏳ Waiting for webhook to receive email...');
      }
    });
    
    gemSyncProgress.currentStep = 'Magic link received, scraping items...';
    gemSyncProgress.progress = 60;
    console.log('🔓 Magic link received, starting scraper...');
    
    // Clear cached link
    gemMagicLinks.link = null;
    gemMagicLinks.expiresAt = 0;
    
    // Scrape items
    const scrapeResult = await scrapeGemItems(magicLink, {
      maxItems: 5,
      logger: console
    });
    
    gemSyncProgress.progress = 90;
    
    if (!scrapeResult.success) {
      throw new Error(scrapeResult.error || 'Scraping failed');
    }
    
    gemSyncProgress.currentStep = 'Sync completed successfully!';
    gemSyncProgress.progress = 100;
    gemSyncProgress.result = {
      success: true,
      message: scrapeResult.message,
      itemsScraped: scrapeResult.itemsScraped,
      itemsSaved: scrapeResult.itemsSaved,
      items: scrapeResult.items
    };
    gemSyncProgress.isRunning = false;
    
    console.log('✅ Gem sync completed successfully in background');
    
  } catch (error) {
    console.error('❌ Gem sync error:', error.message);
    
    let userMessage = error.message;
    if (error.message.includes('Browser automation failed')) {
      userMessage = `Browser automation failed. This could be due to Chromium not being available or the Gem login page structure changing.`;
    } else if (error.message.includes('Timeout waiting for magic link')) {
      userMessage = 'Timeout waiting for magic link email. Please check that CloudMailin is configured correctly.';
    }
    
    gemSyncProgress.currentStep = 'Sync failed';
    gemSyncProgress.progress = 0;
    gemSyncProgress.error = userMessage;
    gemSyncProgress.isRunning = false;
  }
}

// Sync Gem items - trigger in background
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
  
  // Check if already running
  if (gemSyncProgress.isRunning) {
    return res.json({
      success: false,
      message: 'Gem sync is already running. Please wait for it to complete.',
      isRunning: true
    });
  }
  
  // Start background process (don't await it)
  runGemSyncInBackground();
  
  // Return immediately
  res.json({
    success: true,
    message: 'Gem sync started in background',
    isRunning: true
  });
});

// Get Gem sync status
app.get('/admin/gem-sync-status', (req, res) => {
  const { auth } = req.headers;
  
  if (auth !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  res.json({
    isRunning: gemSyncProgress.isRunning,
    currentStep: gemSyncProgress.currentStep,
    progress: gemSyncProgress.progress,
    startedAt: gemSyncProgress.startedAt,
    result: gemSyncProgress.result,
    error: gemSyncProgress.error
  });
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

// ========== FRESHNESS TRACKING ENDPOINTS ==========

// Get all picks with freshness data for admin panel
app.get('/admin/picks', async (req, res) => {
  const { auth } = req.headers;
  
  if (auth !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  try {
    // Fetch all picks from Airtable with freshness fields
    const allRecords = [];
    let offset = undefined;
    
    const fields = [
      'ProductURL', 'ProductName', 'ImageURL', 'OriginalPrice', 'SalePrice', 'PercentOff', 
      'SaleID', 'Company', 'CompanyLink', 'ShopMyURL', 'AvailabilityStatus', 'LastValidatedAt', 
      'NextCheckDue', 'HiddenUntilFresh'
    ];
    
    do {
      const params = new URLSearchParams({
        fields: fields.join(','),
        pageSize: '100'
      });
      
      if (offset) {
        params.set('offset', offset);
      }
      
      const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${PICKS_TABLE_NAME}?${params}`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${AIRTABLE_PAT}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Airtable API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      allRecords.push(...data.records);
      offset = data.offset;
    } while (offset);
    
    // Also fetch sales to get active sales list
    const salesUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE_NAME}?fields[]=Company&fields[]=Live&fields[]=StartDate&fields[]=EndDate`;
    const salesResponse = await fetch(salesUrl, {
      headers: {
        'Authorization': `Bearer ${AIRTABLE_PAT}`,
      },
    });
    
    const salesData = await salesResponse.json();
    const activeSaleIds = new Set(
      salesData.records
        .filter(r => r.fields.Live === 'YES')
        .map(r => r.id)
    );
    
    // Transform picks data
    const picks = allRecords.map(record => ({
      id: record.id,
      name: record.fields.ProductName,
      url: record.fields.ProductURL,
      imageUrl: record.fields.ImageURL,
      originalPrice: record.fields.OriginalPrice,
      salePrice: record.fields.SalePrice,
      percentOff: record.fields.PercentOff,
      saleIds: record.fields.SaleID || [],
      company: record.fields.Company || [], // Company is a lookup field for display
      companyLink: record.fields.CompanyLink || [], // CompanyLink is the actual link to Companies table
      availabilityStatus: record.fields.AvailabilityStatus || 'Unknown',
      lastValidatedAt: record.fields.LastValidatedAt,
      nextCheckDue: record.fields.NextCheckDue,
      hiddenUntilFresh: record.fields.HiddenUntilFresh || false,
      isActivelyDisplayed: (record.fields.SaleID || []).some(id => activeSaleIds.has(id))
    }));
    
    res.json({
      success: true,
      picks
    });
    
  } catch (error) {
    console.error('❌ Error fetching picks:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Refresh specific picks (check availability)
app.post('/admin/picks/refresh', async (req, res) => {
  const { auth } = req.headers;
  
  if (auth !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  try {
    const { pickIds } = req.body;
    
    if (!pickIds || !Array.isArray(pickIds) || pickIds.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Please provide an array of pick IDs' 
      });
    }
    
    console.log(`\n🔄 Refreshing ${pickIds.length} picks...`);
    
    const results = [];
    
    for (const pickId of pickIds) {
      try {
        // Fetch the pick data
        const pickUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${PICKS_TABLE_NAME}/${pickId}`;
        const pickResponse = await fetch(pickUrl, {
          headers: {
            'Authorization': `Bearer ${AIRTABLE_PAT}`,
          },
        });
        
        if (!pickResponse.ok) {
          results.push({ pickId, success: false, error: 'Pick not found' });
          continue;
        }
        
        const pickData = await pickResponse.json();
        const productUrl = pickData.fields.ProductURL;
        
        if (!productUrl) {
          results.push({ pickId, success: false, error: 'No product URL' });
          continue;
        }
        
        console.log(`  Checking: ${pickData.fields.ProductName}`);
        
        // Use the existing hybrid scraper to check the product
        const scrapeResult = await scrapeProduct(productUrl);
        
        let availabilityStatus = 'Unknown';
        let confidence = scrapeResult.confidence || 0;
        
        // Determine availability based on scrape results
        if (scrapeResult.success && confidence > 50) {
          // Product found with good confidence - assume in stock
          availabilityStatus = 'In Stock';
          
          // Check for low stock indicators in the HTML (if we had it)
          // For now, we'll default to "In Stock" if scrape succeeds
        } else if (confidence <= 50) {
          // Low confidence or product not found clearly
          availabilityStatus = 'Unknown';
        }
        
        // Calculate next check date (14 days from now)
        const today = new Date();
        const nextCheckDue = new Date(today.getTime() + (14 * 24 * 60 * 60 * 1000));
        
        // Update the pick in Airtable
        const updateUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${PICKS_TABLE_NAME}/${pickId}`;
        const updateResponse = await fetch(updateUrl, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${AIRTABLE_PAT}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            fields: {
              AvailabilityStatus: availabilityStatus,
              LastValidatedAt: today.toISOString().split('T')[0],
              NextCheckDue: nextCheckDue.toISOString().split('T')[0],
              HiddenUntilFresh: false // Unhide when refreshed
            }
          })
        });
        
        if (updateResponse.ok) {
          results.push({ 
            pickId, 
            success: true, 
            status: availabilityStatus,
            confidence
          });
          console.log(`  ✅ Updated: ${availabilityStatus} (confidence: ${confidence}%)`);
        } else {
          results.push({ pickId, success: false, error: 'Update failed' });
        }
        
      } catch (error) {
        console.error(`  ❌ Error checking pick ${pickId}:`, error.message);
        results.push({ pickId, success: false, error: error.message });
      }
    }
    
    // Clear sales cache after updating picks
    clearSalesCache();
    
    const successCount = results.filter(r => r.success).length;
    
    res.json({
      success: true,
      message: `Refreshed ${successCount}/${pickIds.length} picks`,
      results
    });
    
  } catch (error) {
    console.error('❌ Error refreshing picks:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Mark picks as sold out
app.post('/admin/picks/mark-sold-out', async (req, res) => {
  const { auth } = req.headers;
  
  if (auth !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  try {
    const { pickIds } = req.body;
    
    if (!pickIds || !Array.isArray(pickIds) || pickIds.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Please provide an array of pick IDs' 
      });
    }
    
    console.log(`\n🚫 Marking ${pickIds.length} picks as sold out...`);
    
    const results = [];
    const today = new Date().toISOString().split('T')[0];
    
    for (const pickId of pickIds) {
      try {
        const updateUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${PICKS_TABLE_NAME}/${pickId}`;
        const updateResponse = await fetch(updateUrl, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${AIRTABLE_PAT}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            fields: {
              AvailabilityStatus: 'Sold Out',
              LastValidatedAt: today
            }
          })
        });
        
        if (updateResponse.ok) {
          results.push({ pickId, success: true });
          console.log(`  ✅ Marked sold out: ${pickId}`);
        } else {
          results.push({ pickId, success: false, error: 'Update failed' });
        }
        
      } catch (error) {
        results.push({ pickId, success: false, error: error.message });
      }
    }
    
    // Clear sales cache
    clearSalesCache();
    
    const successCount = results.filter(r => r.success).length;
    
    res.json({
      success: true,
      message: `Marked ${successCount}/${pickIds.length} picks as sold out`,
      results
    });
    
  } catch (error) {
    console.error('❌ Error marking sold out:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Nightly freshness check - checks picks from active sales
app.post('/admin/picks/nightly-check', async (req, res) => {
  const { auth } = req.headers;
  
  if (auth !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  try {
    console.log(`\n🌙 Running nightly freshness check...`);
    
    // Fetch active sales
    const salesUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE_NAME}?filterByFormula={Live}='YES'&fields[]=Company`;
    const salesResponse = await fetch(salesUrl, {
      headers: {
        'Authorization': `Bearer ${AIRTABLE_PAT}`,
      },
    });
    
    if (!salesResponse.ok) {
      throw new Error('Failed to fetch active sales');
    }
    
    const salesData = await salesResponse.json();
    const activeSaleIds = salesData.records.map(r => r.id);
    
    console.log(`  Found ${activeSaleIds.length} active sales`);
    
    // Fetch picks from active sales that are due for checking
    const today = new Date().toISOString().split('T')[0];
    
    // Build filter: picks linked to active sales AND (no NextCheckDue OR NextCheckDue <= today)
    const saleIdFilters = activeSaleIds.map(id => `FIND('${id}', ARRAYJOIN({SaleID}))`).join(',');
    const filterFormula = `AND(OR(${saleIdFilters}), OR({NextCheckDue}='', {NextCheckDue}<='${today}'))`;
    
    const picksUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${PICKS_TABLE_NAME}?filterByFormula=${encodeURIComponent(filterFormula)}&pageSize=20&fields[]=ProductURL&fields[]=ProductName`;
    
    const picksResponse = await fetch(picksUrl, {
      headers: {
        'Authorization': `Bearer ${AIRTABLE_PAT}`,
      },
    });
    
    if (!picksResponse.ok) {
      throw new Error('Failed to fetch picks for checking');
    }
    
    const picksData = await picksResponse.json();
    const pickIds = picksData.records.map(r => r.id);
    
    console.log(`  Found ${pickIds.length} picks to check`);
    
    if (pickIds.length === 0) {
      return res.json({
        success: true,
        message: 'No picks due for checking',
        checkedCount: 0
      });
    }
    
    // Use the refresh endpoint logic to check these picks
    const results = [];
    
    for (const pickId of pickIds) {
      try {
        const pickData = picksData.records.find(r => r.id === pickId);
        const productUrl = pickData.fields.ProductURL;
        
        if (!productUrl) continue;
        
        console.log(`  Checking: ${pickData.fields.ProductName}`);
        
        const scrapeResult = await scrapeProduct(productUrl);
        
        let availabilityStatus = 'Unknown';
        let confidence = scrapeResult.confidence || 0;
        
        if (scrapeResult.success && confidence > 50) {
          availabilityStatus = 'In Stock';
        } else if (confidence <= 50) {
          availabilityStatus = 'Unknown';
        }
        
        const nextCheckDue = new Date(new Date().getTime() + (14 * 24 * 60 * 60 * 1000));
        
        const updateUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${PICKS_TABLE_NAME}/${pickId}`;
        const updateResponse = await fetch(updateUrl, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${AIRTABLE_PAT}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            fields: {
              AvailabilityStatus: availabilityStatus,
              LastValidatedAt: today,
              NextCheckDue: nextCheckDue.toISOString().split('T')[0]
            }
          })
        });
        
        if (updateResponse.ok) {
          results.push({ pickId, success: true, status: availabilityStatus });
        }
        
      } catch (error) {
        console.error(`  ❌ Error checking pick:`, error.message);
      }
    }
    
    clearSalesCache();
    
    res.json({
      success: true,
      message: `Checked ${results.length} picks`,
      checkedCount: results.length,
      results
    });
    
  } catch (error) {
    console.error('❌ Nightly check error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// ========================================
// COMPANY AUTO-LINKING HELPERS
// ========================================

/**
 * Normalize company name for fuzzy matching
 * Handles variations like "Gap" vs "GAP Inc." vs "The Gap"
 */
function normalizeCompanyName(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/^the\s+/i, '') // Remove leading "The"
    .replace(/\s+(inc|llc|ltd|co|corp|company)\.?$/i, '') // Remove corporate suffixes
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' '); // Normalize whitespace
}

/**
 * Calculate simple string similarity (0-1)
 * Using Dice coefficient for fuzzy matching
 */
function calculateSimilarity(str1, str2) {
  const bigrams1 = new Set();
  const bigrams2 = new Set();
  
  for (let i = 0; i < str1.length - 1; i++) {
    bigrams1.add(str1.substring(i, i + 2));
  }
  for (let i = 0; i < str2.length - 1; i++) {
    bigrams2.add(str2.substring(i, i + 2));
  }
  
  const intersection = new Set([...bigrams1].filter(x => bigrams2.has(x)));
  return (2.0 * intersection.size) / (bigrams1.size + bigrams2.size);
}

/**
 * Find existing Company record in Airtable or create a new one
 * Returns the Company record ID to use for linking
 */
async function findOrCreateCompany(companyName) {
  const normalized = normalizeCompanyName(companyName);
  console.log(`🔍 Searching for company: "${companyName}" (normalized: "${normalized}")`);
  
  try {
    // Query Companies table - use Name field with case-insensitive search
    const searchUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Companies?filterByFormula=FIND(LOWER("${normalized.replace(/"/g, '\\"')}"), LOWER({Name}))`;
    
    const searchResponse = await fetch(searchUrl, {
      headers: {
        'Authorization': `Bearer ${AIRTABLE_PAT}`
      }
    });
    
    if (!searchResponse.ok) {
      console.error('❌ Company search failed:', await searchResponse.text());
      return null;
    }
    
    const searchData = await searchResponse.json();
    
    // If exact or close match found, use it
    if (searchData.records && searchData.records.length > 0) {
      // Find best match using fuzzy matching
      let bestMatch = null;
      let bestSimilarity = 0;
      
      for (const record of searchData.records) {
        const recordName = normalizeCompanyName(record.fields.Name || '');
        const similarity = calculateSimilarity(normalized, recordName);
        
        console.log(`   Candidate: "${record.fields.Name}" (similarity: ${(similarity * 100).toFixed(1)}%)`);
        
        if (similarity > bestSimilarity) {
          bestSimilarity = similarity;
          bestMatch = record;
        }
      }
      
      // Use match if similarity >= 90%
      if (bestMatch && bestSimilarity >= 0.9) {
        console.log(`✅ Matched existing company: "${bestMatch.fields.Name}" (${(bestSimilarity * 100).toFixed(1)}% match)`);
        return bestMatch.id;
      }
    }
    
    // No match found - create new Company record
    console.log(`➕ Creating new company record: "${companyName}"`);
    
    const createUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Companies`;
    const createResponse = await fetch(createUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_PAT}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fields: {
          Name: companyName,
          Type: 'Brand' // Default type
        }
      })
    });
    
    if (!createResponse.ok) {
      console.error('❌ Company creation failed:', await createResponse.text());
      return null;
    }
    
    const newCompany = await createResponse.json();
    console.log(`✅ Created new company: ${newCompany.id}`);
    return newCompany.id;
    
  } catch (error) {
    console.error('❌ Company lookup/create error:', error);
    return null;
  }
}

// CloudMailin/AgentMail webhook endpoint - IMPROVED VERSION
app.post('/webhook/agentmail', upload.none(), async (req, res) => {
  console.log('📧 Received email webhook');
  console.log('📦 Headers:', JSON.stringify(req.headers, null, 2));
  
  // SECURITY: Verify webhook authenticity
  if (CLOUDMAIL_SECRET) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      console.error('❌ Unauthorized webhook request - missing Basic Auth');
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    
    const base64Credentials = authHeader.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const [username, ...passwordParts] = credentials.split(':');
    const password = passwordParts.join(':'); // Handle colons in password
    
    // CloudMailin sends the secret as either username OR password depending on config
    if (password !== CLOUDMAIL_SECRET && username !== CLOUDMAIL_SECRET) {
      console.error('❌ Unauthorized webhook request - invalid credentials');
      console.error('   Expected:', CLOUDMAIL_SECRET);
      console.error('   Got username:', username);
      console.error('   Got password:', password);
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    
    console.log('✅ Webhook authenticated successfully');
  } else {
    console.warn('⚠️  CLOUDMAIL_SECRET not configured - webhook is UNPROTECTED!');
  }
  
  try {
    const emailData = req.body;
    
    // IMPROVED: Log full structure for debugging
    console.log('📦 Raw email data keys:', Object.keys(emailData || {}));
    console.log('📦 Email data structure:', JSON.stringify(emailData, null, 2).substring(0, 1000));
    
    // IMPROVED: Extract metadata with multiple fallback paths
    const from = emailData.envelope?.from || 
                 emailData.headers?.from || 
                 emailData.from || 
                 'unknown';
    
    const subject = emailData.headers?.subject || 
                    emailData.headers?.Subject ||
                    emailData.subject || 
                    'No subject';
    
    console.log('📧 From:', from);
    console.log('📧 Subject:', subject);
    
    // IMPROVED: Extract and clean email content with better HTML handling
    let emailContent = '';
    
    // Try plain text first (best for AI parsing)
    if (emailData.plain) {
      emailContent = emailData.plain;
      console.log('✅ Using plain text content');
    } 
    // Fallback to HTML, but strip tags
    else if (emailData.html) {
      console.log('⚠️  No plain text, parsing HTML...');
      emailContent = emailData.html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // Remove styles
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Remove scripts
        .replace(/<[^>]+>/g, ' ') // Remove HTML tags
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();
    }
    // Last resort fallbacks
    else if (emailData.text) {
      emailContent = emailData.text;
    } else if (emailData.body) {
      emailContent = emailData.body;
    }
    
    if (!emailContent) {
      console.error('❌ No email content found in any field');
      console.error('Available fields:', Object.keys(emailData));
      return res.status(200).json({ 
        success: false, 
        message: 'No content found',
        availableFields: Object.keys(emailData)
      });
    }
    
    console.log('📧 Content length:', emailContent.length);
    console.log('📧 Content preview:', emailContent.substring(0, 300));
    
    // Check if this is a Gem login email (unchanged)
    const subjectLower = subject.toLowerCase();
    const isGemEmail = from.includes('gem.app') || 
                       subjectLower.includes('gem') ||
                       (subjectLower.includes('log') && subjectLower.includes('in')) ||
                       subjectLower.includes('login');
    
    if (isGemEmail) {
      console.log('🔐 Detected Gem login email - processing...');
      
      const magicLinkMatch = emailContent.match(/https:\/\/gem\.app\/emailLogIn\?[^\s<>"'\r\n]+/i);
      
      if (magicLinkMatch) {
        const magicLink = magicLinkMatch[0];
        console.log('✅ Extracted Gem magic link');
        
        gemMagicLinks.link = magicLink;
        gemMagicLinks.expiresAt = Date.now() + (5 * 60 * 1000);
        
        if (gemMagicLinks.pendingRequest) {
          gemMagicLinks.pendingRequest.resolve(magicLink);
          gemMagicLinks.pendingRequest = null;
        }
        
        return res.status(200).json({ 
          success: true, 
          message: 'Gem magic link received and stored'
        });
      } else {
        console.log('❌ Could not extract magic link from Gem email');
        
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
    
    // IMPROVED: Better AI prompt with clearer instructions + Azure content filter handling
    let aiResponse;
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a sales email parser. Extract sale information from TIME-LIMITED PROMOTIONAL SALES ONLY.

REJECT these types of emails (return {"error": "Not a promotional sale email"}):
- Welcome emails with first-order discounts (e.g., "Welcome! Get 10% off")
- New customer signup bonuses
- Newsletter/marketing emails without time-limited sales
- Referral program emails
- Account verification emails
- Emails with keywords: "welcome", "thanks for signing up", "verify account", "first order"

ACCEPT these types of emails:
- Flash sales with deadlines (e.g., "48-hour sale", "Weekend only")
- Seasonal sales (e.g., "Holiday Sale - 30% off until Dec 25")
- Clearance/End-of-season sales
- Event sales (e.g., "Black Friday Sale")

Return this JSON structure for VALID PROMOTIONAL SALES:
{
  "company": "Brand Name (as it appears in email)",
  "percentOff": 30,
  "saleUrl": "https://example.com/sale",
  "discountCode": "CODE123",
  "startDate": "2025-11-22",
  "endDate": "2025-11-25",
  "confidence": 85,
  "reasoning": "Brief explanation of why this is/isn't a promotional sale"
}

Confidence scoring:
- 90-100: Very clear promotional sale with explicit dates and terms
- 75-89: Clear sale but missing some details (like end date)
- 60-74: Likely a sale but ambiguous wording
- Below 60: Questionable - likely welcome email or unclear offer

Rules:
- company: Extract exact brand name from email
- percentOff: Extract percentage as number (estimate if range like "up to 30%", use midpoint)
- saleUrl: Main shopping/sale link (prefer link labeled "Shop Sale" over homepage)
- discountCode: Only if explicitly mentioned (use null if auto-applied at checkout)
- startDate: Use today's date (2025-11-22) in YYYY-MM-DD format
- endDate: Extract if mentioned, otherwise null
- confidence: 1-100 based on clarity
- reasoning: Brief explanation of your decision

Return ONLY valid JSON, no markdown formatting.`
          },
          {
            role: 'user',
            content: `Email from: ${from}
Subject: ${subject}

Content:
${emailContent.substring(0, 4000)}`
          }
        ],
        temperature: 0.1,
      });
      
      aiResponse = completion.choices[0].message.content.trim();
    } catch (error) {
      // Handle Azure OpenAI content filter (common false positive)
      if (error.message && error.message.includes('content management policy')) {
        console.log('⚠️ Azure content filter triggered - likely a false positive');
        console.log('📧 Email from:', from);
        console.log('📧 Subject:', subject);
        
        return res.status(200).json({ 
          success: false, 
          message: 'Content filter triggered - email skipped',
          reason: 'azure_content_filter',
          from: from,
          subject: subject
        });
      }
      
      // Re-throw other errors
      throw error;
    }
    
    console.log('🤖 AI Response:', aiResponse);
    
    // Parse AI response with better error handling
    let saleData;
    try {
      const jsonString = aiResponse
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      saleData = JSON.parse(jsonString);
    } catch (parseError) {
      console.error('❌ Failed to parse AI response:', parseError);
      console.error('Raw response:', aiResponse);
      return res.status(200).json({ 
        success: false, 
        message: 'AI response parsing failed',
        aiResponse: aiResponse
      });
    }
    
    // IMPROVED: Log reasoning for transparency
    console.log('🤖 AI Reasoning:', saleData.reasoning || 'No reasoning provided');
    console.log('🤖 AI Confidence:', saleData.confidence);
    
    // Check if rejected
    if (saleData.error) {
      console.log('ℹ️  Email rejected:', saleData.error);
      console.log('   Reasoning:', saleData.reasoning);
      return res.status(200).json({ 
        success: false, 
        message: saleData.error,
        reasoning: saleData.reasoning,
        from: from,
        subject: subject
      });
    }
    
    // Validate required fields
    if (!saleData.company || !saleData.saleUrl || !saleData.percentOff) {
      console.log('❌ Missing required fields:', {
        hasCompany: !!saleData.company,
        hasSaleUrl: !!saleData.saleUrl,
        hasPercentOff: !!saleData.percentOff
      });
      return res.status(200).json({ 
        success: false, 
        message: 'Missing required fields',
        extractedData: saleData
      });
    }
    
    // IMPROVED: Lower confidence threshold and log borderline cases
    const confidenceThreshold = 60; // Lowered from 70
    if (saleData.confidence && saleData.confidence < confidenceThreshold) {
      console.log(`⚠️  Low confidence (${saleData.confidence}%) - rejecting`);
      console.log('   Reasoning:', saleData.reasoning);
      console.log('   Email from:', from);
      console.log('   Subject:', subject);
      
      // Log to help debug false negatives
      return res.status(200).json({ 
        success: false, 
        message: `Low confidence extraction (${saleData.confidence}%)`,
        reasoning: saleData.reasoning,
        extractedData: saleData,
        from: from,
        subject: subject
      });
    }
    
    console.log('✅ Parsed sale data:', saleData);
    
    // Auto-link Company field by looking up existing Company records
    console.log('🔗 Looking up Company record...');
    const companyRecordId = await findOrCreateCompany(saleData.company);
    console.log(`✅ Company record: ${companyRecordId}`);
    
    // IMPROVED: Smarter duplicate detection with fuzzy matching
    console.log('🔍 Checking for duplicates...');
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const twoWeeksAgoStr = twoWeeksAgo.toISOString().split('T')[0];
    
    // Normalize company name for comparison
    const normalizedCompany = saleData.company
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[^a-z0-9]/g, '');
    
    // Fetch recent sales from same company (within 2 weeks)
    const recentSalesUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE_NAME}?filterByFormula=IS_AFTER({StartDate},'${twoWeeksAgoStr}')&fields[]=OriginalCompanyName&fields[]=PercentOff&fields[]=StartDate`;
    
    const recentSalesResponse = await fetch(recentSalesUrl, {
      headers: {
        'Authorization': `Bearer ${AIRTABLE_PAT}`
      }
    });
    
    if (recentSalesResponse.ok) {
      const recentSalesData = await recentSalesResponse.json();
      
      // Check for fuzzy duplicates
      const isDuplicate = recentSalesData.records.some(record => {
        // Use OriginalCompanyName field (plain text) instead of linked Company field
        const companyValue = record.fields.OriginalCompanyName;
        
        if (!companyValue) {
          return false; // Skip records without company name
        }
        
        // Normalize company name for comparison
        const recordCompany = companyValue
          .toLowerCase()
          .replace(/\s+/g, '')
          .replace(/[^a-z0-9]/g, '');
        
        const recordPercent = record.fields.PercentOff;
        
        // Match if company name is similar AND percent is within 5%
        const companySimilar = recordCompany === normalizedCompany || 
                               recordCompany.includes(normalizedCompany) || 
                               normalizedCompany.includes(recordCompany);
        
        const percentSimilar = Math.abs(recordPercent - saleData.percentOff) <= 5;
        
        if (companySimilar && percentSimilar) {
          console.log(`⏭️  Duplicate found: ${companyValue} ${recordPercent}%`);
          return true;
        }
        
        return false;
      });
      
      if (isDuplicate) {
        return res.status(200).json({ 
          success: false, 
          message: 'Duplicate sale - similar sale exists in past 2 weeks',
          newSale: saleData
        });
      }
    }
    
    console.log('✅ No duplicates found');
    
    // Clean the URL
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
    
    const today = new Date().toISOString().split('T')[0];
    const isLive = saleData.startDate <= today ? 'YES' : 'NO';
    
    const fields = {
      OriginalCompanyName: saleData.company, // Plain text company name from email
      PercentOff: saleData.percentOff,
      SaleURL: saleData.saleUrl,
      CleanURL: cleanUrl !== saleData.saleUrl ? cleanUrl : saleData.saleUrl,
      StartDate: saleData.startDate,
      Confidence: saleData.confidence || 60,
      Live: isLive,
      Description: JSON.stringify({
        source: 'email',
        aiReasoning: saleData.reasoning,
        confidence: saleData.confidence,
        originalEmail: {
          from: from,
          subject: subject,
          receivedAt: new Date().toISOString()
        }
      })
    };
    
    // Link Company field if lookup/create was successful
    if (companyRecordId) {
      fields.Company = [companyRecordId]; // Linked records are arrays of record IDs
    }
    
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
      return res.status(200).json({ 
        success: false, 
        message: 'Airtable error',
        error: errorText
      });
    }
    
    const airtableData = await airtableResponse.json();
    console.log('✅ Created Airtable record:', airtableData.id);
    
    // Clear sales cache
    clearSalesCache();
    
    res.status(200).json({ 
      success: true, 
      message: 'Sale processed and added to Airtable',
      recordId: airtableData.id,
      saleData: {
        company: saleData.company,
        percentOff: saleData.percentOff,
        cleanUrl: cleanUrl,
        confidence: saleData.confidence,
        reasoning: saleData.reasoning
      }
    });
    
  } catch (error) {
    console.error('❌ Webhook processing error:', error);
    console.error('Stack trace:', error.stack);
    res.status(200).json({ 
      success: false, 
      message: error.message,
      stack: error.stack
    });
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
      company: fields.Company || 'Unknown', // Company is a lookup field for display
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
