import { Canvas } from '@react-three/fiber'
import {Stats, OrbitControls, Sky} from '@react-three/drei'
import EarthScene from './components/Earth'
import Clock from './components/Clock'
import { useEffect, useState } from 'react'

function App() {

  const [simTime, setSimTime] = useState(new Date())
  const [isPaused, setIsPaused] = useState(false)
  const [speed, setSpeed] = useState(1)  // 1x, 10x, -1x, etc.

  useEffect(() => {
    if (isPaused) return
    
    const interval = setInterval(() => {
      setSimTime(prev => new Date(prev.getTime() + 1000 * speed))
    }, 1000)
    
    return () => clearInterval(interval)
  }, [isPaused, speed])

  return (
    <>
      <Canvas>
        <directionalLight color="white" position={[0, 0, 5]} />
        <EarthScene />
        <OrbitControls />
        <Stats />
        <Sky distance={450000} sunPosition={[0, 1, 0]} inclination={0} azimuth={0.25}/>  
        <Clock time={simTime}/>
      </Canvas>
    </>
  )
}

export default App
