import { scrapeProduct as fastScrape } from './fast-scraper.js';
import { scrapeWithPlaywright } from '../playwright-scraper.js';
import { scrapeWithProxy } from './proxy-scraper.js';

// Detect if URL is from a department store that needs proxy
function isDepartmentStore(url) {
  const hostname = new URL(url).hostname.toLowerCase();
  const departmentStores = [
    'nordstrom.com',
    'saksfifthavenue.com',
    'neimanmarcus.com',
    'bloomingdales.com',
    'bergdorfgoodman.com',
    'shopbop.com',
    'ssense.com',
    'farfetch.com'
  ];
  return departmentStores.some(store => hostname.includes(store));
}

// Determine final errorType from multiple scraper results
// Logic: RETRYABLE if any scraper had RETRYABLE error (temp issue, worth trying other URLs)
//        BLOCKING only if ALL scrapers had BLOCKING errors (site blocks us completely)
//        FATAL if all scrapers had FATAL errors (this specific URL is broken)
function determineErrorType(...results) {
  const errorTypes = results
    .filter(r => !r.success)
    .map(r => r.errorType || 'UNKNOWN')
    .filter(t => t !== 'UNKNOWN');
  
  if (errorTypes.length === 0) {
    return 'UNKNOWN';
  }
  
  // If ANY scraper had a RETRYABLE error, consider the whole thing RETRYABLE
  // This allows other URLs from the same domain to be attempted
  if (errorTypes.includes('RETRYABLE')) {
    return 'RETRYABLE';
  }
  
  // If ANY scraper had a FATAL error but not all, also RETRYABLE
  // (one scraper's fatal error doesn't mean the domain is blocked)
  if (errorTypes.includes('FATAL') && errorTypes.includes('BLOCKING')) {
    return 'RETRYABLE';
  }
  
  // Only return BLOCKING if ALL scrapers returned BLOCKING
  if (errorTypes.every(t => t === 'BLOCKING')) {
    return 'BLOCKING';
  }
  
  // Only return FATAL if ALL scrapers returned FATAL
  if (errorTypes.every(t => t === 'FATAL')) {
    return 'FATAL';
  }
  
  // Default to RETRYABLE to give other URLs a chance
  return 'RETRYABLE';
}

export async function scrapeProduct(url, options = {}) {
  const {
    openai,
    enableTestMetadata = false,
    logger = console
  } = options;

  const startTime = Date.now();
  const attempts = [];

  logger.log(`🎯 [Orchestrator] Starting scrape for: ${url}`);

  const attemptFastScraper = async () => {
    const attemptStart = Date.now();
    try {
      logger.log('⚡ [Orchestrator] Attempting fast scraper...');
      const result = await fastScrape(url, {
        openai,
        serperApiKey: process.env.SERPER_API_KEY,
        fetchImpl: fetch,
        enableTestMetadata,
        logger
      });

      attempts.push({
        method: 'fast',
        outcome: result.success ? 'success' : 'failed',
        confidence: result.meta?.confidence || 0,
        durationMs: Date.now() - attemptStart,
        phase: result.meta?.phase,
        error: result.error
      });

      return result;
    } catch (error) {
      attempts.push({
        method: 'fast',
        outcome: 'error',
        confidence: 0,
        durationMs: Date.now() - attemptStart,
        error: error.message
      });
      return { success: false, error: error.message, meta: { confidence: 0 } };
    }
  };

  const attemptProxyScraper = async () => {
    const attemptStart = Date.now();
    try {
      logger.log('🔌 [Orchestrator] Attempting proxy scraper (ScraperAPI)...');
      const result = await scrapeWithProxy(url, {
        openai,
        enableTestMetadata,
        logger
      });

      attempts.push({
        method: 'proxy',
        outcome: result.success ? 'success' : 'failed',
        confidence: result.meta?.confidence || 0,
        durationMs: Date.now() - attemptStart,
        phase: result.meta?.phase,
        error: result.error
      });

      return result;
    } catch (error) {
      attempts.push({
        method: 'proxy',
        outcome: 'error',
        confidence: 0,
        durationMs: Date.now() - attemptStart,
        error: error.message
      });
      return { success: false, error: error.message, meta: { confidence: 0 } };
    }
  };

  const attemptPlaywrightScraper = async () => {
    const attemptStart = Date.now();
    try {
      logger.log('🎭 [Orchestrator] Attempting Playwright scraper...');
      const result = await scrapeWithPlaywright(url, { logger });

      attempts.push({
        method: 'playwright',
        outcome: result.success ? 'success' : 'failed',
        confidence: result.meta?.confidence || 0,
        durationMs: Date.now() - attemptStart,
        phase: result.meta?.phase,
        error: result.error
      });

      return result;
    } catch (error) {
      attempts.push({
        method: 'playwright',
        outcome: 'error',
        confidence: 0,
        durationMs: Date.now() - attemptStart,
        error: error.message
      });
      return { success: false, error: error.message, meta: { confidence: 0 } };
    }
  };

  const shouldFallbackToProxy = (result) => {
    if (!result.success) {
      logger.log('⚠️  [Orchestrator] Fast scraper failed, will try proxy');
      return true;
    }

    const product = result.product;
    const confidence = result.meta?.confidence || 0;

    if (confidence < 60) {
      logger.log(`⚠️  [Orchestrator] Low confidence (${confidence}%), will try proxy`);
      return true;
    }

    if (!product.name || !product.imageUrl || !product.salePrice) {
      logger.log('⚠️  [Orchestrator] Missing required fields, will try proxy');
      return true;
    }

    return false;
  };

  const shouldFallbackToPlaywright = (result) => {
    if (!result.success) {
      logger.log('⚠️  [Orchestrator] Previous scraper failed, will try Playwright');
      return true;
    }

    const product = result.product;
    const confidence = result.meta?.confidence || 0;

    if (confidence < 60) {
      logger.log(`⚠️  [Orchestrator] Low confidence (${confidence}%), will try Playwright`);
      return true;
    }

    if (!product.name || !product.imageUrl || !product.salePrice) {
      logger.log('⚠️  [Orchestrator] Missing required fields, will try Playwright');
      return true;
    }

    return false;
  };

  // Check if this is a department store that needs proxy
  const useDepartmentStoreProxy = isDepartmentStore(url);

  if (useDepartmentStoreProxy) {
    logger.log('🏬 [Orchestrator] Department store detected - using proxy scraper');
  }

  let fastResult = await attemptFastScraper();

  // For department stores: fast -> proxy -> playwright
  // For regular sites: fast -> playwright
  if (useDepartmentStoreProxy && shouldFallbackToProxy(fastResult)) {
    logger.log('🔄 [Orchestrator] Falling back to proxy scraper...');
    
    const proxyResult = await attemptProxyScraper();

    if (proxyResult.success) {
      logger.log('✅ [Orchestrator] Proxy scraper succeeded!');
      return {
        success: true,
        product: proxyResult.product,
        meta: {
          extractionMethod: 'proxy',
          confidence: proxyResult.meta?.confidence || 0,
          totalDurationMs: Date.now() - startTime,
          attempts,
          testMetadata: enableTestMetadata ? proxyResult.meta?.testMetadata : undefined
        }
      };
    }

    // If proxy fails, try Playwright as last resort
    if (shouldFallbackToPlaywright(proxyResult)) {
      logger.log('🔄 [Orchestrator] Proxy failed, trying Playwright as last resort...');
      
      const playwrightResult = await attemptPlaywrightScraper();

      if (playwrightResult.success) {
        logger.log('✅ [Orchestrator] Playwright succeeded!');
        return {
          success: true,
          product: playwrightResult.product,
          meta: {
            extractionMethod: 'playwright',
            confidence: playwrightResult.meta?.confidence || 0,
            totalDurationMs: Date.now() - startTime,
            attempts,
            testMetadata: enableTestMetadata ? playwrightResult.meta?.testMetadata : undefined
          }
        };
      }

      logger.log('❌ [Orchestrator] All scrapers failed');
      const finalErrorType = determineErrorType(fastResult, proxyResult, playwrightResult);
      return {
        success: false,
        error: `All scrapers failed. Fast: ${fastResult.error}, Proxy: ${proxyResult.error}, Playwright: ${playwrightResult.error}`,
        errorType: finalErrorType,
        meta: {
          extractionMethod: 'none',
          confidence: 0,
          totalDurationMs: Date.now() - startTime,
          attempts
        }
      };
    }

    logger.log('❌ [Orchestrator] Fast and proxy scrapers failed');
    const finalErrorType = determineErrorType(fastResult, proxyResult);
    return {
      success: false,
      error: `Both scrapers failed. Fast: ${fastResult.error}, Proxy: ${proxyResult.error}`,
      errorType: finalErrorType,
      meta: {
        extractionMethod: 'none',
        confidence: 0,
        totalDurationMs: Date.now() - startTime,
        attempts
      }
    };
  }

  // For non-department stores, use the original logic (fast -> playwright)
  if (shouldFallbackToPlaywright(fastResult)) {
    logger.log('🔄 [Orchestrator] Falling back to Playwright...');
    
    const playwrightResult = await attemptPlaywrightScraper();

    if (playwrightResult.success) {
      logger.log('✅ [Orchestrator] Playwright succeeded!');
      return {
        success: true,
        product: playwrightResult.product,
        meta: {
          extractionMethod: 'playwright',
          confidence: playwrightResult.meta?.confidence || 0,
          totalDurationMs: Date.now() - startTime,
          attempts,
          testMetadata: enableTestMetadata ? playwrightResult.meta?.testMetadata : undefined
        }
      };
    }

    logger.log('❌ [Orchestrator] Both scrapers failed');
    const finalErrorType = determineErrorType(fastResult, playwrightResult);
    return {
      success: false,
      error: `Both scrapers failed. Fast: ${fastResult.error}, Playwright: ${playwrightResult.error}`,
      errorType: finalErrorType,
      meta: {
        extractionMethod: 'none',
        confidence: 0,
        totalDurationMs: Date.now() - startTime,
        attempts
      }
    };
  }

  logger.log('✅ [Orchestrator] Fast scraper succeeded!');
  return {
    success: true,
    product: fastResult.product,
    meta: {
      extractionMethod: 'fast',
      confidence: fastResult.meta?.confidence || 0,
      totalDurationMs: Date.now() - startTime,
      attempts,
      testMetadata: enableTestMetadata ? fastResult.meta?.testMetadata : undefined
    }
  };
}
