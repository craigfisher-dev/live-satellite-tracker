import * as Cesium from 'cesium'

/**
 * Loads country border outlines from a GeoJSON file and renders them as polylines.
 * Uses Cesium's Primitive API (PolylineCollection) instead of Entity API for better
 * performance - all borders are batched into a single GPU draw call.
 */
export async function loadCountryBorders(viewer: Cesium.Viewer) {
  // Fetch Natural Earth country boundaries (110m = low resolution, smaller file)
  // This GeoJSON contains polygon coordinates for every country
  const response = await fetch('/ne_110m_admin_0_countries.json')
  const data = await response.json()

  // Create ONE collection that will hold ALL polylines
  // This is the key optimization - instead of 500 separate entities,
  // we have one primitive collection that renders in a single draw call
  const polylines = viewer.scene.primitives.add(new Cesium.PolylineCollection())

  // Pre-create the material once instead of creating it for every polyline
  // Material creation has overhead - reusing the same instance is faster
  const borderMaterial = Cesium.Material.fromType('Color', {
    color: Cesium.Color.CYAN,
  })

  // Loop through each country in the GeoJSON
  data.features.forEach((feature: any) => {
    const { type, coordinates } = feature.geometry

    // GeoJSON has two polygon types:
    // - "Polygon": single shape (most countries) -> coordinates = [[[lng,lat], ...]]
    // - "MultiPolygon": multiple shapes (countries with islands) -> coordinates = [[[[lng,lat], ...]]]
    // Normalize both to an array of polygons so we can process them the same way
    const polygons = type === 'Polygon' ? [coordinates] : coordinates

    polygons.forEach((polygon: any) => {
      // Each polygon has rings: ring[0] = outer boundary, ring[1+] = holes (lakes, etc.)
      // We only draw the outer boundary (ring[0]) as a border outline
      const ring = polygon[0]

      // Convert [longitude, latitude] pairs to Cesium's Cartesian3 format
      // The 1000 = altitude in meters (slightly above surface to prevent z-fighting)
      const positions = ring.map(([lng, lat]: number[]) =>
        Cesium.Cartesian3.fromDegrees(lng, lat, 1000)
      )

      // Add this border to the collection
      // Since it's a collection, this doesn't create a new draw call
      polylines.add({
        positions,
        width: 1,
        material: borderMaterial, // Reuse the same material instance
      })
    })
  })
}