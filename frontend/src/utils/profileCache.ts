// Database name for IndexedDB
const DB_NAME = 'satellite_cache'

// Increment this when adding new tables in future
const DB_VERSION = 3

// 24 hours in milliseconds
const CACHE_DURATION = 24 * 60 * 60 * 1000

// Use Vercel serverless function in production, local FastAPI in dev
const PROFILES_API_URL = import.meta.env.PROD
  ? '/api/satellites-profiles'  // Production: FastAPI on Vercel
  : 'http://localhost:8000/api/satellites-profiles' // Dev: local FastAPI

/**
 * Helper: Open the database
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onerror = () => reject(req.error)
    req.onsuccess = () => resolve(req.result)
  })
}

/**
 * Fetch all satellite profiles from FastAPI
 * Stores entire profiles array as a single blob in the 'cache' store (same pattern as satelliteCache.ts)
 * One write instead of 68k individual puts — significantly faster
 */
export async function fetchSatelliteProfiles(): Promise<any[]> {
  console.time('Total fetchSatelliteProfiles')
  console.log(`API URL: ${PROFILES_API_URL}`)
  console.log(`Environment: ${import.meta.env.PROD ? 'PRODUCTION' : 'DEVELOPMENT'}`)

  // Open the IndexedDB database
  console.time('IndexedDB open')
  const db = await openDB()
  console.timeEnd('IndexedDB open')

  // Try to get cached profiles from cache store (same pattern as satelliteCache.ts)
  console.time('IndexedDB read')
  const cached = await new Promise<any>((resolve) => {
    const req = db.transaction('cache', 'readonly').objectStore('cache').get('profiles')
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(null)
  })
  console.timeEnd('IndexedDB read')

  // Cache hit: profiles exist and haven't expired — return blob directly
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    const cacheAge = Math.round((Date.now() - cached.timestamp) / 1000 / 60)
    console.log(`SOURCE: IndexedDB profiles cache (${cacheAge} minutes old)`)
    console.log(`Profile count: ${cached.data.length}`)
    console.timeEnd('Total fetchSatelliteProfiles')
    return cached.data
  }

  // Cache miss or expired: fetch fresh data from API
  console.log('IndexedDB cache miss or expired, fetching from network...')

  console.time('API fetch')
  const res = await fetch(PROFILES_API_URL)
  console.timeEnd('API fetch')

  // Handle failed fetch - use stale cache if available, otherwise throw
  if (!res.ok) {
    console.error(`API error: ${res.status}`)

    if (cached) {
      console.log('SOURCE: Using stale IndexedDB profiles (API failed)')
      console.log(`Profile count: ${cached.data.length}`)
      console.timeEnd('Total fetchSatelliteProfiles')
      return cached.data
    }

    throw new Error(`Failed to fetch satellite profiles: ${res.status}`)
  }

  console.time('JSON parse')
  const profiles = await res.json()
  console.timeEnd('JSON parse')

  console.log(`Profile count: ${profiles.length}`)

  // Store entire profiles array as single blob — one write instead of 68k individual puts
  // Same pattern as satelliteCache.ts which stores TLE data
  console.time('IndexedDB write')
  db.transaction('cache', 'readwrite').objectStore('cache').put({ data: profiles, timestamp: Date.now() }, 'profiles')
  console.timeEnd('IndexedDB write')

  console.timeEnd('Total fetchSatelliteProfiles')
  return profiles
}

/**
 * Get a single satellite profile by norad_id
 * Reads the cached blob and finds the profile in memory — no individual row lookup needed
 */
export async function getSatelliteProfile(noradId: number): Promise<any | null> {
  const db = await openDB()

  // Read the profiles blob from cache store
  const cached = await new Promise<any>((resolve) => {
    const req = db.transaction('cache', 'readonly').objectStore('cache').get('profiles')
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(null)
  })

  if (!cached) return null

  // Find profile in memory — fast array search, no DB roundtrip needed
  return cached.data.find((p: any) => p.norad_id === noradId) || null
}