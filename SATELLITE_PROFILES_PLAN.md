# Satellite Profiles — Feature Branch Plan

Branch: `satellite-profiles`

Adds a satellite info panel to the existing tracker. Click any satellite and a panel slides out showing real metadata — name, country, purpose, description, launch date, launch site, object type, size, and a photo where available.

Nothing in the existing tracker changes. This is purely additive.

---

## What's being added

- **Satellite info panel** — TSX React component that renders when you click a satellite
- **FastAPI backend** — Python REST API on Vercel serverless (not edge runtime) that serves enriched satellite data
- **SQLAlchemy** — ORM for reading and writing to Neon Postgres from both the API and worker
- **Neon** — free serverless Postgres, stores the enriched satellite records
- **Python worker** — scheduled script that fetches data from Space-Track and writes to the database
- **Docker + Kubernetes (K3s)** — containerizes and schedules the worker
- **DigitalOcean Droplet** — $8/month Linux VPS where Docker and Kubernetes run, always on
- **Terraform** — manages Vercel project config and env vars as code
- **GitHub Actions** — runs tests, builds Docker image, deploys on push
- **pytest** — tests the API endpoints and worker logic
- **Satellite count display** — live count of tracked satellites shown on the globe

---

## Tech stack

| Tool | Why |
|---|---|
| FastAPI | Python REST API serving enriched satellite data on Vercel serverless. Runs as a regular serverless function (not edge runtime) — required for Python runtime and cron job compatibility. |
| SQLAlchemy | ORM for reading and writing to Neon Postgres from the API and worker. |
| Neon | Free serverless Postgres. Scales to zero when idle so it stays within free tier. No pausing. |
| Python worker | Scheduled script that pulls from Space-Track and populates the database. |
| Docker | Packages the worker into a container so it runs consistently anywhere. |
| Kubernetes (K3s) | Runs the worker on a schedule via CronJob on the DigitalOcean Droplet. Space-Track rate limits require a persistent scheduler rather than a serverless function. |
| DigitalOcean Droplet (Linux VPS) | $8/month always-on Ubuntu server where Docker and Kubernetes run. Fixed price, no auto-scaling, no surprise bills. 1GB RAM, 1 CPU, 35GB NVMe SSD, 1000GB transfer. Monitor via DigitalOcean dashboard or SSH (`df -h`, `free -h`, `htop`). |
| Terraform | Manages both Vercel config and the DigitalOcean Droplet as code — reproducible infrastructure across two providers, version controlled. |
| GitHub Actions | Runs pytest on every push, builds the Docker image, pushes to Docker Hub, deploys to Vercel. |
| pytest | Tests FastAPI endpoints and worker logic. |
| Space-Track.org | Official US Space Surveillance Network. More complete and frequently updated than CelesTrak. Free account required. |
| TSX React component | Info panel UI in the existing frontend. |

---

## How it connects to the existing tracker

**Existing pipeline (unchanged)**
- CesiumJS frontend → Vercel Edge Functions (TS) → CelesTrak → IndexedDB
- TLE fetching, orbital paths, time controls, globe rendering — untouched

**Profiles pipeline (NEW)**
- CesiumJS frontend → Vercel Serverless Function (Python/FastAPI) → Neon Postgres → IndexedDB

---

**Flow 1 — Background worker (runs independently, daily)**

**What worker.py does:**
1. Log into Space-Track
2. Download all SATCAT data (single batch query)
3. Read `ucs_satellites.csv`
4. Write everything to Neon
5. Done, container exits

**How it runs in production:**
- Worker code written and tested locally first (`python worker.py`)
- GitHub Actions builds the worker code into a Docker image
- Pushes the image to Docker Hub
- K3s CronJob on the DigitalOcean Droplet pulls the image at 1700 UTC daily
- Container starts, runs `worker.py`, then stops

Has nothing to do with users — just keeps Neon up to date.

---

**Flow 2 — User flow (on app load)**
- Bulk fetches all satellite profiles from FastAPI on app load
- Stores everything in IndexedDB with a 24hr cache
- Clicking a satellite serves the profile instantly from IndexedDB — no network call
- Fallback hierarchy:
  1. Check IndexedDB → hit cache → stop, use it
  2. IndexedDB missing or expired cache (24hr) → check Vercel Edge cache → hit Vercel Edge cache → stop, use it
  3. Vercel Edge cache miss → FastAPI → Neon Postgres → return data from Neon → save to IndexedDB
  4. Everything fails (Full Network Failure) → use stale IndexedDB data if available
  5. No stale data (brand new user, full network failure) → show error message in panel: "Unable to load satellite profile. Please try again later."

---

**The only connection between the two flows is Neon** — the worker writes to it, FastAPI reads from it.

---

## Satellite description strategy

No public database has descriptions for all 14,000+ objects. Descriptions will be added later via Neon console alongside images — Starlink, OneWeb, GPS, GLONASS, Galileo, Beidou, Iridium, NOAA, Landsat, ISS, Hubble, James Webb

- **Major constellations** — hardcoded description per program (e.g. every Starlink satellite shows "Part of SpaceX's Starlink broadband internet constellation"). Covers the majority of the 14,000+ catalog.
- **Notable individual satellites** — pulled from UCS database (ISS, Hubble, weather sats, etc.)
- **Unknown payloads, rocket bodies, debris** — description field hidden entirely

**To-do:** research and write descriptions for the top 10-20 constellations before building the worker — Starlink, OneWeb, GPS, GLONASS, Galileo, Beidou, NOAA, Landsat, Iridium, and others. Stored as a lookup table in the worker.

---

## Neon free tier — 100 CU-hours/month

Something to keep in mind but not worry about. Here's why it's fine:

- Neon scales to zero when idle — only burns CU-hours when actively running a query
- All satellite profiles are bulk fetched on app load and stored in IndexedDB — Neon only wakes up once per day when the cache expires, not on every click
- IndexedDB and Vercel edge cache catch most requests before they ever hit Neon
- The worker runs in short bursts (a few seconds) once per day for SATCAT — barely registers
- A project with 50-100 concurrent users hitting the DB all day only used ~25 CU-hours over 5 days

Just make sure nothing polls the API in the background and the DB will scale to zero between requests. The caching layer does the heavy lifting — Neon is just the source of truth that rarely gets touched directly.

---

## Space-Track rate limits

Must follow these or the account gets flagged.

| Data | Frequency | Notes |
|---|---|---|
| SATCAT | 1/day | After 1700 UTC. Has names, countries, object types |
| CDM (conjunctions) | 3/day | Future feature, not this update |
| DECAY | 1/day | Store locally, never re-download |

Worker only needs **SATCAT** for now. TLEs stay with CelesTrak — no change to existing pipeline.

**Important:** all satellites must be fetched in a single batch query — not one request per satellite. Space-Track explicitly requires combining multiple objects into one comma-delimited request. Sending hundreds of individual queries will get the account suspended.

---

## Testing data

Space-Track rate limits make it impractical to call the API during development. A one-time 
fetch was run to save a local copy of the full SATCAT response for offline testing.

- Location: `worker/testing_data/satcat.json`
- Contains ~68,000 objects (full catalog including debris, rocket bodies, historical launches)
- Gitignored — never committed to the repo
- To refresh: uncomment the block at the bottom of spacetrack.py and run it once
- worker.py loads this file during development instead of calling get_satcat()

**Switching between test and production mode:**
- Set `USE_TEST_DATA=true` in `.env` to load from `testing_data/satcat.json` locally
- Set `USE_TEST_DATA=false` in production Kubernetes secrets — worker calls `get_satcat()`

---

## Satellite images

Photos are manually curated and stored in the `satellite_images` table in Neon. The worker never touches this table — images are managed independently.

**Coverage strategy:**
- Individual notable satellites (ISS, Hubble, James Webb, Chandra, etc.) — unique photo each, looked up by norad_id
- One image per constellation program, reused for every satellite in that program, looked up by canonical name
- Constellations mirror the network filter in SatelliteFilter.ts: STARLINK, ONEWEB, KUIPER, IRIDIUM, GPS, GLOBALSTAR, GALILEO, GLONASS, BEIDOU, QIANFAN, PLANET
- Unknown payloads, rocket bodies, debris — no image, section hidden in the panel

**How it works:**
- Images sourced from NASA and Wikimedia Commons (open license only — no random website URLs)
- Only the image URL is stored — images load directly from the source, nothing hosted on Vercel or Neon
- FastAPI resolves images in priority order: norad_id match first, constellation fallback second, no image third
- Constellation name is mapped from the satellite name in the API using the same logic as SatelliteFilter.ts
- New images can be added anytime by inserting a row in Neon — no redeployment needed

---

## Satellite count display

A live count of currently tracked satellites is shown on the globe — e.g. "Tracking 14,320 satellites".

- Derived from the TLE data already loaded in the frontend — no backend call needed
- Updates automatically as TLE data loads
- Simple text element added to the existing UI

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
- Operator/Owner
- Country of operator
- Purpose (Earth observation, communications, navigation, etc.)
- Launch date
- Expected lifetime
- Contractor/manufacturer

---

## Project structure

```
live-satellite-tracker/
├── frontend/                            ← existing structure, everything lives here
│   ├── api/
│   │   ├── satellites.ts                ← existing Vercel edge function
│   │   └── satellites-profiles/
│   │       └── index.py                 ← NEW: FastAPI bulk endpoint on Vercel
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
│   │   ├── testing_data/
│   │   │   └── satcat.json     ← gitignored, saved Space-Track response for local testing
│   │   ├── worker.py                    ← NEW: main script
│   │   ├── spacetrack.py                ← NEW: Space-Track API client
│   │   ├── db.py                        ← NEW: SQLAlchemy models + writes
│   │   ├── data/
│   │   │   └── ucs_satellites.csv       ← NEW: UCS spreadsheet, updated manually
│   │   ├── .dockerignore                ← NEW
│   │   ├── Dockerfile                   ← NEW
│   |   ├── requirements.txt             ← NEW: fastapi, sqlalchemy, psycopg2, requests
│   │   └── k8s/
│   │       ├── cronjob-tle.yaml         ← NEW: hourly
│   │       └── cronjob-satcat.yaml      ← NEW: daily
│   ├── terraform/
│   │   ├── main.tf                      ← NEW: Vercel project + env vars
│   │   └── variables.tf                 ← NEW
│   ├── .env
│   ├── .gitignore
│   ├── vercel.json
│   └── ...existing config files
├── .github/
│   └── workflows/
│       └── deploy.yml                   ← NEW: CI/CD
├── .gitignore
├── LICENSE
└── README.md
```

---

## Database schema

```sql
CREATE TABLE satellites (
    norad_id      INTEGER PRIMARY KEY,  -- NORAD_CAT_ID from SATCAT, joins with CelesTrak
    name          VARCHAR(25),          -- SATNAME from SATCAT
    object_type   VARCHAR(12),          -- OBJECT_TYPE: PAYLOAD, ROCKET BODY, DEBRIS
    country       CHAR(6),              -- COUNTRY code e.g. US, CN, RU
    launch_date   DATE,                 -- LAUNCH from SATCAT
    launch_site   CHAR(5),              -- SITE from SATCAT e.g. AFETR, TYMSC
    decay_date    DATE,                 -- DECAY from SATCAT, null if still on orbit
    current       CHAR(1),              -- CURRENT: Y or N
    rcs_size      VARCHAR(6),           -- RCS_SIZE: SMALL, MEDIUM, LARGE
    purpose       TEXT,                 -- from UCS database, nullable
    description   TEXT,                 -- from constellation lookup table, nullable
    last_updated  TIMESTAMP,
    operator      TEXT,                 -- Operator/Owner from UCS database, nullable
);

CREATE TABLE satellite_images (
    id            SERIAL PRIMARY KEY,
    norad_id      INTEGER,             -- for individual sats (ISS, Hubble, etc.), null for constellations
    constellation VARCHAR(20),         -- canonical program name (STARLINK, GPS, PLANET, etc.), null for individual sats
    image_url     TEXT NOT NULL,       -- full URL, images served directly from source
    credit        TEXT,                -- e.g. 'NASA', 'ESA', 'Wikimedia Commons'
    caption       TEXT                 -- caption for the image
);
```

FastAPI queries satellites by norad_id, then resolves images from satellite_images using norad_id first, constellation name fallback second. Worker never touches `satellite_images`. Images are added manually via the Neon console.

---

## FAST API

```
GET /api/satellites-profiles
Returns all satellite profiles at once. Fetched on app load, cached in IndexedDB for 24hrs.

{
  "norad_id": 25544,
  "name": "ISS (ZARYA)",
  "object_type": "PAYLOAD",
  "country": "US",
  "launch_date": "1998-11-20",
  "launch_site": "TYMSC",
  "decay_date": null,
  "current": "Y",
  "rcs_size": "LARGE",
  "purpose": "Space station",
  "description": "The International Space Station is a multinational research laboratory in low Earth orbit.",
  "image_url": "https://upload.wikimedia.org/...",
  "credit": "NASA",
  "last_updated": "2026-04-12T12:00:00Z"
}
```

---

## Info panel UI

```
┌─────────────────────────────────┐
│  [photo if available]           │
│                                 │
│  ISS (ZARYA)                    │
│  Space station · Active         │
│                                 │
│  The International Space Station│
│  is a multinational research    │
│  lab in low Earth orbit.        │
│                                 │
│  Country      US                │
│  Launched     Nov 20, 1998      │
│  Launch site  TYMSC             │
│  Object       Payload           │
│  Size         Large             │
│  NORAD ID     25544             │
│                                 │
│  [Space-Track]                  │
└─────────────────────────────────┘
```

---

## Build order

1. [x] Set up Neon, run schema
2. [x] db.py — SQLAlchemy models and upsert function
3. [x] spacetrack.py — Space-Track client, login, SATCAT fetch
4. [x] worker.py — UCS CSV reader, merge, calls db.py and spacetrack.py
5. [x] Dockerize the worker
6. [x] Push Docker image to Docker Hub
7. [x] Write Kubernetes CronJob manifests, test locally with Minikube
8. [x] Provision DigitalOcean Droplet
9. [x] Install K3s on the Droplet
    - installed with --disable traefik --disable servicelb
    - traefik = reverse proxy for incoming web traffic (not needed, worker is outgoing only)
    - servicelb = load balancer (not needed, single container)
    - saves ~100MB RAM on 2GB Droplet
10. [x] Deploy Kubernetes CronJob to Droplet — worker runs in production
    - committed k8s/ manifests to satellite-profiles branch and pushed
    - set USE_TEST_DATA=false in configmap.yaml (not secrets.yaml — env var lives in ConfigMap)
    - rebuilt Docker image and pushed to Docker Hub
    - git clone -b satellite-profiles repo onto Droplet
    - kubectl apply -f k8s/
    - triggered manual job to test: kubectl create job --from=cronjob/run-worker test-run -n satellite-tracker
    - checked logs: kubectl logs -f -n satellite-tracker -l job-name=test-run
    - verified 68,594 satellites upserted to Neon, purpose/operator populated from UCS
    - deleted all satellites from Neon, triggered test-run-2, verified 68,594 rows restored
    - upgraded Droplet from $8/mo (1GB RAM) to $12/mo (2GB RAM) due to memory pressure during upsert
    - CronJob scheduled: 0 5 * * * (5am UTC / midnight EST  or 1 am EDT) 
    - for future updates: SSH in → git pull → kubectl apply -f k8s/
    - NOTE: currently on satellite-profiles branch — switch to main after step 18 merge
11. [x] Verify CelesTrak/Space-Track NORAD ID overlap
    - Write a quick Python script that fetches active TLE data from CelesTrak
    - Extract all NORAD IDs from the TLE response
    - Query Neon satellites table and compare — how many CelesTrak IDs have a matching row
    - Log any missing IDs and investigate — recent launches not yet in SATCAT, data lag, etc.
    - Confirm overlap is high enough before proceeding to FastAPI (Confirmed 99.999% Only 1 satellite difference between them due to non perfect sync because of cron job (expected result))
12. [x] Populate `satellite_images` table
    - Dropped and recreated satellite_images table with new schema (id, norad_id, constellation)
    - Inserted 4 individual satellite rows (ISS, Hubble, James Webb, Chandra) using NASA/Wikimedia URLs
    - Inserted 11 constellation rows (STARLINK, ONEWEB, KUIPER, IRIDIUM, GPS, GLOBALSTAR, GALILEO, GLONASS, BEIDOU, QIANFAN, PLANET) using NASA/Wikimedia URLs
    - 15 total rows in satellite_images table
13. [x] FastAPI endpoint on Vercel
    - created api/satellites-profiles/index.py (subfolder required for Vercel routing)
    - Vercel auto-detects Python runtime from requirements.txt in frontend/
    - removed functions block from vercel.json (caused runtime version error)
    - DATABASE_URL env var must be enabled for Preview environments in Vercel dashboard
    - verified working on Vercel preview branch: 68,662 satellites and 15 images returned from Neon
    - print() statements visible in Vercel dashboard → Logs tab
    - added cron job for /api/satellites-profiles at 0 10 * * * in vercel.json to proactively refresh Vercel edge cache daily without requiring a user request
    - runs as a Vercel serverless function (not edge runtime) — Python runtime requirement; cron jobs work natively unlike the TS edge function in satellites.ts
14. [x] IndexedDB satellite profiles caching
    - created src/utils/profileCache.ts with fetchSatelliteProfiles() and getSatelliteProfile()
    - updated satelliteCache.ts: DB_VERSION incremented 1→2, onupgradeneeded now creates both 'cache' (TLE) and 'satellites' (profiles) tables
    - updated SatelliteTracker.ts: lazy load profiles — await fetchSatelliteData() (~490ms), then fetchSatelliteProfiles() without await (loads in background ~4.8s)
    - app shows globe with TLE data faster (~490ms), profiles populate IndexedDB in background
    - fallback hierarchy: IndexedDB cache → API fetch → stale cache → error
    - profiles ready in IndexedDB for SatelliteInfoPanel component lookups by norad_id
15. [~] `SatelliteInfoPanel.tsx` in the frontend (~80% done)
    - created src/components/SatelliteInfoPanel.tsx
    - panel opens on satellite click, closes on empty space click or X button
    - same satellite click guard — no panel reload if already selected
    - fetches profile from IndexedDB via getSatelliteProfile(), retries every 500ms for up to 30s
    - three sections: Profile (from Neon/IndexedDB), Current Position (live 1s update), Orbital Elements (collapsible, hidden by default)
    - position propagated fresh via satellite.js at click time — no delay waiting for animation loop
    - description only shown if present in DB
    - null fields filtered out — no empty rows
    - styled to match Cesium help panel: 225px wide, rgba(0,0,0,0.8), same max-height cutoff, scrollbar hidden
    - added @keyframes spin to index.css, webkit scrollbar hide rule
    - Clock.tsx updated: toUTCString().replace('GMT', 'UTC')
    - notFound state added: shows satellite train explanation after 30s retry exhaustion
    - error state added: shows red message on real IndexedDB failures
    - operator, credit, caption fields added to interface and API response
    - removed backdropFilter blur — caused WebGL canvas tearing behind the panel
    - image displays in 16/9 slot with objectFit cover
    - still needs: replace vertical satellite images in satellite_images table with landscape equivalents to fit 16/9 slot, description verification, styling polish, full unit and integration testing
16. [ ] Satellite count display in the frontend
17. [ ] Terraform — manage Vercel project config/env vars + import existing DigitalOcean Droplet into Terraform state
18. [x] Automation & Observability

    ### Grafana Cloud Loki — Persistent Log Observability
    - signed up for Grafana Cloud free tier (50GB logs, 14 day retention)
    - created satellite-tracker access policy with logs:write scope
    - added LOKI_URL, LOKI_USER, LOKI_TOKEN to Vercel env vars
    - added flush_logs() to satellites-profiles endpoint — collects structured logs via logs.append() throughout request, single batch push to Loki right before each return, 3s timeout, silent fallback on failure
    - added log() helper attaching request_id (uuid4 8-char) to every entry
    - per-operation timing on every external call: blob head check, blob content fetch, neon cache query, fetched satellites, fetched images, blob stored
    - request complete summary at every return with cache_source and total_duration_ms
    - bumped maxDuration for api/satellites.ts 30s → 60s (Hobby plan max)
    - query all logs: {app="satellite-tracker"}
    - filter single request: {app="satellite-tracker"} | json | request_id="a3f9c2b1"

    ### Grafana Synthetics — CDN Warming & Uptime Monitoring
    - replaced Checkly entirely — Grafana free tier covers both monitoring and warming
    - added API check for /api/satellites-profiles across 4 US regions (N. California, Oregon, N. Virginia, Ohio), every 1 hour, 20s timeout, Get request
    - added API check for /api/satellites — same 4 regions, every 1 hour, Get request
    - added HEAD method support to satellites-profiles FastAPI endpoint via @app.api_route if needed later
    - Vercel Blob distributes globally from single store (N. Virginia)
    - 4 locations × 24 runs/day × 31 days × 2 endpoints = 5,952 runs/month
    - worst case user load time ~6s (CDN miss + cold start + blob fetch) — blob kept fresh by 4x/day cron
    - email alerts on failure

19. [ ] pytest coverage for worker and API
20. [ ] Merge satellite-profiles branch to main
    - SSH into Droplet → git pull origin main
    - kubectl apply -f k8s/ (reapply manifests from main)
    - Droplet now tracks main going forward
---

## What stays the same

- CesiumJS globe and all rendering
- TLE fetching via CelesTrak + Vercel Edge Functions (TypeScript)
- IndexedDB caching for TLE data
- Orbital path visualization on click
- Color filters, time controls, camera navigation

---

## Future ideas

- Expand image coverage beyond the initial curated set
- Conjunction alerts using CDM data from Space-Track
- Reentry prediction panel
- Filter satellites by owner / country / purpose
- Add hardcoded descriptions for major constellations — Starlink, OneWeb, GPS, GLONASS, Galileo, Beidou, Iridium, NOAA, Landsat, ISS, Hubble, James Webb
- Switch TLE source from CelesTrak to Space-Track for a unified data pipeline (major overhaul of v1 edge function architecture)
- GitHub Actions CI/CD — builds Docker image, pushes to Docker Hub, deploys to Vercel

---

## Terraform

Manages infrastructure across two providers as code — Vercel and DigitalOcean. Instead of clicking through dashboards to set things up, everything is defined in config files and version controlled. Reproducible and nothing is lost if things need to be rebuilt.

**What it manages:**
- Vercel project settings and environment variables (Space-Track credentials, Neon connection string, etc.)
- DigitalOcean Droplet — creates and configures the $8/month Linux VPS where Docker and Kubernetes run

**File structure:**
```
terraform/
├── main.tf          ← Vercel + DigitalOcean providers, all resources
├── variables.tf     ← input variables (API keys, tokens, connection strings)
└── terraform.tfvars ← actual values, never committed to git
```

**Example:**
```hcl
resource "digitalocean_droplet" "worker" {
  name   = "satellite-worker"
  size   = "s-1vcpu-1gb"
  image  = "ubuntu-22-04-x64"
  region = "nyc1"
}

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
terraform init        # install providers
terraform plan        # preview changes
terraform apply       # apply changes to Vercel + DigitalOcean
terraform destroy     # tear down infrastructure
```

---

## Docker commands

Run all commands from `frontend/worker/`.

**Build, test, and push after any code or data change:**
```bash
docker build -t craigfisherdev/satellite-worker:latest .
docker run --env-file ../.env craigfisherdev/satellite-worker:latest
docker push craigfisherdev/satellite-worker:latest
```

In production Kubernetes pulls the image from Docker Hub and injects secrets automatically — no manual `docker run` needed on the droplet.

---

## Testing plan

### Unit tests (pytest)

- Space-Track client parses SATCAT response correctly
- SATCAT fields map to DB columns correctly
- Worker handles missing or malformed NORAD IDs
- DB write logic upserts without duplicating records

### Integration tests (pytest)

- FastAPI returns 200 with correct shape for the bulk endpoint
- Worker fetches from Space-Track and record appears in DB
- FastAPI reads from DB and returns correct data end to end
- Caching layer returns cached response on second request
- Full flow: worker writes → API reads → correct JSON returned

---