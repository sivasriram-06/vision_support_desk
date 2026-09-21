import { FileText, Download } from 'lucide-react'
import { formatFileSize } from '../../utils/format.js'
import { getAttachmentDownloadUrl } from '../../utils/api.js'

export default function AttachmentList({ ticketId, attachments }) {
  if (!attachments || attachments.length === 0) return null

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-card">
      <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-muted">
        Attachments ({attachments.length})
      </p>
      <div className="flex flex-col gap-2">
        {attachments.map((file) => (
          <a
            key={file.Attachment_Id}
            href={getAttachmentDownloadUrl(ticketId, file.Attachment_Id)}
            className="group flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 transition hover:border-primary/40 hover:bg-primary/5"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-muted group-hover:bg-primary/10 group-hover:text-primary">
              <FileText className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-ink">{file.File_Name}</p>
              <p className="text-[11.5px] text-muted">{formatFileSize(file.File_Size_Bytes)}</p>
            </div>
            <Download className="h-4 w-4 shrink-0 text-muted group-hover:text-primary" />
          </a>
        ))}
      </div>
    </div>
  )
}
