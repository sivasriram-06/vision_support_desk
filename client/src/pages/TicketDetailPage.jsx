import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import ErrorState from '../components/ui/ErrorState.jsx'
import ConversationThread from '../components/tickets/ConversationThread.jsx'
import TicketPropertyPanel from '../components/tickets/TicketPropertyPanel.jsx'
import AttachmentList from '../components/tickets/AttachmentList.jsx'
import {
  ApiError,
  getTicket,
  getTicketConversations,
  getTicketComments,
  getTicketAttachments,
  getContact,
  getAccount,
  getDepartment,
  getTeam,
  getAgent,
} from '../utils/api.js'

const fetchIfPresent = (id, fn) => (id ? fn(id) : Promise.resolve(null))

export default function TicketDetailPage() {
  const { ticketId } = useParams()
  const navigate = useNavigate()

  const [state, setState] = useState({ loading: true, error: null, data: null })

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setState({ loading: true, error: null, data: null })
      try {
        const ticketRes = await getTicket(ticketId)
        const ticket = ticketRes.data

        const [conversationsRes, commentsRes, attachmentsRes, contactRes, accountRes, departmentRes, teamRes, assigneeRes] =
          await Promise.all([
            getTicketConversations(ticketId),
            getTicketComments(ticketId),
            getTicketAttachments(ticketId),
            fetchIfPresent(ticket.Contact_Id, getContact),
            fetchIfPresent(ticket.Account_Id, getAccount),
            fetchIfPresent(ticket.Department_Id, getDepartment),
            fetchIfPresent(ticket.Team_Id, getTeam),
            fetchIfPresent(ticket.Assignee_Id, getAgent),
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
            account: accountRes?.data || null,
            department: departmentRes?.data || null,
            team: teamRes?.data || null,
            assignee: assigneeRes?.data || null,
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
  }, [ticketId])

  const BackLink = (
    <button
      onClick={() => navigate('/tickets')}
      className="flex items-center gap-1.5 text-[13px] font-semibold text-muted transition hover:text-ink cursor-pointer"
    >
      <ArrowLeft className="h-4 w-4" />
      Back to All Cases
    </button>
  )

  if (state.loading) {
    return (
      <div className="flex flex-col gap-5">
        {BackLink}
        <div className="h-40 animate-pulse rounded-2xl bg-white/60" />
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_360px]">
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

  const { ticket, conversations, comments, attachments, contact, account, department, team, assignee } = state.data

  const attachmentCountByConversation = attachments.reduce((acc, file) => {
    if (file.Conversation_Id) acc[file.Conversation_Id] = (acc[file.Conversation_Id] || 0) + 1
    return acc
  }, {})

  return (
    <div className="flex flex-col gap-5">
      {BackLink}

      <div className="flex items-start gap-3">
        <span className="w-[5px] min-h-[34px] self-stretch rounded-[3px] bg-gradient-to-b from-primary-light to-primary shadow-[0_2px_6px_rgba(232,99,43,0.45)]" />
        <div>
          <p className="font-mono text-[12px] font-semibold text-muted">#{ticket.Ticket_Number}</p>
          <h1 className="text-[21px] font-extrabold leading-tight tracking-tight text-ink-strong">{ticket.Subject}</h1>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[1fr_360px] 2xl:grid-cols-[1fr_400px]">
        <div className="flex flex-col gap-4">
          <AttachmentList ticketId={ticketId} attachments={attachments} />
          <ConversationThread
            conversations={conversations}
            comments={comments}
            attachmentCountByConversation={attachmentCountByConversation}
          />
        </div>

        <TicketPropertyPanel
          ticket={ticket}
          contact={contact}
          account={account}
          department={department}
          team={team}
          assignee={assignee}
        />
      </div>
    </div>
  )
}
