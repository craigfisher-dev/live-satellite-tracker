import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { filterByNetwork, filterByAltitude, setActiveFilter } from '../utils/SatelliteFilter'
import * as Cesium from 'cesium'

// Array of legend pages. Each page has 3 parts:
// title: Name shown at the top of the legend
// filterFn: The function that colors the satellites on the globe for this page
// items: The color key shown in the legend (label + color)
// The colors here must match the colors SatelliteFilter applies to the satellites
const filters = [
  {
    // Network page: colors satellites by constellation (Starlink, GPS, etc.)
    title: 'Network',
    filterFn: filterByNetwork,
    items: [
      { label: 'Starlink', color: Cesium.Color.DODGERBLUE },
      { label: 'OneWeb', color: Cesium.Color.LIMEGREEN },
      { label: 'Kuiper', color: Cesium.Color.ORANGE },
      { label: 'Iridium', color: Cesium.Color.YELLOW },
      { label: 'GPS', color: Cesium.Color.RED },
      { label: 'Globalstar', color: Cesium.Color.MAGENTA },
      { label: 'Galileo', color: Cesium.Color.CYAN },
      { label: 'GLONASS', color: Cesium.Color.ORANGERED },
      { label: 'Beidou', color: Cesium.Color.GOLD },
      { label: 'Qianfan', color: Cesium.Color.PURPLE },
      { label: 'Planet', color: Cesium.Color.TOMATO },
      { label: 'Other', color: Cesium.Color.GREY },
    ]
  },
  {
    // Altitude page: colors satellites by orbit height (ranges are approximate, keep them in sync with filterByAltitude)
    title: 'Altitude',
    filterFn: filterByAltitude,
    items: [
      { label: 'LEO (< 2,000 km)', color: Cesium.Color.DODGERBLUE },
      { label: 'MEO (2,000 - 35,000 km)', color: Cesium.Color.LIMEGREEN },
      { label: 'GEO (~35,786 km)', color: Cesium.Color.TOMATO },
      { label: 'HEO (> 36,000 km)', color: Cesium.Color.DARKMAGENTA },
    ]
  },
]

// The UI Component that handles showing the Legend in the top right of the UI
// It also acts as the switch: changing the page changes how the satellites are colored on the globe
export default function Legend() {
  // Which page is showing (0 = Network, 1 = Altitude)
  const [currentPage, setCurrentPage] = useState(0)

  // Number of pages, and the page being shown right now
  const totalPages = filters.length
  const currentFilter = filters[currentPage]

  // Shows the new page and tells the globe to use that page's filter (legend and satellite colors always change together)
  function switchTo(newPage: number) {
    setCurrentPage(newPage)
    setActiveFilter(filters[newPage].filterFn)
  }

  // Previous page (wraps around: going back from the first page lands on the last)
  function handlePrev() {
    switchTo(currentPage === 0 ? totalPages - 1 : currentPage - 1)
  }

  // Next page (wraps around: going forward from the last page lands on the first)
  function handleNext() {
    switchTo(currentPage === totalPages - 1 ? 0 : currentPage + 1)
  }

  return (
    // Legend box: dark rounded panel, capped to the screen height
    <div style={{
      background: 'rgba(0, 0, 0, 0.8)',
      borderRadius: '12px',
      padding: '6px 12px',
      color: 'white',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '12px',
      width: 'auto',
      border: '1px solid rgba(255,255,255,0.1)',
      overflow: 'hidden',
      maxHeight: 'calc(100vh - 64px)'
    }}>
      {/* Header row: previous arrow, page title, next arrow */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <button onClick={handlePrev} className="p-1">
          <ChevronLeft className="w-4 h-4 text-white" />
        </button>
        <span style={{ fontWeight: 'bold' }}>{currentFilter.title}</span>
        <button onClick={handleNext} className="p-1">
          <ChevronRight className="w-4 h-4 text-white" />
        </button>
      </div>

      {/* Page counter: current page out of total, e.g. 1 / 2 */}
      <div style={{ textAlign: 'center', fontSize: '12px', color: '#aaa', marginBottom: '4px' }}>
        {currentPage + 1} / {totalPages}
      </div>

      {/* Color key: one row per item, a colored dot (item.color as CSS) and its label */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {currentFilter.items.map((item) => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              backgroundColor: item.color.toCssColorString(),
            }} />
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}