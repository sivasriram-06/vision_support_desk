import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

// type="password" adds our own show/hide eye (Edge's built-in one is hidden in index.css).
export default function Input({ icon: Icon, className = '', type, ...props }) {
  const isPassword = type === 'password'
  const [visible, setVisible] = useState(false)
  return (
    <div className={`relative flex items-center ${className}`}>
      {Icon && <Icon className="pointer-events-none absolute left-3 h-4 w-4 text-muted" />}
      <input
        {...props}
        type={isPassword && visible ? 'text' : type}
        className={`w-full rounded-[9px] border border-border bg-white text-[13px] text-ink shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] outline-none transition placeholder:text-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-muted hover:border-slate-300 focus:border-primary focus:shadow-[0_0_0_3px_rgba(232,99,43,0.13),inset_0_1px_2px_rgba(15,23,42,0.03)] ${
          Icon ? 'py-2 pl-9' : 'px-3 py-2'
        } ${isPassword ? 'pr-9' : Icon ? 'pr-3' : ''}`}
      />
      {isPassword && <PasswordToggle visible={visible} onToggle={() => setVisible((v) => !v)} className="right-2.5" />}
    </div>
  )
}

/** The eye button inside a password field. Also used by the sign-in page's own field. */
export function PasswordToggle({ visible, onToggle, className = '' }) {
  const Icon = visible ? EyeOff : Eye
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={visible ? 'Hide password' : 'Show password'}
      title={visible ? 'Hide password' : 'Show password'}
      className={`absolute flex h-7 w-7 items-center justify-center rounded-md text-muted transition hover:bg-slate-100 hover:text-ink cursor-pointer ${className}`}
    >
      <Icon className="h-4 w-4" />
    </button>
  )
}
