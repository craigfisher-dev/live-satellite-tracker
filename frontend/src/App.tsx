import EarthScene from './components/Earth'
import { Canvas } from '@react-three/fiber'
import {Stats, OrbitControls} from '@react-three/drei'

function App() {

  return (
    <>
      <Canvas>
        <EarthScene />
        <OrbitControls />
        <Stats />
      </Canvas>
    </>
  )
}

export default App
