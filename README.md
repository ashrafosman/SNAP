# SNAP QC Early Warning System

A Databricks App for SNAP (Supplemental Nutrition Assistance Program) Quality Control — helping state agencies identify payment errors, triage high-risk cases, and reduce federal liability before the annual QC review cycle.

## Overview

State SNAP agencies face significant financial penalties when their Payment Error Rate (PER) exceeds the national average. This tool gives QC supervisors and caseworkers a real-time risk dashboard, AI-assisted case review, and compliance reporting — all powered by Databricks.

## Features

### Dashboard
- KPI cards showing case counts by risk tier (High / Medium / Low)
- Active profile's FY2024 Payment Error Rate (state-specific, sourced from USDA FNS)
- ROI calculator projecting penalty savings potential
- Toggle between metrics view and executive story presentation

### Story Presentation
- Full-screen slide deck for executive briefings
- Pulls state name, error rate, and projected liability from the active branding profile
- Covers the fiscal cliff scenario, QC methodology, and projected outcomes

### Case Queue
- Paginated list of SNAP cases with risk scores and severity flags
- Filter by city, county, severity, error type, status, and income source
- Full-text search across case names
- Integrates with GeoMap — clicking a county filters the queue automatically

### Case Detail
- Per-case risk factor breakdown with weighted scoring
- AI Copilot: suggested questions to ask, documents to request, and verification actions
- Document upload and analysis (pay stubs, lease agreements) with discrepancy detection
- QC checklist with notes, persisted per case
- Status tracking (Pending → Reviewed → Resolved)

### GeoMap
- US county choropleth showing case concentration and exposure
- Zoom, pan, and click-to-filter — clicking a county navigates to the Case Queue filtered to that location

### Signals
- Cross-program data matching alerts (death records, Medicaid gaps, unreported births, ADT triggers)
- Severity tiers with status workflow (Open → Reviewed → Dismissed)

### Pipeline Monitor
- Visual pipeline diagram of the SNAP QC data flow (Bronze → Silver → Gold layers)
- Per-stage run status, row counts, latency, and error rates
- Supports light and dark themes

### Data Catalog
- Browsable catalog of all data sources across Bronze, Silver, and Gold layers
- Schema viewer with column types and descriptions
- Lineage graph showing how Bronze feeds into Silver and Gold tables

### Reports
- Summary reporting view for QC findings

### Settings
- **Branding Profiles**: Create and manage per-state profiles with agency name, icon URL, accent color, tagline, and QC metrics (error rate %, projected liability, annual SNAP benefits)
- Switch between state profiles — updates all pages instantly
- Profiles persist in Lakebase (shared PostgreSQL on Databricks) so all app users see the same active profile
- Use Case configuration
- Role switcher (QC Supervisor / Caseworker / Director)

### Dark / Light Theme
- Toggle between dark and light mode via the sun/moon icon in the nav bar
- Preference persisted in localStorage

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Tailwind v4, Vite |
| Charts | Recharts |
| Maps | react-simple-maps |
| Backend | FastAPI, Python 3.11 |
| Database | Databricks Lakebase (PostgreSQL) via psycopg2 |
| AI | Databricks Model Serving (DBRX / Claude) |
| Hosting | Databricks Apps (Azure) |

## Branding Profiles

Profiles are configured in **Settings → Branding Profiles**. Each profile stores:

| Field | Description |
|---|---|
| State | State name shown throughout the app |
| Agency Name | Full agency name (e.g. WA DSHS) |
| Program Name | Program label (e.g. Basic Food) |
| Icon URL | Agency logo URL shown in nav |
| Accent Color | Hex color for highlights |
| Error Rate % | FY2024 USDA FNS Payment Error Rate |
| Projected Liability | Estimated federal penalty exposure |
| Annual SNAP Benefits | Total annual issuance in billions |

Pre-loaded profiles:
- **Washington** — DSHS, 6.06% PER (FY2024)
- **Oregon** — ODHS, 14.06% PER (FY2024)
- **Michigan** — MDHHS, 9.53% PER (FY2024)

## Deployment

```bash
# Build frontend
cd frontend && npm run build && cd ..

# Sync source to Databricks workspace
databricks sync . /Workspace/Users/<user>/snap-qc --profile work

# Import built frontend (excluded from sync by .gitignore)
databricks workspace import-dir frontend/dist /Workspace/Users/<user>/snap-qc/frontend/dist --overwrite --profile work

# Deploy the app
databricks apps deploy snap-qc --source-code-path /Workspace/Users/<user>/snap-qc --profile work
```

## Local Development

```bash
# Backend (port 8001)
pip install -r requirements.txt
uvicorn app:app --port 8001 --reload

# Frontend (port 5173, proxies /api → 8001)
cd frontend && npm install && npm run dev
```
