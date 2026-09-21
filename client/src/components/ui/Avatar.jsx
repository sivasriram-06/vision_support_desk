import { getInitials } from '../../utils/format.js'
import { getAvatarColor } from '../../utils/ticketMeta.js'

/** Circular initials avatar with a deterministic color, matching the reference's `.avatar` treatment. */
export default function Avatar({ name, size = 28 }) {
  return (
    <span
      className="avatar inline-flex items-center justify-center rounded-full border-2 border-white/90 font-bold text-white shadow-sm shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.38, backgroundColor: getAvatarColor(name || '') }}
      title={name || 'Unassigned'}
    >
      {getInitials(name)}
    </span>
  )
}
