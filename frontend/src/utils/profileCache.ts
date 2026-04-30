// Database name for IndexedDB
const DB_NAME = 'satellite_cache'

// Increment this when adding new tables in future
const DB_VERSION = 2

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
 * Stores them in the 'satellites' IndexedDB table with 24hr cache
 */
export async function fetchSatelliteProfiles(): Promise<any[]> {
  console.time('Total fetchSatelliteProfiles')
  console.log(`API URL: ${PROFILES_API_URL}`)
  console.log(`Environment: ${import.meta.env.PROD ? 'PRODUCTION' : 'DEVELOPMENT'}`)

  // Open the IndexedDB database
  console.time('IndexedDB open')
  const db = await openDB()
  console.timeEnd('IndexedDB open')

  // Try to get cached profiles
  console.time('IndexedDB read')
  const cached = await new Promise<any>((resolve) => {
    const tx = db.transaction('satellites', 'readonly')
    const req = tx.objectStore('satellites').get('_metadata')
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(null)
  })
  console.timeEnd('IndexedDB read')

  // Cache hit: profiles exist and haven't expired
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

  // Store fresh data in IndexedDB
  console.time('IndexedDB write')
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('satellites', 'readwrite')
    const store = tx.objectStore('satellites')

    store.clear()

    profiles.forEach((profile: any) => {
      store.put(profile)
    })

    store.put({
      norad_id: '_metadata',
      timestamp: Date.now(),
      data: profiles
    })

    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  console.timeEnd('IndexedDB write')

  console.timeEnd('Total fetchSatelliteProfiles')
  return profiles
}

/**
 * Get a single satellite profile by norad_id from IndexedDB
 */
export async function getSatelliteProfile(noradId: number): Promise<any | null> {
  const db = await openDB()

  return new Promise((resolve) => {
    const tx = db.transaction('satellites', 'readonly')
    const req = tx.objectStore('satellites').get(noradId)
    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => resolve(null)
  })
}