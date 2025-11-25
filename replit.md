# Upcoming Sales Webpage

## Overview
A React + Vite web application showcasing upcoming designer sales and deals. Its core purpose is to offer users an intuitive interface for discovering discounted luxury fashion items, complete with filtering, detailed sale information, and seamless shopping via affiliate integrations. The project aims to generate revenue through affiliate links by providing a curated selection of sales.

## User Preferences
I prefer simple language and clear, concise explanations. I want iterative development with frequent, small updates. Ask for my approval before making any major architectural changes or introducing new third-party dependencies. I prefer functional components in React and a modular file structure.

## Style Guidelines
**Fonts:**
- **DM Sans** (sans-serif): Used for all admin pages, headings, buttons, form labels, form inputs, and UI elements
- **Crimson Pro** (serif): Used for public-facing body text only

**Admin Pages:**
- Add `admin-page` class to the outermost wrapper div (e.g., `<div className="p-8 admin-page">`)
- This class automatically applies DM Sans to all text elements within the admin page
- Standard layout: `p-8` padding, `max-w-7xl mx-auto space-y-6` for centered content
- Headers: `text-3xl font-bold` for page titles
- Subtitles: `text-gray-600 mt-1` for descriptions

**Buttons:**
- Primary actions: Default Button component (black background, white text)
- Secondary actions: `variant="outline"` for less prominent actions
- All buttons use DM Sans font automatically

**Forms:**
- Labels inherit DM Sans from admin-page class
- Inputs inherit DM Sans from admin-page class
- Helper text: `text-xs text-muted-foreground`

**Global CSS Location:** `src/styles/globals.css` - contains admin-page class and font definitions

## System Architecture
The application uses React 18, TypeScript, and Vite for development. Tailwind CSS v3 handles styling, complemented by Radix UI for accessible components. State management relies on React hooks.

**Deployment Architecture:**
- **Development**: Vite dev server with a backend server and Vite proxy for API requests.
- **Production**: A single Express server serves both the React build and API endpoints.
- **Routing**: Middleware manages `/api` prefix for compatibility, enabling SPA client-side routing.
- **Configuration**: Autoscale deployment with build and run commands.
- **Environment Detection**: Uses `REPLIT_DEPLOYMENT` to switch Airtable bases between environments.

**UI/UX Decisions:**
- Minimalist, responsive design inspired by kickpleat.com, using custom fonts (DM Sans, Crimson Pro).
- Logo-only header and responsive hero section (mobile GIF, desktop video).
- Sale cards display discounts, with featured sales including images.
- Interactive dialogs for product picks with "Shop Now" buttons.
- Filter sidebar slides in from the right, pushing content.
- Default sort is "newest first."
- **Mobile Optimizations**: Responsive design with breakpoint-specific adjustments for hero media, button stacking, spacing, and dropdown width.

**Technical Implementations:**
- **Filtering**: Right-sliding sidebar with checkbox filters for TYPE, PRICE RANGE, DISCOUNT, MAX SIZE, and VALUES, using OR logic within categories and AND across categories.
- **Sorting**: Dropdown with 6 options. "FEATURED" sort displays featured items first with special styling, others use a unified grid.
- **Admin Interface**: Password-protected `/admin` panel using React Router with AdminLayout wrapper. Includes pages for managing product picks, sales approvals, brands, asset generation, freshness tracking, and Gem sync. Features a left sidebar navigation with notification badges (only visible when count > 0), session-based authentication via sessionStorage, and uniform auth header pattern across all API calls. Two-view pick manager with sale card quick actions (Edit button opens dialog for updating percentOff/promoCode/endDate with validation, Power toggle button for activating/deactivating sales with optimistic UI updates, Manual Entry button navigates to manual pick form), external link icons, delete confirmations, and a price calculator dialog. **Background Scraping**: Product scraper now runs in the background on the Add Picks page with real-time progress indicator showing "Scraping X of Y URLs processed" with percentage. After completion, automatically navigates to FinalizePicks page with scraped results and shows success notification. **Manual Pick Entry**: Separate form (`/admin/picks/manual`) for adding picks when scraping fails, with validation for required fields (URL, name, imageUrl, percentOff), auto-calculation of discount from prices, multi-pick support, and batch saving to Airtable with EntryType='manual' and Confidence=100. Includes a "Add Brands" page with an editable results table. **Dual Draft Systems**: Two independent JSON-based draft persistence systems enable pause-and-resume workflows: (1) `manual-pick-drafts.json` for ManualPickEntry standalone form, (2) `finalize-drafts.json` for FinalizePicks review page. FinalizePicks features "Save Draft" and "Publish to Airtable" buttons, saves complete state (picks with edits, manual entries, failed URLs, sale metadata, custom pricing overrides), auto-loads existing drafts on mount, and deletes drafts after successful publish. ManualEntryForm supports asynchronous data hydration via initialData prop and useEffect watcher. All draft endpoints secured with ADMIN_PASSWORD auth header. **UI Standardization**: All admin pages follow consistent Freshness.tsx layout pattern with `p-8` padding, `max-w-7xl mx-auto space-y-6` centered container, `text-3xl font-bold` headers, and `text-gray-600 mt-1` description subtitles for unified professional appearance.
- **SEO**: Comprehensive meta tags for visibility.
- **Performance Optimization**: In-memory caching (5-minute TTL) for `/sales` and Airtable pagination.
- **Hybrid Scraper**: Extracts product data from URLs using a multi-phase pipeline with Google Shopping API integration. Primary strategy: Google Shopping API (name, image, original price) + fresh page fetch (sale price) = 90% confidence. Fallback chain: JSON-LD → HTML deterministic → AI → Playwright. Features validation and confidence scoring.
- **Brand Research**: AI-powered tool (Serper.dev) for 6-phase targeted searches to extract brand details, including product URLs, pricing, categories, sizing, ownership, and diversity. Generates 1-2 sentence brand descriptions using Claude. Features automatic Airtable integration to update or create records, handling multi-select fields and providing feedback. **Enhanced Version (Nov 2024)**: Improved success rates with multi-strategy product search (price + collection pages), relaxed price extraction accepting ranges and estimates ($5-15k validation), smart price range calculation with AI-powered estimation fallback when no products found (36% → <10% missing), always-attempt size fetching even when categories unclear (32% → <20% missing), subdomain support for international brands (uk.brand.com, us.brand.com), and quality scoring system tracking data completeness and extraction methods (products/limited-products/estimated). Tested on St. Agni and Stine Goya with 97% quality scores. Expected overall quality improvement from ~70% to 85%+. **Google Shopping Integration (Nov 2024)**: Uses Google Shopping API's `source` field for retailer identification with normalized brand name matching (removes spaces, punctuation, case-insensitive) to handle brands like "Rachel Comey" vs "rachelcomey.com" and "St. Agni" vs "st-agni.com". Provides 40 products with accurate pricing from official sources, achieving 83-95% quality scores. **Data Source Tracking (Nov 2024)**: Automatically populates SizingSource field with short descriptions ("brand size chart", "analyzing current finds on the site") and Notes field with detailed extraction method info (price source, category source, sizing status) to provide transparency about data quality and provenance.
- **Email Automation**: CloudMailin webhook parses incoming sale emails, extracts details using AI, and populates Airtable. Enhanced with improved HTML content extraction (strips styles/scripts, handles HTML entities), better AI prompts with reasoning field for transparency, fuzzy duplicate detection (handles company name variations like "Gap" vs "GAP Inc." with 5% discount variance), lower confidence threshold (60% vs 70%) to reduce false negatives, and comprehensive debug logging showing AI reasoning and confidence scores. **Azure Content Filter Handling**: Gracefully handles Azure OpenAI content policy triggers (often false positives) by logging details and skipping the email instead of crashing, preventing service disruption. **Company Auto-Linking**: Automatically links sales to existing Company records using fuzzy matching (Dice coefficient with 90% threshold), creates new Company records when brand doesn't exist, and populates both OriginalCompanyName (plain text) and Company (linked record) fields. **Sales Approvals**: Fully protected manual review workflow for incoming sales. When enabled via admin toggle, extracted sales queue in `pending-sales.json` for review instead of auto-adding to Airtable. Admin UI (`/admin/sales-approvals`) displays pending sales with AI reasoning and confidence scores, allowing approve (adds to Airtable with duplicate checking) or reject actions. Features duplicate detection with "Replace This" option to replace existing similar sales (fuzzy company name matching with 5% discount variance). **Rejected Emails Tracking**: Shows last 50 rejected emails in scrollable table on Sales Approvals page with brand, subject, reason, and timestamp. Tracks rejections for: not promotional, missing fields, low confidence, and duplicates. All approval endpoints require `auth` header with ADMIN_PASSWORD for security. Toggle can be disabled to return to automated processing. **Testing Suite**: Comprehensive tools in `tools/` directory including 10-scenario test suite (`test-approval-workflow.js` validates full end-to-end flow), real-time monitoring dashboard, system diagnostics checker, and email rejection analyzer for debugging why specific emails fail.
- **Instagram Story Automation**: Event-driven system creating 1080x1920px Instagram images from Airtable data, uploading to Google Drive, and delivering via Telegram.
- **Gem.app Sync**: Automated scraper for vintage clothing items, accessible via admin panel. Uses CloudMailin for magic link authentication and Playwright for scraping, with enhanced authentication, popup handling, and background processing with live progress updates. **Diagnostic Mode**: Enhanced logging version that captures detailed page analysis, button detection, and screenshots at each step (`/tmp/gem-*.png`) to debug authentication issues. Logs exact page state including visible buttons, text content, and URLs at every stage of the authentication flow.
- **Featured Sales Assets**: Generates 1080x1350 Instagram images from selected sales, auto-uploads to Google Drive.
- **Freshness Tracking**: Hybrid manual/automated system to track product pick availability. Admin panel provides bulk refresh actions, mark-sold-out workflow, and filtering. Frontend filters out sold-out/stale items. Nightly checks validate picks.
- **Brand Watchlist Directory**: Public `/brands` page showcasing curated brands/shops from Airtable. Features two sections (Brands/Shops), a left sidebar with counts, and uses the FilterSidebar component. Cards link to affiliate or official brand URLs.
- **Newsletter Signup**: Dual newsletter capture system for building email list. (1) Popup modal appears after 3 seconds on first visit with headline "Never Pay Full Price for Good Design" and CTA "I'm In". Uses localStorage to prevent repeated displays. (2) Footer newsletter signup form in 4-column layout with email input and "Subscribe" button. Both save to Airtable Newsletter table with Email, SubscribedDate, and Source fields. Backend endpoint `/api/newsletter/subscribe` validates emails, prevents duplicates, and logs subscriptions. Future integration: Manual export to Substack at https://wellspentstyle.substack.com/.

## External Dependencies
- **Airtable**: Primary data source.
- **ShopMy**: Affiliate marketing platform.
- **OpenAI**: AI for data extraction.
- **Serper.dev**: Google search API for brand research.
- **CloudMailin**: Inbound email parsing.
- **Telegram Bot API**: Delivers Instagram stories.
- **Google Drive API**: Stores Instagram story images.
- **Radix UI**: Unstyled component primitives.
- **Lucide React**: Icon library.
- **Recharts**: Charting library.
- **Sonner**: Toast notification library.
- **Vaul**: Drawer component.