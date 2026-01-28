import { useEffect, useState } from 'react'
import { Cartesian3, Color } from 'cesium'
import { Entity, PolylineGraphics } from 'resium'

function CountryBorders() {
  // Store array of border lines (each line is an array of 3D points)
  const [borders, setBorders] = useState<Cartesian3[][]>([])

  useEffect(() => {
    // Load the GeoJSON file
    fetch('/ne_110m_admin_0_countries.json')
      .then(res => res.json())
      .then(data => {
        const lines: Cartesian3[][] = []
        
        // Loop through each country
        data.features.forEach((feature: any) => {
          const { type, coordinates } = feature.geometry
          
          // GeoJSON can be 'Polygon' (one shape) or 'MultiPolygon' (multiple shapes)
          // Normalize to array of polygons
          const polygons = type === 'Polygon' ? [coordinates] : coordinates
          
          // Loop through each polygon (some countries have islands, etc)
          polygons.forEach((polygon: any) => {
            // Get outer ring (polygon[0] is outer boundary, polygon[1+] are holes)
            const ring = polygon[0]
            
            // Convert [lng, lat] pairs to Cesium 3D positions
            // 1000 = altitude in meters (slight offset above globe surface)
            const positions = ring.map(([lng, lat]: number[]) => 
              Cartesian3.fromDegrees(lng, lat, 1000)
            )
            
            lines.push(positions)
          })
        })
        
        setBorders(lines)
        console.log('Loaded', lines.length, 'border lines')
      })
  }, []) // Empty deps = run once on mount

  return (
    <>
      {/* Render each border as a cyan line */}
      {borders.map((positions, i) => (
        <Entity key={i}>
          <PolylineGraphics
            positions={positions}  // Array of 3D points
            width={1}              // Line thickness in pixels
            material={Color.CYAN}  // Line color
          />
        </Entity>
      ))}
    </>
  )
}

export default CountryBorders