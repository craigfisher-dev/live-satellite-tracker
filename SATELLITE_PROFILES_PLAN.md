# Satellite Profiles — Feature Branch Plan

> Preview this file in VS Code with Ctrl+Shift+V

Branch: `satellite-profiles`

Adds a satellite info panel to the existing tracker. Click any satellite and a panel slides out showing real metadata — name, owner, country, purpose, launch date, status, and a photo where available.

Nothing in the existing tracker changes. This is purely additive.

---

## What's being added

- **Satellite info panel** — TSX React component that renders when you click a satellite
- **FastAPI backend** — Python API on Vercel that serves enriched satellite data
- **SQLAlchemy** — ORM for reading and writing to Neon Postgres from both the API and worker
- **Neon** — free serverless Postgres, stores the enriched satellite records
- **Python worker** — scheduled script that fetches data from Space-Track and writes to the database
- **Docker + Kubernetes** — containerizes and schedules the worker
- **Terraform** — manages Vercel project config and env vars as code
- **GitHub Actions** — runs tests, builds Docker image, deploys on push
- **pytest** — tests the API endpoints and worker logic

---

## Tech stack

| Tool | Why |
|---|---|
| FastAPI | Python REST API serving enriched satellite data on Vercel serverless. |
| SQLAlchemy | ORM for reading and writing to Neon Postgres from the API and worker. |
| Neon | Free serverless Postgres. Scales to zero when idle so it stays within free tier. No pausing. |
| Python worker | Scheduled script that pulls from Space-Track and populates the database. |
| Docker | Packages the worker into a container so it runs consistently anywhere. |
| Kubernetes | Runs the worker on a schedule via CronJob. Space-Track rate limits require a persistent scheduler rather than a serverless function. |
| Terraform | Vercel project config and environment variables defined as code — reproducible and version controlled instead of manually set in the dashboard. |
| GitHub Actions | Runs pytest on every push, builds the Docker image, and deploys to Vercel. |
| pytest | Tests FastAPI endpoints and worker logic. |
| Space-Track.org | Official US Space Surveillance Network. More complete and frequently updated than CelesTrak. Free account required. |
| Wikipedia API | Satellite photos for notable satellites. No API key needed. |
| TSX React component | Info panel UI in the existing frontend. |

---

## How it connects to the existing tracker

```
existing (unchanged)
    CesiumJS frontend → Vercel Edge Functions (TS) → CelesTrak → IndexedDB

new — additive only
    app loads
        → bulk fetch all satellite profiles from FastAPI in the background
        → store everything in IndexedDB (24hr cache)
        → user clicks satellite → instant, served from IndexedDB, no network call

    IndexedDB miss (first load or cache expired)
        → Vercel edge cache
        → miss → FastAPI /api/satellite/{norad_id}
        → Neon Postgres
        → return JSON → save to IndexedDB → render info panel

background
    Kubernetes CronJob → Docker container → Python worker
        → Space-Track API (TLEs + SATCAT metadata)
        → Wikipedia API (photos)
        → write to Neon Postgres
```

Same caching pattern as the existing tracker — bulk fetch on load, IndexedDB first, network as fallback, stale data if everything fails.

**How data is matched:** NORAD ID (catalog number) is the universal identifier used by Space-Track, CelesTrak, and UCS. Every satellite in the existing tracker already has a NORAD ID from the TLE data. The worker joins all data sources on NORAD ID when writing to Neon. The frontend passes the NORAD ID when fetching a profile — everything links up with no ambiguity.

---

## Satellite description strategy

No public database has descriptions for all 14,000+ objects. The panel only shows a description when one is available — no fallback text for unknown satellites.

- **Major constellations** — hardcoded description per program (e.g. every Starlink satellite shows "Part of SpaceX's Starlink broadband internet constellation"). Covers the majority of the 14,000+ catalog.
- **Notable individual satellites** — pulled from UCS database (ISS, Hubble, weather sats, etc.)
- **Unknown payloads, rocket bodies, debris** — description field hidden entirely

**To-do:** research and write descriptions for the top 10-20 constellations before building the worker — Starlink, OneWeb, GPS, GLONASS, Galileo, Beidou, NOAA, Landsat, Iridium, and others. Stored as a lookup table in the worker.

---



Something to keep in mind but not worry about. Here's why it's fine:

- Neon scales to zero when idle — only burns CU-hours when actively running a query
- All satellite profiles are bulk fetched on app load and stored in IndexedDB — Neon only wakes up once per day when the cache expires, not on every click
- IndexedDB and Vercel edge cache catch most requests before they ever hit Neon
- The worker runs in short bursts (a few seconds) once per hour — barely registers
- A project with 50-100 concurrent users hitting the DB all day only used ~25 CU-hours over 5 days

Just make sure nothing polls the API in the background and the DB will scale to zero between requests. The caching layer does the heavy lifting — Neon is just the source of truth that rarely gets touched directly.

---



Must follow these or the account gets flagged.

| Data | Frequency | Notes |
|---|---|---|
| GP (TLEs) | 1/hour | Pick a random minute, not top/bottom of hour |
| SATCAT | 1/day | After 1700 UTC. Has names, countries, object types |
| CDM (conjunctions) | 3/day | Future feature, not this update |
| DECAY | 1/day | Store locally, never re-download |

Worker only needs **GP + SATCAT** for now.

---

## Satellite images

- Wikipedia API first — free, no key, covers ISS, Hubble, GPS, Starlink, etc.
- Fallback to a generic illustration based on satellite type (CubeSat, GEO comms, LEO imaging, debris)
- NASA Image API is an option later if Wikipedia coverage isn't enough
- Figuring out exact implementation during the build

**How image storage works:** only the image URL is stored in Postgres as a text field, not the actual image. The worker finds the image on Wikipedia/NASA and saves the URL. The frontend renders it with a normal `<img src={image_url} />` — images load directly from Wikipedia/NASA's servers, nothing is stored on Vercel or Neon.

---

## UCS satellite database

No API — UCS publishes a spreadsheet updated a few times a year. Downloaded manually and committed to the repo as a static file.

**How it works:**
- Download the latest UCS spreadsheet from ucsusa.org
- Commit to repo as `worker/data/ucs_satellites.csv`
- Worker reads it on startup and uses it to enrich records before writing to Neon
- When UCS publishes a new version, replace the file and redeploy

No separate database needed — just a reference file the worker reads from. The enriched data ends up in the main `satellites` table in Neon alongside Space-Track data.

**What UCS provides:**
- Official satellite name
- Country of operator
- Purpose (Earth observation, communications, navigation, etc.)
- Launch date
- Expected lifetime
- Contractor/manufacturer

**To-do:** download latest UCS spreadsheet before building the worker.

---

## Project structure

```
live-satellite-tracker/
├── frontend/                            ← existing structure, everything lives here
│   ├── api/
│   │   ├── satellites.ts                ← existing Vercel edge function
│   │   └── satellite/
│   │       └── [norad_id].py            ← NEW: FastAPI endpoint on Vercel
│   ├── src/
│   │   ├── components/
│   │   │   ├── Clock.tsx                ← existing
│   │   │   ├── Legend.tsx               ← existing
│   │   │   └── SatelliteInfoPanel.tsx   ← NEW: info panel component
│   │   ├── tests/
│   │   │   ├── SatelliteFilter.test.ts  ← existing
│   │   │   └── test_worker.py           ← NEW: pytest worker tests
│   │   └── utils/
│   │       ├── CountryBorders.ts        ← existing
│   │       ├── HelpPanel.ts             ← existing
│   │       ├── satelliteCache.ts        ← existing
│   │       ├── SatelliteFilter.ts       ← existing
│   │       └── SatelliteTracker.ts      ← existing
│   ├── worker/
│   │   ├── worker.py                    ← NEW: main script
│   │   ├── spacetrack.py                ← NEW: Space-Track API client
│   │   ├── wikipedia.py                 ← NEW: image fetcher
│   │   ├── db.py                        ← NEW: SQLAlchemy models + writes
│   │   ├── data/
│   │   │   └── ucs_satellites.csv       ← NEW: UCS spreadsheet, updated manually
│   │   ├── Dockerfile                   ← NEW
│   │   └── k8s/
│   │       ├── cronjob-tle.yaml         ← NEW: hourly
│   │       └── cronjob-satcat.yaml      ← NEW: daily
│   ├── terraform/
│   │   ├── main.tf                      ← NEW: Vercel project + env vars
│   │   └── variables.tf                 ← NEW
│   ├── requirements.txt                 ← NEW: fastapi, sqlalchemy, psycopg2
│   ├── .env
│   ├── .gitignore
│   ├── vercel.json
│   └── ...existing config files
├── .github/
│   └── workflows/
│       └── deploy.yml               ← NEW: CI/CD
├── .gitignore
├── LICENSE
└── README.md
```

---

## Database schema

```sql
CREATE TABLE satellites (
    norad_id      INTEGER PRIMARY KEY,
    name          TEXT,
    owner         TEXT,
    country       TEXT,
    purpose       TEXT,
    description   TEXT,        -- nullable, only shown if known
    launch_date   DATE,
    status        TEXT,        -- 'active', 'defunct', 'debris'
    object_type   TEXT,        -- 'PAYLOAD', 'ROCKET BODY', 'DEBRIS'
    image_url     TEXT,        -- nullable
    image_source  TEXT,        -- 'wikipedia', 'nasa', 'illustration'
    tle_line1     TEXT,
    tle_line2     TEXT,
    last_updated  TIMESTAMP
);
```

---

## API

```
GET /api/satellites
Returns all satellite profiles at once. Fetched on app load, cached in IndexedDB for 24hrs.

GET /api/satellite/{norad_id}
Returns a single satellite profile. Used as fallback on IndexedDB miss.

{
  "norad_id": 25544,
  "name": "ISS (ZARYA)",
  "owner": "ISS",
  "country": "multinational",
  "purpose": "Space station",
  "launch_date": "1998-11-20",
  "status": "active",
  "object_type": "PAYLOAD",
  "image_url": "https://...",
  "image_source": "wikipedia",
  "last_updated": "2026-04-11T12:00:00Z"
}
```

---

## Info panel UI

```
┌─────────────────────────────────┐
│  [photo or illustration]        │
│                                 │
│  ISS (ZARYA)                    │
│  Space station · Active         │
│                                 │
│  Owner      ISS / Multinational │
│  Country    Multinational       │
│  Launched   Nov 20, 1998        │
│  Object     Payload             │
│  NORAD ID   25544               │
│                                 │
│  [Space-Track] [Wikipedia]      │
└─────────────────────────────────┘
```

---

## Build order

1. Set up Neon, run schema
2. Build Python worker — Space-Track client, SATCAT + TLE fetch, write to DB
3. Dockerize the worker
4. Kubernetes CronJob manifests, test locally with Minikube
5. FastAPI endpoint on Vercel
6. `SatelliteInfoPanel.tsx` in the frontend
7. Wikipedia image fetcher in the worker
8. Terraform for Vercel config
9. GitHub Actions CI/CD
10. pytest coverage for worker and API

---

## What stays the same

- CesiumJS globe and all rendering
- TLE fetching via CelesTrak + Vercel Edge Functions (TypeScript)
- IndexedDB caching for TLE data
- Orbital path visualization on click
- Color filters, time controls, camera navigation

---

## Future ideas

- Conjunction alerts using CDM data from Space-Track
- Switch TLE source from CelesTrak to Space-Track
- Reentry prediction panel
- Filter satellites by owner / country / purpose

---

## Terraform

Manages the Vercel project config and environment variables as code. Instead of manually setting env vars in the Vercel dashboard, everything is defined in a config file and version controlled — so the infrastructure is reproducible and nothing is lost if the project needs to be rebuilt.

**What it manages:**
- Vercel project settings
- Environment variables (Space-Track credentials, Neon connection string, etc.)
- Production vs preview environment configs

**File structure:**
```
terraform/
├── main.tf          ← Vercel provider + project resource
├── variables.tf     ← input variables (API keys, connection strings)
└── terraform.tfvars ← actual values, never committed to git
```

**Basic example:**
```hcl
resource "vercel_project" "satellite_tracker" {
  name      = "live-satellite-tracker"
  framework = "vite"
}

resource "vercel_env" "spacetrack_user" {
  project_id = vercel_project.satellite_tracker.id
  key        = "SPACETRACK_USER"
  value      = var.spacetrack_user
  target     = ["production"]
}

resource "vercel_env" "neon_database_url" {
  project_id = vercel_project.satellite_tracker.id
  key        = "DATABASE_URL"
  value      = var.database_url
  target     = ["production"]
}
```

**Commands:**
```bash
terraform init        # install Vercel provider
terraform plan        # preview changes
terraform apply       # apply changes to Vercel
```

---



### Unit tests (pytest)

- Space-Track client parses response correctly
- SATCAT data maps to DB columns correctly
- Worker handles missing or malformed NORAD IDs
- Wikipedia image fetcher handles no result gracefully
- DB write logic upserts without duplicating records
- FastAPI returns 200 with correct shape for a known NORAD ID
- FastAPI returns 404 for an unknown NORAD ID

### Integration tests (pytest)

- Worker fetches from Space-Track and record appears in DB
- FastAPI reads from DB and returns correct data end to end
- Caching layer returns cached response on second request
- Full flow: worker writes → API reads → correct JSON returned

---

## Status

### Done
- [x] Space-Track.org account registered
- [x] Tech stack decided

### Tomorrow
- [ ] Re-read full plan top to bottom and verify everything
- [ ] Fix anything that doesn't look right
- [ ] Commit finalized plan to `satellite-profiles` branch
- [ ] Download latest UCS satellite spreadsheet from ucsusa.org
- [ ] Research and write descriptions for top 10-20 major constellations (Starlink, OneWeb, GPS, GLONASS, Galileo, Beidou, NOAA, Landsat, Iridium, etc.)
- [ ] Confirm how Wikipedia API returns image URLs for a given satellite name
- [ ] Figure out rate limiting in the worker (retry logic, random minute offsets for TLE fetches)