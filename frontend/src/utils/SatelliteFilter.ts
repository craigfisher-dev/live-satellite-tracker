import * as Cesium from 'cesium'

// The two filter functions
export function filterByNetwork(omm: any): Cesium.Color {
  const name = omm['OBJECT_NAME'].toUpperCase()

  if (name.includes('STARLINK')) return Cesium.Color.DODGERBLUE
  if (name.includes('ONEWEB')) return Cesium.Color.LIMEGREEN
  if (name.includes('KUIPER')) return Cesium.Color.ORANGE
  if (name.includes('IRIDIUM')) return Cesium.Color.YELLOW
  if (name.includes('GPS') || name.includes('NAVSTAR')) return Cesium.Color.RED
  if (name.includes('GLOBALSTAR')) return Cesium.Color.MAGENTA
  if (name.includes('GALILEO')) return Cesium.Color.CYAN
  if (name.includes('GLONASS')) return Cesium.Color.ORANGERED
  if (name.includes('BEIDOU')) return Cesium.Color.GOLD
  if (name.includes('QIANFAN')) return Cesium.Color.PURPLE
  if (['SKYSAT', 'FLOCK', 'PELICAN', 'TANAGER'].some(k => name.includes(k))) return Cesium.Color.TOMATO
  return Cesium.Color.GREY
}

export function filterByAltitude(omm: any): Cesium.Color {
  // mean motion (rev/day) -> altitude via Kepler's third law
  const GM = 398600.4418 // km³/s²
  const EARTH_RADIUS = 6371 // km
  const nRadPerSec = (omm.MEAN_MOTION * 2 * Math.PI) / 86400
  const semiMajorAxis = Math.pow(GM / (nRadPerSec * nRadPerSec), 1 / 3)
  const altitude = semiMajorAxis - EARTH_RADIUS

  if (altitude < 2000) return Cesium.Color.DODGERBLUE
  if (altitude < 35000) return Cesium.Color.LIMEGREEN
  if (altitude < 36000) return Cesium.Color.TOMATO
  return Cesium.Color.DARKMAGENTA
}

// Active filter + callback
type ColorFilter = (omm: any) => Cesium.Color

let activeFilter: ColorFilter = filterByNetwork
let onChangeCallback: (() => void) | null = null

export function getActiveFilter() { return activeFilter }

export function setActiveFilter(filter: ColorFilter) {
  activeFilter = filter
  if (onChangeCallback) onChangeCallback()
}

export function onFilterChange(cb: () => void) {
  onChangeCallback = cb
}