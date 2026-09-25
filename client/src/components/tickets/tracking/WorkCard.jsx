import { useState } from 'react'
import { Play, Pause, CheckCircle2, Link2, X, Clock3 } from 'lucide-react'
import Avatar from '../../ui/Avatar.jsx'
import Badge from '../../ui/Badge.jsx'
import Button from '../../ui/Button.jsx'
import Input from '../../ui/Input.jsx'
import { getWorkStyle, WORK_STATES } from '../../../utils/workMeta.js'
import { formatMinutes } from '../../../utils/clockMeta.js'
import { formatDateTime } from '../../../utils/format.js'
import { ApiError, setWorkState, addWorkDependency, removeWorkDependency, addWorklog } from '../../../utils/api.js'

const ACTIONS = [
  { state: 'IN_PROGRESS', label: 'Start', icon: Play },
  { state: 'ON_HOLD', label: 'Hold', icon: Pause },
  { state: 'DONE', label: 'Done', icon: CheckCircle2 },
]

/**
 * One assignee's work: state, time per state, what it waits on, logged
 * effort - and, for people allowed to manage it, the actions (start /
 * hold / done, add a dependency, log work).
 */
export default function WorkCard({ ticketId, lane, lanes, canManage, onChanged }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [logging, setLogging] = useState(false)
  const [minutes, setMinutes] = useState('')
  const [note, setNote] = useState('')
  const [blocker, setBlocker] = useState('')
  const style = getWorkStyle(lane.workState)
  const laneById = new Map(lanes.map((l) => [l.assignmentId, l]))
  const blockers = lane.blockedBy.map((id) => laneById.get(id)).filter(Boolean)
  const blockerChoices = lanes.filter((l) => l.current && l.assignmentId !== lane.assignmentId && !lane.blockedBy.includes(l.assignmentId))

  const run = async (action) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      onChanged()
      return true
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Update failed.')
      return false
    } finally {
      setBusy(false)
    }
  }

  const saveLog = async () => {
    const value = Number(minutes)
    if (!value || value <= 0) {
      setError('Enter minutes worked.')
      return
    }
    if (await run(() => addWorklog(ticketId, lane.agentId, { minutes: value, note: note.trim() || null }))) {
      setLogging(false)
      setMinutes('')
      setNote('')
    }
  }

  return (
    <div className={`flex flex-col gap-2.5 rounded-xl border bg-white p-3.5 ${lane.current ? 'border-border' : 'border-dashed border-border opacity-70'}`}>
      <div className="flex items-start gap-2.5">
        <Avatar name={lane.name} size={30} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-bold text-ink">
            <span className="truncate">{lane.name}</span>
            {lane.crossTeam && <span className="rounded border border-review/30 bg-review/10 px-1 text-[10px] font-bold uppercase text-review">Cross-team</span>}
          </p>
          <p className="truncate text-[11.5px] text-muted">
            {lane.teamName}
            {lane.roundNo > 1 ? ` · round ${lane.roundNo}` : ''} · assigned by {lane.assignedByName} · {formatDateTime(lane.assignedTime)}
          </p>
        </div>
        <Badge dotClass={style.dot} textClass={style.text} bgClass={style.bg}>
          {lane.current ? style.label : 'Released'}
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          ['Held', lane.held.elapsed],
          ['Active', lane.byState.IN_PROGRESS?.elapsed || 0],
          ['Logged', lane.loggedMinutes],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg bg-slate-50 px-2 py-1.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted">{label}</p>
            <p className="font-mono text-[13px] font-bold text-ink">{formatMinutes(value)}</p>
          </div>
        ))}
      </div>

      {/* Time in each waiting state, so "who kept this waiting" is visible per person. */}
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(lane.byState)
          .filter(([state]) => state !== 'IN_PROGRESS')
          .map(([state, m]) => {
            const s = WORK_STATES[state]
            return (
              <span key={state} className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${s.bg} ${s.text}`} title={s.hint}>
                {s.label} {formatMinutes(m.elapsed)}
              </span>
            )
          })}
      </div>

      {blockers.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
          <Link2 className="h-3.5 w-3.5 text-amber-600" />
          <span className="text-muted">Waits on</span>
          {blockers.map((b) => (
            <span key={b.assignmentId} className="inline-flex items-center gap-1 rounded-md border border-amber-300/70 bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-800">
              {b.name}
              <span className="font-normal">({getWorkStyle(b.workState).label.toLowerCase()})</span>
              {canManage && lane.current && (
                <button
                  onClick={() => run(() => removeWorkDependency(ticketId, lane.agentId, b.agentId))}
                  disabled={busy}
                  title="Stop waiting on this"
                  className="cursor-pointer text-amber-700 hover:text-danger"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {canManage && lane.current && (
        <div className="flex flex-col gap-2 border-t border-[#EEF2F8] pt-2.5">
          <div className="flex flex-wrap gap-1.5">
            {/* Start is hidden while blocked - the blocker's work has to be Done first. */}
            {ACTIONS.filter((a) => a.state !== lane.workState && !(a.state === 'IN_PROGRESS' && lane.workState === 'WAITING')).map(({ state, label, icon: Icon }) => (
              <Button key={state} variant="secondary" icon={Icon} onClick={() => run(() => setWorkState(ticketId, lane.agentId, state))} disabled={busy}>
                {label}
              </Button>
            ))}
            <Button variant="secondary" icon={Clock3} onClick={() => setLogging((v) => !v)} disabled={busy}>
              Log work
            </Button>
          </div>
          {blockerChoices.length > 0 && (
            <div className="flex items-center gap-2">
              <select
                value={blocker}
                onChange={(e) => setBlocker(e.target.value)}
                className="min-w-0 flex-1 rounded-[9px] border border-border bg-white px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-primary"
              >
                <option value="">Waits on…</option>
                {blockerChoices.map((l) => (
                  <option key={l.assignmentId} value={l.agentId}>
                    {l.name} ({l.teamName})
                  </option>
                ))}
              </select>
              <Button
                variant="secondary"
                icon={Link2}
                disabled={busy || !blocker}
                onClick={async () => (await run(() => addWorkDependency(ticketId, lane.agentId, blocker))) && setBlocker('')}
              >
                Add
              </Button>
            </div>
          )}
          {logging && (
            <div className="flex flex-wrap items-center gap-2">
              <Input type="number" min="1" value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="Minutes" className="w-24" />
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was done (optional)" className="min-w-0 flex-1" />
              <Button variant="primary" onClick={saveLog} disabled={busy}>
                Save
              </Button>
            </div>
          )}
        </div>
      )}

      {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-[12px] font-medium text-danger">{error}</p>}
    </div>
  )
}
