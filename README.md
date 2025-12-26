# HEART Helper

AI-powered repair order search and call coaching tool for HEART Certified Auto Care shops.

## Features

- **AI-Powered Repair Search**: Find similar historical jobs by vehicle details and repair type
- **Live Call Assistance**: Chrome extension for real-time call coaching and scripts
- **Sales Script Generation**: Personalized AI-generated sales scripts with 9-point method
- **Call Recording & Coaching**: RingCentral integration with AI-powered call scoring
- **Warranty Tracking**: Service history with warranty coverage analysis
- **Labor Rate Management**: Centralized hourly and job-based labor rate configuration
- **Tekmetric Integration**: Direct connection to shop management system

## Tech Stack

- **Frontend**: React 18, Vite, Tailwind CSS, shadcn/ui
- **Backend**: Node.js, Express.js, TypeScript
- **Database**: PostgreSQL (Neon serverless)
- **AI/ML**: OpenAI GPT-4, Deepgram, AssemblyAI
- **Integrations**: Tekmetric, RingCentral, Resend

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL database (or Neon account)
- Required API keys (see Environment Variables)

### Installation

```bash
# Install dependencies
npm install

# Push database schema
npm run db:push

# Start development server
npm run dev
```

### Build for Production

```bash
# Build frontend and backend
npm run build

# Start production server
npm run start
```

## Environment Variables

Create a `.env` file with the following variables:

```env
# Database
DATABASE_URL=postgresql://user:pass@host:5432/db
PGHOST=host
PGPORT=5432
PGUSER=user
PGPASSWORD=pass
PGDATABASE=db

# Session (generate a secure random string)
SESSION_SECRET=your-secret-here

# Tekmetric API
TEKMETRIC_API_KEY=your-key
TEKMETRIC_SHOP_ID=your-shop-id

# AI Services
OPENAI_API_KEY=your-key
DEEPGRAM_API_KEY=your-key
ASSEMBLYAI_API_KEY=your-key

# RingCentral (for call coaching)
RINGCENTRAL_CLIENT_ID=your-client-id
RINGCENTRAL_CLIENT_SECRET=your-secret
RINGCENTRAL_JWT_TOKEN=your-jwt

# Email (for password reset)
RESEND_API_KEY=your-key

# Optional
APP_URL=https://your-app-url.com
TRANSCRIPTION_PROVIDER=deepgram
```

## Deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for detailed deployment instructions for Render and other platforms.

## Chrome Extension

The Chrome extension is located in `/chrome-extension/`. See the extension's README for installation instructions.

## Project Structure

```
/
├── client/           # React frontend
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   └── lib/
├── server/           # Express backend
│   ├── auth.ts       # Authentication
│   ├── routes.ts     # API routes
│   ├── storage.ts    # Database operations
│   └── index.ts      # Server entry
├── shared/           # Shared types & schema
│   └── schema.ts     # Drizzle ORM schema
├── chrome-extension/ # Chrome extension
└── docs/             # Documentation
```

## License

MIT
