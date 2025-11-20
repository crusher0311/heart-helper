# Repair Order Search Tool

## Overview

An AI-powered repair order search application that helps automotive shops find similar historical jobs by matching vehicle details and repair types. The system uses OpenAI's API to intelligently score and rank job matches, enabling technicians to quickly estimate labor hours and parts costs based on past work.

The application imports repair order data from Tekmetric (a shop management system) and provides a fast, productivity-focused interface for searching through historical job data.

## User Preferences

Preferred communication style: Simple, everyday language.

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

**API Design**: REST endpoints for search operations
- `/api/search` - AI-powered job search with vehicle filtering and similarity scoring
  - Supports filtering by vehicle make, model, year, and engine
  - Joins against vehicles table synced from Tekmetric
  - Falls back to unscored results if AI is unavailable

**Database ORM**: Drizzle ORM with type-safe query building
- Schema-first approach with TypeScript types generated from database schema
- Migration support via drizzle-kit

**AI Integration**: 
- OpenAI API accessed through Replit's AI Integrations service
- LLM used for semantic matching of repair jobs based on vehicle specs and repair type
- Scores candidates and provides reasoning for match quality

**Data Flow**:
1. Tekmetric data synced continuously via external sync tool
2. Vehicle data joined from vehicles table (last 2 years populated)
3. Search queries filter jobs by vehicle specs and repair type
4. AI service scores and ranks candidates (optional - degrades gracefully)
5. Results returned with match scores and vehicle details

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