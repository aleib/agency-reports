# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A lightweight agency reporting platform that generates monthly PDF reports for digital marketing clients. Integrates Google Ads, Google Analytics (GA4), and Rank Tracker APIs to produce standardized reports with automated email delivery.

## Tech Stack

- **Frontend**: React 19 + Vite + TypeScript + TailwindCSS
- **Backend**: Node.js + TypeScript + Fastify
- **Database**: Cloud SQL (PostgreSQL 15)
- **Storage**: Google Cloud Storage (snapshots and PDFs)
- **Background Jobs**: Cloud Tasks
- **PDF Rendering**: Puppeteer (headless Chrome)
- **Email**: SendGrid
- **Auth**: JWT + bcrypt

## Project Structure

```
packages/
├── web/          # React SPA (Vite)
├── api/          # Fastify backend
├── renderer/     # PDF rendering service
└── shared/       # Shared TypeScript types
```

## Key Architecture Concepts

### Data Flow
Monthly reports are generated via Cloud Scheduler → Cloud Tasks → Backend worker that:
1. Fetches data from Google Ads, GA4, and Rank Tracker APIs
2. Stores JSON snapshot to GCS
3. Renders PDF via Puppeteer
4. Emails PDF via SendGrid

### OAuth Pattern
Google OAuth tokens are encrypted with GCP KMS and stored in the database. The platform accesses client data through the agency user's authorized Google account.

### Snapshot Model
Monthly data snapshots are stored as immutable JSON in GCS with 24-month retention. This allows period-over-period comparisons without re-querying APIs.

## Development Commands

```bash
# Install dependencies (uses pnpm workspaces)
pnpm install

# Run development servers
pnpm --filter web dev        # Frontend on localhost:5173
pnpm --filter api dev        # Backend on localhost:3000

# Build
pnpm --filter web build
pnpm --filter api build

# Run tests
pnpm --filter api test
pnpm --filter web test

# Run single test file
pnpm --filter api test src/services/snapshot.service.test.ts

# Database migrations
pnpm --filter api db:migrate
pnpm --filter api db:migrate:down

# Type checking
pnpm typecheck
```

## Environment Variables

Required environment variables are documented in `tdd.md` section 10. Key ones:
- `DATABASE_URL` - PostgreSQL connection string
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` - OAuth credentials
- `GCS_BUCKET_SNAPSHOTS` - GCS bucket for snapshots
- `SENDGRID_API_KEY` - Email delivery
- `RANK_TRACKER_API_KEY` - Keyword ranking data

## Key Implementation Notes

- Report template uses Handlebars with server-rendered SVG charts
- Charts should use chartjs-node-canvas or d3 for PDF rendering
- Internal endpoints (`/internal/*`) require Cloud Tasks OIDC verification
- Job retry policy: 3 attempts with exponential backoff (1min → 1hr max delay)
- All monetary values use the client's currency (stored in snapshot)
