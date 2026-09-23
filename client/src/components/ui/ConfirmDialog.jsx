import { AlertTriangle } from 'lucide-react'
import Modal from './Modal.jsx'
import Button from './Button.jsx'

/**
 * Generic "are you sure?" gate for destructive actions (delete, in
 * particular). Renders nothing when `open` is false, so callers can keep a
 * single instance mounted and just toggle the target being confirmed.
 */
export default function ConfirmDialog({
  open,
  title = 'Delete this?',
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  loading = false,
  error = null,
  onConfirm,
  onCancel,
}) {
  if (!open) return null

  return (
    <Modal title={title} onClose={onCancel} className="max-w-sm">
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-danger/10">
            <AlertTriangle className="h-4.5 w-4.5 text-danger" />
          </div>
          <p className="pt-1.5 text-[13px] text-ink">{message}</p>
        </div>

        {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-[12.5px] font-medium text-danger">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={loading}>
            {loading ? 'Deleting…' : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
