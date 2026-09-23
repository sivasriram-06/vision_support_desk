const VARIANTS = {
  primary:
    'text-white bg-gradient-to-br from-primary-light via-primary to-primary-dark shadow-[0_6px_16px_-5px_rgba(232,99,43,0.55),inset_0_1px_0_rgba(255,255,255,0.28)] hover:brightness-[1.04] hover:-translate-y-px active:translate-y-0',
  secondary:
    'text-slate-600 bg-white border border-[#DDE3EC] shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:bg-slate-50 hover:border-slate-300 hover:-translate-y-px',
  accent: 'text-white bg-sky shadow-[0_2px_8px_rgba(42,171,226,0.3)] hover:bg-sky-dark',
  ghost: 'text-muted hover:bg-slate-100',
  danger: 'text-white bg-danger shadow-[0_6px_16px_-5px_rgba(220,38,38,0.55)] hover:brightness-[1.05] hover:-translate-y-px active:translate-y-0',
}

/** Button matching the reference's `.btn` family (primary/secondary/accent/ghost/danger). */
export default function Button({ variant = 'primary', icon: Icon, children, className = '', ...props }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-semibold transition-all duration-150 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 ${VARIANTS[variant]} ${className}`}
    >
      {Icon && <Icon className="h-4 w-4" />}
      {children}
    </button>
  )
}
