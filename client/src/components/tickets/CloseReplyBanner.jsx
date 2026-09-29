import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { MailWarning, RotateCcw, GitBranchPlus, CheckCheck, Lock } from 'lucide-react'
import Button from '../ui/Button.jsx'
import Modal from '../ui/Modal.jsx'
import { useAuth } from '../../auth/AuthContext.jsx'
import { PERMISSIONS } from '../../auth/permissions.js'
import { ApiError, getReopenInfo, reopenTicket, splitTicket, dismissCloseReplies } from '../../utils/api.js'

/**
 * Top of the ticket page for Closed tickets and their links:
 *   - a customer mailed after close -> a lead picks Reopen / Create as new
 *     issue / No action (Team Members only see that a lead decides);
 *   - a Closed ticket with no pending mail can still be reopened by a lead
 *     (e.g. the customer phoned);
 *   - "Split from #x" / "Follow-up issue #y" links and the reopen count.
 */
export default function CloseReplyBanner({ ticket, onChanged }) {
  const navigate = useNavigate()
  const { can } = useAuth()
  const canDecide = can(PERMISSIONS.TICKETS_REOPEN)
  const closed = ticket.Clock_State === 'STOPPED'
  const pending = ticket.Pending_Close_Replies || 0

  const [info, setInfo] = useState(null)
  const [reopening, setReopening] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    getReopenInfo(ticket.Ticket_Id).then((res) => setInfo(res.data)).catch(() => {})
  }, [ticket.Ticket_Id, ticket.Modified_Time])

  const run = async (action) => {
    setBusy(true)
    setError(null)
    try {
      const res = await action()
      return res
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.')
      return null
    } finally {
      setBusy(false)
    }
  }

  const doReopen = async () => {
    const res = await run(() => reopenTicket(ticket.Ticket_Id, reason.trim()))
    if (res) {
      setReopening(false)
      setReason('')
      onChanged()
    }
  }
  const doSplit = async () => {
    const res = await run(() => splitTicket(ticket.Ticket_Id))
    if (res) navigate(`/tickets/${res.data.Ticket_Id}`)
  }
  const doDismiss = async () => {
    if (await run(() => dismissCloseReplies(ticket.Ticket_Id))) onChanged()
  }

  const splitInto = info?.splitInto || []
  const links = (ticket.Split_From_Ticket_Id || splitInto.length > 0 || ticket.Reopen_Count > 0) && (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-muted">
      {ticket.Split_From_Ticket_Id && (
        <span>
          Split from{' '}
          <Link to={`/tickets/${ticket.Split_From_Ticket_Id}`} className="font-semibold text-primary hover:underline">
            #{ticket.Split_From_Ticket_Number}
          </Link>{' '}
          (a reply on that closed ticket)
        </span>
      )}
      {splitInto.map((t) => (
        <span key={t.Ticket_Id}>
          Follow-up issue{' '}
          <Link to={`/tickets/${t.Ticket_Id}`} className="font-semibold text-primary hover:underline">
            #{t.Ticket_Number}
          </Link>
        </span>
      ))}
      {ticket.Reopen_Count > 0 && (
        <span className="rounded-full bg-warn/15 px-2 py-0.5 text-[11px] font-bold text-warn">
          Reopened {ticket.Reopen_Count}×
        </span>
      )}
    </div>
  )

  if (!closed || (pending === 0 && !canDecide)) return links || null

  return (
    <div className="flex flex-col gap-2">
      {links}
      {pending > 0 ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-warn/40 bg-warn/10 p-4">
          <div className="flex items-start gap-2.5">
            <MailWarning className="mt-0.5 h-5 w-5 shrink-0 text-warn" />
            <div>
              <p className="text-[13.5px] font-semibold text-ink">
                The customer replied after this ticket was Closed{pending > 1 ? ` (${pending} mails)` : ''}
              </p>
              <p className="text-[12.5px] text-muted">
                {canDecide
                  ? 'Is it the same problem coming back, a new issue in the same thread, or just an acknowledgement?'
                  : 'A team lead or manager decides whether to reopen it or open a new issue.'}
              </p>
            </div>
          </div>
          {canDecide && (
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" icon={RotateCcw} onClick={() => setReopening(true)} disabled={busy}>
                Reopen this ticket
              </Button>
              <Button variant="secondary" icon={GitBranchPlus} onClick={doSplit} disabled={busy}>
                Create as new issue
              </Button>
              <Button variant="ghost" icon={CheckCheck} onClick={doDismiss} disabled={busy}>
                No action needed
              </Button>
            </div>
          )}
          {error && <p className="text-[12.5px] font-medium text-danger">{error}</p>}
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200/90 bg-white px-4 py-3 shadow-card">
          <p className="flex items-center gap-2 text-[12.5px] text-muted">
            <Lock className="h-4 w-4" /> Closed. Reopening counts as a reopen and starts a fresh SLA.
          </p>
          <Button variant="secondary" icon={RotateCcw} onClick={() => setReopening(true)} disabled={busy}>
            Reopen
          </Button>
        </div>
      )}

      {reopening && (
        <Modal title={`Reopen #${ticket.Ticket_Number}`} onClose={() => !busy && setReopening(false)}>
          <div className="flex flex-col gap-3">
            <p className="text-[12.5px] text-muted">
              This counts as Reopen #{(ticket.Reopen_Count || 0) + 1}. The ticket goes back to Unassigned for a lead to assign, and the SLA
              starts fresh from now.
            </p>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-semibold text-ink">Why is it being reopened?</span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                autoFocus
                placeholder="e.g. Same error came back after the fix"
                className="rounded-[9px] border border-border px-3 py-2 text-[13px] text-ink outline-none focus:border-primary"
              />
            </label>
            {error && <p className="text-[12.5px] font-medium text-danger">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setReopening(false)} disabled={busy}>
                Cancel
              </Button>
              <Button variant="primary" icon={RotateCcw} onClick={doReopen} disabled={busy || reason.trim().length < 3}>
                Reopen
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
