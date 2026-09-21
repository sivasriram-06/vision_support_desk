import Sidebar from './Sidebar.jsx'
import Topbar from './Topbar.jsx'

/**
 * Page shell: fixed sidebar (w-60) + main column. Content padding/max-width
 * scales up through md/lg/2xl so the page keeps a comfortable, non-overlapping
 * gap at every desktop size instead of stretching edge-to-edge on large
 * monitors. Mobile (<md) is intentionally not the focus here.
 */
export default function AppShell({ children }) {
  return (
    <div className="min-h-screen bg-surface">
      <Sidebar />
      <div className="flex min-h-screen flex-col pl-60">
        <Topbar />
        <main className="flex-1 px-5 py-6 md:px-7 md:py-7 xl:px-9 2xl:px-12">
          <div className="mx-auto w-full max-w-[1680px]">{children}</div>
        </main>
      </div>
    </div>
  )
}
