let playwrightModule = null;

async function loadPlaywright() {
  if (!playwrightModule) {
    playwrightModule = await import('playwright');
  }
  return playwrightModule;
}

export async function scrapeWithPlaywright(url, options = {}) {
  const { logger = console } = options;
  const startTime = Date.now();
  let browser = null;
  let context = null;
  
  try {
    logger.log('[Playwright] Launching browser for:', url);
    
    const { chromium } = await loadPlaywright();
    
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    
    const page = await context.newPage();
    
    logger.log('[Playwright] Navigating to page...');
    await page.goto(url, { 
      waitUntil: 'networkidle',
      timeout: 30000
    });
    
    logger.log('[Playwright] Waiting for content to load...');
    await page.waitForTimeout(2000);
    
    logger.log('[Playwright] Extracting product data...');
    const productData = await page.evaluate(() => {
      const data = {
        name: null,
        imageUrl: null,
        originalPrice: null,
        salePrice: null,
        percentOff: 0
      };
      
      data.name = document.querySelector('h1')?.textContent?.trim() ||
                  document.querySelector('[class*="product-title"]')?.textContent?.trim() ||
                  document.querySelector('[class*="ProductName"]')?.textContent?.trim() ||
                  document.querySelector('meta[property="og:title"]')?.content ||
                  document.title;
      
      data.imageUrl = document.querySelector('meta[property="og:image"]')?.content ||
                     document.querySelector('meta[name="og:image"]')?.content ||
                     document.querySelector('meta[property="twitter:image"]')?.content ||
                     document.querySelector('img[class*="product"]')?.src ||
                     document.querySelector('img[class*="main"]')?.src;
      
      const priceSelectors = [
        '[class*="price"][class*="sale"]',
        '[class*="sale"][class*="price"]',
        '[class*="current-price"]',
        '[class*="currentPrice"]',
        '[data-test*="price"]',
        '[data-testid*="price"]',
        '.price',
        '[itemprop="price"]'
      ];
      
      let salePriceElement = null;
      for (const selector of priceSelectors) {
        salePriceElement = document.querySelector(selector);
        if (salePriceElement) break;
      }
      
      const originalPriceSelectors = [
        '[class*="price"][class*="original"]',
        '[class*="original"][class*="price"]',
        '[class*="regular-price"]',
        '[class*="regularPrice"]',
        '[class*="was-price"]',
        '[class*="compare-at-price"]',
        '[itemprop="highPrice"]'
      ];
      
      let originalPriceElement = null;
      for (const selector of originalPriceSelectors) {
        originalPriceElement = document.querySelector(selector);
        if (originalPriceElement) break;
      }
      
      const extractPrice = (element) => {
        if (!element) return null;
        const text = element.textContent || element.getAttribute('content') || '';
        const match = text.match(/[\d,]+\.?\d*/);
        if (match) {
          return parseFloat(match[0].replace(/,/g, ''));
        }
        return null;
      };
      
      data.salePrice = extractPrice(salePriceElement);
      data.originalPrice = extractPrice(originalPriceElement);
      
      if (data.originalPrice && data.salePrice && data.originalPrice > data.salePrice) {
        data.percentOff = Math.round(((data.originalPrice - data.salePrice) / data.originalPrice) * 100);
      }
      
      return data;
    });
    
    logger.log('[Playwright] Extracted data:', productData);
    
    const normalizeImageUrl = (imageUrl, pageUrl) => {
      if (!imageUrl) return null;
      if (imageUrl.startsWith('http')) return imageUrl;
      
      try {
        const base = new URL(pageUrl);
        return new URL(imageUrl, base).href;
      } catch {
        return null;
      }
    };
    
    productData.imageUrl = normalizeImageUrl(productData.imageUrl, url);
    
    let confidence = 70;
    
    if (!productData.name) confidence -= 30;
    if (!productData.imageUrl) confidence -= 20;
    if (!productData.salePrice || productData.salePrice === 0) confidence -= 20;
    
    if (productData.imageUrl && (
      productData.imageUrl.includes('example.com') ||
      productData.imageUrl.includes('placeholder') ||
      productData.imageUrl.includes('data:image')
    )) {
      confidence -= 20;
    }
    
    if (confidence < 50) {
      throw new Error(`Playwright extraction failed: confidence too low (${confidence}%)`);
    }
    
    if (!productData.name || !productData.imageUrl || !productData.salePrice) {
      throw new Error('Missing required product fields (name, imageUrl, or salePrice)');
    }
    
    logger.log(`✅ [Playwright] Extracted product (confidence: ${confidence}%):`, {
      name: productData.name,
      salePrice: productData.salePrice,
      originalPrice: productData.originalPrice
    });
    
    return {
      success: true,
      product: {
        name: productData.name,
        imageUrl: productData.imageUrl,
        originalPrice: productData.originalPrice,
        salePrice: productData.salePrice,
        percentOff: productData.percentOff || 0,
        url: url,
        confidence: confidence
      },
      meta: {
        method: 'playwright',
        phase: 'browser-extraction',
        confidence: confidence,
        durationMs: Date.now() - startTime
      }
    };
    
  } catch (error) {
    logger.error('[Playwright] Error:', error.message);
    return {
      success: false,
      error: error.message,
      meta: {
        method: 'playwright',
        phase: 'error',
        confidence: 0,
        durationMs: Date.now() - startTime
      }
    };
  } finally {
    if (context) {
      try {
        await context.close();
      } catch (e) {
        logger.error('[Playwright] Error closing context:', e.message);
      }
    }
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        logger.error('[Playwright] Error closing browser:', e.message);
      }
    }
  }
}
