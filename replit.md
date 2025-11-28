# HEART Helper

## Overview

HEART Helper is an AI-powered repair order search tool for HEART Certified Auto Care shops. It helps technicians find similar historical jobs by matching vehicle details and repair types, leading to faster and more accurate estimates. The application integrates with Tekmetric, HEART's shop management system, and uses OpenAI's API for intelligent scoring and ranking of job matches.

### Key Capabilities

- **AI-Powered Concern Intake**: Interactive diagnostic Q&A workflow for customer calls
- **Phone Answer Scripts**: Professional scripts for incoming calls
- **Intelligent Repair Term Extraction**: Semantic parsing of customer descriptions
- **Smart Year Matching**: Broader searches across compatible model years
- **User Authentication**: Replit Auth with personalized settings and approval workflow
- **User Approval Workflow**: Auto-approves @heartautocare.com emails; other domains require admin approval
- **Per-User AI Training**: Personal training data for customized script generation
- **Script Feedback Tracking**: Thumbs up/down feedback to improve AI recommendations
- **Admin User Management**: Add/delete users, manage admin status, approve/reject pending users

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

The frontend is built with React and TypeScript using Vite, styled with shadcn/ui (Radix UI primitives) and Tailwind CSS, adhering to HEART Certified Auto Care brand guidelines (colors, typography). It uses TanStack Query for server state and caching, and Wouter for lightweight routing. The layout features a three-column desktop design and a responsive single-column mobile stack.

Key pages:
- `/` - Landing page (unauthenticated) or Home page (authenticated)
- `/settings` - User preferences with personal AI training data

### Backend Architecture

The backend uses Node.js with Express.js, providing REST endpoints for AI-powered job search, Tekmetric integration (read-only), AI-driven concern intake, and user authentication. It employs Drizzle ORM with PostgreSQL (Neon serverless) for data storage, utilizing Tekmetric's external IDs for referential integrity. 

Key API endpoints:
- `/api/auth/*` - Replit Auth login/logout/user
- `/api/user/preferences` - User preferences CRUD
- `/api/scripts/feedback` - Script feedback submission
- `/api/sales/generate-script` - AI script generation with per-user training
- `/api/search` - AI-powered repair order search
- `/api/admin/*` - Admin user management, approvals, training data

All protected routes require both authentication and approval status check.

CORS is configured to allow Chrome extension origins (chrome-extension://), *.replit.dev, *.replit.app, and localhost with credentials support for cross-origin authentication.

### Chrome Extension (v3.7.0)

Located in `/chrome-extension/`, provides:
- Side panel UI for live call assistance with 3 main tabs:
  - **Incoming Caller**: Phone scripts and AI-powered concern intake Q&A
  - **Search**: Native repair order search with job details, pricing, and "Create Job in Tekmetric" button
  - **Sales Script**: AI-generated sales scripts with feedback tracking
- **API-based vehicle data extraction**: Uses Tekmetric API via `/api/tekmetric/ro/:shopId/:roId` for accurate vehicle info (year, make, model, engine) instead of DOM scraping. Falls back to DOM parsing if API unavailable.
- **Create Job functionality**: From search results, users can click "Create Job in Tekmetric" to prepare job data for import
- Tekmetric page integration for repair order and vehicle data
- User authentication status display
- AI sales script generation with personalization indicator
- Feedback submission (thumbs up/down) synced to server
- "Open App" button in header to access full web app
- Settings button (gear icon) for app URL configuration

Clicking the extension icon opens the side panel (configured via `chrome.sidePanel.setPanelBehavior` + `chrome.action.onClicked` listener). The "Open App" button in the header opens the full web app in a new tab.

Extension auth requires HTTPS (production deployment) - local dev cannot support extension auth via cookies due to SameSite restrictions.

### Data Storage

The PostgreSQL database (Neon serverless) stores:
- `vehicles`, `repair_orders`, `jobs`, `labor_items`, `parts` - Tekmetric data
- `search_requests`, `search_cache` (1-hour TTL) - Search optimization
- `settings` - Global application settings
- `users`, `sessions` - User authentication
- `user_preferences` - Per-user settings and AI training data
- `script_feedback` - User feedback on generated scripts

Tekmetric's external IDs are used as primary keys for vehicle/RO data.

## External Dependencies

- **Tekmetric API**: Shop management system for repair order, vehicle, and customer data.
- **OpenAI API**: Large Language Model for semantic job matching and scoring.
- **Replit Auth**: User authentication via OIDC.
- **Neon Database**: Serverless PostgreSQL hosting.
- **Google Fonts**: Inter and JetBrains Mono typefaces.
- **Key npm Packages**: `@neondatabase/serverless`, `drizzle-orm`, `openai`, `@tanstack/react-query`, `@radix-ui/*`, `tailwindcss`, `zod`, `wouter`, `passport`, `openid-client`.