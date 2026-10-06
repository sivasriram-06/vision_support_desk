import { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, MessagesSquare, Route, Trash2, Mail } from 'lucide-react'
import useRealtime, { RT } from '../realtime/useRealtime.js'
import ErrorState from '../components/ui/ErrorState.jsx'
import Button from '../components/ui/Button.jsx'
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx'
import { PERMISSIONS } from '../auth/permissions.js'
import ConversationThread from '../components/tickets/ConversationThread.jsx'
import TicketPropertyPanel from '../components/tickets/TicketPropertyPanel.jsx'
import AttachmentList from '../components/tickets/AttachmentList.jsx'
import TrackingTab from '../components/tickets/tracking/TrackingTab.jsx'
import CloseReplyBanner from '../components/tickets/CloseReplyBanner.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import {
  ApiError,
  getTicket,
  getTicketConversations,
  getTicketComments,
  getTicketAttachments,
  getContact,
  getDepartment,
  getBank,
  markTicketSeen,
  deleteTicket,
  getProduct,
} from '../utils/api.js'

const TABS = [
  { value: 'conversation', label: 'Conversation', icon: MessagesSquare },
  { value: 'tracking', label: 'Tracking', icon: Route },
]

const fetchIfPresent = (id, fn) => (id ? fn(id) : Promise.resolve(null))

/** Name on the newest customer mail, for the live 'New mail from ...' notice. */
const latestInboundAuthor = (conversations) => {
  const last = [...(conversations || [])].reverse().find((c) => c.Direction === 'in')
  if (!last) return null
  return [last.Author_Contact_First_Name, last.Author_Contact_Last_Name].filter(Boolean).join(' ') || last.Author_Contact_Email || null
}

export default function TicketDetailPage() {
  const { ticketId } = useParams()
  const navigate = useNavigate()
  const { agent: me, can } = useAuth()
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)

  const confirmDelete = async () => {
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteTicket(ticketId)
      window.dispatchEvent(new Event('vsd:my-tickets-changed'))
      navigate('/tickets', { replace: true })
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'Failed to delete the ticket.')
      setDeleting(false)
    }
  }
  // Conversation (emails + comments) or the internal Tracking tab; kept in the URL.
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') === 'tracking' ? 'tracking' : 'conversation'
  const setTab = (next) => setSearchParams(next === 'tracking' ? { tab: 'tracking' } : {}, { replace: true })

  const [state, setState] = useState({ loading: true, error: null, data: null })
  const [refreshKey, setRefreshKey] = useState(0)
  // Live: any change to this ticket refetches it; new customer mail shows a notice; a remote delete is flagged.
  const [liveNotice, setLiveNotice] = useState(null) // 'mail' | 'deleted' | null
  useRealtime(
    [RT.TICKET_CHANGED, RT.TICKET_CONVERSATION, RT.TICKET_ASSIGNMENT, RT.TICKET_REOPEN, RT.TICKET_DELETED, RT.ESCALATION_CHANGED],
    (events) => {
      if (events.some((e) => e.type === RT.TICKET_DELETED)) {
        setLiveNotice('deleted')
        return
      }
      if (events.some((e) => e.type === RT.TICKET_CONVERSATION && e.reason === 'email' && e.inbound)) setLiveNotice('mail')
      setRefreshKey((k) => k + 1)
    },
    { ticketId }
  )
  useEffect(() => {
    if (liveNotice !== 'mail') return undefined
    const timer = setTimeout(() => setLiveNotice(null), 10000)
    return () => clearTimeout(timer)
  }, [liveNotice])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setState((prev) => ({ loading: true, error: null, data: prev.data }))
      try {
        const ticketRes = await getTicket(ticketId)
        const ticket = ticketRes.data
        // Opening a ticket assigned to me clears its "new" flag on My Tickets.
        if (ticket.Assignees?.some((a) => a.agentId === me?.agentId && !a.seen)) {
          markTicketSeen(ticketId)
            .then(() => window.dispatchEvent(new Event('vsd:my-tickets-changed')))
            .catch(() => {})
        }

        const [conversationsRes, commentsRes, attachmentsRes, contactRes, departmentRes, bankRes, productRes] =
          await Promise.all([
            getTicketConversations(ticketId),
            getTicketComments(ticketId),
            getTicketAttachments(ticketId),
            fetchIfPresent(ticket.Contact_Id, getContact),
            fetchIfPresent(ticket.Department_Id, getDepartment),
            fetchIfPresent(ticket.Bank_Id, getBank),
            fetchIfPresent(ticket.Product_Id, getProduct),
          ])

        if (cancelled) return
        setState({
          loading: false,
          error: null,
          data: {
            ticket,
            conversations: conversationsRes.data,
            comments: commentsRes.data,
            attachments: attachmentsRes.data,
            contact: contactRes?.data || null,
            department: departmentRes?.data || null,
            bank: bankRes?.data || null,
            product: productRes?.data || null,
          },
        })
      } catch (err) {
        if (!cancelled) {
          setState({ loading: false, error: err instanceof ApiError ? err.message : 'Failed to load ticket.', data: null })
        }
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [ticketId, refreshKey, me?.agentId])

  const BackLink = (
    <button
      onClick={() => navigate('/tickets')}
      className="flex items-center gap-1.5 text-[13px] font-semibold text-muted transition hover:text-ink cursor-pointer"
    >
      <ArrowLeft className="h-4 w-4" />
      Back to All Cases
    </button>
  )

  if (state.loading && !state.data) {
    return (
      <div className="flex flex-col gap-5">
        {BackLink}
        <div className="h-40 animate-pulse rounded-2xl bg-white/60" />
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="h-64 animate-pulse rounded-2xl bg-white/60" />
          <div className="h-64 animate-pulse rounded-2xl bg-white/60" />
        </div>
      </div>
    )
  }

  if (state.error) {
    return (
      <div className="flex flex-col gap-5">
        {BackLink}
        <div className="rounded-2xl border border-slate-200/90 bg-white shadow-card">
          <ErrorState message={state.error} />
        </div>
      </div>
    )
  }

  const { ticket, conversations, comments, attachments, contact, department, bank, product } = state.data

  const attachmentCountByConversation = attachments.reduce((acc, file) => {
    if (file.Conversation_Id) acc[file.Conversation_Id] = (acc[file.Conversation_Id] || 0) + 1
    return acc
  }, {})

  return (
    <div className="flex flex-col gap-5">
      {BackLink}

      <div className="flex items-start gap-3">
        <span className="w-[5px] min-h-[34px] self-stretch rounded-[3px] bg-gradient-to-b from-primary-light to-primary shadow-[0_2px_6px_rgba(232,99,43,0.45)]" />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[12px] font-semibold text-muted">#{ticket.Ticket_Number}</p>
          <h1 className="text-[21px] font-extrabold leading-tight tracking-tight text-ink-strong">{ticket.Subject}</h1>
        </div>
        {can(PERMISSIONS.TICKETS_DELETE) && (
          <Button variant="ghost" icon={Trash2} onClick={() => setConfirmingDelete(true)} className="shrink-0 hover:!bg-danger/10 hover:!text-danger">
            Delete ticket
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        title={`Delete ticket #${ticket.Ticket_Number}`}
        message={
          <>
            <strong>{ticket.Subject}</strong> will be removed from every list, queue and My Tickets and moved to the Recycle bin, where
            it can be restored until it is permanently deleted. A new mail in its thread opens a new ticket.
          </>
        }
        loading={deleting}
        error={deleteError}
        onConfirm={confirmDelete}
        onCancel={() => {
          setConfirmingDelete(false)
          setDeleteError(null)
        }}
      />

      {liveNotice === 'deleted' && (
        <div className="flex items-center justify-between gap-2 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-[13px] font-medium text-danger">
          This ticket was just deleted by someone else.
          <button onClick={() => navigate('/tickets')} className="cursor-pointer font-semibold underline">
            Back to All Cases
          </button>
        </div>
      )}
      {liveNotice === 'mail' && (
        <button
          onClick={() => {
            setTab('conversation')
            setLiveNotice(null)
          }}
          className="flex w-fit cursor-pointer items-center gap-2 rounded-full border border-sky/30 bg-sky/10 px-3 py-1.5 text-[12.5px] font-semibold text-sky-dark"
        >
          <Mail className="h-3.5 w-3.5" />
          New mail{latestInboundAuthor(conversations) ? ` from ${latestInboundAuthor(conversations)}` : ''} - added below
        </button>
      )}

      <CloseReplyBanner ticket={ticket} onChanged={() => setRefreshKey((k) => k + 1)} />

      {/* Properties sit beside the conversation from 1024px (laptops at 100% zoom, Edge with its side bar open); narrower panel until xl. */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex w-fit gap-1 rounded-xl border border-slate-200/90 bg-white p-1 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            {TABS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setTab(value)}
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition ${
                  tab === value ? 'bg-navy text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-ink'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
          {tab === 'tracking' ? (
            <TrackingTab ticket={ticket} onChanged={() => setRefreshKey((k) => k + 1)} />
          ) : (
            <>
              <AttachmentList ticketId={ticketId} attachments={attachments} />
              <ConversationThread
                conversations={conversations}
                comments={comments}
                attachmentCountByConversation={attachmentCountByConversation}
              />
            </>
          )}
        </div>

        <TicketPropertyPanel
          ticket={ticket}
          contact={contact}
          department={department}
          bank={bank}
          product={product}
          onUpdated={() => setRefreshKey((k) => k + 1)}
        />
      </div>
    </div>
  )
}
