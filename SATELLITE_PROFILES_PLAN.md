# Satellite Profiles — Feature Branch Plan

Branch: `satellite-profiles`

Adds a satellite info panel to the existing tracker. Click any satellite and a panel slides out showing real metadata — name, country, purpose, description, launch date, launch site, object type, size, and a photo where available.

Nothing in the existing tracker changes. This is purely additive.

---

## What's being added

- **Satellite info panel** — TSX React component that renders when you click a satellite
- **FastAPI backend** — Python API on Vercel that serves enriched satellite data
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
| FastAPI | Python REST API serving enriched satellite data on Vercel serverless. |
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

No public database has descriptions for all 14,000+ objects. The panel only shows a description when one is available — no fallback text for unknown satellites.

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

## Satellite images

Photos are manually curated and stored in a separate `satellite_images` table in Neon. The worker never touches this table — images are managed independently.

**Coverage strategy:**
- ISS, Hubble, James Webb, Chandra, and other notable individual satellites — unique photo each
- Major constellations (Starlink, OneWeb, GPS, GLONASS, Galileo, Beidou, Iridium, etc.) — one shared photo per constellation, reused for every satellite in that program
- NASA and ESA missions — photo where one exists
- Unknown payloads, rocket bodies, debris — no image, section hidden in the panel

**How it works:**
- Images are sourced manually from NASA, ESA, and Wikimedia Commons (open license)
- Only the image URL is stored — images load directly from the source, nothing stored on Vercel or Neon
- New images can be added anytime by inserting a row in Neon — no redeployment needed
- For constellations, one photo is reused across all satellites in that program

**To-do:** find and insert image URLs for the main satellites and constellations before building the panel.

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
│   │   └── satellites-profiles.py         ← NEW: FastAPI bulk endpoint on Vercel
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
    last_updated  TIMESTAMP
);

CREATE TABLE satellite_images (
    norad_id      INTEGER PRIMARY KEY,  -- matches satellites.norad_id
    image_url     TEXT NOT NULL,        -- full URL, images served directly from source
    credit        TEXT                  -- e.g. 'NASA', 'ESA', 'Wikimedia Commons'
);
```

FastAPI joins the two tables on `norad_id` when serving profiles. Worker never touches `satellite_images`. Images are added manually via the Neon console.

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
2. [] Build Python worker — Space-Track client, SATCAT fetch, UCS CSV reader, write to DB
3. [] Dockerize the worker
4. [] Push Docker image to Docker Hub
5. [] Write Kubernetes CronJob manifests, test locally with Minikube
6. [] Provision DigitalOcean Droplet via Terraform
7. [] Install K3s on the Droplet
8. [] Deploy Kubernetes CronJob to Droplet — worker runs in production
9. [] Populate `satellite_images` table — find and insert URLs for main satellites and constellations
10. [] FastAPI endpoint on Vercel
11. [] `SatelliteInfoPanel.tsx` in the frontend
12. [] Satellite count display in the frontend
13. [] Terraform for Vercel config
14. [] GitHub Actions CI/CD — builds Docker image, pushes to Docker Hub, deploys to Vercel
15. [] pytest coverage for worker and API

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
- Switch TLE source from CelesTrak to Space-Track
- Reentry prediction panel
- Filter satellites by owner / country / purpose

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
- [ ] Figure out rate limiting in the worker (retry logic, random minute offsets for TLE fetches)