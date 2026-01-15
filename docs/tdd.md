# Technical Design Document — Lightweight Agency Reporting Platform

**Version:** 1.0
**Date:** 2026-01-14
**Related:** [PRD](./prd.md)

---

## 1. Overview

This document provides the technical specification for implementing the Lightweight Agency Reporting Platform. It is intended to guide AI-assisted code generation and human review.

**Target:** A monorepo containing a React frontend, Node.js/Fastify backend, and shared types, deployable to GCP Cloud Run.

---

## 2. Repository Structure

```
agency-reports/
├── packages/
│   ├── web/                    # React frontend (Vite)
│   │   ├── src/
│   │   │   ├── components/     # Reusable UI components
│   │   │   ├── pages/          # Route pages
│   │   │   ├── hooks/          # Custom React hooks
│   │   │   ├── lib/            # Utilities, API client
│   │   │   ├── styles/         # Global styles, Tailwind config
│   │   │   └── main.tsx
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   └── package.json
│   │
│   ├── api/                    # Fastify backend
│   │   ├── src/
│   │   │   ├── routes/         # API route handlers
│   │   │   ├── services/       # Business logic
│   │   │   ├── connectors/     # External API integrations
│   │   │   ├── jobs/           # Background job handlers
│   │   │   ├── db/             # Database queries, migrations
│   │   │   ├── lib/            # Utilities, helpers
│   │   │   ├── types/          # TypeScript types
│   │   │   └── server.ts
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── renderer/               # PDF rendering service (optional separate container)
│   │   ├── src/
│   │   │   ├── templates/      # HTML report templates
│   │   │   └── render.ts
│   │   └── package.json
│   │
│   └── shared/                 # Shared types and utilities
│       ├── src/
│       │   ├── types.ts        # Shared TypeScript interfaces
│       │   └── constants.ts
│       └── package.json
│
├── infra/                      # Infrastructure as code (optional)
│   └── terraform/              # GCP resource definitions
│
├── package.json                # Workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── README.md
```

---

## 3. Database Schema

**Database:** Cloud SQL PostgreSQL 15

### 3.1 Tables

```sql
-- Users table (agency admins)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'admin',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Clients table
CREATE TABLE clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    primary_domain VARCHAR(255),
    timezone VARCHAR(100) DEFAULT 'UTC',
    contact_emails TEXT[] DEFAULT '{}',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Data sources (OAuth connections)
CREATE TABLE data_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- 'google_ads', 'google_analytics', 'rank_tracker'
    external_account_id VARCHAR(255), -- e.g., GA4 property ID, Ads customer ID
    external_account_name VARCHAR(255),
    credentials_encrypted TEXT, -- Encrypted OAuth tokens (refresh token)
    connected_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    status VARCHAR(50) DEFAULT 'active', -- 'active', 'expired', 'disconnected'
    config JSONB DEFAULT '{}', -- Additional config (selected views, campaigns, etc.)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(client_id, type, external_account_id)
);

-- Report configurations per client
CREATE TABLE report_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    enabled BOOLEAN DEFAULT true,
    schedule_day INTEGER DEFAULT 5, -- Day of month (1-28)
    schedule_time TIME DEFAULT '09:00:00',
    recipient_emails TEXT[] DEFAULT '{}',
    template_config JSONB DEFAULT '{}', -- Custom field mappings
    last_generated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(client_id)
);

-- Tracked keywords for rank tracking
CREATE TABLE tracked_keywords (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    keyword VARCHAR(500) NOT NULL,
    engine VARCHAR(50) DEFAULT 'google', -- 'google', 'bing'
    target_url VARCHAR(500),
    location VARCHAR(255), -- Geographic location for rank check
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(client_id, keyword, engine)
);

-- Monthly snapshots
CREATE TABLE snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    snapshot_date DATE NOT NULL, -- First day of the month
    template_version VARCHAR(50) DEFAULT '1.0',
    storage_path VARCHAR(500) NOT NULL, -- GCS path to JSON snapshot
    pdf_storage_path VARCHAR(500), -- GCS path to rendered PDF
    metrics_summary JSONB DEFAULT '{}', -- Quick-access metrics
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ, -- For retention policy (24 months)
    UNIQUE(client_id, snapshot_date)
);

-- Job records
CREATE TABLE jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    snapshot_id UUID REFERENCES snapshots(id) ON DELETE SET NULL,
    type VARCHAR(50) NOT NULL, -- 'snapshot', 'render', 'email', 'full_report'
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'running', 'completed', 'failed'
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}', -- Additional job context
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_clients_created_by ON clients(created_by);
CREATE INDEX idx_data_sources_client_id ON data_sources(client_id);
CREATE INDEX idx_data_sources_type ON data_sources(type);
CREATE INDEX idx_snapshots_client_id ON snapshots(client_id);
CREATE INDEX idx_snapshots_date ON snapshots(snapshot_date);
CREATE INDEX idx_jobs_client_id ON jobs(client_id);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_created_at ON jobs(created_at);
CREATE INDEX idx_tracked_keywords_client_id ON tracked_keywords(client_id);
```

### 3.2 Migrations

Use a migration tool like `node-pg-migrate` or `kysely` migrations. Each schema change should be a versioned migration file.

---

## 4. API Specification

**Base URL:** `https://api.example.com/v1` (Cloud Run service URL)

### 4.1 Authentication

All endpoints except `/auth/*` require a valid JWT in the `Authorization: Bearer <token>` header.

#### POST /auth/login

```typescript
// Request
{
  email: string;
  password: string;
}

// Response 200
{
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
  }
}

// Response 401
{
  error: "Invalid credentials";
}
```

#### POST /auth/register (initial setup only)

```typescript
// Request
{
  email: string;
  password: string;
  name: string;
}

// Response 201
{
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
  }
}
```

### 4.2 Clients

#### GET /clients

```typescript
// Response 200
{
  clients: Array<{
    id: string;
    name: string;
    primaryDomain: string | null;
    timezone: string;
    contactEmails: string[];
    dataSources: Array<{ type: string; status: string }>;
    lastReportDate: string | null;
    createdAt: string;
  }>;
}
```

#### POST /clients

```typescript
// Request
{
  name: string;
  primaryDomain?: string;
  timezone?: string;
  contactEmails?: string[];
}

// Response 201
{ client: Client }
```

#### GET /clients/:id

```typescript
// Response 200
{
  client: Client;
  dataSources: DataSource[];
  reportConfig: ReportConfig | null;
  trackedKeywords: TrackedKeyword[];
  recentSnapshots: Snapshot[];
}
```

#### PUT /clients/:id

```typescript
// Request (partial update)
{ name?: string; primaryDomain?: string; timezone?: string; contactEmails?: string[]; }

// Response 200
{ client: Client }
```

#### DELETE /clients/:id

```typescript
// Response 204 (no content)
```

### 4.3 Data Sources (OAuth)

#### GET /clients/:clientId/data-sources

```typescript
// Response 200
{ dataSources: DataSource[] }
```

#### GET /oauth/google/url

```typescript
// Query: ?clientId=xxx&type=google_ads|google_analytics

// Response 200
{
  url: string;
} // OAuth consent URL
```

#### GET /oauth/google/callback

```typescript
// Query: ?code=xxx&state=xxx (state contains clientId and type)

// Response 302 -> Redirect to frontend with success/error
```

#### DELETE /clients/:clientId/data-sources/:id

```typescript
// Response 204 (no content)
```

### 4.4 Report Configuration

#### GET /clients/:clientId/report-config

```typescript
// Response 200
{
  reportConfig: ReportConfig | null;
}
```

#### PUT /clients/:clientId/report-config

```typescript
// Request
{
  enabled?: boolean;
  scheduleDay?: number; // 1-28
  scheduleTime?: string; // HH:mm
  recipientEmails?: string[];
  templateConfig?: {
    primaryCampaignId?: string;
    primaryGoalEvent?: string;
    includedSections?: string[];
  };
}

// Response 200
{ reportConfig: ReportConfig }
```

### 4.5 Tracked Keywords

#### GET /clients/:clientId/keywords

```typescript
// Response 200
{ keywords: TrackedKeyword[] }
```

#### POST /clients/:clientId/keywords

```typescript
// Request
{ keyword: string; engine?: string; targetUrl?: string; location?: string; }

// Response 201
{ keyword: TrackedKeyword }
```

#### POST /clients/:clientId/keywords/bulk

```typescript
// Request
{ keywords: Array<{ keyword: string; engine?: string; targetUrl?: string; }> }

// Response 201
{ keywords: TrackedKeyword[]; created: number; }
```

#### DELETE /clients/:clientId/keywords/:id

```typescript
// Response 204
```

### 4.6 Snapshots & Reports

#### GET /clients/:clientId/snapshots

```typescript
// Query: ?limit=12&offset=0

// Response 200
{
  snapshots: Array<{
    id: string;
    snapshotDate: string;
    pdfUrl: string | null; // Signed URL
    createdAt: string;
    metricsSummary: object;
  }>;
  total: number;
}
```

#### GET /snapshots/:id

```typescript
// Response 200
{
  snapshot: Snapshot;
  data: object; // Full snapshot data from GCS
}
```

#### POST /clients/:clientId/snapshots

```typescript
// Request (generate on-demand snapshot)
{
  month: string; // YYYY-MM format
  regenerate?: boolean; // Overwrite existing
}

// Response 202
{ job: Job }
```

#### GET /clients/:clientId/preview

```typescript
// Query: ?month=2026-01

// Response 200
// Content-Type: text/html
// Returns the rendered HTML report for preview
```

#### GET /snapshots/:id/pdf

```typescript
// Response 302 -> Signed GCS URL for PDF download
```

### 4.7 Jobs

#### GET /jobs

```typescript
// Query: ?clientId=xxx&status=xxx&limit=50&offset=0

// Response 200
{
  jobs: Job[];
  total: number;
}
```

#### GET /jobs/:id

```typescript
// Response 200
{
  job: Job;
}
```

#### POST /jobs/:id/retry

```typescript
// Response 202
{
  job: Job;
}
```

### 4.8 Background Job Endpoints (Cloud Tasks)

These endpoints are called by Cloud Tasks and require OIDC authentication.

#### POST /internal/jobs/snapshot

```typescript
// Request (from Cloud Tasks)
{
  clientId: string;
  month: string;
  jobId: string;
}

// Response 200
{
  success: true;
}
```

#### POST /internal/jobs/render

```typescript
// Request
{
  snapshotId: string;
  jobId: string;
}

// Response 200
{
  pdfPath: string;
}
```

#### POST /internal/jobs/email

```typescript
// Request
{ snapshotId: string; jobId: string; }

// Response 200
{ sent: true; recipients: string[] }
```

---

## 5. Component Specifications

### 5.1 Frontend Components

```
pages/
├── LoginPage.tsx           # Auth form
├── DashboardPage.tsx       # Overview with client list, recent jobs
├── ClientsPage.tsx         # Client list with status indicators
├── ClientDetailPage.tsx    # Single client: data sources, config, keywords, history
├── ReportPreviewPage.tsx   # Full-page report preview (iframe or embedded)
├── JobsPage.tsx            # Job history with filters, retry actions
└── SettingsPage.tsx        # User settings, API keys display

components/
├── layout/
│   ├── AppShell.tsx        # Main layout with sidebar nav
│   ├── Sidebar.tsx
│   └── Header.tsx
├── clients/
│   ├── ClientCard.tsx      # Client summary card
│   ├── ClientForm.tsx      # Create/edit client modal
│   ├── DataSourceList.tsx  # Connected sources with status
│   └── KeywordManager.tsx  # Add/remove tracked keywords
├── reports/
│   ├── ReportPreview.tsx   # Embedded report preview
│   ├── SnapshotList.tsx    # Historical snapshots
│   └── GenerateButton.tsx  # Trigger on-demand generation
├── jobs/
│   ├── JobTable.tsx        # Job list with status
│   └── JobStatusBadge.tsx  # Status indicator
└── ui/
    ├── Button.tsx
    ├── Input.tsx
    ├── Modal.tsx
    ├── Table.tsx
    ├── Card.tsx
    └── Toast.tsx
```

### 5.2 Backend Services

```typescript
// services/auth.service.ts
interface AuthService {
  login(
    email: string,
    password: string
  ): Promise<{ token: string; user: User }>;
  register(
    email: string,
    password: string,
    name: string
  ): Promise<{ token: string; user: User }>;
  verifyToken(token: string): Promise<User>;
  hashPassword(password: string): Promise<string>;
  comparePassword(password: string, hash: string): Promise<boolean>;
}

// services/client.service.ts
interface ClientService {
  list(userId: string): Promise<Client[]>;
  get(id: string): Promise<ClientWithDetails>;
  create(data: CreateClientInput, userId: string): Promise<Client>;
  update(id: string, data: UpdateClientInput): Promise<Client>;
  delete(id: string): Promise<void>;
}

// services/snapshot.service.ts
interface SnapshotService {
  generate(clientId: string, month: Date): Promise<Snapshot>;
  get(id: string): Promise<SnapshotWithData>;
  list(
    clientId: string,
    options: PaginationOptions
  ): Promise<PaginatedResult<Snapshot>>;
  getPreviewHtml(clientId: string, month: Date): Promise<string>;
  cleanupExpired(): Promise<number>; // Retention policy
}

// services/render.service.ts
interface RenderService {
  renderPdf(snapshotId: string): Promise<string>; // Returns GCS path
  renderHtml(snapshotData: SnapshotData): string;
}

// services/email.service.ts
interface EmailService {
  sendReport(
    recipients: string[],
    subject: string,
    htmlBody: string,
    pdfAttachment: Buffer
  ): Promise<void>;
}

// services/scheduler.service.ts
interface SchedulerService {
  scheduleMonthlyReports(): Promise<void>; // Called by Cloud Scheduler
  enqueueJob(clientId: string, month: Date): Promise<Job>;
}
```

### 5.3 Connectors

```typescript
// connectors/google-ads.connector.ts
interface GoogleAdsConnector {
  getAuthUrl(clientId: string): string;
  handleCallback(code: string, clientId: string): Promise<DataSource>;
  fetchMetrics(
    credentials: OAuthCredentials,
    accountId: string,
    dateRange: DateRange
  ): Promise<GoogleAdsMetrics>;
  refreshToken(refreshToken: string): Promise<OAuthCredentials>;
}

interface GoogleAdsMetrics {
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  conversions: number;
  conversionRate: number;
  spend: number;
  campaigns: Array<{
    id: string;
    name: string;
    impressions: number;
    clicks: number;
    conversions: number;
    spend: number;
  }>;
}

// connectors/google-analytics.connector.ts
interface GoogleAnalyticsConnector {
  getAuthUrl(clientId: string): string;
  handleCallback(code: string, clientId: string): Promise<DataSource>;
  fetchMetrics(
    credentials: OAuthCredentials,
    propertyId: string,
    dateRange: DateRange
  ): Promise<GA4Metrics>;
  refreshToken(refreshToken: string): Promise<OAuthCredentials>;
  listProperties(credentials: OAuthCredentials): Promise<GA4Property[]>;
}

interface GA4Metrics {
  sessions: number;
  users: number;
  newUsers: number;
  pageviews: number;
  avgSessionDuration: number;
  bounceRate: number;
  channels: Array<{
    name: string;
    sessions: number;
    users: number;
    percentage: number;
  }>;
  keyEvents: Array<{
    name: string;
    count: number;
  }>;
}

// connectors/rank-tracker.connector.ts
interface RankTrackerConnector {
  fetchRankings(
    apiKey: string,
    keywords: TrackedKeyword[]
  ): Promise<RankingResult[]>;
}

interface RankingResult {
  keyword: string;
  engine: string;
  currentRank: number | null;
  previousRank: number | null;
  change: number | null;
  url: string | null;
  searchVolume?: number;
}
```

---

## 6. Data Flow

### 6.1 Monthly Report Generation Flow

```
┌─────────────────┐
│ Cloud Scheduler │  (1st of month, 2am UTC)
│   (cron job)    │
└────────┬────────┘
         │ HTTP POST /internal/scheduler/trigger
         ▼
┌─────────────────┐
│   Backend API   │  Query all enabled report_configs
└────────┬────────┘
         │ For each client: create Cloud Task
         ▼
┌─────────────────┐
│  Cloud Tasks    │  Queue: report-generation
│                 │  Task per client
└────────┬────────┘
         │ HTTP POST /internal/jobs/full-report
         ▼
┌─────────────────┐
│  Job Handler    │
│                 │
│  1. Create job  │
│  2. Fetch data: │
│     - Google Ads│
│     - GA4       │
│     - Rankings  │
│  3. Build snap- │
│     shot JSON   │
│  4. Store→GCS   │
│  5. Render PDF  │
│  6. Store→GCS   │
│  7. Send email  │
│  8. Update job  │
└─────────────────┘
```

### 6.2 OAuth Connection Flow

```
┌──────────┐      ┌─────────────┐      ┌──────────────┐
│ Frontend │ ──── │ Backend API │ ──── │ Google OAuth │
└──────────┘      └─────────────┘      └──────────────┘
     │                   │                     │
     │ 1. Click "Connect Google Ads"           │
     │──────────────────>│                     │
     │                   │                     │
     │ 2. GET /oauth/google/url?type=google_ads│
     │<──────────────────│                     │
     │   { url: "https://accounts.google.com/..." }
     │                   │                     │
     │ 3. Redirect to Google                   │
     │─────────────────────────────────────────>
     │                   │                     │
     │ 4. User grants consent                  │
     │<─────────────────────────────────────────
     │   Redirect to /oauth/google/callback    │
     │                   │                     │
     │                   │ 5. Exchange code    │
     │                   │────────────────────>│
     │                   │<────────────────────│
     │                   │   { access_token, refresh_token }
     │                   │                     │
     │                   │ 6. Encrypt & store  │
     │                   │    refresh_token    │
     │                   │                     │
     │ 7. Redirect to frontend /clients/:id    │
     │<──────────────────│                     │
```

---

## 7. Report Template

### 7.1 HTML Template Structure

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <style>
      /* Print-optimized styles */
      @page {
        size: A4;
        margin: 20mm;
      }
      @media print {
        .page-break {
          page-break-before: always;
        }
      }
      /* Base styles - clean, professional */
      body {
        font-family: "Inter", sans-serif;
        color: #1a1a1a;
      }
      /* ... full styles ... */
    </style>
  </head>
  <body>
    <!-- Header -->
    <header class="report-header">
      <h1>Monthly Performance Report</h1>
      <div class="meta">
        <span class="client-name">{{clientName}}</span>
        <span class="report-period">{{monthYear}}</span>
      </div>
    </header>

    <!-- Executive Summary -->
    <section class="summary">
      <h2>Overview</h2>
      <div class="metrics-grid">
        <div class="metric-card">
          <span class="label">Sessions</span>
          <span class="value">{{sessions}}</span>
          <span class="change {{sessionsChangeClass}}"
            >{{sessionsChange}}%</span
          >
        </div>
        <!-- More metric cards -->
      </div>
    </section>

    <!-- Google Ads Performance -->
    <section class="google-ads">
      <h2>Advertising Performance</h2>
      <table class="data-table">
        <thead>
          <tr>
            <th>Campaign</th>
            <th>Impressions</th>
            <th>Clicks</th>
            <th>CTR</th>
            <th>Conversions</th>
            <th>Spend</th>
          </tr>
        </thead>
        <tbody>
          {{#each campaigns}}
          <tr>
            <td>{{name}}</td>
            <td>{{impressions}}</td>
            <td>{{clicks}}</td>
            <td>{{ctr}}%</td>
            <td>{{conversions}}</td>
            <td>{{currency spend}}</td>
          </tr>
          {{/each}}
        </tbody>
      </table>
    </section>

    <div class="page-break"></div>

    <!-- Traffic Sources -->
    <section class="traffic">
      <h2>Traffic Sources</h2>
      <div class="chart-container">
        <!-- Server-rendered SVG pie chart -->
        {{trafficPieChart}}
      </div>
      <table class="data-table">
        <!-- Channel breakdown -->
      </table>
    </section>

    <!-- Keyword Rankings -->
    <section class="rankings">
      <h2>Keyword Rankings</h2>
      <table class="data-table">
        <thead>
          <tr>
            <th>Keyword</th>
            <th>Current Rank</th>
            <th>Change</th>
            <th>Search Volume</th>
          </tr>
        </thead>
        <tbody>
          {{#each rankings}}
          <tr>
            <td>{{keyword}}</td>
            <td>{{currentRank}}</td>
            <td class="{{changeClass}}">{{changeDisplay}}</td>
            <td>{{searchVolume}}</td>
          </tr>
          {{/each}}
        </tbody>
      </table>
    </section>

    <!-- Footer -->
    <footer>
      <p>Generated on {{generatedDate}} | {{agencyName}}</p>
    </footer>
  </body>
</html>
```

### 7.2 Template Rendering

Use Handlebars or similar for templating. Charts should be server-rendered as SVG (use a library like `d3` or `chartjs-node-canvas`).

---

### 7.3 Google Ads Report Section — Detailed Specification

This section defines the exact layout, charts, and metrics for the Google Ads portion of the monthly report.

#### 7.3.1 Section Purpose

Provide a **monthly performance overview** of a single Google Ads account (or filtered campaign set), combining:

- Time-series performance trends
- High-level KPIs with period-over-period deltas
- Campaign-level tabular detail

**Primary comparison period:** Previous month (same duration).

---

#### 7.3.2 Layout Structure

The Google Ads section is composed of **three vertical rows**:

```
┌─────────────────────────────────────────────────────────────────┐
│                        GOOGLE ADS                                │
├────────────────────────────┬────────────────────────────────────┤
│  Impressions Over Time     │  Clicks Over Time                  │
│  [Line Chart]     446 ▲100%│  [Line Chart]          58 ▲100%    │
│                            │                                     │
├──────────┬──────────┬──────┼──────────────────────────────────────
│Impressions│ Clicks  │ CTR  │           Cost                      │
│   446    │   58    │ 13%  │       R21,272.56          ▲100%     │
│  ▲100%   │  ▲100%  │▲100% │       [Line Chart]                  │
├──────────┼─────────┼──────┤                                      │
│ Avg CPC  │Conversions│Conv │                                      │
│ R366.77  │   17    │Rate  │                                      │
│  ▲100%   │  ▲100%  │29.31%│                                      │
├──────────┴─────────┴──────┴──────────────────────────────────────┤
│  Campaign Performance Table                                      │
│  ┌──────────────┬────────┬───────┬────────┬─────────┬──────────┐│
│  │ Campaign     │Impress.│Clicks │Avg CPC │  Cost   │Conversions││
│  ├──────────────┼────────┼───────┼────────┼─────────┼──────────┤│
│  │ Google-Ads-  │  446   │  58   │R366.77 │R21,272  │   17     ││
│  │ Search       │        │       │        │         │          ││
│  └──────────────┴────────┴───────┴────────┴─────────┴──────────┘│
└─────────────────────────────────────────────────────────────────┘
```

---

#### 7.3.3 Row 1 — Performance Over Time (Line Charts)

**Impressions Over Time**

| Property       | Value                                                  |
| -------------- | ------------------------------------------------------ |
| Chart type     | Line chart (single series)                             |
| Metric         | `impressions`                                          |
| X-axis         | Date (daily granularity)                               |
| Y-axis         | Number of impressions                                  |
| Data range     | Current reporting month                                |
| Header display | Aggregate total + percentage change vs previous period |
| Visual notes   | Zero-value days rendered explicitly; no stacking       |

**Clicks Over Time**

| Property       | Value                                            |
| -------------- | ------------------------------------------------ |
| Chart type     | Line chart (single series)                       |
| Metric         | `clicks`                                         |
| X-axis         | Date (daily)                                     |
| Y-axis         | Number of clicks                                 |
| Header display | Aggregate total + percentage change              |
| Styling        | Matches Impressions chart for visual consistency |

---

#### 7.3.4 Row 2 — KPI Summary Metrics (6 Tiles)

Each metric tile displays:

- Metric label
- Aggregate value for selected period
- Percentage change vs previous period
- Directional indicator (▲ green for positive, ▼ red for negative)

| Tile            | Metric                 | Formula                      | Format                           |
| --------------- | ---------------------- | ---------------------------- | -------------------------------- |
| Impressions     | `impressions`          | Sum                          | Integer with thousands separator |
| Clicks          | `clicks`               | Sum                          | Integer with thousands separator |
| CTR             | Click-through rate     | `clicks / impressions * 100` | Percentage (e.g., "13%")         |
| Avg CPC         | Average cost per click | `cost / clicks`              | Currency (e.g., "R366.77")       |
| Conversions     | `conversions`          | Sum                          | Integer                          |
| Conversion Rate |                        | `conversions / clicks * 100` | Percentage (e.g., "29.31%")      |

**Cost Over Time (Line Chart)**

| Property          | Value                                           |
| ----------------- | ----------------------------------------------- |
| Chart type        | Line chart                                      |
| Metric            | `cost`                                          |
| X-axis            | Date (daily)                                    |
| Y-axis            | Cost (currency)                                 |
| Prominent display | Large aggregate cost value above chart          |
| Header            | Percentage change vs previous period            |
| Purpose           | Correlate spend spikes with performance metrics |

---

#### 7.3.5 Row 3 — Campaign Performance Table

**Table Configuration**

| Property    | Value                                         |
| ----------- | --------------------------------------------- |
| Granularity | Campaign-level                                |
| Pagination  | Enabled (show "Showing X of Y Rows")          |
| Search      | Text filter input                             |
| Sorting     | Clickable column headers (at minimum: Clicks) |

**Table Columns**

| Column            | Metric/Formula               | Format             |
| ----------------- | ---------------------------- | ------------------ |
| Campaign          | Campaign name                | Text               |
| Impressions       | `impressions`                | Integer            |
| Clicks            | `clicks`                     | Integer            |
| Avg CPC           | `cost / clicks`              | Currency           |
| Cost              | `cost`                       | Currency           |
| Conversions       | `conversions`                | Integer or decimal |
| Conversion Rate   | `conversions / clicks * 100` | Percentage         |
| Cost / Conversion | `cost / conversions`         | Currency           |

**Null-safe handling:**

- Division by zero → display "—" or "N/A"
- Missing data → display placeholder, not error

---

#### 7.3.6 TypeScript Data Structures

```typescript
// Daily time-series data point
interface GoogleAdsDailyMetric {
  date: string; // YYYY-MM-DD
  impressions: number;
  clicks: number;
  cost: number; // In minor units or decimal
  conversions: number;
}

// Aggregated KPIs with period comparison
interface GoogleAdsKPIs {
  impressions: number;
  impressionsChange: number; // Percentage
  clicks: number;
  clicksChange: number;
  ctr: number;
  ctrChange: number;
  avgCpc: number;
  avgCpcChange: number;
  conversions: number;
  conversionsChange: number;
  conversionRate: number;
  conversionRateChange: number;
  cost: number;
  costChange: number;
}

// Campaign row
interface GoogleAdsCampaign {
  id: string;
  name: string;
  impressions: number;
  clicks: number;
  avgCpc: number;
  cost: number;
  conversions: number;
  conversionRate: number;
  costPerConversion: number | null;
}

// Complete Google Ads section data
interface GoogleAdsReportData {
  dailyMetrics: GoogleAdsDailyMetric[];
  kpis: GoogleAdsKPIs;
  campaigns: GoogleAdsCampaign[];
  currency: string; // e.g., "ZAR", "USD"
  periodStart: string;
  periodEnd: string;
  previousPeriodStart: string;
  previousPeriodEnd: string;
}
```

---

#### 7.3.7 API Response Shape

```typescript
// GET /clients/:clientId/report-data/google-ads?month=2026-01
interface GoogleAdsReportResponse {
  data: GoogleAdsReportData;
  generatedAt: string;
}
```

---

#### 7.3.8 Chart Rendering Notes

**For PDF (server-side):**

- Use `chartjs-node-canvas` or `d3` to render SVG/PNG
- Embed charts as inline SVG or base64 images in HTML
- Line color: `#F59E0B` (amber/orange as shown)
- Grid lines: subtle gray (`#E5E7EB`)
- Font: Match report body font

**For browser preview:**

- Use `recharts` or `chart.js` React components
- Same color scheme for consistency
- Responsive sizing within card containers

**SVG Chart Template (simplified):**

```html
<svg viewBox="0 0 400 150" class="line-chart">
  <defs>
    <linearGradient id="lineGradient" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#F59E0B;stop-opacity:0.3" />
      <stop offset="100%" style="stop-color:#F59E0B;stop-opacity:0" />
    </linearGradient>
  </defs>
  <!-- Area fill -->
  <path d="M0,150 {{areaPath}} L400,150 Z" fill="url(#lineGradient)" />
  <!-- Line -->
  <path d="{{linePath}}" fill="none" stroke="#F59E0B" stroke-width="2" />
  <!-- X-axis labels -->
  {{#each xLabels}}
  <text x="{{x}}" y="145" class="axis-label">{{label}}</text>
  {{/each}}
</svg>
```

---

#### 7.3.9 Period Comparison Logic

```typescript
/**
 * Calculate comparison metrics between two periods
 */
function calculatePeriodComparison(
  current: number,
  previous: number
): { value: number; change: number; changeClass: string } {
  const change =
    previous === 0
      ? current > 0
        ? 100
        : 0
      : ((current - previous) / previous) * 100;

  return {
    value: current,
    change: Math.round(change * 100) / 100, // 2 decimal places
    changeClass: change >= 0 ? "positive" : "negative",
  };
}

/**
 * Get previous period date range (same duration)
 */
function getPreviousPeriod(start: Date, end: Date): { start: Date; end: Date } {
  const duration = end.getTime() - start.getTime();
  return {
    start: new Date(start.getTime() - duration - 86400000), // -1 day buffer
    end: new Date(start.getTime() - 86400000),
  };
}
```

---

#### 7.3.10 CSS Classes for Metrics

```css
/* KPI Tile */
.kpi-tile {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px;
}

.kpi-tile .label {
  font-size: 12px;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.kpi-tile .value {
  font-size: 28px;
  font-weight: 600;
  color: #111827;
}

.kpi-tile .change {
  font-size: 12px;
  font-weight: 500;
}

.kpi-tile .change.positive {
  color: #10b981; /* Green */
}

.kpi-tile .change.negative {
  color: #ef4444; /* Red */
}

/* Percentage indicator arrow */
.change.positive::before {
  content: "▲ ";
}

.change.negative::before {
  content: "▼ ";
}
```

---

## 8. Security Implementation

### 8.1 Authentication

```typescript
// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET; // From Secret Manager
const JWT_EXPIRY = "7d";

// Password hashing
const BCRYPT_ROUNDS = 12;

// Token structure
interface JWTPayload {
  userId: string;
  email: string;
  iat: number;
  exp: number;
}
```

### 8.2 OAuth Token Encryption

```typescript
// Use GCP KMS for encryption
import { KeyManagementServiceClient } from "@google-cloud/kms";

const kmsClient = new KeyManagementServiceClient();
const keyName = `projects/${PROJECT_ID}/locations/global/keyRings/oauth-tokens/cryptoKeys/token-key`;

async function encryptToken(plaintext: string): Promise<string> {
  const [result] = await kmsClient.encrypt({
    name: keyName,
    plaintext: Buffer.from(plaintext),
  });
  return Buffer.from(result.ciphertext).toString("base64");
}

async function decryptToken(ciphertext: string): Promise<string> {
  const [result] = await kmsClient.decrypt({
    name: keyName,
    ciphertext: Buffer.from(ciphertext, "base64"),
  });
  return Buffer.from(result.plaintext).toString("utf8");
}
```

### 8.3 Cloud Tasks Authentication

Internal endpoints (`/internal/*`) should verify the OIDC token from Cloud Tasks:

```typescript
import { OAuth2Client } from "google-auth-library";

const client = new OAuth2Client();

async function verifyCloudTasksRequest(req: FastifyRequest): Promise<boolean> {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return false;

  const ticket = await client.verifyIdToken({
    idToken: token,
    audience: process.env.CLOUD_RUN_URL,
  });

  const payload = ticket.getPayload();
  return (
    payload?.email ===
    `${SERVICE_ACCOUNT}@${PROJECT_ID}.iam.gserviceaccount.com`
  );
}
```

---

## 9. GCP Deployment Configuration

### 9.1 Cloud Run Service

```yaml
# service.yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: agency-reports-api
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/minScale: "1"
        autoscaling.knative.dev/maxScale: "10"
        run.googleapis.com/cpu-throttling: "false" # For Puppeteer
    spec:
      containerConcurrency: 80
      timeoutSeconds: 300
      containers:
        - image: gcr.io/PROJECT_ID/agency-reports-api
          resources:
            limits:
              memory: 2Gi
              cpu: "2"
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: database-url
                  key: latest
            - name: JWT_SECRET
              valueFrom:
                secretKeyRef:
                  name: jwt-secret
                  key: latest
```

### 9.2 Cloud SQL

- **Instance:** `agency-reports-db`
- **Tier:** `db-f1-micro` (MVP) → `db-g1-small` (production)
- **Region:** Same as Cloud Run
- **Connection:** Private IP via VPC connector, or Cloud SQL Auth Proxy

### 9.3 Cloud Storage Buckets

```
gs://agency-reports-snapshots/
  └── {client_id}/
      └── {YYYY-MM}/
          ├── snapshot.json
          └── report.pdf

gs://agency-reports-static/  (optional, for frontend hosting)
  └── index.html
  └── assets/
```

### 9.4 Cloud Tasks Queue

```bash
gcloud tasks queues create report-generation \
  --location=us-central1 \
  --max-concurrent-dispatches=5 \
  --max-attempts=3 \
  --min-backoff=60s \
  --max-backoff=3600s
```

### 9.5 Cloud Scheduler

```bash
gcloud scheduler jobs create http monthly-report-trigger \
  --location=us-central1 \
  --schedule="0 2 1 * *" \
  --uri="https://agency-reports-api-xxx.run.app/internal/scheduler/trigger" \
  --http-method=POST \
  --oidc-service-account-email=scheduler@PROJECT_ID.iam.gserviceaccount.com
```

---

## 10. Environment Variables

```bash
# Application
NODE_ENV=production
PORT=8080

# Database
DATABASE_URL=postgresql://user:pass@/agency_reports?host=/cloudsql/PROJECT:REGION:INSTANCE

# GCP
GCP_PROJECT_ID=your-project-id
GCS_BUCKET_SNAPSHOTS=agency-reports-snapshots

# Auth
JWT_SECRET=<from-secret-manager>

# Google OAuth
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<from-secret-manager>
GOOGLE_REDIRECT_URI=https://api.example.com/v1/oauth/google/callback

# Rank Tracker
RANK_TRACKER_API_KEY=<from-secret-manager>

# SendGrid
SENDGRID_API_KEY=<from-secret-manager>
SENDGRID_FROM_EMAIL=reports@agency.com

# Monitoring
SENTRY_DSN=https://xxx@sentry.io/xxx
```

---

## 11. Error Handling & Retry Logic

### 11.1 Job Retry Policy

```typescript
const RETRY_CONFIG = {
  maxAttempts: 3,
  backoffMultiplier: 2,
  initialDelayMs: 60_000, // 1 minute
  maxDelayMs: 3600_000, // 1 hour
};

async function executeWithRetry<T>(
  jobId: string,
  fn: () => Promise<T>
): Promise<T> {
  const job = await db.jobs.findById(jobId);

  try {
    const result = await fn();
    await db.jobs.update(jobId, {
      status: "completed",
      finishedAt: new Date(),
    });
    return result;
  } catch (error) {
    const newRetryCount = job.retryCount + 1;

    if (newRetryCount >= RETRY_CONFIG.maxAttempts) {
      await db.jobs.update(jobId, {
        status: "failed",
        errorMessage: error.message,
        finishedAt: new Date(),
      });
      await notifyAdminOfFailure(job, error);
      throw error;
    }

    // Schedule retry via Cloud Tasks
    const delay = Math.min(
      RETRY_CONFIG.initialDelayMs *
        Math.pow(RETRY_CONFIG.backoffMultiplier, newRetryCount),
      RETRY_CONFIG.maxDelayMs
    );

    await db.jobs.update(jobId, {
      status: "pending",
      retryCount: newRetryCount,
      errorMessage: error.message,
    });

    await scheduleRetry(job, delay);
    throw error;
  }
}
```

### 11.2 API Error Responses

```typescript
// Consistent error response format
interface APIError {
  error: string;
  message: string;
  details?: Record<string, unknown>;
}

// HTTP status codes
// 400 - Bad Request (validation errors)
// 401 - Unauthorized (missing/invalid token)
// 403 - Forbidden (insufficient permissions)
// 404 - Not Found
// 409 - Conflict (duplicate resource)
// 429 - Too Many Requests
// 500 - Internal Server Error
```

---

## 12. Testing Strategy

### 12.1 Unit Tests

- Services: Mock database and external APIs
- Connectors: Mock HTTP responses
- Utilities: Pure function tests

### 12.2 Integration Tests

- API endpoints: Test with real database (test container)
- OAuth flows: Mock Google responses

### 12.3 E2E Tests

- Full report generation flow (with mocked external APIs)
- PDF rendering verification

---

## 13. Implementation Order

Recommended build sequence for AI-assisted development:

1. **Foundation**

   - Project scaffolding (monorepo, TypeScript config)
   - Database schema and migrations
   - Basic Fastify server with health check

2. **Authentication**

   - User registration/login
   - JWT middleware
   - Protected route setup

3. **Client Management**

   - CRUD endpoints for clients
   - Basic frontend: login, client list, client detail pages

4. **Google OAuth & Connectors**

   - OAuth flow implementation
   - Google Ads connector
   - GA4 connector
   - Data source management UI

5. **Snapshots & Storage**

   - GCS integration
   - Snapshot generation service
   - Snapshot listing/retrieval

6. **Report Rendering**

   - HTML template
   - Puppeteer PDF generation
   - Preview endpoint
   - Preview UI component

7. **Scheduling & Delivery**

   - Cloud Tasks integration
   - Cloud Scheduler setup
   - SendGrid email delivery
   - Job monitoring UI

8. **Rank Tracking**

   - Rank Tracker API integration
   - Keyword management UI
   - Rankings in report template

9. **Polish**
   - Error handling refinement
   - Retry logic
   - Monitoring setup
   - Documentation

---

## Appendix A: Key Dependencies

```json
{
  "dependencies": {
    "fastify": "^5.x",
    "@fastify/cors": "^10.x",
    "@fastify/jwt": "^9.x",
    "pg": "^8.x",
    "kysely": "^0.27.x",
    "@google-cloud/storage": "^7.x",
    "@google-cloud/tasks": "^5.x",
    "@google-cloud/kms": "^4.x",
    "googleapis": "^140.x",
    "puppeteer": "^23.x",
    "handlebars": "^4.x",
    "@sendgrid/mail": "^8.x",
    "bcrypt": "^5.x",
    "zod": "^3.x"
  },
  "devDependencies": {
    "typescript": "^5.x",
    "vitest": "^2.x",
    "@types/node": "^22.x"
  }
}
```

---

_End of Technical Design Document_
