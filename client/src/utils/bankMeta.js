// Mirrors SUPPORT_LEVELS in server/src/schemas/bank.schema.js.
export const SUPPORT_LEVELS = ['Platinum', 'Gold', 'Silver']

const LEVEL_STYLE = {
  Platinum: { text: 'text-review', bg: 'bg-review/10', border: 'border-review/25', dot: 'bg-review' },
  Gold: { text: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-300/60', dot: 'bg-amber-500' },
  Silver: { text: 'text-slate-600', bg: 'bg-slate-100', border: 'border-slate-300/70', dot: 'bg-slate-400' },
}

export const getSupportLevelStyle = (level) => LEVEL_STYLE[level] || LEVEL_STYLE.Silver

// SLA calendar (server/src/services/sla/business-calendar.js): which days
// count, in the bank's own time zone.
export const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
export const DEFAULT_WORKING_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI']

export const TIME_ZONES = [
  { value: 'Africa/Nairobi', label: 'Kenya (Africa/Nairobi)' },
  { value: 'Africa/Kigali', label: 'Rwanda (Africa/Kigali)' },
  { value: 'Africa/Dar_es_Salaam', label: 'Tanzania (Africa/Dar_es_Salaam)' },
  { value: 'Africa/Kampala', label: 'Uganda (Africa/Kampala)' },
  { value: 'Africa/Accra', label: 'Ghana (Africa/Accra)' },
  { value: 'Africa/Lagos', label: 'Nigeria (Africa/Lagos)' },
  { value: 'Africa/Conakry', label: 'Guinea (Africa/Conakry)' },
  { value: 'Africa/Dakar', label: 'Senegal (Africa/Dakar)' },
  { value: 'Africa/Kinshasa', label: 'Congo (Africa/Kinshasa)' },
  { value: 'Indian/Mauritius', label: 'Mauritius (Indian/Mauritius)' },
  { value: 'Asia/Dubai', label: 'UAE (Asia/Dubai)' },
  { value: 'Asia/Muscat', label: 'Oman (Asia/Muscat)' },
  { value: 'Asia/Ho_Chi_Minh', label: 'Vietnam (Asia/Ho_Chi_Minh)' },
  { value: 'Asia/Kolkata', label: 'India (Asia/Kolkata)' },
]

// Support window (server: Support_Start_Ist / Support_End_Ist) - IST, the
// support team's clock. Resolution time only counts inside it on working
// days; a 24x7 bank counts the full day.
export const DEFAULT_SUPPORT_START_IST = '10:30'
export const DEFAULT_SUPPORT_END_IST = '19:30'
const IST_OFFSET_MINUTES = 330 // Asia/Kolkata, no DST

/** "10:30" IST -> "08:00" in `timeZone` (today's offset). */
export const istToLocalTime = (hhmm, timeZone) => {
  const [hour, minute] = String(hhmm).split(':').map(Number)
  if (Number.isNaN(hour) || Number.isNaN(minute) || !timeZone) return null
  const now = new Date()
  const utcMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, minute) - IST_OFFSET_MINUTES * 60000
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(utcMs))
  } catch {
    return null
  }
}

/** "10:30–19:30 IST", or "24x7". */
export const formatSupportHours = (bank) =>
  bank.Is_24x7 === 'Y' ? '24x7' : `${bank.Support_Start_Ist || DEFAULT_SUPPORT_START_IST}–${bank.Support_End_Ist || DEFAULT_SUPPORT_END_IST} IST`

/** "08:00–17:00 local" for the bank's time zone, or null. */
export const formatLocalSupportHours = (bank) => {
  if (bank.Is_24x7 === 'Y') return null
  const start = istToLocalTime(bank.Support_Start_Ist || DEFAULT_SUPPORT_START_IST, bank.Time_Zone)
  const end = istToLocalTime(bank.Support_End_Ist || DEFAULT_SUPPORT_END_IST, bank.Time_Zone)
  return start && end ? `${start}–${end} local` : null
}

const titleDay = (day) => day.charAt(0) + day.slice(1).toLowerCase()

/** "MON,TUE,WED,THU,FRI" -> "Mon – Fri"; non-contiguous days are listed. Handles week wrap (Sun – Thu). */
export const formatWorkingDays = (csv, is24x7) => {
  if (is24x7) return '24x7'
  const days = (csv || '').split(',').filter((d) => WEEKDAYS.includes(d))
  if (days.length === 0) return '—'
  if (days.length === 7) return 'All days'
  const set = new Set(days)
  // find a start day whose previous day is not working, then walk forward
  const start = WEEKDAYS.findIndex((d, i) => set.has(d) && !set.has(WEEKDAYS[(i + 6) % 7]))
  if (start !== -1) {
    const run = []
    for (let i = 0; i < 7 && set.has(WEEKDAYS[(start + i) % 7]); i += 1) run.push(WEEKDAYS[(start + i) % 7])
    if (run.length === days.length) return run.length === 1 ? titleDay(run[0]) : `${titleDay(run[0])} – ${titleDay(run[run.length - 1])}`
  }
  return WEEKDAYS.filter((d) => set.has(d)).map(titleDay).join(', ')
}
