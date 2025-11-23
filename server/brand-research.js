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

// Helper to parse size strings from product data
function parseSizeValue(sizeStr) {
  if (!sizeStr) return null;

  const cleaned = String(sizeStr).trim().toUpperCase();

  // Numeric sizes (0-40)
  const numMatch = cleaned.match(/^(\d{1,2})W?$/);
  if (numMatch) {
    const num = parseInt(numMatch[1]);
    if (num >= 0 && num <= 40) return { type: 'numeric', value: num };
  }

  // Letter sizes
  const letterSizes = {
    'XXS': 0, 'XS': 2, 'S': 6, 'M': 8, 'L': 10, 
    'XL': 14, 'XXL': 18, 'XXXL': 22, '4XL': 26, '5XL': 30
  };
  if (letterSizes[cleaned]) {
    return { type: 'letter', value: letterSizes[cleaned] };
  }

  // Plus sizes (1X-6X)
  const plusMatch = cleaned.match(/^(\d)X$/);
  if (plusMatch) {
    const multiplier = parseInt(plusMatch[1]);
    return { type: 'plus', value: 14 + (multiplier - 1) * 4 };
  }

  return null;
}

// Helper to find max size from array of size objects
function findMaxSize(sizes) {
  if (!sizes || sizes.length === 0) return null;

  const parsed = sizes
    .map(s => parseSizeValue(s))
    .filter(s => s !== null);

  if (parsed.length === 0) return null;

  const maxSize = Math.max(...parsed.map(s => s.value));
  return maxSize;
}

// Create brand research router
function createBrandResearchRouter({ openai, anthropic, adminPassword, serperApiKey }) {
  const router = express.Router();

  // Brand research endpoint - uses Google Shopping API + web search
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
      // PHASE 1: FIND OFFICIAL DOMAIN (UNCHANGED)
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
      // PHASE 2: GOOGLE SHOPPING API (NEW!)
      // ============================================
      console.log(`🛍️  Phase 2: Fetching products from Google Shopping...`);

      const shoppingResponse = await fetch('https://google.serper.dev/shopping', {
        method: 'POST',
        headers: {
          'X-API-KEY': serperApiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          q: `${brandName} women`,
          num: 40, // Get more results for better data
          location: 'United States'
        })
      });

      if (!shoppingResponse.ok) {
        console.error(`❌ Shopping API error: ${shoppingResponse.status}`);
        return res.json({
          success: false,
          error: `Shopping API error: ${shoppingResponse.status}`
        });
      }

      const shoppingData = await shoppingResponse.json();
      const shoppingResults = shoppingData.shopping || [];
      console.log(`🛍️  Shopping API returned ${shoppingResults.length} products`);

      // Filter to official domain only
      const officialProducts = shoppingResults.filter(product => {
        if (!product.link) return false;

        try {
          const productDomain = new URL(product.link).hostname.replace('www.', '').toLowerCase();
          // Accept exact match OR subdomains
          return productDomain === officialDomain || productDomain.endsWith('.' + officialDomain);
        } catch (e) {
          return false;
        }
      });

      console.log(`✅ Filtered to ${officialProducts.length} products from official domain`);

      // ============================================
      // PHASE 3: EXTRACT STRUCTURED DATA
      // ============================================
      console.log(`📊 Phase 3: Extracting structured product data...`);

      const products = [];
      const allSizes = [];
      const productTypes = [];

      for (const item of officialProducts) {
        // Extract price
        let price = null;
        if (item.price) {
          // Handle various price formats: "$450", "450.00", "US$450"
          const priceMatch = String(item.price).match(/[\d,]+\.?\d*/);
          if (priceMatch) {
            price = parseFloat(priceMatch[0].replace(/,/g, ''));
          }
        }

        // Validate price (must be reasonable)
        if (!price || price < 5 || price > 15000) {
          continue;
        }

        // Extract sizes if available
        if (item.sizes && Array.isArray(item.sizes)) {
          allSizes.push(...item.sizes);
        } else if (item.size) {
          allSizes.push(item.size);
        }

        // Extract product type from title
        const title = item.title || '';
        productTypes.push(title);

        products.push({
          name: title,
          price: price,
          url: item.link,
          priceConfidence: 'high', // Shopping API has structured prices
          size: item.size || item.sizes,
          category: item.category
        });
      }

      console.log(`✅ Extracted ${products.length} valid products`);
      console.log(`   Sizes found: ${allSizes.length}`);
      console.log(`   Product types: ${productTypes.length}`);

      // ============================================
      // PHASE 4: CALCULATE PRICE RANGE
      // ============================================
      console.log(`💰 Phase 4: Calculating price range...`);

      let priceRange = '';
      let medianPrice = 0;
      let priceRangeMethod = 'none';

      if (products.length >= 3) {
        const prices = products.map(p => p.price).sort((a, b) => a - b);
        medianPrice = prices.length % 2 === 0 
          ? (prices[prices.length/2 - 1] + prices[prices.length/2]) / 2 
          : prices[Math.floor(prices.length/2)];

        priceRangeMethod = 'shopping-api';
        console.log(`  Method: Shopping API (${products.length} products)`);
      } else if (products.length > 0) {
        const prices = products.map(p => p.price);
        medianPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
        priceRangeMethod = 'shopping-api-limited';
        console.log(`  Method: Shopping API limited (${products.length} products)`);
      } else {
        // Fallback: estimate from brand context
        console.log(`  Method: Estimating (no products found)...`);

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
              content: `Brand: ${brandName}\nDomain: ${officialDomain}`
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
      // PHASE 5: DETERMINE CATEGORIES
      // ============================================
      console.log(`🏷️  Phase 5: Determining categories from products...`);

      let categories = [];

      if (products.length > 0) {
        // Use actual product data to determine categories
        const productContext = products.slice(0, 20).map(p => p.name).join('\n');

        const categoryCompletion = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: `Analyze product titles and determine which categories apply.

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
- Include a category if you see MULTIPLE products in that category
- Base decision on ACTUAL products shown, not assumptions
- Be specific but not overly broad

Examples:
"Silk Dress, Cotton Shirt, Wool Sweater" → "Clothing"
"Dress, Heels, Sandals, Clutch" → "Clothing, Shoes, Bags"
"Ring, Necklace, Earrings" → "Jewelry"`
            },
            {
              role: 'user',
              content: `Brand: ${brandName}\n\nProduct titles:\n${productContext}`
            }
          ],
          temperature: 0.1
        });

        const categoryResponse = categoryCompletion.choices[0]?.message?.content?.trim() || '';
        categories = categoryResponse.split(',').map(c => c.trim()).filter(c => c);

      } else {
        // Fallback: search-based category detection
        console.log(`  No products found, using search fallback...`);

        const categorySearchQuery = `site:${officialDomain} shop collection`;
        const categorySearchResponse = await fetch('https://google.serper.dev/search', {
          method: 'POST',
          headers: {
            'X-API-KEY': serperApiKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ q: categorySearchQuery, num: 5 })
        });

        if (categorySearchResponse.ok) {
          const categoryData = await categorySearchResponse.json();
          const searchResults = categoryData.organic || [];
          const contextText = searchResults.map(r => `${r.title} ${r.snippet}`).join(' ');

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

Return as comma-separated list. Default to "Clothing" if unclear.`
              },
              {
                role: 'user',
                content: `Brand: ${brandName}\n\nContext: ${contextText.substring(0, 2000)}`
              }
            ],
            temperature: 0.1
          });

          const categoryResponseText = categoryCompletion.choices[0]?.message?.content?.trim() || '';
          categories = categoryResponseText.split(',').map(c => c.trim()).filter(c => c);
        }
      }

      // Fallback: If no categories found, default to "Clothing"
      if (categories.length === 0) {
        categories = ['Clothing'];
        console.log(`⚠️  No categories detected, defaulting to: Clothing`);
      } else {
        console.log(`✅ Categories: ${categories.join(', ')}`);
      }

      const finalCategory = categories.join(', ');

      // ============================================
      // PHASE 6: SIZE EXTRACTION (IMPROVED!)
      // ============================================
      console.log(`📏 Phase 6: Extracting size information...`);

      let finalMaxSize = '';
      let sizeMethod = 'none';

      const shouldCheckSizes = categories.includes('Clothing') || 
                               categories.includes('Swimwear') || 
                               categories.length === 0;

      if (shouldCheckSizes) {
        // Strategy 1: Get sizes from Shopping API products
        if (allSizes.length > 0) {
          console.log(`  Strategy 1: Analyzing ${allSizes.length} sizes from products...`);

          const maxSize = findMaxSize(allSizes);
          if (maxSize && maxSize >= 0) {
            finalMaxSize = `Up to ${maxSize}`;
            sizeMethod = 'shopping-products';
            console.log(`  ✅ Max size from products: ${finalMaxSize}`);
          }
        }

        // Strategy 2: Fallback to size chart scraping if needed
        // Only do this if we didn't find sizes OR found small range (< size 14)
        const maxSizeNum = finalMaxSize ? parseInt(finalMaxSize.match(/\d+/)?.[0]) : 0;

        if (!finalMaxSize || maxSizeNum < 14) {
          console.log(`  Strategy 2: Searching for size chart (fallback)...`);

          try {
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
                      sizeText = relevantLines.slice(0, 150).join('\n');
                      console.log(`  ✅ Extracted ${relevantLines.length} relevant lines from page`);
                    }
                  }
                } catch (fetchError) {
                  console.log(`  ⚠️  Page fetch failed: ${fetchError.message}`);
                }

                // Fallback to snippets if page fetch failed
                if (!sizeText) {
                  sizeText = sizeResults.map(r => `${r.title} ${r.snippet}`).join('\n');
                  console.log(`  Using search snippets`);
                }

                if (sizeText) {
                  const sizeCompletion = await openai.chat.completions.create({
                    model: 'gpt-4o',
                    messages: [
                      {
                        role: 'system',
                        content: `Find the LARGEST women's size available. Look for NUMBERED sizes (0-40).

Look for:
- US numeric: 0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32
- Letter sizes: XS, S, M, L, XL, XXL, XXXL, 4XL, 5XL
- Plus sizes: 0X, 1X, 2X, 3X, 4X, 5X, 6X
- European: 32-54

Instructions:
1. Look for the HIGHEST number mentioned
2. Check for both regular AND plus size ranges
3. If you see "extended sizes", "plus sizes" - look harder
4. PREFER numeric sizes over letters
5. Return ONLY the maximum size value (just the number or letter)
6. If not found, return empty string

Examples:
- "Sizes 0-18" → "18"
- "Regular 0-14, Plus 16-24" → "24"
- "XS-XL" → "XL" (only if no numbers found)

Return ONLY the size value.`
                      },
                      {
                        role: 'user',
                        content: `${brandName} size information:\n\n${sizeText.substring(0, 10000)}`
                      }
                    ],
                    temperature: 0.05
                  });

                  const chartMaxSize = sizeCompletion.choices[0]?.message?.content?.trim() || '';

                  if (chartMaxSize && chartMaxSize.length > 0 && chartMaxSize.length < 20) {
                    const chartConverted = convertSizeToUS(chartMaxSize);

                    // Use chart size if it's larger than what we found in products
                    const chartNum = parseInt(chartConverted.match(/\d+/)?.[0]) || 0;
                    if (chartNum > maxSizeNum) {
                      finalMaxSize = chartConverted;
                      sizeMethod = 'size-chart';
                      console.log(`  ✅ Max size from chart: ${chartMaxSize} → ${finalMaxSize}`);
                    } else {
                      console.log(`  ℹ️  Chart size (${chartNum}) not larger than product sizes (${maxSizeNum})`);
                    }
                  }
                }
              }
            }
          } catch (error) {
            console.error(`  ❌ Size chart fetch error: ${error.message}`);
          }
        } else {
          console.log(`  ✅ Sufficient size data from products (${maxSizeNum}), skipping chart`);
        }
      } else {
        console.log(`  ⏭️  Skipping size fetch (no clothing/swimwear detected)`);
        sizeMethod = 'skipped';
      }

      // ============================================
      // PHASE 7: OWNERSHIP & VALUES RESEARCH
      // ============================================
      console.log(`🌐 Phase 7: Researching ownership and values...`);

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
      console.log(`🤖 Phase 8: Analyzing values with AI...`);

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
      // PHASE 9: GENERATE BRAND DESCRIPTION
      // ============================================
      console.log(`🤖 Phase 9: Generating brand description...`);

      let brandDescription = '';
      try {
        // Use product names to inform description
        const productContext = products.length > 0 
          ? products.slice(0, 10).map(p => p.name).join(', ')
          : 'Not available';

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
- Sample Products: ${productContext}

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
        priceRange: priceRangeMethod === 'shopping-api' ? 100 : 
                    priceRangeMethod === 'shopping-api-limited' ? 75 : 50,
        categories: products.length > 0 ? 95 : 70,
        sizes: finalMaxSize ? (sizeMethod === 'shopping-products' ? 90 : 75) : 0,
        products: products.length >= 5 ? 100 : 
                  products.length > 0 ? 70 : 0,
        values: valuesData.values ? 100 : 100,
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
            products: products.slice(0, 10).map(p => ({
              name: p.name,
              price: p.price,
              url: p.url,
              size: p.size,
              priceConfidence: p.priceConfidence
            })),
            medianPrice: Math.round(medianPrice),
            productsFound: products.length,
            sizesFound: allSizes.length,
            officialDomain: officialDomain,
            extractionMethods: {
              price: priceRangeMethod,
              size: sizeMethod,
              category: products.length > 0 ? 'shopping-products' : 'search-fallback'
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