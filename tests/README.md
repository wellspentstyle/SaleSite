# Product Scraper Automated Testing

Automated testing system for the product scraper across different site types (Shopify, Shopbop, department stores, independent brands).

## Quick Start

### 1. Add Test URLs

Edit `scraper-test-urls.json` and add product URLs for each category:

```json
{
  "url": "https://www.example.com/product",
  "expectedName": "Product",
  "expectedImageHost": "cdn.example.com",
  "minConfidence": 70,
  "notes": "Description of what this tests"
}
```

**Fields:**
- `url` - Full product URL to test
- `expectedName` - Substring that should appear in product name (case-insensitive)
- `expectedImageHost` - Domain that should be in the image URL
- `minConfidence` - Minimum acceptable confidence score (typically 50-95)
- `notes` - Optional description for reference

### 2. Run Tests

```bash
npm run test:scraper
```

Or directly:

```bash
node tests/run-scraper-tests.js
```

## What Gets Tested

For each URL, the test validates:

1. ✅ **Product Name** - Contains expected substring
2. ✅ **Image URL** - Valid http(s) URL and from expected host
3. ✅ **Sale Price** - Exists and is greater than 0
4. ✅ **Confidence Score** - Meets minimum threshold
5. ✅ **Not Placeholder** - Not example.com, placeholder.com, etc.

## Test Output

The runner provides:
- ✅/❌ Pass/fail status for each URL
- Which extraction phase was used (json-ld, ai-extraction)
- Confidence scores
- Summary by category
- Phase usage statistics

### Example Output

```
[1/10] Testing Shopbop: https://www.shopbop.com/product...
  ✓ PASS (ai-extraction phase, confidence: 85%)

═══════════════════════════════════════
           TEST SUMMARY                
═══════════════════════════════════════

Total Tests: 10
Passed: 9
Failed: 1
Pass Rate: 90.0%

By Category:
  Shopbop: 3/3 (100%)
  Shopify: 4/5 (80%)
  Department Stores: 2/2 (100%)

Extraction Phases Used:
  json-ld: 2
  ai-extraction: 8
```

## Test Results

Detailed results are saved to `tests/results/` directory:
- JSON format with full product data
- Test metadata (which phase, validation flags)
- Confidence adjustments
- Timestamp for tracking over time

## Test Mode

When `test: true` is passed to the scraper endpoint, it returns additional metadata:

```json
{
  "testMetadata": {
    "phaseUsed": "ai-extraction",
    "priceValidation": {
      "foundInHtml": true,
      "checkedFormats": ["$59.99", "59.99", ...]
    },
    "imageExtraction": {
      "source": "og:image",
      "preExtracted": true
    },
    "confidenceAdjustments": [
      {
        "reason": "price_not_found_in_html",
        "adjustment": -20
      }
    ]
  }
}
```

This helps identify:
- Why tests fail
- Which extraction methods work best for which sites
- Where confidence penalties are applied

## Site Compatibility

### ✅ **Compatible Sites (Working)**

**Shopbop** - Server-side rendered, full HTML content
- Test results: 5/5 passed (100%)
- Confidence: 85-90%
- Image extraction: Reliable (media-amazon.com)
- Uses `name="og:image"` meta tag format
- **Architecture**: Server-side rendered
- **Why it works**: Full product data in initial HTML

**Traditional Shopify Stores** - Server-side rendered with Liquid templates
- **Not yet tested** - Need to find examples
- **Expected to work**: Uses Liquid templates, product data in HTML
- **What to look for**: Standard Shopify product pages without Hydrogen/Oxygen

### ❌ **Incompatible Sites (Not Working)**

**Nordstrom** - Client-side rendered (React/SPA)
- Test results: Returns skeleton HTML (~204KB) without product data
- **Architecture**: React single-page application
- **Why it fails**: Requires JavaScript to load content
- **Solution**: Needs Playwright/headless browser

**Shopify Hydrogen Stores** (e.g., Hiut Denim)
- Test results: 0/3 passed (0%)
- **Architecture**: Shopify Hydrogen/Oxygen (React-based framework)
- **Why it fails**: Returns skeleton HTML with `window.__remixManifest` and JavaScript imports
- **Example**: hiutdenim.co.uk - Uses React for rendering
- **Solution**: Needs Playwright/headless browser
- **Note**: This is Shopify's modern React framework, different from traditional Shopify

**Tentree** - Likely client-side rendered
- Test results: 0/3 passed (partial extraction, low confidence)
- **What worked**: Extracted product names and images
- **What failed**: Products not on sale (salePrice: $0)
- **Architecture**: Likely client-side rendered
- **Solution**: May need Playwright, or products need to be on sale to test properly

**TheOutnet** - Bot protection
- Blocks automated requests with ETIMEDOUT errors
- Actively prevents scraping
- **Solution**: May need Playwright with stealth mode

**Saks, Neiman Marcus** - Likely have similar issues (not tested)

### ⚠️ **Shopify: Two Architectures**

**Important:** "Shopify" is not a single platform architecture. There are two types:

1. **Traditional Shopify** (Liquid templates)
   - Server-side rendered
   - Full product data in HTML
   - **Expected to work with scraper** ✅
   - How to identify: Standard Shopify product page structure

2. **Shopify Hydrogen/Oxygen** (React framework)
   - Client-side rendered
   - Returns skeleton HTML only
   - **Won't work with scraper** ❌
   - How to identify: Look for `window.__remixManifest` in page source
   - Example sites: Hiut Denim

### 🔍 **What Makes a Site Compatible?**

For a site to work with the scraper, it needs:
1. **Server-side rendering** - Full HTML content in initial page load
2. **No bot protection** - Allows automated fetch requests
3. **Product metadata** - Either JSON-LD structured data OR visible HTML prices/images
4. **Meta tags** - og:image or twitter:image for product images

**Sites that need Playwright:**
- Client-side rendered (React, Next.js, Hydrogen)
- Heavy JavaScript-based rendering
- Bot protection that blocks fetch requests

## Playwright Integration (Hybrid Scraper)

### ✅ **WORKING** (as of 2024-11-13)

The scraper now includes a hybrid orchestrator with automatic Playwright fallback:

**Architecture:**
1. **Fast Scraper** (default) - JSON-LD → AI extraction (2-3 seconds)
2. **Playwright Fallback** (automatic) - Browser automation (10-15 seconds)

**Fallback Triggers:**
- Fast scraper fails
- Missing required fields (name, salePrice, imageUrl)
- Confidence score < 60%

**System Setup:**
- ✅ Playwright successfully launches with NixOS system Chromium
- ✅ System dependencies installed (mesa, nss, xorg.libX11, cairo, etc.)
- ✅ Browser automation functional
- ✅ Pages load and DOM extraction works

### Test Results (2024-11-13)

**Shopbop** (Server-side rendered)
- Fast scraper: ❌ Failed (AI couldn't extract from heavy HTML)
- Playwright: ⚠️  Timeout (page too heavy, waits for networkidle)
- **Recommendation**: Use fast scraper with optimized extraction

**Nordstrom** (Client-side React SPA)
- Fast scraper: ❌ Skeleton HTML only
- Playwright: ❌ **Bot detection** - Returns "We've noticed some unusual activity" challenge page
- **Recommendation**: Not suitable for automated scraping (bot protection active)

**Hiut Denim** (Shopify Hydrogen)
- Fast scraper: ❌ Minimal HTML (73 characters)
- Playwright: ❌ **Bot protection** - Returns "Oops" error page (likely geo-blocking or bot detection)
- **Recommendation**: Not suitable for automated scraping

### Known Limitations

1. **Bot Detection** - Major e-commerce sites (Nordstrom, high-value retailers) use sophisticated bot detection
   - Cloudflare, PerimeterX, DataDome, etc.
   - Detect automated browsers even with Playwright
   - Show challenge pages or block access

2. **Heavy Pages** - Sites with extensive JavaScript may timeout waiting for networkidle (30s limit)

3. **Geo-Blocking** - Some sites block based on server location

### Recommended Use Cases

**When Playwright Helps:**
- Smaller independent brands without bot protection
- Boutique stores with client-side rendering
- Sites that don't invest in anti-scraping measures

**When Playwright Won't Help:**
- Major department stores (Nordstrom, Saks, Bloomingdale's)
- High-value retailers with aggressive protection
- Sites using enterprise bot detection services

**Best Approach:**
1. Try fast scraper first (2-3s, works for most server-side rendered sites)
2. Auto-fallback to Playwright if fast scraper fails
3. Handle bot detection gracefully (return error to user)

## Recommended Test URLs

### Current Test Coverage:
- **Shopbop** (5 URLs) ✅ - All passing with 85-90% confidence
- **Shopify Hydrogen** (3 Hiut Denim URLs) ❌ - 0% success (client-side rendered)
- **Shopify** (3 Tentree URLs) ⚠️ - Low confidence, products not on sale

### Additional Sites to Test:
- **Traditional Shopify stores** - Need to find server-side rendered Shopify stores
- **Smaller boutiques** - Less likely to have bot protection
- **Independent brands** - Often use traditional e-commerce platforms
- **International sites** - May have different rendering strategies

## CI Integration

To fail CI when accuracy drops:

```bash
npm run test:scraper
# Exits with code 1 if any tests fail
```

## Troubleshooting

**No tests found:**
- Add URLs to `scraper-test-urls.json`
- Make sure URLs are not empty strings

**Auth errors:**
- Make sure `ADMIN_PASSWORD` environment variable is set

**Connection errors:**
- Backend must be running on port 3001
- Use `BACKEND_URL` env var to override
