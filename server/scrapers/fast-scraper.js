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
      timeout: 10000
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
            const salePrice = parseFloat(offers.price);
            const originalPrice = offers.priceSpecification?.price || offers.highPrice || null;

            if (name && imageUrl && !isNaN(salePrice)) {
              const finalOriginalPrice = originalPrice && !isNaN(parseFloat(originalPrice)) ? parseFloat(originalPrice) : null;
              let percentOff = 0;

              if (finalOriginalPrice && finalOriginalPrice > salePrice) {
                percentOff = Math.round(((finalOriginalPrice - salePrice) / finalOriginalPrice) * 100);
              }

              logger.log('✅ Extracted from JSON-LD (confidence: 95):', { name, salePrice, originalPrice: finalOriginalPrice });

              testMetadata.phaseUsed = 'json-ld';
              testMetadata.imageExtraction.source = 'json-ld';

              return {
                name,
                imageUrl,
                originalPrice: finalOriginalPrice,
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
  logger.log('🔬 Starting deterministic HTML extraction (Shopify only)...');
  
  let foundPrices = {
    salePrice: null,
    originalPrice: null,
    source: null
  };

  // ONLY trust Shopify's data-product-json attribute (guaranteed to be main product)
  // For other stores (Nordstrom, Saks, etc.), the AI handles extraction better
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

  // Note: We intentionally DO NOT scan for other JSON sources, strikethrough tags, or price classes
  // because it's too risky to identify the correct product vs recommendation carousels.
  // The AI extraction is more context-aware and handles non-Shopify stores better.

  // Return results if we found valid prices
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
      complete: false, // Still need name and image from AI
      confidence: 88 // High confidence for deterministic extraction
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
    logger.log(`📊 Sending JSON-LD to OpenAI (${contentToSend.length} chars) - saving ~${Math.round((1 - contentToSend.length / 50000) * 100)}% tokens`);
  } else {
    const pricePatterns = [
      /<[^>]*class="[^"]*price[^"]*"[^>]*>[\s\S]{0,500}<\/[^>]+>/gi,
      /<[^>]*class="[^"]*product[^"]*"[^>]*>[\s\S]{0,1000}<\/[^>]+>/gi,
      /<script type="application\/json"[^>]*>[\s\S]{0,5000}<\/script>/gi,
      /<meta[^>]*property="og:(?:title|image|price)"[^>]*>/gi,
      /<h1[^>]*>[\s\S]{0,200}<\/h1>/gi
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
    ? `You are a product data parser. You will receive structured JSON-LD product data (schema.org Product format). Extract the product information and return ONLY valid JSON.

INSTRUCTIONS FOR JSON-LD PARSING:
1. Look for Product objects with @type: "Product"
2. Extract name, image, and offers data
3. For prices:
   - offers.price or offers[0].price = salePrice (current price)
   - offers.highPrice or offers.priceSpecification.price = originalPrice (compare-at price)
   - If only one price exists, set originalPrice to null
4. For images:
   - Use image field (can be string, object with url, or array)
   - Ensure it's a valid absolute URL
5. Calculate percentOff if both prices exist and originalPrice > salePrice

Return this exact structure:
{
  "name": "Product Name",
  "imageUrl": "https://...",
  "originalPrice": 999.99,
  "salePrice": 499.99,
  "percentOff": 50,
  "confidence": 90
}

Rules:
- confidence: Use 85-95 for JSON-LD data (it's highly reliable)
- If originalPrice is null or equals salePrice, set percentOff to 0
- Return ONLY the JSON object, no markdown, no explanations
- If you can't extract basic product info, return: {"error": "Could not extract product data"}`
    : `You are a product page parser. Extract product information from HTML and return ONLY valid JSON.

CRITICAL INSTRUCTIONS FOR PRICE EXTRACTION:
1. Look for TWO distinct prices on the page:
   - Original/Compare-at/Regular price (usually crossed out or higher price)
   - Current/Sale price (the active selling price)

2. SHOPIFY-SPECIFIC PATTERNS (check these FIRST):
   - <compare-at-price> tags containing the regular price
   - <sale-price> tags containing the sale price  
   - JSON in <script type="application/json"> with "compare_at_price" and "price" fields (prices in CENTS, divide by 100)
   - Example: "price":13100,"compare_at_price":43500 means salePrice=$131, originalPrice=$435

3. OTHER HTML PATTERNS:
   - <s>, <del>, <strike> tags with higher price
   - Classes: "compare-price", "was-price", "original-price", "line-through"
   - Text: "Was $X", "Originally $X", "Compare at $X", "Regular price $X"
   - Meta tags: og:price, product:price

4. If BOTH prices exist, originalPrice MUST be HIGHER than salePrice
5. If only ONE price exists, set originalPrice to null and percentOff to 0

CRITICAL INSTRUCTIONS FOR IMAGE EXTRACTION:
- Look for <meta property="og:image"> or <meta name="twitter:image"> tags FIRST
- Then look for large product images in <img> tags
- NEVER use placeholder domains like example.com, placeholder.com, cdn.example.com, or similar
- The imageUrl MUST be a real, working URL from the actual website
- If you can't find a real image URL, use the first large image you can find

Return this exact structure (do NOT copy these example values, extract REAL data):
{
  "name": "ACTUAL_PRODUCT_NAME_FROM_PAGE",
  "imageUrl": "ACTUAL_IMAGE_URL_FROM_PAGE",
  "originalPrice": 999.99,
  "salePrice": 499.99,
  "percentOff": 50,
  "confidence": 85
}

Rules:
- name: Extract product title/name (required)
- imageUrl: Find the main product image URL - must be a REAL absolute URL from the website, NOT a placeholder (required)
- originalPrice: The HIGHER regular/compare-at price. Set to null if only one price exists.
- salePrice: The CURRENT selling price (required)
- percentOff: Calculate as Math.round(((originalPrice - salePrice) / originalPrice) * 100). Set to 0 if originalPrice is null.
- confidence: Rate your confidence 1-100. Use 90-100 for prices clearly visible in structured data, 70-89 for prices in HTML with clear patterns, 50-69 for estimates, below 50 for highly uncertain.
- For Shopify JSON prices in cents, divide by 100 to get dollar amounts
- NEVER set originalPrice equal to salePrice
- Return ONLY the JSON object, no markdown, no explanations
- If you can't extract basic product info, return: {"error": "Could not extract product data"}`;

  let userPrompt = contentToSend;
  
  if (isJsonLd) {
    userPrompt = `Here is the JSON-LD structured product data:\n\n${contentToSend}`;
    if (preExtractedImage) {
      userPrompt += `\n\nNOTE: The product image URL has been pre-extracted as: ${preExtractedImage} - use this for imageUrl if the JSON-LD image is missing or invalid.`;
    }
  } else {
    if (preExtractedImage) {
      userPrompt = `${contentToSend}\n\nNOTE: The product image URL has been pre-extracted as: ${preExtractedImage} - use this for imageUrl.`;
    }
  }
  
  // Add deterministic prices to the prompt if found
  if (deterministicResult && deterministicResult.salePrice && deterministicResult.originalPrice) {
    userPrompt += `\n\nIMPORTANT - DETERMINISTIC PRICES FOUND:
- Sale Price: ${deterministicResult.salePrice}
- Original Price: ${deterministicResult.originalPrice}
- Source: ${deterministicResult.source}

These prices were extracted from reliable structured data (${deterministicResult.source}). You MUST use these exact prices in your response. Only extract the product name and image URL.`;
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
    throw new Error('AI returned placeholder image URL instead of real product image');
  }

  // Override AI prices with deterministic prices if found
  let originalPrice, salePrice, percentOff = 0;
  let confidence = productData.confidence ? parseInt(productData.confidence) : 50;
  
  if (deterministicResult && deterministicResult.salePrice && deterministicResult.originalPrice) {
    // Use deterministic prices (highly reliable)
    originalPrice = deterministicResult.originalPrice;
    salePrice = deterministicResult.salePrice;
    percentOff = deterministicResult.percentOff;
    confidence = Math.max(confidence, 88); // Boost confidence for deterministic extraction
    logger.log(`✅ Using deterministic prices: $${salePrice} (was $${originalPrice}) from ${deterministicResult.source}`);
    testMetadata.priceValidation.foundInHtml = true;
    testMetadata.priceValidation.checkedFormats.push(deterministicResult.source);
  } else {
    // Use AI-extracted prices
    originalPrice = productData.originalPrice !== null && productData.originalPrice !== undefined ? parseFloat(productData.originalPrice) : null;
    salePrice = parseFloat(productData.salePrice);

    if (isNaN(salePrice) || (originalPrice !== null && isNaN(originalPrice))) {
      throw new Error('Invalid price data');
    }

    if (originalPrice !== null && originalPrice <= salePrice) {
      logger.log(`⚠️  Invalid discount: originalPrice (${originalPrice}) <= salePrice (${salePrice}). Setting originalPrice to null.`);
      originalPrice = null;
      percentOff = 0;
      confidence = Math.max(30, confidence - 20);
    }
  }

  // Calculate percentOff for AI prices (deterministic already has it)
  if (!deterministicResult && originalPrice !== null && originalPrice > salePrice) {
    const calculatedPercentOff = Math.round(((originalPrice - salePrice) / originalPrice) * 100);

    if (productData.percentOff && Math.abs(calculatedPercentOff - productData.percentOff) > 2) {
      logger.log(`⚠️  Percent off mismatch: AI said ${productData.percentOff}%, calculated ${calculatedPercentOff}%`);
      confidence = Math.max(40, confidence - 15);
    }

    percentOff = calculatedPercentOff;
  }

  // Skip HTML validation for deterministic prices (already validated)
  if (!deterministicResult) {
    const priceVariants = [
      `$${salePrice.toFixed(2)}`,
      salePrice.toFixed(2),
      `$${salePrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      salePrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      `${salePrice.toFixed(2).replace('.', ',')}`,
      String(Math.round(salePrice * 100)),
      `${Math.floor(salePrice)}.${String(Math.round((salePrice % 1) * 100)).padStart(2, '0')}`,
      `$${Math.round(salePrice)}`,
      `$${Math.round(salePrice).toLocaleString('en-US')}`,
      String(Math.round(salePrice)),
    ];

    const matchedFormat = priceVariants.find(variant => html.includes(variant));
    const foundInHtml = matchedFormat !== undefined;

    testMetadata.priceValidation.foundInHtml = foundInHtml;
    testMetadata.priceValidation.checkedFormats = priceVariants.map((variant, idx) => ({
      format: variant,
      matched: html.includes(variant)
    }));
    testMetadata.priceValidation.matchedFormat = matchedFormat || null;

    if (!foundInHtml) {
      logger.log(`⚠️  Sale price ${salePrice} not found in HTML, possible hallucination`);
      const originalConfidence = confidence;
      confidence = Math.max(30, confidence - 20);
      testMetadata.confidenceAdjustments.push({
        reason: 'price_not_found_in_html',
        adjustment: confidence - originalConfidence
      });
    }
  }

  if (confidence < 50) {
    throw new Error(`Low confidence (${confidence}%) - prices may be inaccurate`);
  }

  logger.log(`✅ Extracted product (confidence: ${confidence}%):`, { name: productData.name, salePrice, originalPrice, percentOff });

  testMetadata.phaseUsed = 'ai-extraction';

  return {
    name: productData.name,
    imageUrl: productData.imageUrl,
    originalPrice: originalPrice,
    salePrice: salePrice,
    percentOff: percentOff,
    url: url,
    confidence: confidence
  };
}
