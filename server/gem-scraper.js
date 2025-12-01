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

    const records = items.map(item => {
      const fields = {
        ProductName: item.name,
        ProductURL: item.url,
        Brand: item.brand,
        ImageURL: item.imageUrl,
        DateSaved: item.dateSaved,
        Marketplace: item.marketplace
      };
      
      // Only include Price if it's a valid number
      if (item.price && !isNaN(parseFloat(item.price))) {
        fields.Price = parseFloat(item.price);
      }
      
      // Only include Size if it's not empty
      if (item.size && item.size.trim()) {
        fields.Size = item.size.trim();
      }
      
      return { fields };
    });

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
    maxItems = null,  // null = scrape all new items since last sync
    logger = console,
    diagnostic = false
  } = options;
  
  // Read the marker to get last synced item URL
  const marker = readMarker();
  const lastSyncedUrl = marker.lastItemId;  // We store the first item's URL as the marker
  logger.log(`📌 Last synced item: ${lastSyncedUrl || 'None (first sync)'}`);
  

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

    // DIRECT NAVIGATION - Skip the magic link, go straight to saved items
    logger.log('📍 Navigating directly to https://gem.app/saved ...');

    const response = await page.goto('https://gem.app/saved', {
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

    // DIAGNOSTIC MODE: Take screenshots and capture page info
    if (diagnostic) {
      logger.log('🔬 DIAGNOSTIC MODE ENABLED');
      
      // Take screenshot
      const screenshotPath = path.join(__dirname, 'gem-diagnostic.png');
      await page.screenshot({ path: screenshotPath, fullPage: true });
      logger.log(`📸 Screenshot saved to: ${screenshotPath}`);
      
      // Wait longer for content to load
      await page.waitForTimeout(3000);
      
      // Get page info
      const pageInfo = await page.evaluate(() => {
        const allElements = document.querySelectorAll('*');
        const links = document.querySelectorAll('a[href*="/item"]');
        const articles = document.querySelectorAll('article');
        const images = document.querySelectorAll('img');
        const divs = document.querySelectorAll('div');
        
        // Get a sample of the body HTML (first 5000 chars)
        const bodyHTML = document.body.innerHTML.substring(0, 5000);
        
        // Find any elements that might be item containers
        const potentialItems = [];
        divs.forEach((div, i) => {
          if (i < 20) {
            const classes = div.className || '';
            const dataAttrs = Array.from(div.attributes)
              .filter(a => a.name.startsWith('data-'))
              .map(a => `${a.name}="${a.value}"`);
            if (classes.includes('item') || classes.includes('card') || classes.includes('product') || dataAttrs.length > 0) {
              potentialItems.push({
                tag: div.tagName,
                classes: classes.substring(0, 100),
                dataAttrs: dataAttrs.slice(0, 3)
              });
            }
          }
        });
        
        return {
          totalElements: allElements.length,
          linkCount: links.length,
          articleCount: articles.length,
          imageCount: images.length,
          divCount: divs.length,
          potentialItems,
          bodyPreview: bodyHTML,
          documentTitle: document.title
        };
      });
      
      logger.log('📊 PAGE ANALYSIS:');
      logger.log(`   Total elements: ${pageInfo.totalElements}`);
      logger.log(`   Links with /item: ${pageInfo.linkCount}`);
      logger.log(`   Articles: ${pageInfo.articleCount}`);
      logger.log(`   Images: ${pageInfo.imageCount}`);
      logger.log(`   Divs: ${pageInfo.divCount}`);
      logger.log(`   Document title: ${pageInfo.documentTitle}`);
      
      if (pageInfo.potentialItems.length > 0) {
        logger.log('   Potential item containers:');
        pageInfo.potentialItems.forEach((item, i) => {
          logger.log(`     ${i+1}. ${item.tag} class="${item.classes}" ${item.dataAttrs.join(' ')}`);
        });
      }
      
      // Save body preview to file for inspection
      const htmlPath = path.join(__dirname, 'gem-diagnostic.html');
      fs.writeFileSync(htmlPath, pageInfo.bodyPreview);
      logger.log(`📄 HTML preview saved to: ${htmlPath}`);
    }

    // Extract items
    logger.log('📍 Extracting items...');

    // Try to wait for items to load - Gem uses .productLink class for items
    try {
        await page.waitForSelector('a.productLink, a[href*="/product/"]', { timeout: 10000 });
    } catch(e) {
        logger.log('⚠️ Timed out waiting for items, trying to scrape anyway...');
    }

    const items = await page.evaluate(({ maxItems, lastSyncedUrl }) => {
      const results = [];
      
      // Gem.app uses .productLink class for saved items
      const selectors = [
        'a.productLink',
        'a[href*="/product/"]'
      ];

      let elements = [];
      for (const selector of selectors) {
        elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          console.log(`Found ${elements.length} items with: ${selector}`);
          break;
        }
      }

      if (elements.length === 0) return results;

      const limit = maxItems || elements.length; // If no maxItems, get all
      
      for (let i = 0; i < Math.min(elements.length, limit); i++) {
        const element = elements[i];

        // The link IS the product container on Gem
        const url = element.href || '';
        
        // Stop if we've reached an item we've already synced
        if (lastSyncedUrl && url === lastSyncedUrl) {
          console.log(`Found previously synced item, stopping.`);
          break;
        }
        
        const img = element.querySelector('img');
        const title = element.querySelector('h3');

        // Extract brand from title (usually first word before space)
        const titleText = title?.textContent?.trim() || 'Unnamed Item';
        const brandMatch = titleText.match(/^([A-Za-z]+)\s/);
        const brand = brandMatch ? brandMatch[1] : '';

        if (url || img) {
          results.push({
            url: url,
            imageUrl: img?.src || img?.getAttribute('data-src') || '',
            name: titleText,
            brand: brand,
            price: '',
            size: '',
            dateSaved: new Date().toISOString().split('T')[0],
            marketplace: 'Gem'
          });
        }
      }

      return results;
    }, { maxItems, lastSyncedUrl });

    logger.log(`✅ Extracted ${items.length} items from saved page`);
    
    if (items.length === 0) {
      logger.log('ℹ️  No new items to sync');
      await browser.close();
      return {
        success: true,
        message: 'No new items to sync',
        itemsScraped: 0,
        itemsSaved: 0,
        items: []
      };
    }
    
    // Store the first item's Gem URL as the marker (before we replace with external URL)
    const firstItemGemUrl = items[0]?.url;

    // Now visit each product page to get the actual external URL and price
    logger.log('🔍 Fetching details from each product page...');
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.url) continue;
      
      try {
        logger.log(`   [${i+1}/${items.length}] Fetching ${item.name.substring(0, 40)}...`);
        
        await page.goto(item.url, {
          waitUntil: 'domcontentloaded',
          timeout: 15000
        });
        
        await page.waitForTimeout(2000);
        
        // Extract external URL and price from product page
        const details = await page.evaluate(() => {
          // Find external marketplace link - check for direct links first
          const allLinks = Array.from(document.querySelectorAll('a[href]'));
          const marketplaces = ['therealreal', 'poshmark', 'ebay', 'vestiaire', 'depop', 'grailed', 'mercari', 'tradesy', 'rebag', 'fashionphile', 'etsy', '1stdibs'];
          
          let externalUrl = '';
          let gemGoUrl = '';
          
          for (const link of allLinks) {
            const href = link.href || '';
            // Check for direct marketplace links
            if (marketplaces.some(m => href.toLowerCase().includes(m))) {
              externalUrl = href;
              break;
            }
            // Also capture /go/ redirect links as fallback
            if (href.includes('gem.app/go/')) {
              gemGoUrl = href;
            }
          }
          
          // Find price - look for $ followed by numbers
          let price = '';
          const priceRegex = /\$\s*([\d,]+(?:\.\d{2})?)/;
          
          // Check specific elements first
          const priceElements = document.querySelectorAll('[class*="price"], [class*="Price"]');
          for (const el of priceElements) {
            const match = el.textContent?.match(priceRegex);
            if (match) {
              price = match[1].replace(',', '');
              break;
            }
          }
          
          // If not found, search all text nodes
          if (!price) {
            const bodyText = document.body.innerText;
            const match = bodyText.match(priceRegex);
            if (match) {
              price = match[1].replace(',', '');
            }
          }
          
          return { externalUrl, gemGoUrl, price };
        });
        
        let finalUrl = details.externalUrl;
        
        // If no direct external URL found but we have a /go/ redirect, follow it
        if (!finalUrl && details.gemGoUrl) {
          logger.log(`      ↳ Following redirect...`);
          try {
            await page.goto(details.gemGoUrl, {
              waitUntil: 'domcontentloaded',
              timeout: 15000
            });
            await page.waitForTimeout(1500);
            finalUrl = page.url();
          } catch (e) {
            logger.log(`      ⚠️ Redirect failed: ${e.message}`);
          }
        }
        
        // Determine marketplace from final URL
        let marketplace = 'Unknown';
        if (finalUrl) {
          if (finalUrl.includes('therealreal')) marketplace = 'The RealReal';
          else if (finalUrl.includes('poshmark')) marketplace = 'Poshmark';
          else if (finalUrl.includes('ebay')) marketplace = 'eBay';
          else if (finalUrl.includes('vestiaire')) marketplace = 'Vestiaire Collective';
          else if (finalUrl.includes('depop')) marketplace = 'Depop';
          else if (finalUrl.includes('grailed')) marketplace = 'Grailed';
          else if (finalUrl.includes('mercari')) marketplace = 'Mercari';
          else if (finalUrl.includes('tradesy')) marketplace = 'Tradesy';
          else if (finalUrl.includes('rebag')) marketplace = 'Rebag';
          else if (finalUrl.includes('fashionphile')) marketplace = 'Fashionphile';
          else if (finalUrl.includes('etsy')) marketplace = 'Etsy';
          else if (finalUrl.includes('1stdibs')) marketplace = '1stDibs';
        }
        
        // Update item with details
        if (finalUrl && !finalUrl.includes('gem.app')) {
          item.url = finalUrl;
        }
        if (details.price) {
          item.price = details.price;
        }
        if (marketplace !== 'Unknown') {
          item.marketplace = marketplace;
        }
        
        logger.log(`      → $${details.price || 'N/A'} from ${marketplace}`);
        
      } catch (err) {
        logger.log(`      ⚠️ Failed to fetch details: ${err.message}`);
      }
    }

    if (items.length > 0) {
      logger.log('📝 Sample item with details:', items[0]);
    }

    // Save to Airtable
    const saveResult = await saveItemsToAirtable(items);
    
    // Update the marker with the first (newest) item's Gem URL
    if (saveResult.success && saveResult.count > 0 && firstItemGemUrl) {
      writeMarker(firstItemGemUrl);
      logger.log(`📌 Updated sync marker to: ${firstItemGemUrl}`);
    }

    await browser.close();

    return {
      success: true,
      message: `Successfully scraped ${items.length} new items`,
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