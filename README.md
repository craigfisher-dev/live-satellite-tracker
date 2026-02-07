# Live Satellite Tracker

**Live App**: [https://live-satellite-tracker.vercel.app](https://live-satellite-tracker.vercel.app)

Real-time 3D visualization of 14,000+ active satellites orbiting Earth. Click any satellite to view its predicted orbital trajectory. Built with React, TypeScript, and CesiumJS, deployed on Vercel.

## Features

- Real-time tracking of 14,000+ satellites on interactive 3D globe
- Predicted orbital trajectory visualization on satellite selection
- Filter satellites by network (Starlink, OneWeb, GPS, etc.) or altitude (LEO, MEO, GEO)
- Time controls: pause, speed up (1000x), or reverse simulation time
- Day/night Earth shading based on sun position
- Persistent browser caching with 24-hour refresh cycle

## How It Works

Satellites appear as colored dots on a 3D Earth globe. Click any satellite to display its predicted orbital path for one complete orbit. The color coding changes based on the active filter - either by satellite network/constellation or by orbital altitude. Time can be sped up to watch satellites move faster, paused to examine positions, or reversed to view past orbital states.

<img width="7680" height="4320" alt="live-satellite-tracker vercel app_(High Res) (1)" src="https://github.com/user-attachments/assets/a45a5137-0491-4e1f-afbe-aeb14403189a" />

*Screenshot showing real-time satellite tracking with orbital path visualization*

## Tech Stack

- **Frontend**: React 19, TypeScript
- **Build Tool**: Vite
- **3D Engine**: CesiumJS (globe rendering, coordinate systems)
- **Styling**: Tailwind CSS
- **Backend**: Vercel Edge Functions (serverless API)
- **Database**: IndexedDB (browser storage)
- **Hosting**: Vercel
- **Data Source**: CelesTrak (TLE orbital data)

## Data Processing

- Fetches Two-Line Element (TLE) data from CelesTrak API for all active satellites
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
