import { useEffect, useState, useCallback } from 'react'
import { getSatelliteProfile } from '../utils/profileCache'

interface SatelliteProfile {
  norad_id: number
  name: string
  country: string | null
  launch_date: string | null
  launch_site: string | null
  object_type: string | null
  purpose: string | null
  description: string | null
  image_url: string | null
  current: boolean | null
  rcs_size: string | null
  decay_date: string | null
}

interface SatelliteInfoPanelProps {
  noradId: number | null
  omm: any | null
  livePosition: { lat: number, lon: number, alt: number } | null
  onClose: () => void
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Unknown'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function getStatusColor(current: boolean | null): string {
  if (current === null) return '#888780'
  return current ? '#1D9E75' : '#E24B4A'
}

function getStatusLabel(current: boolean | null): string {
  if (current === null) return 'Unknown'
  return current ? 'Active' : 'Inactive'
}

function getObjectTypeLabel(type: string | null): string {
  if (!type) return 'Unknown'
  const map: Record<string, string> = {
    'PAYLOAD': 'Payload',
    'ROCKET BODY': 'Rocket Body',
    'DEBRIS': 'Debris',
    'UNKNOWN': 'Unknown',
    'TBA': 'TBA',
  }
  return map[type.toUpperCase()] ?? type
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return 'Unknown'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  })
}

export function SatelliteInfoPanel({ noradId, omm, livePosition, onClose }: SatelliteInfoPanelProps) {
  const [profile, setProfile] = useState<SatelliteProfile | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [imgError, setImgError] = useState(false)
  const [showOrbital, setShowOrbital] = useState(false)
  const [notFound, setNotFound] = useState(false)


  const load = useCallback(async (id: number) => {
    setLoading(true)
    setError(null)
    setImgError(false)
    setProfile(null)
    setNotFound(false)

    // Profiles may still be bulk-loading into IndexedDB in the background.
    // Retry every 500ms for up to 30 seconds before giving up.
    const MAX_ATTEMPTS = 60
    const RETRY_MS = 500

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const data = await getSatelliteProfile(id)
        if (data) {
          setProfile(data)
          setLoading(false)
          return
        }
      } catch {
        // IndexedDB error — stop retrying
        setError('Failed to load profile. Try refreshing.')
        setLoading(false)
        return
      }

      // Not in IndexedDB yet — wait and retry
      await new Promise(res => setTimeout(res, RETRY_MS))
    }

    // Gave up after 30s — satellite not yet in DB, likely a new launch or satellite train
    setNotFound(true)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (noradId !== null) load(noradId)
  }, [noradId, load])

  if (noradId === null) return null

  return (
    <div className="satellite-info-panel" style={panelStyle}>

      {/* Header */}
      <div style={headerStyle}>
        <span style={headerTitleStyle}>Satellite Info</span>
        <button onClick={onClose} style={closeButtonStyle} aria-label="Close panel">
          ✕
        </button>
      </div>

      {/* Content */}
      <div style={contentStyle}>
        {loading && (
          <div style={stateStyle}>
            <div style={spinnerStyle} />
            <span style={{ color: '#888780', fontSize: 12 }}>Loading profile…</span>
          </div>
        )}

        {notFound && !loading && (
          <div style={stateStyle}>
            <p style={{ color: 'white', fontSize: 11, textAlign: 'center', margin: 0, lineHeight: 1.6 }}>
              No data available for this satellite yet.
            </p>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, textAlign: 'center', margin: 0, lineHeight: 1.6 }}>
              This may be part of a newly launched satellite train. A satellite train is a group of satellites deployed together from a single rocket that appear as a line of dots moving in formation. Profile data is typically available within 24 hours. Check back after the next TLE update.
            </p>
          </div>
        )}

        {error && !loading && (
          <div style={stateStyle}>
            <span style={{ color: '#E24B4A', fontSize: 11 }}>{error}</span>
          </div>
        )}

        {profile && !loading && (
          <>
            {/* Image — only renders if the satellite has one in the DB */}
            {profile.image_url && !imgError && (
              <div style={imageWrapStyle}>
                <img
                  src={profile.image_url}
                  alt={profile.name}
                  onError={() => setImgError(true)}
                  style={imageStyle}
                />
              </div>
            )}

            {/* Name + type badge + active/inactive status */}
            <div style={{ padding: '6px 12px 0' }}>
              <h2 style={nameStyle}>{profile.name}</h2>
              <div style={badgeRowStyle}>
                {profile.object_type && (
                  <span style={typeBadgeStyle}>{getObjectTypeLabel(profile.object_type)}</span>
                )}
                <span
                  style={{
                    ...statusBadgeStyle,
                    color: getStatusColor(profile.current),
                    borderColor: getStatusColor(profile.current),
                  }}
                >
                  {getStatusLabel(profile.current)}
                </span>
              </div>

              {/* Description — only shown for satellites with one in the DB */}
              {profile.description && (
                <p style={descriptionStyle}>{profile.description}</p>
              )}
            </div>

            {/* ── Satellite Profile ── */}
            <div style={detailsWrapStyle}>
              <div style={sectionLabelStyle}>Profile</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {[
                    { label: 'NORAD ID', value: String(profile.norad_id) },
                    { label: 'Country', value: profile.country },
                    { label: 'Launched', value: formatDate(profile.launch_date) },
                    { label: 'Decayed', value: formatDate(profile.decay_date) },
                    { label: 'Launch Site', value: profile.launch_site },
                    { label: 'Purpose', value: profile.purpose },
                    { label: 'RCS Size', value: profile.rcs_size },
                  ]
                    .filter(r => r.value && r.value !== 'Unknown')
                    .map(row => (
                      <tr key={row.label}>
                        <td style={labelCellStyle}>{row.label}</td>
                        <td style={valueCellStyle}>{row.value}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {/* ── Current Position — updates live from animation loop (1s interval) ── */}
            {livePosition && (
              <div style={detailsWrapStyle}>
                <div style={sectionLabelStyle}>Current Position</div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {[
                      { label: 'Latitude', value: `${livePosition.lat.toFixed(4)}°` },
                      { label: 'Longitude', value: `${livePosition.lon.toFixed(4)}°` },
                      { label: 'Altitude', value: `${livePosition.alt.toFixed(2)} km` },
                    ].map(row => (
                      <tr key={row.label}>
                        <td style={labelCellStyle}>{row.label}</td>
                        <td style={valueCellStyle}>{row.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── Orbital Elements — collapsed by default ── */}
            {omm && (
            <div style={detailsWrapStyle}>
                <div
                style={{ ...sectionLabelStyle, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                onClick={() => setShowOrbital(v => !v)}
                >
                <span>Orbital Elements</span>
                <span style={{ fontSize: 9, opacity: 0.5 }}>{showOrbital ? '▲' : '▼'}</span>
                </div>
                {showOrbital && (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                    {[
                        { label: 'Inclination', value: `${omm.INCLINATION}°` },
                        { label: 'Eccentricity', value: String(omm.ECCENTRICITY) },
                        { label: 'Period', value: `${(1440 / omm.MEAN_MOTION).toFixed(1)} min` },
                        { label: 'Mean Motion', value: `${omm.MEAN_MOTION} rev/day` },
                        { label: 'RAAN', value: `${omm.RA_OF_ASC_NODE}°` },
                        { label: 'Arg of Perigee', value: `${omm.ARG_OF_PERICENTER}°` },
                        { label: 'Mean Anomaly', value: `${omm.MEAN_ANOMALY}°` },
                        { label: 'Last Updated', value: formatDateTime(omm.EPOCH) },
                    ].map(row => (
                        <tr key={row.label}>
                        <td style={labelCellStyle}>{row.label}</td>
                        <td style={valueCellStyle}>{row.value}</td>
                        </tr>
                    ))}
                    </tbody>
                </table>
                )}
            </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/* ─── Styles ─────────────────────────────────────────────────────────── */

const panelStyle: React.CSSProperties = {
  position: 'fixed',
  top: 43,
  right: 7,
  width: 225,
  maxHeight: 'calc(100vh - 100px)',
  background: 'rgba(0, 0, 0, 0.8)',
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.1)',
  color: '#f0ede8',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  zIndex: 1000,
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '6px 12px',
  borderBottom: '1px solid rgba(255,255,255,0.1)',
  flexShrink: 0,
}

const headerTitleStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'white'
}

const closeButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'rgba(255,100,100,0.7)', // Red
  fontSize: 12,
  cursor: 'pointer',
  padding: '2px 4px',
  lineHeight: 1,
}

const contentStyle: React.CSSProperties = {
  overflowY: 'auto',
  flex: 1,
  scrollbarWidth: 'none',
  msOverflowStyle: 'none' as any,
}

const stateStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 8,
  padding: '24px 12px',
}

const spinnerStyle: React.CSSProperties = {
  width: 16,
  height: 16,
  border: '2px solid rgba(255,255,255,0.1)',
  borderTopColor: '#1D9E75',
  borderRadius: '50%',
  animation: 'spin 0.8s linear infinite',
}

const imageWrapStyle: React.CSSProperties = {
  width: '100%',
  aspectRatio: '16/9',
  overflow: 'hidden',
  background: 'rgba(0,0,0,0.8)',
}

const imageStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  objectPosition: 'center',
  display: 'block',
}

const nameStyle: React.CSSProperties = {
  margin: '0 0 4px',
  fontSize: 12,
  fontWeight: 600,
  lineHeight: 1.3,
  color: 'white',
}

const badgeRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 4,
  flexWrap: 'wrap',
  marginBottom: 6,
}

const typeBadgeStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 500,
  padding: '1px 6px',
  borderRadius: 4,
  background: 'rgba(255,255,255,0.07)',
  color: 'white',
  border: '1px solid rgba(255,255,255,0.2)',
}

const statusBadgeStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 500,
  padding: '1px 6px',
  borderRadius: 4,
  background: 'transparent',
  border: '1px solid',
}

const descriptionStyle: React.CSSProperties = {
  fontSize: 10,
  lineHeight: 1.5,
  color: 'white',
  margin: '0 0 4px',
}

const detailsWrapStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderTop: '1px solid rgba(255,255,255,0.1)',
  marginTop: 2,
}

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'white',
  marginBottom: 4,
}

const labelCellStyle: React.CSSProperties = {
  fontSize: 10,
  color: 'white',
  padding: '2px 0',
  width: '45%',
  verticalAlign: 'top',
}

const valueCellStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'white',
  padding: '2px 0',
  verticalAlign: 'top',
}