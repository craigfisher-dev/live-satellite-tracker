import * as Cesium from 'cesium'
import * as satellite from 'satellite.js'
import { fetchSatelliteData } from './satelliteCache'
import { SatelliteFilterByName } from './SatelliteFilter'

export async function Satellite(viewer: Cesium.Viewer) {

  // Fetch all stations
  const ommData = await fetchSatelliteData()

  // Create collections (one draw call each)
  const pointCollection = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection())

  // Create collections of orbitalPredictionPath (one draw call each)
  const orbitalPredictionPaths = viewer.scene.primitives.add(new Cesium.PolylineCollection())

  // Store satrecs, points, and labels together
  const satellites: { satrec: satellite.SatRec, point: Cesium.PointPrimitive, orbitalPredictionPath: Cesium.Polyline, meanMotion: number }[] = []

  // Map points to satellites for click detection
  const pointToSatellite = new Map<Cesium.PointPrimitive, typeof satellites[0]>()

  // Track currently selected satellite
  let selectedSatellite: typeof satellites[0] | null = null

  let selectedOriginalColor: Cesium.Color | null = null

  // Create all points and labels once
  for (const omm of ommData) {

    // Use for later when adding info panel
    // const satelliteName = omm["OBJECT_NAME"]

    // Satellite record
    const satrec = satellite.json2satrec(omm)

    let point : Cesium.PointPrimitive

    point = pointCollection.add({
      position: Cesium.Cartesian3.ZERO,
      pixelSize: 3,
      color: SatelliteFilterByName(omm),
      scaleByDistance: new Cesium.NearFarScalar(1e6, 2, 1e8, 0.5)
    })
    

    // Initialize with empty positions (will fill on click)
    const orbitalPredictionPath = orbitalPredictionPaths.add({
      positions: [],
      width: 2,
      material: Cesium.Material.fromType('Color', { color: Cesium.Color.YELLOW })
    })

    const sat = { satrec, point, orbitalPredictionPath, meanMotion: omm.MEAN_MOTION }
    satellites.push(sat)
    pointToSatellite.set(point, sat)
  }

  // Function to calculate orbit for a satellite
  function calculateOrbit(sat: typeof satellites[0]) {
    const now = Cesium.JulianDate.toDate(viewer.clock.currentTime)
    const orbitPositions: Cesium.Cartesian3[] = []
    
    // T = 1440 / meanMotion (minutes per orbit)
    // meanMotion is revolutions per day, 1440 minutes in a day
    const orbitalPeriodMinutes = 1440 / sat.meanMotion
    
    // Number of points to draw the orbit
    const numPoints = 90
    
    // Time step between each point
    const timeStepMinutes = orbitalPeriodMinutes / numPoints

    for (let i = 0; i <= numPoints; i++) {
      const targetTime = new Date(now.getTime() + i * timeStepMinutes * 60 * 1000)
      const targetGmst = satellite.gstime(targetTime)
      const posVel = satellite.propagate(sat.satrec, targetTime)

      if (!posVel || !posVel.position || typeof posVel.position === 'boolean') continue

      const ecf = satellite.eciToEcf(posVel.position, targetGmst)
      orbitPositions.push(new Cesium.Cartesian3(ecf.x * 1000, ecf.y * 1000, ecf.z * 1000))
    }

    return orbitPositions
  }




// Click handler
const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)

handler.setInputAction((click: { position: Cesium.Cartesian2 }) => {
  const picked = viewer.scene.pick(click.position)

  // Clear previous selection - restore original color
  if (selectedSatellite && selectedOriginalColor) {
    selectedSatellite.point.color = selectedOriginalColor
    selectedSatellite.orbitalPredictionPath.positions = []
  }

  // Check if we clicked a point
  if (picked && picked.primitive instanceof Cesium.PointPrimitive) {
    const sat = pointToSatellite.get(picked.primitive)
    if (sat) {
      selectedOriginalColor = sat.point.color.clone() // Store BEFORE changing
      selectedSatellite = sat
      sat.point.color = Cesium.Color.RED
      sat.orbitalPredictionPath.positions = calculateOrbit(sat)
    }
  } else {
    selectedSatellite = null
    selectedOriginalColor = null
  }
}, Cesium.ScreenSpaceEventType.LEFT_CLICK)

  const scratch = new Cesium.Cartesian3()

  // Animation loop
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
      scratch.x = positionECF.x * 1000
      scratch.y = positionECF.y * 1000
      scratch.z = positionECF.z * 1000

      // Set new position on map and in the label
      sat.point.position = scratch
    }

    // Update orbit path for selected satellite
    if (selectedSatellite) {
      selectedSatellite.orbitalPredictionPath.positions = calculateOrbit(selectedSatellite)
    }

    // Calls on next frame
    requestAnimationFrame(updatePositions)
  }

  // This STARTS the loop (runs updatePositions for the first time)
  requestAnimationFrame(updatePositions)
}