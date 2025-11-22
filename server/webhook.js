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
    
    // Combine snippets to find size information
    const sizeText = results.map(r => `${r.title} ${r.snippet}`).join('\n');
    
    // Use AI to extract max women's size from the text
    const sizeCompletion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `Extract the maximum women's clothing size available from these size chart results. Return ONLY the size value (e.g., "16", "L", "XL", "44"). If no clear maximum women's size is found, return nothing (blank response). Do not return quotes, do not estimate or guess.`
        },
        {
          role: 'user',
          content: `Size information for ${brandName}:\n\n${sizeText}`
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
        url: record.fields.URL || ''
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

// Brand research endpoint - uses Serper web search + AI to research fashion brands with REAL pricing data
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
    
    // Step 1: Use Serper to search for product pages
    console.log(`🌐 Phase 1: Searching for product pages...`);
    
    const searchQuery = `${brandName} official site products shop price`;
    const serperResponse = await fetch('https://google.serper.dev/search', {
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
    
    // Check for API errors
    if (!serperResponse.ok) {
      const errorText = await serperResponse.text();
      console.error(`❌ Serper API error (${serperResponse.status}):`, errorText);
      return res.json({
        success: false,
        error: serperResponse.status === 401 
          ? 'Search API authentication failed - check API key'
          : serperResponse.status === 429
          ? 'Search API rate limit exceeded - try again later'
          : `Search API error: ${serperResponse.status}`
      });
    }
    
    const searchData = await serperResponse.json();
    console.log(`📦 Serper returned ${searchData.organic?.length || 0} results`);
    
    if (!searchData.organic || searchData.organic.length === 0) {
      return res.json({
        success: false,
        error: 'No search results found for this brand'
      });
    }
    
    // Resale/marketplace domains to block
    const resaleDomains = [
      'therealreal.com',
      'vestiairecollective.com',
      'poshmark.com',
      'ebay.com',
      'tradesy.com',
      'etsy.com',
      'depop.com',
      'grailed.com',
      'mercari.com',
      'vinted.com',
      'thredup.com',
      'rebag.com',
      'fashionphile.com',
      'yoox.com',
      'farfetch.com',
      'ssense.com',
      'net-a-porter.com',
      'mrporter.com',
      'nordstrom.com',
      'saksfifthavenue.com',
      'bergdorfgoodman.com',
      'neimanmarcus.com',
      'bloomingdales.com',
      'shopbop.com',
      'revolve.com',
      'fwrd.com',
      'matchesfashion.com',
      'mytheresa.com',
      'selfridges.com',
      'harrods.com',
      'davidjones.com',
      'lyst.com',
      'lovethesales.com',
      'shopual.com'
    ];
    
    // Find official brand domain (must contain brand name, skip resale/marketplace sites)
    const brandNameLower = brandName.toLowerCase().replace(/[^a-z0-9]/g, '');
    let officialDomain = null;
    
    for (const result of searchData.organic.slice(0, 10)) {
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
    } else {
      console.log(`🏢 Detected official domain: ${officialDomain}`);
    }
    
    // Step 2: Use AI to extract product data from search results
    console.log(`🤖 Phase 2: Extracting product information...`);
    
    const searchResults = searchData.organic.slice(0, 8).map(r => ({
      title: r.title,
      snippet: r.snippet,
      link: r.link
    }));
    
    const findProductsCompletion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are analyzing search results to find fashion products with prices. Extract ONLY information that appears in the search results provided.

Your task:
1. Identify 3-5 product pages from the official brand website (ignore aggregators, resellers)
2. For each product, extract: product name, price (USD), and URL
3. ONLY include products where you can see a price in the title or snippet
4. Determine if this is a single brand or multi-brand shop

Return ONLY valid JSON:
{
  "products": [
    {"name": "Product Name", "price": 450, "url": "https://..."}
  ],
  "isShop": false
}

CRITICAL RULES:
- ONLY extract prices you actually see in the search results
- If no prices are visible in snippets, return empty array
- URLs must be from the official brand domain
- Price must be numeric (e.g., 450 not "$450")`
        },
        {
          role: 'user',
          content: `Extract products with prices from these search results for "${brandName}":\n\n${JSON.stringify(searchResults, null, 2)}`
        }
      ],
      temperature: 0.2
    });
    
    const productsResponse = findProductsCompletion.choices[0]?.message?.content;
    
    if (!productsResponse) {
      throw new Error('No response from product search');
    }
    
    console.log(`📦 Product extraction response: ${productsResponse.substring(0, 200)}...`);
    
    // Parse product data
    let productData;
    try {
      const jsonMatch = productsResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        productData = JSON.parse(jsonMatch[0]);
      } else {
        productData = JSON.parse(productsResponse);
      }
    } catch (parseError) {
      console.error('Failed to parse product data:', parseError);
      return res.json({
        success: false,
        error: 'Could not extract product information from search results'
      });
    }
    
    let products = productData.products || [];
    const isShop = productData.isShop || false;
    
    // FALLBACK: If no products with prices found, try a more specific price-focused search with domain filter
    if (products.length === 0 && officialDomain) {
      console.log(`⚠️  No prices in initial search - trying price-specific search with site filter...`);
      
      const priceSearchQuery = `site:${officialDomain} price $`;
      const priceSearchResponse = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: {
          'X-API-KEY': process.env.SERPER_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          q: priceSearchQuery,
          num: 8
        })
      });
      
      if (priceSearchResponse.ok) {
        const priceSearchData = await priceSearchResponse.json();
        const priceSearchResults = priceSearchData.organic?.slice(0, 6).map(r => ({
          title: r.title,
          snippet: r.snippet,
          link: r.link
        })) || [];
        
        if (priceSearchResults.length > 0) {
          // Try extracting again from price-focused results - ONLY real prices
          const priceCompletion = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
              {
                role: 'system',
                content: `Extract 3-5 products with prices ONLY if prices are visible in the search results. Never estimate or guess prices. Return JSON: {"products": [{"name": "...", "price": 150, "url": "..."}], "isShop": false}. If no prices visible, return empty products array.`
              },
              {
                role: 'user',
                content: `Brand: ${brandName}\n\nSearch results:\n${JSON.stringify(priceSearchResults, null, 2)}`
              }
            ],
            temperature: 0.2
          });
          
          const priceResponse = priceCompletion.choices[0]?.message?.content;
          if (priceResponse) {
            try {
              const jsonMatch = priceResponse.match(/\{[\s\S]*\}/);
              const priceData = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(priceResponse);
              products = priceData.products || [];
              console.log(`💡 Fallback search found ${products.length} products`);
            } catch (e) {
              console.error('Failed to parse fallback products:', e);
            }
          }
        }
      }
    }
    
    // Validate product domains match official domain
    if (officialDomain && products.length > 0) {
      const validatedProducts = products.filter(p => {
        try {
          const productDomain = new URL(p.url).hostname.replace('www.', '');
          return productDomain === officialDomain;
        } catch {
          return false;
        }
      });
      
      if (validatedProducts.length < products.length) {
        console.log(`⚠️  Filtered out ${products.length - validatedProducts.length} products from non-official domains`);
        products = validatedProducts;
      }
    }
    
    if (products.length === 0) {
      return res.json({
        success: false,
        error: 'No products with prices found in search results'
      });
    }
    
    console.log(`✅ Extracted ${products.length} validated products from search results`);
    
    // Step 3: Calculate median price and determine price tier
    const prices = products.map(p => p.price).filter(p => p > 0).sort((a, b) => a - b);
    const medianPrice = prices.length > 0 
      ? (prices.length % 2 === 0 
          ? (prices[prices.length/2 - 1] + prices[prices.length/2]) / 2 
          : prices[Math.floor(prices.length/2)])
      : 0;
    
    let priceRange = '';
    if (medianPrice < 250) priceRange = '$';
    else if (medianPrice < 500) priceRange = '$$';
    else if (medianPrice < 1100) priceRange = '$$$';
    else priceRange = '$$$$';
    
    console.log(`💰 Median price: $${medianPrice} → ${priceRange}`);
    
    // Step 4: Ownership check - verify if independent or owned by conglomerate
    console.log(`🌐 Phase 2: Checking brand ownership...`);
    
    const ownershipQuery = `${brandName} owned by parent company H&M Group LVMH Kering Richemont`;
    const ownershipResponse = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': process.env.SERPER_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        q: ownershipQuery,
        num: 6
      })
    });
    
    const ownershipData = ownershipResponse.ok ? await ownershipResponse.json() : {};
    const ownershipResults = ownershipData.organic?.slice(0, 5).map(r => ({
      title: r.title,
      snippet: r.snippet
    })) || [];
    
    // Step 5: Sustainability check - look for explicit sustainable practices
    console.log(`🌐 Phase 3: Checking sustainability practices...`);
    
    const sustainabilityQuery = `${brandName} sustainable certifications B Corp Fair Trade GOTS organic materials`;
    const sustainabilityResponse = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': process.env.SERPER_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        q: sustainabilityQuery,
        num: 6
      })
    });
    
    const sustainabilityData = sustainabilityResponse.ok ? await sustainabilityResponse.json() : {};
    const sustainabilityResults = sustainabilityData.organic?.slice(0, 5).map(r => ({
      title: r.title,
      snippet: r.snippet
    })) || [];
    
    // Step 6: Fetch categories from actual website using Serper
    console.log(`🌐 Phase 4: Fetching product categories from site...`);
    let fetchedCategories = [];
    if (officialDomain) {
      try {
        fetchedCategories = await fetchBrandCategories(officialDomain, brandName, products);
        console.log(`✅ Fetched categories: ${fetchedCategories.join(', ') || 'none'}`);
      } catch (error) {
        console.error(`❌ Failed to fetch categories:`, error.message);
      }
    }
    
    // Step 7: Fetch size chart from actual website using Serper (skip for accessories-only brands)
    console.log(`🌐 Phase 5: Fetching size chart from site...`);
    let fetchedMaxSize = null;
    
    // Only fetch sizes if brand sells clothing (skip accessories/jewelry/homewares-only brands)
    const sellsClothing = fetchedCategories.includes('Clothing') || fetchedCategories.includes('Swimwear');
    
    if (officialDomain && sellsClothing) {
      try {
        fetchedMaxSize = await fetchBrandSizes(officialDomain, brandName);
        if (fetchedMaxSize) {
          // Convert to US numeric size
          fetchedMaxSize = convertSizeToUS(fetchedMaxSize);
          console.log(`✅ Fetched max size: ${fetchedMaxSize}`);
        }
      } catch (error) {
        console.error(`❌ Failed to fetch sizes:`, error.message);
      }
    } else {
      console.log(`⏭️  Skipping size fetch (no clothing detected)`);
    }
    
    // Step 8: Ownership & diversity check - women-owned, BIPOC-owned
    console.log(`🌐 Phase 6: Checking ownership & diversity...`);
    
    const ownershipDiversityQuery = `${brandName} women-owned OR female-founded OR BIPOC-owned OR Black-owned founder`;
    const ownershipDiversityResponse = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': process.env.SERPER_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        q: ownershipDiversityQuery,
        num: 6
      })
    });
    
    const ownershipDiversityData = ownershipDiversityResponse.ok ? await ownershipDiversityResponse.json() : {};
    const ownershipDiversityResults = ownershipDiversityData.organic?.slice(0, 5).map(r => ({
      title: r.title,
      snippet: r.snippet
    })) || [];
    
    // Step 9: Use AI to analyze values based on search results (categories/sizes already scraped)
    console.log(`🤖 Phase 7: Analyzing ownership, sustainability & diversity...`);
    
    const categorizeCompletion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You analyze fashion brand ownership and values from targeted web searches. Extract ONLY facts visible in the provided search results.

VALUES (be selective, cite source arrays):
- "Independent label" = Check OWNERSHIP SEARCH RESULTS ONLY. Include ONLY if NO major parent company mentioned (H&M Group, LVMH, Kering, Richemont, etc.)
  If you see "owned by" or "part of" a major group in those results, DO NOT include this.
  
- "Sustainable" = Check SUSTAINABILITY SEARCH RESULTS ONLY. Include if MULTIPLE mentions of:
  * Certified practices (B Corp, Fair Trade, GOTS, etc.)
  * Explicit sustainable materials (organic, recycled, deadstock)
  * Transparent supply chain commitments
  Don't include if only vague marketing language or single mention.
  
- "Women-owned" = Check OWNERSHIP & DIVERSITY SEARCH RESULTS ONLY. Include ONLY if female founder names/pronouns or explicit "women-owned" mention
- "BIPOC-owned" = Check OWNERSHIP & DIVERSITY SEARCH RESULTS ONLY. Include ONLY if BIPOC/Black-owned explicitly stated
- "Secondhand" = Check products/category. Include ONLY if resale/vintage platform

Return ONLY valid JSON with comma-separated values (use exact names with hyphens):
{
  "values": "Independent label, Sustainable, Women-owned"
}`
        },
        {
          role: 'user',
          content: `Brand: ${brandName}
Type: ${isShop ? 'Shop' : 'Brand'}
Products found: ${products.map(p => p.name).join(', ')}

OWNERSHIP SEARCH RESULTS:
${JSON.stringify(ownershipResults, null, 2)}

SUSTAINABILITY SEARCH RESULTS:
${JSON.stringify(sustainabilityResults, null, 2)}

OWNERSHIP & DIVERSITY SEARCH RESULTS:
${JSON.stringify(ownershipDiversityResults, null, 2)}

Analyze and return JSON with values.`
        }
      ],
      temperature: 0.2
    });
    
    const categoryResponse = categorizeCompletion.choices[0]?.message?.content;
    
    if (!categoryResponse) {
      throw new Error('No response from categorization');
    }
    
    console.log(`📊 Values response: ${categoryResponse}`);
    
    // Parse values data
    let valuesData;
    try {
      const jsonMatch = categoryResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        valuesData = JSON.parse(jsonMatch[0]);
      } else {
        valuesData = JSON.parse(categoryResponse);
      }
    } catch (parseError) {
      console.error('Failed to parse values data:', parseError);
      // Provide defaults if parsing fails
      valuesData = { values: '' };
    }
    
    // Use fetched categories and sizes (more accurate than AI inference)
    const finalCategory = fetchedCategories.length > 0 ? fetchedCategories.join(', ') : '';
    const finalMaxSize = fetchedMaxSize || '';
    
    // Step 10: Generate brand description using Claude
    console.log(`🤖 Phase 8: Generating brand description...`);
    
    let brandDescription = '';
    try {
      const descriptionPrompt = `Write a concise 1-2 sentence brand description for ${brandName} (aim for ~60 words total). The audience is a smart, savvy shopper who actively seeks out new brands and likely already shops at similar labels—they're discerning, know quality when they see it, and are turned off by generic marketing speak or jargon. The description should: (1) position the brand in relation to other brands this shopper would know, highlighting what makes it different or fill a gap, (2) communicate the brand's design philosophy or point of view in specific, concrete terms rather than vague aspirational language. Avoid words like "elevated," "timeless," "effortless," "curated," or "elevated basics" unless using them ironically. Be specific about fabrics, cuts, details, or the actual experience of wearing/owning the clothes. Keep it punchy and direct—no unnecessary clauses.

Context about ${brandName}:
- Type: ${isShop ? 'Shop' : 'Brand'}
- Categories: ${finalCategory || 'Not specified'}
- Price Range: ${priceRange}
- Values: ${valuesData.values || 'None'}
- Products: ${products.slice(0, 5).map(p => p.name).join(', ')}

Examples:
Tibi: If you've ever wished The Row had a personality or that Lemaire came in colors, Tibi is probably already in your cart. Amy Smilovic designs clothes that respect your intelligence—pieces with enough edge to feel special but enough restraint to work with everything you already own.
Khaite: For when you want clothes that feel like fashion without the performance anxiety of actually wearing "fashion." Catherine Holstein takes classic American sportswear codes and tweaks them just enough that you look like you have a secret.
Rachel Comey: If you love the idea of artsy Brooklyn but want clothes that actually work in your life, Rachel Comey has been doing this longer and better than anyone else. She's a master of the unexpected detail—a twisted seam, an asymmetric hem, a print that somehow reads as neutral.

Write ONLY the brief 1-2 sentence description for ${brandName}, no preamble or explanation.`;

      const descriptionResponse = await anthropic.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 180,
        messages: [
          {
            role: 'user',
            content: descriptionPrompt
          }
        ]
      });
      
      brandDescription = descriptionResponse.content[0]?.text?.trim() || '';
      console.log(`✅ Generated description: ${brandDescription.substring(0, 100)}...`);
    } catch (error) {
      console.error(`❌ Failed to generate description:`, error.message);
      brandDescription = '';
    }
    
    console.log(`✅ Successfully researched ${brandName}`);
    
    // Construct the full URL from officialDomain
    const brandUrl = officialDomain ? `https://${officialDomain}` : '';
    console.log(`🔗 Brand URL: ${brandUrl || 'Not found'}`);
    
    // Step 4: Return structured data with evidence
    res.json({
      success: true,
      brand: {
        type: isShop ? 'Shop' : 'Brand',
        priceRange: priceRange,
        category: finalCategory,
        values: valuesData.values || '',
        maxWomensSize: finalMaxSize,
        description: brandDescription,
        url: brandUrl,
        // Include evidence for audit trail
        evidence: {
          products: products.slice(0, 5).map(p => ({
            name: p.name,
            price: p.price,
            url: p.url
          })),
          medianPrice: Math.round(medianPrice)
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
      'SaleID', 'Company', 'ShopMyURL', 'AvailabilityStatus', 'LastValidatedAt', 
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
      company: record.fields.Company || [],
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
