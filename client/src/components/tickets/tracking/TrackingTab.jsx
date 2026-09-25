import { useEffect, useState } from 'react'
import { AlertTriangle, Timer, Gauge, Users, Send } from 'lucide-react'
import Avatar from '../../ui/Avatar.jsx'
import Badge from '../../ui/Badge.jsx'
import Button from '../../ui/Button.jsx'
import ErrorState from '../../ui/ErrorState.jsx'
import TrackingSwimlane from './TrackingSwimlane.jsx'
import TrackingTimeline from './TrackingTimeline.jsx'
import WorkCard from './WorkCard.jsx'
import { useAuth } from '../../../auth/AuthContext.jsx'
import { PERMISSIONS } from '../../../auth/permissions.js'
import { getWorkStyle } from '../../../utils/workMeta.js'
import { formatMinutes } from '../../../utils/clockMeta.js'
import { ApiError, getTicketTracking, addTicketComment } from '../../../utils/api.js'

function Card({ title, icon: Icon, children, actions }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-card">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 text-primary" />}
        <h3 className="text-[12px] font-bold uppercase tracking-wider text-navy">{title}</h3>
        {actions && <div className="ml-auto">{actions}</div>}
      </div>
      {children}
    </section>
  )
}

function Stat({ label, value, sub, tone = 'text-ink' }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted">{label}</p>
      <p className={`font-mono text-[18px] font-bold ${tone}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted">{sub}</p>}
    </div>
  )
}

/** Horizontal bars, longest highlighted - time per team / person / status. */
function Breakdown({ rows }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <ul className="flex flex-col gap-1.5">
      {rows.map((r, i) => (
        <li key={r.key} className="grid grid-cols-[140px_1fr_70px] items-center gap-2 text-[12px]">
          <span className="truncate font-medium text-slate-700" title={r.label}>
            {r.label}
          </span>
          <span className="h-2.5 rounded-full bg-slate-100">
            <span className={`block h-full rounded-full ${i === 0 ? 'bg-danger/70' : 'bg-navy/40'}`} style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
          <span className="text-right font-mono text-slate-600">{formatMinutes(r.value)}</span>
        </li>
      ))}
    </ul>
  )
}

/**
 * Tracking tab (internal): the ticket's whole journey - who held it, who
 * waited on whom, how long each person / team / status took, and every
 * event with the time it sat until the next one.
 */
export default function TrackingTab({ ticket, onChanged }) {
  const { can, agent: me } = useAuth()
  const [state, setState] = useState({ loading: true, error: null, data: null })
  const [reloadKey, setReloadKey] = useState(0)
  const [breakdown, setBreakdown] = useState('team')
  const [comment, setComment] = useState('')
  const [commentAbout, setCommentAbout] = useState('')
  const [posting, setPosting] = useState(false)

  useEffect(() => {
    let cancelled = false
    setState((prev) => ({ ...prev, loading: true, error: null }))
    getTicketTracking(ticket.Ticket_Id)
      .then((res) => !cancelled && setState({ loading: false, error: null, data: res.data }))
      .catch((err) => !cancelled && setState({ loading: false, error: err instanceof ApiError ? err.message : 'Failed to load tracking.', data: null }))
    return () => {
      cancelled = true
    }
  }, [ticket.Ticket_Id, ticket.Modified_Time, reloadKey])

  const refresh = () => {
    setReloadKey((k) => k + 1)
    onChanged?.()
  }

  // Mirrors ticket-work.service.js canManageWork.
  const canManage = (lane) =>
    lane.agentId === me?.agentId ||
    lane.assignedBy === me?.agentId ||
    can(PERMISSIONS.TICKETS_ASSIGN_ANY) ||
    (can(PERMISSIONS.TICKETS_ASSIGN_TEAM) && !!me?.teamId && (me.teamId === lane.teamId || me.teamId === ticket.Department_Id))

  const postComment = async () => {
    if (!comment.trim()) return
    setPosting(true)
    try {
      await addTicketComment(ticket.Ticket_Id, { content: comment.trim(), assignmentId: commentAbout || null })
      setComment('')
      setCommentAbout('')
      refresh()
    } finally {
      setPosting(false)
    }
  }

  if (state.error) {
    return (
      <div className="rounded-2xl border border-slate-200/90 bg-white shadow-card">
        <ErrorState message={state.error} onRetry={() => setReloadKey((k) => k + 1)} />
      </div>
    )
  }
  if (!state.data) {
    return <div className="h-64 animate-pulse rounded-2xl bg-slate-200/60" />
  }

  const t = state.data
  const s = t.summary
  const idlePct = s.ageMinutes ? Math.round((s.idleMinutes / s.ageMinutes) * 100) : 0
  const breakdownRows =
    breakdown === 'team'
      ? s.perTeam.map((r) => ({ key: r.teamId || 'none', label: r.teamName, value: r.held }))
      : breakdown === 'person'
        ? s.perPerson.map((r) => ({ key: r.agentId, label: r.name, value: r.held }))
        : s.perStatus.map((r) => ({ key: r.status, label: r.status, value: r.minutes }))
  const currentLanes = t.lanes.filter((l) => l.current)
  const pastLanes = t.lanes.filter((l) => !l.current)

  return (
    <div className="flex flex-col gap-4">
      {/* Summary */}
      <Card title="Summary" icon={Gauge}>
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
          <Stat label={t.resolved ? 'Took' : 'Age'} value={formatMinutes(s.ageMinutes)} sub={`${formatMinutes(s.ageSupportMinutes)} in support hours`} />
          <Stat label="Someone working" value={formatMinutes(s.busyMinutes)} sub="parallel work counted once" tone="text-success-dark" />
          <Stat label="Nobody working" value={`${idlePct}%`} sub={`${formatMinutes(s.idleMinutes)} idle`} tone={idlePct > 60 ? 'text-danger' : 'text-ink'} />
          <Stat label="Work logged" value={formatMinutes(s.loggedMinutes)} sub={`${t.worklogs.length} entr${t.worklogs.length === 1 ? 'y' : 'ies'}`} />
        </div>

        {s.longestWait && (
          <div className="flex items-start gap-2.5 rounded-xl border border-danger/25 bg-danger/5 px-3.5 py-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            <div className="min-w-0">
              <p className="text-[13px] font-bold text-ink">
                Stayed longest: {s.longestWait.label} · {formatMinutes(s.longestWait.minutes)}
              </p>
              <p className="text-[11.5px] text-muted">Outlined in red on the timeline below.</p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Holding now</span>
          {s.current.length === 0 ? (
            <span className="text-[12.5px] italic text-muted">Nobody - unassigned</span>
          ) : (
            s.current.map((c) => {
              const ws = getWorkStyle(c.workState)
              return (
                <span key={c.assignmentId} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white py-0.5 pl-0.5 pr-2.5 text-[12px]">
                  <Avatar name={c.name} size={22} />
                  <span className="font-semibold text-ink">{c.name}</span>
                  <span className="text-muted">{c.teamName}</span>
                  <Badge dotClass={ws.dot} textClass={ws.text} bgClass={ws.bg}>
                    {ws.label} {formatMinutes((new Date(t.endTime) - new Date(c.sinceTime)) / 60000)}
                  </Badge>
                </span>
              )
            })
          )}
        </div>
      </Card>

      {/* Swimlane */}
      <Card title="Who worked when" icon={Timer}>
        {t.lanes.length === 0 ? (
          <p className="text-[12.5px] text-muted">No one has been assigned yet.</p>
        ) : (
          <TrackingSwimlane tracking={t} />
        )}
      </Card>

      {/* Breakdown + work cards */}
      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
        <Card
          title="Time held"
          icon={Users}
          actions={
            <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5">
              {[
                ['team', 'Team'],
                ['person', 'Person'],
                ['status', 'Status'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setBreakdown(value)}
                  className={`cursor-pointer rounded-md px-2 py-0.5 text-[11.5px] font-semibold ${breakdown === value ? 'bg-white text-ink shadow-sm' : 'text-slate-500'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          }
        >
          {breakdownRows.length === 0 ? <p className="text-[12.5px] text-muted">Nothing yet.</p> : <Breakdown rows={breakdownRows} />}
          <p className="text-[11px] text-muted">
            {breakdown === 'status' ? 'Time the ticket spent in each status.' : 'Time from being assigned until released (or now). Overlaps when people work in parallel.'}
          </p>
        </Card>

        <Card title="Add a comment" icon={Send}>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            placeholder="Internal note - only the team sees this"
            className="w-full resize-y rounded-[9px] border border-border bg-white px-3 py-2 text-[13px] text-ink outline-none focus:border-primary"
          />
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={commentAbout}
              onChange={(e) => setCommentAbout(e.target.value)}
              className="rounded-[9px] border border-border bg-white px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-primary"
            >
              <option value="">About the whole ticket</option>
              {currentLanes.map((l) => (
                <option key={l.assignmentId} value={l.assignmentId}>
                  About {l.name}&rsquo;s work
                </option>
              ))}
            </select>
            <Button variant="primary" icon={Send} onClick={postComment} disabled={posting || !comment.trim()} className="ml-auto">
              {posting ? 'Posting…' : 'Comment'}
            </Button>
          </div>
        </Card>
      </div>

      {currentLanes.length > 0 && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {currentLanes.map((lane) => (
            <WorkCard key={lane.assignmentId} ticketId={ticket.Ticket_Id} lane={lane} lanes={t.lanes} canManage={canManage(lane)} onChanged={refresh} />
          ))}
        </div>
      )}
      {pastLanes.length > 0 && (
        <details className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-card">
          <summary className="cursor-pointer text-[12px] font-bold uppercase tracking-wider text-navy">Earlier assignees ({pastLanes.length})</summary>
          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {pastLanes.map((lane) => (
              <WorkCard key={lane.assignmentId} ticketId={ticket.Ticket_Id} lane={lane} lanes={t.lanes} canManage={false} onChanged={refresh} />
            ))}
          </div>
        </details>
      )}

      <Card title="Timeline" icon={Timer}>
        <TrackingTimeline events={t.events} />
      </Card>
    </div>
  )
}
