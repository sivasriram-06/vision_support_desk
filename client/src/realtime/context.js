import { createContext } from 'react'

/** Realtime connection (see RealtimeProvider.jsx): { connected, subscribe(type, handler) }. */
export const RealtimeContext = createContext(null)
