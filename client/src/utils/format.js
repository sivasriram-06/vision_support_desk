// The server stores and returns every time as IST ISO with its offset
// (2026-09-30T17:53:00.123+05:30); times are also shown in IST, whatever the
// browser's own zone.
export const IST_ZONE = 'Asia/Kolkata'

/** A stored timestamp -> Date (or null). Old 'YYYY-MM-DD HH:MM:SS' values are UTC. */
export const parseTime = (value) => {
  if (!value) return null
  if (value instanceof Date) return value
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z')
  return Number.isNaN(date.getTime()) ? null : date
}

/** Formats a timestamp as e.g. "21 Sep, 2:42 PM" (IST). Returns "-" for empty input. */
export const formatDateTime = (value) => {
  const date = parseTime(value)
  if (!date) return '-'
  return date.toLocaleString(undefined, {
    timeZone: IST_ZONE,
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** Formats a timestamp as a short date, e.g. "21 Sep 2026" (IST). */
export const formatDate = (value) => {
  const date = parseTime(value)
  if (!date) return '-'
  return date.toLocaleDateString(undefined, { timeZone: IST_ZONE, day: 'numeric', month: 'short', year: 'numeric' })
}

/** "John Doe" -> "JD", "Support Ticket" -> "S". Used for avatar initials. */
export const getInitials = (name) => {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/** Formats byte counts for attachment sizes, e.g. 380751 -> "372 KB". */
export const formatFileSize = (bytes) => {
  if (!bytes && bytes !== 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
