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

### ❌ **Incompatible Sites (Not Working)**

**Nordstrom** - Client-side rendered (React/SPA)
- Returns skeleton HTML (~204KB) without product data
- Requires JavaScript to load content
- Scraper cannot extract data from empty pages

**TheOutnet** - Bot protection
- Blocks automated requests with ETIMEDOUT errors
- Actively prevents scraping

**Saks, Neiman Marcus** - Likely have similar bot protection (not tested)

### 🔍 **What Makes a Site Compatible?**

For a site to work with the scraper, it needs:
1. **Server-side rendering** - Full HTML content in initial page load
2. **No bot protection** - Allows automated fetch requests
3. **Product metadata** - Either JSON-LD structured data OR visible HTML prices/images
4. **Meta tags** - og:image or twitter:image for product images

## Recommended Test URLs

### Current Test Coverage:
- **Shopbop** (5 URLs) ✅ - All passing with 85-90% confidence

### Additional Sites to Try:
- **Shopify stores** - Independent brands often use Shopify
- **Smaller boutiques** - Less likely to have bot protection
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
