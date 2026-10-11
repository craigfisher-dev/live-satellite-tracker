# Satellite Tracking Indicators

Branch: `satellite-tracking-indicators`

Status: implemented, visual testing pending. The performance work is a separate plan.

---

## Summary

A selection marker for the tracked satellite. It lives in a new module, `src/utils/SelectionIndicators.ts`, so `SatelliteTracker.ts` only needs three additions: an import, one call to create the marker, and one call per frame to update it.

The marker is a flat hexagon that lies in the local horizontal plane at the satellite (its axis points toward the Earth). It rotates slowly, keeps a roughly constant on-screen size, and is clipped by the globe when it falls behind the Earth.

---

## Changes from the original plan

| Original plan | Final |
| --- | --- |
| Spinning 3-arc ring, camera-facing billboard | Hexagon on a flat plane aligned to the local horizon, rotating clockwise |
| Ground line and ground marker | Removed |
| Pulse and click "pop" animation | Removed, rotation only |
| Show/hide handled in the click handler | No click handler changes. `update()` runs every frame and hides the marker when nothing is selected |
| Delete the `sat === selectedSatellite` early return | Kept. The animation loop rebuilds the orbit line every frame, so the early return has no visible effect |
| Only `SatelliteTracker.ts` changes | New module plus three additions to `SatelliteTracker.ts` |

---

## Implementation

### `SelectionIndicators.ts`

Exports `createSelectionIndicators(viewer)`, which returns `{ update(point) }`.

- **Marker:** one `Primitive` using `PlaneGeometry` and an `Image` material. The image is an SVG hexagon drawn at 128px, with a dark opaque fill, a mint outline and a small center hole so the satellite's dot stays visible.
- **Placement:** done in `scene.preRender`, when the camera is at its final position for the frame. This avoids size lag while zooming. Each frame it:
  - builds the local east/north/up frame at the satellite with `Transforms.headingPitchRollToFixedFrame`, using heading as the rotation
  - lifts the plane slightly (`LIFT_PX`) so it does not z-fight with the orbit line, which lies in nearly the same plane
  - scales it to the target pixel size using `camera.getPixelSize` and the distance scale
- **Distance scaling:** clamped at both ends (scale 1 at 1e6 m, 0.4 at 1e8 m).
- **Earth occlusion:** the plane is depth tested, so the globe clips it at the limb.
- **Selected dot:** `disableDepthTestDistance` is set to infinity so the dot draws above the orbit line. A horizon test (`isHiddenByEarth`) turns this off when the satellite is behind the Earth. It is restored when the selection changes.
- **Rendering:** `requestRender()` is called every frame while a satellite is selected, so the rotation continues with the sim clock paused (`requestRenderMode`). One extra render runs on deselect to remove the marker.

### `SatelliteTracker.ts`

1. Import `createSelectionIndicators`
2. `const indicators = createSelectionIndicators(viewer)` after the collections
3. `indicators.update(selectedSatellite ? selectedSatellite.point : null)` in `updatePositions()`, after the satellite loop

---

## Configuration

Constants at the top of `SelectionIndicators.ts`:

- `HEX_COLOR`, `HEX_FILL_COLOR`, `HEX_FILL_OPACITY`: appearance
- `HEX_SIZE_PX`: base on-screen size
- `SECONDS_PER_LAP`: rotation speed
- `LIFT_PX`: offset above the orbit line's plane
- `NEAR_DISTANCE`, `NEAR_SCALE`, `FAR_DISTANCE`, `FAR_SCALE`: zoom scaling

---

## Build order

- [x] Create `SelectionIndicators.ts` with `createSelectionIndicators(viewer)`
- [x] Draw the SVG hexagon image (fill, center hole, outline)
- [x] Create the flat plane primitive, hidden by default
- [x] Place, size and rotate it each frame in `preRender`
- [x] Add distance scaling clamped at both ends
- [x] Draw the selected dot above the orbit line and restore it when the selection changes
- [x] Add the Earth horizon test so the dot hides behind the globe
- [x] Hook into `SatelliteTracker.ts` (import, create, per-frame update)
- [x] Update the two stale comments in `SatelliteTracker.ts`
- [ ] Run through the testing checklist below

---

## Known tradeoffs

- The marker is a flat plane, so it is seen edge-on near the globe's limb and can nearly disappear there.
- The orbit line lies close to the marker's plane near the satellite. `LIFT_PX` reduces z-fighting, but it may need tuning.
- The plane, `Image` material and SVG data URL combination has not been confirmed in this setup.

---

## Testing

- [ ] Select a satellite: marker appears flat to the ground and rotates
- [ ] Select another satellite: marker moves, nothing is left on the old one
- [ ] Click empty space: marker hides
- [ ] Pause the clock: rotation continues
- [ ] Run at 1000x: marker stays attached to the dot with no lag
- [ ] Zoom in and out: size stays within the limits, no growth lag
- [ ] Rotate the globe so the satellite crosses the limb: the globe clips the marker, the dot hides behind the Earth
- [ ] Check a LEO and a GEO satellite
- [ ] Check for z-fighting between the marker and the orbit line
- [ ] Check that the selected dot stays above the orbit line at all camera angles
- [ ] Deselect and reselect: the previous dot returns to normal depth testing

---

## What stays the same

- The globe, dots, orbit line, filters, time controls, info panel and caching
- The click handler, including the early return
- The performance work (separate plan)