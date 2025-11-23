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
    const error = new Error('OpenAI client is required');
    error.errorType = 'FATAL';
    throw error;
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

  // Wrap the entire scraping logic in retry mechanism
  return await retryWithBackoff(
    async () => {
      try {
        validateUrl(url);

        logger.log(`🔍 [Fast Scraper] Scraping product: ${url}`);

        // ============================================
        // STEP 1: TRY GOOGLE SHOPPING API FIRST
        // ============================================
        if (serperApiKey) {
          logger.log('🛍️ [Fast Scraper] Trying Google Shopping API...');
          
          const googleShoppingResult = await tryGoogleShopping(url, serperApiKey, logger);
          
          if (googleShoppingResult) {
            // We got product info from Google Shopping!
            logger.log('✅ [Fast Scraper] Google Shopping found product data');
            
            // Try to get fresh sale price from page, but don't fail if it doesn't work
            let freshPrice = null;
            if (!googleShoppingResult.currentPrice) {
              logger.log('📄 [Fast Scraper] No price in Shopping API, fetching page for fresh price...');
              freshPrice = await fetchFreshSalePrice(url, fetchImpl, logger);
            } else {
              logger.log(`💰 [Fast Scraper] Using Shopping API price: $${googleShoppingResult.currentPrice}`);
            }
            
            // Use Shopping API price if we have it, otherwise use fresh price
            const salePrice = googleShoppingResult.currentPrice || (freshPrice && freshPrice.salePrice);
            const originalPrice = googleShoppingResult.originalPrice || (freshPrice && freshPrice.originalPrice);
            
            // We need at least a sale price to continue
            if (salePrice) {
              const product = {
                name: googleShoppingResult.name,
                brand: googleShoppingResult.brand || null,
                imageUrl: googleShoppingResult.imageUrl,
                originalPrice: originalPrice || salePrice,
                salePrice: salePrice,
                percentOff: 0,
                url: url,
                confidence: 90
              };
              
              // Calculate percent off
              if (product.originalPrice && product.originalPrice > product.salePrice) {
                product.percentOff = Math.round(((product.originalPrice - product.salePrice) / product.originalPrice) * 100);
              }
              
              testMetadata.phaseUsed = 'google-shopping-api';
              testMetadata.imageExtraction.source = 'google-shopping';
              
              logger.log(`✅ [Fast Scraper] Google Shopping success (confidence: ${product.confidence}%)`);
              
              return {
                success: true,
                product: product,
                meta: {
                  method: 'fast',
                  phase: 'google-shopping-api',
                  confidence: product.confidence,
                  durationMs: Date.now() - startTime,
                  testMetadata: enableTestMetadata ? testMetadata : undefined
                }
              };
            }
            
            logger.log('⚠️ [Fast Scraper] Google Shopping has no price data');
          }
          
          logger.log('⚠️ [Fast Scraper] Google Shopping incomplete, falling back to traditional methods...');
        }

        // ============================================
        // STEP 2: FALLBACK TO TRADITIONAL SCRAPING
        // ============================================
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

        // Check for error status codes and classify
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
              phase: 'json-ld',
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
        // Add error classification to the error object
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

// ============================================
// RETRY LOGIC AND ERROR CLASSIFICATION
// ============================================

function classifyHttpError(statusCode) {
  // Server errors - retryable
  if ([500, 502, 503, 504].includes(statusCode)) {
    return 'RETRYABLE';
  }
  
  // Authentication/blocking errors - skip domain
  if ([401, 403, 429].includes(statusCode)) {
    return 'BLOCKING';
  }
  
  // Not found - fatal for this URL only
  if (statusCode === 404) {
    return 'FATAL';
  }
  
  // Client errors - fatal
  if (statusCode >= 400 && statusCode < 500) {
    return 'FATAL';
  }
  
  // Unknown - treat as retryable
  return 'RETRYABLE';
}

function classifyError(error) {
  // Check if it's an HTTP error with status code
  if (error.statusCode) {
    return classifyHttpError(error.statusCode);
  }
  
  const errorMsg = error.message?.toLowerCase() || '';
  
  // Network timeout errors - retryable
  if (errorMsg.includes('timeout') || errorMsg.includes('timed out')) {
    return 'RETRYABLE';
  }
  
  // Connection errors - retryable
  if (errorMsg.includes('econnreset') || 
      errorMsg.includes('econnrefused') || 
      errorMsg.includes('network') ||
      errorMsg.includes('socket hang up')) {
    return 'RETRYABLE';
  }
  
  // Blocking/access errors
  if (errorMsg.includes('cloudflare') ||
      errorMsg.includes('access denied') ||
      errorMsg.includes('forbidden') ||
      errorMsg.includes('rate limit')) {
    return 'BLOCKING';
  }
  
  // Invalid URL or data errors - fatal
  if (errorMsg.includes('invalid url') ||
      errorMsg.includes('missing required') ||
      errorMsg.includes('placeholder image')) {
    return 'FATAL';
  }
  
  // Default: treat as retryable (give it a chance)
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
      
      // Don't retry blocking or fatal errors
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
      
      // If this is the last attempt, throw the error
      if (attempt === maxRetries - 1) {
        logger.log(`❌ [Fast Scraper] All ${maxRetries} attempts failed`);
        error.errorType = errorType;
        throw error;
      }
      
      // Calculate backoff delay: 2s, 4s, 8s
      const delay = Math.pow(2, attempt + 1) * 1000;
      logger.log(`⚠️  [Fast Scraper] Attempt ${attempt + 1}/${maxRetries} failed (${errorType}), retrying in ${delay}ms...`);
      logger.log(`   Error: ${error.message}`);
      
      await sleep(delay);
    }
  }
  
  // Should never reach here, but just in case
  lastError.errorType = classifyError(lastError);
  throw lastError;
}

// ============================================
// GOOGLE SHOPPING API FUNCTIONS
// ============================================

async function tryGoogleShopping(url, serperApiKey, logger) {
  try {
    // Search Google Shopping for this product URL
    const searchResponse = await fetch('https://google.serper.dev/shopping', {
      method: 'POST',
      headers: {
        'X-API-KEY': serperApiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        q: url,
        num: 3 // Get top 3 results to find best match
      })
    });

    if (!searchResponse.ok) {
      logger.log(`⚠️ Google Shopping API error: ${searchResponse.status}`);
      return null;
    }

    const data = await searchResponse.json();

    if (!data.shopping_results || data.shopping_results.length === 0) {
      logger.log('⚠️ No Google Shopping results found');
      return null;
    }

    // Find the result that best matches our URL
    const urlDomain = new URL(url).hostname.replace('www.', '');
    let bestMatch = null;
    
    for (const result of data.shopping_results) {
      // Check if the source matches the domain
      if (result.link && result.link.includes(urlDomain)) {
        bestMatch = result;
        break;
      }
      // Or if source name matches
      if (result.source && result.source.toLowerCase().includes(urlDomain.split('.')[0])) {
        bestMatch = result;
        break;
      }
    }

    // If no exact match, use first result
    if (!bestMatch) {
      bestMatch = data.shopping_results[0];
    }

    // Extract product data
    const product = {
      name: bestMatch.title,
      brand: extractBrandFromTitle(bestMatch.title),
      imageUrl: bestMatch.imageUrl || bestMatch.thumbnail,
      originalPrice: null,
      currentPrice: null
    };

    // Parse prices
    if (bestMatch.price) {
      const priceStr = bestMatch.price.replace(/[^0-9.]/g, '');
      product.currentPrice = parseFloat(priceStr);
    }

    // Check for original/compare price
    if (bestMatch.extracted_price) {
      product.currentPrice = bestMatch.extracted_price;
    }

    // Some Google Shopping results have old_price or extracted_old_price
    if (bestMatch.old_price) {
      const oldPriceStr = bestMatch.old_price.replace(/[^0-9.]/g, '');
      product.originalPrice = parseFloat(oldPriceStr);
    } else if (bestMatch.extracted_old_price) {
      product.originalPrice = bestMatch.extracted_old_price;
    }

    // Validate we got minimum required data
    if (!product.name || !product.imageUrl) {
      logger.log('⚠️ Google Shopping result missing name or image');
      return null;
    }

    logger.log(`✅ Google Shopping: ${product.name}`);
    if (product.originalPrice) {
      logger.log(`   Original: $${product.originalPrice}, Current: $${product.currentPrice}`);
    } else {
      logger.log(`   Price: $${product.currentPrice}`);
    }

    return product;

  } catch (error) {
    logger.log(`⚠️ Google Shopping error: ${error.message}`);
    return null;
  }
}

async function fetchFreshSalePrice(url, fetchImpl, logger) {
  try {
    const response = await fetchImpl(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      },
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      logger.log(`⚠️ Page fetch failed: ${response.status}`);
      return null;
    }

    const html = await response.text();

    let salePrice = null;
    let originalPrice = null;

    // Strategy 1: JSON-LD structured data
    const jsonLdMatches = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
    if (jsonLdMatches) {
      for (const jsonLdScript of jsonLdMatches) {
        try {
          const jsonContent = jsonLdScript.match(/<script[^>]*>([\s\S]*?)<\/script>/i)?.[1];
          if (!jsonContent) continue;

          const data = JSON.parse(jsonContent);

          if (data['@type'] === 'Product' || data['@type']?.includes?.('Product')) {
            const offers = data.offers || data.Offers;
            if (offers) {
              const offerData = Array.isArray(offers) ? offers[0] : offers;
              
              if (offerData.price) {
                salePrice = parseFloat(offerData.price);
                logger.log(`💰 Fresh sale price from JSON-LD: $${salePrice}`);
              }

              if (offerData.highPrice || offerData.priceValidUntil) {
                originalPrice = parseFloat(offerData.highPrice || offerData.price);
              }

              if (salePrice) break;
            }
          }
        } catch (e) {
          continue;
        }
      }
    }

    // Strategy 2: Meta tags
    if (!salePrice) {
      const ogPriceMatch = html.match(/<meta[^>]*property="(?:og:price:amount|product:price:amount)"[^>]*content="([^"]+)"/i);
      if (ogPriceMatch) {
        salePrice = parseFloat(ogPriceMatch[1]);
        logger.log(`💰 Fresh sale price from meta tag: $${salePrice}`);
      }
    }

    // Strategy 3: Common price patterns in HTML
    if (!salePrice) {
      const pricePatterns = [
        /<[^>]*class="[^"]*(?:sale-price|price-sale|final-price|current-price)[^"]*"[^>]*>\s*\$?\s*(\d+(?:\.\d{2})?)/i,
        /<span[^>]*class="[^"]*price[^"]*"[^>]*>\s*\$?\s*(\d+(?:\.\d{2})?)/i,
        /"price":\s*"?(\d+(?:\.\d{2})?)"/,
        /"salePrice":\s*"?(\d+(?:\.\d{2})?)"/
      ];

      for (const pattern of pricePatterns) {
        const match = html.match(pattern);
        if (match) {
          const price = parseFloat(match[1]);
          if (price > 0 && price < 10000) {
            salePrice = price;
            logger.log(`💰 Fresh sale price from HTML pattern: $${salePrice}`);
            break;
          }
        }
      }
    }

    // Strategy 4: Look for original price
    if (!originalPrice) {
      const originalPricePatterns = [
        /<[^>]*class="[^"]*(?:original-price|was-price|compare-at|price-original)[^"]*"[^>]*>\s*\$?\s*(\d+(?:\.\d{2})?)/i,
        /"originalPrice":\s*"?(\d+(?:\.\d{2})?)"/,
        /"compareAtPrice":\s*"?(\d+(?:\.\d{2})?)"/
      ];

      for (const pattern of originalPricePatterns) {
        const match = html.match(pattern);
        if (match) {
          const price = parseFloat(match[1]);
          if (price > 0 && price < 10000 && price > (salePrice || 0)) {
            originalPrice = price;
            logger.log(`💰 Original price from page: $${originalPrice}`);
            break;
          }
        }
      }
    }

    if (!salePrice) {
      logger.log('⚠️ Could not extract fresh price from page');
      return null;
    }

    return {
      salePrice: salePrice,
      originalPrice: originalPrice
    };

  } catch (error) {
    logger.log(`⚠️ Fresh price fetch error: ${error.message}`);
    return null;
  }
}

function extractBrandFromTitle(title) {
  // Remove common product descriptors and take first word/phrase as brand
  const cleaned = title
    .split(/[|–—-]/)[0] // Take everything before separators
    .trim();
  
  // Common brand patterns
  const brandMatch = cleaned.match(/^([A-Z][a-zA-Z&\s]+?)(?:\s+[A-Z][a-z]|\s+\d|\s*$)/);
  if (brandMatch) {
    return brandMatch[1].trim();
  }
  
  // Fallback: first word if it's capitalized
  const firstWord = cleaned.split(/\s+/)[0];
  if (firstWord && /^[A-Z]/.test(firstWord)) {
    return firstWord;
  }
  
  return null;
}

// ============================================
// EXISTING EXTRACTION FUNCTIONS (FALLBACK)
// ============================================

function validateUrl(url) {
  try {
    const urlObj = new URL(url);

    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      const error = new Error('Invalid URL protocol');
      error.errorType = 'FATAL';
      throw error;
    }

    const hostname = urlObj.hostname.toLowerCase();

    const blockedHosts = ['localhost', 'localhost.localdomain', '0.0.0.0'];
    if (blockedHosts.includes(hostname)) {
      const error = new Error('Private URLs not allowed');
      error.errorType = 'FATAL';
      throw error;
    }

    const ipv4Pattern = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const ipMatch = hostname.match(ipv4Pattern);
    if (ipMatch) {
      const [, a, b, c, d] = ipMatch.map(Number);
      if (a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)) {
        const error = new Error('Private URLs not allowed');
        error.errorType = 'FATAL';
        throw error;
      }
    }

    if (hostname.includes(':')) {
      if (hostname === '::1' || hostname.startsWith('fe80:') || hostname.startsWith('::ffff:127')) {
        const error = new Error('Private URLs not allowed');
        error.errorType = 'FATAL';
        throw error;
      }
    }

  } catch (e) {
    if (e.message.includes('not allowed') || e.message.includes('protocol')) {
      if (!e.errorType) e.errorType = 'FATAL';
      throw e;
    }
    const error = new Error('Invalid URL format');
    error.errorType = 'FATAL';
    throw error;
  }
}

async function extractFromJsonLd(html, url, testMetadata, logger) {
  const jsonLdMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);

  if (!jsonLdMatch || jsonLdMatch.length === 0) {
    return null;
  }

  logger.log(`📊 Found ${jsonLdMatch.length} JSON-LD scripts, trying structured data extraction...`);

  let allJsonLdData = [];
  
  for (const scriptTag of jsonLdMatch) {
    try {
      const jsonContent = scriptTag.replace(/<script[^>]*>/, '').replace(/<\/script>/, '').trim();
      const data = JSON.parse(jsonContent);

      let items = [];
      if (data['@graph']) {
        items = Array.isArray(data['@graph']) ? data['@graph'] : [data['@graph']];
      } else {
        items = Array.isArray(data) ? data : [data];
      }

      for (const item of items) {
        if (item['@type'] === 'Product' || item['@type']?.includes?.('Product')) {
          allJsonLdData.push(item);
          
          const name = item.name;

          let imageUrl = null;
          if (Array.isArray(item.image)) {
            const first = item.image[0];
            imageUrl = typeof first === 'string' ? first : first?.url;
          } else if (typeof item.image === 'object' && item.image !== null) {
            imageUrl = item.image.url;
          } else if (typeof item.image === 'string') {
            imageUrl = item.image;
          }

          if (imageUrl && !imageUrl.startsWith('http')) {
            imageUrl = null;
          }

          const offers = Array.isArray(item.offers) ? item.offers[0] : item.offers;
          if (offers) {
            const currentPrice = parseFloat(offers.price);
            const comparePrice = offers.highPrice ? parseFloat(offers.highPrice) : 
                                 offers.priceSpecification?.price ? parseFloat(offers.priceSpecification.price) : null;

            if (name && imageUrl && !isNaN(currentPrice)) {
              let salePrice, originalPrice;
              
              if (comparePrice && comparePrice > currentPrice) {
                salePrice = currentPrice;
                originalPrice = comparePrice;
              } else if (comparePrice && comparePrice < currentPrice) {
                salePrice = comparePrice;
                originalPrice = currentPrice;
                logger.log(`⚠️  Unusual: offers.price > highPrice, swapping them`);
              } else {
                salePrice = currentPrice;
                originalPrice = null;
              }

              const percentOff = originalPrice ? Math.round(((originalPrice - salePrice) / originalPrice) * 100) : 0;

              logger.log('✅ Extracted from JSON-LD (confidence: 95):', { name, salePrice, originalPrice });

              testMetadata.phaseUsed = 'json-ld';
              testMetadata.imageExtraction.source = 'json-ld';

              return {
                name,
                imageUrl,
                originalPrice,
                salePrice,
                percentOff,
                url,
                confidence: 95,
                complete: true
              };
            }
          }
        }
      }
    } catch (parseError) {
      continue;
    }
  }

  if (allJsonLdData.length > 0) {
    logger.log(`📊 Found ${allJsonLdData.length} JSON-LD product objects (incomplete data, will use for AI)`);
    return {
      rawJsonLd: allJsonLdData,
      complete: false
    };
  }

  return null;
}

async function extractFromHtmlDeterministic(html, url, testMetadata, logger) {
  logger.log('🔬 Starting deterministic HTML extraction...');
  
  let foundPrices = {
    salePrice: null,
    originalPrice: null,
    source: null
  };

  const shopifyJsonMatch = html.match(/<script[^>]*type=["']application\/json["'][^>]*data-product-json[^>]*>([\s\S]*?)<\/script>/i);
  if (shopifyJsonMatch) {
    try {
      const productData = JSON.parse(shopifyJsonMatch[1]);
      if (productData.price && productData.compare_at_price) {
        foundPrices.salePrice = productData.price / 100;
        foundPrices.originalPrice = productData.compare_at_price / 100;
        foundPrices.source = 'shopify-json';
        logger.log(`💰 Found Shopify JSON prices: $${foundPrices.salePrice} (was $${foundPrices.originalPrice})`);
      } else if (productData.variants && Array.isArray(productData.variants) && productData.variants.length > 0) {
        const firstVariant = productData.variants[0];
        if (firstVariant.price && firstVariant.compare_at_price) {
          foundPrices.salePrice = firstVariant.price / 100;
          foundPrices.originalPrice = firstVariant.compare_at_price / 100;
          foundPrices.source = 'shopify-json-variant';
          logger.log(`💰 Found Shopify variant prices: $${foundPrices.salePrice} (was $${foundPrices.originalPrice})`);
        }
      }
    } catch (e) {
      logger.log('⚠️  Failed to parse Shopify JSON:', e.message);
    }
  }

  if (!foundPrices.source) {
    const microdataPattern = /<[^>]*itemprop=["']price["'][^>]*content=["']([^"']+)["'][^>]*>/gi;
    const comparePricePattern = /<[^>]*itemprop=["'](?:highPrice|listPrice)["'][^>]*content=["']([^"']+)["'][^>]*>/gi;
    
    const priceMatches = [...html.matchAll(microdataPattern)];
    const compareMatches = [...html.matchAll(comparePricePattern)];
    
    if (priceMatches.length > 0) {
      const currentPrice = parseFloat(priceMatches[0][1]);
      const comparePrice = compareMatches.length > 0 ? parseFloat(compareMatches[0][1]) : null;
      
      if (!isNaN(currentPrice)) {
        if (comparePrice && comparePrice > currentPrice) {
          foundPrices.salePrice = currentPrice;
          foundPrices.originalPrice = comparePrice;
          foundPrices.source = 'microdata';
          logger.log(`💰 Found microdata prices: $${currentPrice} (was $${comparePrice})`);
        }
      }
    }
  }

  if (foundPrices.source && foundPrices.salePrice && foundPrices.originalPrice > foundPrices.salePrice) {
    const percentOff = Math.round(((foundPrices.originalPrice - foundPrices.salePrice) / foundPrices.originalPrice) * 100);
    
    testMetadata.phaseUsed = 'html-deterministic';
    testMetadata.priceValidation.foundInHtml = true;
    testMetadata.priceValidation.checkedFormats.push(foundPrices.source);
    
    return {
      originalPrice: foundPrices.originalPrice,
      salePrice: foundPrices.salePrice,
      percentOff: percentOff,
      source: foundPrices.source,
      complete: false,
      confidence: 88
    };
  }

  logger.log('⚠️  No deterministic prices found');
  return null;
}

async function extractWithAI(html, url, openai, testMetadata, logger, jsonLdResult = null, deterministicResult = null) {
  let preExtractedImage = null;
  const ogImageMatch = html.match(/<meta[^>]*(?:property|name)=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']og:image["']/i);
  const twitterImageMatch = html.match(/<meta[^>]*(?:property|name)=["']twitter:image["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']twitter:image["']/i);

  if (ogImageMatch && ogImageMatch[1] && ogImageMatch[1].startsWith('http')) {
    preExtractedImage = ogImageMatch[1];
    testMetadata.imageExtraction.preExtracted = true;
    testMetadata.imageExtraction.source = 'og:image';
    logger.log(`🖼️  Pre-extracted og:image: ${preExtractedImage}`);
  } else if (twitterImageMatch && twitterImageMatch[1] && twitterImageMatch[1].startsWith('http')) {
    preExtractedImage = twitterImageMatch[1];
    testMetadata.imageExtraction.preExtracted = true;
    testMetadata.imageExtraction.source = 'twitter:image';
    logger.log(`🖼️  Pre-extracted twitter:image: ${preExtractedImage}`);
  }

  let contentToSend;
  let isJsonLd = false;

  if (jsonLdResult && jsonLdResult.rawJsonLd) {
    contentToSend = JSON.stringify(jsonLdResult.rawJsonLd, null, 2);
    isJsonLd = true;
    logger.log(`📊 Sending JSON-LD to OpenAI (${contentToSend.length} chars)`);
  } else {
    const pricePatterns = [
      /<[^>]*class="[^"]*price[^"]*"[^>]*>[\s\S]{0,500}<\/[^>]+>/gi,
      /<[^>]*class="[^"]*product[^"]*"[^>]*>[\s\S]{0,1000}<\/[^>]+>/gi,
      /<script type="application\/json"[^>]*>[\s\S]{0,5000}<\/script>/gi,
      /<meta[^>]*property="og:(?:title|image|price)"[^>]*>/gi,
      /<h1[^>]*>[\s\S]{0,200}<\/h1>/gi,
      /<[^>]*itemprop=["'](?:price|name|image)["'][^>]*>/gi
    ];

    let extractedSnippets = [];
    for (const pattern of pricePatterns) {
      const matches = html.match(pattern);
      if (matches) {
        extractedSnippets.push(...matches);
      }
    }

    contentToSend = extractedSnippets.length > 0
      ? extractedSnippets.join('\n').substring(0, 50000)
      : html.substring(0, 50000);

    logger.log(`📝 Extracted ${extractedSnippets.length} relevant HTML sections (${contentToSend.length} chars)`);
  }

  const systemPrompt = isJsonLd 
    ? `You are a product data parser. Extract from JSON-LD (schema.org Product format) and return ONLY valid JSON.

PRICE EXTRACTION RULES:
1. "offers.price" = CURRENT selling price (this is salePrice)
2. "offers.highPrice" OR "offers.priceSpecification.price" = ORIGINAL/regular price (this is originalPrice)
3. If BOTH exist and highPrice > price, then there's a discount
4. If only ONE price exists, set originalPrice to null and percentOff to 0
5. NEVER swap the prices - current price is ALWAYS the lower sale price

Return this structure:
{
  "name": "Product Name (without brand)",
  "brand": "Brand Name",
  "imageUrl": "https://...",
  "originalPrice": 999.99,
  "salePrice": 499.99,
  "percentOff": 50,
  "confidence": 90
}

Rules:
- Remove brand from product name
- confidence: 85-95 for JSON-LD
- If no discount, originalPrice = null, percentOff = 0`
    : `You are a product page parser. Extract data from HTML and return ONLY valid JSON.

🚨 CRITICAL PRICE RULES (READ CAREFULLY):

You MUST identify TWO prices if a sale is active:
1. **ORIGINAL PRICE** = The HIGHER, crossed-out, or "was" price (what it cost before the sale)
2. **SALE PRICE** = The LOWER, current, active price (what you pay now)

ORIGINAL PRICE indicators:
- Inside <s>, <del>, <strike> tags
- Classes: "compare-price", "was-price", "original-price", "line-through", "strike-through"
- Text near: "Was $", "Originally $", "Compare at $", "Regular price $", "Retail $"
- In Shopify JSON: "compare_at_price" field (divide by 100 if in cents)
- In structured data: "highPrice", "listPrice" in microdata/JSON-LD

SALE PRICE indicators:
- The prominent, active selling price
- Usually larger font, red/highlighted
- Classes: "sale-price", "current-price", "final-price"
- In Shopify JSON: "price" field (divide by 100 if in cents)
- In structured data: "price" in microdata/JSON-LD

⚠️ VALIDATION CHECKS:
1. originalPrice MUST be HIGHER than salePrice (if both exist)
2. If you find two prices but they're equal, set originalPrice = null
3. If you only find ONE price, set originalPrice = null, percentOff = 0
4. NEVER return the same value for both prices
5. For Shopify stores: "compare_at_price" is ALWAYS originalPrice, "price" is ALWAYS salePrice

DEPARTMENT STORE SPECIFIC:
- Nordstrom: Look for "OfferPrice" (sale) and "RetailPrice" (original) in JSON
- Saks: Check for sale-price vs regular-price classes
- Neiman Marcus: Look for "listPrice" vs "offerPrice"

Return this structure:
{
  "name": "Product Name Only (no brand)",
  "brand": "Actual Brand (not store name)",
  "imageUrl": "Real product image URL",
  "originalPrice": 435.00,
  "salePrice": 131.00,
  "percentOff": 70,
  "confidence": 85
}

Confidence scoring:
- 90-100: Prices in structured data (JSON, microdata) with clear original/sale distinction
- 70-89: Prices in HTML with clear patterns (strikethrough, "was" text)
- 50-69: Ambiguous or only one price found
- Below 50: Highly uncertain, missing data

NEVER use placeholder images. Return {"error": "..."} if you can't extract required data.`;

  let userPrompt = contentToSend;
  
  if (isJsonLd) {
    userPrompt = `Here is the JSON-LD structured product data:\n\n${contentToSend}`;
    if (preExtractedImage) {
      userPrompt += `\n\nNOTE: Pre-extracted image URL: ${preExtractedImage} - use this if JSON-LD image is missing.`;
    }
  } else {
    if (preExtractedImage) {
      userPrompt = `${contentToSend}\n\nNOTE: Pre-extracted image URL: ${preExtractedImage} - use this for imageUrl.`;
    }
  }
  
  if (deterministicResult && deterministicResult.salePrice && deterministicResult.originalPrice) {
    userPrompt += `\n\n✅ VERIFIED PRICES (use these exact values):
- Sale Price (current price): $${deterministicResult.salePrice}
- Original Price (was price): $${deterministicResult.originalPrice}
- Percent Off: ${deterministicResult.percentOff}%
- Source: ${deterministicResult.source}

These were extracted from reliable structured data. Use these EXACT prices. Only extract name and image.`;
  }

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content: userPrompt
      }
    ],
    temperature: 0.1,
  });

  const aiResponse = completion.choices[0].message.content.trim();
  logger.log('🤖 AI Response:', aiResponse);

  let productData;
  try {
    const jsonString = aiResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    productData = JSON.parse(jsonString);
  } catch (parseError) {
    const error = new Error('Failed to parse AI response');
    error.errorType = 'FATAL';
    throw error;
  }

  if (productData.error) {
    const error = new Error(productData.error);
    error.errorType = 'FATAL';
    throw error;
  }

  if (!productData.name || !productData.imageUrl || productData.salePrice === undefined) {
    const error = new Error('Missing required product fields');
    error.errorType = 'FATAL';
    throw error;
  }

  const placeholderDomains = ['example.com', 'placeholder.com', 'via.placeholder.com', 'placehold.it', 'dummyimage.com'];
  const imageUrl = productData.imageUrl.toLowerCase();
  if (placeholderDomains.some(domain => imageUrl.includes(domain))) {
    const error = new Error('AI returned placeholder image URL');
    error.errorType = 'FATAL';
    throw error;
  }

  let originalPrice, salePrice, percentOff = 0;
  let confidence = productData.confidence ? parseInt(productData.confidence) : 50;
  
  if (deterministicResult && deterministicResult.salePrice && deterministicResult.originalPrice) {
    originalPrice = deterministicResult.originalPrice;
    salePrice = deterministicResult.salePrice;
    percentOff = deterministicResult.percentOff;
    confidence = Math.max(confidence, 88);
    logger.log(`✅ Using deterministic prices: $${salePrice} (was $${originalPrice})`);
  } else {
    originalPrice = productData.originalPrice !== null && productData.originalPrice !== undefined ? parseFloat(productData.originalPrice) : null;
    salePrice = parseFloat(productData.salePrice);

    if (isNaN(salePrice)) {
      const error = new Error('Invalid sale price');
      error.errorType = 'FATAL';
      throw error;
    }

    if (originalPrice !== null) {
      if (isNaN(originalPrice)) {
        logger.log(`⚠️  Invalid originalPrice (${productData.originalPrice}), setting to null`);
        originalPrice = null;
        percentOff = 0;
        confidence = Math.max(30, confidence - 20);
      } else if (originalPrice <= salePrice) {
        logger.log(`⚠️  Invalid: originalPrice ($${originalPrice}) <= salePrice ($${salePrice}). Setting originalPrice to null.`);
        originalPrice = null;
        percentOff = 0;
        confidence = Math.max(30, confidence - 25);
      } else if (originalPrice === salePrice) {
        logger.log(`⚠️  Prices are equal ($${originalPrice}), no discount. Setting originalPrice to null.`);
        originalPrice = null;
        percentOff = 0;
        confidence = Math.max(40, confidence - 15);
      } else {
        percentOff = Math.round(((originalPrice - salePrice) / originalPrice) * 100);
        
        if (productData.percentOff && Math.abs(percentOff - productData.percentOff) > 2) {
          logger.log(`⚠️  Percent off mismatch: AI said ${productData.percentOff}%, calculated ${percentOff}%`);
          confidence = Math.max(40, confidence - 15);
        }
      }
    }
  }

  if (!deterministicResult) {
    const priceVariants = [
      `$${salePrice.toFixed(2)}`,
      salePrice.toFixed(2),
      String(Math.round(salePrice * 100)),
      `${Math.floor(salePrice)}`,
    ];

    const matchedFormat = priceVariants.find(variant => html.includes(variant));
    const foundInHtml = matchedFormat !== undefined;

    testMetadata.priceValidation.foundInHtml = foundInHtml;

    if (!foundInHtml) {
      logger.log(`⚠️  Sale price $${salePrice} not found in HTML, possible hallucination`);
      confidence = Math.max(30, confidence - 20);
      testMetadata.confidenceAdjustments.push({
        reason: 'price_not_found_in_html',
        adjustment: -20
      });
    }
  }

  if (confidence < 50) {
    const error = new Error(`Low confidence (${confidence}%) - data may be inaccurate`);
    error.errorType = 'FATAL';
    throw error;
  }

  logger.log(`✅ Extracted product (confidence: ${confidence}%):`, { 
    name: productData.name, 
    brand: productData.brand, 
    salePrice, 
    originalPrice, 
    percentOff 
  });

  testMetadata.phaseUsed = 'ai-extraction';

  return {
    name: productData.name,
    brand: productData.brand || null,
    imageUrl: productData.imageUrl,
    originalPrice: originalPrice,
    salePrice: salePrice,
    percentOff: percentOff,
    url: url,
    confidence: confidence
  };
}