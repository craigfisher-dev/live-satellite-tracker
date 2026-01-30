import * as Cesium from 'cesium'
import * as satellite from 'satellite.js'

export async function Satellite(viewer: Cesium.Viewer) {

  // Fetch all stations

  // Use this once caching is set up to not get rate limited by there API

  const res = await fetch('/stations.json')
  const ommData = await res.json()

  // Create collections (one draw call each)
  const pointCollection = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection())

  // Store satrecs, points, and labels together
  const satellites: { satrec: satellite.SatRec, point: Cesium.PointPrimitive }[] = []

  // Create all points and labels once
  for (const omm of ommData) {

    // Use for later when adding info panel
    // const satelliteName = omm["OBJECT_NAME"]

    // Satellite record
    const satrec = satellite.json2satrec(omm)

    const point = pointCollection.add({
      position: Cesium.Cartesian3.ZERO,
      pixelSize: 6,
      color: Cesium.Color.RED
    })

    satellites.push({ satrec, point })
  }

  // 5. Animation loop
  function updatePositions() {
    // Gets the current sim time from Cesium's clock which is synced to Clock Component
    const jsDate = Cesium.JulianDate.toDate(viewer.clock.currentTime)

    // Calculate GMST (needed for ECI to ECEF conversion)
    const gmst = satellite.gstime(jsDate)

    // Loop through every satellite
    for (const sat of satellites) {
      // Where is this satellite at this time?
      const positionAndVelocity = satellite.propagate(sat.satrec, jsDate)

      // Skip if math failed
      if (!positionAndVelocity || !positionAndVelocity.position || typeof positionAndVelocity.position === 'boolean') {
        continue
      }

      // Convert to coordinates Cesium understands ECEF or ECF
      // ECF and ECEF are the same just different names
      const positionECF = satellite.eciToEcf(positionAndVelocity.position, gmst)

      // Changes from m to km
      const newPosition = new Cesium.Cartesian3(
        positionECF.x * 1000,
        positionECF.y * 1000,
        positionECF.z * 1000
      )

      // Set new position on map and in the label
      sat.point.position = newPosition
    }

    // Calls on next frame
    requestAnimationFrame(updatePositions)
  }

  // This STARTS the loop (runs updatePositions for the first time)
  requestAnimationFrame(updatePositions)
}