# Agency Reports Platform - Project Plan

## Summary

Build a lightweight monthly reporting platform for a marketing agency. MVP generates PDF reports with Google Analytics (GA4) data. Later phases add Google Ads, Rank Tracking, and automated email delivery.

**Key Constraints:**

- Solo developer, learning-focused (backend/devops experience)
- Local-first development, deploy to GCP Cloud Run later
- Moderate pace (~4-6 weeks for usable MVP)
- Start with GA4 connector only

---

## Phase 1: Project Foundation ✅ COMPLETE

### 1.1 Repository Setup

- [x] Initialize pnpm monorepo with workspace configuration
- [x] Create package structure (api, web, renderer, shared)
- [x] Configure TypeScript with shared base config
- [x] Set up ESLint + Prettier

### 1.2 Local Development Environment

- [x] Create `docker-compose.yml` with PostgreSQL 15
- [x] Create `.env.example` with all required variables

### 1.3 Database Schema

- [x] Set up Kysely with PostgreSQL
- [x] Create initial migration with core tables:
  - `users` (agency admins)
  - `clients` (agency clients)
  - `data_sources` (OAuth connections)
  - `snapshots` (monthly data snapshots)
  - `jobs` (background job tracking)

**Files created:**

- `packages/api/src/db/database.ts`
- `packages/api/src/db/migrations/001_initial.ts`
- `packages/api/src/db/types.ts`
- `packages/shared/src/types.ts`
- `docker-compose.yml`
- `pnpm-workspace.yaml`
- `tsconfig.base.json`

---

## Phase 2: Backend Core ✅ COMPLETE

### 2.1 Fastify Server Setup

- [x] Basic Fastify server with:
  - CORS configuration
  - Error handling plugin
  - Request logging
  - Health check endpoint (`GET /health`)

### 2.2 Authentication System

- [x] JWT-based auth with `@fastify/jwt`
- [x] Password hashing with bcrypt
- [x] Endpoints:
  - `POST /auth/register` (initial setup)
  - `POST /auth/login`
  - `GET /auth/me` (verify token)
- [x] Auth middleware for protected routes

### 2.3 Client CRUD

- [x] Basic client management endpoints:
  - `GET /clients`
  - `POST /clients`
  - `GET /clients/:id`
  - `PUT /clients/:id`
  - `DELETE /clients/:id`
- [x] Validation with Zod schemas

**Files created:**

- `packages/api/src/plugins/auth.ts`
- `packages/api/src/routes/auth.routes.ts`
- `packages/api/src/routes/clients.routes.ts`
- `packages/api/src/services/auth.service.ts`
- `packages/api/src/services/client.service.ts`
- `packages/api/src/lib/errors.ts`
- `packages/api/src/lib/validation.ts`

---

## Phase 3: Google Analytics Integration

### 3.1 Google OAuth Flow

- [x] Set up Google Cloud Console project
- [x] Configure OAuth consent screen (external, testing mode)
- [x] Implement OAuth endpoints:
  - `GET /oauth/google/url` - Generate consent URL
  - `GET /oauth/google/callback` - Handle OAuth callback
- [x] Store refresh tokens (encrypted in production, plain for local dev)

**OAuth setup checklist (local dev):**

- [x] Create GCP project + enable Analytics Admin/Data APIs
- [x] Configure OAuth consent screen (External → Testing)
- [x] Add test users (your Google accounts)
- [x] Create OAuth Web Client credentials
- [x] Add redirect URI: `http://localhost:3000/oauth/google/callback`
- [x] Set `.env`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`

### 3.2 GA4 Connector

- [x] Implement GA4 Data API client using `googleapis`
- [x] Fetch metrics:
  - Sessions, users, new users
  - Pageviews, bounce rate, avg session duration
  - Traffic sources (channel breakdown)
  - Key events (conversions)
- [x] Handle token refresh
- [x] Create data source record on successful connection

### 3.3 Snapshot Generation

- [x] Create snapshot service that:
  - Fetches GA4 data for a given month
  - Calculates period-over-period changes (vs previous month)
  - Saves JSON to local storage (file system)
  - Records snapshot in database
- [x] Endpoint: `POST /clients/:id/snapshots` (on-demand generation)

**Files to create:**

- `packages/api/src/connectors/google-auth.ts`
- `packages/api/src/connectors/google-analytics.connector.ts`
- `packages/api/src/services/snapshot.service.ts`
- `packages/api/src/services/storage.service.ts`
- `packages/api/src/routes/oauth.routes.ts`
- `packages/api/src/routes/snapshots.routes.ts`

---

## Phase 4: PDF Report Generation

### 4.1 Report Template

- [ ] Create HTML/CSS report template (Handlebars)
- [ ] Sections:
  - Header (client name, report period)
  - Executive summary (top-line metrics with % changes)
  - Traffic sources (table + simple chart)
  - Key events/conversions table
- [ ] Server-render charts as SVG using `chartjs-node-canvas`

### 4.2 Renderer Service

- [ ] Separate Node.js service with Puppeteer
- [ ] Endpoint: `POST /render` accepts HTML, returns PDF buffer
- [ ] Configure for print-optimized output (A4, margins)
- [ ] Local dev: runs as separate process or Docker container

### 4.3 PDF Generation Flow

- [ ] API endpoint: `GET /clients/:id/preview?month=YYYY-MM` (HTML preview)
- [ ] API endpoint: `POST /clients/:id/reports` (generate PDF)
- [ ] Store generated PDF alongside snapshot JSON
- [ ] Endpoint: `GET /snapshots/:id/pdf` (download PDF)

**Files to create:**

- `packages/renderer/src/templates/report.hbs`
- `packages/renderer/src/charts.ts`
- `packages/api/src/services/render.service.ts`

---

## Phase 5: Frontend MVP

### 5.1 React Setup

- [ ] Vite + React 19 + TypeScript
- [ ] TailwindCSS for styling
- [ ] React Router for navigation
- [ ] Simple API client with fetch

### 5.2 Core Pages

- [ ] **Login Page** - Email/password form
- [ ] **Dashboard** - Client list with status indicators
- [ ] **Client Detail Page**:
  - Basic client info (editable)
  - Data source connection status
  - "Connect Google Analytics" button (OAuth flow)
  - Snapshot history list
  - "Generate Report" button
  - PDF download links
- [ ] **Report Preview** - Embedded HTML preview (iframe)

### 5.3 UI Components

- [ ] Keep it simple - use minimal custom components
- [ ] Focus on functionality over polish

**Files to create:**

- `packages/web/src/pages/LoginPage.tsx`
- `packages/web/src/pages/DashboardPage.tsx`
- `packages/web/src/pages/ClientDetailPage.tsx`
- `packages/web/src/pages/ReportPreviewPage.tsx`
- `packages/web/src/lib/api.ts`
- `packages/web/src/components/` (as needed)

---

## Phase 6: GCP Deployment

### 6.1 Containerization

- [ ] Create Dockerfiles for:
  - `packages/api/Dockerfile`
  - `packages/renderer/Dockerfile`
- [ ] Test locally with `docker-compose up`

### 6.2 GCP Setup

- [ ] Create GCP project
- [ ] Enable APIs: Cloud Run, Cloud SQL, Cloud Storage, Secret Manager
- [ ] Set up:
  - Cloud SQL PostgreSQL instance (db-f1-micro for MVP)
  - GCS bucket for snapshots/PDFs
  - Secret Manager for OAuth credentials, JWT secret
- [ ] Configure IAM service accounts

### 6.3 Cloud Run Deployment

- [ ] Deploy API service
- [ ] Deploy Renderer service
- [ ] Set up VPC connector for Cloud SQL access
- [ ] Configure environment variables from Secret Manager
- [ ] Set up custom domain (optional)

### 6.4 Frontend Deployment

- [ ] Build static assets
- [ ] Deploy to Cloud Storage + Cloud CDN, or Firebase Hosting

---

## Future Phases (Post-MVP)

### Phase 7: Google Ads Connector

- [ ] Apply for Google Ads API developer token
- [ ] Implement Ads connector with metrics from TDD section 7.3
- [ ] Add Ads section to report template

### Phase 8: Rank Tracker Integration

- [ ] Integrate Rank Tracker API
- [ ] Add keyword management UI
- [ ] Add rankings section to report template

### Phase 9: Automated Scheduling

- [ ] Cloud Scheduler for monthly triggers
- [ ] Cloud Tasks for job queue
- [ ] SendGrid integration for email delivery
- [ ] Job monitoring UI

### Phase 10: Production Hardening

- [ ] GCP KMS for token encryption
- [ ] Proper error handling and retries
- [ ] Monitoring (Cloud Logging, error tracking)
- [ ] Backup and retention policies

---

## Architecture Decisions

| Decision       | Choice                     | Rationale                                                              |
| -------------- | -------------------------- | ---------------------------------------------------------------------- |
| Cloud Provider | GCP Cloud Run              | Natural fit with Google APIs, simple container deployment, pay-per-use |
| Database       | PostgreSQL + Kysely        | Type-safe queries, good learning, not too magical                      |
| PDF Generation | Separate Puppeteer service | Learn microservices, isolate heavy resource usage                      |
| Auth           | JWT + bcrypt               | Simple, stateless, well-understood pattern                             |
| Frontend       | React + Vite + Tailwind    | Fast dev experience, minimal config                                    |
| Local Dev      | Docker Compose             | Consistent environment, easy to replicate                              |

---

## Verification Checkpoints

### After Phase 2 (Backend Core):

```bash
# Start services
docker-compose up -d
pnpm --filter api dev

# Test auth
curl -X POST localhost:3000/auth/register -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test123","name":"Test"}'

# Test clients CRUD
curl localhost:3000/clients -H "Authorization: Bearer <token>"
```

### After Phase 4 (PDF Generation):

```bash
# Start renderer service
pnpm --filter renderer dev

# Generate a report (after connecting GA4)
curl -X POST localhost:3000/clients/<id>/reports?month=2025-12 \
  -H "Authorization: Bearer <token>"

# Download PDF
curl localhost:3000/snapshots/<id>/pdf -H "Authorization: Bearer <token>" -o report.pdf
```

### After Phase 5 (Frontend):

- Open http://localhost:5173
- Log in with test credentials
- Add a test client
- Connect Google Analytics (OAuth flow)
- Generate and download a report
- Verify PDF matches preview

### After Phase 6 (GCP):

- Access deployed URL
- Repeat frontend tests against production
- Verify PDF storage in GCS bucket
- Check Cloud Run logs for errors
