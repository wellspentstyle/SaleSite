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
    confidenceAdjustments: []
  };

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
        
        // Now fetch the page for fresh sale price
        logger.log('📄 [Fast Scraper] Fetching page for fresh sale price...');
        
        const freshPrice = await fetchFreshSalePrice(url, fetchImpl, logger);
        
        if (freshPrice) {
          // Combine Google Shopping data with fresh price
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
          
          // Calculate percent off
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
    logger.error('❌ [Fast Scraper] Error:', error.message);
    return {
      success: false,
      error: error.message,
      meta: {
        method: 'fast',
        phase: 'error',
        confidence: 0,
        durationMs: Date.now() - startTime,
        testMetadata: enableTestMetadata ? testMetadata : undefined
      }
    };
  }
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
      throw new Error('Invalid URL protocol');
    }

    const hostname = urlObj.hostname.toLowerCase();

    const blockedHosts = ['localhost', 'localhost.localdomain', '0.0.0.0'];
    if (blockedHosts.includes(hostname)) {
      throw new Error('Private URLs not allowed');
    }

    const ipv4Pattern = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const ipMatch = hostname.match(ipv4Pattern);
    if (ipMatch) {
      const [, a, b, c, d] = ipMatch.map(Number);
      if (a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)) {
        throw new Error('Private URLs not allowed');
      }
    }

    if (hostname.includes(':')) {
      if (hostname === '::1' || hostname.startsWith('fe80:') || hostname.startsWith('::ffff:127')) {
        throw new Error('Private URLs not allowed');
      }
    }

  } catch (e) {
    if (e.message.includes('not allowed') || e.message.includes('protocol')) {
      throw e;
    }
    throw new Error('Invalid URL format');
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

  const relevantSections = extractRelevantSections(html);
  logger.log(`📝 Extracted ${relevantSections.length} relevant HTML sections (${relevantSections.join('').length} chars)`);

  if (relevantSections.join('').length === 0) {
    throw new Error('No relevant HTML sections found for extraction');
  }

  let systemPrompt = `You are a product data extractor. Extract product information from HTML.

Return a JSON object with:
- name: Product name (string)
- brand: Brand name if clearly visible (string or null)
- imageUrl: Full URL to main product image (string)
- originalPrice: Original/retail price before discount (number or null)
- salePrice: Current discounted price (number, required)

Requirements:
- Return ONLY valid JSON, no explanations
- Prices must be numbers (e.g., 129.99, not "$129.99")
- imageUrl must be a complete URL starting with http
- If no discount/sale: set originalPrice to null and salePrice to current price
- If originalPrice exists, it MUST be higher than salePrice`;

  if (preExtractedImage) {
    systemPrompt += `\n- Image already extracted: ${preExtractedImage}`;
  }

  if (jsonLdResult?.rawJsonLd) {
    systemPrompt += `\n- Use this JSON-LD data when available: ${JSON.stringify(jsonLdResult.rawJsonLd[0])}`;
  }

  if (deterministicResult) {
    systemPrompt += `\n- Confirmed prices from HTML: salePrice=$${deterministicResult.salePrice}, originalPrice=$${deterministicResult.originalPrice}`;
  }

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Extract product data from this HTML:\n\n${relevantSections.join('\n\n---\n\n')}` }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 500
    });

    const extracted = JSON.parse(completion.choices[0].message.content);
    logger.log('🤖 AI Response:', extracted);

    if (extracted.error) {
      throw new Error(extracted.error);
    }

    let confidence = 75;
    let name = extracted.name || null;
    let imageUrl = preExtractedImage || extracted.imageUrl || null;
    let salePrice = extracted.salePrice ? parseFloat(extracted.salePrice) : null;
    let originalPrice = extracted.originalPrice ? parseFloat(extracted.originalPrice) : null;
    let brand = extracted.brand || null;

    if (jsonLdResult?.rawJsonLd?.[0]?.name) {
      name = jsonLdResult.rawJsonLd[0].name;
      confidence += 10;
      testMetadata.confidenceAdjustments.push('+10: name from JSON-LD');
    }

    if (preExtractedImage) {
      confidence += 5;
      testMetadata.confidenceAdjustments.push('+5: image pre-extracted from meta tags');
    }

    if (deterministicResult && deterministicResult.salePrice && deterministicResult.originalPrice) {
      salePrice = deterministicResult.salePrice;
      originalPrice = deterministicResult.originalPrice;
      confidence = Math.max(confidence, 88);
      logger.log(`✅ Using deterministic prices: $${salePrice} (was $${originalPrice})`);
    } else {
      if (originalPrice && salePrice && originalPrice > salePrice) {
        const discountPercent = ((originalPrice - salePrice) / originalPrice) * 100;
        if (discountPercent >= 10 && discountPercent <= 80) {
          confidence += 3;
          testMetadata.confidenceAdjustments.push('+3: discount looks reasonable');
        }
      }
    }

    if (!name) throw new Error('Missing product name');
    if (!imageUrl) throw new Error('Missing image URL');
    if (!salePrice || isNaN(salePrice)) throw new Error('Missing or invalid sale price');

    if (salePrice <= 0 || salePrice > 50000) {
      throw new Error(`Sale price out of reasonable range: $${salePrice}`);
    }

    if (originalPrice !== null) {
      if (isNaN(originalPrice) || originalPrice <= 0 || originalPrice > 50000) {
        logger.log(`⚠️  Invalid original price ($${originalPrice}), setting to null`);
        originalPrice = null;
      } else if (originalPrice <= salePrice) {
        logger.log(`⚠️  Original price not higher than sale price, setting to null`);
        originalPrice = null;
      }
    }

    const percentOff = originalPrice ? Math.round(((originalPrice - salePrice) / originalPrice) * 100) : 0;

    testMetadata.phaseUsed = 'ai-extraction';
    testMetadata.priceValidation.foundInHtml = !!deterministicResult;

    logger.log(`✅ Extracted with AI (confidence: ${confidence}):`, { name, brand, salePrice, originalPrice, percentOff });

    return {
      name,
      brand,
      imageUrl,
      originalPrice,
      salePrice,
      percentOff,
      url,
      confidence
    };

  } catch (error) {
    if (error.message?.includes('filtered') || error.response?.data?.error?.code === 'content_filter') {
      logger.log('⚠️  AI content filter triggered, likely a false positive');
    }
    throw new Error(`AI extraction failed: ${error.message}`);
  }
}

function extractRelevantSections(html) {
  const sections = [];
  
  const productInfoRegex = /<div[^>]*(?:class|id)=["'][^"']*(?:product|item|details)[^"']*["'][^>]*>([\s\S]{50,2000}?)<\/div>/gi;
  let match;
  while ((match = productInfoRegex.exec(html)) !== null && sections.length < 5) {
    sections.push(cleanHtml(match[1]));
  }

  const metaTags = [];
  const metaRegex = /<meta[^>]*(?:property|name)=["'](?:og:|twitter:|product:)[^"']*["'][^>]*content=["']([^"']+)["'][^>]*>/gi;
  while ((match = metaRegex.exec(html)) !== null) {
    metaTags.push(match[0]);
  }
  if (metaTags.length > 0) {
    sections.push(metaTags.join('\n'));
  }

  return sections;
}

function cleanHtml(html) {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
