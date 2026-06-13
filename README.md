# KV Capital - Residential Comp Analysis

AI-powered sales comparison valuation for residential properties in Calgary.

**Demo video:** [Watch on Loom](https://www.loom.com/share/14ce49c10c7c4d6da066ed1216a137f6)
**Phone (Sam call):** +1 (587) 966-2408

---

## The Problem

Residential property valuation is slow, opaque, and expensive. A licensed appraiser using the sales comparison approach manually selects 3-5 comparable sales, applies subjective adjustments for differences in size, age, condition, and features, then reconciles a final value estimate. The process takes days and costs hundreds of dollars, yet the underlying logic -- find similar nearby sales and adjust -- is well-defined enough to automate.

---

## Approach

### Architecture

The system separates concerns hard:

- **Deterministic code** handles all filtering, arithmetic, and adjustments. No LLM touches a number.
- **The LLM (Claude)** handles only judgment calls: which comps to select from the ranked candidate pool, how to weight them, and how to explain the rationale in plain language.

This prevents hallucinated figures while still leveraging the model's reasoning about market context.

### Valuation Pipeline

1. **Geocoding** - Address is resolved to lat/lon via Nominatim (OpenStreetMap). Neighborhood is detected for community matching.
2. **Candidate retrieval** - SQLite is queried with a bounding box pre-filter, then exact Haversine distance ranking. Comps are scored on a composite similarity metric: distance (30%), recency (20%), GLA (20%), year built (10%), beds (5%), baths (5%), price/sqft deviation (10%).
3. **Agent** - The Vercel AI SDK agent receives the ranked candidate list and subject property specs. It selects 3-5 comps, assigns weights, and calls deterministic adjustment tools (size adjustment, age adjustment, condition adjustment, garage/basement adjustments).
4. **Reconciliation** - Adjusted prices are weighted-averaged in code to produce the final estimate, range, and confidence level.

### Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router) |
| AI | Vercel AI SDK v4, Anthropic Claude |
| Database | SQLite via `better-sqlite3` |
| Geocoding | Nominatim (OpenStreetMap, no API key) |
| Data | Synthetic Calgary market data + manually collected MLS listings |

---

## Running Locally

### Prerequisites

- Node.js 18+
- An Anthropic API key

### Setup

```bash
git clone https://github.com/smitster1403/kv_capital_agent
cd kv_capital_agent
npm install
```

### Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Test addresses

The data covers inner-city NW Calgary (Hillhurst, Rosedale, Crescent Heights, Capitol Hill, Mount Pleasant) and several SW/NW/SE suburbs. Good test inputs:

- `1404 18 Ave NW, Calgary, AB T2M 0W6` - Detached, 4 bd, 2 ba, 4499 lot size, 1066 GLA, 1928 year built
- `1410 21 AVENUE NW, Capitol Hill, Calgary, AB T2M 1L6` - Semi-Detached, 4 bd, 4 ba, 3013 lot size, 1929 GLA, 2013 year built

---

## What I Would Build Next

1. **Real MLS data pipeline** - Automate ingestion from CREB or Zolo so the database stays current. The import script and scraper scaffolding are already in place.

2. **More markets** - The architecture is city-agnostic. Edmonton would be the natural next market; the geocoder and community lookup system would need a corresponding dataset.

3. **Report export** - Generate a PDF appraisal report in FNMA 1004 format. Lenders and brokers need paper, not a web UI.

4. **Confidence signals from data density** - Surface to the user when coverage is thin (fewer than 10 comps in the pool) and suggest relaxing filters, rather than silently returning a low-confidence estimate.

---

## Project Structure

```
src/
  app/
    page.tsx          # single-page UI (form + results)
    api/
      value/route.ts  # POST /api/value -- runs the agent
      geocode/route.ts # GET /api/geocode -- Nominatim wrapper
  lib/
    agent.ts          # Vercel AI SDK agent, tool definitions
    retrieval.ts      # candidate search, Haversine scoring
    adjustments.ts    # deterministic dollar adjustments
    reconcile.ts      # weighted average + confidence
    db.ts             # SQLite singleton
    communities.ts    # Calgary community lat/lon centroids
    types.ts          # shared TypeScript types

scripts/
  generate-data.ts    # seeds synthetic sales data
  import-real-data.ts # imports CSV listings
  scrape-zolo.ts      # Playwright scraper for Zolo.ca sold listings
```
