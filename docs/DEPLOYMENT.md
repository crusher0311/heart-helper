# Deployment Guide

This guide covers deploying HEART Helper to Render and other platforms.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Deploy to Render](#deploy-to-render)
- [Deploy to Other Platforms](#deploy-to-other-platforms)
- [Environment Variables](#environment-variables)
- [Database Setup](#database-setup)
- [Post-Deployment](#post-deployment)

## Prerequisites

Before deploying, ensure you have:

1. **PostgreSQL Database**: We recommend [Neon](https://neon.tech) for serverless PostgreSQL
2. **Required API Keys**:
   - Tekmetric API key and shop ID
   - OpenAI API key
   - Deepgram or AssemblyAI API key (for transcription)
   - RingCentral credentials (if using call coaching)
   - Resend API key (for password reset emails)

## Deploy to Render

### Option 1: Using render.yaml (Recommended)

1. **Fork/Push to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/your-org/heart-helper.git
   git push -u origin main
   ```

2. **Create Render Account**
   - Go to [render.com](https://render.com) and sign up
   - Connect your GitHub account

3. **Deploy Blueprint**
   - Click "New" → "Blueprint"
   - Select your repository
   - Render will detect `render.yaml` and configure the service

4. **Configure Environment Variables**
   - Go to your service's "Environment" tab
   - Add all required environment variables (see below)

### Option 2: Manual Setup

1. **Create Web Service**
   - Click "New" → "Web Service"
   - Connect your GitHub repository
   - Configure:
     - **Runtime**: Node
     - **Build Command**: `npm install && npm run build`
     - **Start Command**: `npm run start`
     - **Health Check Path**: `/api/health`

2. **Add Environment Variables**
   - Add all variables listed in the Environment Variables section

## Deploy to Other Platforms

### Railway

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway init
railway up
```

Configure environment variables in the Railway dashboard.

### Fly.io

1. Create `fly.toml`:
```toml
app = "heart-helper"
primary_region = "ord"

[build]
  builder = "heroku/buildpacks:20"

[env]
  NODE_ENV = "production"
  PORT = "8080"

[http_service]
  internal_port = 8080
  force_https = true

[[services]]
  internal_port = 8080
  protocol = "tcp"

  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]
```

2. Deploy:
```bash
fly launch
fly secrets set DATABASE_URL=your-url SESSION_SECRET=your-secret
fly deploy
```

### Docker

Build and run with Docker:

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
EXPOSE 5000
CMD ["npm", "run", "start"]
```

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | Secure random string for session encryption |
| `TEKMETRIC_API_KEY` | Tekmetric API key |
| `OPENAI_API_KEY` | OpenAI API key for AI features |

### Optional (Feature-Specific)

| Variable | Description |
|----------|-------------|
| `TEKMETRIC_SHOP_ID` | Default shop ID |
| `DEEPGRAM_API_KEY` | Deepgram API for transcription |
| `ASSEMBLYAI_API_KEY` | AssemblyAI API for transcription |
| `RINGCENTRAL_CLIENT_ID` | RingCentral OAuth client ID |
| `RINGCENTRAL_CLIENT_SECRET` | RingCentral OAuth secret |
| `RINGCENTRAL_JWT_TOKEN` | RingCentral JWT for API access |
| `RESEND_API_KEY` | Resend API for password reset emails |
| `APP_URL` | Base URL for email links (e.g., `https://app.example.com`) |
| `TRANSCRIPTION_PROVIDER` | `deepgram`, `assemblyai`, or `whisper` |

### Database Variables (Alternative to DATABASE_URL)

| Variable | Description |
|----------|-------------|
| `PGHOST` | Database host |
| `PGPORT` | Database port (usually 5432) |
| `PGUSER` | Database username |
| `PGPASSWORD` | Database password |
| `PGDATABASE` | Database name |

## Database Setup

### Using Neon (Recommended)

1. Create account at [neon.tech](https://neon.tech)
2. Create a new project
3. Copy the connection string to `DATABASE_URL`
4. Run migrations:
   ```bash
   npm run db:push
   ```

### Self-Hosted PostgreSQL

1. Create database:
   ```sql
   CREATE DATABASE heart_helper;
   CREATE USER heart_user WITH ENCRYPTED PASSWORD 'your-password';
   GRANT ALL PRIVILEGES ON DATABASE heart_helper TO heart_user;
   ```

2. Set connection string:
   ```
   DATABASE_URL=postgresql://heart_user:your-password@localhost:5432/heart_helper
   ```

3. Push schema:
   ```bash
   npm run db:push
   ```

## Post-Deployment

### Health Check

Verify deployment by checking:
```
GET https://your-app.render.com/api/health
```

### Create Admin User

1. Register a new account using a `@heartautocare.com` email (auto-approved)
2. Or register with any email and update the database:
   ```sql
   UPDATE user_preferences 
   SET is_admin = true, approval_status = 'approved' 
   WHERE user_id = (SELECT id FROM users WHERE email = 'your@email.com');
   ```

### Configure Chrome Extension

1. Open extension settings
2. Set the API URL to your deployed app URL
3. Login with your credentials

### Resend Email Setup

For password reset emails to work:

1. Sign up at [resend.com](https://resend.com)
2. Verify your domain or use their test domain
3. Create an API key
4. Update the `from` address in `server/auth.ts` to match your verified domain

## Troubleshooting

### Common Issues

**Sessions not persisting**
- Ensure `SESSION_SECRET` is set
- Check that PostgreSQL is accessible
- Verify `NODE_ENV=production` for secure cookies

**CORS errors with Chrome extension**
- The app allows `chrome-extension://` origins by default
- Ensure you're using HTTPS in production

**Transcription not working**
- Verify API keys for Deepgram/AssemblyAI
- Check `TRANSCRIPTION_PROVIDER` setting
- Review logs for specific errors

**RingCentral sync failing**
- Verify JWT token is valid
- Check client ID/secret match your app
- Ensure proper scopes are granted

## Monitoring

### Logs

View logs in your platform's dashboard:
- Render: Service → "Logs" tab
- Railway: Project → "Deployments" → "View Logs"

### Database

Monitor PostgreSQL connections:
```sql
SELECT count(*) FROM pg_stat_activity WHERE datname = 'heart_helper';
```

## Updates

To deploy updates:

1. Push changes to your main branch
2. Render/Railway will auto-deploy (if enabled)
3. Or manually trigger deployment in the dashboard
