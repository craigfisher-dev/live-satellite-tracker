import { Canvas } from '@react-three/fiber'
import { Stats, OrbitControls, Line } from '@react-three/drei'
import { useState, useEffect } from 'react'


// Helper function to convert json latitude and longitude to vector 3
function latLngToVector3(lat: number, lng: number, radius: number): [number, number, number] {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lng + 180) * (Math.PI / 180)
  
  const x = -radius * Math.sin(phi) * Math.cos(theta)
  const y = radius * Math.cos(phi)
  const z = radius * Math.sin(phi) * Math.sin(theta)
  
  return [x, y, z]
}

// Draws Country border lines
function CountryLine({ coordinates, radius }: { coordinates: number[][], radius: number }) {
  // Convert each [lng, lat] pair to [x, y, z]
  const points = coordinates.map(([lng, lat]) => latLngToVector3(lat, lng, radius))
  
  console.log('Drawing country with', points.length, 'points')
  
  return (
    <Line
      points={points}
      color="cyan"
      lineWidth={1}
    />
  )
}


// Takes a GeoJSON feature and returns CountryLine component(s)
function renderCountryLines(feature: any) {
  const { type, coordinates } = feature.geometry
  const name = feature.properties.NAME

  // Polygon: single continuous border
  // Structure: coordinates[0] = array of [lng, lat] points
  if (type === 'Polygon') {
    return (
      <CountryLine
        key={name}
        coordinates={coordinates[0]}
        radius={1.01}
      />
    )
  }

  // MultiPolygon: country with multiple disconnected parts (like islands or exclaves)
  // Structure: coordinates = array of polygons, each polygon[0] = array of points
  if (type === 'MultiPolygon') {
    return coordinates.map((polygon: any, j: number) => (
      <CountryLine
        key={`${name}-${j}`}
        coordinates={polygon[0]}
        radius={1.01}
      />
    ))
  }

  // Unknown geometry type - skip it
  return null
}


function ThreeScene() {
    const [countries, setCountries] = useState<any>(null)

    useEffect(() => {
        fetch('/ne_110m_admin_0_countries.json')
        .then(response => response.json())
        .then(data => {
            console.log('Loaded countries:', data.features.length)
            setCountries(data)
        })
    }, [])


    return (
        <Canvas>
        <mesh>
            <sphereGeometry args={[1, 16, 16]} />
            <meshBasicMaterial color="blue" />
        </mesh>
        <directionalLight color="white" position={[0, 0, 5]} />
        
        {countries && countries.features.map(renderCountryLines)}

        <OrbitControls />
        <Stats />
        </Canvas>
    )
}

export default ThreeScene