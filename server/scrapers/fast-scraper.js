// SIMPLIFIED PRODUCT SCRAPER
// Flow: AI URL inference → Google Shopping → JSON-LD → AI extraction

export async function scrapeProduct(url, options = {}) {
  const {
    openai,
    scraperApiKey = process.env.SCRAPER_API_KEY,
    fetchImpl = fetch,
    enableTestMetadata = false,
    logger = console,
    shouldAutofillBrand = () => true
  } = options;

  if (!openai) {
    throw createError('OpenAI client is required', 'FATAL');
  }

  const startTime = Date.now();
  const testMetadata = {
    phaseUsed: null,
    retryCount: 0
  };

  return await retryWithBackoff(
    async () => {
      try {
        validateUrl(url);
        logger.log(`🔍 [Scraper] Starting: ${url}`);

        // ============================================
        // STEP 1: FETCH PAGE HTML
        // ============================================
        logger.log('📄 [Scraper] Fetching page HTML...');

        const response = await fetchImpl(url, {
          redirect: 'follow',
          timeout: 10000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          }
        });

        if (!response.ok) {
          throw createError(
            `HTTP ${response.status}: ${response.statusText}`,
            classifyHttpError(response.status),
            response.status
          );
        }

        const html = await response.text();
        logger.log(`📄 [Scraper] Fetched ${html.length} characters`);

        // ============================================
        // STEP 2: TRY JSON-LD EXTRACTION
        // ============================================
        const jsonLdResult = await extractFromJsonLd(html, url, logger);

        if (jsonLdResult?.complete) {
          testMetadata.phaseUsed = 'json-ld';

          return {
            success: true,
            product: jsonLdResult,
            meta: {
              method: 'simplified',
              phase: testMetadata.phaseUsed,
              confidence: jsonLdResult.confidence,
              durationMs: Date.now() - startTime,
              testMetadata: enableTestMetadata ? testMetadata : undefined
            }
          };
        }

        // ============================================
        // STEP 3: TRY AI EXTRACTION
        // ============================================
        logger.log('🤖 [AI] Using AI extraction...');

        const aiResult = await extractWithAI(
          html, 
          url, 
          openai, 
          logger, 
          jsonLdResult
        );

        testMetadata.phaseUsed = 'ai-extraction';

        // If AI extraction has good confidence, return it
        if (aiResult.confidence >= 60) {
          logger.log(`✅ [AI] Success with confidence ${aiResult.confidence}%`);

          return {
            success: true,
            product: aiResult,
            meta: {
              method: 'simplified',
              phase: testMetadata.phaseUsed,
              confidence: aiResult.confidence,
              durationMs: Date.now() - startTime,
              testMetadata: enableTestMetadata ? testMetadata : undefined
            }
          };
        }

        // ============================================
        // STEP 4: FALLBACK - GOOGLE SHOPPING
        // ============================================
        logger.log(`⚠️  [AI] Low confidence (${aiResult.confidence}%), trying Google Shopping backup...`);

        if (!scraperApiKey) {
          logger.log('⚠️  [Google Shopping] No ScraperAPI key, returning low-confidence AI result');
          return {
            success: true,
            product: aiResult,
            meta: {
              method: 'simplified',
              phase: testMetadata.phaseUsed,
              confidence: aiResult.confidence,
              durationMs: Date.now() - startTime,
              testMetadata: enableTestMetadata ? testMetadata : undefined
            }
          };
        }

        // Infer product name from URL for Google Shopping search
        const urlInfo = await inferProductFromUrl(url, openai, logger);
        logger.log(`🤖 [AI] Inferred from URL: "${urlInfo.productName}" ${urlInfo.color ? `(${urlInfo.color})` : ''}`);

        if (!urlInfo.productName) {
          logger.log('⚠️  [Google Shopping] Could not infer product name, returning AI result');
          return {
            success: true,
            product: aiResult,
            meta: {
              method: 'simplified',
              phase: testMetadata.phaseUsed,
              confidence: aiResult.confidence,
              durationMs: Date.now() - startTime,
              testMetadata: enableTestMetadata ? testMetadata : undefined
            }
          };
        }

        const googleResult = await tryGoogleShopping(
          url, 
          urlInfo, 
          scraperApiKey, 
          fetchImpl, 
          logger
        );

        if (googleResult) {
          testMetadata.phaseUsed = 'google-shopping-backup';

          const product = {
            name: googleResult.name,
            brand: shouldAutofillBrand(url) ? googleResult.brand : null,
            imageUrl: googleResult.imageUrl,
            originalPrice: googleResult.originalPrice || googleResult.currentPrice,
            salePrice: googleResult.currentPrice,
            percentOff: 0,
            color: urlInfo.color || googleResult.color || null,
            url: url,
            confidence: 85
          };

          if (product.originalPrice && product.originalPrice > product.salePrice) {
            product.percentOff = Math.round(
              ((product.originalPrice - product.salePrice) / product.originalPrice) * 100
            );
          }

          logger.log(`✅ [Google Shopping] Backup success (confidence: ${product.confidence}%)`);

          return {
            success: true,
            product,
            meta: {
              method: 'simplified',
              phase: testMetadata.phaseUsed,
              confidence: product.confidence,
              durationMs: Date.now() - startTime,
              testMetadata: enableTestMetadata ? testMetadata : undefined
            }
          };
        }

        // Google Shopping failed too, return the AI result (even with low confidence)
        logger.log('⚠️  [Google Shopping] Failed, returning AI result');
        return {
          success: true,
          product: aiResult,
          meta: {
            method: 'simplified',
            phase: testMetadata.phaseUsed,
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
    3, // maxRetries
    logger,
    testMetadata
  ).catch(error => {
    logger.error('❌ [Scraper] Error:', error.message);
    return {
      success: false,
      error: error.message,
      errorType: error.errorType || 'UNKNOWN',
      meta: {
        method: 'simplified',
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
// UTILITY FUNCTIONS
// ============================================

function createError(message, errorType = 'FATAL', statusCode = null) {
  const error = new Error(message);
  error.errorType = errorType;
  if (statusCode) error.statusCode = statusCode;
  return error;
}

function validateUrl(url) {
  try {
    const urlObj = new URL(url);

    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      throw createError('Invalid URL protocol', 'FATAL');
    }

    const hostname = urlObj.hostname.toLowerCase();

    // Block localhost and private IPs
    const blockedHosts = ['localhost', 'localhost.localdomain', '0.0.0.0'];
    if (blockedHosts.includes(hostname)) {
      throw createError('Private URLs not allowed', 'FATAL');
    }

    // Block private IPv4 ranges
    const ipv4Pattern = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const ipMatch = hostname.match(ipv4Pattern);
    if (ipMatch) {
      const [, a, b, c, d] = ipMatch.map(Number);
      const isPrivate = a === 10 || 
                       a === 127 || 
                       (a === 172 && b >= 16 && b <= 31) || 
                       (a === 192 && b === 168) || 
                       (a === 169 && b === 254);

      if (isPrivate) {
        throw createError('Private URLs not allowed', 'FATAL');
      }
    }

    // Block private IPv6
    if (hostname.includes(':') && 
        (hostname === '::1' || hostname.startsWith('fe80:') || hostname.startsWith('::ffff:127'))) {
      throw createError('Private URLs not allowed', 'FATAL');
    }

  } catch (e) {
    if (e.errorType) throw e;
    throw createError('Invalid URL format', 'FATAL');
  }
}

function classifyHttpError(statusCode) {
  if ([500, 502, 503, 504].includes(statusCode)) return 'RETRYABLE'; // Server errors
  if ([401, 403, 429].includes(statusCode)) return 'BLOCKING';       // Auth/blocking
  if (statusCode === 404) return 'FATAL';                             // Not found
  if (statusCode >= 400 && statusCode < 500) return 'FATAL';          // Client errors
  return 'RETRYABLE';
}

function classifyError(error) {
  if (error.statusCode) return classifyHttpError(error.statusCode);

  const msg = error.message?.toLowerCase() || '';

  // Network issues - retryable
  if (msg.includes('timeout') || 
      msg.includes('econnreset') || 
      msg.includes('econnrefused') ||
      msg.includes('network') ||
      msg.includes('socket hang up')) {
    return 'RETRYABLE';
  }

  // Blocking
  if (msg.includes('cloudflare') ||
      msg.includes('access denied') ||
      msg.includes('rate limit') ||
      msg.includes('captcha')) {
    return 'BLOCKING';
  }

  // Fatal
  if (msg.includes('invalid url') ||
      msg.includes('missing required') ||
      msg.includes('placeholder image')) {
    return 'FATAL';
  }

  return 'RETRYABLE'; // Default: give it a chance
}

async function retryWithBackoff(fn, maxRetries, logger, testMetadata) {
  let lastError = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      if (attempt > 0) testMetadata.retryCount = attempt;
      return await fn();
    } catch (error) {
      lastError = error;
      const errorType = error.errorType || classifyError(error);

      // Don't retry blocking or fatal errors
      if (errorType === 'BLOCKING' || errorType === 'FATAL') {
        logger.log(`🚫 [Scraper] ${errorType} error, not retrying: ${error.message}`);
        error.errorType = errorType;
        throw error;
      }

      // Last attempt - throw error
      if (attempt === maxRetries - 1) {
        logger.log(`❌ [Scraper] All ${maxRetries} attempts failed`);
        error.errorType = errorType;
        throw error;
      }

      // Exponential backoff: 2s, 4s, 8s
      const delay = Math.pow(2, attempt + 1) * 1000;
      logger.log(`⚠️  [Scraper] Attempt ${attempt + 1}/${maxRetries} failed, retrying in ${delay}ms...`);

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  lastError.errorType = classifyError(lastError);
  throw lastError;
}

// ============================================
// STEP 1: AI URL INFERENCE
// ============================================

async function inferProductFromUrl(url, openai, logger) {
  const urlObj = new URL(url);
  const domain = urlObj.hostname.replace('www.', '');

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are a product URL parser. Extract the product name and color from the URL.

Return ONLY valid JSON:
{
  "productName": "Product Name (no brand, no store name)",
  "color": "Color name or null"
}

Rules:
- Extract product name from URL path or query parameters
- Remove brand names, store names, SKUs, and IDs
- Extract color if present (e.g., "Black", "Navy", "Red")
- Set color to null if not found
- Be concise - product name should be 2-6 words`
      },
      {
        role: 'user',
        content: `URL: ${url}\n\nExtract the product name and color.`
      }
    ],
    temperature: 0.1,
  });

  const response = completion.choices[0].message.content.trim();
  const cleanJson = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  try {
    const data = JSON.parse(cleanJson);
    return {
      productName: data.productName || null,
      color: data.color || null,
      domain
    };
  } catch (e) {
    logger.log(`⚠️  [AI] Failed to parse URL inference response, using domain only`);
    return {
      productName: null,
      color: null,
      domain
    };
  }
}

// ============================================
// STEP 2: GOOGLE SHOPPING
// ============================================

async function tryGoogleShopping(url, urlInfo, scraperApiKey, fetchImpl, logger) {
  if (!urlInfo.productName) {
    logger.log('⚠️  [Google Shopping] No product name from AI, skipping');
    return null;
  }

  try {
    // Build search query: "product name" color domain
    const query = `${urlInfo.productName} ${urlInfo.color || ''} ${urlInfo.domain}`.trim();
    logger.log(`🔍 [Google Shopping] Query: "${query}"`);

    // Google Shopping URL (udm=28 = Shopping results)
    const googleUrl = `https://www.google.com/search?udm=28&q=${encodeURIComponent(query)}`;

    // Use ScraperAPI with JS rendering
    const scraperUrl = new URL('http://api.scraperapi.com/');
    scraperUrl.searchParams.set('api_key', scraperApiKey);
    scraperUrl.searchParams.set('url', googleUrl);
    scraperUrl.searchParams.set('render', 'true');
    scraperUrl.searchParams.set('wait_for', '3000');

    const response = await fetchImpl(scraperUrl.toString(), {
      signal: AbortSignal.timeout(30000)
    });

    if (!response.ok) {
      logger.log(`⚠️  [Google Shopping] API error: ${response.status}`);
      return null;
    }

    const html = await response.text();
    logger.log(`📄 [Google Shopping] Got ${html.length} chars`);

    // Parse products from HTML
    const products = parseGoogleShoppingHtml(html, logger);

    if (!products || products.length === 0) {
      logger.log('⚠️  [Google Shopping] No results found');
      return null;
    }

    logger.log(`✅ [Google Shopping] Found ${products.length} products`);

    // Find best match (prefer domain match)
    let bestMatch = products.find(p => p.link?.includes(urlInfo.domain));

    if (!bestMatch) {
      bestMatch = products[0]; // Use first result
      logger.log(`⚠️  [Google Shopping] No domain match, using first result`);
    } else {
      logger.log(`✅ [Google Shopping] Found domain match`);
    }

    // Validate minimum data
    if (!bestMatch.title || !bestMatch.currentPrice) {
      logger.log('⚠️  [Google Shopping] Result missing required data');
      return null;
    }

    return {
      name: bestMatch.title,
      brand: extractBrandFromTitle(bestMatch.title),
      imageUrl: bestMatch.imageUrl,
      originalPrice: bestMatch.originalPrice,
      currentPrice: bestMatch.currentPrice
    };

  } catch (error) {
    logger.log(`❌ [Google Shopping] Error: ${error.message}`);
    return null;
  }
}

function parseGoogleShoppingHtml(html, logger) {
  const products = [];

  try {
    // Extract prices
    const priceRegex = /\$([0-9,]+(?:\.\d{2})?)/g;
    const prices = [];
    let match;

    while ((match = priceRegex.exec(html)) !== null) {
      const price = parseFloat(match[1].replace(/,/g, ''));
      if (price > 0 && price < 100000) prices.push(price);
    }

    // Extract titles (h3/h4 tags)
    const titleRegex = /<h[34][^>]*>([^<]+)<\/h[34]>/gi;
    const titles = [];

    while ((match = titleRegex.exec(html)) !== null) {
      const title = match[1].trim();
      if (title.length > 5 && !title.includes('Google')) titles.push(title);
    }

    // Extract links
    const linkRegex = /href="(https?:\/\/[^"]+)"/gi;
    const links = [];

    while ((match = linkRegex.exec(html)) !== null) {
      let link = match[1];

      // Decode Google redirects
      if (link.includes('google.com/url?')) {
        try {
          const urlParams = new URL(link).searchParams;
          link = urlParams.get('url') || urlParams.get('q') || link;
        } catch (e) {
          continue;
        }
      }

      if (!link.includes('google.com') && !link.includes('gstatic.com')) {
        links.push(link);
      }
    }

    // Extract images
    const imageRegex = /<img[^>]*src="(https?:\/\/[^"]+)"[^>]*>/gi;
    const images = [];

    while ((match = imageRegex.exec(html)) !== null) {
      const img = match[1];
      if (!img.includes('gstatic.com') && !img.includes('google.com')) {
        images.push(img);
      }
    }

    // Combine data
    const minLength = Math.min(titles.length, prices.length, links.length);

    for (let i = 0; i < minLength; i++) {
      products.push({
        title: titles[i],
        currentPrice: prices[i],
        originalPrice: null,
        link: links[i],
        imageUrl: images[i] || null
      });
    }

    logger.log(`   Parsed ${products.length} products`);
    return products;

  } catch (error) {
    logger.log(`⚠️  Error parsing Google Shopping HTML: ${error.message}`);
    return [];
  }
}

function extractBrandFromTitle(title) {
  const cleaned = title.split(/[|–—-]/)[0].trim();
  const brandMatch = cleaned.match(/^([A-Z][a-zA-Z&\s]+?)(?:\s+[A-Z][a-z]|\s+\d|\s*$)/);
  if (brandMatch) return brandMatch[1].trim();

  const firstWord = cleaned.split(/\s+/)[0];
  if (firstWord && /^[A-Z]/.test(firstWord)) return firstWord;

  return null;
}

// ============================================
// STEP 4: JSON-LD EXTRACTION
// ============================================

async function extractFromJsonLd(html, url, logger) {
  const jsonLdMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);

  if (!jsonLdMatch || jsonLdMatch.length === 0) {
    logger.log('⚠️  [JSON-LD] No structured data found');
    return null;
  }

  logger.log(`📊 [JSON-LD] Found ${jsonLdMatch.length} scripts`);

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
          const name = item.name;

          // Extract image
          let imageUrl = null;
          if (Array.isArray(item.image)) {
            const first = item.image[0];
            imageUrl = typeof first === 'string' ? first : first?.url;
          } else if (typeof item.image === 'object' && item.image !== null) {
            imageUrl = item.image.url;
          } else if (typeof item.image === 'string') {
            imageUrl = item.image;
          }

          if (imageUrl && !imageUrl.startsWith('http')) imageUrl = null;

          // Extract prices
          const offers = Array.isArray(item.offers) ? item.offers[0] : item.offers;
          if (offers) {
            const currentPrice = parseFloat(offers.price);
            const comparePrice = offers.highPrice ? parseFloat(offers.highPrice) : null;

            if (name && imageUrl && !isNaN(currentPrice)) {
              let salePrice, originalPrice;

              if (comparePrice && comparePrice > currentPrice) {
                salePrice = currentPrice;
                originalPrice = comparePrice;
              } else {
                salePrice = currentPrice;
                originalPrice = null;
              }

              const percentOff = originalPrice 
                ? Math.round(((originalPrice - salePrice) / originalPrice) * 100) 
                : 0;

              logger.log(`✅ [JSON-LD] Extracted product (confidence: 95%)`);

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
    } catch (e) {
      continue; // Skip invalid JSON
    }
  }

  logger.log('⚠️  [JSON-LD] Found Product schema but incomplete data');
  return { complete: false };
}

// ============================================
// STEP 5: AI EXTRACTION
// ============================================

async function extractWithAI(html, url, openai, logger, jsonLdResult = null) {
  // Pre-extract og:image
  let preExtractedImage = null;
  const ogImageMatch = html.match(/<meta[^>]*(?:property|name)=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
                        html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']og:image["']/i);

  if (ogImageMatch?.[1]?.startsWith('http')) {
    preExtractedImage = ogImageMatch[1];
    logger.log(`🖼️  [AI] Pre-extracted og:image`);
  }

  // Prepare content for AI
  let contentToSend;
  let isJsonLd = false;

  if (jsonLdResult && !jsonLdResult.complete) {
    // We have partial JSON-LD data
    contentToSend = JSON.stringify(jsonLdResult, null, 2);
    isJsonLd = true;
    logger.log(`📊 [AI] Using partial JSON-LD data`);
  } else {
    // Extract relevant HTML snippets
    const pricePatterns = [
      /<[^>]*class="[^"]*price[^"]*"[^>]*>[\s\S]{0,500}<\/[^>]+>/gi,
      /<[^>]*class="[^"]*product[^"]*"[^>]*>[\s\S]{0,1000}<\/[^>]+>/gi,
      /<script type="application\/json"[^>]*>[\s\S]{0,5000}<\/script>/gi,
      /<meta[^>]*property="og:[^"]*"[^>]*>/gi,
      /<h1[^>]*>[\s\S]{0,200}<\/h1>/gi
    ];

    let snippets = [];
    for (const pattern of pricePatterns) {
      const matches = html.match(pattern);
      if (matches) snippets.push(...matches);
    }

    contentToSend = snippets.length > 0
      ? snippets.join('\n').substring(0, 50000)
      : html.substring(0, 50000);

    logger.log(`📝 [AI] Extracted ${snippets.length} HTML sections`);
  }

  const systemPrompt = `You are a product page parser. Extract data and return ONLY valid JSON.

CRITICAL PRICE RULES:
1. **ORIGINAL PRICE** = Higher, crossed-out, or "was" price (before sale)
2. **SALE PRICE** = Lower, current, active price (what you pay now)

ORIGINAL PRICE indicators:
- <s>, <del>, <strike> tags
- Classes: "compare-price", "was-price", "original-price"
- Text: "Was $", "Originally $", "Compare at $"
- Shopify JSON: "compare_at_price" (divide by 100)

SALE PRICE indicators:
- Prominent, active price
- Classes: "sale-price", "current-price", "final-price"
- Shopify JSON: "price" (divide by 100)

Return this structure:
{
  "name": "Product Name (no brand, no store)",
  "brand": "Brand Name",
  "imageUrl": "https://...",
  "originalPrice": 435.00,
  "salePrice": 131.00,
  "percentOff": 70,
  "color": "Black",
  "confidence": 85
}

Rules:
- If only ONE price exists: originalPrice = null, percentOff = 0
- originalPrice MUST be > salePrice (if both exist)
- Extract color from product name or selectors
- confidence: 90+ for structured data, 70-89 for HTML patterns
- Return {"error": "..."} if missing required data
- NEVER use placeholder images`;

  let userPrompt = contentToSend;
  if (preExtractedImage) {
    userPrompt += `\n\nPre-extracted og:image: ${preExtractedImage}`;
  }

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.1,
  });

  const aiResponse = completion.choices[0].message.content.trim();
  const cleanJson = aiResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  let productData;
  try {
    productData = JSON.parse(cleanJson);
  } catch (e) {
    throw createError('Failed to parse AI response', 'FATAL');
  }

  if (productData.error) {
    throw createError(productData.error, 'FATAL');
  }

  // Validate required fields
  if (!productData.name || !productData.imageUrl || productData.salePrice === undefined) {
    throw createError('Missing required product fields', 'FATAL');
  }

  // Check for placeholder images
  const placeholderDomains = ['example.com', 'placeholder.com', 'via.placeholder.com', 'placehold.it'];
  if (placeholderDomains.some(d => productData.imageUrl.toLowerCase().includes(d))) {
    throw createError('AI returned placeholder image', 'FATAL');
  }

  // Parse prices
  const salePrice = parseFloat(productData.salePrice);
  let originalPrice = productData.originalPrice !== null && productData.originalPrice !== undefined
    ? parseFloat(productData.originalPrice)
    : null;
  let percentOff = 0;
  let confidence = parseInt(productData.confidence) || 70;

  if (isNaN(salePrice)) {
    throw createError('Invalid sale price', 'FATAL');
  }

  // Validate price logic
  if (originalPrice !== null) {
    if (isNaN(originalPrice) || originalPrice <= salePrice) {
      logger.log(`⚠️  [AI] Invalid originalPrice, setting to null`);
      originalPrice = null;
      confidence = Math.max(30, confidence - 20);
    } else {
      percentOff = Math.round(((originalPrice - salePrice) / originalPrice) * 100);
    }
  }

  const color = productData.color || null;

  logger.log(`✅ [AI] Extracted product (confidence: ${confidence}%)`);

  return {
    name: productData.name,
    brand: productData.brand || null,
    imageUrl: productData.imageUrl,
    originalPrice,
    salePrice,
    percentOff,
    color,
    url,
    confidence
  };
}