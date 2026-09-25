import Avatar from '../ui/Avatar.jsx'
import { assigneeName } from '../../utils/ticketMeta.js'

export default function AssigneeStack({ assignees = [], size = 24, max = 3, showName = false }) {
  if (assignees.length === 0) {
    return <span className="text-[12px] italic text-muted">Unassigned</span>
  }
  const shown = assignees.slice(0, max)
  const extra = assignees.length - shown.length
  const title = assignees.map((a) => `${assigneeName(a)}${a.teamName ? ` (${a.teamName})` : ''}`).join(', ')

  return (
    <div className="flex min-w-0 items-center gap-2" title={title}>
      <div className="flex shrink-0 -space-x-2">
        {shown.map((a) => (
          <span key={a.agentId} className={a.crossTeam ? 'rounded-full ring-2 ring-review/60' : 'rounded-full'}>
            <Avatar name={assigneeName(a)} size={size} />
          </span>
        ))}
        {extra > 0 && (
          <span
            className="inline-flex items-center justify-center rounded-full border-2 border-white bg-slate-200 font-bold text-slate-600"
            style={{ width: size, height: size, fontSize: size * 0.36 }}
          >
            +{extra}
          </span>
        )}
      </div>
      {showName && (
        <span className="truncate text-[12.5px] font-medium text-slate-600">
          {assigneeName(assignees[0])}
          {assignees.length > 1 && <span className="text-muted"> +{assignees.length - 1}</span>}
        </span>
      )}
    </div>
  )
}
