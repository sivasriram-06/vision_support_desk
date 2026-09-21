import { useMemo, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, Paperclip, MoreHorizontal } from 'lucide-react'
import Avatar from '../ui/Avatar.jsx'
import EmptyState from '../ui/EmptyState.jsx'
import { formatDateTime } from '../../utils/format.js'
import { sanitizeEmailHtml } from '../../utils/sanitizeHtml.js'
import { splitEmailQuote } from '../../utils/splitEmailQuote.js'

const HTML_BODY_CLASSES =
  'email-html-body max-w-none text-[13px] leading-relaxed text-slate-700 [&_a]:text-primary [&_img]:max-w-full [&_img]:rounded'

function MessageCard({ message, authorName }) {
  const isInbound = message.Direction === 'in'
  const [quoteExpanded, setQuoteExpanded] = useState(false)

  const { main, quoted } = useMemo(() => {
    if (!message.Content_Html) return { main: null, quoted: null }
    const sanitized = sanitizeEmailHtml(message.Content_Html)
    return splitEmailQuote(sanitized)
  }, [message.Content_Html])

  return (
    <div className="rounded-xl border border-border bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.035)]">
      <div className="mb-3 flex items-center gap-2.5">
        <Avatar name={authorName} size={30} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-ink">{authorName}</p>
          <p className="text-[11.5px] text-muted">{formatDateTime(message.Sent_Time)}</p>
        </div>
        <span
          className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide ${
            isInbound ? 'bg-sky/10 text-sky-dark' : 'bg-primary/10 text-primary-dark'
          }`}
        >
          {isInbound ? <ArrowDownLeft className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
          {isInbound ? 'Customer' : 'Agent reply'}
        </span>
      </div>

      {message.Content_Html ? (
        <>
          <div className={HTML_BODY_CLASSES} dangerouslySetInnerHTML={{ __html: main }} />
          {quoted && (
            <div className="mt-2">
              <button
                onClick={() => setQuoteExpanded((v) => !v)}
                title={quoteExpanded ? 'Hide quoted text' : 'Show quoted text'}
                className="flex h-6 w-9 items-center justify-center rounded-md border border-border bg-slate-50 text-muted transition hover:bg-slate-100 hover:text-ink cursor-pointer"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
              {quoteExpanded && (
                <div className={`${HTML_BODY_CLASSES} mt-2 border-l-2 border-border pl-3`} dangerouslySetInnerHTML={{ __html: quoted }} />
              )}
            </div>
          )}
        </>
      ) : (
        <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700">{message.Content}</p>
      )}
    </div>
  )
}

function CommentCard({ comment }) {
  const authorName = [comment.Commenter_First_Name, comment.Commenter_Last_Name].filter(Boolean).join(' ') || 'Agent'

  return (
    <div className="rounded-xl border border-warn/25 bg-warn/5 p-4">
      <div className="mb-2 flex items-center gap-2.5">
        <Avatar name={authorName} size={26} />
        <p className="text-[13px] font-semibold text-ink">{authorName}</p>
        <span className="rounded-full bg-warn/15 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-warn">
          Internal note
        </span>
        <span className="ml-auto text-[11.5px] text-muted">{formatDateTime(comment.Commented_Time)}</span>
      </div>
      <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700">{comment.Content}</p>
    </div>
  )
}

/**
 * Merges conversations + internal comments into one chronological feed, so
 * the full story of a ticket - customer messages, replies, and internal
 * notes - reads in the order it actually happened.
 *
 * Each message's author comes from ITS OWN Author_Contact_Id/Author_Agent_Id
 * (joined server-side), never the ticket's single overall contact - a
 * thread can have several different people replying, and attributing every
 * inbound message to "the" contact would misname whoever actually sent it.
 */
export default function ConversationThread({ conversations, comments, attachmentCountByConversation }) {
  const items = [
    ...conversations.map((c) => ({ type: 'message', time: c.Sent_Time, data: c })),
    ...comments.map((c) => ({ type: 'comment', time: c.Commented_Time, data: c })),
  ].sort((a, b) => new Date(a.time) - new Date(b.time))

  if (items.length === 0) {
    return <EmptyState title="No conversation yet" description="Replies and internal notes will show up here." />
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => {
        if (item.type === 'comment') {
          return <CommentCard key={`cmt-${item.data.Comment_Id}`} comment={item.data} />
        }

        const message = item.data
        const isInbound = message.Direction === 'in'
        const authorName = isInbound
          ? [message.Author_Contact_First_Name, message.Author_Contact_Last_Name].filter(Boolean).join(' ') ||
            message.Author_Contact_Email ||
            'Unknown sender'
          : [message.Author_Agent_First_Name, message.Author_Agent_Last_Name].filter(Boolean).join(' ') || 'Support Agent'

        return (
          <div key={`msg-${message.Conversation_Id}`}>
            <MessageCard message={message} authorName={authorName} />
            {attachmentCountByConversation?.[message.Conversation_Id] > 0 && (
              <p className="mt-1.5 ml-1 flex items-center gap-1 text-[11.5px] font-medium text-muted">
                <Paperclip className="h-3 w-3" />
                {attachmentCountByConversation[message.Conversation_Id]} attachment
                {attachmentCountByConversation[message.Conversation_Id] > 1 ? 's' : ''} on this message
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
