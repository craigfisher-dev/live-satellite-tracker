# Live Satellite Tracker

**Live App**: [https://live-satellite-tracker.vercel.app](https://live-satellite-tracker.vercel.app)

Real-time 3D visualization of 14,000+ active satellites orbiting Earth. Click any satellite to view its predicted orbital trajectory. Built with React, TypeScript, and CesiumJS, deployed on Vercel.

## Features

- Real-time tracking of 14,000+ satellites on interactive 3D globe
- Click any satellite to view its predicted orbital path
- Control simulation time: pause, play, or adjust speed (-1000x to +1000x)
- Realistic Earth lighting and shading with day/night cycles
- Full Earth map imagery from OpenStreetMap and MapTiler
- Complete 3D camera navigation with pan, rotate, and zoom
- Optimized performance with IndexedDB and Vercel Edge caching
- Toggle between network-based or altitude-based color coding
- Glowing neon country borders rendered from GeoJSON data

## How It Works

Satellites appear as colored dots on a 3D Earth globe. Click any satellite to view its predicted orbital trajectory for one complete revolution ahead. Toggle between two color modes: network mode colors satellites by constellation (Starlink, OneWeb, GPS, etc.), while altitude mode colors them by orbital height from Earth (LEO, MEO, GEO). Time starts at real-time (1x speed) and can be paused, reversed, or accelerated up to 1000x in either direction to watch orbital motion.

<img width="7680" height="4320" alt="live-satellite-tracker vercel app_(High Res) (1)" src="https://github.com/user-attachments/assets/a45a5137-0491-4e1f-afbe-aeb14403189a" />

*Screenshot showing OneWeb satellite with predicted orbital path visualization*

## Tech Stack

**Frontend**
- React, TypeScript, Vite
- CesiumJS (3D globe rendering)
- satellite.js (SGP4 orbital propagation)
- Tailwind CSS, inline CSS

**Backend**
- Vercel Edge Functions (TypeScript serverless API)

**Data Storage & Caching**
- IndexedDB (browser database)
- Vercel CDN (edge cache)

**Data Sources**
- CelesTrak (TLE orbital data)
- Natural Earth (GeoJSON country borders)
- MapTiler + OpenStreetMap (map imagery)

## Data Processing

- Fetches TLE orbital data from CelesTrak API in OMM JSON format for all active satellites
- Vercel Edge Function trims payload by 60% (removes unnecessary fields)
- Dual-layer caching: Vercel CDN (24hr) + IndexedDB (24hr browser cache)
- SGP4 orbital propagation algorithm calculates real-time positions
- Coordinate conversion from ECI (Earth-Centered Inertial) to ECEF (Earth-Centered Earth-Fixed) using GMST
- Kepler's Third Law calculations derive altitude from mean motion
- Orbital prediction samples 90 points across one complete revolution
- Performance optimized: 14,000+ satellites rendered in 2 GPU draw calls using Cesium primitive collections

## Controls

**Top-Right Buttons**: Home button (reset camera view) • ? button (open/close controls guide)  
**Camera**: Left-click drag (pan) • Middle-click drag (rotate) • Scroll (zoom)  
**Satellites**: Click satellite (show predicted orbit) • Click empty space (clear selection)  
**Filters**: Arrow buttons (switch Network ↔ Altitude)  
**Time**: Play/Pause • Fast forward/rewind • Reset to current time
