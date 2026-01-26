import EarthScene from './components/Earth'
import { Canvas } from '@react-three/fiber'
import {Stats, OrbitControls, Sky} from '@react-three/drei'

function App() {

  return (
    <>
      <Canvas>
        <directionalLight color="white" position={[0, 0, 5]} />
        <EarthScene />
        <OrbitControls />
        <Stats />
        <Sky distance={450000} sunPosition={[0, 1, 0]} inclination={0} azimuth={0.25}/>  
      </Canvas>
    </>
  )
}

export default App
