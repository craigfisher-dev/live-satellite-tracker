import { useEffect, useRef, useState } from 'react'
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'

import Clock from './components/Clock'
import { loadCountryBorders } from './utils/CountryBorders'
import { Satellite } from './utils/SatelliteTracker'
import Legend from './components/Legend'
import { Analytics } from "@vercel/analytics/react"
import { SpeedInsights } from '@vercel/speed-insights/react'
import { setupHelpPanel } from './utils/HelpPanel'


function App() {

  // containerRef points to the div where Cesium will render the 3D globe
  const containerRef = useRef<HTMLDivElement>(null)
  
  // viewerRef holds the Cesium.Viewer instance so we can access it across renders
  // without triggering re-renders (refs don't cause re-renders when changed)
  const viewerRef = useRef<Cesium.Viewer | null>(null)

  // Simulation time - this is the "virtual" time shown on the globe
  // Can be sped up, slowed down, or paused independently of real time
  const [simTime, setSimTime] = useState(new Date())
  const [isPaused, setIsPaused] = useState(false)
  const [simSpeed, setSimSpeed] = useState(1) // 1 = real-time, 60 = 1 min/sec, etc.

  // Target 60 frames per second for the simulation loop
  const fps = 60
  const milliseconds = 1000 / fps

  // Initialize Cesium viewer once when component mounts
  useEffect(() => {
    // Guard: don't init if container doesn't exist or viewer already created
    if (!containerRef.current || viewerRef.current) return

    // Create the Cesium viewer with most UI widgets disabled
    // We're building our own custom UI instead
    const viewer = new Cesium.Viewer(containerRef.current, {
      timeline: false,           // Hide the timeline bar at bottom
      animation: false,          // Hide the clock/animation widget
      baseLayerPicker: false,    // Hide the imagery layer picker
      geocoder: false,           // Hide the search box
      homeButton: true,         // shows the home button
      sceneModePicker: false,    // Hide 2D/3D/Columbus view picker
      navigationHelpButton: true, // Hide the ? help button
      baseLayer: false,          // Don't load default Bing imagery
      requestRenderMode: true,   // Only re-render when something changes (saves GPU)
      fullscreenButton: false,    // Disables the full screen button
    })

    // Show FPS counter in the top-left
    // viewer.scene.debugShowFramesPerSecond = true

    // Setup the custom help panel
    setupHelpPanel(viewer)

    // Loads in .env TomTom Key
    // TomTom provides 50K free tiles/day with English labels and a usage dashboard
    // API key is stored in .env as VITE_MY_TOM_TOM_KEY (VITE_ prefix required for client access)
    const TOMTOM_KEY = import.meta.env.VITE_MY_TOM_TOM_KEY

    const tomtom = new Cesium.UrlTemplateImageryProvider({
      url: `https://api.tomtom.com/map/1/tile/basic/main/{z}/{x}/{y}.png?key=${TOMTOM_KEY}&language=en-GB`,
      credit: '© TomTom',
    })

    // Suppress tile error logs so API key doesn't leak to console
    tomtom.errorEvent.addEventListener((err: any) => {
      const safeMessage = String(err).replace(/key=[^&]+/, 'key=***')
      console.warn('Tile load failed:', safeMessage)
    })

    viewer.imageryLayers.addImageryProvider(tomtom)

    // Enable day/night shading based on sun position
    // The dark side of Earth will actually look dark
    viewer.scene.globe.enableLighting = true

    // Store viewer reference for use in other effects
    viewerRef.current = viewer

    // Load country border outlines on top of the map
    loadCountryBorders(viewer)

    // Load satellites
    Satellite(viewer)

    // Cleanup function - runs when component unmounts
    // Important: Cesium uses lots of GPU resources, must clean up properly
    return () => {
      viewer.destroy()
      viewerRef.current = null
    }
  }, []) // Empty deps = run once on mount

  // Sync our React simTime state to Cesium's internal clock
  // This makes the sun position and lighting match our simulation time
  useEffect(() => {
    if (!viewerRef.current) return
    // Convert JavaScript Date to Cesium's JulianDate format
    viewerRef.current.clock.currentTime = Cesium.JulianDate.fromDate(simTime)
  }, [simTime])

  // Simulation time loop - advances simTime based on speed multiplier
  // This runs independently of Cesium's rendering
  useEffect(() => {
    // Don't run the loop if paused
    if (isPaused) return

    // Track real elapsed time between intervals
    let lastRealTime = Date.now()

    const interval = setInterval(() => {
      const now = Date.now()
      const elapsed = now - lastRealTime // Real milliseconds since last tick
      lastRealTime = now

      // Advance simulation time by: real elapsed time × speed multiplier
      // Example: if 100ms passed and speed is 60, advance by 6000ms (6 seconds)
      setSimTime(prev => new Date(prev.getTime() + elapsed * simSpeed))
    }, milliseconds)

    // Cleanup: clear interval when paused, speed changes, or unmount
    return () => clearInterval(interval)
  }, [isPaused, simSpeed])

  return (
    <>
      {/* This div is where Cesium renders the 3D globe */}
      <div ref={containerRef} style={{ width: '100%', height: '100vh' }} />

      {/* Legend UI */}
      <div style={{
        position: 'fixed',
        top: '20px',
        left: '20px',
        zIndex: 1000
      }}>
        <Legend />
      </div>
      {/* Clock UI - positioned fixed so it floats over the globe */}
      <div style={{
        position: 'fixed',
        bottom: '0px',
        right: '0px',
        zIndex: 1000 // Above Cesium's canvas
      }}>
        <Clock
          simTime={simTime}
          isPaused={isPaused}
          simSpeed={simSpeed}
          setSimTime={setSimTime}
          setIsPaused={setIsPaused}
          setSimSpeed={setSimSpeed}
        />
      </div>

      {/* Vercel Analytics */}
      <Analytics />
      {/* Vercel Speed Insights */}
      <SpeedInsights/>
    </>
  )
}

export default App