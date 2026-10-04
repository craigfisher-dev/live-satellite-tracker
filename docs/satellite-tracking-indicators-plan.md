# Satellite Tracking Indicators: Small Feature Plan

Branch: `satellite-tracking-indicators`

Two visual touches for the selected satellite. Purely additive, only touches `SatelliteTracker.ts`. The performance work is a separate plan and happens later.

---

## What's being added

1. **Green selection animation**: a spinning ring around the selected satellite (with an optional gentle pulse) so it feels alive and clearly "tracked"
2. **Ground line**: a line from the satellite straight down to the spot on Earth it is currently over, with a small marker where it lands

Both only exist for the one selected satellite. Both follow it every frame and disappear when the selection clears.

---

## Feature 1: Spinning green ring

- One `Billboard` in a `BillboardCollection`, created once at startup with `show: false`
- Image is drawn on a canvas: green ring made of 3 arcs with gaps, so the rotation is actually visible (a solid ring looks like it isn't moving)
- Ring is about 32px on screen at scale 0.5, around the 3px dot
- Each frame while selected:
  - `position` = the selected satellite's current point position
  - `rotation` = time based, about 2 rad/sec, negative for clockwise
  - optional pulse: scale oscillates a few percent on a sine wave
- Show it on select, hide it on deselect
- Needs `viewer.scene.requestRender()` each frame while selected, because `requestRenderMode` would freeze the ring when the sim clock is paused

### Maybe
- Quick "pop" on click (ring starts big and shrinks into place over ~300ms)
- Color tweak to match the rest of the UI

---

## Feature 2: Ground line (satellite to the point below it)

The point directly below a satellite is its sub-satellite point: same latitude and longitude, altitude zero.

- One extra `Polyline` with 2 positions, added once to a `PolylineCollection` (can share the existing one, it is a separate polyline from the orbit line)
- Each frame while selected:
  - top end = satellite's current position
  - bottom end = that position projected down to the surface
  - Cesium has this built in: `Cesium.Ellipsoid.WGS84.scaleToGeodeticSurface(position, result)` returns the surface point below (reuse one scratch `Cartesian3`, and skip the frame if it returns `undefined`)
- Style: thin green line, maybe dashed (`Cesium.Material.fromType('PolylineDash', ...)`) so it reads differently from the yellow orbit line
- Small green `PointPrimitive` at the landing spot so you can see where it touches Earth
- Hide both on deselect

### Things to watch
- Lift the bottom end about 1000 m above the surface (same trick as the country borders) so it doesn't z-fight with the globe
- If the satellite is on the far side of Earth, the globe hides the line. That is correct behavior, not a bug
- The line is long for high orbits (GEO is about 36,000 km). That is fine, it actually shows the altitude nicely

### Maybe
- Fade the line from bright at the satellite to dim at the ground
- Tiny pulse ring on the ground marker

---

## How it fits the existing code

- Created once, right after the existing collections
- Click handler:
  - "clear previous selection" block: hide ring, hide ground line and marker
  - after `selectedSatellite = sat`: show them
  - empty space click: hide them
- `updatePositions()`, inside the existing `if (selectedSatellite)` block: update ring position/rotation, update ground line ends and marker, call `requestRender()`
- Nothing else in the file changes, orbit line, info panel, filters, caching all untouched

---

## Fix while in there

- Re-clicking the selected satellite clears its orbit line, then `if (sat === selectedSatellite) return` leaves it selected with no orbit. Now it would also hide the ring and line while still "selected". Delete that early return so a re-click just reselects

---

## Build order

1. [ ] Add `createRingImage()` helper
2. [ ] Create the billboard (hidden) and the ring
3. [ ] Show/hide ring in the click handler
4. [ ] Spin + follow in `updatePositions()`, add `requestRender()`
5. [ ] Test with the sim paused (ring should keep spinning)
6. [ ] Create the ground line polyline + ground marker (hidden)
7. [ ] Show/hide them in the click handler
8. [ ] Update both ends each frame, using `scaleToGeodeticSurface`
9. [ ] Test: line should hit the ground at the same lat/lon shown in the info panel's Current Position section
10. [ ] Fix the re-click bug
11. [ ] Tune: ring size/speed, line width/dash, colors

---

## Testing

- **Visual checks**
  - Select a satellite, ring appears and spins, ground line drops to Earth
  - Click another satellite, everything moves to the new one, nothing left behind on the old one
  - Click empty space, everything hides
  - Pause the clock, ring keeps spinning
  - Run at 1000x, ring and line stay attached to the dot (no lag)
  - Try a LEO satellite and a GEO satellite, line length should look right for both
- **Correctness check**
  - The ground marker's latitude and longitude should match the Current Position panel
- **Optional unit test** (Vitest, no Cesium needed): take a known position, find its surface point, and check the lat/lon match and the altitude is about 0

---

## What stays the same

- The globe, dots, orbit line, filters, time controls, info panel, caching
- All the performance work (separate plan)

---

## Open questions

- Dashed or solid ground line?
- Include the ground marker dot, or just the line?
- Pulse on the ring, or spin only?
- Same green for both, or a slightly different shade for the ground line?