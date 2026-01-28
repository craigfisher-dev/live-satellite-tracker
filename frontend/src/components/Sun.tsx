import * as Astronomy from 'astronomy-engine'

interface SunProps {
  simTime: Date
}

function Sun({ simTime }: SunProps) {
  // Create observer (0,0,0 for geocentric)
  const observer = new Astronomy.Observer(0, 0, 0)
  
  // Get sun's equatorial coordinates
  const sunEquator = Astronomy.Equator(Astronomy.Body.Sun, simTime, observer, false, true)
  
  // Convert declination to radians
  const declinationRad = sunEquator.dec * (Math.PI / 180)
  
  // Sun position
  const distance = 50
  const y = Math.sin(declinationRad) * distance
  const z = Math.cos(declinationRad) * distance

  return (
    <group>
      <directionalLight position={[0, y, z]} intensity={1.5} />
      <mesh position={[0, y, z]}>
        <sphereGeometry args={[2, 16, 16]} />
        <meshBasicMaterial color="#FDB813" />
      </mesh>
    </group>
  )
}

export default Sun