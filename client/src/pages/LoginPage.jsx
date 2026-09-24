import { useState } from 'react'
import { AlertTriangle, ArrowRight } from 'lucide-react'
import { useAuth } from '../auth/AuthContext.jsx'
import { ApiError } from '../utils/api.js'

// Layout follows the Vision AI Ops sign-in screen (AI_SunoidaProjectManagement):
// navy brand panel on the left, white form panel with the Sunoida lockup on the right.
const STATS = [
  { n: '8', l: 'Support teams' },
  { n: '36+', l: 'Banks' },
  { n: '24x7', l: 'Priority cover' },
]

export default function LoginPage() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email.trim() || !password) return
    setError('')
    setLoading(true)
    try {
      await login(email.trim(), password)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sign in failed')
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-navy via-navy-dark to-navy">
      <div className="relative hidden flex-1 flex-col justify-center overflow-hidden p-[60px] text-white md:flex">
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '32px 32px' }}
        />
        <div className="relative z-10">
          <h1 className="mb-4 text-[32px] font-extrabold leading-tight">Vision Support Desk</h1>
          <p className="max-w-[420px] text-[15px] leading-relaxed text-white/50">
            Every bank's support mail in one queue — triage cases, route them to the right team and track them to closure.
          </p>
          <div className="mt-10 flex gap-8">
            {STATS.map((s) => (
              <div key={s.l} className="text-center">
                <div className="text-[28px] font-extrabold text-primary">{s.n}</div>
                <div className="text-[11px] uppercase tracking-[0.08em] text-white/40">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex w-full flex-col justify-center bg-white p-10 md:w-[460px] md:rounded-l-[24px] md:p-[60px] md:shadow-[-8px_0_40px_rgba(0,0,0,0.1)]"
      >
        <img src="/sunoida-logo.png" alt="Sunoida — Banking on Intelligence" className="mb-9 block h-[66px] w-auto max-w-full object-contain object-left" />
        <h2 className="mb-2 text-[26px] font-extrabold text-ink-strong">Welcome back</h2>
        <p className="mb-7 text-[14px] text-muted">Sign in to your support workspace</p>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-[10px] border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-semibold text-red-600">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <label className="mb-1.5 block text-[12px] font-bold text-slate-600" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@sunoida.com"
          className="mb-[18px] w-full rounded-[10px] border border-border bg-white px-3.5 py-3 text-[14px] text-ink outline-none transition placeholder:text-slate-400 focus:border-primary focus:shadow-[0_0_0_3px_rgba(232,99,43,0.13)]"
        />

        <label className="mb-1.5 block text-[12px] font-bold text-slate-600" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter password"
          className="mb-6 w-full rounded-[10px] border border-border bg-white px-3.5 py-3 text-[14px] text-ink outline-none transition placeholder:text-slate-400 focus:border-primary focus:shadow-[0_0_0_3px_rgba(232,99,43,0.13)]"
        />

        <button
          type="submit"
          disabled={loading || !email.trim() || !password}
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-[10px] bg-gradient-to-br from-primary-light via-primary to-primary-dark p-3.5 text-[15px] font-semibold text-white shadow-[0_6px_16px_-5px_rgba(232,99,43,0.55)] transition hover:brightness-[1.04] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? 'Signing in…' : (
            <>
              Sign In <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </form>
    </div>
  )
}
