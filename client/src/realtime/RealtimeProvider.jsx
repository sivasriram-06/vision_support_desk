import { useEffect, useMemo, useRef, useState } from 'react'
import { RealtimeContext } from './context.js'
import { getStoredToken } from '../utils/api.js'

// One WebSocket per tab; events only say what changed, subscribers refetch via REST. Token never in the URL.

const RESYNC = 'realtime.resync'
const BACKOFF_MS = [1000, 2000, 5000, 10000, 30000]
const NO_RETRY_CODES = new Set([4001, 4003]) // auth failed, session revoked
const WS_URL = `${(import.meta.env.VITE_API_BASE_URL || window.location.origin).replace(/^http/, 'ws').replace(/\/$/, '')}/ws`

export default function RealtimeProvider({ children }) {
  const handlersRef = useRef(new Map()) // type -> Set(handler)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    let ws = null
    let attempt = 0
    let retryTimer = null
    let stopped = false
    let everReady = false

    const emit = (type, event) => {
      for (const handler of handlersRef.current.get(type) || []) handler(event)
    }

    const connect = () => {
      clearTimeout(retryTimer)
      if (stopped || (ws && ws.readyState <= WebSocket.OPEN)) return
      const token = getStoredToken()
      if (!token) return
      ws = new WebSocket(WS_URL)
      ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token }))
      ws.onmessage = (message) => {
        let event
        try {
          event = JSON.parse(message.data)
        } catch {
          return
        }
        if (event.type === 'ready') {
          attempt = 0
          setConnected(true)
          // Later connects may have missed events while offline, so subscribers refetch everything.
          if (everReady) emit(RESYNC, { type: RESYNC })
          everReady = true
          return
        }
        emit(event.type, event)
      }
      ws.onclose = (closeEvent) => {
        setConnected(false)
        ws = null
        if (stopped || NO_RETRY_CODES.has(closeEvent.code)) return
        retryTimer = setTimeout(connect, BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)])
        attempt += 1
      }
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') connect()
    }

    connect()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stopped = true
      clearTimeout(retryTimer)
      document.removeEventListener('visibilitychange', onVisible)
      if (ws) ws.close(1000, 'signed out')
    }
  }, [])

  const value = useMemo(
    () => ({
      connected,
      subscribe: (type, handler) => {
        const map = handlersRef.current
        if (!map.has(type)) map.set(type, new Set())
        map.get(type).add(handler)
        return () => map.get(type)?.delete(handler)
      },
    }),
    [connected]
  )

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>
}
