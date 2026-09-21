/** Page heading with the brand's signature orange rail, plus an optional right-aligned action slot. */
export default function PageTitle({ title, subtitle, count, actions }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-stretch gap-3">
        <span className="w-[5px] min-h-[26px] self-stretch rounded-[3px] bg-gradient-to-b from-primary-light to-primary shadow-[0_2px_6px_rgba(232,99,43,0.45)]" />
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-[20px] font-extrabold tracking-tight text-ink-strong">{title}</h1>
            {typeof count === 'number' && (
              <span className="rounded-full bg-navy/5 px-2.5 py-0.5 font-mono text-[12px] font-bold text-navy">
                {count}
              </span>
            )}
          </div>
          {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
