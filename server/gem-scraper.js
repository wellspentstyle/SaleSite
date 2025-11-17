import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MARKER_FILE = path.join(__dirname, 'gem-sync-state.json');
const AIRTABLE_PAT = process.env.AIRTABLE_PAT;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const GEM_TABLE_NAME = 'Gem';

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
        console.error('❌ Airtable error:', errorText);
        throw new Error(`Airtable error: ${response.status}`);
      }

      const data = await response.json();
      savedRecords.push(...data.records);
      console.log(`✅ Saved batch ${Math.floor(i / BATCH_SIZE) + 1}: ${data.records.length} items`);
    }

    console.log(`✅ Total saved to Airtable: ${savedRecords.length} items`);
    return { success: true, count: savedRecords.length };

  } catch (error) {
    console.error('❌ Error saving to Airtable:', error.message);
    return { success: false, error: error.message };
  }
}

export async function scrapeGemItems(magicLink, options = {}) {
  const { maxItems = 5, logger = console } = options;
  
  logger.log('🚀 Starting Gem scraper...');
  logger.log(`📧 Using magic link authentication`);
  logger.log(`🔢 Max items to scrape: ${maxItems}`);

  const marker = readMarker();
  logger.log('📍 Last synced item ID:', marker.lastItemId || 'none (first run)');

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: '/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    });

    const page = await context.newPage();

    logger.log('🔐 Authenticating with magic link...');
    await page.goto(magicLink, { waitUntil: 'networkidle', timeout: 30000 });

    logger.log('📱 Navigating to saved items...');
    await page.waitForTimeout(2000);
    
    await page.goto('https://gem.app/my-gems', { waitUntil: 'networkidle', timeout: 30000 });

    logger.log('⏳ Waiting for items to load...');
    await page.waitForTimeout(3000);

    logger.log('🔍 Extracting saved items...');

    const items = await page.evaluate((lastItemId) => {
      const results = [];
      const itemCards = document.querySelectorAll('[data-testid="gem-card"], .gem-card, article, [class*="card"], [class*="item"]');

      for (const card of itemCards) {
        try {
          const linkElement = card.querySelector('a[href*="http"]') || card.querySelector('a');
          if (!linkElement) continue;

          const url = linkElement.href;
          if (!url || url.includes('gem.app')) continue;

          const imgElement = card.querySelector('img');
          const imageUrl = imgElement?.src || '';

          const textContent = card.innerText || '';
          const lines = textContent.split('\n').map(l => l.trim()).filter(l => l);

          const priceMatch = textContent.match(/\$[\d,]+(?:\.\d{2})?/);
          const price = priceMatch ? parseFloat(priceMatch[0].replace(/[$,]/g, '')) : null;

          const sizeMatch = textContent.match(/size[:\s]*([^\n]+)/i);
          const size = sizeMatch ? sizeMatch[1].trim() : null;

          let name = '';
          let brand = '';

          for (const line of lines) {
            if (line.startsWith('$') || line.match(/^\d+$/)) continue;
            if (line.toLowerCase().includes('size')) continue;
            if (line.toLowerCase().includes('save') || line.toLowerCase().includes('share')) continue;

            if (!brand && line.length < 50) {
              brand = line;
            } else if (!name) {
              name = line;
              break;
            }
          }

          const urlObj = new URL(url);
          const marketplace = urlObj.hostname.replace(/^www\./, '');

          const itemId = url + '||' + (name || 'unnamed');

          if (itemId === lastItemId) {
            return results;
          }

          results.push({
            id: itemId,
            name: name || 'Unnamed Item',
            url: url,
            brand: brand || null,
            price: price,
            size: size,
            imageUrl: imageUrl,
            marketplace: marketplace,
            dateSaved: new Date().toISOString().split('T')[0]
          });

        } catch (error) {
          console.error('Error extracting item:', error);
        }
      }

      return results;
    }, marker.lastItemId);

    logger.log(`✅ Extracted ${items.length} items from page`);

    await browser.close();

    const itemsToSave = items.slice(0, maxItems);
    logger.log(`📦 Saving ${itemsToSave.length} items (limited to max ${maxItems})`);

    const saveResult = await saveItemsToAirtable(itemsToSave);

    if (saveResult.success && itemsToSave.length > 0) {
      writeMarker(itemsToSave[0].id);
    }

    return {
      success: true,
      itemsScraped: items.length,
      itemsSaved: saveResult.count,
      items: itemsToSave,
      message: `Successfully scraped ${items.length} items, saved ${saveResult.count} to Airtable`
    };

  } catch (error) {
    logger.error('❌ Gem scraper error:', error.message);
    
    if (browser) {
      await browser.close();
    }

    return {
      success: false,
      error: error.message,
      itemsScraped: 0,
      itemsSaved: 0
    };
  }
}
