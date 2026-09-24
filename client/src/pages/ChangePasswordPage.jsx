import { useState } from 'react'
import { AlertTriangle, KeyRound, LogOut } from 'lucide-react'
import { useAuth } from '../auth/AuthContext.jsx'
import { ApiError } from '../utils/api.js'
import Input from '../components/ui/Input.jsx'
import Button from '../components/ui/Button.jsx'

/**
 * Shown instead of the app while the agent still has a temporary password
 * (seed default or admin reset). The server refuses every other request
 * until this is done, so there is nothing to skip to.
 */
export default function ChangePasswordPage() {
  const { agent, changePassword, logout } = useAuth()
  const [form, setForm] = useState({ current: '', next: '', confirm: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const mismatch = form.confirm && form.next !== form.confirm

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.current || !form.next || form.next !== form.confirm) return
    setError('')
    setSaving(true)
    try {
      await changePassword(form.current, form.next)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change password')
      setSaving(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-navy via-navy-dark to-navy p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-[420px] rounded-2xl bg-white p-8 shadow-dropdown">
        <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
          <KeyRound className="h-5 w-5 text-primary" />
        </div>
        <h2 className="text-[20px] font-extrabold text-ink-strong">Set your own password</h2>
        <p className="mt-1 mb-6 text-[13px] text-muted">
          Hi {agent?.firstName}, you signed in with a temporary password. Choose a new one to continue — at least 8
          characters with a letter and a number.
        </p>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[12.5px] font-semibold text-red-600">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="flex flex-col gap-3">
          <Input type="password" autoComplete="current-password" placeholder="Temporary password" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} autoFocus />
          <Input type="password" autoComplete="new-password" placeholder="New password" value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} />
          <Input type="password" autoComplete="new-password" placeholder="Confirm new password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
          {mismatch && <p className="text-[12px] font-medium text-danger">Passwords don't match.</p>}
        </div>

        <div className="mt-6 flex items-center justify-between gap-2">
          <Button type="button" variant="ghost" icon={LogOut} onClick={logout}>
            Sign out
          </Button>
          <Button type="submit" variant="primary" disabled={saving || !form.current || !form.next || form.next !== form.confirm}>
            {saving ? 'Saving…' : 'Save password'}
          </Button>
        </div>
      </form>
    </div>
  )
}
