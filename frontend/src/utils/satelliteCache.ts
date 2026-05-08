// Database name for IndexedDB
const DB_NAME = 'satellite_cache'

// Increment this when adding new tables in future
const DB_VERSION = 3

// Date.now() is in milliseconds, so everything needs to match that
// 24 hours * 60 min * 60 sec * 1000 ms
const CACHE_DURATION = 24 * 60 * 60 * 1000

// Use Vercel serverless function in production, direct API in dev
// import.meta.env.PROD is built into Vite automatically - no config needed
// npm run dev → false, npm run build → true
const API_URL = import.meta.env.PROD 
  ? '/api/satellites'  // Production: Vercel serverless function with Blob cache
  : 'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=JSON' // Dev: just ISS/stations (small)

export async function fetchSatelliteData(): Promise<any[]> {

  console.time('Total fetchSatelliteData')
  console.log(`API URL: ${API_URL}`)
  console.log(`Environment: ${import.meta.env.PROD ? 'PRODUCTION' : 'DEVELOPMENT'}`)

  // Open (or create) the IndexedDB database
  console.time('IndexedDB open')
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onerror = () => reject(req.error)
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      
      if (!db.objectStoreNames.contains('cache')) {
        db.createObjectStore('cache')
      }
    }
  })
  console.timeEnd('IndexedDB open')
  
  // Try to get cached data from IndexedDB
  console.time('IndexedDB read')
  const cached = await new Promise<any>((resolve) => {
    const req = db.transaction('cache', 'readonly').objectStore('cache').get('satellites')
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(null)
  })
  console.timeEnd('IndexedDB read')

  // Cache hit: data exists and hasn't expired
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    const cacheAge = Math.round((Date.now() - cached.timestamp) / 1000 / 60)
    console.log(`SOURCE: IndexedDB cache (${cacheAge} minutes old)`)
    console.log(`Satellite count: ${cached.data.length}`)
    console.timeEnd('Total fetchSatelliteData')
    return cached.data
  }

  // Cache miss or expired: fetch fresh data from API
  console.log('IndexedDB cache miss or expired, fetching from network...')
  
  console.time('API fetch')
  const res = await fetch(API_URL)
  console.timeEnd('API fetch')

  // Handle failed fetch - use stale cache if available, otherwise throw
  if (!res.ok) {
    console.error(`API error: ${res.status}`)
    
    if (cached) {
      console.log('SOURCE: Using stale IndexedDB cache (API failed)')
      console.log(`Satellite count: ${cached.data.length}`)
      console.timeEnd('Total fetchSatelliteData')
      return cached.data
    }
    
    throw new Error(`Failed to fetch satellite data: ${res.status}`)
  }

  // Log Vercel cache and blob source
  // x-vercel-cache: HIT = CDN served it, STALE = stale CDN, MISS = function ran
  // x-cache-source: blob = served from Vercel Blob, celestrak = fetched fresh from CelesTrak
  const cacheStatus = res.headers.get('x-vercel-cache')
  const cacheSource = res.headers.get('x-cache-source')
  const age = res.headers.get('age')
  
  console.log('Response headers:')
  console.log(`  x-vercel-cache: ${cacheStatus || 'N/A (dev mode)'}`)
  console.log(`  x-cache-source: ${cacheSource || 'N/A'}`)
  console.log(`  age: ${age ? age + ' seconds' : 'N/A'}`)
  
  if (cacheStatus === 'HIT') {
    console.log('SOURCE: Vercel CDN cache')
  } else if (cacheStatus === 'STALE') {
    console.log('SOURCE: Vercel CDN cache (stale, revalidating)')
  } else if (cacheSource === 'blob') {
    console.log('SOURCE: Vercel Blob cache')
  } else if (cacheSource === 'celestrak') {
    console.log('SOURCE: CelesTrak (Blob miss or expired)')
  } else {
    console.log('SOURCE: Direct from CelesTrak (dev mode)')
  }

  console.time('JSON parse')
  const data = await res.json()
  console.timeEnd('JSON parse')
  
  console.log(`Satellite count: ${data.length}`)

  // Store fresh data with current timestamp
  console.time('IndexedDB write')
  db.transaction('cache', 'readwrite').objectStore('cache').put({ data, timestamp: Date.now() }, 'satellites')
  console.timeEnd('IndexedDB write')

  console.timeEnd('Total fetchSatelliteData')
  return data
}