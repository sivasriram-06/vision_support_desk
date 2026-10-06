import { useContext, useEffect, useRef } from 'react'
import { RealtimeContext } from './context.js'

/** Server event types (server/src/realtime/bus.js). */
export const RT = {
  TICKET_CREATED: 'ticket.created',
  TICKET_CHANGED: 'ticket.changed',
  TICKET_DELETED: 'ticket.deleted',
  TICKET_CONVERSATION: 'ticket.conversation',
  TICKET_ASSIGNMENT: 'ticket.assignment',
  TICKET_REOPEN: 'ticket.reopen',
  MY_TICKETS_CHANGED: 'my-tickets.changed',
  ESCALATION_CHANGED: 'escalation.changed',
  CUSTOMER_CHANGED: 'customer.changed',
}

/** Every event that can change what a ticket list / queue shows. */
export const TICKET_LIST_EVENTS = [RT.TICKET_CREATED, RT.TICKET_CHANGED, RT.TICKET_DELETED, RT.TICKET_ASSIGNMENT, RT.TICKET_REOPEN, RT.TICKET_CONVERSATION]

// Calls handler(events) once per debounced burst of `types`, and with [] after a reconnect; `ticketId` filters.
export default function useRealtime(types, handler, { ticketId = null, debounceMs = 500 } = {}) {
  const realtime = useContext(RealtimeContext)
  const handlerRef = useRef(handler)
  useEffect(() => {
    handlerRef.current = handler
  })

  const key = types.join('|')
  useEffect(() => {
    if (!realtime) return undefined
    let timer = null
    let pending = []
    const flush = () => {
      const batch = pending
      pending = []
      timer = null
      handlerRef.current(batch)
    }
    const onEvent = (event) => {
      if (ticketId && event.ticketId !== ticketId && !event.ticketIds?.includes(ticketId)) return
      pending.push(event)
      if (!timer) timer = setTimeout(flush, debounceMs)
    }
    const onResync = () => {
      if (!timer) timer = setTimeout(flush, debounceMs)
    }
    const unsubscribers = [...key.split('|').map((t) => realtime.subscribe(t, onEvent)), realtime.subscribe('realtime.resync', onResync)]
    return () => {
      unsubscribers.forEach((off) => off())
      clearTimeout(timer)
    }
    // `realtime.subscribe` is stable per connection state; re-subscribing on reconnect is harmless.
  }, [realtime, key, ticketId, debounceMs])
}
