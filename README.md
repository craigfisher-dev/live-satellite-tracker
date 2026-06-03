# Live Satellite Tracker

**Live App**: https://live-satellite-tracker.com/

Real-time 3D visualization of 15,000+ active satellites orbiting Earth. Click any satellite to view its predicted orbital trajectory and full profile. Built with React, TypeScript, and CesiumJS, deployed on Vercel.

## Features

- Real-time tracking of 15,000+ satellites on interactive 3D globe
- Click any satellite to view its predicted orbital path and a full profile with name, country, purpose, launch date, launch site, size, and photo
- Profile data updated daily from Space-Track.org and the Union of Concerned Scientists satellite database, with images sourced from NASA and Wikimedia Commons
- Control simulation time: pause, play, or adjust speed (-1000x to +1000x)
- Realistic Earth lighting and shading with day/night cycles
- Full Earth map imagery from OpenStreetMap and CARTO
- Complete 3D camera navigation with pan, rotate, and zoom
- Toggle between network-based or altitude-based color coding
- Glowing neon country borders rendered from GeoJSON data
- Postgres database (Neon) storing profiles for 68,000+ satellites
- Python worker containerized with Docker and scheduled daily via Kubernetes on a DigitalOcean VPS to fetch and merge data
- Satellite profiles served from a custom-built FastAPI REST API
- Brotli compression across all API endpoints for fast and reliable CDN caching
- Optimized performance with IndexedDB, Vercel Blob, and Vercel Edge CDN
- Custom k6 scripted checks via Grafana Synthetics for uptime monitoring and CDN cache warming across US regions

## How It Works

Satellites appear as colored dots on a 3D Earth globe. Click any satellite to view its predicted orbital trajectory for one full revolution. A profile panel opens alongside showing the satellite's name, country, purpose, launch details, and photo. Toggle between two color modes: network mode colors satellites by constellation (Starlink, OneWeb, GPS, etc.), while altitude mode colors them by orbital height from Earth (LEO, MEO, GEO, HEO). Time starts at real-time (1x speed) and can be paused, reversed, or accelerated up to 1000x in either direction to watch orbital motion.

<img alt="live-satellite-tracker com_(High Res)" src="https://github.com/user-attachments/assets/bd105e5c-af45-4a70-931e-6303f5730da3" />


*Screenshot showing OneWeb satellite profile panel alongside its predicted orbital path*

## Tech Stack

**Frontend**
- React, TypeScript, Vite
- CesiumJS (3D globe rendering)
- satellite.js (SGP4 orbital propagation)
- Tailwind CSS, inline CSS

**Backend**
- Vercel Serverless Function (TypeScript, TLE data)
- FastAPI (Python, satellite profiles)
- Python worker (fetches and merges satellite data into Neon daily)
- Docker (Python worker containerization)
- Kubernetes (K3s) on DigitalOcean VPS
- SQLAlchemy (database schema and batch upserts into Neon)

**Data Storage & Caching**
- Neon (PostgreSQL, satellite profiles, images, and response cache)
- Vercel Blob (compressed API response cache)
- IndexedDB (browser database)
- Vercel CDN (edge cache)

**Automation & Observability**
- Grafana Cloud Loki (log observability)
- Grafana Synthetics with k6 (uptime monitoring, CDN cache warming)

**Data Sources**
- CelesTrak (TLE orbital data)
- Space-Track.org (satellite catalog)
- Union of Concerned Scientists (operator, purpose, launch details)
- NASA and Wikimedia Commons (satellite images)
- Natural Earth (GeoJSON country borders)
- OpenStreetMap and CARTO (map imagery)

## Data Processing

**Data Fetching & Caching**
- A TypeScript Vercel serverless function serves TLE data from a Blob cache, fetching fresh from CelesTrak when expired, trimming the OMM JSON ~70% (keeping only fields required for satellite.js propagation), applying Brotli compression, and storing it back in Blob cache
- A Python FastAPI serverless function serves satellite profiles, walking each cache layer and rebuilding from Neon (Satellite catalog merged with satellite and constellation images) when stale, then applying Brotli compression
- When satellite profiles are missing or expired in Blob cache, the FastAPI rebuilds it from the Neon response cache so the next request hits the fast path
- Profiles cover ~34,000 in-orbit objects (filtered from the 68,000+ catalog by dropping decayed entries), including unnamed rocket bodies and debris
- The frontend stores both TLE and profile data in IndexedDB after fetching, with profiles loading in the background after the globe renders (~490ms) so the UI isn't blocked
- Cache layers, fastest to slowest (Fallback hierarchy)
  - IndexedDB (24hr browser cache)
  - Vercel Edge CDN (24hr)
  - Vercel Blob (persistent cache, 24hr)
  - Neon response_cache table, pre-built JSON (profiles only)
  - Full rebuild from Neon source tables (profiles only)
- On network failure, serves stale IndexedDB data if a cache exists

**DigitalOcean Data Pipeline**
- A Dockerized Python worker runs daily at 5am UTC via a Kubernetes CronJob (K3s) on a DigitalOcean Basic Droplet (1 vCPU, 2GB RAM, 35GB SSD), with the image pulled from Docker Hub
- K3s installed with Traefik and ServiceLB disabled, saving ~100MB RAM on the 2GB Droplet since the worker only makes outbound requests and needs neither
- Manifests deploy into a dedicated satellite-tracker namespace, with environment config in a ConfigMap and credentials in a separate Secrets file
- The pipeline runs across three Python scripts
  - `spacetrack.py` logs into Space-Track.org, fetches the full SATCAT in a single batch request, and logs out
  - `worker.py` loads the UCS satellite database CSV and merges it with the SATCAT by NORAD ID, attaching operator, purpose, and description to each record
  - `db.py` defines the Neon PostgreSQL schema and batch upserts all 68,000+ merged records in a single SQLAlchemy operation

**Orbital Calculations**
- SGP4 orbital propagation algorithm calculates real-time satellite positions at 60 FPS
- Coordinate conversion: ECI (Earth-Centered Inertial) → ECEF (Earth-Centered Earth-Fixed) using GMST (Greenwich Mean Sidereal Time)
- Orbital paths displayed relative to rotating Earth create varying visual patterns:
  - **LEO (Low Earth Orbit)**: Complete one orbit in ~90 minutes, appearing as single clean loops
  - **MEO (Medium Earth Orbit)**: 2-24 hour orbits create multiple visual wraps as Earth rotates
  - **GEO (Geostationary)**: Complete one orbit in 24 hours (matching Earth's rotation), appearing nearly stationary
  - **HEO (Highly Elliptical)**: Elliptical orbits create complex wrapped patterns
- Satellite altitude derived from orbital speed using Kepler's Third Law
- Each orbital path uses 90 calculated future positions

**Rendering Optimization**
- Entire scene rendered in just 3 GPU draw calls using Cesium primitive collections:
  - All 15,000+ satellite points (PointPrimitiveCollection)
  - Satellite orbital paths (PolylineCollection)
  - Country borders (PolylineCollection)
- Reusable Cartesian3 scratch variables minimize garbage collection
- Request render mode: Cesium only re-renders when scene changes
- Dynamic recoloring on filter change without recreating primitives

**Geospatial Processing**
- Natural Earth GeoJSON country borders parsed into polyline collections
- Single material instance reused across all country borders for performance
- CARTO provides OpenStreetMap imagery via Cesium UrlTemplateImageryProvider
- Country border polylines rendered 1000m above surface to prevent z-fighting

**Automation & Observability**
- Vercel cron jobs hit both API endpoints on each deployment, providing initial CDN cache warmup after deployments wipe the cache
- Grafana Synthetics runs custom k6 scripted checks on both endpoints every hour across 4 US regions for ongoing CDN warming and uptime monitoring
- k6 scripted checks used over API Endpoint checks because API Endpoint checks force cache busting via a random query parameter, defeating CDN warming
- Email alerts on check failure
- Grafana Cloud Loki collects structured logs from the profiles endpoint on the free tier (50GB logs, 14 day retention)
- Logs are collected throughout each request and pushed to Loki in a single batch right before returning, with a 3s timeout and silent fallback so logging never crashes the endpoint
- The profiles endpoint assigns a unique ID to each API call, grouping all log entries from that request together so the full journey of any single call can be traced through Loki

## Controls

**Top-Right Buttons**
- Home: Reset camera to default view
- ?: Toggle controls guide visibility

**Camera Navigation**
- Left-click + drag: Pan across globe
- Middle-click + drag: Rotate camera view
- Scroll wheel: Zoom in/out

**Satellite Interaction**
- Click satellite: Open profile panel and display predicted orbital path
- Click empty space: Clear selection and close panel

**Color Filters**
- Arrow buttons: Toggle between Network mode (color by constellation) and Altitude mode (color by orbital height)

**Time Controls**
- Play/Pause: Control simulation
- Fast forward/rewind: Adjust speed (-1000x to +1000x)
- Reset: Return to current real-time
