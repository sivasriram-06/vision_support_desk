import { Route } from 'lucide-react'
import Avatar from '../../ui/Avatar.jsx'
import { getWorkStyle, WORK_STATES, STATUS_BAR } from '../../../utils/workMeta.js'
import { formatMinutes } from '../../../utils/clockMeta.js'
import { formatDateTime } from '../../../utils/format.js'

const ms = (iso) => new Date(iso).getTime()

/** Five evenly spaced time labels across the track. */
function Axis({ start, end }) {
  const ticks = Array.from({ length: 5 }, (_, i) => start + ((end - start) * i) / 4)
  return (
    <div className="relative h-5 text-[10.5px] text-muted">
      {ticks.map((t, i) => (
        <span
          key={t}
          className="absolute top-0 whitespace-nowrap"
          style={{ left: `${(i / 4) * 100}%`, transform: i === 0 ? 'none' : i === 4 ? 'translateX(-100%)' : 'translateX(-50%)' }}
        >
          {formatDateTime(new Date(t))}
        </span>
      ))}
    </div>
  )
}

/** Absolutely placed bars inside a lane track. */
function Bars({ items, start, end }) {
  const span = Math.max(1, end - start)
  return (
    <div className="relative h-6 rounded-md bg-slate-100/80">
      {items.map((item) => {
        const left = ((ms(item.startTime) - start) / span) * 100
        const width = Math.max(0.4, ((ms(item.endTime) - ms(item.startTime)) / span) * 100)
        return (
          <span
            key={`${item.startTime}-${item.label}`}
            title={item.title}
            className={`absolute top-0.5 bottom-0.5 rounded ${item.className} ${item.highlight ? 'ring-2 ring-danger ring-offset-1' : ''}`}
            style={{ left: `${left}%`, width: `${width}%` }}
          />
        )
      })}
    </div>
  )
}

/**
 * Gantt-style view: a row for the ticket's status, then one row per
 * assignee's work coloured by work state. Overlapping bars = parallel
 * work; amber = waiting on someone else. The critical path is marked and
 * the longest wait is outlined in red.
 */
export default function TrackingSwimlane({ tracking }) {
  const start = ms(tracking.startTime)
  const end = ms(tracking.endTime)
  const critical = new Set(tracking.summary.criticalPath.assignmentIds)
  const longest = tracking.summary.longestWait
  const laneById = new Map(tracking.lanes.map((l) => [l.assignmentId, l]))

  const statusItems = tracking.statuses.map((s) => ({
    startTime: s.startTime,
    endTime: s.endTime,
    label: s.status,
    className: STATUS_BAR[s.clock] || STATUS_BAR.NOT_STARTED,
    title: `${s.status} · ${formatMinutes(s.elapsed)} (${formatMinutes(s.support)} in support hours)\n${formatDateTime(s.startTime)} - ${formatDateTime(s.endTime)}`,
    highlight: longest?.kind === 'STATUS' && longest.startTime === s.startTime,
  }))

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-[200px_1fr] gap-x-3 gap-y-2.5">
        <div />
        <Axis start={start} end={end} />

        <div className="flex items-center gap-2">
          <span className="rounded-md bg-navy/5 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-navy">Ticket status</span>
        </div>
        <Bars items={statusItems} start={start} end={end} />

        {tracking.lanes.map((lane) => {
          const blockers = lane.blockedBy.map((id) => laneById.get(id)).filter(Boolean)
          const items = lane.stretches.map((s) => {
            const style = getWorkStyle(s.state)
            return {
              startTime: s.startTime,
              endTime: s.endTime,
              label: s.state,
              className: style.bar,
              title: `${lane.name} · ${style.label}${s.note ? ` - ${s.note}` : ''}\n${formatDateTime(s.startTime)} - ${formatDateTime(s.endTime)}`,
              highlight: longest?.kind === 'WORK' && longest.laneId === lane.assignmentId && longest.startTime === s.startTime,
            }
          })
          return (
            <div key={lane.assignmentId} className="contents">
              <div className={`flex min-w-0 items-center gap-2 ${lane.current ? '' : 'opacity-60'}`}>
                <Avatar name={lane.name} size={24} />
                <div className="min-w-0">
                  <p className="flex items-center gap-1 truncate text-[12.5px] font-semibold text-ink">
                    <span className="truncate">{lane.name}</span>
                    {critical.has(lane.assignmentId) && critical.size > 1 && (
                      <Route className="h-3 w-3 shrink-0 text-danger" aria-label="On the critical path" />
                    )}
                  </p>
                  <p className="truncate text-[10.5px] text-muted">
                    {lane.teamName}
                    {lane.roundNo > 1 ? ` · round ${lane.roundNo}` : ''}
                    {blockers.length > 0 && ` · waits on ${blockers.map((b) => b.name).join(', ')}`}
                    {!lane.current && ' · released'}
                  </p>
                </div>
              </div>
              <Bars items={items} start={start} end={end} />
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-[#EEF2F8] pt-2.5 text-[11px] text-muted">
        {Object.entries(WORK_STATES).map(([key, s]) => (
          <span key={key} className="inline-flex items-center gap-1.5" title={s.hint}>
            <span className={`h-2.5 w-4 rounded-sm ${s.bar}`} />
            {s.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm ring-2 ring-danger" />
          Longest wait
        </span>
        {critical.size > 1 && (
          <span className="inline-flex items-center gap-1.5">
            <Route className="h-3 w-3 text-danger" />
            Critical path
          </span>
        )}
      </div>
    </div>
  )
}
