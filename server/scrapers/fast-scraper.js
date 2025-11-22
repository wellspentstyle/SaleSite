export async function scrapeProduct(url, options = {}) {
  const {
    openai,
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
    throw new Error('Failed to parse AI response');
  }

  if (productData.error) {
    throw new Error(productData.error);
  }

  if (!productData.name || !productData.imageUrl || productData.salePrice === undefined) {
    throw new Error('Missing required product fields');
  }

  const placeholderDomains = ['example.com', 'placeholder.com', 'via.placeholder.com', 'placehold.it', 'dummyimage.com'];
  const imageUrl = productData.imageUrl.toLowerCase();
  if (placeholderDomains.some(domain => imageUrl.includes(domain))) {
    throw new Error('AI returned placeholder image URL');
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
      throw new Error('Invalid sale price');
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
    throw new Error(`Low confidence (${confidence}%) - data may be inaccurate`);
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
