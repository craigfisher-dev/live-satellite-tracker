import { useEffect, useState, useCallback, useRef } from 'react'
import { getSatelliteProfile } from '../utils/profileCache'

// The shape of one satellite profile, loaded with getSatelliteProfile from the local cache (IndexedDB)
// A field is null when there is no value for it
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
}

// SatelliteInfoPanel is a React component that has 4 props:
// noradId: ID of the selected satellite, used to load its profile (null = nothing selected, so the panel is hidden)
// omm: Orbital elements for the Orbital Elements section (the section is hidden if this is null)
// livePosition: Current latitude, longitude and altitude (km) for the Current Position section (hidden if null)
// onClose: Function called when the close button is clicked
interface SatelliteInfoPanelProps {
  noradId: number | null
  omm: any | null
  livePosition: { lat: number, lon: number, alt: number } | null
  onClose: () => void
}

// Formats a date string like "Nov 21, 2026"
// Missing date: "Unknown". Text that is not a valid date is shown as it came
function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Unknown'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

// Color of the status badge: grey = unknown, green = active, red = inactive
function getStatusColor(current: boolean | null): string {
  if (current === null) return '#888780'
  return current ? '#1D9E75' : '#E24B4A'
}

// Text of the status badge: Unknown, Active or Inactive
function getStatusLabel(current: boolean | null): string {
  if (current === null) return 'Unknown'
  return current ? 'Active' : 'Inactive'
}

// Turns the database object type (all caps, e.g. "ROCKET BODY") into a readable label
// A type that is not in the list is shown as it came
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

// Formats a date string with the time in the viewer's time zone, e.g. "Nov 21, 2026, 02:30 PM EST"
// Same fallbacks as formatDate
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

// The info panel on the right side of the screen for the selected satellite.
// Shows the profile, the live position, and the orbital elements (collapsed by default)
// Shows nothing when no satellite is selected
export function SatelliteInfoPanel({ noradId, omm, livePosition, onClose }: SatelliteInfoPanelProps) {
  const [profile, setProfile] = useState<SatelliteProfile | null>(null)  // The satellite's profile from the database
  const [loading, setLoading] = useState(false)  // True while the profile is being fetched
  const [error, setError] = useState<string | null>(null)  // Error message to show, if there is one
  const [imgError, setImgError] = useState(false)  // True if the image failed to load (the image is then hidden)
  const [showOrbital, setShowOrbital] = useState(false)  // Whether the Orbital Elements section is expanded
  const [notFound, setNotFound] = useState(false)  // True if no profile was found after retrying (shows "No data available")
  const loadIdRef = useRef(0)  // Counts loads, so an old load can tell a newer one has started

  // Loads the profile for one satellite from the local cache (IndexedDB)
  // Makes sure the panel always shows the satellite you clicked last, even if an earlier load finishes later (a race condition)
  // How: loadIdRef is a shared counter. Each call adds 1 and keeps its own copy (currentLoadId)
  // After each wait, a call compares its copy to the counter. If they differ, a newer load started, so this one quits
  // The counter can't realistically overflow (JS numbers stay exact up to about 9 quadrillion) and it resets on page reload
  const load = useCallback(async (id: number) => {
    const currentLoadId = ++loadIdRef.current

    // Reset everything before loading the new satellite
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
      // A newer load started (user clicked a different satellite) — bail out
      if (loadIdRef.current !== currentLoadId) return

      try {
        const data = await getSatelliteProfile(id)
        if (data) {
          // Check again after await — another load may have started while we were waiting
          if (loadIdRef.current !== currentLoadId) return
          setProfile(data)
          setLoading(false)
          return
        }
      } catch {
        // IndexedDB error — stop retrying
        if (loadIdRef.current !== currentLoadId) return
        setError('Failed to load profile. Try refreshing.')
        setLoading(false)
        return
      }

      // Not in IndexedDB yet — wait and retry
      await new Promise(res => setTimeout(res, RETRY_MS))
    }

    // Gave up after 30s — satellite not yet in DB, likely a new launch or satellite train
    if (loadIdRef.current !== currentLoadId) return
    setNotFound(true)
    setLoading(false)
  }, [])  // Empty array: load is created once and never changes

  // Loads the profile whenever a different satellite is selected
  useEffect(() => {
    if (noradId !== null) load(noradId)
  }, [noradId, load])

  // Nothing selected, so show nothing
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
        {/* Loading: spinner while the profile is being fetched */}
        {loading && (
          <div style={stateStyle}>
            <div style={spinnerStyle} />
            <span style={{ color: '#888780', fontSize: 12 }}>Loading profile…</span>
          </div>
        )}

        {/* Not found: shown after retrying for 30 seconds with no profile */}
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

        {/* Error: shown if the profile failed to load */}
        {error && !loading && (
          <div style={stateStyle}>
            <span style={{ color: '#E24B4A', fontSize: 11 }}>{error}</span>
          </div>
        )}

        {/* Profile loaded: image, name, and the details sections */}
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
                    // Best name to sum up country code and organization code in one word
                    { label: 'Source', value: profile.country },
                    { label: 'Launched', value: formatDate(profile.launch_date) },
                    { label: 'Launch Site', value: profile.launch_site },
                    { label: 'Purpose', value: profile.purpose },
                    { label: 'RCS Size', value: profile.rcs_size },
                  ]
                    // Hides rows with no value
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
                {/* Table is only shown when the section is expanded */}
                {showOrbital && (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                      {[
                        { label: 'Inclination', value: `${omm.INCLINATION}°` },
                        { label: 'Eccentricity', value: String(omm.ECCENTRICITY) },
                        // Period in minutes = 1440 minutes in a day / revolutions per day
                        { label: 'Period', value: `${(1440 / omm.MEAN_MOTION).toFixed(1)} min` },
                        { label: 'Mean Motion', value: `${omm.MEAN_MOTION} rev/day` },
                        { label: 'RAAN', value: `${omm.RA_OF_ASC_NODE}°` },
                        { label: 'Arg of Perigee', value: `${omm.ARG_OF_PERICENTER}°` },
                        { label: 'Mean Anomaly', value: `${omm.MEAN_ANOMALY}°` },
                        // EPOCH is the time these orbital elements were measured
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

// The panel box: fixed to the top right, dark and rounded, content scrolls inside
const panelStyle: React.CSSProperties = {
  position: 'fixed',
  top: 43,
  right: 7,
  width: 250,     // Note: change to 225 if you want to be same size as HelpPanel.tsx
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

// Top bar: title on the left, close button on the right
const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '6px 12px',
  borderBottom: '1px solid rgba(255,255,255,0.1)',
  flexShrink: 0,
}

// "Satellite Info" title text
const headerTitleStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'white'
}

// The close button (red X)
const closeButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'rgba(255,100,100,0.7)', // Red
  fontSize: 12,
  cursor: 'pointer',
  padding: '2px 4px',
  lineHeight: 1,
}

// Scrollable area under the header (scrollbar hidden)
const contentStyle: React.CSSProperties = {
  overflowY: 'auto',
  flex: 1,
  scrollbarWidth: 'none',
  msOverflowStyle: 'none' as any,
}

// Centered box for the loading, not found and error messages
const stateStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 8,
  padding: '24px 12px',
}

// Loading spinner (uses the spin animation)
const spinnerStyle: React.CSSProperties = {
  width: 16,
  height: 16,
  border: '2px solid rgba(255,255,255,0.1)',
  borderTopColor: '#1D9E75',
  borderRadius: '50%',
  animation: 'spin 0.8s linear infinite',
}

// 16:9 box that holds the satellite image
const imageWrapStyle: React.CSSProperties = {
  width: '100%',
  aspectRatio: '16/9',
  overflow: 'hidden',
  background: 'rgba(0,0,0,0.8)',
}

// Image fills the box and is cropped to fit
const imageStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  objectPosition: 'center',
  display: 'block',
}

// Satellite name
const nameStyle: React.CSSProperties = {
  margin: '0 0 4px',
  fontSize: 12,
  fontWeight: 600,
  lineHeight: 1.3,
  color: 'white',
}

// Row that holds the type and status badges
const badgeRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 4,
  flexWrap: 'wrap',
  marginBottom: 6,
}

// Badge for the object type (Payload, Debris, etc.)
const typeBadgeStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 500,
  padding: '1px 6px',
  borderRadius: 4,
  background: 'rgba(255,255,255,0.07)',
  color: 'white',
  border: '1px solid rgba(255,255,255,0.2)',
}

// Badge for Active, Inactive or Unknown (its color is set where it is used)
const statusBadgeStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 500,
  padding: '1px 6px',
  borderRadius: 4,
  background: 'transparent',
  border: '1px solid',
}

// Description text
const descriptionStyle: React.CSSProperties = {
  fontSize: 10,
  lineHeight: 1.5,
  color: 'white',
  margin: '0 0 4px',
}

// Wrapper for each details section (Profile, Current Position, Orbital Elements)
const detailsWrapStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderTop: '1px solid rgba(255,255,255,0.1)',
  marginTop: 2,
}

// Section heading (Profile, Current Position, Orbital Elements)
const sectionLabelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'white',
  marginBottom: 4,
}

// Left cell of a table row (the label)
const labelCellStyle: React.CSSProperties = {
  fontSize: 10,
  color: 'white',
  padding: '2px 0',
  width: '45%',
  verticalAlign: 'top',
}

// Right cell of a table row (the value)
const valueCellStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'white',
  padding: '2px 0',
  verticalAlign: 'top',
}