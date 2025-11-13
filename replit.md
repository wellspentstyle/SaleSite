# Upcoming Sales Webpage

## Overview
A modern React + Vite web application designed to showcase upcoming designer sales and deals. Its primary purpose is to provide users with a clean, intuitive interface for discovering discounted luxury fashion items, featuring filtering capabilities, detailed sale information, and a seamless shopping experience through affiliate integrations. The project aims to monetize through affiliate links while offering a curated selection of sales.

## User Preferences
I prefer simple language and clear, concise explanations. I want iterative development with frequent, small updates. Ask for my approval before making any major architectural changes or introducing new third-party dependencies. I prefer functional components in React and a modular file structure.

## System Architecture
The application is built with React 18 and TypeScript, using Vite for a fast development experience. Styling is managed with a custom-themed Tailwind CSS v4, complemented by Radix UI primitives for accessible and customizable UI components. State management primarily utilizes React hooks.

**UI/UX Decisions:**
- Clean, minimalist design with a responsive grid layout.
- Custom fonts (DM Sans, Crimson Pro) for a modern aesthetic.
- Sale cards display discount percentages, and featured sales include images.
- Interactive dialogs for detailed product picks with "Shop Now" buttons.

**Technical Implementations:**
- **Filtering**: Sales can be filtered by discount range (0-30%, 30-50%, 50%+) and active status.
- **Sorting**: Regular sales are automatically sorted from newest to oldest.
- **Admin Interface**: A password-protected `/admin` panel allows for managing product picks.
- **SEO**: Comprehensive meta tags (Title, Description, Keywords, Open Graph, Twitter Card) are implemented for improved search engine visibility and social sharing.
- **Performance Optimization**: 
  - In-memory caching with 5-minute TTL for the `/sales` endpoint reduces Airtable API calls by ~95%.
  - Cache automatically invalidates when admins save picks or clean URLs.
  - Airtable pagination implemented across all endpoints to handle unlimited records.
  - Picks are efficiently filtered using the SaleRecordIDs lookup field to only fetch data for live sales.

**Feature Specifications:**
- **Sales Listing**: Displays current and upcoming sales with discount percentages.
- **Featured Sales**: Dynamically displays sales marked as "Featured" in Airtable with associated images.
- **Product Picks**: Detailed product listings within a sale, including images, original/sale prices, and affiliate links.
- **Hybrid Scraper**: Automatically extracts product data (name, image, price, percent off) from URLs using a multi-phase pipeline (JSON-LD, HTML extraction, AI). Includes a Playwright fallback for client-side rendered sites and a manual entry UI for failed scrapes.
- **Confidence Scoring**: Scraped products are assigned a confidence score (1-100) to indicate extraction accuracy, aiding in manual review.
- **Email Automation**: CloudMailin webhook integrates with Gmail to automatically parse incoming sale emails, extract details using AI, and populate Airtable, including duplicate prevention.

## External Dependencies
- **Airtable**: Primary data source for all sales and product picks. Uses `AIRTABLE_BASE_ID` and `AIRTABLE_PAT` for secure access.
- **ShopMy**: Affiliate marketing platform for monetizing product links. Integrates with a custom formula in Airtable to generate affiliate URLs.
- **OpenAI**: Utilized for AI-powered data extraction from product URLs and email content within the scraper and email automation workflows.
- **CloudMailin**: Inbound email parsing service, used to receive and process forwarded sale emails via a webhook, secured with `CLOUDMAIL_SECRET`.
- **Radix UI**: Unstyled, accessible component primitives for building the user interface.
- **Lucide React**: Icon library for UI elements.
- **Recharts**: Charting library (though specific use not detailed, listed in dependencies).
- **Sonner**: A toast library for notifications (though specific use not detailed, listed in dependencies).
- **Vaul**: A drawer component for React (though specific use not detailed, listed in dependencies).