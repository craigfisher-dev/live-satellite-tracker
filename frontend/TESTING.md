# Live Satellite Tracker — Testing Plan

## Tools
Unit Tests and Integration Tests (Vitest)
Component Tests (Vitest + React Testing Library)
End Two End Tests (Playwright) - Need to install dependencies later

---

## Unit Tests
Pure functions only — no external dependencies, no network, no DOM, no Cesium viewer.

### `SatelliteFilter.ts`

| Function | Test | Input | Expected Output |
|---|---|---|---|
| `filterByNetwork` | Starlink satellite returns correct color | `{ OBJECT_NAME: 'STARLINK-1234', MEAN_MOTION: 15 }` | `Cesium.Color.DODGERBLUE` |
| `filterByNetwork` | OneWeb satellite returns correct color | `{ OBJECT_NAME: 'ONEWEB-0001', MEAN_MOTION: 15 }` | `Cesium.Color.LIMEGREEN` |
| `filterByNetwork` | Kuiper satellite returns correct color | `{ OBJECT_NAME: 'KUIPER-001', MEAN_MOTION: 15 }` | `Cesium.Color.ORANGE` |
| `filterByNetwork` | Iridium satellite returns correct color | `{ OBJECT_NAME: 'IRIDIUM-10', MEAN_MOTION: 15 }` | `Cesium.Color.YELLOW` |
| `filterByNetwork` | GPS satellite returns correct color | `{ OBJECT_NAME: 'GPS IIR-10', MEAN_MOTION: 2 }` | `Cesium.Color.RED` |
| `filterByNetwork` | NAVSTAR satellite returns correct color | `{ OBJECT_NAME: 'NAVSTAR 43', MEAN_MOTION: 2 }` | `Cesium.Color.RED` |
| `filterByNetwork` | Globalstar satellite returns correct color | `{ OBJECT_NAME: 'GLOBALSTAR M001', MEAN_MOTION: 14 }` | `Cesium.Color.MAGENTA` |
| `filterByNetwork` | Galileo satellite returns correct color | `{ OBJECT_NAME: 'GALILEO-101', MEAN_MOTION: 2 }` | `Cesium.Color.CYAN` |
| `filterByNetwork` | GLONASS satellite returns correct color | `{ OBJECT_NAME: 'GLONASS-M 750', MEAN_MOTION: 2 }` | `Cesium.Color.ORANGERED` |
| `filterByNetwork` | Beidou satellite returns correct color | `{ OBJECT_NAME: 'BEIDOU-3 M1', MEAN_MOTION: 1 }` | `Cesium.Color.GOLD` |
| `filterByNetwork` | Qianfan satellite returns correct color | `{ OBJECT_NAME: 'QIANFAN-01', MEAN_MOTION: 15 }` | `Cesium.Color.PURPLE` |
| `filterByNetwork` | SKYSAT returns correct color | `{ OBJECT_NAME: 'SKYSAT-C1', MEAN_MOTION: 15 }` | `Cesium.Color.TOMATO` |
| `filterByNetwork` | FLOCK returns correct color | `{ OBJECT_NAME: 'FLOCK 1B-1', MEAN_MOTION: 15 }` | `Cesium.Color.TOMATO` |
| `filterByNetwork` | Unknown satellite falls back to grey | `{ OBJECT_NAME: 'UNKNOWN SAT', MEAN_MOTION: 15 }` | `Cesium.Color.GREY` |
| `filterByNetwork` | Name matching is case-insensitive | `{ OBJECT_NAME: 'starlink-999', MEAN_MOTION: 15 }` | `Cesium.Color.DODGERBLUE` |
| `filterByAltitude` | LEO satellite (< 2,000 km) returns correct color | `{ MEAN_MOTION: 15.5 }` | `Cesium.Color.DODGERBLUE` |
| `filterByAltitude` | MEO satellite (2,000 - 35,000 km) returns correct color | `{ MEAN_MOTION: 2.0 }` | `Cesium.Color.LIMEGREEN` |
| `filterByAltitude` | GEO satellite (~35,786 km) returns correct color | `{ MEAN_MOTION: 1.0027 }` | `Cesium.Color.TOMATO` |
| `filterByAltitude` | HEO satellite (> 36,000 km) returns correct color | `{ MEAN_MOTION: 0.5 }` | `Cesium.Color.DARKMAGENTA` |

Harder to implement — need to learn more about module state reset with `beforeEach`:

| Function | Test | Input | Expected Output |
|---|---|---|---|
| `getActiveFilter` | Returns `filterByNetwork` by default | — | `filterByNetwork` |
| `setActiveFilter` | Updates the active filter | `filterByAltitude` | `getActiveFilter()` returns `filterByAltitude` |
| `setActiveFilter` | Triggers the registered `onFilterChange` callback | Register a callback, then call `setActiveFilter` | Callback is called once |
| `setActiveFilter` | Does not crash if no callback is registered | No callback registered | No error thrown |
| `onFilterChange` | Registered callback fires on filter change | Register mock callback, call `setActiveFilter` | Callback fires |

---

## Integration Tests
Tests that involve multiple systems working together — network, IndexedDB, Cesium, or the DOM.

### `satelliteCache.ts`

| Function | Test | Setup | Expected Output |
|---|---|---|---|
| `fetchSatelliteData` | Returns cached data from IndexedDB if cache is fresh | IndexedDB has data with timestamp = now | Returns cached array without hitting network |
| `fetchSatelliteData` | Fetches from API if IndexedDB cache is expired | IndexedDB has data with timestamp > 24 hours ago | Fetches fresh data from API |
| `fetchSatelliteData` | Fetches from API if IndexedDB has no data | Empty IndexedDB | Fetches from API |
| `fetchSatelliteData` | Falls back to stale IndexedDB data if API returns non-ok response | API returns 500, IndexedDB has stale data | Returns stale cached data |
| `fetchSatelliteData` | Throws error if API fails and no cache exists | API returns 500, IndexedDB empty | Throws error |
| `fetchSatelliteData` | Writes fresh API data to IndexedDB after successful fetch | API returns fresh data | Data stored in IndexedDB with current timestamp |

---

### `CountryBorders.ts`

| Function | Test | Setup | Expected Output |
|---|---|---|---|
| `loadCountryBorders` | Adds a PolylineCollection to the viewer's scene primitives | Mock viewer + mock GeoJSON fetch | `viewer.scene.primitives` contains a PolylineCollection |
| `loadCountryBorders` | Correct number of polylines added for a given GeoJSON input | GeoJSON with 3 countries | PolylineCollection contains 3 polylines |
| `loadCountryBorders` | Only outer ring (ring[0]) is used — holes are ignored | Polygon with 2 rings | Only 1 polyline added, not 2 |
| `loadCountryBorders` | Coordinates are converted to Cartesian3 at altitude 1000 | Single `[lng, lat]` pair | Position matches `Cesium.Cartesian3.fromDegrees(lng, lat, 1000)` |

---

### `api/satellites.ts`

| Function | Test | Setup | Expected Output |
|---|---|---|---|
| `handler` | Returns 502 if CelesTrak API returns non-ok response | Mock fetch returns `{ ok: false, status: 503 }` | Response with status `502` |
| `handler` | Returns 500 if fetch throws an exception | Mock fetch throws an error | Response with status `500` |
| `handler` | Trims satellite fields — only keeps expected keys | Full OMM object with extra fields | Response only contains the 17 expected fields |
| `handler` | Returns valid JSON array | Successful fetch | Response body parses as an array |
| `handler` | Response includes correct Cache-Control header | Successful fetch | `Cache-Control: public, s-maxage=86400, stale-while-revalidate=86400` |
| `handler` | Response includes CORS header | Successful fetch | `Access-Control-Allow-Origin: *` |

---

### `SatelliteTracker.ts`

> Note: `calculateOrbit` is not exported so these tests use satellite.js directly — same math, same verification.

| Function | Test | Setup | Expected Output |
|---|---|---|---|
| `calculateOrbit` (via satellite.js) | ISS propagates to correct altitude | Real ISS OMM data, timestamp `2025-01-01T00:00:00Z` | Altitude between 400km and 430km |
| `calculateOrbit` (via satellite.js) | ISS ECF x, y, z coordinates are within expected range | Real ISS OMM data, known timestamp | x, y, z each within ±50km of reference values |
| `calculateOrbit` (via satellite.js) | Position changes over time | Same OMM, two different timestamps 90 min apart | Coordinates at T2 differ from T1 |
| `calculateOrbit` (via satellite.js) | Invalid propagation result is skipped | OMM with bad epoch | No crash, returns empty or partial array |

---

### `HelpPanel.ts`

| Function | Test | Setup | Expected Output |
|---|---|---|---|
| `setupHelpPanel` | Does nothing if `navigationHelpButton` is missing on viewer | Mock viewer with no `navigationHelpButton` | No error thrown, function exits early |
| `setupHelpPanel` | Sets `showInstructions` to true on startup | Mock viewer with `navigationHelpButton` | `viewModel.showInstructions` is `true` |
| `setupToggleButton` | Clicking the help button toggles `showInstructions` | Mock viewer, button click simulated | `showInstructions` flips on each click |

---

## Component Tests
Tests that render the actual React component and interact with it like a user would. Handlers like `handleClick` live inside the component and can't be called directly — these tests click the real buttons and check what happens on screen.

### `Clock.tsx`

| Test | Setup | Expected Output |
|---|---|---|
| Renders the UTC time string on screen | `simTime = new Date('2025-01-01T00:00:00Z')` | Screen shows `Wed, 01 Jan 2025 00:00:00 GMT` |
| Clicking pause button calls `setIsPaused(true)` | `isPaused = false` | `setIsPaused` called with `true` |
| Clicking pause button again calls `setIsPaused(false)` | `isPaused = true` | `setIsPaused` called with `false` |
| Shows Pause icon when not paused | `isPaused = false` | Pause icon is rendered |
| Shows Play icon when paused | `isPaused = true` | Play icon is rendered |
| Clicking speed up button calls `setSimSpeed` with next speed | `simSpeed = 1` | `setSimSpeed(10)` called |
| Clicking speed down button calls `setSimSpeed` with previous speed | `simSpeed = 1` | `setSimSpeed(-1)` called |
| Speed display shows correct value | `simSpeed = 100` | Screen shows `100x` |
| Clicking reset button calls `setSimTime` with current real time | Any simTime | `setSimTime` called with date close to `Date.now()` |
| Clicking reset button calls `setSimSpeed(1)` | Any simSpeed | `setSimSpeed(1)` called |
| Clicking reset button calls `setIsPaused(false)` | `isPaused = true` | `setIsPaused(false)` called |

---

### `Legend.tsx`

| Test | Setup | Expected Output |
|---|---|---|
| Renders the current filter title | `currentPage = 0` | Screen shows `Network` |
| Renders the correct page indicator | `currentPage = 0`, 2 total pages | Screen shows `1 / 2` |
| Clicking next button advances to next filter | `currentPage = 0` | Screen shows `Altitude` |
| Clicking next button on last page wraps to first | `currentPage = 1` (last) | Screen shows `Network` |
| Clicking prev button goes to previous filter | `currentPage = 1` | Screen shows `Network` |
| Clicking prev button on first page wraps to last | `currentPage = 0` | Screen shows `Altitude` |
| Renders correct legend items for Network filter | `currentPage = 0` | Screen shows `Starlink`, `OneWeb`, `GPS`, etc. |
| Renders correct legend items for Altitude filter | `currentPage = 1` | Screen shows `LEO`, `MEO`, `GEO`, `HEO` |
| Clicking next calls `setActiveFilter` with correct filter function | `currentPage = 0` | `setActiveFilter(filterByAltitude)` called |

---

## E2E Tests
*Planned for later — will use Playwright*