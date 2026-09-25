import { useEffect, useMemo, useState } from 'react'
import { UserPlus, X, Check } from 'lucide-react'
import Avatar from '../ui/Avatar.jsx'
import Button from '../ui/Button.jsx'
import Input from '../ui/Input.jsx'
import { assigneeName } from '../../utils/ticketMeta.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { PERMISSIONS } from '../../auth/permissions.js'
import { formatDateTime } from '../../utils/format.js'
import { getWorkStyle } from '../../utils/workMeta.js'
import { ApiError, getAgents, addTicketAssignees, removeTicketAssignee } from '../../utils/api.js'

const fullNameOf = (a) => [a.First_Name, a.Last_Name].filter(Boolean).join(' ')

/**
 * A ticket's assignees - several, all equal - with add/remove in place.
 * Mirrors the server rules (ticket-assignment.service.js):
 *   - same team as the ticket: team lead (own team) or assign_any
 *   - any other team (Java, Angular...): anyone who works tickets
 *   - remove: yourself, someone you assigned, or anyone you could assign
 */
export default function AssigneesSection({ ticket, bank, onChanged }) {
  const { can, agent: me } = useAuth()
  const canAssignAny = can(PERMISSIONS.TICKETS_ASSIGN_ANY)
  const canAssignTeam = can(PERMISSIONS.TICKETS_ASSIGN_TEAM)
  const canWork = can(PERMISSIONS.TICKETS_EDIT_STATUS)
  const [picking, setPicking] = useState(false)
  const [agents, setAgents] = useState([])
  const [agentId, setAgentId] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const assignees = ticket.Assignees || []

  // Support teams (and untyped teams like the intake team) are assigned by
  // their team lead; product and other team types are open to anyone.
  const openToEveryone = (teamType) => !!teamType && teamType !== 'Support'
  const canAssignAgent = (agent) => {
    if (canAssignAny) return true
    if (openToEveryone(agent.Team_Type)) return canWork
    return canAssignTeam && !!me?.teamId && agent.Primary_Department_Id === me.teamId
  }

  useEffect(() => {
    if (!picking || agents.length) return
    getAgents()
      .then((res) => setAgents(res.data))
      .catch(() => setError('Could not load people.'))
  }, [picking, agents.length])

  // Pickable people grouped by team: the ticket's own team first, then
  // every other team as cross-team.
  const groups = useMemo(() => {
    const current = new Set(assignees.map((a) => a.agentId))
    const byTeam = new Map()
    for (const agent of agents) {
      // Role_Key filters out the system actor and mail-sender placeholder agents.
      if (agent.Status !== 'Active' || !agent.Role_Key || !agent.Primary_Department_Id || current.has(agent.Agent_Id) || !canAssignAgent(agent)) continue
      const key = agent.Primary_Department_Id
      if (!byTeam.has(key)) {
        byTeam.set(key, { teamId: key, teamName: agent.Team_Name || 'No team', crossTeam: key !== ticket.Department_Id, agents: [] })
      }
      byTeam.get(key).agents.push(agent)
    }
    return [...byTeam.values()].sort((a, b) => Number(a.crossTeam) - Number(b.crossTeam) || a.teamName.localeCompare(b.teamName))
  }, [agents, assignees, ticket.Department_Id, canAssignAny, canAssignTeam, canWork, me?.teamId])

  const resourceTag = (id) => {
    if (bank?.Primary_Resources?.some((a) => a.Agent_Id === id)) return ' ★ Primary'
    if (bank?.Secondary_Resources?.some((a) => a.Agent_Id === id)) return ' · Secondary'
    return ''
  }

  const canRemove = (a) =>
    a.agentId === me?.agentId ||
    a.assignedBy === me?.agentId ||
    canAssignAny ||
    (openToEveryone(a.teamType) ? canWork : canAssignTeam && a.teamId === me?.teamId)

  const run = async (action) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      onChanged?.()
      return true
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update assignees.')
      return false
    } finally {
      setBusy(false)
    }
  }

  const handleAssign = async () => {
    if (!agentId) return
    const done = await run(() => addTicketAssignees(ticket.Ticket_Id, [agentId], note.trim() || null))
    if (done) {
      setAgentId('')
      setNote('')
      setPicking(false)
    }
  }

  const anyoneToPick = canAssignAny || canAssignTeam || canWork

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Assignees</p>
        {anyoneToPick && !picking && (
          <button
            onClick={() => setPicking(true)}
            className="inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-semibold text-primary transition hover:bg-primary/10"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Assign
          </button>
        )}
      </div>

      {assignees.length === 0 ? (
        <p className="text-[12.5px] italic text-muted">Unassigned</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {assignees.map((a) => (
            <li key={a.agentId} className="flex items-start gap-2 rounded-lg border border-border bg-slate-50/60 px-2.5 py-2">
              <Avatar name={assigneeName(a)} size={26} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 text-[12.5px] font-semibold text-ink">
                  <span className="truncate">{assigneeName(a)}</span>
                  {a.crossTeam && (
                    <span className="rounded border border-review/30 bg-review/10 px-1 text-[10px] font-bold uppercase text-review">Cross-team</span>
                  )}
                  {a.workState && (
                    <span className={`rounded px-1 text-[10px] font-bold uppercase ${getWorkStyle(a.workState).bg} ${getWorkStyle(a.workState).text}`}>
                      {getWorkStyle(a.workState).label}
                    </span>
                  )}
                </p>
                <p className="truncate text-[11px] text-muted">
                  {a.teamName || 'No team'} · by {a.assignedByName || 'system'} · {formatDateTime(a.assignedTime)}
                </p>
                {a.note && <p className="mt-0.5 text-[11.5px] text-slate-600">“{a.note}”</p>}
              </div>
              {canRemove(a) && (
                <button
                  onClick={() => run(() => removeTicketAssignee(ticket.Ticket_Id, a.agentId))}
                  disabled={busy}
                  title={a.agentId === me?.agentId ? 'Release myself' : 'Remove assignee'}
                  className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted transition hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {picking && (
        <div className="flex flex-col gap-2 rounded-lg border border-primary/30 bg-primary/[0.03] p-2.5">
          <div className="relative">
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              autoFocus
              className="w-full appearance-none rounded-[9px] border border-border bg-white py-2 pl-3 pr-8 text-[13px] text-ink outline-none focus:border-primary"
            >
              <option value="">Pick a person…</option>
              {groups.map((g) => (
                <optgroup key={g.teamId} label={g.crossTeam ? `Cross-team · ${g.teamName}` : g.teamName}>
                  {g.agents.map((agent) => (
                    <option key={agent.Agent_Id} value={agent.Agent_Id}>
                      {fullNameOf(agent)}
                      {agent.Role_Name ? ` (${agent.Role_Name})` : ''}
                      {resourceTag(agent.Agent_Id)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional) - e.g. check the API mapping" />
          {groups.length === 0 && agents.length > 0 && <p className="text-[11.5px] text-muted">Nobody else you can assign.</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" icon={X} onClick={() => setPicking(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" icon={Check} onClick={handleAssign} disabled={busy || !agentId}>
              {busy ? 'Assigning…' : 'Assign'}
            </Button>
          </div>
        </div>
      )}

      {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-[12px] font-medium text-danger">{error}</p>}
    </div>
  )
}
