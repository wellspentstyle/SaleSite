# Upcoming Sales Webpage

## Overview
A modern React + Vite web application designed to showcase upcoming designer sales and deals. Its primary purpose is to provide users with a clean, intuitive interface for discovering discounted luxury fashion items, featuring filtering capabilities, detailed sale information, and a seamless shopping experience through affiliate integrations. The project aims to monetize through affiliate links while offering a curated selection of sales.

## User Preferences
I prefer simple language and clear, concise explanations. I want iterative development with frequent, small updates. Ask for my approval before making any major architectural changes or introducing new third-party dependencies. I prefer functional components in React and a modular file structure.

## System Architecture
The application is built with React 18 and TypeScript, using Vite for a fast development experience. Styling is managed with a custom-themed Tailwind CSS v4, complemented by Radix UI primitives for accessible and customizable UI components. State management primarily utilizes React hooks.

**Deployment Architecture:**
- **Development**: Vite dev server + Backend server + Vite proxy for API requests.
- **Production**: Single unified Express server serves both React build and API endpoints.
- **Routing**: Middleware strips `/api` prefix for dev/prod compatibility, enabling SPA client-side routing.
- **Configuration**: Autoscale deployment with build step and run command.
- **Environment Detection**: Automatically detects production vs. development using `REPLIT_DEPLOYMENT` to switch Airtable bases.

**UI/UX Decisions:**
- Clean, minimalist design with a responsive grid layout inspired by kickpleat.com aesthetic.
- Custom fonts (DM Sans and Crimson Pro) for a modern aesthetic.
- Streamlined navigation with a logo-only header.
- Sale cards display discount percentages, and featured sales include images.
- Interactive dialogs for detailed product picks with "Shop Now" buttons.
- Sort and Filter controls are aligned to the right.
- Filter sidebar slides in from the right, pushing content over with smooth transitions and synchronized margin transitions.

**Technical Implementations:**
- **Filtering**: Right-sliding sidebar with checkbox-based filtering for TYPE (BRAND, SHOP, HAS PICKS), PRICE RANGE, DISCOUNT, MAX SIZE (WOMEN), and VALUES (SUSTAINABLE, WOMEN-OWNED, INDEPENDENT LABEL, SECONDHAND, BIPOC-OWNED). Filters use OR logic within categories and AND logic across categories.
- **Sorting**: Dropdown with 6 options (FEATURED, ALPHABETICALLY A-Z/Z-A, DISCOUNT HIGH TO LOW, DATE OLD/NEW TO OLD).
- **Admin Interface**: A password-protected `/admin` panel using React Router for managing product picks, brands, and asset generation. Includes a top-level layout with password gate, a fixed-width left sidebar navigation, and app-wide Sonner toast notifications.
- **SEO**: Comprehensive meta tags (Title, Description, Keywords, Open Graph, Twitter Card) for improved visibility.
- **Performance Optimization**: In-memory caching with 5-minute TTL for the `/sales` endpoint and Airtable pagination across all endpoints.
- **Sales Listing**: Displays current and upcoming sales with discount percentages and dynamically highlights featured sales.
- **Product Picks**: Detailed product listings within a sale, including brand names, images, prices, and affiliate links.
- **Hybrid Scraper**: Automatically extracts product data (brand, name, image, price, percent off) from URLs using a multi-phase pipeline (JSON-LD, HTML extraction, AI) with Playwright fallback and manual entry UI. Includes confidence scoring.
- **Brand Research**: AI-powered brand research tool using Serper.dev API for targeted searches to extract product URLs, ownership, sustainability, sizing, category, and diversity information.
- **Email Automation**: CloudMailin webhook integrates with Gmail to automatically parse incoming sale emails, extract details using AI, and populate Airtable, with duplicate prevention.
- **Instagram Story Automation**: Event-driven system generating 1080x1920px Instagram story images triggered by Airtable Automation. Features dynamic text overlays, smart image fetching, auto-uploads to Google Drive, and Telegram delivery.
- **Gem.app Sync**: Automated scraper for vintage clothing items saved on Gem.app, accessible via the admin panel. Uses CloudMailin for magic link authentication and Playwright for scraping, with incremental sync and robust error handling.
- **Featured Sales Assets**: Social media asset generator creating 1080x1350 Instagram-ready images with dynamic content and styling from selected sales, auto-uploads to Google Drive.

## External Dependencies
- **Airtable**: Primary data source for sales and product picks.
- **ShopMy**: Affiliate marketing platform for monetizing product links.
- **OpenAI**: AI-powered data extraction for scraping and email automation.
- **Serper.dev**: Real-time Google search API for brand research.
- **CloudMailin**: Inbound email parsing service for sale emails and Gem.app authentication.
- **Telegram Bot API**: Delivers generated Instagram stories to iPhone.
- **Google Drive API**: Cloud storage for generated Instagram story images.
- **Radix UI**: Unstyled, accessible component primitives.
- **Lucide React**: Icon library.
- **Recharts**: Charting library.
- **Sonner**: Toast notification library.
- **Vaul**: Drawer component for React.