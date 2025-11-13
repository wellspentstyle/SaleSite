# Upcoming Sales Webpage

## Overview
A modern React + Vite web application for displaying upcoming sales and designer deals. The app features a clean, minimalist design with filtering capabilities and detailed sale information dialogs.

## Project Structure
- **Frontend**: React 18 with TypeScript
- **Build Tool**: Vite 6.x
- **Styling**: Pre-compiled Tailwind CSS v4 (custom theme)
- **UI Components**: Radix UI primitives with custom styling
- **State Management**: React hooks (useState, useMemo)

## Key Features
- Sales listing with discount percentages
- Featured sales section with images (dynamic display based on Airtable)
- Filter by discount range (0-30%, 30-50%, 50%+)
- Filter by active sales only
- Sale picks dialog with product details
- Responsive grid layout with bottom-aligned buttons
- Automatic sorting (newest to oldest for regular sales)
- Custom fonts (DM Sans, Crimson Pro)

## Development Setup
The project is configured to run on port 5000 in Replit:
- Development server: `npm run dev` (runs on port 5000)
- Build command: `npm run build`
- Host: `0.0.0.0` (configured for Replit proxy)

## File Organization
```
/src
  /assets          - Static images (Figma exports)
  /components      - React components
    /figma         - Figma-specific components
    /ui            - Reusable UI components (buttons, dialogs, etc.)
  /data            - Mock sales data (deprecated - now using Airtable)
  /services        - API services (Airtable integration)
  /styles          - Global CSS styles
  /types           - TypeScript type definitions
  App.tsx          - Main application component
  main.tsx         - Application entry point
  index.css        - Pre-compiled Tailwind CSS
  vite-env.d.ts    - Vite environment type definitions
/tests
  scraper-test-urls.json  - Test URL catalog for automated testing
  run-scraper-tests.js    - Automated test runner script
  README.md               - Testing system documentation
  /results                - Test results (JSON format with timestamps)
```

## Dependencies
- React ecosystem: react, react-dom
- UI Components: @radix-ui/* (comprehensive set)
- Styling: class-variance-authority, clsx, tailwind-merge
- Icons: lucide-react
- Forms: react-hook-form
- Misc: next-themes, recharts, sonner, vaul

## Recent Changes
- **2025-11-13**: Manual Fallback UI for Failed Scrapes
  - **Hybrid Scraper with Playwright**: Automatic fallback from fast scraper to Playwright browser automation
    - Fast scraper tries JSON-LD → AI extraction first (2-3 seconds)
    - Playwright fallback for client-side rendered sites (10-15 seconds)
    - Returns `{ successes: [], failures: [] }` instead of failing entirely
    - Both extraction methods tracked with metadata
  - **Manual Entry Forms**: New UI for products that fail automated scraping
    - Admin sees manual entry forms at top of Finalize Picks page
    - Each failed URL gets its own form with fields:
      - Product Name (text input)
      - Image URL (URL input)
      - Original Price (number, $)
      - Sale Price (number, $)
      - Percent Off (auto-calculated)
    - Forms can be removed if URL is not needed
    - Manual entries merged with auto-scraped products before saving
  - **EntryType Field**: New Airtable "EntryType" field tracks data source
    - `automatic` - Successfully scraped by AI/scraper
    - `manual` - Manually entered by admin
    - Manual entries always get Confidence = 100
  - **Bulk URL Processing**: Updated scraper endpoint accepts arrays
    - Single request processes all URLs in parallel
    - Returns detailed successes/failures lists
    - Each result includes extraction method and confidence
  - **Bot Protection Handling**: Graceful degradation for protected sites
    - Major retailers (Nordstrom, Saks) have bot detection
    - Hybrid scraper tries both methods, then fails gracefully
    - Failed URLs presented to admin for manual entry
    - No blocking or errors - smooth workflow continues

- **2025-11-13**: Product Scraper Speed & Accuracy Improvements
  - **Multi-Phase Extraction Pipeline**: Completely rewrote scraper for 3-5x speed improvement
    - **Phase 1 - JSON-LD Structured Data** (instant, 95% confidence):
      - Extracts Schema.org product data from `<script type="application/ld+json">`
      - Handles @graph containers and nested product arrays
      - Normalizes image URLs (supports string, object, array formats)
      - Validates absolute URLs (http/https only)
    - **Phase 2 - Smart HTML Extraction + Image Pre-extraction**:
      - Pre-extracts product images from og:image and twitter:image meta tags (instant, free)
      - Passes pre-extracted image to AI as context for better accuracy
      - Targets price/product-related sections (50KB max)
      - Falls back to raw HTML when no patterns match
      - Reduces AI processing time and cost
    - **Phase 3 - AI Extraction with Confidence Scoring**:
      - OpenAI gpt-4o-mini extracts product data when structured data unavailable
      - Returns confidence score (1-100) with each extraction
      - Minimum 50% confidence required to accept results
      - Fixed prompt to prevent placeholder image URLs (example.com, placeholder.com)
    - **Phase 4 - Comprehensive Validation**:
      - Verifies prices exist in HTML (10 format variants)
      - Supports: $59.99, $1,299.99, 59.99, 1,299.99, 59,99, 5999 cents, $50, etc.
      - Validates percent-off math (tolerance: ±2%)
      - Rejects placeholder image domains
      - Applies -20 confidence penalty for validation failures
  - **Confidence Score Display**: New Airtable "Confidence" field
    - Saved with each scraped product
    - Color-coded badges in admin finalize picks page:
      - Green (80-100%): High confidence
      - Yellow (60-79%): Medium confidence
      - Red (50-59%): Low confidence (review recommended)
    - Helps identify uncertain extractions requiring manual review
  - **Image Extraction Improvements**:
    - Pre-extracts images from meta tags before AI call (fast, reliable)
    - Supports both `property="og:image"` and `name="og:image"` formats (handles Shopbop, Amazon, etc.)
    - Checks for both attribute orders: property-then-content and content-then-property
    - Strong anti-placeholder instructions in AI prompt (uses non-copyable example values)
    - Validation layer rejects common placeholder domains
    - No performance impact - uses regex extraction (instant)
  - **Automated Testing System**:
    - Test URL catalog (`tests/scraper-test-urls.json`) populated with 5 real Shopbop product URLs
    - **Test results: 5/5 passed (100% success rate)**
    - Confidence scores: 85-90% across all products
    - Test mode support (`test: true` parameter) returns extraction metadata
    - Automated test runner script (`npm run test:scraper`)
    - Validates: product name, image URL, prices, confidence scores
    - Enhanced metadata tracking: price format validation, image source, confidence adjustments
    - Results reporting with pass/fail by category and phase statistics
    - Saves detailed JSON results to `tests/results/` with timestamps
    - **Site Compatibility Documentation**:
      - ✅ Shopbop: Fully compatible (server-side rendered, 100% success)
      - ❌ Nordstrom: Client-side rendered (React/SPA), returns skeleton HTML
      - ❌ TheOutnet: Bot protection blocks automated requests
      - Documented requirements for compatible sites in `tests/README.md`

- **2025-11-05**: Admin System & Product Picks Management
  - **Admin Interface** (`/admin`): Password-protected admin panel for managing product picks
    - Session-based authentication with `ADMIN_PASSWORD` secret
    - Sale selector to choose which sale to add picks to
    - Bulk URL input (paste multiple product URLs, one per line)
    - Real-time product scraping with AI-powered data extraction
  - **AI Product Scraping**: OpenAI integration extracts structured product data from URLs
    - Automatically extracts: product name, image URL, original price, sale price, percent off
    - URL validation to prevent SSRF attacks (blocks private IPs and non-HTTP protocols)
    - Numeric validation ensures prices are valid numbers
  - **Picks Data Structure**: New "Picks" table in Airtable
    - Fields: ProductURL, ProductName, ImageURL, OriginalPrice, SalePrice, PercentOff, SaleID (linked), ShopMyURL, Confidence
    - ShopMy affiliate URLs automatically generated and stored (format: `https://go.shopmy.us/ap/l9N1lH?url=ENCODED_URL`)
    - Picks linked to sales via SaleID field
  - **Frontend Picks Display**: Updated sale picks dialog to show real product data
    - Product cards with images, names, prices (original/sale), and discount percentages
    - "Shop Now" buttons with ShopMy affiliate links for each product
    - Responsive grid layout (2 columns on desktop, 1 on mobile)
    - "View Picks" button only appears when sale has associated picks
  - **Security Improvements**:
    - Removed sensitive header logging from debug middleware
    - Added URL validation for product scraping endpoint
    - Numeric validation for all price fields

- **2025-11-04**: Email-to-Airtable Automation & SEO
  - **CloudMailin Webhook Integration**: Created automated email parsing workflow (port 3001)
  - **AI-Powered Extraction**: OpenAI integration extracts sale details with confidence scoring (1-100)
  - **Duplicate Prevention**: Blocks same company + percentOff within 2-week window
  - **Email Forwarding**: Gmail (wellspentstylelinks@gmail.com) → CloudMailin webhook
  - **PromoCode Field**: Fixed field mapping from DiscountCode to PromoCode
  - **SEO Metadata**: Comprehensive meta tags for search engines and social sharing
    - Title: "Curated Designer Sales | Well Spent Style"
    - Description: Designer brands (Tibi, Totême, Dries Van Noten) updated daily
    - Keywords: Luxury fashion, designer sales, curated discounts
    - Open Graph and Twitter Card support for social sharing
    - Canonical URL: www.wellspentstyle.com
  - Airtable Integration & Featured Sales
  - Integrated Airtable API to fetch real sales data
  - Created Airtable service with secure credentials management
  - Added featured sales section with image display
  - Featured section only shows when sales are marked `Featured="YES"` in Airtable
  - Regular sales sorted by date (newest to oldest)
  - Sale cards now show "???" for empty end dates
  - Added ShopMy affiliate tracking script for monetization
  - Updated hero text positioning with responsive padding (6/8/12)
  - Improved sale card layout with bottom-aligned buttons using flexbox
  - Fixed discount filter parsing for "50+" range

- **2025-11-03**: Initial Replit setup
  - Configured Vite for port 5000 with 0.0.0.0 host
  - Fixed `__dirname` issue for ESM modules
  - Added proper TypeScript configuration
  - Configured deployment for autoscale
  - Replaced placeholder assets with wellspentstyle branding

## Deployment Configuration
- **Target**: Autoscale (stateless web application)
- **Build**: `npm run build` (outputs to `build/` directory)
- **Run**: `npx serve -s build -l 5000` (production static file server)

## Data Source
- **Airtable Integration**: Sales data is fetched from Airtable via API
  - Base ID: Stored in `AIRTABLE_BASE_ID` secret
  - Personal Access Token: Stored in `AIRTABLE_PAT` secret
  - Table: "Sales"
  - Only sales with `Live="YES"` are displayed on the website
  - Supports fields: Company, PercentOff, StartDate, EndDate, SaleURL, DiscountCode, Featured, Image
  - **Featured Sales**: Set `Featured="YES"` in Airtable to display sale in featured section with image
  - **Images**: Upload images to the "Image" field (attachment type) in Airtable for featured sales

## Affiliate Tracking
- **ShopMy Integration**: Affiliate link monetization through ShopMy platform
  - Username: `karitek`
  - Script ID: `l9N1lH`
  - **ShopMyURL Field**: Airtable formula generates affiliate links
    - Formula: `"https://go.shopmy.us/ap/karitek?url=" & ENCODE_URL_COMPONENT({CleanURL})`
    - Format: `https://go.shopmy.us/ap/karitek?url=ENCODED_URL`
  - **Domain Approval**: Requires `www.wellspentstyle.com` to be approved in ShopMy Account Settings → Advanced → Allowed Domains
  - **View Picks Button**: Only displays when sale has picks (dynamic visibility)

## Notes
- The CSS is pre-compiled from Tailwind v4, so no PostCSS processing is needed
- Airtable credentials are securely stored as Replit secrets
- To show sales on the website, set the `Live` field to "YES" in Airtable
