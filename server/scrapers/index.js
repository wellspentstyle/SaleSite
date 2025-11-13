import { scrapeProduct as fastScrape } from './fast-scraper.js';
import { scrapeWithPlaywright } from '../playwright-scraper.js';

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

  const shouldFallbackToPlaywright = (result) => {
    if (!result.success) {
      logger.log('⚠️  [Orchestrator] Fast scraper failed, will try Playwright');
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

  let fastResult = await attemptFastScraper();

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
    return {
      success: false,
      error: `Both scrapers failed. Fast: ${fastResult.error}, Playwright: ${playwrightResult.error}`,
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
