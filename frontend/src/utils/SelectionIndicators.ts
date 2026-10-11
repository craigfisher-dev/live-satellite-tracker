import * as Cesium from 'cesium'

// Selection marker for the tracked satellite.
// A flat hexagon that lies in the local horizontal plane at the satellite (its axis points
// toward the Earth), rotates slowly, and keeps a roughly constant on-screen size with limits.
// It is depth tested, so the Earth hides the part of the marker that falls behind it.
// Created once and hidden by default. Call update() every frame.

const HEX_COLOR = '#8fd9b6'       // Outline color
const HEX_SIZE_PX = 32            // Base size in pixels
const HEX_FILL_COLOR = '#06110c'  // Fill color
const HEX_FILL_OPACITY = 1        // 0 = transparent, 1 = opaque
const SECONDS_PER_LAP = 10        // Seconds per full rotation
const LIFT_PX = 0.5               // Offset above the orbit line's plane, avoids z-fighting with it

// Size vs. camera distance, clamped at both ends
const NEAR_DISTANCE = 1e6         // Meters
const NEAR_SCALE = 1
const FAR_DISTANCE = 1e8          // Meters
const FAR_SCALE = 0.4

// Drawn at 128px and displayed smaller so it stays sharp at any screen density
function createHexImage() {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">` +
    // Filled hexagon with a small center hole so the satellite's dot stays visible
    `<path fill-rule="evenodd" fill="${HEX_FILL_COLOR}" fill-opacity="${HEX_FILL_OPACITY}" ` +
    `d="M64,8 L112.5,36 L112.5,92 L64,120 L15.5,92 L15.5,36 Z ` +
    `M59,64 a5,5 0 1,0 10,0 a5,5 0 1,0 -10,0 Z"/>` +
    // Outline
    `<polygon points="64,8 112.5,36 112.5,92 64,120 15.5,92 15.5,36" ` +
    `fill="none" stroke="${HEX_COLOR}" stroke-width="10" stroke-linejoin="round"/>` +
    `</svg>`
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
}

export function createSelectionIndicators(viewer: Cesium.Viewer) {
  // Unit plane in the local east/north plane (normal = up).
  // modelMatrix places, sizes and rotates it each frame.
  const marker = viewer.scene.primitives.add(new Cesium.Primitive({
    geometryInstances: new Cesium.GeometryInstance({
      geometry: new Cesium.PlaneGeometry({
        vertexFormat: Cesium.MaterialAppearance.MaterialSupport.TEXTURED.vertexFormat
      })
    }),
    appearance: new Cesium.MaterialAppearance({
      material: Cesium.Material.fromType('Image', { image: createHexImage() }),
      materialSupport: Cesium.MaterialAppearance.MaterialSupport.TEXTURED,
      flat: true
    }),
    asynchronous: false,
    show: false
  }))

  // Scratch objects for isHiddenByEarth
  const oneOverRadii = Cesium.Ellipsoid.WGS84.oneOverRadii
  const camScaled = new Cesium.Cartesian3()
  const pointScaled = new Cesium.Cartesian3()
  const toPoint = new Cesium.Cartesian3()

  // Returns true if the Earth blocks the line of sight from the camera to the point.
  // Scales space so the ellipsoid becomes a unit sphere, then applies the horizon test.
  function isHiddenByEarth(point: Cesium.Cartesian3, cameraPosition: Cesium.Cartesian3) {
    Cesium.Cartesian3.multiplyComponents(oneOverRadii, cameraPosition, camScaled)
    Cesium.Cartesian3.multiplyComponents(oneOverRadii, point, pointScaled)

    const horizon = Cesium.Cartesian3.magnitudeSquared(camScaled) - 1
    if (horizon < 0) return false // Camera is inside the ellipsoid

    Cesium.Cartesian3.subtract(pointScaled, camScaled, toPoint)
    const along = -Cesium.Cartesian3.dot(toPoint, camScaled)
    return along > horizon && (along * along) / Cesium.Cartesian3.magnitudeSquared(toPoint) > horizon
  }

  // Satellite position the marker should be drawn at (set by update, read at draw time)
  let hasTarget = false
  const target = new Cesium.Cartesian3()

  // Scratch objects for the marker transform
  const hpr = new Cesium.HeadingPitchRoll()
  const placed = new Cesium.Matrix4()
  const lifted = new Cesium.Matrix4()
  const lift = new Cesium.Cartesian3()
  const sphere = new Cesium.BoundingSphere(new Cesium.Cartesian3(), 1)

  // Runs right before each draw, when the camera is at its final position for the frame.
  // Sizing here, rather than in update(), keeps the marker from lagging while zooming.
  viewer.scene.preRender.addEventListener(() => {
    if (!hasTarget) {
      marker.show = false
      return
    }

    // World size of one screen pixel at the satellite's distance
    Cesium.Cartesian3.clone(target, sphere.center)
    const metersPerPixel = viewer.camera.getPixelSize(
      sphere,
      viewer.scene.drawingBufferWidth,
      viewer.scene.drawingBufferHeight
    )

    // Marker size in meters, scaled by camera distance
    const distance = Cesium.Cartesian3.distance(viewer.camera.positionWC, target)
    const k = Cesium.Math.clamp((distance - NEAR_DISTANCE) / (FAR_DISTANCE - NEAR_DISTANCE), 0, 1)
    const sizeMeters = HEX_SIZE_PX * Cesium.Math.lerp(NEAR_SCALE, FAR_SCALE, k) * metersPerPixel

    // Local east/north/up frame at the satellite, rotated by heading (positive = clockwise from above)
    hpr.heading = (performance.now() / 1000 / SECONDS_PER_LAP) * Math.PI * 2
    Cesium.Transforms.headingPitchRollToFixedFrame(target, hpr, undefined, undefined, placed)

    // Lift slightly above the orbit line's plane, then scale to the marker size
    lift.z = LIFT_PX * metersPerPixel
    Cesium.Matrix4.multiplyByTranslation(placed, lift, lifted)
    Cesium.Matrix4.multiplyByUniformScale(lifted, sizeMeters, marker.modelMatrix)

    marker.show = true
  })

  // Point currently drawn above the orbit line, restored when the selection changes
  let lastPoint: Cesium.PointPrimitive | null = null

  return {
    // Pass the selected satellite's point, or null when nothing is selected
    update(point: Cesium.PointPrimitive | null) {
      // Selection changed or cleared: restore depth testing on the previous point
      if (lastPoint && lastPoint !== point) {
        lastPoint.disableDepthTestDistance = 0
        lastPoint = null
      }

      const position = point ? point.position : null
      const wasShowing = hasTarget

      hasTarget = !!position && !Cesium.Cartesian3.equals(position, Cesium.Cartesian3.ZERO)

      if (!hasTarget) {
        // One last render to remove the marker
        if (wasShowing) viewer.scene.requestRender()
        return
      }

      Cesium.Cartesian3.clone(position!, target)

      // Draw the selected point above the orbit line, unless the Earth is in the way
      const hidden = isHiddenByEarth(position!, viewer.camera.positionWC)
      point!.disableDepthTestDistance = hidden ? 0 : Number.POSITIVE_INFINITY
      lastPoint = point

      // Keep rendering so the rotation continues while the simulation is paused
      viewer.scene.requestRender()
    }
  }
}