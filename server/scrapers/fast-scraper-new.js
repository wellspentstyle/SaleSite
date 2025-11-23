// FAST SCRAPER WITH GOOGLE SHOPPING API
// Primary: Google Shopping API for name, image, original price
// Secondary: Page fetch for fresh sale price
// Fallback: Existing JSON-LD and HTML extraction

export async function scrapeProduct(url, options = {}) {
  const {
    openai,
    serperApiKey = process.env.SERPER_API_KEY,
    fetchImpl = fetch,
    enableTestMetadata = false,
    maxRetries = 3,
    logger = console
  } = options;

  if (!openai) {
    throw new Error('OpenAI client is required');
  }

  const startTime = Date.now();
  const testMetadata = {
    phaseUsed: null,
    priceValidation: {
      foundInHtml: false,
      checkedFormats: []
    },
    imageExtraction: {
      source: null,
      preExtracted: false
    },
    confidenceAdjustments: [],
    retryCount: 0
  };

  return await retryWithBackoff(
    async () => {
      try {
        validateUrl(url);

        logger.log(`🔍 [Fast Scraper] Scraping product: ${url}`);

        if (serperApiKey) {
          logger.log('🛍️ [Fast Scraper] Trying Google Shopping API...');
          
          const googleShoppingResult = await tryGoogleShopping(url, serperApiKey, logger);
          
          if (googleShoppingResult) {
            logger.log('✅ [Fast Scraper] Google Shopping found product data');
            logger.log('📄 [Fast Scraper] Fetching page for fresh sale price...');
            
            const freshPrice = await fetchFreshSalePrice(url, fetchImpl, logger);
            
            if (freshPrice) {
              const product = {
                name: googleShoppingResult.name,
                brand: googleShoppingResult.brand || null,
                imageUrl: googleShoppingResult.imageUrl,
                originalPrice: googleShoppingResult.originalPrice || freshPrice.originalPrice,
                salePrice: freshPrice.salePrice,
                percentOff: 0,
                url: url,
                confidence: 90
              };
              
              if (product.originalPrice && product.originalPrice > product.salePrice) {
                product.percentOff = Math.round(((product.originalPrice - product.salePrice) / product.originalPrice) * 100);
              } else if (!product.originalPrice) {
                product.originalPrice = product.salePrice;
              }
              
              testMetadata.phaseUsed = 'google-shopping-hybrid';
              testMetadata.imageExtraction.source = 'google-shopping';
              
              logger.log(`✅ [Fast Scraper] Google Shopping hybrid success (confidence: ${product.confidence}%)`);
              
              return {
                success: true,
                product: product,
                meta: {
                  method: 'fast',
                  phase: 'google-shopping-hybrid',
                  confidence: product.confidence,
                  durationMs: Date.now() - startTime,
                  testMetadata: enableTestMetadata ? testMetadata : undefined
                }
              };
            }
          }
          
          logger.log('⚠️ [Fast Scraper] Google Shopping incomplete, falling back to traditional methods...');
        }

        const response = await fetchImpl(url, {
          redirect: 'follow',
          timeout: 10000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
          }
        });

        if (!response.ok) {
          const errorType = classifyHttpError(response.status);
          const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
          error.statusCode = response.status;
          error.errorType = errorType;
          throw error;
        }

        const html = await response.text();
        logger.log(`📄 [Fast Scraper] Fetched HTML: ${html.length} characters`);

        const jsonLdResult = await extractFromJsonLd(html, url, testMetadata, logger);
        if (jsonLdResult && jsonLdResult.complete) {
          return {
            success: true,
            product: jsonLdResult,
            meta: {
              method: 'fast',
              phase: 'json-LD',
              confidence: jsonLdResult.confidence,
              durationMs: Date.now() - startTime,
              testMetadata: enableTestMetadata ? testMetadata : undefined
            }
          };
        }

        if (jsonLdResult && !jsonLdResult.complete) {
          logger.log('📊 Found partial JSON-LD data, using it for AI extraction...');
        } else {
          logger.log('⚠️  No JSON-LD data found, trying deterministic HTML extraction...');
        }

        const deterministicResult = await extractFromHtmlDeterministic(html, url, testMetadata, logger);
        if (deterministicResult && deterministicResult.complete) {
          return {
            success: true,
            product: deterministicResult,
            meta: {
              method: 'fast',
              phase: 'html-deterministic',
              confidence: deterministicResult.confidence,
              durationMs: Date.now() - startTime,
              testMetadata: enableTestMetadata ? testMetadata : undefined
            }
          };
        }

        logger.log('⚠️  Deterministic extraction incomplete, falling back to AI...');
        const aiResult = await extractWithAI(html, url, openai, testMetadata, logger, jsonLdResult, deterministicResult);
        
        return {
          success: true,
          product: aiResult,
          meta: {
            method: 'fast',
            phase: 'ai-extraction',
            confidence: aiResult.confidence,
            durationMs: Date.now() - startTime,
            testMetadata: enableTestMetadata ? testMetadata : undefined
          }
        };

      } catch (error) {
        if (!error.errorType) {
          error.errorType = classifyError(error);
        }
        throw error;
      }
    },
    maxRetries,
    logger,
    testMetadata
  ).catch(error => {
    logger.error('❌ [Fast Scraper] Error:', error.message);
    return {
      success: false,
      error: error.message,
      errorType: error.errorType || 'UNKNOWN',
      meta: {
        method: 'fast',
        phase: 'error',
        confidence: 0,
        durationMs: Date.now() - startTime,
        retryCount: testMetadata.retryCount,
        testMetadata: enableTestMetadata ? testMetadata : undefined
      }
    };
  });
}

function classifyHttpError(statusCode) {
  if ([500, 502, 503, 504].includes(statusCode)) {
    return 'RETRYABLE';
  }
  
  if ([401, 403, 429].includes(statusCode)) {
    return 'BLOCKING';
  }
  
  if (statusCode === 404) {
    return 'FATAL';
  }
  
  if (statusCode >= 400 && statusCode < 500) {
    return 'FATAL';
  }
  
  return 'RETRYABLE';
}

function classifyError(error) {
  if (error.statusCode) {
    return classifyHttpError(error.statusCode);
  }
  
  const errorMsg = error.message?.toLowerCase() || '';
  
  if (errorMsg.includes('timeout') || errorMsg.includes('timed out')) {
    return 'RETRYABLE';
  }
  
  if (errorMsg.includes('econnreset') || 
      errorMsg.includes('econnrefused') || 
      errorMsg.includes('network') ||
      errorMsg.includes('socket hang up')) {
    return 'RETRYABLE';
  }
  
  if (errorMsg.includes('cloudflare') ||
      errorMsg.includes('access denied') ||
      errorMsg.includes('forbidden') ||
      errorMsg.includes('rate limit')) {
    return 'BLOCKING';
  }
  
  if (errorMsg.includes('invalid url') ||
      errorMsg.includes('missing required') ||
      errorMsg.includes('placeholder image')) {
    return 'FATAL';
  }
  
  return 'RETRYABLE';
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function retryWithBackoff(fn, maxRetries, logger, testMetadata) {
  let lastError = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        testMetadata.retryCount = attempt;
      }
      return await fn();
    } catch (error) {
      lastError = error;
      const errorType = error.errorType || classifyError(error);
      
      if (errorType === 'BLOCKING') {
        logger.log(`🚫 [Fast Scraper] Blocking error detected, not retrying: ${error.message}`);
        error.errorType = 'BLOCKING';
        throw error;
      }
      
      if (errorType === 'FATAL') {
        logger.log(`❌ [Fast Scraper] Fatal error, not retrying: ${error.message}`);
        error.errorType = 'FATAL';
        throw error;
      }
      
      if (attempt === maxRetries - 1) {
        logger.log(`❌ [Fast Scraper] All ${maxRetries} attempts failed`);
        error.errorType = errorType;
        throw error;
      }
      
      const delay = Math.pow(2, attempt + 1) * 1000;
      logger.log(`⚠️  [Fast Scraper] Attempt ${attempt + 1}/${maxRetries} failed (${errorType}), retrying in ${delay}ms...`);
      logger.log(`   Error: ${error.message}`);
      
      await sleep(delay);
    }
  }
  
  lastError.errorType = classifyError(lastError);
  throw lastError;
}
