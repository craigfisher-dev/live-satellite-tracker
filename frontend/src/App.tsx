import { Ion, JulianDate } from 'cesium'
import { Viewer, Globe, Sun, Clock as CesiumClock } from 'resium'
import Clock from './components/Clock'
import { useEffect, useState } from 'react'
import 'cesium/Build/Cesium/Widgets/widgets.css'

Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_TOKEN

function App() {
  const [simTime, setSimTime] = useState(new Date())
  const [isPaused, setIsPaused] = useState(false)
  const [simSpeed, setSimSpeed] = useState(1)

  const fps = 30
  const milliseconds = 1000 / fps

  useEffect(() => {
    if (isPaused) return

    let lastRealTime = Date.now()
    
    const interval = setInterval(() => {
      const now = Date.now()
      const elapsed = now - lastRealTime
      lastRealTime = now

      setSimTime(prev => new Date(prev.getTime() + elapsed * simSpeed))
    }, milliseconds)
    
    return () => clearInterval(interval)
  }, [isPaused, simSpeed])

  // Convert JS Date to Cesium JulianDate
  const julianDate = JulianDate.fromDate(simTime)

  return (
    <>
      <Viewer 
        full 
        timeline={false}  // hide Cesium's timeline
        animation={false} // hide Cesium's clock widget
      >
        <Globe enableLighting />  {/* automatic day/night */}
        <CesiumClock currentTime={julianDate} shouldAnimate={false} />
      </Viewer>

      {/* Your custom clock UI */}
      <div style={{ 
        position: 'fixed', 
        bottom: '20px', 
        right: '50px',
        zIndex: 1000
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
    </>
  )
}

export default App