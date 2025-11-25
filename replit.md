# HEART Helper

## Overview

HEART Helper is an AI-powered repair order search tool for HEART Certified Auto Care shops. It helps technicians find similar historical jobs by matching vehicle details and repair types, leading to faster and more accurate estimates. The application integrates with Tekmetric, HEART's shop management system, and uses OpenAI's API for intelligent scoring and ranking of job matches. Key capabilities include AI-powered concern intake, phone answer scripts, intelligent repair term extraction, and smart year matching for broader searches.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

The frontend is built with React and TypeScript using Vite, styled with shadcn/ui (Radix UI primitives) and Tailwind CSS, adhering to HEART Certified Auto Care brand guidelines (colors, typography). It uses TanStack Query for server state and caching, and Wouter for lightweight routing. The layout features a three-column desktop design and a responsive single-column mobile stack.

### Backend Architecture

The backend uses Node.js with Express.js, providing REST endpoints for AI-powered job search, Tekmetric integration (read-only), and AI-driven concern intake. It employs Drizzle ORM with PostgreSQL (Neon serverless) for data storage, utilizing Tekmetric's external IDs for referential integrity. AI integration leverages OpenAI's `gpt-4o-mini` via Replit's AI Integrations for semantic job matching, repair term extraction, smart year compatibility, and progressive search broadening. A database-backed cache (SHA256-hashed search params) significantly speeds up repeat searches.

### Data Storage

The PostgreSQL database (Neon serverless) stores `vehicles`, `repair_orders`, `jobs`, `labor_items`, `parts`, `search_requests`, `search_cache` (with 1-hour TTL), and `settings` (user preferences). Tekmetric's external IDs are used as primary keys.

## External Dependencies

- **Tekmetric API**: Shop management system for repair order, vehicle, and customer data.
- **OpenAI API**: Large Language Model for semantic job matching and scoring.
- **Neon Database**: Serverless PostgreSQL hosting.
- **Google Fonts**: Inter and JetBrains Mono typefaces.
- **Key npm Packages**: `@neondatabase/serverless`, `drizzle-orm`, `openai`, `@tanstack/react-query`, `@radix-ui/*`, `tailwindcss`, `zod`, `wouter`.