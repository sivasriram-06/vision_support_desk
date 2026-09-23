import { X } from 'lucide-react'

/** Centered overlay dialog. Backdrop click and the X button both close it. */
export default function Modal({ title, onClose, children, className = '' }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-navy-dark/40 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={`flex max-h-[85vh] w-full flex-col rounded-2xl bg-white shadow-dropdown ${className || 'max-w-lg'}`}
      >
        <div className="flex items-center justify-between border-b border-[#EEF2F8] px-5 py-4">
          <h2 className="text-[15px] font-bold text-ink-strong">{title}</h2>
          <button
            onClick={onClose}
            title="Close"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition hover:bg-slate-100 hover:text-ink cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  )
}
