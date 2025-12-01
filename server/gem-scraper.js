// DIAGNOSTIC GEM SCRAPER - AUTH FILE VERSION
// This version uses your saved cookie to log in instantly

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getChromiumPath() {
  try {
    return execSync('which chromium', { encoding: 'utf-8' }).trim();
  } catch {
    return null;
  }
}

// CONFIGURATION
const AUTH_FILE = path.join(__dirname, 'gem-auth.json');
const MARKER_FILE = path.join(__dirname, 'gem-sync-state.json');
const AIRTABLE_PAT = process.env.AIRTABLE_PAT;

// Auto-detect environment and use appropriate Airtable base
const isProduction = !!process.env.REPLIT_DEPLOYMENT;
const AIRTABLE_BASE_ID = isProduction 
  ? process.env.AIRTABLE_BASE_ID 
  : (process.env.AIRTABLE_BASE_ID_DEV || process.env.AIRTABLE_BASE_ID);

const GEM_TABLE_NAME = 'Gem';

// --- HELPER FUNCTIONS ---

function readMarker() {
  try {
    if (fs.existsSync(MARKER_FILE)) {
      const data = fs.readFileSync(MARKER_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.log('⚠️  Could not read marker file:', error.message);
  }
  return { lastItemId: null, lastSyncDate: null };
}

function writeMarker(itemId) {
  try {
    const data = {
      lastItemId: itemId,
      lastSyncDate: new Date().toISOString()
    };
    fs.writeFileSync(MARKER_FILE, JSON.stringify(data, null, 2));
    console.log('📝 Updated marker file with item ID:', itemId);
  } catch (error) {
    console.error('❌ Failed to write marker file:', error.message);
  }
}

async function saveItemsToAirtable(items) {
  if (items.length === 0) {
    console.log('⚠️  No items to save to Airtable');
    return { success: true, count: 0 };
  }

  try {
    console.log(`💾 Saving ${items.length} items to Airtable...`);

    const records = items.map(item => ({
      fields: {
        ProductName: item.name,
        ProductURL: item.url,
        Brand: item.brand,
        Price: item.price,
        Size: item.size,
        ImageURL: item.imageUrl,
        DateSaved: item.dateSaved,
        Marketplace: item.marketplace
      }
    }));

    const BATCH_SIZE = 10;
    const savedRecords = [];

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);

      const response = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${GEM_TABLE_NAME}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${AIRTABLE_PAT}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ records: batch })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Airtable API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      savedRecords.push(...result.records);
      console.log(`✅ Saved batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} items)`);
    }

    console.log(`✅ Successfully saved ${savedRecords.length} items to Airtable`);
    return { success: true, count: savedRecords.length };

  } catch (error) {
    console.error('❌ Failed to save items to Airtable:', error.message);
    return { success: false, error: error.message, count: 0 };
  }
}

// --- MAIN SCRAPER FUNCTION ---

export async function scrapeGemItems(magicLink, options = {}) {
  const {
    maxItems = 5,
    logger = console
  } = options;

  let browser;
  let context;
  let page;

  try {
    logger.log('💎 Starting Gem Scraper (Auth File Mode)...');

    // Check if we have the auth file
    if (!fs.existsSync(AUTH_FILE)) {
      throw new Error(`Auth file not found at ${AUTH_FILE}. Please create gem-auth.json first.`);
    }

    logger.log('📂 Found gem-auth.json - injecting cookies...');

    const chromiumPath = getChromiumPath();
    logger.log(`🌐 Using Chromium at: ${chromiumPath || 'bundled'}`);

    browser = await chromium.launch({
      headless: true,
      executablePath: chromiumPath || undefined,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage'
      ]
    });

    // Create browser context WITH the saved cookies
    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      storageState: AUTH_FILE // <--- THIS IS THE MAGIC KEY
    });

    // Anti-bot detection
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    page = await context.newPage();

    // DIRECT NAVIGATION - Skip the magic link, go straight to items
    logger.log('📍 Navigating directly to https://gem.app/items ...');

    const response = await page.goto('https://gem.app/items', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    // Wait a moment for React/Next.js to hydrate
    await page.waitForTimeout(3000);

    // Check if we are actually logged in
    const title = await page.title();
    const url = page.url();
    logger.log(`   Current URL: ${url}`);
    logger.log(`   Page Title: ${title}`);

    if (url.includes('emailLogIn') || title.toLowerCase().includes('log in')) {
        await page.screenshot({ path: 'auth-failed.png' });
        throw new Error('❌ Auth failed. The cookie in gem-auth.json might be expired. Please get a fresh cookie.');
    }

    logger.log('✅ Authentication successful! We are inside.');

    // Extract items
    logger.log('📍 Extracting items...');

    // Try to wait for items to load
    try {
        await page.waitForSelector('article, [data-testid*="item"]', { timeout: 5000 });
    } catch(e) {
        logger.log('⚠️ Timed out waiting for items, trying to scrape anyway...');
    }

    const items = await page.evaluate((maxItems) => {
      const results = [];
      const selectors = [
        'article',
        '[data-testid*="item"]',
        'a[href*="/item/"]'
      ];

      let elements = [];
      for (const selector of selectors) {
        elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          console.log(`Found ${elements.length} items with: ${selector}`);
          break;
        }
      }

      if (elements.length === 0) return [];

      for (let i = 0; i < Math.min(elements.length, maxItems); i++) {
        const element = elements[i];

        const link = element.querySelector('a') || (element.tagName === 'A' ? element : null);
        const img = element.querySelector('img');
        const title = element.querySelector('h1, h2, h3, h4');

        if (link || img) {
          results.push({
            url: link?.href || '',
            imageUrl: img?.src || '',
            name: title?.textContent?.trim() || 'Unnamed Item',
            brand: '',
            price: '',
            size: '',
            dateSaved: new Date().toISOString().split('T')[0],
            marketplace: 'Gem'
          });
        }
      }

      return results;
    }, maxItems);

    logger.log(`✅ Extracted ${items.length} items`);

    if (items.length > 0) {
      logger.log('📝 Sample item:', items[0]);
    }

    // Save to Airtable
    const saveResult = await saveItemsToAirtable(items);

    await browser.close();

    return {
      success: true,
      message: `Successfully scraped ${items.length} items`,
      itemsScraped: items.length,
      itemsSaved: saveResult.count,
      items: items
    };

  } catch (error) {
    logger.error('❌ Scraper error:', error.message);

    if (page) {
        try {
            await page.screenshot({ path: 'error-state.png' });
        } catch(e) {}
    }

    if (browser) {
      await browser.close();
    }

    return {
      success: false,
      error: error.message,
      itemsScraped: 0,
      itemsSaved: 0,
      items: []
    };
  }
}