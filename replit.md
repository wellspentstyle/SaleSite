# Upcoming Sales Webpage

## Overview
A React + Vite web application designed to showcase upcoming designer sales and deals. Its primary goal is to provide users with an intuitive platform for discovering discounted luxury fashion items, featuring filtering capabilities, detailed sale information, and direct shopping access via affiliate links. The project aims to monetize through these affiliate partnerships by offering a curated selection of sales.

## User Preferences
I prefer simple language and clear, concise explanations. I want iterative development with frequent, small updates. Ask for my approval before making any major architectural changes or introducing new third-party dependencies. I prefer functional components in React and a modular file structure.

## System Architecture
The application is built using React 18, TypeScript, and Vite, with Tailwind CSS v3 for styling and Radix UI for accessible components. State management leverages React hooks.

**Deployment Architecture:**
- **Development**: Vite dev server with a backend server and API proxy.
- **Production**: A single Express server serves both the React build and API.
- **Routing**: `/api` middleware for SPA client-side routing.
- **Configuration**: Autoscale deployment with environment detection for Airtable base switching.

**UI/UX Decisions:**
- Minimalist, responsive design inspired by kickpleat.com, using custom fonts (DM Sans, Crimson Pro).
- Features a logo-only header, responsive hero section (GIF/video), and interactive sale cards.
- Filter sidebar slides from the right, while a default "newest first" sorting is applied.
- Optimized for mobile with breakpoint-specific adjustments.

**Technical Implementations:**
- **Filtering & Sorting**: Right-sliding sidebar with checkbox filters (TYPE, PRICE RANGE, DISCOUNT, MAX SIZE, VALUES) using OR logic within categories and AND across, alongside a 6-option dropdown sorter.
- **Admin Interface**: Password-protected `/admin` panel with React Router, providing pages for managing product picks, sales approvals, brands, asset generation, freshness tracking, and Gem sync. Includes session-based authentication, a two-view pick manager with quick actions, and a background product scraper with real-time progress. Supports manual pick entry with validation and multi-pick support. Implements dual JSON-based draft systems for manual picks and finalizing scraped results, allowing pause-and-resume workflows.
- **Hybrid Scraper**: Extracts product data from URLs using a multi-phase pipeline, integrating Google Shopping API for high confidence data and falling back to JSON-LD, HTML, AI, and Playwright. Features validation and confidence scoring.
- **Brand Research**: AI-powered tool leveraging Serper.dev for targeted searches to extract brand details, generate descriptions using Claude, and integrate with Airtable. Enhanced with multi-strategy product search, relaxed price extraction, improved size fetching, subdomain support, and a quality scoring system. Google Shopping integration identifies retailers and provides accurate pricing.
- **Email Automation**: CloudMailin webhook parses incoming sale emails, extracts details using AI, and populates Airtable. Features improved HTML content extraction, better AI prompts with reasoning, fuzzy duplicate detection, graceful handling of Azure content filters, and automatic company linking. Includes a fully protected sales approval workflow via `/admin/sales-approvals` with duplicate detection and tracking of rejected emails.
- **Instagram Story Automation**: Event-driven system generating 1080x1920px Instagram story images from Airtable data, uploading to Google Drive, and delivering via Telegram.
- **Gem.app Sync**: Automated scraper for vintage clothing, accessible via admin panel, with enhanced authentication and live progress updates. Includes a diagnostic mode for debugging. Gem items have dedicated server-rendered detail pages at `/gem/:recordId` with Open Graph meta tags for Instagram link sharing with proper product image unfurling.
- **Featured Sales Assets**: Generates 1080x1920 Instagram story images from selected sales, uploads to Google Drive, and tracks in Airtable. Features a click-to-configure workflow, a background job system for generation, and integration with Late.dev API for programmatic Instagram posting.
- **Freshness Tracking**: Hybrid manual/automated system for tracking product pick availability, with bulk refresh actions and nightly checks.
- **Brand Watchlist Directory**: Public `/brands` page displaying curated brands from Airtable with filtering and links.
- **Newsletter Signup**: Dual system (popup modal and footer form) for email capture, saving to Airtable with validation and duplicate prevention.

## External Dependencies
- **Airtable**: Primary data storage.
- **ShopMy**: Affiliate marketing platform.
- **OpenAI**: AI for data extraction and processing.
- **Serper.dev**: Google search API for brand research.
- **CloudMailin**: Inbound email parsing.
- **Telegram Bot API**: Delivers Instagram stories.
- **Google Drive API**: Stores Instagram story images.
- **Late.dev**: Social media API for Instagram posting.
- **Radix UI**: Unstyled component primitives.
- **Lucide React**: Icon library.
- **Recharts**: Charting library.
- **Sonner**: Toast notification library.
- **Vaul**: Drawer component.