# HEART Helper

## Overview

HEART Helper is an AI-powered repair order search tool for HEART Certified Auto Care shops. It helps technicians find similar historical jobs by matching vehicle details and repair types, leading to faster and more accurate estimates. The application integrates with Tekmetric, HEART's shop management system, and uses OpenAI's API for intelligent scoring and ranking of job matches.

### Key Capabilities

- **AI-Powered Concern Intake**: Interactive diagnostic Q&A workflow for customer calls with symptom-based expert questions (16 categories: brakes, engine, transmission, cooling, steering, A/C, etc.)
- **Phone Answer Scripts**: Professional scripts for incoming calls
- **9-Point Sales Script Format**: Structured AI-generated scripts with required sections (Rapport, Inspection Credentials, Digital Resources, Good-Good-Bad Presentation, Safety Urgency, Warranty, Price as Investment, Permission to Inspect, Follow-up Commitment)
- **Interactive Objection Handling**: Clickable buttons in Chrome extension for instant context-aware objection responses (price too high, no money, need spouse approval, waiting, selling car, need car today, always selling me) - uses templates with vehicle/pricing context substitution for instant responses with no AI delay
- **Intelligent Repair Term Extraction**: Semantic parsing of customer descriptions
- **Smart Year Matching**: Broader searches across compatible model years
- **Fuzzy Model Matching**: Automatically matches model variations (F150 = F-150 = F 150) for better search results
- **Service Writer Attribution**: Displays the service advisor who wrote each repair order, helping technicians identify jobs from experienced colleagues
- **User Authentication**: Custom username/password authentication (bcrypt hashing, session-based) with personalized settings and approval workflow
- **User Approval Workflow**: Auto-approves @heartautocare.com emails; other domains require admin approval
- **Per-User AI Training**: Personal training data for customized script generation
- **Script Feedback Tracking**: Thumbs up/down feedback to improve AI recommendations
- **Admin User Management**: Add/delete users, manage admin status, approve/reject pending users
- **Centralized Labor Rate Groups**: Organization-wide labor rate configuration by vehicle make and location, synced to Chrome extension
- **RingCentral Call Coaching**: Integration with RingCentral for call recording sync, AI-powered call scoring, and 10-point grading system for service advisor training

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

The frontend is built with React and TypeScript using Vite, styled with shadcn/ui (Radix UI primitives) and Tailwind CSS, adhering to HEART Certified Auto Care brand guidelines (colors, typography). It uses TanStack Query for server state and caching, and Wouter for lightweight routing. The layout features a three-column desktop design and a responsive single-column mobile stack.

Key pages:
- `/` - Landing page (unauthenticated) or Home page (authenticated)
- `/settings` - User preferences with personal AI training data, plus admin-only sections for Labor Rates, RingCentral Sync, and Coaching Criteria
- `/admin` - Team training management (admin only)
- `/admin/labor-rates` - Centralized labor rate group management (admin only)
- `/admin/extension-mapping` - RingCentral extension to user mapping (admin only)
- `/admin/coaching-criteria` - Call coaching 10-point grading system configuration (admin only)
- `/calls` - Call history with date/direction filters and recording status (role-based access)
- `/calls/:id` - Individual call detail with AI scoring, transcript, and coaching feedback
- `/coaching` - Coaching dashboard with team leaderboard, criteria performance charts, individual drill-down with AI-powered training recommendations (admin/manager only)

### Backend Architecture

The backend uses Node.js with Express.js, providing REST endpoints for AI-powered job search, Tekmetric integration (read-only), AI-driven concern intake, and user authentication. It employs Drizzle ORM with PostgreSQL (Neon serverless) for data storage, utilizing Tekmetric's external IDs for referential integrity. 

Key API endpoints:
- `/api/auth/*` - Username/password auth (register, login, logout, user)
- `/api/user/preferences` - User preferences CRUD
- `/api/scripts/feedback` - Script feedback submission
- `/api/sales/generate-script` - AI script generation with per-user training
- `/api/search` - AI-powered repair order search
- `/api/admin/*` - Admin user management, approvals, training data
- `/api/ringcentral/*` - RingCentral integration (test, sync, extensions, mappings)
- `/api/coaching/criteria` - Coaching criteria CRUD and seed-defaults
- `/api/coaching/dashboard` - Team dashboard stats with leaderboard (admin/manager only)
- `/api/coaching/dashboard/user/:userId` - Individual user performance stats (self or admin/manager)
- `/api/coaching/dashboard/criteria` - Criteria breakdown across all calls (admin/manager only)
- `/api/coaching/recommendations/:userId` - AI-powered personalized training recommendations based on call scoring history (self or admin/manager)
- `/api/calls` - Call recordings with role-based access and direction filtering (admin/manager/user)
- `/api/calls/:id` - Single call with AI score, criteria breakdown, and transcript
- `/api/calls/:id/score` - Trigger AI scoring of call transcript (admin only)
- `/api/calls/score-batch` - Batch score unscored sales calls (admin only, max 10 at a time)

All protected routes require both authentication and approval status check.

CORS is configured to allow Chrome extension origins (chrome-extension://), *.replit.dev, *.replit.app, and localhost with credentials support for cross-origin authentication.

### Chrome Extension (v3.19.0)

Located in `/chrome-extension/`, provides:
- **Built-in Login/Registration**: Users can sign in or create accounts directly in the extension side panel - no need to visit the web app
- Side panel UI for live call assistance with 5 main tabs:
  - **Incoming Caller**: Phone scripts and AI-powered concern intake Q&A
  - **Search**: Native repair order search with job details, pricing, and "Create Job in Tekmetric" button
  - **Sales Script**: AI-generated sales scripts with feedback tracking
  - **Tips**: Live coaching tips based on configured coaching criteria, with HEART 9-Point Method quick reference
  - **Rates**: View labor rate groups configured by admins
- **API-based vehicle data extraction**: Uses Tekmetric API via `/api/tekmetric/ro/:shopId/:roId` for accurate vehicle info (year, make, model, engine) instead of DOM scraping. Falls back to DOM parsing if API unavailable.
- **Create Job functionality**: From search results, users can click "Create Job in Tekmetric" to prepare job data for import
- **Labor Rate Sync**: Automatically syncs labor rate groups from server after login
- Tekmetric page integration for repair order and vehicle data
- AI sales script generation with personalization indicator
- Feedback submission (thumbs up/down) synced to server
- "Open App" button in header to access full web app (for admin features)
- Settings button (gear icon) for app URL configuration

Clicking the extension icon opens the side panel (configured via `chrome.sidePanel.setPanelBehavior` + `chrome.action.onClicked` listener). 

Extension auth requires HTTPS (production deployment) - local dev cannot support extension auth via cookies due to SameSite restrictions. Users sign in once via the extension and stay logged in for a week.

### Data Storage

The PostgreSQL database (Neon serverless) stores:
- `vehicles`, `repair_orders`, `jobs`, `labor_items`, `parts` - Tekmetric data
- `employees` - Service advisor names cached from Tekmetric (supports per-ID lookup for current & former employees)
- `search_requests`, `search_cache` (1-hour TTL) - Search optimization
- `settings` - Global application settings
- `users`, `sessions` - User authentication
- `user_preferences` - Per-user settings and AI training data (includes managedShopId for location-based access)
- `script_feedback` - User feedback on generated scripts
- `labor_rate_groups` - Centralized labor rate configuration by vehicle make and shop location
- `ringcentral_users` - RingCentral extension mappings to app users
- `call_recordings` - Call log data synced from RingCentral with transcripts
- `coaching_criteria` - Configurable 10-point grading system for call scoring
- `call_scores` - AI-generated scores per call with criterion-level details

Tekmetric's external IDs are used as primary keys for vehicle/RO data.

**Service Writer Lookup**: The Tekmetric `/employees` list only returns current employees (~30), but `/employees/{id}` returns any employee by ID including former staff. Employee names are cached in-memory and persisted to the `employees` table for fast lookups.

## External Dependencies

- **Tekmetric API**: Shop management system for repair order, vehicle, and customer data.
- **OpenAI API**: Large Language Model for semantic job matching and scoring.
- **Neon Database**: Serverless PostgreSQL hosting.
- **Google Fonts**: Inter and JetBrains Mono typefaces.
- **Key npm Packages**: `@neondatabase/serverless`, `drizzle-orm`, `openai`, `@tanstack/react-query`, `@radix-ui/*`, `tailwindcss`, `zod`, `wouter`, `bcryptjs`, `express-session`.