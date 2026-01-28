import { useState, useEffect, useRef } from 'react'
import * as THREE from 'three'
import { Html, Line } from '@react-three/drei'

interface EarthProps {
    simTime: Date
}


// Helper function to convert json latitude and longitude to vector 3
export function latLngToVector3(lat: number, lng: number, radius: number): [number, number, number] {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lng + 180) * (Math.PI / 180)
  
  const x = -radius * Math.sin(phi) * Math.cos(theta)
  const y = radius * Math.cos(phi)
  const z = radius * Math.sin(phi) * Math.sin(theta)
  
  return [x, y, z]
}


// Extract line segments from a single polygon
function getPolygonLineSegments(coords: number[][], radius: number): [number, number, number][] {
    const points: [number, number, number][] = []
    
    for (let i = 0; i < coords.length - 1; i++) {
        const [lng1, lat1] = coords[i]
        const [lng2, lat2] = coords[i + 1]
        
        points.push(latLngToVector3(lat1, lng1, radius))
        points.push(latLngToVector3(lat2, lng2, radius))
    }
    
    return points
}

// Extract all line segments from a GeoJSON feature (country)
function getFeatureLineSegments(feature: any, radius: number): [number, number, number][] {
    const { type, coordinates } = feature.geometry
    const polygons = type === 'Polygon' ? [coordinates] : coordinates
    
    const points: [number, number, number][] = []
    
    polygons.forEach((polygon: any) => {
        const coords = polygon[0] // outer ring
        points.push(...getPolygonLineSegments(coords, radius))
    })
    
    return points
}

// Build points array from GeoJSON data
function buildCountryPoints(data: any, radius: number): [number, number, number][] {
    const allPoints: [number, number, number][] = []
    
    data.features.forEach((feature: any) => {
        allPoints.push(...getFeatureLineSegments(feature, radius))
    })
    
    console.log('Total line segments:', allPoints.length / 2)
    
    return allPoints
}



function ThreeScene({simTime}: EarthProps) {
    const [linePoints, setLinePoints] = useState<[number, number, number][] | null>(null)

    const earthRotation = 23.4 * Math.PI/180
    const hoursElapsed = simTime.getUTCHours() + simTime.getUTCMinutes() / 60 + simTime.getUTCSeconds() / 3600
    const dayFraction = hoursElapsed / 24
    const rotationY = (dayFraction - 0.75) * 2 * Math.PI

    const earthRef = useRef<THREE.Group>(null!)

    useEffect(() => {
        fetch('/ne_110m_admin_0_countries.json')
        .then(response => response.json())
        .then(data => {
            const points = buildCountryPoints(data, 1)
            setLinePoints(points)
        })
    }, [])

    return (
        <>
            {/* World reference axis */}
            {/* <Line points={[[0,0,0], [0,3,0]]} color="yellow" lineWidth={2} /> */}
            
            <group rotation={[earthRotation, 0, 0]}> {/* fixed tilt */}
                {/* Earth's rotation axis (toward Polaris (North star)) */}
                <Line points={[[0,-1.8,0], [0,1.8,0]]} color="red" lineWidth={2} />
                <Html position={[0, 2, 0]}><span style={{color: 'red', fontSize: '12px'}}>Polaris</span></Html>
                <Html position={[0, -2, 0]}><span style={{color: 'red', fontSize: '12px'}}>South</span></Html>
                
                <group ref={earthRef} rotation={[0, rotationY, 0]}> {/* daily spin */}
                    <mesh>
                        <sphereGeometry args={[1, 32, 32]} />
                        <meshStandardMaterial color="blue" />
                    </mesh>
                    
                    {linePoints && (
                        <Line
                            points={linePoints}
                            segments
                            color="cyan"
                            lineWidth={1}
                        />
                    )}
                </group>
            </group>
        </>
    )
}

export default ThreeScene