import express from 'express';
import cors from 'cors';
import multer from 'multer';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { execSync } from 'child_process';
import { scrapeProduct } from './scrapers/index.js';
import crypto from 'crypto';
import pg from 'pg';
const { Pool } = pg;
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeTelegramBot, sendAlertToTelegram, sendSaleApprovalAlert } from './telegram-bot.js';
import { scrapeGemItems } from './gem-scraper.js';
import { generateMultipleFeaturedAssets, generateHeaderOnlyAsset, generateAssetWithPicks, generatePickStoryWithCopy, generateMainSaleStory } from './featured-assets-generator.js';
import { 
  addPendingSale, 
  getPendingSales, 
  removePendingSale, 
  isApprovalsEnabled,
  setApprovalsEnabled,
  getApprovalSettings
} from './pending-sales.js';
import { 
  getAllDrafts,
  getDraftById,
  saveDraft,
  deleteDraft
} from './manual-pick-drafts.js';
import {
  getAllDrafts as getAllFinalizeDrafts,
  getDraftById as getFinalizeDraftById,
  saveDraft as saveFinalizeDraft,
  deleteDraft as deleteFinalizeDraft
} from './finalize-drafts.js';
import { createBrandResearchRouter } from './brand-research.js';
import {
  getPendingBrands,
  addPendingBrand,
  removePendingBrand,
  updatePendingBrand
} from './pending-brands.js';
import {
  getRejectedEmails,
  addRejectedEmail
} from './rejected-emails.js';
import {
  getRejectedBrands,
  addRejectedBrand,
  removeRejectedBrand,
  getAndRemoveRejectedBrand
} from './rejected-brands.js';
import { 
  postToInstagram, 
  postCarouselToInstagram, 
  scheduleInstagramPost, 
  testConnection as testInstagramConnection, 
  getConnectedAccounts 
} from './instagram-poster.js';

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

// Initialize PostgreSQL pool for asset jobs
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
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

// Helper function to send critical error alerts via Telegram
async function sendCriticalErrorAlert(errorType, details) {
  if (!TELEGRAM_CHAT_ID) return;
  
  const message = `🚨 *Critical Error*\n\n` +
    `*Type:* ${errorType}\n` +
    `*Details:* ${details}\n` +
    `*Time:* ${new Date().toLocaleString()}`;
  
  try {
    await sendAlertToTelegram(TELEGRAM_CHAT_ID, message);
  } catch (err) {
    console.error('Failed to send error alert:', err.message);
  }
}

// Gem configuration
const GEM_EMAIL = process.env.GEM_EMAIL;
const GEM_TABLE_NAME = 'Gem';

// Simple in-memory cache for sales data and companies
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const cache = {
  sales: {
    data: null,
    expiresAt: 0
  },
  companies: {
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

// Companies cache helpers
function getCachedCompanies() {
  if (cache.companies.data && Date.now() < cache.companies.expiresAt) {
    return cache.companies.data;
  }
  return null;
}

function setCachedCompanies(data) {
  cache.companies.data = data;
  cache.companies.expiresAt = Date.now() + CACHE_TTL_MS;
}

async function fetchCompanies() {
  try {
    const cached = getCachedCompanies();
    if (cached) return cached;

    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${COMPANY_TABLE_NAME}`;
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${AIRTABLE_PAT}` }
    });

    if (!response.ok) {
      console.warn('⚠️  Failed to fetch companies from Airtable');
      return [];
    }

    const data = await response.json();
    const companies = data.records.map(record => ({
      name: record.fields.Name,
      type: record.fields.Type,
      urls: (record.fields.URLs || []).map(url => {
        try {
          const urlObj = new URL(url);
          return urlObj.hostname.toLowerCase().replace(/^www\./, '');
        } catch {
          return null;
        }
      }).filter(Boolean)
    }));

    setCachedCompanies(companies);
    return companies;
  } catch (error) {
    console.warn('⚠️  Error fetching companies:', error.message);
    return [];
  }
}

function shouldAutofillBrand(url) {
  // Returns true if brand should be auto-filled (domain is a Shop), false otherwise
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname.toLowerCase().replace(/^www\./, '');
    
    const companies = cache.companies.data || [];
    const matchingCompany = companies.find(company => 
      company.urls.includes(domain)
    );

    if (!matchingCompany) {
      // No match found - keep current behavior (auto-fill)
      return true;
    }

    // Only auto-fill if it's a Shop (multi-brand retailer)
    return matchingCompany.type === 'Shop';
  } catch (error) {
    console.warn('⚠️  Error checking domain type:', error.message);
    return true; // Fallback to current behavior
  }
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

// Mount brand research router
const brandResearchRouter = createBrandResearchRouter({
  openai,
  anthropic,
  adminPassword: ADMIN_PASSWORD,
  serperApiKey: process.env.SERPER_API_KEY
});
app.use('/admin/brand-research', brandResearchRouter);

// ============================================
// PENDING BRANDS AUTO-APPROVAL ENDPOINTS
// ============================================

// Get all pending brands
app.get('/admin/pending-brands', async (req, res) => {
  const { auth } = req.headers;
  if (auth !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  try {
    let brands = await getPendingBrands();
    
    // Fetch all companies to check which are already High Priority
    const companyRecords = await fetchAllAirtableRecords(COMPANY_TABLE_NAME, {
      pageSize: '100'
    });
    
    // Create a set of already-approved brand record IDs (Priority = 'High')
    const alreadyApprovedIds = new Set();
    companyRecords.forEach(company => {
      if (company.fields.Priority === 'High') {
        alreadyApprovedIds.add(company.id);
      }
    });
    
    // Filter out brands already marked High Priority in Airtable
    const brandsToRemove = [];
    brands = brands.filter(brand => {
      if (alreadyApprovedIds.has(brand.airtableRecordId)) {
        brandsToRemove.push(brand.id);
        return false;
      }
      return true;
    });
    
    // Clean up the pending-brands.json file by removing already-approved brands
    if (brandsToRemove.length > 0) {
      for (const id of brandsToRemove) {
        await removePendingBrand(id);
      }
      console.log(`🧹 Cleaned up ${brandsToRemove.length} already-approved brands from pending list`);
    }
    
    // Fetch all live sales to check which brands have active sales
    const salesRecords = await fetchAllAirtableRecords(TABLE_NAME, {
      filterByFormula: `{Live}='YES'`,
      pageSize: '100'
    });
    
    // Create a set of brand record IDs that have active sales
    const brandsWithActiveSales = new Set();
    salesRecords.forEach(sale => {
      const companyLinks = sale.fields.Company || [];
      companyLinks.forEach(companyId => brandsWithActiveSales.add(companyId));
    });
    
    // Add hasActiveSales flag to each brand
    const brandsWithSalesInfo = brands.map(brand => ({
      ...brand,
      hasActiveSales: brandsWithActiveSales.has(brand.airtableRecordId)
    }));
    
    res.json({ success: true, brands: brandsWithSalesInfo });
  } catch (error) {
    console.error('Error fetching pending brands:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update a pending brand (for editing before approval)
app.put('/admin/pending-brands/:id', async (req, res) => {
  const { auth } = req.headers;
  if (auth !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  try {
    const brands = await updatePendingBrand(req.params.id, req.body);
    res.json({ success: true, brands });
  } catch (error) {
    console.error('Error updating pending brand:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Approve a pending brand - update Airtable and remove from pending
app.post('/admin/pending-brands/:id/approve', async (req, res) => {
  console.log('🔄 Approve brand request received for ID:', req.params.id);
  
  const { auth } = req.headers;
  if (auth !== ADMIN_PASSWORD) {
    console.log('❌ Unauthorized - invalid auth header');
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  try {
    const brands = await getPendingBrands();
    console.log(`📋 Found ${brands.length} pending brands`);
    const brand = brands.find(b => b.id === req.params.id);
    console.log('🔍 Looking for brand:', brand ? brand.name : 'NOT FOUND');
    
    if (!brand) {
      return res.status(404).json({ success: false, error: 'Brand not found' });
    }
    
    // Handle values - could be string or array
    let valuesArray = [];
    if (brand.values) {
      if (Array.isArray(brand.values)) {
        valuesArray = brand.values;
      } else if (typeof brand.values === 'string') {
        valuesArray = brand.values.split(', ').filter(v => v.trim());
      }
    }
    
    // Handle category - could be string or array
    let categoryArray = [];
    if (brand.category) {
      if (Array.isArray(brand.category)) {
        categoryArray = brand.category;
      } else if (typeof brand.category === 'string') {
        categoryArray = brand.category.split(', ').filter(c => c.trim());
      }
    }
    
    // PriceRange is a multi-select field in Airtable, needs to be an array
    const priceRangeArray = brand.priceRange ? [brand.priceRange] : [];
    
    const updateData = {
      Type: brand.type,
      PriceRange: priceRangeArray,
      Category: categoryArray,
      Values: valuesArray,
      MaxWomensSize: brand.maxWomensSize,
      Description: brand.description,
      Website: brand.url,
      Priority: 'High'
    };
    
    Object.keys(updateData).forEach(key => {
      if (!updateData[key] || (Array.isArray(updateData[key]) && updateData[key].length === 0)) {
        delete updateData[key];
      }
    });
    
    console.log('📝 Update data for Airtable:', JSON.stringify(updateData, null, 2));
    console.log('🔗 Airtable record ID:', brand.airtableRecordId);
    
    const updateResponse = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${COMPANY_TABLE_NAME}/${brand.airtableRecordId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_PAT}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ fields: updateData })
    });
    
    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      throw new Error(`Airtable update failed: ${updateResponse.status} ${errorText}`);
    }
    
    await removePendingBrand(req.params.id);
    
    cache.companies.data = null;
    cache.companies.expiresAt = 0;
    
    res.json({ success: true, message: 'Brand approved and updated in Airtable' });
  } catch (error) {
    console.error('Error approving brand:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Reject a pending brand - save to rejected list, then remove from pending
app.post('/admin/pending-brands/:id/reject', async (req, res) => {
  const { auth } = req.headers;
  if (auth !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  try {
    // Get the brand data before removing
    const pendingBrands = await getPendingBrands();
    const brandToReject = pendingBrands.find(b => b.id === req.params.id);
    
    // Save to rejected list for recovery
    if (brandToReject) {
      await addRejectedBrand(brandToReject);
    }
    
    await removePendingBrand(req.params.id);
    res.json({ success: true, message: 'Brand rejected' });
  } catch (error) {
    console.error('Error rejecting brand:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get rejected brands
app.get('/admin/rejected-brands', async (req, res) => {
  const { auth } = req.headers;
  if (auth !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  try {
    const rejectedBrands = await getRejectedBrands();
    res.json({ success: true, brands: rejectedBrands });
  } catch (error) {
    console.error('Error getting rejected brands:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Restore a rejected brand back to pending
app.post('/admin/rejected-brands/:id/restore', async (req, res) => {
  const { auth } = req.headers;
  if (auth !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  try {
    const brand = await getAndRemoveRejectedBrand(req.params.id);
    
    if (!brand) {
      return res.status(404).json({ success: false, message: 'Rejected brand not found' });
    }
    
    // Remove rejection metadata before restoring
    delete brand.rejectedAt;
    
    // Add back to pending
    await addPendingBrand(brand);
    
    res.json({ success: true, message: 'Brand restored to pending' });
  } catch (error) {
    console.error('Error restoring brand:', error);
    res.status(500).json({ success: false, error: error.message });
  }
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
        shopmyUrl: record.fields.ShopmyURL || '', // Primary affiliate link
        priority: record.fields.Priority || ''
      };
    });
    
    res.json({ success: true, companies });
  } catch (error) {
    console.error('❌ Error fetching companies:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Newsletter subscription endpoint (public)
app.post('/newsletter/subscribe', async (req, res) => {
  try {
    console.log('📨 Newsletter subscription request:', req.body);
    const { email, source } = req.body;
    
    if (!email) {
      console.log('❌ No email provided');
      return res.status(400).json({ success: false, message: 'Email is required' });
    }
    
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.log('❌ Invalid email format:', email);
      return res.status(400).json({ success: false, message: 'Invalid email address' });
    }
    
    console.log('✅ Email validated, checking for duplicates...');
    
    // Check if email already exists in Newsletter table
    const existingRecords = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Newsletter?filterByFormula={Email}='${email}'`,
      {
        headers: {
          'Authorization': `Bearer ${AIRTABLE_PAT}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const existingData = await existingRecords.json();
    console.log('📊 Duplicate check result:', existingData.records?.length || 0, 'existing records');
    
    if (existingData.records && existingData.records.length > 0) {
      console.log('ℹ️ Email already subscribed:', email);
      return res.json({ success: true, message: 'Already subscribed', duplicate: true });
    }
    
    console.log('💾 Adding email to Airtable Newsletter table...');
    
    // Add email to Newsletter table
    const response = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Newsletter`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${AIRTABLE_PAT}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          records: [
            {
              fields: {
                Email: email,
                SubscribedDate: new Date().toISOString().split('T')[0],
                Source: source || 'Website'
              }
            }
          ]
        })
      }
    );
    
    const data = await response.json();
    console.log('📡 Airtable response status:', response.status);
    console.log('📡 Airtable response data:', JSON.stringify(data, null, 2));
    
    if (response.ok) {
      console.log(`✅ New newsletter subscriber: ${email} (source: ${source})`);
      res.json({ success: true, message: 'Successfully subscribed' });
    } else {
      console.error('❌ Error adding to Newsletter:', data);
      res.status(500).json({ success: false, message: 'Failed to subscribe' });
    }
  } catch (error) {
    console.error('❌ Newsletter subscription error:', error);
    console.error('❌ Error stack:', error.stack);
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
      picksCount: picksCountBySale.get(record.id) || 0,
      featuredAssetUrl: record.fields.FeaturedAssetURL || null,
      featuredAssetDate: record.fields.FeaturedAssetDate || null
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
  const { percentOff, live, promoCode, endDate } = req.body;
  
  if (auth !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  // Build fields object with only provided values
  const fields = {};
  
  if (percentOff !== undefined) {
    if (isNaN(percentOff)) {
      return res.status(400).json({ success: false, message: 'Valid percentOff is required' });
    }
    fields.PercentOff = parseInt(percentOff);
  }
  
  if (live !== undefined) {
    fields.Live = live;
  }
  
  if (promoCode !== undefined) {
    fields.PromoCode = promoCode;
  }
  
  if (endDate !== undefined) {
    fields.EndDate = endDate;
  }
  
  if (Object.keys(fields).length === 0) {
    return res.status(400).json({ success: false, message: 'At least one field to update is required' });
  }
  
  try {
    const response = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE_NAME}/${saleId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_PAT}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ fields })
    });
    
    if (!response.ok) {
      const error = await response.json();
      console.error('❌ Airtable PATCH error:', error);
      return res.status(500).json({ success: false, message: 'Failed to update sale in Airtable' });
    }
    
    const data = await response.json();
    console.log(`✅ Updated sale ${saleId}:`, fields);
    
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
      SizingSource: brandData.sizingSource || '',
      Notes: brandData.notes || '',
      Values: valuesArray,
      Description: brandData.description || '',
      Website: brandData.url || ''
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

// Streaming version of scrape-product that sends results as they're scraped
app.post('/admin/scrape-product-stream', async (req, res) => {
  const { auth } = req.headers;
  const { url, urls, test } = req.body;
  
  if (auth !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  const urlsToScrape = urls || (url ? [url] : []);
  
  if (!urlsToScrape || urlsToScrape.length === 0) {
    return res.status(400).json({ success: false, message: 'URL or URLs array is required' });
  }
  
  // Setup SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  const sendEvent = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  
  try {
    console.log(`🔍 Streaming scrape of ${urlsToScrape.length} product(s)`);
    
    const failedDomains = new Set();
    let successCount = 0;
    let failureCount = 0;
    
    // Send initial event
    sendEvent('start', { total: urlsToScrape.length });
    
    for (let i = 0; i < urlsToScrape.length; i++) {
      const productUrl = urlsToScrape[i];
      const domain = extractDomain(productUrl);
      
      // Skip if domain already failed
      if (failedDomains.has(domain)) {
        console.log(`  ⏩ Skipping ${productUrl} (domain ${domain} already failed)`);
        failureCount++;
        sendEvent('skip', {
          index: i,
          url: productUrl,
          error: `Skipped - domain ${domain} failed on previous URL`,
          progress: { current: i + 1, total: urlsToScrape.length }
        });
        continue;
      }
      
      try {
        console.log(`  → ${productUrl}`);
        sendEvent('scraping', {
          index: i,
          url: productUrl,
          progress: { current: i + 1, total: urlsToScrape.length }
        });
        
        const result = await scrapeProduct(productUrl, {
          openai,
          enableTestMetadata: test || false,
          logger: console,
          shouldAutofillBrand
        });
        
        if (!result.success) {
          const errorMsg = result.error || 'Could not extract product data';
          const errorType = result.errorType || 'UNKNOWN';
          console.error(`  ❌ Failed: ${errorMsg} (${errorType})`);
          
          // Only skip domain for BLOCKING errors, not RETRYABLE ones
          if (errorType === 'BLOCKING') {
            failedDomains.add(domain);
            console.log(`  🚫 Domain ${domain} marked as failed (BLOCKING error) - will skip remaining URLs from this domain`);
          } else if (errorType === 'RETRYABLE') {
            console.log(`  ⚠️  Retryable error - will continue with other URLs from ${domain}`);
          } else if (errorType === 'FATAL') {
            console.log(`  ⚠️  Fatal error for this URL only - will continue with other URLs from ${domain}`);
          }
          
          failureCount++;
          
          sendEvent('error', {
            index: i,
            url: productUrl,
            error: errorMsg,
            errorType: errorType,
            progress: { current: i + 1, total: urlsToScrape.length }
          });
        } else {
          console.log(`  ✅ Success via ${result.meta.extractionMethod} (confidence: ${result.meta.confidence}%)`);
          successCount++;
          
          sendEvent('success', {
            index: i,
            url: productUrl,
            product: result.product,
            extractionMethod: result.meta.extractionMethod,
            confidence: result.meta.confidence,
            progress: { current: i + 1, total: urlsToScrape.length }
          });
        }
      } catch (error) {
        console.error(`  ❌ Error scraping ${productUrl}:`, error.message);
        const errorType = error.errorType || 'UNKNOWN';
        
        // Only skip domain for BLOCKING errors, not RETRYABLE ones
        if (errorType === 'BLOCKING') {
          failedDomains.add(domain);
          console.log(`  🚫 Domain ${domain} marked as failed (BLOCKING error) - will skip remaining URLs from this domain`);
        } else {
          console.log(`  ⚠️  Error type: ${errorType} - will continue with other URLs from ${domain}`);
        }
        
        failureCount++;
        
        sendEvent('error', {
          index: i,
          url: productUrl,
          error: error.message,
          errorType: errorType,
          progress: { current: i + 1, total: urlsToScrape.length }
        });
      }
    }
    
    console.log(`\n📊 Stream complete: ${successCount} succeeded, ${failureCount} failed`);
    
    sendEvent('complete', {
      successCount,
      failureCount,
      total: urlsToScrape.length
    });
    
    res.end();
    
  } catch (error) {
    console.error('❌ Streaming scrape error:', error);
    sendEvent('error', { error: error.message });
    res.end();
  }
});

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
          logger: console,
          shouldAutofillBrand
        });
        
        if (!result.success) {
          const errorMsg = result.error || 'Could not extract product data';
          const errorType = result.errorType || 'UNKNOWN';
          console.error(`  ❌ Failed: ${errorMsg} (${errorType})`);
          
          // Only skip domain for BLOCKING errors, not RETRYABLE ones
          if (errorType === 'BLOCKING') {
            failedDomains.add(domain);
            console.log(`  🚫 Domain ${domain} marked as failed (BLOCKING error) - will skip remaining URLs from this domain`);
          } else if (errorType === 'RETRYABLE') {
            console.log(`  ⚠️  Retryable error - will continue with other URLs from ${domain}`);
          } else if (errorType === 'FATAL') {
            console.log(`  ⚠️  Fatal error for this URL only - will continue with other URLs from ${domain}`);
          }
          
          failures.push({
            url: productUrl,
            error: errorMsg,
            errorType: errorType,
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
        const errorType = error.errorType || 'UNKNOWN';
        
        // Only skip domain for BLOCKING errors, not RETRYABLE ones
        if (errorType === 'BLOCKING') {
          failedDomains.add(domain);
          console.log(`  🚫 Domain ${domain} marked as failed (BLOCKING error) - will skip remaining URLs from this domain`);
        } else {
          console.log(`  ⚠️  Error type: ${errorType} - will continue with other URLs from ${domain}`);
        }
        
        failures.push({
          url: productUrl,
          error: error.message,
          errorType: errorType
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
    
    // Filter out incomplete picks - must have URL, name, and imageUrl
    const validPicks = picks.filter(pick => {
      const hasUrl = pick.url && pick.url.trim();
      const hasName = pick.name && pick.name.trim();
      const hasImage = pick.imageUrl && pick.imageUrl.trim();
      
      if (!hasUrl || !hasName || !hasImage) {
        console.log(`⏭️ Skipping incomplete pick: URL=${!!hasUrl}, Name=${!!hasName}, Image=${!!hasImage}`);
        return false;
      }
      return true;
    });
    
    if (validPicks.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'No valid picks to save (all picks were missing required fields)' 
      });
    }
    
    if (validPicks.length < picks.length) {
      console.log(`⚠️ Filtered out ${picks.length - validPicks.length} incomplete picks`);
    }
    
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
    
    // Create records for each valid pick
    // Note: ShopMyURL, PercentOff, and Company are computed fields in Airtable, don't send them
    const records = validPicks.map(pick => {
      const fields = {
        ProductURL: cleanUrl(pick.url), // Clean URL to remove tracking parameters
        ProductName: pick.name,
        ImageURL: pick.imageUrl,
        SaleID: [saleId] // Link to Sales table (Company will be auto-populated via lookup)
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
    
    const skippedCount = picks.length - validPicks.length;
    const skippedMessage = skippedCount > 0 ? ` (${skippedCount} incomplete picks skipped)` : '';
    
    res.json({ 
      success: true, 
      message: `Saved ${allRecordIds.length} picks${skippedMessage}`,
      recordIds: allRecordIds,
      skippedCount
    });
    
  } catch (error) {
    console.error('❌ Save picks error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Save manually entered picks to Airtable
app.post('/admin/manual-picks', async (req, res) => {
  const { auth } = req.headers;
  const { saleId, picks } = req.body;
  
  if (auth !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  if (!saleId || !picks || !Array.isArray(picks)) {
    return res.status(400).json({ success: false, message: 'saleId and picks array required' });
  }
  
  try {
    console.log(`✍️ Saving ${picks.length} manual picks for sale ${saleId}`);
    
    // Filter out incomplete picks - must have URL, name, and imageUrl
    const validPicks = picks.filter(pick => {
      const hasUrl = pick.url && pick.url.trim();
      const hasName = pick.name && pick.name.trim();
      const hasImage = pick.imageUrl && pick.imageUrl.trim();
      
      if (!hasUrl || !hasName || !hasImage) {
        console.log(`⏭️ Skipping incomplete manual pick: URL=${!!hasUrl}, Name=${!!hasName}, Image=${!!hasImage}`);
        return false;
      }
      return true;
    });
    
    if (validPicks.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'No valid picks to save (all picks were missing required fields)' 
      });
    }
    
    if (validPicks.length < picks.length) {
      console.log(`⚠️ Filtered out ${picks.length - validPicks.length} incomplete manual picks`);
    }
    
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
    
    // Create records for each valid manual pick
    const records = validPicks.map(pick => {
      const fields = {
        ProductURL: cleanUrl(pick.url),
        ProductName: pick.name,
        ImageURL: pick.imageUrl,
        SaleID: [saleId], // Company will be auto-populated via lookup
        EntryType: 'manual',
        Confidence: 100 // Manual entries always 100% confidence
      };
      
      // Add brand if provided
      if (pick.brand) {
        fields.Brand = pick.brand;
      }
      
      // Only add prices if they exist
      if (pick.originalPrice !== null && pick.originalPrice !== undefined) {
        fields.OriginalPrice = pick.originalPrice;
      }
      if (pick.salePrice !== null && pick.salePrice !== undefined) {
        fields.SalePrice = pick.salePrice;
      }
      
      // Add custom percentOff if provided
      if (pick.percentOff !== null && pick.percentOff !== undefined) {
        fields.PercentOffOverride = pick.percentOff;
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
          message: `Failed to save manual picks (batch ${Math.floor(i / BATCH_SIZE) + 1})` 
        });
      }
      
      const data = await airtableResponse.json();
      allRecordIds.push(...data.records.map(r => r.id));
      console.log(`✅ Saved manual batch ${Math.floor(i / BATCH_SIZE) + 1}: ${data.records.length} picks`);
    }
    
    console.log(`✅ Total manual picks saved: ${allRecordIds.length}`);
    
    // Clear sales cache since picks changed
    clearSalesCache();
    
    const skippedCount = picks.length - validPicks.length;
    const skippedMessage = skippedCount > 0 ? ` (${skippedCount} incomplete picks skipped)` : '';
    
    res.json({ 
      success: true, 
      message: `Saved ${allRecordIds.length} manual pick(s)${skippedMessage}`,
      recordIds: allRecordIds,
      skippedCount
    });
    
  } catch (error) {
    console.error('❌ Save manual picks error:', error);
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

// Get picks for a specific sale
app.get('/admin/sale/:saleId/picks', async (req, res) => {
  const { auth } = req.headers;
  
  if (auth !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  try {
    const { saleId } = req.params;
    
    const filterFormula = `FIND("${saleId}",{SaleRecordIDs}&'')`;
    const fields = ['ProductName', 'ImageURL', 'OriginalPrice', 'SalePrice', 'PercentOff', 'Brand'];
    
    const params = new URLSearchParams({
      filterByFormula: filterFormula,
      'fields[]': fields.join(',')
    });
    
    fields.forEach(field => {
      params.append('fields[]', field);
    });
    
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${PICKS_TABLE_NAME}?filterByFormula=${encodeURIComponent(filterFormula)}`;
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${AIRTABLE_PAT}` }
    });
    
    if (!response.ok) {
      throw new Error(`Airtable error: ${response.status}`);
    }
    
    const data = await response.json();
    
    const picks = (data.records || []).map(record => ({
      id: record.id,
      productName: record.fields.ProductName || 'Untitled',
      imageUrl: record.fields.ImageURL || '',
      originalPrice: record.fields.OriginalPrice || 0,
      salePrice: record.fields.SalePrice || 0,
      percentOff: record.fields.PercentOff || 0,
      brand: record.fields.Brand || ''
    }));
    
    res.json({ success: true, picks });
    
  } catch (error) {
    console.error('Error fetching sale picks:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============== Background Job System for Asset Generation ==============

// In-memory tracking of running jobs (for the current process)
const runningJobs = new Map();

// Process a job in the background
async function processAssetJob(jobId) {
  try {
    // Get job from database
    const jobResult = await pool.query('SELECT * FROM asset_jobs WHERE id = $1', [jobId]);
    if (jobResult.rows.length === 0) return;
    
    const job = jobResult.rows[0];
    // Parse config from JSON if it's a string (PostgreSQL JSONB should auto-parse, but be safe)
    const config = typeof job.config === 'string' ? JSON.parse(job.config) : job.config;
    const { saleId, mainAsset, storyPicks } = config;
    
    // Update status to processing
    await pool.query(
      'UPDATE asset_jobs SET status = $1, updated_at = NOW() WHERE id = $2',
      ['processing', jobId]
    );
    
    console.log(`\n📸 [Job ${jobId}] Processing asset generation for sale ${saleId}...`);
    const results = [];
    
    const totalSteps = (mainAsset ? 1 : 0) + (storyPicks?.length || 0);
    let currentStep = 0;
    
    // Generate main asset if requested
    if (mainAsset) {
      currentStep++;
      await pool.query(
        'UPDATE asset_jobs SET progress = $1, total = $2, current_step = $3, updated_at = NOW() WHERE id = $4',
        [currentStep, totalSteps, 'Generating main sale story...', jobId]
      );
      
      try {
        const customNote = mainAsset.customNote || '';
        const result = await generateMainSaleStory(saleId, customNote);
        results.push({ type: 'main', success: true, ...result });
      } catch (error) {
        console.error(`[Job ${jobId}] Main asset generation error:`, error);
        results.push({ type: 'main', success: false, error: error.message });
      }
    }
    
    // Generate individual story images
    if (storyPicks && storyPicks.length > 0) {
      for (let i = 0; i < storyPicks.length; i++) {
        const pickConfig = storyPicks[i];
        currentStep++;
        await pool.query(
          'UPDATE asset_jobs SET progress = $1, total = $2, current_step = $3, updated_at = NOW() WHERE id = $4',
          [currentStep, totalSteps, `Generating story ${i + 1} of ${storyPicks.length}...`, jobId]
        );
        
        try {
          const result = await generatePickStoryWithCopy(pickConfig.pickId, pickConfig.customCopy || '');
          results.push({ type: 'story', pickId: pickConfig.pickId, success: true, ...result });
        } catch (error) {
          console.error(`[Job ${jobId}] Story generation error for pick ${pickConfig.pickId}:`, error);
          results.push({ type: 'story', pickId: pickConfig.pickId, success: false, error: error.message });
        }
      }
    }
    
    // Get sale name for display
    let saleName = 'Unknown Sale';
    try {
      const saleUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Sales/${saleId}`;
      const saleRes = await fetch(saleUrl, {
        headers: { 'Authorization': `Bearer ${AIRTABLE_PAT}` }
      });
      if (saleRes.ok) {
        const saleData = await saleRes.json();
        saleName = saleData.fields.OriginalCompanyName || saleData.fields.CompanyName || 'Unknown Sale';
      }
    } catch (e) { 
      console.log(`[Job ${jobId}] Could not fetch sale name:`, e.message);
    }
    
    // Save results to generated_assets table
    try {
      await pool.query('DELETE FROM generated_assets WHERE sale_id = $1', [saleId]);
      
      for (const result of results) {
        await pool.query(
          `INSERT INTO generated_assets (sale_id, sale_name, asset_type, pick_id, filename, drive_file_id, drive_url, success, error)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            saleId,
            saleName,
            result.type === 'story' ? 'story' : 'main',
            result.pickId || null,
            result.filename || null,
            result.driveFileId || null,
            result.driveUrl || null,
            result.success,
            result.error || null
          ]
        );
      }
      console.log(`[Job ${jobId}] 💾 Saved ${results.length} assets to database`);
    } catch (dbError) {
      console.error(`[Job ${jobId}] Failed to save assets to database:`, dbError.message);
    }
    
    // Mark job as completed
    const successCount = results.filter(r => r.success).length;
    await pool.query(
      'UPDATE asset_jobs SET status = $1, progress = $2, total = $3, current_step = $4, results = $5, updated_at = NOW() WHERE id = $6',
      ['completed', totalSteps, totalSteps, `Generated ${successCount}/${results.length} assets`, JSON.stringify({ saleName, saleId, results }), jobId]
    );
    
    console.log(`[Job ${jobId}] ✅ Completed: ${successCount}/${results.length} assets generated`);
    runningJobs.delete(jobId);
    
  } catch (error) {
    console.error(`[Job ${jobId}] Fatal error:`, error);
    await pool.query(
      'UPDATE asset_jobs SET status = $1, error = $2, updated_at = NOW() WHERE id = $3',
      ['failed', error.message, jobId]
    );
    runningJobs.delete(jobId);
  }
}

// Start a new asset generation job
app.post('/admin/asset-jobs', async (req, res) => {
  console.log('📋 POST /admin/asset-jobs received');
  const { auth } = req.headers;
  
  if (auth !== ADMIN_PASSWORD) {
    console.log('   ❌ Unauthorized');
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  try {
    const { saleId, mainAsset, storyPicks } = req.body;
    console.log('   Sale ID:', saleId);
    console.log('   Main Asset:', mainAsset ? 'yes' : 'no');
    console.log('   Story Picks:', storyPicks?.length || 0);
    
    if (!saleId) {
      return res.status(400).json({ success: false, message: 'Sale ID required' });
    }
    
    const totalSteps = (mainAsset ? 1 : 0) + (storyPicks?.length || 0);
    
    // Create job in database
    const result = await pool.query(
      `INSERT INTO asset_jobs (sale_id, status, config, progress, total, current_step)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [saleId, 'pending', JSON.stringify({ saleId, mainAsset, storyPicks }), 0, totalSteps, 'Queued...']
    );
    
    const jobId = result.rows[0].id;
    console.log(`📋 Created asset job ${jobId} for sale ${saleId}`);
    
    // Start processing in the background (don't await)
    runningJobs.set(jobId, true);
    processAssetJob(jobId).catch(err => {
      console.error(`Job ${jobId} failed:`, err);
    });
    
    res.json({ success: true, jobId, message: 'Job started' });
    
  } catch (error) {
    console.error('Error creating asset job:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get active job for a sale (MUST come before /:jobId to avoid route conflict)
app.get('/admin/asset-jobs/active/:saleId', async (req, res) => {
  const { auth } = req.headers;
  
  if (auth !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  try {
    const { saleId } = req.params;
    
    // Find active or recent job for this sale
    const result = await pool.query(
      `SELECT * FROM asset_jobs 
       WHERE sale_id = $1 AND status IN ('pending', 'processing')
       ORDER BY created_at DESC LIMIT 1`,
      [saleId]
    );
    
    if (result.rows.length === 0) {
      return res.json({ success: true, hasActiveJob: false });
    }
    
    const job = result.rows[0];
    res.json({
      success: true,
      hasActiveJob: true,
      job: {
        id: job.id,
        saleId: job.sale_id,
        status: job.status,
        progress: job.progress,
        total: job.total,
        currentStep: job.current_step,
        createdAt: job.created_at
      }
    });
    
  } catch (error) {
    console.error('Error fetching active job:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get job status by ID
app.get('/admin/asset-jobs/:jobId', async (req, res) => {
  const { auth } = req.headers;
  
  if (auth !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  try {
    const { jobId } = req.params;
    const result = await pool.query('SELECT * FROM asset_jobs WHERE id = $1', [jobId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }
    
    const job = result.rows[0];
    res.json({
      success: true,
      job: {
        id: job.id,
        saleId: job.sale_id,
        status: job.status,
        progress: job.progress,
        total: job.total,
        currentStep: job.current_step,
        results: job.results,
        error: job.error,
        createdAt: job.created_at,
        updatedAt: job.updated_at
      }
    });
    
  } catch (error) {
    console.error('Error fetching job:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Save asset configuration for a sale
app.post('/admin/asset-config/:saleId', async (req, res) => {
  const { auth } = req.headers;
  
  if (auth !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  try {
    const { saleId } = req.params;
    const config = req.body;
    
    await pool.query(
      `INSERT INTO asset_configs (sale_id, config, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (sale_id) DO UPDATE SET config = $2, updated_at = NOW()`,
      [saleId, JSON.stringify(config)]
    );
    
    res.json({ success: true, message: 'Config saved' });
    
  } catch (error) {
    console.error('Error saving config:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get asset configuration for a sale
app.get('/admin/asset-config/:saleId', async (req, res) => {
  const { auth } = req.headers;
  
  if (auth !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  try {
    const { saleId } = req.params;
    const result = await pool.query('SELECT * FROM asset_configs WHERE sale_id = $1', [saleId]);
    
    if (result.rows.length === 0) {
      return res.json({ success: true, hasConfig: false });
    }
    
    res.json({ success: true, hasConfig: true, config: result.rows[0].config });
    
  } catch (error) {
    console.error('Error fetching config:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============== End Background Job System ==============

// Generate custom assets with configuration
// SSE endpoint for asset generation with progress updates (legacy - kept for compatibility)
app.post('/admin/generate-custom-assets-stream', async (req, res) => {
  const { auth } = req.headers;
  
  if (auth !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  
  const sendProgress = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  
  try {
    const { saleId, mainAsset, storyPicks } = req.body;
    
    if (!saleId) {
      sendProgress({ type: 'error', message: 'Sale ID required' });
      res.end();
      return;
    }
    
    console.log(`\n📸 Generating custom assets for sale ${saleId}...`);
    const results = [];
    
    // Calculate total steps
    const totalSteps = (mainAsset ? 1 : 0) + (storyPicks?.length || 0);
    let currentStep = 0;
    
    sendProgress({ type: 'start', total: totalSteps, current: 0, message: 'Starting asset generation...' });
    
    // Generate main asset if requested
    if (mainAsset) {
      currentStep++;
      sendProgress({ type: 'progress', total: totalSteps, current: currentStep, message: 'Generating main sale story...' });
      
      try {
        const customNote = mainAsset.customNote || '';
        const result = await generateMainSaleStory(saleId, customNote);
        results.push({ type: 'main', success: true, ...result });
        sendProgress({ type: 'step_complete', total: totalSteps, current: currentStep, stepType: 'main', success: true });
      } catch (error) {
        console.error('Main asset generation error:', error);
        results.push({ type: 'main', success: false, error: error.message });
        sendProgress({ type: 'step_complete', total: totalSteps, current: currentStep, stepType: 'main', success: false, error: error.message });
      }
    }
    
    // Generate individual story images
    if (storyPicks && storyPicks.length > 0) {
      for (let i = 0; i < storyPicks.length; i++) {
        const pickConfig = storyPicks[i];
        currentStep++;
        sendProgress({ type: 'progress', total: totalSteps, current: currentStep, message: `Generating story ${i + 1} of ${storyPicks.length}...` });
        
        try {
          const result = await generatePickStoryWithCopy(pickConfig.pickId, pickConfig.customCopy || '');
          results.push({ type: 'story', pickId: pickConfig.pickId, success: true, ...result });
          sendProgress({ type: 'step_complete', total: totalSteps, current: currentStep, stepType: 'story', success: true });
        } catch (error) {
          console.error(`Story generation error for pick ${pickConfig.pickId}:`, error);
          results.push({ type: 'story', pickId: pickConfig.pickId, success: false, error: error.message });
          sendProgress({ type: 'step_complete', total: totalSteps, current: currentStep, stepType: 'story', success: false, error: error.message });
        }
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    const totalCount = results.length;
    
    // Get sale name for display
    let saleName = 'Unknown Sale';
    try {
      const saleUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Sales/${saleId}`;
      const saleRes = await fetch(saleUrl, {
        headers: { 'Authorization': `Bearer ${AIRTABLE_PAT}` }
      });
      if (saleRes.ok) {
        const saleData = await saleRes.json();
        saleName = saleData.fields.OriginalCompanyName || saleData.fields.CompanyName || 'Unknown Sale';
      }
    } catch (e) { 
      console.log('Could not fetch sale name:', e.message);
    }
    
    // Save results to database for persistence
    try {
      await pool.query('DELETE FROM generated_assets WHERE sale_id = $1', [saleId]);
      
      for (const result of results) {
        await pool.query(
          `INSERT INTO generated_assets (sale_id, sale_name, asset_type, pick_id, filename, drive_file_id, drive_url, success, error)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            saleId,
            saleName,
            result.type === 'story' ? 'story' : 'main',
            result.pickId || null,
            result.filename || null,
            result.driveFileId || null,
            result.driveUrl || null,
            result.success,
            result.error || null
          ]
        );
      }
      console.log(`💾 Saved ${results.length} assets to database for sale ${saleId}`);
    } catch (dbError) {
      console.error('Failed to save assets to database:', dbError.message);
    }
    
    // Send completion event
    sendProgress({ 
      type: 'complete', 
      success: true,
      message: `Generated ${successCount}/${totalCount} assets`,
      saleName,
      saleId,
      results
    });
    
    res.end();
    
  } catch (error) {
    console.error('Custom assets generation error:', error);
    sendProgress({ type: 'error', message: error.message });
    res.end();
  }
});

// Legacy non-streaming endpoint (kept for compatibility)
app.post('/admin/generate-custom-assets', async (req, res) => {
  const { auth } = req.headers;
  
  if (auth !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  try {
    const { saleId, mainAsset, storyPicks } = req.body;
    
    if (!saleId) {
      return res.status(400).json({ success: false, message: 'Sale ID required' });
    }
    
    console.log(`\n📸 Generating custom assets for sale ${saleId}...`);
    const results = [];
    
    // Generate main asset if requested (now uses Story format 1080x1920)
    if (mainAsset) {
      try {
        // Use the new story-format main asset generator
        const customNote = mainAsset.customNote || '';
        const result = await generateMainSaleStory(saleId, customNote);
        results.push({ type: 'main', success: true, ...result });
      } catch (error) {
        console.error('Main asset generation error:', error);
        results.push({ type: 'main', success: false, error: error.message });
      }
    }
    
    // Generate individual story images
    if (storyPicks && storyPicks.length > 0) {
      for (const pickConfig of storyPicks) {
        try {
          const result = await generatePickStoryWithCopy(pickConfig.pickId, pickConfig.customCopy || '');
          results.push({ type: 'story', pickId: pickConfig.pickId, success: true, ...result });
        } catch (error) {
          console.error(`Story generation error for pick ${pickConfig.pickId}:`, error);
          results.push({ type: 'story', pickId: pickConfig.pickId, success: false, error: error.message });
        }
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    const totalCount = results.length;
    
    // Get sale name for display
    let saleName = 'Unknown Sale';
    try {
      const saleUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Sales/${saleId}`;
      const saleRes = await fetch(saleUrl, {
        headers: { 'Authorization': `Bearer ${AIRTABLE_PAT}` }
      });
      if (saleRes.ok) {
        const saleData = await saleRes.json();
        saleName = saleData.fields.OriginalCompanyName || saleData.fields.CompanyName || 'Unknown Sale';
      }
    } catch (e) { 
      console.log('Could not fetch sale name:', e.message);
    }
    
    // Save results to database for persistence
    try {
      // Clear previous assets for this sale
      await pool.query('DELETE FROM generated_assets WHERE sale_id = $1', [saleId]);
      
      // Insert new results
      for (const result of results) {
        await pool.query(
          `INSERT INTO generated_assets (sale_id, sale_name, asset_type, pick_id, filename, drive_file_id, drive_url, success, error)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            saleId,
            saleName,
            result.type === 'story' ? 'story' : 'main',
            result.pickId || null,
            result.filename || null,
            result.driveFileId || null,
            result.driveUrl || null,
            result.success,
            result.error || null
          ]
        );
      }
      console.log(`💾 Saved ${results.length} assets to database for sale ${saleId}`);
    } catch (dbError) {
      console.error('Failed to save assets to database:', dbError.message);
    }
    
    res.json({
      success: true,
      message: `Generated ${successCount}/${totalCount} assets`,
      saleName,
      saleId,
      results
    });
    
  } catch (error) {
    console.error('Custom assets generation error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Helper function for fetching generated assets
async function fetchGeneratedAssets(saleId, res, auth, ADMIN_PASSWORD, pool) {
  if (auth !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  try {
    let result;
    if (saleId) {
      result = await pool.query(
        `SELECT * FROM generated_assets WHERE sale_id = $1 ORDER BY created_at DESC`,
        [saleId]
      );
    } else {
      // Get most recent sale's assets
      result = await pool.query(
        `SELECT * FROM generated_assets 
         WHERE sale_id = (SELECT sale_id FROM generated_assets ORDER BY created_at DESC LIMIT 1)
         ORDER BY created_at DESC`
      );
    }
    
    if (result.rows.length === 0) {
      return res.json({ success: true, hasAssets: false, results: [] });
    }
    
    const saleName = result.rows[0].sale_name;
    const saleIdResult = result.rows[0].sale_id;
    
    const assets = result.rows.map(row => ({
      type: row.asset_type,
      pickId: row.pick_id,
      filename: row.filename,
      driveFileId: row.drive_file_id,
      driveUrl: row.drive_url,
      success: row.success,
      error: row.error,
      createdAt: row.created_at
    }));
    
    res.json({
      success: true,
      hasAssets: true,
      saleName,
      saleId: saleIdResult,
      generatedAt: result.rows[0].created_at,
      results: assets
    });
    
  } catch (error) {
    console.error('Error fetching generated assets:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

// Get generated assets for a specific sale
app.get('/admin/generated-assets/:saleId', async (req, res) => {
  const { auth } = req.headers;
  const { saleId } = req.params;
  return fetchGeneratedAssets(saleId, res, auth, ADMIN_PASSWORD, pool);
});

// Get most recent generated assets
app.get('/admin/generated-assets', async (req, res) => {
  const { auth } = req.headers;
  return fetchGeneratedAssets(null, res, auth, ADMIN_PASSWORD, pool);
});

// Clear generated assets for a sale
app.delete('/admin/generated-assets/:saleId', async (req, res) => {
  const { auth } = req.headers;
  
  if (auth !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  try {
    const { saleId } = req.params;
    await pool.query('DELETE FROM generated_assets WHERE sale_id = $1', [saleId]);
    res.json({ success: true, message: 'Assets cleared' });
  } catch (error) {
    console.error('Error clearing assets:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========== INSTAGRAM POSTING ENDPOINTS ==========

// Test Instagram connection
app.get('/admin/instagram/test', async (req, res) => {
  const { auth } = req.headers;
  
  if (auth !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  try {
    const result = await testInstagramConnection();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get connected Instagram accounts
app.get('/admin/instagram/accounts', async (req, res) => {
  const { auth } = req.headers;
  
  if (auth !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  try {
    const accounts = await getConnectedAccounts();
    res.json({ success: true, accounts });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Post a single image to Instagram
app.post('/admin/instagram/post', async (req, res) => {
  const { auth } = req.headers;
  
  if (auth !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  try {
    const { imageUrl, caption, isStory } = req.body;
    
    if (!imageUrl) {
      return res.status(400).json({ success: false, message: 'Image URL is required' });
    }
    
    const result = await postToInstagram({ imageUrl, caption, isStory });
    res.json(result);
    
  } catch (error) {
    console.error('Instagram post error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Post a carousel to Instagram
app.post('/admin/instagram/carousel', async (req, res) => {
  const { auth } = req.headers;
  
  if (auth !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  try {
    const { imageUrls, caption } = req.body;
    
    if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length < 2) {
      return res.status(400).json({ success: false, message: 'At least 2 image URLs are required for carousel' });
    }
    
    const result = await postCarouselToInstagram({ imageUrls, caption });
    res.json(result);
    
  } catch (error) {
    console.error('Instagram carousel error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Schedule a post for later
app.post('/admin/instagram/schedule', async (req, res) => {
  const { auth } = req.headers;
  
  if (auth !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  try {
    const { imageUrl, caption, scheduledFor, isStory } = req.body;
    
    if (!imageUrl || !scheduledFor) {
      return res.status(400).json({ success: false, message: 'Image URL and scheduledFor are required' });
    }
    
    const result = await scheduleInstagramPost({ imageUrl, caption, scheduledFor, isStory });
    res.json(result);
    
  } catch (error) {
    console.error('Instagram schedule error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Generate asset AND post to Instagram in one step
app.post('/admin/generate-and-post', async (req, res) => {
  const { auth } = req.headers;
  
  if (auth !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  try {
    const { saleId, mainAsset, storyPicks, caption, postMainAsset, postStories } = req.body;
    
    if (!saleId) {
      return res.status(400).json({ success: false, message: 'Sale ID required' });
    }
    
    console.log(`\n📸 Generating and posting assets for sale ${saleId}...`);
    const results = [];
    
    // Generate main asset if requested
    if (mainAsset) {
      try {
        let assetResult;
        if (mainAsset.type === 'without-picks') {
          assetResult = await generateHeaderOnlyAsset(saleId);
        } else if (mainAsset.type === 'with-picks' && mainAsset.pickIds?.length > 0) {
          assetResult = await generateAssetWithPicks(saleId, mainAsset.pickIds);
        }
        
        if (assetResult && postMainAsset) {
          // Post to Instagram
          const driveUrl = assetResult.driveUrl;
          if (driveUrl) {
            // Convert Google Drive view link to direct download link
            const fileId = driveUrl.match(/\/d\/([^\/]+)/)?.[1];
            const directUrl = fileId ? `https://drive.google.com/uc?export=download&id=${fileId}` : driveUrl;
            
            const postResult = await postToInstagram({ 
              imageUrl: directUrl, 
              caption: caption || '',
              isStory: false 
            });
            results.push({ type: 'main', success: true, ...assetResult, posted: postResult.success, postId: postResult.postId });
          }
        } else if (assetResult) {
          results.push({ type: 'main', success: true, ...assetResult, posted: false });
        }
      } catch (error) {
        console.error('Main asset error:', error);
        results.push({ type: 'main', success: false, error: error.message });
      }
    }
    
    // Generate and optionally post story images
    if (storyPicks && storyPicks.length > 0) {
      for (const pickConfig of storyPicks) {
        try {
          const storyResult = await generatePickStoryWithCopy(pickConfig.pickId, pickConfig.customCopy || '');
          
          if (storyResult && postStories) {
            const fileId = storyResult.driveUrl?.match(/\/d\/([^\/]+)/)?.[1];
            const directUrl = fileId ? `https://drive.google.com/uc?export=download&id=${fileId}` : storyResult.driveUrl;
            
            const postResult = await postToInstagram({ 
              imageUrl: directUrl, 
              isStory: true 
            });
            results.push({ type: 'story', pickId: pickConfig.pickId, success: true, ...storyResult, posted: postResult.success, postId: postResult.postId });
          } else if (storyResult) {
            results.push({ type: 'story', pickId: pickConfig.pickId, success: true, ...storyResult, posted: false });
          }
        } catch (error) {
          console.error(`Story error for pick ${pickConfig.pickId}:`, error);
          results.push({ type: 'story', pickId: pickConfig.pickId, success: false, error: error.message });
        }
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    const postedCount = results.filter(r => r.posted).length;
    
    res.json({
      success: true,
      message: `Generated ${successCount}/${results.length} assets, posted ${postedCount} to Instagram`,
      results
    });
    
  } catch (error) {
    console.error('Generate and post error:', error);
    res.status(500).json({ success: false, message: error.message });
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
  "saleUrl": "https://actual-url-from-email.com/sale",
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
- saleUrl: ONLY use a URL that ACTUALLY appears in the email content. If no sale URL is found in the email, return null. NEVER make up or guess a URL. Do not use example.com or placeholder URLs.
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
      
      // Track rejected email
      await addRejectedEmail({
        brand: saleData.company || 'Unknown',
        subject: subject,
        reason: saleData.error,
        from: from
      });
      
      return res.status(200).json({ 
        success: false, 
        message: saleData.error,
        reasoning: saleData.reasoning,
        from: from,
        subject: subject
      });
    }
    
    // Check for placeholder/example URLs
    const isPlaceholderUrl = (url) => {
      if (!url) return true;
      const placeholderPatterns = [
        /example\.com/i,
        /placeholder/i,
        /test\.com/i,
        /sample\.com/i,
        /fake/i,
        /^https?:\/\/(www\.)?[a-z]+\.com\/sale$/i // Generic patterns like "brand.com/sale"
      ];
      return placeholderPatterns.some(p => p.test(url));
    };
    
    // Flag for missing/placeholder URL
    let missingUrl = false;
    let urlSource = 'email';
    
    // Detect and handle missing/placeholder URLs
    if (!saleData.saleUrl || isPlaceholderUrl(saleData.saleUrl)) {
      console.log('⚠️ Missing or placeholder URL detected, searching for brand homepage...');
      missingUrl = true;
      
      // Try to find brand homepage from Company table
      if (saleData.company) {
        try {
          const normalizedBrandName = saleData.company
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9\s]/g, '')
            .trim();
          
          const companiesResponse = await fetch(
            `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${COMPANY_TABLE_NAME}?fields[]=Name&fields[]=Website`,
            {
              headers: { 'Authorization': `Bearer ${AIRTABLE_PAT}` }
            }
          );
          
          if (companiesResponse.ok) {
            const companiesData = await companiesResponse.json();
            
            // Find matching company
            const match = companiesData.records.find(record => {
              const companyName = (record.fields.Name || '')
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-z0-9\s]/g, '')
                .trim();
              return companyName === normalizedBrandName;
            });
            
            if (match && match.fields.Website) {
              console.log(`✅ Found brand homepage: ${match.fields.Website}`);
              saleData.saleUrl = match.fields.Website;
              urlSource = 'brand_homepage';
            }
          }
        } catch (error) {
          console.error('Error looking up brand homepage:', error.message);
        }
      }
    }
    
    // Validate required fields (company and percentOff required, URL can be null with flag)
    if (!saleData.company || !saleData.percentOff) {
      console.log('❌ Missing required fields:', {
        hasCompany: !!saleData.company,
        hasPercentOff: !!saleData.percentOff
      });
      
      // Track rejected email
      await addRejectedEmail({
        brand: saleData.company || 'Unknown',
        subject: subject,
        reason: 'Missing required fields (company or discount)',
        from: from
      });
      
      return res.status(200).json({ 
        success: false, 
        message: 'Missing required fields',
        extractedData: saleData
      });
    }
    
    // Add missing URL flag to sale data for approval UI
    saleData.missingUrl = missingUrl;
    saleData.urlSource = urlSource;
    
    // IMPROVED: Lower confidence threshold and log borderline cases
    const confidenceThreshold = 60; // Lowered from 70
    if (saleData.confidence && saleData.confidence < confidenceThreshold) {
      console.log(`⚠️  Low confidence (${saleData.confidence}%) - rejecting`);
      console.log('   Reasoning:', saleData.reasoning);
      console.log('   Email from:', from);
      console.log('   Subject:', subject);
      
      // Track rejected email
      await addRejectedEmail({
        brand: saleData.company || 'Unknown',
        subject: subject,
        reason: `Low confidence (${saleData.confidence}%) - ${saleData.reasoning || 'unclear sale details'}`,
        from: from
      });
      
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
        // Track rejected email
        await addRejectedEmail({
          brand: saleData.company,
          subject: subject,
          reason: `Duplicate - similar ${saleData.percentOff}% sale already exists`,
          from: from
        });
        
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
    
    // Check if approvals are enabled
    if (await isApprovalsEnabled()) {
      console.log('⏸️  Approvals enabled - adding to pending sales');
      
      const pendingSale = await addPendingSale({
        company: saleData.company,
        percentOff: saleData.percentOff,
        saleUrl: saleData.saleUrl,
        cleanUrl: cleanUrl,
        discountCode: saleData.discountCode,
        startDate: saleData.startDate,
        endDate: saleData.endDate,
        confidence: saleData.confidence,
        reasoning: saleData.reasoning,
        companyRecordId: companyRecordId,
        emailFrom: from,
        emailSubject: subject,
        missingUrl: saleData.missingUrl,
        urlSource: saleData.urlSource
      });
      
      // Send Telegram alert with approve/reject buttons
      if (TELEGRAM_CHAT_ID) {
        sendSaleApprovalAlert(TELEGRAM_CHAT_ID, {
          id: pendingSale.id,
          company: saleData.company,
          percentOff: saleData.percentOff,
          confidence: saleData.confidence,
          discountCode: saleData.discountCode,
          saleUrl: cleanUrl || saleData.saleUrl,
          emailFrom: from
        }).catch(err => {
          console.error('Failed to send Telegram alert:', err.message);
        });
      }
      
      return res.status(200).json({
        success: true,
        message: 'Sale pending approval',
        pendingSaleId: pendingSale.id,
        requiresApproval: true
      });
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
      
      // Send critical error alert for Airtable failures
      sendCriticalErrorAlert(
        'Airtable API Error',
        `Failed to save sale for ${saleData.company}: ${errorText.substring(0, 100)}`
      );
      
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
    
    // Send critical error alert
    sendCriticalErrorAlert(
      'Email Processing Failed',
      `${error.message} - Check server logs for details`
    );
    
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

// ==================== PENDING SALES APPROVAL API ====================

// Get all pending sales
app.get('/pending-sales', async (req, res) => {
  const { auth } = req.headers;
  
  if (auth !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  try {
    const pending = await getPendingSales();
    res.json({ success: true, sales: pending });
  } catch (error) {
    console.error('Error getting pending sales:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get rejected emails (emails that weren't added to approval queue)
app.get('/rejected-emails', async (req, res) => {
  const { auth } = req.headers;
  
  if (auth !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  try {
    const rejected = await getRejectedEmails();
    const limit = parseInt(req.query.limit) || 5;
    res.json({ success: true, emails: rejected.slice(0, limit) });
  } catch (error) {
    console.error('Error getting rejected emails:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add a manual pending sale
app.post('/pending-sales/manual', async (req, res) => {
  const { auth } = req.headers;
  
  if (auth !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  try {
    const { company, percentOff, saleUrl, discountCode, startDate, endDate } = req.body;
    
    if (!company || !percentOff) {
      return res.status(400).json({ success: false, error: 'Company and percentOff are required' });
    }
    
    const pendingSale = await addPendingSale({
      company,
      percentOff,
      saleUrl: saleUrl || null,
      cleanUrl: saleUrl || null,
      discountCode: discountCode || null,
      startDate: startDate || new Date().toISOString().split('T')[0],
      endDate: endDate || null,
      confidence: 100,
      reasoning: 'Manually added sale',
      companyRecordId: null,
      emailFrom: 'manual entry',
      emailSubject: 'Manual sale entry',
      missingUrl: !saleUrl,
      urlSource: saleUrl ? 'manual' : 'none'
    });
    
    console.log(`✅ Manual sale added: ${company} - ${percentOff}% off`);
    
    res.json({ success: true, sale: pendingSale });
  } catch (error) {
    console.error('Error adding manual sale:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add a sale directly to Airtable (bypasses pending queue)
app.post('/sales/add-direct', async (req, res) => {
  const { auth } = req.headers;
  
  if (auth !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  try {
    const { company, percentOff, saleUrl, discountCode, startDate, endDate } = req.body;
    
    if (!company || !percentOff) {
      return res.status(400).json({ success: false, error: 'Company and percentOff are required' });
    }
    
    console.log(`💾 Adding sale directly to Airtable: ${company} - ${percentOff}% off`);
    
    // Find or create company record (same logic as email automation)
    console.log('🔗 Looking up or creating Company record...');
    const companyRecordId = await findOrCreateCompany(company);
    if (companyRecordId) {
      console.log(`✅ Company record: ${companyRecordId}`);
    } else {
      console.log('⚠️  Could not find or create company record');
    }
    
    // Create Airtable record
    const airtableUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE_NAME}`;
    
    const today = new Date().toISOString().split('T')[0];
    const saleStartDate = startDate || today;
    const isLive = saleStartDate <= today ? 'YES' : 'NO';
    
    const fields = {
      OriginalCompanyName: company,
      PercentOff: Number(percentOff),
      StartDate: saleStartDate,
      Confidence: 100,
      Live: isLive,
      Description: JSON.stringify({
        source: 'manual',
        addedAt: new Date().toISOString()
      })
    };
    
    if (saleUrl) {
      fields.SaleURL = saleUrl;
      fields.CleanURL = saleUrl;
    }
    
    if (companyRecordId) {
      fields.Company = [companyRecordId];
    }
    
    if (discountCode) {
      fields.PromoCode = discountCode;
    }
    
    if (endDate) {
      fields.EndDate = endDate;
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
      throw new Error(`Failed to create Airtable record: ${errorText}`);
    }
    
    const airtableData = await airtableResponse.json();
    console.log('✅ Created Airtable record:', airtableData.id);
    
    // Clear sales cache
    clearSalesCache();
    
    res.json({ 
      success: true, 
      message: 'Sale added to site',
      recordId: airtableData.id
    });
    
  } catch (error) {
    console.error('Error adding sale directly:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Check for duplicate sales in Airtable
app.post('/check-duplicates/:id', async (req, res) => {
  const { auth } = req.headers;
  
  if (auth !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  try {
    const { id } = req.params;
    const pendingSales = await getPendingSales();
    const pendingSale = pendingSales.find(s => s.id === id);
    
    if (!pendingSale) {
      return res.status(404).json({ success: false, error: 'Sale not found' });
    }
    
    // Check for duplicates in Airtable
    const normalizedCompany = pendingSale.company.toLowerCase().trim();
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const filterFormula = `AND(
      {StartDate} >= '${twoWeeksAgo}',
      OR(
        FIND(LOWER("${normalizedCompany}"), LOWER({OriginalCompanyName})),
        FIND(LOWER({OriginalCompanyName}), LOWER("${normalizedCompany}"))
      )
    )`;
    
    const duplicatesUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE_NAME}?filterByFormula=${encodeURIComponent(filterFormula)}`;
    
    const response = await fetch(duplicatesUrl, {
      headers: { 'Authorization': `Bearer ${AIRTABLE_PAT}` }
    });
    
    if (!response.ok) {
      throw new Error('Failed to check duplicates');
    }
    
    const data = await response.json();
    
    // Filter for sales with similar discount percentage (within 5%)
    const duplicates = data.records.filter(record => {
      const recordPercent = record.fields.PercentOff;
      return Math.abs(recordPercent - pendingSale.percentOff) <= 5;
    }).map(record => ({
      id: record.id,
      company: record.fields.OriginalCompanyName,
      percentOff: record.fields.PercentOff,
      startDate: record.fields.StartDate,
      endDate: record.fields.EndDate,
      saleUrl: record.fields.SaleURL
    }));
    
    res.json({ 
      success: true, 
      duplicates
    });
    
  } catch (error) {
    console.error('Error checking duplicates:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Approve a pending sale (move to Airtable)
app.post('/approve-sale/:id', async (req, res) => {
  const { auth } = req.headers;
  
  if (auth !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  try {
    const { id } = req.params;
    const { replaceSaleId } = req.body;
    const pendingSale = await removePendingSale(id);
    
    if (!pendingSale) {
      return res.status(404).json({ success: false, error: 'Sale not found' });
    }
    
    console.log(`✅ Approving sale: ${pendingSale.company} ${pendingSale.percentOff}%`);
    
    // If replacing an existing sale, delete it first
    if (replaceSaleId) {
      console.log(`🔄 Replacing existing sale: ${replaceSaleId}`);
      const deleteUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE_NAME}/${replaceSaleId}`;
      
      const deleteResponse = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${AIRTABLE_PAT}`
        }
      });
      
      if (!deleteResponse.ok) {
        console.error('⚠️  Failed to delete old sale, continuing with approval');
      } else {
        console.log('✅ Deleted old sale successfully');
      }
    }
    
    // Create Airtable record
    const airtableUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE_NAME}`;
    
    const today = new Date().toISOString().split('T')[0];
    const isLive = pendingSale.startDate <= today ? 'YES' : 'NO';
    
    const fields = {
      OriginalCompanyName: pendingSale.company,
      PercentOff: pendingSale.percentOff,
      SaleURL: pendingSale.saleUrl,
      CleanURL: pendingSale.cleanUrl,
      StartDate: pendingSale.startDate,
      Confidence: pendingSale.confidence || 60,
      Live: isLive,
      Description: JSON.stringify({
        source: 'email',
        aiReasoning: pendingSale.reasoning,
        confidence: pendingSale.confidence,
        originalEmail: {
          from: pendingSale.emailFrom,
          subject: pendingSale.emailSubject,
          receivedAt: pendingSale.receivedAt
        },
        approved: true,
        approvedAt: new Date().toISOString()
      })
    };
    
    if (pendingSale.companyRecordId) {
      fields.Company = [pendingSale.companyRecordId];
    }
    
    if (pendingSale.discountCode) {
      fields.PromoCode = pendingSale.discountCode;
    }
    if (pendingSale.endDate) {
      fields.EndDate = pendingSale.endDate;
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
      return res.status(500).json({ 
        success: false, 
        error: 'Airtable error',
        details: errorText
      });
    }
    
    const airtableData = await airtableResponse.json();
    console.log('✅ Created Airtable record:', airtableData.id);
    
    // Clear sales cache
    clearSalesCache();
    
    res.json({ 
      success: true, 
      message: 'Sale approved and added to Airtable',
      recordId: airtableData.id
    });
    
  } catch (error) {
    console.error('Error approving sale:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Reject a pending sale (delete it)
app.post('/reject-sale/:id', async (req, res) => {
  const { auth } = req.headers;
  
  if (auth !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  try {
    const { id } = req.params;
    const pendingSale = await removePendingSale(id);
    
    if (!pendingSale) {
      return res.status(404).json({ success: false, error: 'Sale not found' });
    }
    
    console.log(`❌ Rejected sale: ${pendingSale.company} ${pendingSale.percentOff}%`);
    
    res.json({ 
      success: true, 
      message: 'Sale rejected',
      sale: pendingSale
    });
    
  } catch (error) {
    console.error('Error rejecting sale:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get approval settings
app.get('/approval-settings', async (req, res) => {
  const { auth } = req.headers;
  
  if (auth !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  try {
    const settings = await getApprovalSettings();
    res.json({ success: true, settings });
  } catch (error) {
    console.error('Error getting approval settings:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update approval settings
app.post('/approval-settings', async (req, res) => {
  const { auth } = req.headers;
  
  if (auth !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  try {
    const { approvalsEnabled } = req.body;
    
    if (typeof approvalsEnabled !== 'boolean') {
      return res.status(400).json({ 
        success: false, 
        error: 'approvalsEnabled must be a boolean' 
      });
    }
    
    await setApprovalsEnabled(approvalsEnabled);
    console.log(`⚙️  Approval mode ${approvalsEnabled ? 'ENABLED' : 'DISABLED'}`);
    
    res.json({ 
      success: true, 
      message: `Approvals ${approvalsEnabled ? 'enabled' : 'disabled'}`,
      settings: { approvalsEnabled }
    });
    
  } catch (error) {
    console.error('Error updating approval settings:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// MANUAL PICK DRAFTS API
// ============================================

// Get all drafts
app.get('/admin/manual-picks/drafts', async (req, res) => {
  const { auth } = req.headers;
  
  if (auth !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  try {
    const drafts = await getAllDrafts();
    res.json({ success: true, drafts });
  } catch (error) {
    console.error('Error getting drafts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get a specific draft
app.get('/admin/manual-picks/drafts/:id', async (req, res) => {
  const { auth } = req.headers;
  
  if (auth !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  try {
    const { id } = req.params;
    const draft = await getDraftById(id);
    
    if (!draft) {
      return res.status(404).json({ success: false, error: 'Draft not found' });
    }
    
    res.json({ success: true, draft });
  } catch (error) {
    console.error('Error getting draft:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Save or update a draft
app.post('/admin/manual-picks/drafts', async (req, res) => {
  const { auth } = req.headers;
  
  if (auth !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  try {
    const { id, saleId, saleName, salePercentOff, picks } = req.body;
    
    if (!saleId || !saleName || !picks || !Array.isArray(picks)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: saleId, saleName, picks' 
      });
    }
    
    // Validate that at least one pick has a URL
    if (!picks.some(p => p.url && p.url.trim())) {
      return res.status(400).json({ 
        success: false, 
        error: 'At least one pick must have a URL' 
      });
    }
    
    const savedDraft = await saveDraft({
      id,
      saleId,
      saleName,
      salePercentOff,
      picks
    });
    
    console.log(`💾 ${id ? 'Updated' : 'Created'} draft for sale: ${saleName}`);
    
    res.json({ 
      success: true, 
      message: id ? 'Draft updated' : 'Draft saved',
      draft: savedDraft
    });
    
  } catch (error) {
    console.error('Error saving draft:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete a draft
app.delete('/admin/manual-picks/drafts/:id', async (req, res) => {
  const { auth } = req.headers;
  
  if (auth !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  try {
    const { id } = req.params;
    const deleted = await deleteDraft(id);
    
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Draft not found' });
    }
    
    console.log(`🗑️  Deleted draft: ${id}`);
    
    res.json({ 
      success: true, 
      message: 'Draft deleted'
    });
    
  } catch (error) {
    console.error('Error deleting draft:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// FINALIZE DRAFTS ENDPOINTS
// ============================================

// Get all finalize drafts
app.get('/admin/finalize-drafts', async (req, res) => {
  const { auth } = req.headers;
  if (auth !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  try {
    const drafts = await getAllFinalizeDrafts();
    res.json({ success: true, drafts });
  } catch (error) {
    console.error('Error getting finalize drafts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Save finalize draft
app.post('/admin/finalize-drafts', async (req, res) => {
  const { auth } = req.headers;
  if (auth !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  try {
    const draft = await saveFinalizeDraft(req.body);
    res.json({ success: true, draft });
  } catch (error) {
    console.error('Error saving finalize draft:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete finalize draft
app.delete('/admin/finalize-drafts/:id', async (req, res) => {
  const { auth } = req.headers;
  if (auth !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  try {
    const deleted = await deleteFinalizeDraft(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Draft not found' });
    }
    res.json({ success: true, message: 'Draft deleted' });
  } catch (error) {
    console.error('Error deleting finalize draft:', error);
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

// Background job to auto-detect incomplete companies and research them
async function checkForIncompleteBrands() {
  try {
    console.log('🔍 Checking for incomplete brands...');
    
    const response = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${COMPANY_TABLE_NAME}`, {
      headers: {
        'Authorization': `Bearer ${AIRTABLE_PAT}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`Airtable fetch failed: ${response.status}`);
    }
    
    const data = await response.json();
    const companies = data.records;
    
    const pendingBrands = await getPendingBrands();
    const pendingNames = new Set(pendingBrands.map(b => b.name.toLowerCase()));
    
    // Also check rejected brands to avoid re-researching them
    const rejectedBrands = await getRejectedBrands();
    const rejectedNames = new Set(rejectedBrands.map(b => b.name.toLowerCase()));
    
    for (const company of companies) {
      const fields = company.fields;
      const name = fields.Name;
      
      if (!name || pendingNames.has(name.toLowerCase())) continue;
      
      // Skip rejected brands - don't re-research
      if (rejectedNames.has(name.toLowerCase())) {
        continue;
      }
      
      // Skip shops - only auto-research brands
      const companyType = fields.Type;
      if (companyType === 'Shop') {
        continue;
      }
      
      // Skip brands that are already approved (Priority = 'High')
      const isAlreadyApproved = fields.Priority === 'High';
      if (isAlreadyApproved) {
        // Uncomment for debugging: console.log(`⏭️ Skipping ${name} (already Priority='High')`);
        continue;
      }
      
      const isIncomplete = !fields.PriceRange || !fields.Category || !fields.Description;
      
      if (isIncomplete) {
        console.log(`📋 Found incomplete brand: ${name}, triggering research...`);
        
        try {
          const researchResponse = await fetch('http://localhost:3001/admin/brand-research', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'auth': ADMIN_PASSWORD
            },
            body: JSON.stringify({ brandName: name })
          });
          
          if (researchResponse.ok) {
            const result = await researchResponse.json();
            
            // Check if research was successful and returned brand data
            if (!result.success || !result.brand) {
              console.log(`⚠️  Research for ${name} returned no data: ${result.error || 'Unknown error'}`);
              continue;
            }
            
            await addPendingBrand({
              name: name,
              airtableRecordId: company.id,
              type: result.brand.type,
              priceRange: result.brand.priceRange,
              category: result.brand.category,
              values: result.brand.values,
              maxWomensSize: result.brand.maxWomensSize,
              sizingSource: result.brand.sizingSource,
              description: result.brand.description,
              notes: result.brand.notes,
              url: result.brand.url,
              qualityScore: result.qualityScore
            });
            
            console.log(`✅ Researched and queued ${name} for approval (${result.qualityScore}% quality)`);
            
            // Send Telegram notification for new brand
            if (TELEGRAM_CHAT_ID) {
              const brandAlert = `🏷️ *New Brand Researched*\n\n` +
                `*${name}*\n` +
                `Quality: ${result.qualityScore}%\n` +
                `Price: ${result.brand.priceRange || 'N/A'}\n` +
                `Category: ${result.brand.category || 'N/A'}\n` +
                (result.brand.url ? `🔗 ${result.brand.url}\n` : '') +
                `\n_Review in Admin → Add Brands_`;
              
              sendAlertToTelegram(TELEGRAM_CHAT_ID, brandAlert).catch(err => {
                console.error('Failed to send brand Telegram alert:', err.message);
              });
            }
          }
        } catch (error) {
          console.error(`❌ Failed to research ${name}:`, error.message);
        }
      }
    }
  } catch (error) {
    console.error('❌ Auto-detection failed:', error.message);
  }
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Webhook server running on port ${PORT}`);
  console.log(`📬 AgentMail webhook endpoint: http://0.0.0.0:${PORT}/webhook/agentmail`);
  console.log(`📦 Serving React build from: ${buildPath}`);
  
  // Pre-fetch companies to cache for brand auto-fill logic
  fetchCompanies().then(companies => {
    console.log(`✅ Cached ${companies.length} companies for brand auto-fill`);
  }).catch(err => {
    console.warn('⚠️  Failed to pre-fetch companies:', err.message);
  });
  
  // Run initial brand auto-detection
  checkForIncompleteBrands();
  
  // Run brand auto-detection every 15 minutes
  setInterval(checkForIncompleteBrands, 15 * 60 * 1000);
  
  if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
    console.log('📱 Initializing Telegram bot...');
    
    // Handler for Telegram button callbacks (approve/reject sales)
    const handleTelegramApproval = async (action, saleId) => {
      try {
        console.log(`📱 Telegram ${action} request for sale: ${saleId}`);
        
        if (action === 'approve') {
          // Get the pending sale
          const pendingSales = await getPendingSales();
          const sale = pendingSales.find(s => s.id === saleId);
          
          if (!sale) {
            return { success: false, error: 'Sale not found or already processed' };
          }
          
          // Add to Airtable
          const today = new Date().toISOString().split('T')[0];
          const isLive = sale.startDate <= today ? 'YES' : 'NO';
          
          const fields = {
            OriginalCompanyName: sale.company,
            PercentOff: sale.percentOff,
            StartDate: sale.startDate,
            Confidence: sale.confidence || 100,
            Live: isLive,
            Description: JSON.stringify({
              source: 'email',
              approvedVia: 'telegram',
              approvedAt: new Date().toISOString()
            })
          };
          
          if (sale.saleUrl) {
            fields.SaleURL = sale.saleUrl;
            fields.CleanURL = sale.cleanUrl || sale.saleUrl;
          }
          if (sale.companyRecordId) {
            fields.Company = [sale.companyRecordId];
          }
          if (sale.discountCode) {
            fields.PromoCode = sale.discountCode;
          }
          if (sale.endDate) {
            fields.EndDate = sale.endDate;
          }
          
          const airtableUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE_NAME}`;
          const response = await fetch(airtableUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${AIRTABLE_PAT}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ fields })
          });
          
          if (!response.ok) {
            const errorText = await response.text();
            return { success: false, error: errorText };
          }
          
          // Remove from pending
          await removePendingSale(saleId);
          clearSalesCache();
          
          console.log(`✅ Sale approved via Telegram: ${sale.company}`);
          return { success: true };
          
        } else if (action === 'reject') {
          // Just remove from pending
          const sale = await removePendingSale(saleId);
          if (!sale) {
            return { success: false, error: 'Sale not found or already processed' };
          }
          
          console.log(`❌ Sale rejected via Telegram: ${sale.company}`);
          return { success: true };
        }
        
        return { success: false, error: 'Unknown action' };
      } catch (error) {
        console.error('Telegram approval error:', error);
        return { success: false, error: error.message };
      }
    };
    
    initializeTelegramBot(TELEGRAM_BOT_TOKEN, handleTelegramApproval);
    console.log('📸 Story generation via webhook: /webhook/airtable-story');
    console.log('   (Polling disabled - use Airtable Automation to trigger)');
    // Polling watcher disabled - now using webhook-based triggering from Airtable
    // startStoryWatcher();
  } else {
    console.log('⚠️  Telegram not configured - story generation disabled');
    console.log('   Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to enable');
  }
});
