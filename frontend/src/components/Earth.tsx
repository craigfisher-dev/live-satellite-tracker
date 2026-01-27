import { useState, useEffect, useRef } from 'react'
import { useFrame, type ThreeElements } from '@react-three/fiber'
import * as THREE from 'three'



// Helper function to convert json latitude and longitude to vector 3
function latLngToVector3(lat: number, lng: number, radius: number): [number, number, number] {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lng + 180) * (Math.PI / 180)
  
  const x = -radius * Math.sin(phi) * Math.cos(theta)
  const y = radius * Math.cos(phi)
  const z = radius * Math.sin(phi) * Math.sin(theta)
  
  return [x, y, z]
}


// Extract line segments from a single polygon
function getPolygonLineSegments(coords: number[][], radius: number): number[] {
    const points: number[] = []
    
    for (let i = 0; i < coords.length - 1; i++) {
        const [lng1, lat1] = coords[i]
        const [lng2, lat2] = coords[i + 1]
        
        const p1 = latLngToVector3(lat1, lng1, radius)
        const p2 = latLngToVector3(lat2, lng2, radius)
        
        points.push(...p1, ...p2)
    }
    
    return points
}

// Extract all line segments from a GeoJSON feature (country)
function getFeatureLineSegments(feature: any, radius: number): number[] {
    const { type, coordinates } = feature.geometry
    const polygons = type === 'Polygon' ? [coordinates] : coordinates
    
    const points: number[] = []
    
    polygons.forEach((polygon: any) => {
        const coords = polygon[0] // outer ring
        points.push(...getPolygonLineSegments(coords, radius))
    })
    
    return points
}

// Build geometry from GeoJSON data
function buildCountryGeometry(data: any, radius: number): THREE.BufferGeometry {
    const allPoints: number[] = []
    
    data.features.forEach((feature: any) => {
        allPoints.push(...getFeatureLineSegments(feature, radius))
    })
    
    console.log('Total line segments:', allPoints.length / 6)
    
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(allPoints, 3)
    )
    
    return geometry
}



function ThreeScene(_props: ThreeElements['mesh']) {
    const [lineGeometry, setLineGeometry] = useState<THREE.BufferGeometry | null>(null)

    const earthRef = useRef<THREE.Group>(null!)

    useEffect(() => {
        fetch('/ne_110m_admin_0_countries.json')
        .then(response => response.json())
        .then(data => {
            const geometry = buildCountryGeometry(data, 1.01)
            setLineGeometry(geometry)
        })
    }, [])


    // Spin Globe  - Speed is controlled by delta/8
    useFrame((_state, delta) => (earthRef.current.rotation.y -= delta/25))

    return (
      <>
        <group ref={earthRef}>
          <mesh>
              <sphereGeometry args={[1, 32, 32]} />
              <meshStandardMaterial color="blue" />
          </mesh>
          
          {lineGeometry && (
                <lineSegments geometry={lineGeometry}>
                    <lineBasicMaterial color="cyan" />
                </lineSegments>
          )}
        </group>
      </>
    )
}

export default ThreeScene