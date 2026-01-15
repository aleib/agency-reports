# Product Requirements Document — Lightweight Agency Reporting Platform

**Author:** Alex (adapted by ChatGPT)
**Date:** 2026-01-13

---

## 1. Executive summary

Build a lightweight, cost-effective reporting platform tailored for a digital agency that needs standardized monthly reports for clients. MVP focuses on three data sources: Google Ads, Google Analytics (GA4 + optional UA), and keyword rank tracking. The goal is to replace routine AgencyAnalytics usage for simple clients (20–50 monthly reports), keep data for 24 months, and automate monthly PDF reports and scheduled email delivery.

Primary objectives:

- Produce one standardized monthly report template that covers the metrics the agency actually uses.
- Minimize cost and operational overhead by storing monthly snapshots rather than continuously querying APIs.
- Enable simple onboarding for new clients via OAuth-based connections.
- Provide reliability, security, and two-year data retention.

Success metric (MVP): platform can generate and deliver 50 scheduled monthly PDF reports with <5% failure rate and monthly operating costs materially lower than current AgencyAnalytics per-client fees.

---

## 2. Scope

### In scope (MVP)

- Connectors: Google Ads, Google Analytics (GA4), and Rank Tracker API.
- Single standardized report template (configurable per client for a small set of fields: primary campaign, primary goal/event, ranking keywords list).
- Monthly scheduled snapshot job and on-demand snapshot generation.
- PDF generation of report (export-ready) and scheduled email distribution (with PDF attached).
- Storage of monthly snapshots per client for 24 months.
- Admin UI to manage accounts, view job history, retry failed snapshots, and basic logs.

### Out of scope (phase 1)

- Full multi-template report builder (drag/drop dashboards).
- Live interactive dashboards for clients.
- Wide integrations beyond the three core connectors.
- Large-scale enterprise multi-account billing and advanced white-labeling.

---

## 3. Personas & stakeholders

- **Agency Owner / Report Sender (primary persona):** creates templates, connects accounts, schedules reports, and sends PDFs to clients. Needs the system to be reliable and low-touch.
- **Client Recipient:** receives monthly PDF reports by email. Minimal/no interaction is required.
- **Developer / Operator:** builds, deploys, and maintains the platform.

Stakeholders: Agency owner (product owner), CFO (cost), DevOps/Engineer (implementation).

---

## 4. User stories

**US-1 (Onboard client):** As an agency user, I want to connect a client’s Google accounts (Ads & Analytics) via OAuth so that the platform can fetch data for that client.

**US-2 (Template setup):** As an agency user, I want to select the standard report template and map the client’s primary metrics (campaign(s), goal events) so the report shows relevant KPIs.

**US-3 (Schedule report):** As an agency user, I want to schedule monthly generation and emailing of the PDF report so clients receive a consistent monthly summary.

**US-4 (View history & retry):** As an agency user, I want a log of each report generation with the ability to re-run failed jobs.

**US-5 (On-demand report):** As an agency user, I want to generate a one-off report for an arbitrary date range.

**US-6 (Retention):** As an agency user, I want data retained for 24 months so I can make period-over-period comparisons.

---

## 5. Functional requirements

### 5.1 Data connectors

- **Google OAuth flow** per agency account. Support storing refresh tokens securely to fetch client-managed properties/accounts that the agency user has access to.
- **Google Ads connector**: fetch impressions, clicks, CTR, CPC, conversions, conversion rate, spend, and campaign-level splits.
- **Google Analytics connector** (GA4 Data API): fetch sessions, users, channels (traffic source breakdown), pageviews, and configured conversion events (key events). Allow mapping to the set of key events selected per client.
- **Rank Tracker connector**: integrate with [Rank Tracker API](https://www.ranktracker.com/) to fetch current rank and change vs prior snapshot per keyword. Abstract the connector interface to allow future provider changes if needed.

### 5.2 Data snapshot & storage

- **Monthly snapshots:** store an immutable JSON snapshot of the raw data used to render a monthly report. Snapshots must include metadata (client_id, property ids, snapshot_date, template_version).
- **Retention policy:** automatic deletion after 24 months, with backups retained for 30 days before permanent deletion.
- **Storage model:** small metadata in a relational DB; snapshots in object storage (S3/GCS/Durable Object), and optional analytical storage (BigQuery/Managed DW) for aggregate queries.

### 5.3 Report generation

- **Renderer:** a server-side renderer that produces a PDF from a templated HTML (Puppeteer/Playwright or headless Chromium). Template must be responsive and printable.
- **Template fields:** top-line metrics, period-over-period percent change, campaign table, traffic source pie chart (image), conversions table, ranking table (keyword, current rank, delta, volume optional).
- **Localization & currency:** support currency display and date formatting (initially one locale — agency timezone).

### 5.4 Scheduling & delivery

- **Scheduler:** recurring monthly jobs per client (cron or Cloud Tasks). Should produce a snapshot, render PDF, and email to configured recipients.
- **Email delivery:** support attachment (PDF) and inline link. Use transactional mail provider (SendGrid, SES, Mailgun).
- **Failure handling:** retry policy (exponential backoff up to 3 attempts) and notify admin on persistent failures.

### 5.5 Admin UI

- Client list and status (connected data sources, next run, last run status).
- Job logs with quick retry.
- Manual on-demand generation action.
- **Report preview:** render the HTML report template in-browser before PDF generation. Since the PDF is rendered from HTML via headless Chrome, the browser preview is pixel-accurate to the final PDF. Preview should indicate page boundaries and support toggling print-mode styles.

### 5.6 Security & compliance

- **Admin authentication:** email/password login with secure session tokens (JWT or server-side sessions). Support for future SSO integration.
- Encrypt OAuth tokens at rest (GCP KMS or Secret Manager). Use principle of least privilege for API scopes.
- TLS for all network traffic. Access logging and audit trail for admin actions.
- Multi-tenant isolation — each client's data only accessible by authenticated agency users.

---

## 6. Non-functional requirements

- **Scale:** Support 20–50 monthly reports in MVP with capability to scale to 200 clients.
- **Availability:** 99.9% uptime for scheduling and admin UI.
- **Performance:** Monthly snapshot job per client should complete within a minute (typical), PDF rendering under 10s per report.
- **Cost target:** operating costs (cloud + API usage) significantly lower than per-client AgencyAnalytics fees; aim for <$200/month infrastructure cost for 50 clients (depends on rank API choices).
- **Monitoring:** logs (structured), errors (Sentry), metrics (Prometheus/GCP Cloud Monitoring), and alerting on job failures.

---

## 7. Data model (high-level)

**Tables / Objects**

- `users` (id, email, name, password_hash, role, created_at) — agency admin users
- `clients` (id, name, primary_domain, timezone, contact_emails[], created_by)
- `data_sources` (id, client_id, type, credentials_encrypted, external_account_id, connected_at, status)
- `report_configs` (id, client_id, schedule_day, enabled, template_config JSON) — per-client report settings
- `tracked_keywords` (id, client_id, keyword, engine, target_url) — keywords to track per client
- `snapshots` (id, client_id, snapshot_date, template_version, storage_path, metrics_summary JSON)
- `jobs` (id, client_id, snapshot_id, type, status, started_at, finished_at, error_message, retry_count)

Snapshots store raw JSON in object storage (GCS); `metrics_summary` keeps the specific values required for quick display and period-over-period comparison. Keyword rankings are stored within the snapshot JSON, not as separate records.

---

## 8. Architecture (textual)

**Hosting:** GCP minimal-ops stack (Cloud Run + Cloud SQL + GCS).

1. **Frontend (React + Vite)** — admin UI for authentication, client onboarding, report preview, and job monitoring. Served as static assets from Cloud Run or GCS.
2. **Backend API (Node.js/TypeScript + Fastify)** — handles authentication, OAuth flows, CRUD operations, scheduling triggers, snapshot orchestration, and admin endpoints. Deployed as a Cloud Run service.
3. **Background jobs (Cloud Tasks)** — executes snapshot jobs and rendering tasks asynchronously. Triggers Cloud Run endpoints for job execution.
4. **Object storage (GCS)** — stores immutable JSON snapshots and generated PDFs.
5. **Relational DB (Cloud SQL Postgres)** — stores metadata, configuration, and job records.
6. **Email service (SendGrid)** — transactional email for report delivery.
7. **Monitoring (Cloud Logging + Cloud Monitoring + Sentry)** — structured logs, metrics, and error tracking.

**Flow:** Admin UI → Backend API → Cloud Tasks → Worker endpoint → Google APIs / Rank Tracker API → GCS + Cloud SQL → Renderer (Puppeteer in Cloud Run) → PDF → SendGrid.

---

## 9. Integrations & API considerations

- **Google APIs:** use OAuth 2.0 (user consent). For Google Ads, apply for developer token if needed — allow read access scope only. For GA4, use the Google Analytics Data API (GA4). Handle quota limits and exponential backoff for API errors.
- **Rank tracking API:** use [Rank Tracker](https://www.ranktracker.com/) for per-keyword rank and historical data. Keep rank checks to monthly per keyword for cost efficiency.
- **Email provider:** allow robust retry and deliverability.

---

## 10. Operational considerations & costs

- **Storage:** monthly snapshots for 50 clients with an average snapshot size of 100–500KB will cost negligible storage (<$1/month) on object storage. (Example estimate: 50 clients × 24 months × 200KB ≈ 0.23 GB total snapshot storage.)
- **Compute:** serverless/managed containers for workers and rendering. Puppeteer usage costs depend on runtime; consider pooling render instances or generating on-demand from a lightweight HTML template.
- **API costs:** Google APIs are mostly free within quota but may incur Cloud project billing (e.g., BigQuery). Rank tracking provider costs will likely be the largest external cost—budget $20–$200+/month depending on volume and provider.

_(There is a detailed cost estimate appendix in the document contents if you want exact per-provider numbers.)_

---

## 11. Timeline & resourcing (MVP)

_Assumption:_ AI-assisted development (Claude) with human review.

- **Phase 1 (Foundation)** — GCP project setup, Cloud SQL schema, Cloud Run deployment, authentication system.
- **Phase 2 (Connectors)** — Google OAuth flow, Google Ads connector, GA4 connector, token persistence.
- **Phase 3 (Core)** — Snapshot runner, GCS storage, admin UI (client management, data source connection).
- **Phase 4 (Reporting)** — HTML report template, Puppeteer PDF renderer, in-browser preview.
- **Phase 5 (Delivery)** — Cloud Tasks scheduling, SendGrid email delivery, job monitoring UI.
- **Phase 6 (Rank Tracking)** — Rank Tracker API integration, keyword management UI.
- **Phase 7 (Polish)** — Error handling, retry logic, monitoring setup, documentation.

**Estimated delivery:** 4–6 weeks with focused development. Pilot with 5 clients to validate before full rollout.

---

## 12. Acceptance criteria

- Agency user can log in securely and manage clients.
- Ability to connect a Google Ads & GA4 property via OAuth and fetch the required KPIs.
- Ability to configure tracked keywords per client for Rank Tracker integration.
- Preview a report in-browser that matches the PDF output.
- Generate a PDF for a client for a given month that matches the approved template.
- Schedule monthly generation and email delivery with success notifications.
- Maintain snapshots for 24 months and retrieve them for period-over-period comparisons.
- Admin can view job logs and re-run failed jobs.
- System handles API errors gracefully with retry logic and admin notifications.

---

## 13. Risks & mitigations

- **API limits & quota:** mitigate with caching, monthly snapshot-only approach, exponential backoff, and batching.
- **OAuth token expiry / permissions:** clearly document onboarding steps; build a reconnect flow and alerts on token expiry.
- **Rank Tracker API cost:** limit tracked keywords per client (suggest 10–20 keywords max per client for MVP). Monthly-only checks keep costs predictable.
- **PDF rendering edge cases:** make templates robust to missing data (show placeholders) and pre-sanitize any HTML.
- **Cloud Run cold starts:** may affect PDF rendering latency; mitigate with minimum instances (1) or accept occasional delays for on-demand generation.

---

## 14. Next steps (recommended)

1. ~~Finalize the report template~~ — **Decision:** use a standard Google Analytics-focused layout as the initial template.
2. ~~Decide the rank-tracking provider~~ — **Decision:** [Rank Tracker](https://www.ranktracker.com/).
3. ~~Choose hosting~~ — **Decision:** minimal ops stack — **Cloud Run + Cloud SQL (Postgres) + GCS**.
4. Create Technical Design Document and begin implementation.
5. Start a 1–2 week pilot with 5 low-complexity clients to validate connectors, rendering, and delivery.

---

## Appendix A — Quick storage math (illustrative)

- Clients: 50
- Retention: 24 months → 1,200 snapshots
- Snapshot size (typical estimate): 200 KB → total ~0.23 GB
- Object storage monthly cost (example S3): effectively negligible (~$0.005/month at those volumes)

---

## Appendix B — Tech stack (decided)

| Layer           | Technology                     | Notes                                |
| --------------- | ------------------------------ | ------------------------------------ |
| Frontend        | React 19 + Vite + TypeScript   | Static SPA, TailwindCSS for styling  |
| Backend         | Node.js + TypeScript + Fastify | REST API, deployed to Cloud Run      |
| Database        | Cloud SQL (Postgres 15)        | Managed, automatic backups           |
| Object Storage  | Google Cloud Storage (GCS)     | Snapshots and PDFs                   |
| Background Jobs | Cloud Tasks                    | Triggers Cloud Run HTTP endpoints    |
| PDF Renderer    | Puppeteer                      | Runs in Cloud Run container          |
| Email           | SendGrid                       | Transactional email with attachments |
| Auth            | JWT + bcrypt                   | Stateless authentication             |
| Monitoring      | Cloud Logging + Sentry         | Structured logs + error tracking     |
| Secrets         | GCP Secret Manager             | OAuth tokens, API keys               |

---

_Document ends — ready for iteration._
