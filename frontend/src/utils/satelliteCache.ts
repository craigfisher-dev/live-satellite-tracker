// Database name for IndexedDB
const DB_NAME = 'satellite_cache'

// Date.now() is in milliseconds, so everything needs to match that
// 3 hours * 60 min * 60 sec * 1000 ms
const CACHE_DURATION = 3 * 60 * 60 * 1000

export async function fetchSatelliteData(): Promise<any[]> {

  // Open (or create) the IndexedDB database
  // Wrapping in Promise because IndexedDB uses callbacks, not promises
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1) // 1 is the version number
    req.onerror = () => reject(req.error)
    req.onsuccess = () => resolve(req.result)
    // onupgradeneeded fires on first create or version change
    // This is where you set up the "tables" (object stores)
    req.onupgradeneeded = () => req.result.createObjectStore('cache')
  })

  // Try to get cached data from IndexedDB
  // readonly transaction since we're just reading
  const cached = await new Promise<any>((resolve) => {
    const req = db.transaction('cache', 'readonly').objectStore('cache').get('satellites')
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(null) // Return null if error, don't crash
  })

  // Cache hit: data exists and hasn't expired
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    console.log('Using cached data')
    return cached.data
  }

  // Cache miss or expired: fetch fresh data from API
  console.log('Fetching fresh data...')
  const res = await fetch('https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=JSON')
  const data = await res.json()

  // Store fresh data with current timestamp
  // readwrite transaction since we're writing
  // put() updates existing or inserts new, 'satellites' is the key
  db.transaction('cache', 'readwrite').objectStore('cache').put({ data, timestamp: Date.now() }, 'satellites')

  return data
}