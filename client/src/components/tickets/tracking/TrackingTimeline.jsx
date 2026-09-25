import { useState } from 'react'
import {
  PlusCircle,
  ArrowRightLeft,
  Flag,
  UserPlus,
  Activity,
  Link2,
  Clock3,
  MessageSquareText,
  Mail,
  PencilLine,
  ArrowDownUp,
} from 'lucide-react'
import { EVENT_FILTERS, getWorkStyle } from '../../../utils/workMeta.js'
import { formatMinutes } from '../../../utils/clockMeta.js'
import { formatDateTime } from '../../../utils/format.js'

const EVENT_STYLE = {
  CREATED: { icon: PlusCircle, className: 'bg-navy text-white' },
  STATUS: { icon: ArrowRightLeft, className: 'bg-primary/15 text-primary-dark' },
  PRIORITY: { icon: Flag, className: 'bg-danger/10 text-danger' },
  FIELD: { icon: PencilLine, className: 'bg-slate-100 text-slate-600' },
  ASSIGNMENT: { icon: UserPlus, className: 'bg-sky/15 text-sky-dark' },
  DEPENDENCY: { icon: Link2, className: 'bg-amber-50 text-amber-700' },
  WORK: { icon: Activity, className: 'bg-success/10 text-success-dark' },
  WORKLOG: { icon: Clock3, className: 'bg-review/10 text-review' },
  COMMENT: { icon: MessageSquareText, className: 'bg-slate-100 text-slate-700' },
  EMAIL: { icon: Mail, className: 'bg-sky/10 text-sky-dark' },
}

// A gap this long before the next event gets called out as "sat for ...".
const LONG_GAP_MINUTES = 8 * 60

/**
 * Every event on the ticket in time order, each with how long the ticket
 * sat until the next thing happened. Filter chips narrow it down; long
 * gaps are highlighted so slow spots stand out.
 */
export default function TrackingTimeline({ events }) {
  const [filter, setFilter] = useState('ALL')
  const [newestFirst, setNewestFirst] = useState(true)
  const types = EVENT_FILTERS.find((f) => f.value === filter)?.types
  const shown = events.filter((e) => !types || types.includes(e.type))
  const ordered = newestFirst ? [...shown].reverse() : shown

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {EVENT_FILTERS.map((f) => {
          const count = f.types ? events.filter((e) => f.types.includes(e.type)).length : events.length
          return (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`cursor-pointer rounded-full border px-2.5 py-1 text-[12px] font-semibold transition ${
                filter === f.value ? 'border-navy bg-navy text-white' : 'border-border bg-white text-slate-600 hover:border-slate-300'
              }`}
            >
              {f.label} <span className="font-mono opacity-70">{count}</span>
            </button>
          )
        })}
        <button
          onClick={() => setNewestFirst((v) => !v)}
          className="ml-auto inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[12px] font-semibold text-slate-500 hover:bg-slate-100"
        >
          <ArrowDownUp className="h-3.5 w-3.5" />
          {newestFirst ? 'Newest first' : 'Oldest first'}
        </button>
      </div>

      {ordered.length === 0 ? (
        <p className="py-6 text-center text-[12.5px] text-muted">Nothing here yet.</p>
      ) : (
        <ol className="relative flex flex-col">
          {ordered.map((e, i) => {
            const style = EVENT_STYLE[e.type] || EVENT_STYLE.FIELD
            const Icon = style.icon
            const work = e.type === 'WORK' && e.state ? getWorkStyle(e.state) : null
            const longGap = e.minutesUntilNext >= LONG_GAP_MINUTES
            return (
              <li key={`${e.time}-${i}`} className="relative flex gap-3 pb-4 last:pb-0">
                {i < ordered.length - 1 && <span className="absolute left-[13px] top-7 bottom-0 w-px bg-border" />}
                <span className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${style.className}`}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <p className={`text-[13px] text-ink ${e.type === 'COMMENT' ? '' : 'font-semibold'}`}>
                      {e.type === 'COMMENT' ? (
                        <>
                          <span className="font-semibold">{e.actor}</span>
                          {e.about && <span className="text-muted"> on {e.about}&rsquo;s work</span>}
                        </>
                      ) : (
                        e.text
                      )}
                      {work && <span className={`ml-2 inline-block h-2 w-2 rounded-full align-middle ${work.dot}`} />}
                    </p>
                    <span className="whitespace-nowrap text-[11.5px] text-muted">{formatDateTime(e.time)}</span>
                  </div>
                  {e.type === 'COMMENT' && <p className="mt-1 whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-[12.5px] text-slate-700">{e.text}</p>}
                  {e.note && e.type !== 'COMMENT' && <p className="mt-0.5 text-[12px] text-slate-600">&ldquo;{e.note}&rdquo;</p>}
                  {e.type !== 'COMMENT' && e.actor && e.type !== 'CREATED' && e.type !== 'EMAIL' && (
                    <p className="text-[11px] text-muted">by {e.actor}</p>
                  )}
                  {e.minutesUntilNext > 0 && (
                    <p className={`mt-1 text-[11px] ${longGap ? 'font-semibold text-danger' : 'text-muted'}`}>
                      {longGap ? 'Sat for ' : ''}
                      {formatMinutes(e.minutesUntilNext)} until the next event
                    </p>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
