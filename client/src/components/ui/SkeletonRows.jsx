/** Animated placeholder rows shown while a table's data is loading. */
export default function SkeletonRows({ rows = 8, columns = 6 }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <tr key={rowIndex} className="border-b border-[#EEF2F8]">
          {Array.from({ length: columns }).map((__, colIndex) => (
            <td key={colIndex} className="px-3.5 py-3">
              <div className="h-3.5 animate-pulse rounded bg-slate-200/70" style={{ width: `${55 + ((colIndex * 13) % 35)}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}
