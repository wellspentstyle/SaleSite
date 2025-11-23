// DIAGNOSTIC GEM SCRAPER
// This version logs EVERYTHING to help us debug

import { chromium } from 'playwright';

export async function scrapeGemItems(magicLink, options = {}) {
  const {
    maxItems = 5,
    logger = console
  } = options;
  
  let browser;
  let context;
  let page;
  
  try {
    logger.log('💎 Starting Gem scraper (DIAGNOSTIC MODE)...');
    logger.log(`🔗 Magic link: ${magicLink.substring(0, 60)}...`);
    
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage'
      ]
    });
    
    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 }
    });
    
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });
    
    page = await context.newPage();
    
    // STEP 1: Navigate to magic link
    logger.log('📍 STEP 1: Navigating to magic link...');
    
    const response = await page.goto(magicLink, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    logger.log(`   Response status: ${response?.status()}`);
    logger.log(`   URL after navigation: ${page.url()}`);
    logger.log(`   Page title: ${await page.title()}`);
    
    await page.screenshot({ path: '/tmp/gem-1-initial.png', fullPage: true });
    logger.log('   📸 Screenshot: /tmp/gem-1-initial.png');
    
    // STEP 2: Wait and check for elements
    logger.log('📍 STEP 2: Waiting 3 seconds for page to settle...');
    await page.waitForTimeout(3000);
    
    // DIAGNOSTIC: Check what's on the page
    const pageAnalysis = await page.evaluate(() => {
      const analysis = {
        url: window.location.href,
        title: document.title,
        bodyText: document.body.innerText.substring(0, 500),
        buttons: [],
        links: [],
        hasLoggedInText: document.body.innerText.includes('Logged In'),
        hasContinueText: document.body.innerText.includes('Continue'),
        hasEmailLogInText: document.body.innerText.includes('Email Log In')
      };
      
      // Find all visible buttons
      document.querySelectorAll('button').forEach((btn, i) => {
        const rect = btn.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          analysis.buttons.push({
            index: i,
            text: btn.textContent?.trim().substring(0, 50) || '',
            visible: window.getComputedStyle(btn).display !== 'none'
          });
        }
      });
      
      // Find all visible links
      document.querySelectorAll('a').forEach((link, i) => {
        if (i < 5) { // Only first 5
          const rect = link.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            analysis.links.push({
              text: link.textContent?.trim().substring(0, 30) || '',
              href: link.href
            });
          }
        }
      });
      
      return analysis;
    });
    
    logger.log('📊 PAGE ANALYSIS:');
    logger.log(`   URL: ${pageAnalysis.url}`);
    logger.log(`   Title: ${pageAnalysis.title}`);
    logger.log(`   Has "Logged In" text: ${pageAnalysis.hasLoggedInText}`);
    logger.log(`   Has "Continue" text: ${pageAnalysis.hasContinueText}`);
    logger.log(`   Has "Email Log In" text: ${pageAnalysis.hasEmailLogInText}`);
    logger.log(`   Buttons found: ${pageAnalysis.buttons.length}`);
    
    if (pageAnalysis.buttons.length > 0) {
      logger.log('   Button details:');
      pageAnalysis.buttons.forEach((btn, i) => {
        logger.log(`      ${i + 1}. "${btn.text}" (visible: ${btn.visible})`);
      });
    }
    
    logger.log(`   Body text preview: ${pageAnalysis.bodyText.substring(0, 200)}`);
    
    // STEP 3: Try to handle popup
    logger.log('📍 STEP 3: Attempting popup handling...');
    
    let popupHandled = false;
    
    // Strategy 1: Look for Continue button
    try {
      logger.log('   Strategy 1: Looking for "Continue" button...');
      const continueBtn = page.locator('button:has-text("Continue")').first();
      const count = await continueBtn.count();
      logger.log(`   Found ${count} "Continue" buttons`);
      
      if (count > 0) {
        const isVisible = await continueBtn.isVisible().catch(() => false);
        logger.log(`   Button visible: ${isVisible}`);
        
        if (isVisible) {
          logger.log('   ✅ Clicking "Continue" button...');
          await continueBtn.click();
          await page.waitForTimeout(3000);
          popupHandled = true;
          logger.log('   ✅ Clicked successfully');
        }
      }
    } catch (error) {
      logger.log(`   ❌ Strategy 1 failed: ${error.message}`);
    }
    
    // Strategy 2: Look for any button in a dialog/modal
    if (!popupHandled) {
      try {
        logger.log('   Strategy 2: Looking for buttons in dialogs...');
        const dialogBtn = page.locator('[role="dialog"] button, [role="alertdialog"] button').first();
        const count = await dialogBtn.count();
        logger.log(`   Found ${count} dialog buttons`);
        
        if (count > 0) {
          logger.log('   ✅ Clicking dialog button...');
          await dialogBtn.click();
          await page.waitForTimeout(3000);
          popupHandled = true;
          logger.log('   ✅ Clicked successfully');
        }
      } catch (error) {
        logger.log(`   ❌ Strategy 2 failed: ${error.message}`);
      }
    }
    
    // Strategy 3: Try pressing Escape
    if (!popupHandled) {
      logger.log('   Strategy 3: Trying Escape key...');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(2000);
    }
    
    await page.screenshot({ path: '/tmp/gem-2-after-popup.png', fullPage: true });
    logger.log('   📸 Screenshot: /tmp/gem-2-after-popup.png');
    
    // STEP 4: Check if we're logged in now
    logger.log('📍 STEP 4: Checking authentication status...');
    
    const currentUrl = page.url();
    const currentTitle = await page.title();
    
    logger.log(`   Current URL: ${currentUrl}`);
    logger.log(`   Current title: ${currentTitle}`);
    
    const isLoggedIn = !currentUrl.includes('emailLogIn') && 
                       (currentUrl.includes('/shop') || 
                        currentUrl.includes('/items') ||
                        currentUrl.includes('/collection'));
    
    logger.log(`   Appears logged in: ${isLoggedIn}`);
    
    if (!isLoggedIn) {
      logger.log('   ⚠️ NOT logged in, trying manual navigation...');
      
      // Try navigating directly to items page
      try {
        await page.goto('https://gem.app/items', {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });
        
        await page.waitForTimeout(3000);
        
        const newUrl = page.url();
        logger.log(`   After manual navigation: ${newUrl}`);
        
        if (newUrl.includes('emailLogIn')) {
          throw new Error('Authentication failed after 15s. Page title: "Email Log In"');
        }
        
        logger.log('   ✅ Manual navigation successful');
        
      } catch (navError) {
        logger.error('   ❌ Manual navigation failed:', navError.message);
        throw new Error('Magic link authentication failed - not logged in after using link');
      }
    }
    
    // STEP 5: Extract items
    logger.log('📍 STEP 5: Attempting to extract items...');
    
    await page.waitForTimeout(3000);
    
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
      
      if (elements.length === 0) {
        console.log('No items found. Page HTML length:', document.documentElement.outerHTML.length);
        return [];
      }
      
      for (let i = 0; i < Math.min(elements.length, maxItems); i++) {
        const element = elements[i];
        
        const link = element.querySelector('a') || (element.tagName === 'A' ? element : null);
        const img = element.querySelector('img');
        const title = element.querySelector('h1, h2, h3, h4');
        
        if (link || img) {
          results.push({
            url: link?.href || '',
            imageUrl: img?.src || '',
            name: title?.textContent?.trim() || 'Unnamed Item'
          });
        }
      }
      
      return results;
    }, maxItems);
    
    logger.log(`✅ Extracted ${items.length} items`);
    
    if (items.length > 0) {
      logger.log('📝 Sample item:', items[0]);
    } else {
      logger.log('⚠️ No items extracted - this might be normal if account is empty');
    }
    
    await browser.close();
    
    return {
      success: true,
      message: `Successfully scraped ${items.length} items from Gem`,
      itemsScraped: items.length,
      itemsSaved: 0,
      items: items
    };
    
  } catch (error) {
    logger.error('❌ Gem scraper error:', error.message);
    logger.error('Stack trace:', error.stack);
    
    if (page) {
      try {
        const url = page.url();
        const title = await page.title();
        
        logger.error(`❌ Error occurred at URL: ${url}`);
        logger.error(`❌ Page title: ${title}`);
        
        await page.screenshot({ path: '/tmp/gem-error-state.png', fullPage: true });
        logger.log('📸 Error state screenshot: /tmp/gem-error-state.png');
      } catch (e) {
        // Ignore
      }
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
