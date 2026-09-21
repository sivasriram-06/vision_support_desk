/** Small pill used for status/priority. `dot` shows a leading color dot instead of a solid fill. */
export default function Badge({ children, textClass = 'text-ink', bgClass = 'bg-muted/10', dotClass, className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${bgClass} ${textClass} ${className}`}
    >
      {dotClass && <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />}
      {children}
    </span>
  )
}
