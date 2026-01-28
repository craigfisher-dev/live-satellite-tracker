// src/tests/latLngToVector3.test.ts

import { describe, test, expect } from 'vitest'
import { latLngToVector3 } from '../components/Earth'

/**
 * Reference haversine implementation for verification
 * Source: https://www.movable-type.co.uk/scripts/latlong.html
 */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371 // km
  const φ1 = lat1 * Math.PI / 180 // φ, λ in radians
  const φ2 = lat2 * Math.PI / 180
  const Δφ = (lat2 - lat1) * Math.PI / 180
  const Δλ = (lon2 - lon1) * Math.PI / 180

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))

  return R * c // result in km 
}

/**
 * Calculate great-circle distance using latLngToVector3 function
 */
function distanceViaVector3(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const p1 = latLngToVector3(lat1, lon1, 1)
  const p2 = latLngToVector3(lat2, lon2, 1)
  const dot = p1[0]*p2[0] + p1[1]*p2[1] + p1[2]*p2[2]
  // Clamp to avoid floating point errors with acos
  const clampedDot = Math.min(1, Math.max(-1, dot))
  return Math.acos(clampedDot) * 6371
}

describe('latLngToVector3', () => {
  const EARTH_RADIUS = 6371 // km

  describe('poles - exact mathematical positions', () => {
    test('north pole (90°N) should be exactly [0, 1, 0]', () => {
      const [x, y, z] = latLngToVector3(90, 0, 1)
      expect(x).toBeCloseTo(0, 10)
      expect(y).toBeCloseTo(1, 10)
      expect(z).toBeCloseTo(0, 10)
    })

    test('south pole (-90°S) should be exactly [0, -1, 0]', () => {
      const [x, y, z] = latLngToVector3(-90, 0, 1)
      expect(x).toBeCloseTo(0, 10)
      expect(y).toBeCloseTo(-1, 10)
      expect(z).toBeCloseTo(0, 10)
    })

    test('poles should be independent of longitude', () => {
      const longitudes = [0, 45, 90, 135, 180, -45, -90, -135, -180]
      
      longitudes.forEach(lng => {
        const north = latLngToVector3(90, lng, 1)
        const south = latLngToVector3(-90, lng, 1)
        
        expect(north[0]).toBeCloseTo(0, 10)
        expect(north[1]).toBeCloseTo(1, 10)
        expect(north[2]).toBeCloseTo(0, 10)
        
        expect(south[0]).toBeCloseTo(0, 10)
        expect(south[1]).toBeCloseTo(-1, 10)
        expect(south[2]).toBeCloseTo(0, 10)
      })
    })
  })

  describe('equator - y coordinate must be exactly 0', () => {
    test('all equator points have y = 0', () => {
      const longitudes = [-180, -135, -90, -45, 0, 45, 90, 135, 180]
      
      longitudes.forEach(lng => {
        const [x, y, z] = latLngToVector3(0, lng, 1)
        expect(y).toBeCloseTo(0, 10)
      })
    })

    test('equator points 90° apart are orthogonal (dot product = 0)', () => {
      const p1 = latLngToVector3(0, 0, 1)
      const p2 = latLngToVector3(0, 90, 1)
      
      const dot = p1[0]*p2[0] + p1[1]*p2[1] + p1[2]*p2[2]
      expect(dot).toBeCloseTo(0, 10)
    })

    test('equator points 180° apart are antipodal (dot product = -1)', () => {
      const p1 = latLngToVector3(0, 0, 1)
      const p2 = latLngToVector3(0, 180, 1)
      
      const dot = p1[0]*p2[0] + p1[1]*p2[1] + p1[2]*p2[2]
      expect(dot).toBeCloseTo(-1, 10)
    })
  })

  describe('radius - all points must be exactly on sphere surface', () => {
    test('random points are exactly radius distance from origin', () => {
      const testPoints = [
        [0, 0], [90, 0], [-90, 0],           // special points
        [45, 45], [-45, -45],                 // mid-latitudes
        [40.7128, -74.006],                   // NYC
        [51.5074, -0.1278],                   // London
        [-33.8688, 151.2093],                 // Sydney
        [35.6762, 139.6503],                  // Tokyo
        [-22.9068, -43.1729],                 // Rio
        [55.7558, 37.6173],                   // Moscow
        [1.3521, 103.8198],                   // Singapore
        [-33.9249, 18.4241],                  // Cape Town
      ]

      testPoints.forEach(([lat, lng]) => {
        const [x, y, z] = latLngToVector3(lat, lng, 1)
        const distance = Math.sqrt(x*x + y*y + z*z)
        expect(distance).toBeCloseTo(1, 10)
      })
    })

    test('radius scales linearly and exactly', () => {
      const lat = 40.7128
      const lng = -74.006
      
      const r1 = latLngToVector3(lat, lng, 1)
      const r2 = latLngToVector3(lat, lng, 2)
      const r10 = latLngToVector3(lat, lng, 10)
      const r0_5 = latLngToVector3(lat, lng, 0.5)

      // r2 should be exactly 2x r1
      expect(r2[0] / r1[0]).toBeCloseTo(2, 10)
      expect(r2[1] / r1[1]).toBeCloseTo(2, 10)
      expect(r2[2] / r1[2]).toBeCloseTo(2, 10)

      // r10 should be exactly 10x r1
      expect(r10[0] / r1[0]).toBeCloseTo(10, 10)
      expect(r10[1] / r1[1]).toBeCloseTo(10, 10)
      expect(r10[2] / r1[2]).toBeCloseTo(10, 10)

      // r0.5 should be exactly 0.5x r1
      expect(r0_5[0] / r1[0]).toBeCloseTo(0.5, 10)
      expect(r0_5[1] / r1[1]).toBeCloseTo(0.5, 10)
      expect(r0_5[2] / r1[2]).toBeCloseTo(0.5, 10)
    })
  })

  describe('hemispheres - correct sign of y coordinate', () => {
    test('northern hemisphere always has positive y', () => {
      const northernCities = [
        { name: 'NYC', lat: 40.7128, lng: -74.006 },
        { name: 'London', lat: 51.5074, lng: -0.1278 },
        { name: 'Tokyo', lat: 35.6762, lng: 139.6503 },
        { name: 'Moscow', lat: 55.7558, lng: 37.6173 },
        { name: 'Beijing', lat: 39.9042, lng: 116.4074 },
        { name: 'Paris', lat: 48.8566, lng: 2.3522 },
        { name: 'Mumbai', lat: 19.0760, lng: 72.8777 },
        { name: 'Cairo', lat: 30.0444, lng: 31.2357 },
      ]

      northernCities.forEach(({ name, lat, lng }) => {
        const [x, y, z] = latLngToVector3(lat, lng, 1)
        expect(y, `${name} should have positive y`).toBeGreaterThan(0)
      })
    })

    test('southern hemisphere always has negative y', () => {
      const southernCities = [
        { name: 'Sydney', lat: -33.8688, lng: 151.2093 },
        { name: 'Rio', lat: -22.9068, lng: -43.1729 },
        { name: 'Cape Town', lat: -33.9249, lng: 18.4241 },
        { name: 'Auckland', lat: -36.8485, lng: 174.7633 },
        { name: 'Buenos Aires', lat: -34.6037, lng: -58.3816 },
        { name: 'Perth', lat: -31.9505, lng: 115.8605 },
      ]

      southernCities.forEach(({ name, lat, lng }) => {
        const [x, y, z] = latLngToVector3(lat, lng, 1)
        expect(y, `${name} should have negative y`).toBeLessThan(0)
      })
    })
  })

  describe('great-circle distances - verified against haversine formula', () => {
    // All distances verified against haversine formula and multiple online calculators
    // Tolerance: 1 km (accounts for floating point, not Earth ellipsoid which adds ~0.3% error)
    const TOLERANCE_KM = 1

    test('matches haversine formula for all city pairs', () => {
      const cityPairs = [
        { from: 'NYC', to: 'London', lat1: 40.7128, lng1: -74.006, lat2: 51.5074, lng2: -0.1278 },
        { from: 'Tokyo', to: 'Sydney', lat1: 35.6762, lng1: 139.6503, lat2: -33.8688, lng2: 151.2093 },
        { from: 'LA', to: 'Sydney', lat1: 34.0522, lng1: -118.2437, lat2: -33.8688, lng2: 151.2093 },
        { from: 'Cape Town', to: 'Moscow', lat1: -33.9249, lng1: 18.4241, lat2: 55.7558, lng2: 37.6173 },
        { from: 'Mumbai', to: 'Cairo', lat1: 19.0760, lng1: 72.8777, lat2: 30.0444, lng2: 31.2357 },
        { from: 'Singapore', to: 'London', lat1: 1.3521, lng1: 103.8198, lat2: 51.5074, lng2: -0.1278 },
        { from: 'Rio', to: 'Tokyo', lat1: -22.9068, lng1: -43.1729, lat2: 35.6762, lng2: 139.6503 },
      ]

      cityPairs.forEach(({ from, to, lat1, lng1, lat2, lng2 }) => {
        const expected = haversineDistance(lat1, lng1, lat2, lng2)
        const actual = distanceViaVector3(lat1, lng1, lat2, lng2)
        
        expect(
          Math.abs(actual - expected),
          `${from} to ${to}: expected ${expected.toFixed(1)}km, got ${actual.toFixed(1)}km`
        ).toBeLessThan(TOLERANCE_KM)
      })
    })

    // Verified distances from https://www.distance.to and multiple sources
    test('NYC to London: ~5570 km', () => {
      const dist = distanceViaVector3(40.7128, -74.006, 51.5074, -0.1278)
      expect(dist).toBeGreaterThan(5565)
      expect(dist).toBeLessThan(5575)
    })

    test('Tokyo to Sydney: ~7826 km', () => {
      const dist = distanceViaVector3(35.6762, 139.6503, -33.8688, 151.2093)
      expect(dist).toBeGreaterThan(7820)
      expect(dist).toBeLessThan(7830)
    })

    test('Cape Town to Moscow: ~10137 km', () => {
      const dist = distanceViaVector3(-33.9249, 18.4241, 55.7558, 37.6173)
      expect(dist).toBeGreaterThan(10132)
      expect(dist).toBeLessThan(10142)
    })

    test('same point returns 0 distance', () => {
      const dist = distanceViaVector3(40.7128, -74.006, 40.7128, -74.006)
      expect(dist).toBeCloseTo(0, 5)
    })

    test('antipodal points: half Earth circumference (~20015 km)', () => {
      // Antipode of (0,0) is (0,180)
      const dist = distanceViaVector3(0, 0, 0, 180)
      const expected = Math.PI * EARTH_RADIUS // half circumference
      expect(dist).toBeCloseTo(expected, 0)
    })
  })

  describe('antipodal points - mathematical properties', () => {
    test('antipodal vectors are exactly opposite', () => {
      const testCases = [
        { lat: 40, lng: -74 },   // NYC area
        { lat: 51, lng: 0 },     // London area
        { lat: -33, lng: 151 },  // Sydney area
        { lat: 0, lng: 0 },      // Null Island
        { lat: 45, lng: 90 },    // Central Asia
      ]

      testCases.forEach(({ lat, lng }) => {
        const p1 = latLngToVector3(lat, lng, 1)
        const antipodeLat = -lat
        const antipodeLng = lng > 0 ? lng - 180 : lng + 180
        const p2 = latLngToVector3(antipodeLat, antipodeLng, 1)

        expect(p1[0]).toBeCloseTo(-p2[0], 10)
        expect(p1[1]).toBeCloseTo(-p2[1], 10)
        expect(p1[2]).toBeCloseTo(-p2[2], 10)
      })
    })

    test('antipodal dot product is exactly -1', () => {
      const p1 = latLngToVector3(40.7128, -74.006, 1)
      const p2 = latLngToVector3(-40.7128, 105.994, 1) // antipode

      const dot = p1[0]*p2[0] + p1[1]*p2[1] + p1[2]*p2[2]
      expect(dot).toBeCloseTo(-1, 10)
    })
  })

  describe('latitude symmetry - same latitude = same y', () => {
    test('points at same latitude have identical y values', () => {
      const latitudes = [0, 15, 30, 45, 60, 75, -15, -30, -45, -60]
      const longitudes = [-180, -90, 0, 90, 180]

      latitudes.forEach(lat => {
        const yValues = longitudes.map(lng => latLngToVector3(lat, lng, 1)[1])
        
        // All y values should be identical for same latitude
        yValues.forEach(y => {
          expect(y).toBeCloseTo(yValues[0], 10)
        })
      })
    })

    test('y value equals cos(90 - lat) = sin(lat)', () => {
      const latitudes = [0, 30, 45, 60, 90, -30, -45, -60, -90]

      latitudes.forEach(lat => {
        const [x, y, z] = latLngToVector3(lat, 0, 1)
        const expected = Math.sin(lat * Math.PI / 180)
        expect(y).toBeCloseTo(expected, 10)
      })
    })
  })

  describe('longitude wrapping - edge cases', () => {
    test('180° and -180° are the same point', () => {
      const latitudes = [0, 45, -45, 89, -89]

      latitudes.forEach(lat => {
        const p1 = latLngToVector3(lat, 180, 1)
        const p2 = latLngToVector3(lat, -180, 1)

        expect(p1[0]).toBeCloseTo(p2[0], 10)
        expect(p1[1]).toBeCloseTo(p2[1], 10)
        expect(p1[2]).toBeCloseTo(p2[2], 10)
      })
    })

    test('longitude values > 180 wrap correctly', () => {
      const p1 = latLngToVector3(0, 270, 1)
      const p2 = latLngToVector3(0, -90, 1)

      expect(p1[0]).toBeCloseTo(p2[0], 10)
      expect(p1[1]).toBeCloseTo(p2[1], 10)
      expect(p1[2]).toBeCloseTo(p2[2], 10)
    })

    test('longitude values < -180 wrap correctly', () => {
      const p1 = latLngToVector3(0, -270, 1)
      const p2 = latLngToVector3(0, 90, 1)

      expect(p1[0]).toBeCloseTo(p2[0], 10)
      expect(p1[1]).toBeCloseTo(p2[1], 10)
      expect(p1[2]).toBeCloseTo(p2[2], 10)
    })
  })

  describe('edge cases', () => {
    test('radius 0 returns origin', () => {
      const [x, y, z] = latLngToVector3(45, 90, 0)
      expect(x).toBeCloseTo(0, 10)
      expect(y).toBeCloseTo(0, 10)
      expect(z).toBeCloseTo(0, 10)
    })

    test('negative radius inverts the point', () => {
      const p1 = latLngToVector3(45, 90, 1)
      const p2 = latLngToVector3(45, 90, -1)

      expect(p1[0]).toBeCloseTo(-p2[0], 10)
      expect(p1[1]).toBeCloseTo(-p2[1], 10)
      expect(p1[2]).toBeCloseTo(-p2[2], 10)
    })

    test('very small distances are accurate', () => {
      // Two points ~1km apart in NYC
      const lat1 = 40.7128
      const lng1 = -74.006
      const lat2 = 40.7218  // ~1km north
      const lng2 = -74.006

      const dist = distanceViaVector3(lat1, lng1, lat2, lng2)
      const expected = haversineDistance(lat1, lng1, lat2, lng2)

      expect(Math.abs(dist - expected)).toBeLessThan(0.01) // within 10 meters
    })
  })
})