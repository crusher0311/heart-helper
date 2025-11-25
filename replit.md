# HEART Helper

## Overview

**HEART Helper** is an AI-powered repair order search tool designed specifically for HEART Certified Auto Care shops. Following HEART's mission of "Helping Everyone Achieve Reliable Transportation," this tool empowers technicians to find similar historical jobs by matching vehicle details and repair types, enabling faster and more accurate estimates.

Built with HEART's brand values of **Integrity**, **Passion**, and **Transparency**, the application uses OpenAI's API to intelligently score and rank job matches, helping technicians quickly estimate labor hours and parts costs based on past work at HEART locations.

The application integrates seamlessly with Tekmetric (HEART's shop management system) and features a fast, productivity-focused interface designed in HEART's brand colors and typography.

**Current Status (Nov 25, 2025)**: Fully functional with complete HEART branding, working search with AI scoring, database-backed caching, and Chrome extension integration v2.3.2. All core features operational.

**Latest Improvements (Nov 25, 2025)**:
- **AI Repair Term Extraction**: Intelligently extracts core repair terms from verbose descriptions
  - Example: "Rear Suspension/Shocks leaking" → searches for ["rear shocks", "shock absorber", "suspension"]
  - Uses gpt-4o-mini to identify primary component and common terminology variations
  - Database search now uses OR logic to match ANY extracted term (much smarter than literal substring match)
  - Falls back to exact phrase if AI extraction fails
- **Smart Year Matching**: Automatically searches ±2 years from specified year (e.g., 2016 → includes 2014-2018)
  - Prevents "0 results" when exact year doesn't match but compatible model years exist
  - Most parts/repairs work across multiple model years (2016-2018 often share same components)
  - "Broaden Search" now uses AI to find even wider compatible years if needed
- Fixed URL params overwriting user edits in repair type field (now loads only once on mount)
- Chrome extension v2.3.1: Heart icons now explicitly HEART Red (#ED1C24)
  - Uses ♥ character (CSS-styleable) instead of ❤️ emoji for consistent branding
  - Only injects in concern sections (not jobs/labor/parts)

**Tekmetric Integration**: Chrome extension integration that automates adding jobs to Tekmetric repair orders:
1. **Chrome Extension**: Browser extension that auto-fills labor items and parts into Tekmetric by automating the UI
2. **API Integration**: Used for read-only operations (fetching pricing, shop data) - API does not support creating custom jobs

## User Preferences

Preferred communication style: Simple, everyday language.

## Tekmetric Integration

### Chrome Extension (Primary Method)

A Chrome extension (`chrome-extension/`) automates adding jobs to Tekmetric repair orders:
- **Send to Extension** button in job detail panel sends complete job data to the extension
- Extension auto-fills Tekmetric repair order forms with labor items and parts by automating UI interactions
- Extracts current RO ID from Tekmetric URL when user clicks "Check History"
- Popup UI shows pending and last imported job status
- Secure message passing with origin validation
- Installation: Load unpacked extension from `chrome-extension/` folder in Chrome
- See `chrome-extension/INSTALL.md` for setup instructions

**User Workflow:**
1. User is on Tekmetric repair order page (e.g., RO #275076696)
2. **Carvis-Style UX**: HEART icons appear next to each concern/complaint textarea
3. User clicks HEART icon next to specific concern they want to search
4. Extension extracts:
   - Vehicle info (make, model, year, engine)
   - That specific concern's text
   - Repair order ID
5. Search tool opens in new tab with pre-filled data
6. Search automatically executes with that concern as query
7. User reviews results, clicks on a match
8. Clicks "Send to Extension" to import selected job
9. Switches back to Tekmetric RO tab
10. Extension automatically fills in labor items and parts

**Carvis-Style Interface:**
- Individual HEART icons (red heart, HEART brand color) appear next to each concern/complaint textarea
- Icons positioned in top-right corner of each text field
- Hover effect: Icon fills with HEART Red and scales up slightly
- Click icon → opens HEART Helper with that specific concern pre-filled
- Extension automatically detects concern fields by class/placeholder keywords
- Shows "From Tekmetric" badge in UI to indicate auto-fill
- User can edit pre-filled text if needed

### API Integration (Read-Only)

Tekmetric API is used for read-only operations only:
- **Limitations**: PATCH `/api/v1/repair-orders/{id}` only updates RO metadata (mileage, technician, etc.) - does NOT support adding custom jobs
- **Discovery**: API silently accepts job data in PATCH requests but ignores it - appears successful (200 OK) but nothing happens
- **Current Use**: Fetching shop information and current parts pricing for comparison
- **Configuration**: Requires `TEKMETRIC_API_KEY` environment variable

Note: Chrome extension UI automation is the only viable method for programmatically adding jobs to repair orders.

## System Architecture

### Frontend Architecture

**Framework**: React with TypeScript using Vite as the build tool

**UI Component Library**: shadcn/ui (Radix UI primitives) with Tailwind CSS for styling
- Design system follows HEART Certified Auto Care brand guidelines
- **Brand Colors**: HEART Red (HSL 357° 85% 52%), Dark Gray (HSL 0° 0% 10%), Light Grey (HSL 0° 0% 95%)
- **Typography**: Aleo (serif) for headlines per brand guide, Inter/Helvetica/Arial for body text
- Custom theme using CSS variables for consistent color system aligned with HEART branding
- JetBrains Mono for technical data (part numbers, VINs, pricing)

**State Management**:
- TanStack Query (React Query) for server state and API caching
- Local component state for UI interactions
- No global state management needed due to simple data flow

**Routing**: Wouter (lightweight client-side routing)

**Layout Strategy**:
- Three-column desktop layout: search filters (25%), results list (40%), detail panel (35%)
- Responsive mobile layout with single-column stack
- Sticky header and search panel for quick access

### Backend Architecture

**Runtime**: Node.js with Express.js server

**API Design**: REST endpoints for search and Tekmetric integration
- `/api/search` - AI-powered job search with vehicle filtering and similarity scoring
  - Supports filtering by vehicle make, model, year, and engine
  - Joins against vehicles table synced from Tekmetric
  - Falls back to unscored results if AI is unavailable
  - **Database-Backed Caching**: SHA256-hashed search params cache full results for 1 hour
    - Cache HIT: <1 second response time (instant results, no AI cost)
    - Cache MISS: 20-30 seconds (AI scoring required, results cached for future searches)
    - Returns uniform format: `{results, cached, cachedAt}` for all responses
- `/api/search/recent` - Fetch last 10 search queries from history with timestamps
- `/api/tekmetric/create-estimate` - Create repair order estimates directly in Tekmetric
- `/api/tekmetric/refresh-pricing` - Fetch current parts pricing from Tekmetric (informational)
- `/api/tekmetric/test` - Test API connection for specific shop location
- `/api/tekmetric/status` - Check API configuration status and available shops
- `/api/settings` - Manage user preferences (default shop location)

**Database ORM**: Drizzle ORM with type-safe query building
- Schema-first approach with TypeScript types generated from database schema
- Migration support via drizzle-kit

**AI Integration**: 
- OpenAI API accessed through Replit's AI Integrations service
- **Model**: gpt-4o-mini for fast, cost-effective scoring (~22 seconds per search)
- **Repair Term Extraction** (NEW): AI extracts searchable terms from customer language before database search
  - Handles verbose/technical descriptions: "Rear Suspension/Shocks leaking will affect tire wear" → ["rear shocks", "shock absorber", "suspension"]
  - Database uses OR logic to find jobs matching ANY extracted term (not literal substring match)
  - Dramatically improves search recall for customer-written concerns from Tekmetric
- LLM used for semantic matching of repair jobs based on vehicle specs and repair type
- Scores candidates and provides reasoning for match quality
- **Performance Optimizations**:
  - Limits AI scoring to top 20 candidates (down from 30) for 30-40% speed improvement
  - Uses 2000 max tokens (down from 4096) for faster responses
  - Response parser handles multiple JSON formats from AI (jobs, matches, results, arrays)
- **Smart Year Compatibility**: AI determines which model years are mechanically compatible
  - Considers powertrain generations, platform changes, and component interchangeability
  - Replaces blind ±2 year expansion with intelligent year selection
  - Example: Search for 2018 Toyota Sienna → AI identifies 2016-2020 share same 3.5L V6 powertrain
  - Falls back to ±2 years if AI unavailable or returns no results
- **Progressive Broadening**: When searches return zero results, users can click "Broaden Search" to progressively expand search scope
  - Stage 1: Broaden year ranges using AI (getCompatibleYears)
  - Stage 2: Find similar models using AI (getSimilarModels) - e.g., Honda Accord → Acura TLX, Toyota Camry
  - Stage 3: Remove all vehicle filters and search across all vehicles
  - Each stage includes fallbacks to ensure users get results
  - Frontend automatically progresses through stages on consecutive clicks

**Data Flow**:
1. Tekmetric data synced continuously via external sync tool (109,423 repair orders, 610,698 jobs, 38,471 vehicles)
2. Vehicle data joined from vehicles table using vehicleId from job raw_data JSONB field
3. Search queries filter jobs by vehicle specs (make, model, year, engine) and repair type
4. **Engine Filter Handling**: NULL/empty engine values are included in results to accommodate incomplete historical data
5. If no exact year matches found, AI determines compatible model years based on powertrain/platform
6. AI service scores and ranks candidates using OpenAI (degrades gracefully to 85% default score)
7. Results returned with match scores, reasoning, and complete job details including calculated labor/parts totals

### Data Storage

**Database**: PostgreSQL (via Neon serverless)
- Connection pooling for efficiency
- WebSocket support for serverless environment

**Schema Design**:
- `vehicles` - Vehicle information (make, model, year, engine, VIN)
- `repair_orders` - Top-level repair orders with totals and status
- `jobs` - Individual repair jobs within orders
- `labor_items` - Labor line items with hours and rates
- `parts` - Parts used in jobs with pricing
- `search_requests` - Audit log of search queries
- `search_cache` - Database-backed search result cache with 1-hour TTL
  - Stores SHA256-hashed search params as key
  - Full results stored as JSONB for instant retrieval
  - Includes timestamp for cache age display and automatic expiration
  - Reduces repeat search times from 20-30 seconds to <1 second
- `settings` - User preferences (default shop ID for Tekmetric API)

**ID Strategy**: Uses Tekmetric's external IDs as primary keys to maintain referential integrity with source system

**Relationships**:
- Repair orders → vehicles (many-to-one)
- Jobs → repair orders (many-to-one)
- Jobs → vehicles (many-to-one)
- Labor items → jobs (many-to-one)
- Parts → jobs (many-to-one)

### External Dependencies

**Third-Party Services**:
- **Tekmetric API** (data source) - Shop management system providing repair order, vehicle, and customer data
- **OpenAI API** (via Replit AI Integrations) - LLM for semantic job matching and similarity scoring
- **Neon Database** - Serverless PostgreSQL hosting
- **Google Fonts** - Inter and JetBrains Mono typefaces

**Key npm Packages**:
- `@neondatabase/serverless` - PostgreSQL client with WebSocket support
- `drizzle-orm` - Type-safe ORM and query builder
- `openai` - Official OpenAI SDK
- `@tanstack/react-query` - Server state management
- `@radix-ui/*` - Accessible UI primitives
- `tailwindcss` - Utility-first CSS framework
- `zod` - Runtime type validation
- `wouter` - Lightweight routing

**Development Tools**:
- TypeScript for type safety across frontend and backend
- Vite for fast frontend development and HMR
- esbuild for backend bundling in production
- drizzle-kit for database migrations