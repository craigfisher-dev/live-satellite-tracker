import * as Cesium from 'cesium'

export async function loadCountryBorders(viewer: Cesium.Viewer) {
  const response = await fetch('/ne_110m_admin_0_countries.json')
  const data = await response.json()

  // Draw borders as simple polylines (much faster than polygons)
  data.features.forEach((feature: any) => {
    const { type, coordinates } = feature.geometry
    const polygons = type === 'Polygon' ? [coordinates] : coordinates

    polygons.forEach((polygon: any) => {
      const ring = polygon[0]
      const positions = ring.map(([lng, lat]: number[]) =>
        Cesium.Cartesian3.fromDegrees(lng, lat, 1000)
      )

      viewer.entities.add({
        polyline: {
          positions,
          width: 1,
          material: Cesium.Color.CYAN,
        },
      })
    })
  })
}