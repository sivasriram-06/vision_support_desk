/** Text input matching the reference's `.input` treatment: soft inset shadow, orange focus ring. */
export default function Input({ icon: Icon, className = '', ...props }) {
  return (
    <div className={`relative flex items-center ${className}`}>
      {Icon && <Icon className="pointer-events-none absolute left-3 h-4 w-4 text-muted" />}
      <input
        {...props}
        className={`w-full rounded-[9px] border border-border bg-white text-[13px] text-ink shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] outline-none transition placeholder:text-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-muted hover:border-slate-300 focus:border-primary focus:shadow-[0_0_0_3px_rgba(232,99,43,0.13),inset_0_1px_2px_rgba(15,23,42,0.03)] ${
          Icon ? 'py-2 pl-9 pr-3' : 'px-3 py-2'
        }`}
      />
    </div>
  )
}
