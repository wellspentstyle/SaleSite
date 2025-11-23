// NEW FILE: server/scrapers/proxy-scraper.js
// ScraperAPI integration for department stores with advanced bot detection

export async function scrapeWithProxy(url, options = {}) {
  const {
    openai,
    enableTestMetadata = false,
    logger = console
  } = options;

  if (!openai) {
    throw new Error('OpenAI client is required');
  }

  const scraperApiKey = process.env.SCRAPER_API_KEY;
  
  if (!scraperApiKey) {
    throw new Error('SCRAPER_API_KEY not configured. Sign up at https://www.scraperapi.com/');
  }

  const startTime = Date.now();

  try {
    logger.log(`🔌 [Proxy Scraper] Using ScraperAPI for: ${url}`);
    
    // ScraperAPI endpoint with rendering enabled (for JavaScript sites)
    const proxyUrl = `http://api.scraperapi.com/?` + new URLSearchParams({
      api_key: scraperApiKey,
      url: url,
      render: 'true', // Enable JavaScript rendering
      country_code: 'us', // Use US proxy
      ultra_premium: 'true', // Use ultra premium mobile proxies for heavily protected sites (was: premium)
      wait_for: '5000', // Wait 5 seconds after page load for JavaScript to execute
      session_number: Math.floor(Math.random() * 10000) // Random session to avoid rate limits
    });

    logger.log(`🌐 [Proxy Scraper] Fetching through proxy (ultra_premium + render)...`);
    
    const response = await fetch(proxyUrl, {
      method: 'GET',
      timeout: 90000 // 90 second timeout (ScraperAPI retries for 70s)
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`❌ [Proxy Scraper] ScraperAPI error (${response.status}):`, errorText);
      
      if (response.status === 401) {
        throw new Error('ScraperAPI authentication failed - check your API key');
      } else if (response.status === 429) {
        throw new Error('ScraperAPI rate limit exceeded - upgrade your plan or wait');
      } else {
        throw new Error(`ScraperAPI error: ${response.status}`);
      }
    }

    const html = await response.text();
    logger.log(`📄 [Proxy Scraper] Fetched HTML: ${html.length} characters`);

    // Check if we got a valid product page
    if (html.length < 1000) {
      logger.warn('⚠️  [Proxy Scraper] Suspiciously short HTML - might be blocked');
    }

    // Now use AI to extract product data (same approach as fast-scraper)
    logger.log('🤖 [Proxy Scraper] Extracting product data with AI...');
    
    // Pre-extract image
    let preExtractedImage = null;
    const ogImageMatch = html.match(/<meta[^>]*(?:property|name)=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']og:image["']/i);
    const twitterImageMatch = html.match(/<meta[^>]*(?:property|name)=["']twitter:image["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']twitter:image["']/i);

    if (ogImageMatch && ogImageMatch[1] && ogImageMatch[1].startsWith('http')) {
      preExtractedImage = ogImageMatch[1];
      logger.log(`🖼️  Pre-extracted og:image: ${preExtractedImage}`);
    } else if (twitterImageMatch && twitterImageMatch[1] && twitterImageMatch[1].startsWith('http')) {
      preExtractedImage = twitterImageMatch[1];
      logger.log(`🖼️  Pre-extracted twitter:image: ${preExtractedImage}`);
    }

    // Extract relevant HTML sections
    const pricePatterns = [
      /<[^>]*class="[^"]*price[^"]*"[^>]*>[\s\S]{0,500}<\/[^>]+>/gi,
      /<[^>]*class="[^"]*product[^"]*"[^>]*>[\s\S]{0,1000}<\/[^>]+>/gi,
      /<script type="application\/json"[^>]*>[\s\S]{0,5000}<\/script>/gi,
      /<meta[^>]*property="og:(?:title|image|price)"[^>]*>/gi,
      /<h1[^>]*>[\s\S]{0,200}<\/h1>/gi,
      /<[^>]*itemprop=["'](?:price|name|image)["'][^>]*>/gi,
      /<[^>]*data-testid[^>]*>[\s\S]{0,500}<\/[^>]+>/gi,
      /<[^>]*data-test[^>]*>[\s\S]{0,500}<\/[^>]+>/gi
    ];

    let extractedSnippets = [];
    for (const pattern of pricePatterns) {
      const matches = html.match(pattern);
      if (matches) {
        extractedSnippets.push(...matches);
      }
    }

    const contentToSend = extractedSnippets.length > 0
      ? extractedSnippets.join('\n').substring(0, 50000)
      : html.substring(0, 50000);

    logger.log(`📝 Extracted ${extractedSnippets.length} relevant HTML sections (${contentToSend.length} chars)`);

    // AI extraction with enhanced prompt for department stores
    const systemPrompt = `You are a product page parser extracting from HTML fetched via proxy. This HTML is from a department store (Nordstrom, Saks, etc.) that was accessed through a residential proxy to bypass bot detection.

🚨 CRITICAL PRICE RULES:

You MUST identify TWO prices if a sale is active:
1. **ORIGINAL PRICE** = The HIGHER, crossed-out, or "was" price
2. **SALE PRICE** = The LOWER, current, active price

ORIGINAL PRICE indicators:
- Inside <s>, <del>, <strike> tags
- Classes: "compare-price", "was-price", "original-price", "line-through"
- Text: "Was $", "Originally $", "Compare at $", "Regular price $"
- data-testid="price-regular", data-test="regular-price"

SALE PRICE indicators:
- Prominent, active price
- Classes: "sale-price", "current-price", "final-price"
- data-testid="price-sale", data-test="sale-price"

DEPARTMENT STORE SPECIFIC PATTERNS:
- Nordstrom: data-testid="price-regular" (original), data-testid="price-sale" (sale)
- Saks: data-test="product-price" (sale), regular price in strikethrough nearby
- Neiman Marcus: class*="price-sale", class*="price-regular"

Return this structure:
{
  "name": "Product Name (no brand)",
  "brand": "Actual Brand",
  "imageUrl": "Real product image URL",
  "originalPrice": 435.00,
  "salePrice": 131.00,
  "percentOff": 70,
  "confidence": 85
}

Confidence scoring:
- 90-100: Clear prices with both original and sale in structured markup
- 70-89: Prices visible but in basic HTML
- 50-69: Only one price or ambiguous
- Below 50: Missing data

⚠️ VALIDATION:
- originalPrice MUST be > salePrice (if both exist)
- NEVER use placeholder images
- Return {"error": "..."} if required data missing`;

    let userPrompt = contentToSend;
    if (preExtractedImage) {
      userPrompt = `${contentToSend}\n\nNOTE: Pre-extracted image URL: ${preExtractedImage} - use this for imageUrl.`;
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

    // Validate image URL
    const placeholderDomains = ['example.com', 'placeholder.com', 'via.placeholder.com', 'placehold.it', 'dummyimage.com'];
    const imageUrl = productData.imageUrl.toLowerCase();
    if (placeholderDomains.some(domain => imageUrl.includes(domain))) {
      throw new Error('AI returned placeholder image URL');
    }

    // Price validation
    let originalPrice = productData.originalPrice !== null && productData.originalPrice !== undefined ? parseFloat(productData.originalPrice) : null;
    const salePrice = parseFloat(productData.salePrice);
    let confidence = productData.confidence ? parseInt(productData.confidence) : 50;

    if (isNaN(salePrice)) {
      throw new Error('Invalid sale price');
    }

    // Validate price logic
    if (originalPrice !== null) {
      if (isNaN(originalPrice)) {
        logger.log(`⚠️  Invalid originalPrice, setting to null`);
        originalPrice = null;
        confidence = Math.max(30, confidence - 20);
      } else if (originalPrice <= salePrice) {
        logger.log(`⚠️  Invalid: originalPrice ($${originalPrice}) <= salePrice ($${salePrice})`);
        originalPrice = null;
        confidence = Math.max(30, confidence - 25);
      }
    }

    // Calculate percentOff
    let percentOff = 0;
    if (originalPrice !== null && originalPrice > salePrice) {
      percentOff = Math.round(((originalPrice - salePrice) / originalPrice) * 100);
    }

    if (confidence < 50) {
      throw new Error(`Low confidence (${confidence}%) - data may be inaccurate`);
    }

    logger.log(`✅ [Proxy Scraper] Extracted product (confidence: ${confidence}%):`, {
      name: productData.name,
      brand: productData.brand,
      salePrice,
      originalPrice,
      percentOff
    });

    return {
      success: true,
      product: {
        name: productData.name,
        brand: productData.brand || null,
        imageUrl: productData.imageUrl,
        originalPrice: originalPrice,
        salePrice: salePrice,
        percentOff: percentOff,
        url: url,
        confidence: confidence
      },
      meta: {
        method: 'proxy',
        phase: 'scraperapi-extraction',
        confidence: confidence,
        durationMs: Date.now() - startTime,
        testMetadata: enableTestMetadata ? { source: 'scraperapi' } : undefined
      }
    };

  } catch (error) {
    logger.error('❌ [Proxy Scraper] Error:', error.message);
    return {
      success: false,
      error: error.message,
      meta: {
        method: 'proxy',
        phase: 'error',
        confidence: 0,
        durationMs: Date.now() - startTime
      }
    };
  }
}
