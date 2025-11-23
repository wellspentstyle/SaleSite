import express from 'express';

// Helper function to convert S/M/L or European sizes to US numeric equivalents
function convertSizeToUS(sizeString) {
  if (!sizeString || sizeString === '""' || sizeString.trim() === '') {
    return '';
  }
  
  // Letter size mapping (S/M/L/XL)
  const letterSizeMap = {
    'S': 6,
    'M': 8,
    'L': 10,
    'XL': 14,
    'XXL': 18,
    '1X': 14,
    '2X': 18,
    '3X': 22
  };
  
  // European to US size conversion (women's)
  const euToUSMap = {
    32: 0, 34: 0, 36: 2, 38: 4, 40: 6, 
    42: 8, 44: 10, 46: 12, 48: 14, 50: 16, 
    52: 18, 54: 20
  };
  
  // Try to extract European numeric size (e.g., "44", "Up to 44", "EU 44")
  const euMatch = sizeString.match(/(\d{2})/);
  if (euMatch) {
    const euSize = parseInt(euMatch[1]);
    if (euToUSMap[euSize]) {
      return `Up to ${euToUSMap[euSize]}`;
    }
  }
  
  // Try to extract letter size (e.g., "L", "Up to L", "XL")
  const letterMatch = sizeString.match(/(XXL|XL|L|M|S|1X|2X|3X)/i);
  if (letterMatch) {
    const size = letterMatch[1].toUpperCase();
    if (letterSizeMap[size]) {
      return `Up to ${letterSizeMap[size]}`;
    }
  }
  
  // If already in US numeric format (e.g., "10", "14"), ensure "Up to" prefix
  const usMatch = sizeString.match(/^(?:Up to )?(\d{1,2})$/i);
  if (usMatch) {
    return `Up to ${usMatch[1]}`;
  }
  
  // If no match found, return empty string
  return '';
}

// Create brand research router
function createBrandResearchRouter({ openai, anthropic, adminPassword, serperApiKey }) {
  const router = express.Router();

  // Brand research endpoint - uses Serper web search + AI with strict validation
  router.post('/', async (req, res) => {
    const { auth } = req.headers;
    const { brandName } = req.body;
    
    if (auth !== adminPassword) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    
    if (!brandName || typeof brandName !== 'string') {
      return res.status(400).json({ success: false, error: 'Brand name is required' });
    }
    
    try {
      console.log(`\n🔍 Researching brand: ${brandName}`);
      
      // ============================================
      // PHASE 1: FIND OFFICIAL DOMAIN
      // ============================================
      console.log(`🌐 Phase 1: Finding official domain...`);
      
      const domainSearchQuery = `${brandName} official website fashion brand`;
      const domainResponse = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: {
          'X-API-KEY': serperApiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          q: domainSearchQuery,
          num: 10
        })
      });
      
      if (!domainResponse.ok) {
        const errorText = await domainResponse.text();
        console.error(`❌ Serper API error (${domainResponse.status}):`, errorText);
        return res.json({
          success: false,
          error: domainResponse.status === 401 
            ? 'Search API authentication failed - check API key'
            : domainResponse.status === 429
            ? 'Search API rate limit exceeded - try again later'
            : `Search API error: ${domainResponse.status}`
        });
      }
      
      const domainSearchData = await domainResponse.json();
      console.log(`📦 Domain search returned ${domainSearchData.organic?.length || 0} results`);
      
      if (!domainSearchData.organic || domainSearchData.organic.length === 0) {
        return res.json({
          success: false,
          error: 'No search results found for this brand'
        });
      }
      
      // Expanded resale/marketplace domains to block
      const resaleDomains = [
        'therealreal.com', 'vestiairecollective.com', 'poshmark.com', 'ebay.com',
        'tradesy.com', 'etsy.com', 'depop.com', 'grailed.com', 'mercari.com',
        'vinted.com', 'thredup.com', 'rebag.com', 'fashionphile.com',
        'yoox.com', 'farfetch.com', 'ssense.com', 'net-a-porter.com',
        'mrporter.com', 'nordstrom.com', 'saksfifthavenue.com', 'bergdorfgoodman.com',
        'neimanmarcus.com', 'bloomingdales.com', 'shopbop.com', 'revolve.com',
        'fwrd.com', 'matchesfashion.com', 'mytheresa.com', 'selfridges.com',
        'harrods.com', 'davidjones.com', 'lyst.com', 'lovethesales.com',
        'shopstyle.com', 'modesens.com', 'intermixonline.com', 'amazon.com',
        'walmart.com', 'target.com', 'shopual.com'
      ];
      
      // Find official brand domain
      const brandNameLower = brandName.toLowerCase().replace(/[^a-z0-9]/g, '');
      let officialDomain = null;
      
      for (const result of domainSearchData.organic.slice(0, 10)) {
        if (!result.link) continue;
        
        const hostname = new URL(result.link).hostname.replace('www.', '').toLowerCase();
        
        // Skip resale/marketplace domains
        if (resaleDomains.some(resale => hostname.includes(resale))) {
          continue;
        }
        
        // Check if domain contains brand name
        const domainParts = hostname.split('.')[0].replace(/[-_]/g, '');
        if (domainParts.includes(brandNameLower) || brandNameLower.includes(domainParts)) {
          officialDomain = hostname;
          break;
        }
      }
      
      if (!officialDomain) {
        console.warn(`⚠️  Could not identify official domain for ${brandName}`);
        return res.json({
          success: false,
          error: 'Could not identify official brand website'
        });
      }
      
      console.log(`🏢 Official domain: ${officialDomain}`);
      
      // ============================================
      // PHASE 2: MULTI-STRATEGY PRODUCT SEARCH (IMPROVED)
      // ============================================
      console.log(`🌐 Phase 2: Searching for products (multi-strategy)...`);
      
      let allProductResults = [];
      
      // Strategy 1: Price-focused search
      const priceSearchQuery = `site:${officialDomain} price $ shop buy`;
      const priceResponse = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: {
          'X-API-KEY': serperApiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ q: priceSearchQuery, num: 10 })
      });
      
      if (priceResponse.ok) {
        const priceData = await priceResponse.json();
        const results = priceData.organic || [];
        allProductResults.push(...results);
        console.log(`  Strategy 1 (price): ${results.length} results`);
      }
      
      // Strategy 2: Collection/category pages (NEW)
      const collectionSearchQuery = `site:${officialDomain} collection shop new arrivals`;
      const collectionResponse = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: {
          'X-API-KEY': serperApiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ q: collectionSearchQuery, num: 8 })
      });
      
      if (collectionResponse.ok) {
        const collectionData = await collectionResponse.json();
        const results = collectionData.organic || [];
        allProductResults.push(...results);
        console.log(`  Strategy 2 (collections): ${results.length} results`);
      }
      
      // Deduplicate results
      const uniqueResults = Array.from(
        new Map(allProductResults.map(r => [r.link, r])).values()
      );
      
      console.log(`📦 Total unique product results: ${uniqueResults.length}`);
      
      // ============================================
      // PHASE 3: RELAXED PRODUCT EXTRACTION (IMPROVED)
      // ============================================
      console.log(`🤖 Phase 3: Extracting products with relaxed validation...`);
      
      const searchResults = uniqueResults.slice(0, 15).map(r => ({
        title: r.title,
        snippet: r.snippet,
        link: r.link
      }));
      
      const extractionCompletion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `Extract product information from search results. Be LESS strict than before about prices.

RELAXED PRICE EXTRACTION RULES:
- Extract prices you can SEE in title/snippet
- Valid: "$450", "Price: $200", "$89.99", "Was $400 Now $200", "$200-$400"
- ALSO ACCEPT: "from $X", ranges, approximate prices
- If you see "Was $400 Now $200" - use $400 (ORIGINAL price)
- If price range like "$200-$400" - use the higher value ($400)
- For "from $X" - use that value as minimum
- Estimate from context if product type suggests price tier

Return valid JSON:
{
  "products": [
    {"name": "Product Name", "price": 450, "url": "https://...", "priceConfidence": "high|medium|low"}
  ]
}

Requirements:
- Extract 3-7 products if possible
- URLs must be from ${officialDomain}
- Price must be numeric (use ORIGINAL/higher price if range)
- Add priceConfidence field: "high" (exact), "medium" (range/from), "low" (estimated)
- It's OK to include products with "medium" or "low" confidence
- Prefer higher-priced items to get accurate price range`
          },
          {
            role: 'user',
            content: `Extract products with prices from "${brandName}":\n\n${JSON.stringify(searchResults, null, 2)}`
          }
        ],
        temperature: 0.2
      });
      
      const extractionResponse = extractionCompletion.choices[0]?.message?.content;
      
      if (!extractionResponse) {
        throw new Error('No response from product extraction');
      }
      
      console.log(`📦 Extraction response: ${extractionResponse.substring(0, 200)}...`);
      
      // Parse product data
      let productData;
      try {
        const jsonMatch = extractionResponse.match(/\{[\s\S]*\}/);
        productData = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(extractionResponse);
      } catch (parseError) {
        console.error('Failed to parse product data:', parseError);
        productData = { products: [] };
      }
      
      let products = productData.products || [];
      
      // ============================================
      // PHASE 4: VALIDATE PRODUCTS (RELAXED)
      // ============================================
      console.log(`✅ Phase 4: Validating ${products.length} products (relaxed rules)...`);
      
      const validatedProducts = [];
      for (const product of products) {
        // RELAXED price sanity check ($5 - $15,000 instead of $10-$10,000)
        if (product.price < 5 || product.price > 15000) {
          console.log(`⚠️  Suspicious price for "${product.name}": $${product.price} - skipping`);
          continue;
        }
        
        // URL validation - must be from official domain or subdomain
        try {
          const urlObj = new URL(product.url);
          const urlDomain = urlObj.hostname.replace('www.', '');
          // Accept exact match OR subdomains (e.g., uk.stinegoya.com for stinegoya.com)
          if (urlDomain === officialDomain || urlDomain.endsWith('.' + officialDomain)) {
            validatedProducts.push(product);
            console.log(`✅ ${product.priceConfidence || 'unknown'} confidence: "${product.name}" - $${product.price}`);
          } else {
            console.log(`⚠️  Wrong domain for "${product.name}": ${urlDomain}`);
          }
        } catch (e) {
          console.log(`⚠️  Invalid URL: ${product.url}`);
        }
      }
      
      products = validatedProducts;
      console.log(`✅ Validated ${products.length} products`);
      
      // ============================================
      // PHASE 5: SMART PRICE RANGE CALCULATION (NEW)
      // ============================================
      console.log(`💰 Phase 5: Calculating price range (with fallbacks)...`);
      
      let priceRange = '';
      let medianPrice = 0;
      let priceRangeMethod = 'none';
      
      if (products.length >= 3) {
        // Method 1: Calculate from actual products
        const prices = products.map(p => p.price).sort((a, b) => a - b);
        medianPrice = prices.length % 2 === 0 
          ? (prices[prices.length/2 - 1] + prices[prices.length/2]) / 2 
          : prices[Math.floor(prices.length/2)];
        
        priceRangeMethod = 'products';
        console.log(`  Method: Actual products (${products.length} items)`);
      } else if (products.length > 0) {
        // Method 2: Use available products but flag as less confident
        const prices = products.map(p => p.price);
        medianPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
        priceRangeMethod = 'limited-products';
        console.log(`  Method: Limited products (${products.length} items - less confident)`);
      } else {
        // Method 3: ESTIMATE from brand context (NEW FALLBACK)
        console.log(`  Method: Estimating from brand context...`);
        
        const estimateCompletion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `Estimate a typical product price for this fashion brand based on context.

Return ONLY a number (no $ sign, no text). Examples:
- Mass market brand (H&M, Zara) → 50
- Contemporary brand (Everlane, Reformation) → 200
- Premium brand (Theory, Vince) → 400
- Luxury brand (The Row, Loro Piana) → 1500

If you can't estimate, return 250 (default contemporary price).`
            },
            {
              role: 'user',
              content: `Brand: ${brandName}\nDomain: ${officialDomain}\nSearch results suggest: ${searchResults.slice(0, 3).map(r => r.title).join(', ')}`
            }
          ],
          temperature: 0.1
        });
        
        const estimateText = estimateCompletion.choices[0]?.message?.content?.trim() || '250';
        medianPrice = parseInt(estimateText.replace(/[^0-9]/g, '')) || 250;
        priceRangeMethod = 'estimated';
        console.log(`  Estimated price: $${medianPrice}`);
      }
      
      // Calculate tier
      if (medianPrice < 100) priceRange = '$';
      else if (medianPrice < 300) priceRange = '$$';
      else if (medianPrice < 800) priceRange = '$$$';
      else priceRange = '$$$$';
      
      console.log(`💰 Price: $${Math.round(medianPrice)} → ${priceRange} (method: ${priceRangeMethod})`);
      
      // ============================================
      // PHASE 6: DETERMINE CATEGORIES (IMPROVED)
      // ============================================
      console.log(`🤖 Phase 6: Determining categories...`);
      
      let categories = [];
      
      // Combine product names AND search result titles for better context
      const contextText = [
        ...products.map(p => p.name),
        ...searchResults.slice(0, 5).map(r => r.title + ' ' + r.snippet)
      ].join(' ');
      
      const categoryCompletion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `Analyze text and determine which categories apply.

Return ONLY categories from this list:
- Clothing
- Shoes
- Bags
- Accessories
- Jewelry
- Swimwear
- Homewares

Rules:
- Return as comma-separated list (e.g., "Clothing, Shoes, Bags")
- Include a category if you see MULTIPLE mentions or clear evidence
- Be liberal - when in doubt, include it
- Clothing is the most common, include unless clearly not a clothing brand`
          },
          {
            role: 'user',
            content: `Brand: ${brandName}\n\nContext: ${contextText.substring(0, 2000)}`
          }
        ],
        temperature: 0.1
      });
      
      const categoryResponse = categoryCompletion.choices[0]?.message?.content?.trim() || '';
      categories = categoryResponse.split(',').map(c => c.trim()).filter(c => c);
      
      // Fallback: If no categories found, default to "Clothing" for fashion brands
      if (categories.length === 0) {
        categories = ['Clothing'];
        console.log(`⚠️  No categories detected, defaulting to: Clothing`);
      } else {
        console.log(`✅ Categories: ${categories.join(', ')}`);
      }
      
      const finalCategory = categories.join(', ');
      
      // ============================================
      // PHASE 7: ALWAYS ATTEMPT SIZE FETCH (IMPROVED)
      // ============================================
      console.log(`📏 Phase 7: Fetching size information...`);
      
      let finalMaxSize = '';
      let sizeMethod = 'none';
      
      // CHANGED: Always attempt if brand has Clothing or Swimwear, OR if no categories
      const shouldCheckSizes = categories.includes('Clothing') || 
                               categories.includes('Swimwear') || 
                               categories.length === 0; // Try even if categories unclear
      
      if (shouldCheckSizes) {
        console.log(`  Attempting size fetch...`);
        
        try {
          // Search for size chart
          const sizeSearchQuery = `site:${officialDomain} "size chart" OR "size guide" women`;
          const sizeResponse = await fetch('https://google.serper.dev/search', {
            method: 'POST',
            headers: {
              'X-API-KEY': serperApiKey,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ q: sizeSearchQuery, num: 5 })
          });
          
          if (sizeResponse.ok) {
            const sizeData = await sizeResponse.json();
            const sizeResults = sizeData.organic?.slice(0, 3) || [];
            
            if (sizeResults.length > 0) {
              console.log(`  Found ${sizeResults.length} size chart pages`);
              
              // Try to fetch full page content
              let sizeText = '';
              
              try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 15000);
                
                const pageResponse = await fetch(sizeResults[0].link, {
                  headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                  },
                  signal: controller.signal
                });
                
                clearTimeout(timeout);
                
                if (pageResponse.ok) {
                  const html = await pageResponse.text();
                  
                  // Extract text content
                  const textContent = html
                    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                    .replace(/<[^>]+>/g, ' ')
                    .replace(/&nbsp;/g, ' ')
                    .replace(/&amp;/g, '&')
                    .replace(/\s+/g, ' ')
                    .trim();
                  
                  // Find size-related content
                  const sizeKeywords = ['size chart', 'size guide', 'sizing', 'measurements', 'fit guide'];
                  const lines = textContent.split(/[.\n]/);
                  const relevantLines = lines.filter(line => {
                    const lower = line.toLowerCase();
                    return sizeKeywords.some(kw => lower.includes(kw)) ||
                           /\b(XS|S|M|L|XL|XXL|XXXL|0X|1X|2X|3X|4X|5X|\d{1,2})\b/.test(line);
                  });
                  
                  if (relevantLines.length > 0) {
                    sizeText = relevantLines.slice(0, 150).join('\n'); // Increased from 100
                    sizeMethod = 'full-page';
                    console.log(`  ✅ Extracted ${relevantLines.length} relevant lines from page`);
                  }
                }
              } catch (fetchError) {
                console.log(`  ⚠️  Page fetch failed: ${fetchError.message}`);
              }
              
              // Fallback to snippets if page fetch failed
              if (!sizeText) {
                sizeText = sizeResults.map(r => `${r.title} ${r.snippet}`).join('\n');
                sizeMethod = 'snippets';
                console.log(`  Using search snippets`);
              }
              
              if (sizeText) {
                // IMPROVED AI prompt for size extraction
                const sizeCompletion = await openai.chat.completions.create({
                  model: 'gpt-4o',
                  messages: [
                    {
                      role: 'system',
                      content: `Find the LARGEST women's size available. Be thorough and check carefully.

Look for:
- US numeric: 0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32
- Letter sizes: XS, S, M, L, XL, XXL, XXXL, 4XL, 5XL
- Plus sizes: 0X, 1X, 2X, 3X, 4X, 5X, 6X
- European: 32-54
- UK: 4-28

Common patterns:
- "Sizes 0-16" → return "16"
- "XS to XL" → return "XL"  
- "Regular (0-14) Plus (16-24)" → return "24"
- "Up to 3X" → return "3X"
- "Size 0-32" → return "32"

Instructions:
1. Look for the HIGHEST number or largest letter size mentioned
2. Check for both regular AND plus size ranges
3. If you see "extended sizes", "plus sizes", or "inclusive sizing" - look harder for max
4. Return ONLY the maximum size value
5. If truly not found, return empty string

Examples:
- Input: "Available in sizes XS-XL" → Output: "XL"
- Input: "Sizes 0-18" → Output: "18"
- Input: "Size range: 00-16, Plus sizes 14W-24W" → Output: "24W"

Return ONLY the size, nothing else.`
                    },
                    {
                      role: 'user',
                      content: `${brandName} size information:\n\n${sizeText.substring(0, 10000)}`
                    }
                  ],
                  temperature: 0.05 // Very low temperature for precision
                });
                
                const maxSize = sizeCompletion.choices[0]?.message?.content?.trim() || '';
                
                if (maxSize && maxSize.length > 0 && maxSize.length < 20) {
                  finalMaxSize = convertSizeToUS(maxSize);
                  console.log(`  ✅ Max size: ${maxSize} → ${finalMaxSize} (method: ${sizeMethod})`);
                } else {
                  console.log(`  ⚠️  Could not extract valid size: "${maxSize}"`);
                }
              }
            } else {
              console.log(`  ⚠️  No size chart pages found`);
            }
          }
        } catch (error) {
          console.error(`  ❌ Size fetch error: ${error.message}`);
        }
      } else {
        console.log(`  ⏭️  Skipping size fetch (no clothing detected)`);
        sizeMethod = 'skipped';
      }
      
      // ============================================
      // PHASE 8: OWNERSHIP & VALUES RESEARCH
      // ============================================
      console.log(`🌐 Phase 8: Researching ownership and values...`);
      
      // Ownership check
      const ownershipQuery = `${brandName} owned by parent company conglomerate`;
      const ownershipResponse = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: {
          'X-API-KEY': serperApiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ q: ownershipQuery, num: 6 })
      });
      
      const ownershipData = ownershipResponse.ok ? await ownershipResponse.json() : {};
      const ownershipResults = ownershipData.organic?.slice(0, 5) || [];
      
      // Sustainability check
      const sustainabilityQuery = `${brandName} sustainable B Corp Fair Trade GOTS certified organic`;
      const sustainabilityResponse = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: {
          'X-API-KEY': serperApiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ q: sustainabilityQuery, num: 6 })
      });
      
      const sustainabilityData = sustainabilityResponse.ok ? await sustainabilityResponse.json() : {};
      const sustainabilityResults = sustainabilityData.organic?.slice(0, 5) || [];
      
      // Diversity check
      const diversityQuery = `${brandName} women-owned female-founded BIPOC-owned founder`;
      const diversityResponse = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: {
          'X-API-KEY': serperApiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ q: diversityQuery, num: 6 })
      });
      
      const diversityData = diversityResponse.ok ? await diversityResponse.json() : {};
      const diversityResults = diversityData.organic?.slice(0, 5) || [];
      
      // AI analysis of values
      console.log(`🤖 Phase 9: Analyzing values with AI...`);
      
      const valuesCompletion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `Analyze brand values from search results. Be VERY selective and conservative.

VALUES (select only with clear evidence):
- "Independent label" - Include ONLY if ownership results show NO parent company (LVMH, Kering, Richemont, H&M Group, VF Corp, PVH, Tapestry, Capri Holdings, etc.)
- "Sustainable" - Include ONLY if you see MULTIPLE mentions of: certifications (B Corp, Fair Trade, GOTS), organic/recycled materials, transparent supply chain. NOT just vague marketing.
- "Women-owned" - Include ONLY if you see explicit mention of female founder name/pronouns or "women-owned" label
- "BIPOC-owned" - Include ONLY if explicitly stated as "BIPOC-owned", "Black-owned", or you see BIPOC founder names with confirmation
- "Secondhand" - Include ONLY if it's a resale/vintage platform

Return ONLY valid JSON:
{
  "values": "Independent label, Sustainable"
}

CRITICAL: If a brand is owned by a conglomerate, it CANNOT be "Women-owned" or "BIPOC-owned". Be strict.`
          },
          {
            role: 'user',
            content: `Brand: ${brandName}

OWNERSHIP RESULTS:
${JSON.stringify(ownershipResults, null, 2)}

SUSTAINABILITY RESULTS:
${JSON.stringify(sustainabilityResults, null, 2)}

DIVERSITY RESULTS:
${JSON.stringify(diversityResults, null, 2)}`
          }
        ],
        temperature: 0.1
      });
      
      const valuesResponse = valuesCompletion.choices[0]?.message?.content;
      
      let valuesData = { values: '' };
      try {
        const jsonMatch = valuesResponse.match(/\{[\s\S]*\}/);
        valuesData = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(valuesResponse);
      } catch (parseError) {
        console.error('Failed to parse values:', parseError);
      }
      
      console.log(`✅ Values: ${valuesData.values || 'none'}`);
      
      // ============================================
      // PHASE 10: GENERATE BRAND DESCRIPTION
      // ============================================
      console.log(`🤖 Phase 10: Generating brand description...`);
      
      let brandDescription = '';
      try {
        const descriptionResponse = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 180,
          messages: [{
            role: 'user',
            content: `Write a concise 1-2 sentence brand description for ${brandName} (~60 words). The audience is a smart shopper who knows similar brands. The description should: (1) position the brand relative to others they'd know, (2) describe design philosophy in specific terms (fabrics, cuts, details), not vague words like "elevated" or "timeless".

Context:
- Type: Brand
- Categories: ${finalCategory || 'Fashion'}
- Price Range: ${priceRange || 'Not available'}
- Values: ${valuesData.values || 'None'}
- Products: ${products.length > 0 ? products.slice(0, 5).map(p => p.name).join(', ') : 'Not available'}

Write ONLY the description, no preamble.`
          }]
        });
        
        brandDescription = descriptionResponse.content[0]?.text?.trim() || '';
        console.log(`✅ Generated description`);
      } catch (error) {
        console.error(`❌ Description generation failed: ${error.message}`);
      }
      
      // ============================================
      // FINAL RESPONSE WITH CONFIDENCE SCORES
      // ============================================
      const brandUrl = `https://${officialDomain}`;
      
      // Calculate overall data quality score
      const qualityScore = {
        priceRange: priceRangeMethod === 'products' ? 100 : 
                    priceRangeMethod === 'limited-products' ? 70 : 50,
        categories: categories.length > 0 ? 90 : 50,
        sizes: finalMaxSize ? (sizeMethod === 'full-page' ? 90 : 70) : 0,
        products: products.length >= 3 ? 100 : 
                  products.length > 0 ? 60 : 0,
        values: valuesData.values ? 100 : 100, // Values are optional, so 100 if present or if not needed
        description: brandDescription ? 100 : 0
      };
      
      const avgQuality = Object.values(qualityScore).reduce((a, b) => a + b, 0) / Object.keys(qualityScore).length;
      
      console.log(`\n📊 Data Quality Score: ${Math.round(avgQuality)}%`);
      console.log(`   Price Range: ${qualityScore.priceRange}% (${priceRangeMethod})`);
      console.log(`   Categories: ${qualityScore.categories}%`);
      console.log(`   Sizes: ${qualityScore.sizes}% (${sizeMethod})`);
      console.log(`   Products: ${qualityScore.products}% (${products.length} found)`);
      console.log(`   Description: ${qualityScore.description}%`);
      
      console.log(`\n✅ Research complete for ${brandName}`);
      
      res.json({
        success: true,
        qualityScore: Math.round(avgQuality),
        dataCompleteness: {
          priceRange: priceRangeMethod,
          categories: categories.length > 0,
          sizes: sizeMethod,
          products: products.length,
          values: !!valuesData.values,
          description: !!brandDescription
        },
        brand: {
          type: 'Brand',
          priceRange: priceRange,
          category: finalCategory,
          values: valuesData.values || '',
          maxWomensSize: finalMaxSize,
          description: brandDescription,
          url: brandUrl,
          evidence: {
            products: products.slice(0, 5).map(p => ({
              name: p.name,
              price: p.price,
              url: p.url,
              priceConfidence: p.priceConfidence || 'unknown'
            })),
            medianPrice: products.length > 0 ? Math.round(medianPrice) : Math.round(medianPrice),
            productsFound: products.length,
            officialDomain: officialDomain,
            extractionMethods: {
              price: priceRangeMethod,
              size: sizeMethod
            }
          }
        }
      });
      
    } catch (error) {
      console.error(`❌ Error researching brand ${brandName}:`, error);
      res.json({
        success: false,
        error: error.message || 'Failed to research brand'
      });
    }
  });

  return router;
}

export { createBrandResearchRouter };
