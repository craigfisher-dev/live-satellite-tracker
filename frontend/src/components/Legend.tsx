import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { filterByNetwork, filterByAltitude, setActiveFilter } from '../utils/SatelliteFilter'
import * as Cesium from 'cesium'

const filters = [
  {
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

export default function Legend() {
  const [currentPage, setCurrentPage] = useState(0)

  const totalPages = filters.length
  const currentFilter = filters[currentPage]

  function switchTo(newPage: number) {
    setCurrentPage(newPage)
    setActiveFilter(filters[newPage].filterFn)
  }

  function handlePrev() {
    switchTo(currentPage === 0 ? totalPages - 1 : currentPage - 1)
  }

  function handleNext() {
    switchTo(currentPage === totalPages - 1 ? 0 : currentPage + 1)
  }

  return (
    <div style={{
      background: 'rgba(0, 0, 0, 0.7)',
      borderRadius: '8px',
      padding: '12px',
      color: 'white',
      fontFamily: 'sans-serif',
      fontSize: '13px',
      minWidth: '180px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <button onClick={handlePrev} className="p-1 bg-black/70 rounded">
          <ChevronLeft className="w-4 h-4 text-white" />
        </button>
        <span style={{ fontWeight: 'bold' }}>{currentFilter.title}</span>
        <button onClick={handleNext} className="p-1 bg-black/70 rounded">
          <ChevronRight className="w-4 h-4 text-white" />
        </button>
      </div>

      <div style={{ textAlign: 'center', fontSize: '11px', color: '#aaa', marginBottom: '8px' }}>
        {currentPage + 1} / {totalPages}
      </div>

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