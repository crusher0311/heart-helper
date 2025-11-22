# Repair Order Search Tool

## Overview

An AI-powered repair order search application that helps automotive shops find similar historical jobs by matching vehicle details and repair types. The system uses OpenAI's API to intelligently score and rank job matches, enabling technicians to quickly estimate labor hours and parts costs based on past work.

The application imports repair order data from Tekmetric (a shop management system) and provides a fast, productivity-focused interface for searching through historical job data.

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
2. Clicks "Check History" button (injected by extension)
3. Extension extracts:
   - Vehicle info (make, model, year, engine)
   - Customer concerns/complaints from textarea fields
   - Repair order ID
4. Search tool opens in new tab with pre-filled data
5. Search automatically executes with customer concerns as query
6. User reviews results, clicks on a match
7. Clicks "Send to Extension" to import selected job
8. Switches back to Tekmetric RO tab
9. Extension automatically fills in labor items and parts

**Carvis-Style Auto-Fill:**
- Extension intelligently extracts customer concerns from Tekmetric RO page
- Looks for fields labeled "concern", "complaint", "customer", "reason for visit"
- Pre-populates search field with extracted text (up to 200 chars)
- Shows "From Tekmetric" badge in UI to indicate auto-fill
- Automatically triggers search when concerns are found
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
- Design system follows productivity tool patterns (Linear, Notion, Airtable)
- Custom theme using CSS variables for consistent color system
- Typography uses Inter for UI and JetBrains Mono for technical data (part numbers, pricing)

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
- LLM used for semantic matching of repair jobs based on vehicle specs and repair type
- Scores candidates and provides reasoning for match quality
- **Smart Year Compatibility**: AI determines which model years are mechanically compatible
  - Considers powertrain generations, platform changes, and component interchangeability
  - Replaces blind ±2 year expansion with intelligent year selection
  - Example: Search for 2018 Toyota Sienna → AI identifies 2016-2020 share same 3.5L V6 powertrain
  - Falls back to ±2 years if AI unavailable or returns no results

**Data Flow**:
1. Tekmetric data synced continuously via external sync tool (109,423 repair orders, 610,698 jobs, 38,471 vehicles)
2. Vehicle data joined from vehicles table using vehicleId from job raw_data JSONB field
3. Search queries filter jobs by vehicle specs (make, model, year, engine) and repair type
4. If no exact year matches found, AI determines compatible model years based on powertrain/platform
5. AI service scores and ranks candidates using OpenAI (degrades gracefully to 85% default score)
6. Results returned with match scores, reasoning, and complete job details including calculated labor/parts totals

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