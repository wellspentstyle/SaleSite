# Upcoming Sales Webpage

## Overview
A modern React + Vite web application designed to showcase upcoming designer sales and deals. Its primary purpose is to provide users with a clean, intuitive interface for discovering discounted luxury fashion items, featuring filtering capabilities, detailed sale information, and a seamless shopping experience through affiliate integrations. The project aims to monetize through affiliate links while offering a curated selection of sales.

## User Preferences
I prefer simple language and clear, concise explanations. I want iterative development with frequent, small updates. Ask for my approval before making any major architectural changes or introducing new third-party dependencies. I prefer functional components in React and a modular file structure.

## System Architecture
The application is built with React 18 and TypeScript, using Vite for a fast development experience. Styling is managed with a custom-themed Tailwind CSS v4, complemented by Radix UI primitives for accessible and customizable UI components. State management primarily utilizes React hooks.

**Deployment Architecture:**
- **Development**: Vite dev server (port 5000) + Backend server (port 3001) + Vite proxy for API requests
- **Production**: Single unified Express server serves both React build and API endpoints on port 3001
- **Routing**: Middleware strips `/api` prefix from requests for dev/prod compatibility, enabling SPA client-side routing (/, /admin, etc.)
- **Configuration**: autoscale deployment with build step (`npm run build`) + run command (`node server/webhook.js`)

**UI/UX Decisions:**
- Clean, minimalist design with a responsive grid layout
- Custom fonts (DM Sans, Crimson Pro) for a modern aesthetic
- Streamlined navigation with logo-only header (removed Discount Codes, Articles, About links)
- Sale cards display discount percentages, and featured sales include images
- Interactive dialogs for detailed product picks with "Shop Now" buttons

**Technical Implementations:**
- **Filtering**: Sales can be filtered by discount range (0-30%, 30-50%, 50%+) and active status.
- **Sorting**: Regular sales are automatically sorted from newest to oldest.
- **Admin Interface**: A password-protected `/admin` panel allows for managing product picks with editable brand fields on both auto-scraped and manual entry forms.
- **SEO**: Comprehensive meta tags (Title, Description, Keywords, Open Graph, Twitter Card) are implemented for improved search engine visibility and social sharing.
- **Performance Optimization**: 
  - In-memory caching with 5-minute TTL for the `/sales` endpoint reduces Airtable API calls by ~95%.
  - Cache automatically invalidates when admins save picks or clean URLs.
  - Airtable pagination implemented across all endpoints to handle unlimited records.
  - Picks are efficiently filtered using the SaleRecordIDs lookup field to only fetch data for live sales.

**Feature Specifications:**
- **Sales Listing**: Displays current and upcoming sales with discount percentages.
- **Featured Sales**: Dynamically displays sales marked as "Featured" in Airtable with associated images.
- **Product Picks**: Detailed product listings within a sale, including brand names, images, original/sale prices, and affiliate links. When brand differs from company (e.g., Proenza Schouler on Shopbop), brand is displayed above the product name in the picks dialog.
- **Hybrid Scraper**: Automatically extracts product data (brand, name, image, price, percent off) from URLs using a multi-phase pipeline (JSON-LD, HTML extraction, AI). Brand extraction intelligently identifies actual product brands (not website names). Includes a Playwright fallback for client-side rendered sites and a manual entry UI for failed scrapes. Batch scraping is optimized with domain-level skip logic: if the first URL from a domain fails, all remaining URLs from that domain are instantly skipped (avoiding wasted API calls and processing time).
- **Confidence Scoring**: Scraped products are assigned a confidence score (1-100) to indicate extraction accuracy, aiding in manual review.
- **Email Automation**: CloudMailin webhook integrates with Gmail to automatically parse incoming sale emails, extract details using AI, and populate Airtable, including duplicate prevention.
- **Instagram Story Automation**: Event-driven system that generates Instagram story images (1080x1920px) triggered by Airtable Automation when CreateStory field changes to "Create Story". Features include:
  - Webhook-based triggering via `/webhook/airtable-story` endpoint (eliminates inefficient polling)
  - Airtable Automation sends record ID to webhook when CreateStory field changes
  - Product photo with automatic zoom/crop to fill the frame
  - Dynamic text overlays in black bars with IBM Plex Mono font, positioned 40px from left, 1/3 from bottom:
    - When brand differs from company: 3 lines (price, product name, brand)
    - When brand matches company: 2 lines (price, product name)
  - Price format: "$250 vs. $500" (sale price vs. original price)
  - Smart image fetching with browser-like headers (User-Agent, Referer) to bypass 403/Forbidden errors
  - Domain-level blocklist tracks sites that block images, preventing repeated failed attempts
  - Auto-uploads to Google Drive in nested folders: "Product Images > Company > Sale Name"
  - Instant delivery to iPhone via Telegram bot for manual posting
  - Automatic status updates in Airtable ("Story Created")
- **Gem.app Sync**: Automated scraper for vintage clothing items saved on Gem.app. Features include:
  - Accessible via "💎 Sync Gem Items" button in admin panel header
  - Uses CloudMailin webhook to receive magic link authentication emails from Gem
  - Playwright browser automation to request login email and scrape saved items (gem.app/my-gems)
  - Incremental sync system using JSON marker file (first run: 5 items max, subsequent runs: only new items)
  - Dynamic Chromium path detection works in both development and production deployments
  - Robust error handling with user-friendly messages for troubleshooting
  - Saves items to Airtable Gem table with fields: ProductName, ProductURL, Brand, Price, Size, ImageURL, DateSaved, Marketplace
  - Magic links are single-use tokens, cached and cleared immediately after receipt to prevent reuse

## External Dependencies
- **Airtable**: Primary data source for all sales and product picks. Uses `AIRTABLE_BASE_ID` and `AIRTABLE_PAT` for secure access.
- **ShopMy**: Affiliate marketing platform for monetizing product links. Integrates with a custom formula in Airtable to generate affiliate URLs.
- **OpenAI**: Utilized for AI-powered data extraction from product URLs and email content within the scraper and email automation workflows.
- **CloudMailin**: Inbound email parsing service, used to receive and process forwarded sale emails via a webhook, secured with `CLOUDMAIL_SECRET`.
- **Telegram Bot API**: Free messaging service used to deliver generated Instagram stories to iPhone. Uses `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` for authentication.
- **Google Drive API**: Cloud storage for generated Instagram story images. Uses Replit's managed OAuth integration to automatically upload to the "Product Images" folder.
- **Radix UI**: Unstyled, accessible component primitives for building the user interface.
- **Lucide React**: Icon library for UI elements.
- **Recharts**: Charting library (though specific use not detailed, listed in dependencies).
- **Sonner**: A toast library for notifications (though specific use not detailed, listed in dependencies).
- **Vaul**: A drawer component for React (though specific use not detailed, listed in dependencies).