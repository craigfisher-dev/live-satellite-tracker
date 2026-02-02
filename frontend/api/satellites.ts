export const config = {
  runtime: 'edge',
}

export default async function handler() {
  try {
    const res = await fetch(
      'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=JSON'
    )
    
    if (!res.ok) {
      return new Response('Failed to fetch satellite data', { status: 502 })
    }

    // Parse on server (slow part happens here, not on client)
    const fullData = await res.json()
    
    // Only keep fields needed for satellite.js
    const trimmedData = fullData.map((sat: any) => ({
      OBJECT_NAME: sat.OBJECT_NAME,
      OBJECT_ID: sat.OBJECT_ID,
      EPOCH: sat.EPOCH,
      MEAN_MOTION: sat.MEAN_MOTION,
      ECCENTRICITY: sat.ECCENTRICITY,
      INCLINATION: sat.INCLINATION,
      RA_OF_ASC_NODE: sat.RA_OF_ASC_NODE,
      ARG_OF_PERICENTER: sat.ARG_OF_PERICENTER,
      MEAN_ANOMALY: sat.MEAN_ANOMALY,
      EPHEMERIS_TYPE: sat.EPHEMERIS_TYPE,
      CLASSIFICATION_TYPE: sat.CLASSIFICATION_TYPE,
      NORAD_CAT_ID: sat.NORAD_CAT_ID,
      ELEMENT_SET_NO: sat.ELEMENT_SET_NO,
      REV_AT_EPOCH: sat.REV_AT_EPOCH,
      BSTAR: sat.BSTAR,
      MEAN_MOTION_DOT: sat.MEAN_MOTION_DOT,
      MEAN_MOTION_DDOT: sat.MEAN_MOTION_DDOT,
    }))

    return new Response(JSON.stringify(trimmedData), {
      headers: {
        'Content-Type': 'application/json',
        // Cache for 3 hours, stale for 3 more (cron runs every 2 hours)
        'Cache-Control': 'public, s-maxage=10800, stale-while-revalidate=10800',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (error) {
    return new Response('Error fetching satellite data', { status: 500 })
  }
}