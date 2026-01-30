import * as Cesium from 'cesium'
import * as satellite from 'satellite.js'

export async function Satellite() {

    // 1. Fetch
  const res = await fetch('https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=JSON')
  const ommData = await res.json()

  console.log(ommData)
}

