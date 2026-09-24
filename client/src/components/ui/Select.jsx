import { ChevronDown } from 'lucide-react'

/** Native <select> styled to match Input, with a custom chevron. Kept native for accessibility/simplicity. */
export default function Select({ options, className = '', placeholder, ...props }) {
  return (
    <div className={`relative ${className}`}>
      <select
        {...props}
        className="w-full appearance-none rounded-[9px] border border-border bg-white py-2 pl-3 pr-8 text-[13px] text-ink shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] outline-none transition hover:border-slate-300 focus:border-primary focus:shadow-[0_0_0_3px_rgba(232,99,43,0.13)] disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-muted"
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
    </div>
  )
}
