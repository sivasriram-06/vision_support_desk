import { useEffect, useState } from 'react'
import Sidebar from './Sidebar.jsx'
import Topbar from './Topbar.jsx'

const PIN_STORAGE_KEY = 'vsd:sidebar-pinned'

const readStoredPin = () => {
  try {
    return localStorage.getItem(PIN_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}


export default function AppShell({ children }) {
  const [pinned, setPinned] = useState(readStoredPin)

  useEffect(() => {
    try {
      localStorage.setItem(PIN_STORAGE_KEY, String(pinned))
    } catch {
      // ignore - per-viewer convenience only
    }
  }, [pinned])

  return (
    <div className="min-h-screen bg-surface">
      <Sidebar pinned={pinned} onTogglePin={() => setPinned((prev) => !prev)} />
      <div
        className={`flex min-h-screen flex-col transition-[padding-left] duration-200 ${pinned ? 'pl-60' : 'pl-[72px]'}`}
      >
        <Topbar />
        <main className="flex-1 px-5 py-6 md:px-7 md:py-7 xl:px-9 2xl:px-12">
          <div className="mx-auto w-full max-w-[1680px]">{children}</div>
        </main>
      </div>
    </div>
  )
}
