import { useEffect, useMemo, useState } from 'react'
import { ShieldCheck, Users, Mail, History, Lock, KeyRound, Ban, Check, RotateCcw, ExternalLink, Search } from 'lucide-react'
import PageTitle from '../components/ui/PageTitle.jsx'
import Button from '../components/ui/Button.jsx'
import Badge from '../components/ui/Badge.jsx'
import Avatar from '../components/ui/Avatar.jsx'
import Input from '../components/ui/Input.jsx'
import Modal from '../components/ui/Modal.jsx'
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx'
import ErrorState from '../components/ui/ErrorState.jsx'
import SkeletonRows from '../components/ui/SkeletonRows.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { ROLE_KEYS, ROLE_STYLE } from '../auth/permissions.js'
import { formatDateTime } from '../utils/format.js'
import {
  ApiError,
  getRoles,
  getPermissionCatalog,
  updateRolePermissions,
  getAdminUsers,
  setUserPassword,
  revokeUserLogin,
  getLoginEvents,
  getMailIntegration,
  getGmailAuthUrl,
} from '../utils/api.js'

const TABS = [
  { key: 'roles', label: 'Roles & Permissions', icon: ShieldCheck },
  { key: 'users', label: 'User Access', icon: Users },
  { key: 'mail', label: 'Mail Integration', icon: Mail },
  { key: 'activity', label: 'Login Activity', icon: History },
]

const DEFAULT_TEMP_PASSWORD = 'pass123'

const errorText = (err, fallback) => (err instanceof ApiError ? err.message : fallback)
const fullNameOf = (a) => [a.First_Name, a.Last_Name].filter(Boolean).join(' ')

function Card({ children, className = '' }) {
  return <div className={`rounded-2xl border border-slate-200/90 bg-white shadow-card ${className}`}>{children}</div>
}

function TableHead({ columns }) {
  return (
    <thead>
      <tr className="bg-gradient-to-b from-[#F4F7FB] to-[#E9EEF6]">
        {columns.map((c, i) => (
          <th
            key={i}
            className={`border-b border-border-strong px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-700 ${c.center ? 'text-center' : 'text-left'}`}
            style={c.width ? { width: c.width } : undefined}
          >
            {c.label}
          </th>
        ))}
      </tr>
    </thead>
  )
}

/* ─── Roles & Permissions: role × permission matrix ─── */
function RolesTab() {
  const [state, setState] = useState({ loading: true, error: null, roles: [], catalog: [] })
  const [draft, setDraft] = useState({}) // roleId -> Set of permission keys
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)

  const load = () => {
    setState((prev) => ({ ...prev, loading: true, error: null }))
    Promise.all([getRoles(), getPermissionCatalog()])
      .then(([rolesRes, catalogRes]) => {
        setState({ loading: false, error: null, roles: rolesRes.data, catalog: catalogRes.data })
        setDraft(Object.fromEntries(rolesRes.data.map((r) => [r.Role_Id, new Set(r.permissions)])))
      })
      .catch((err) => setState({ loading: false, error: errorText(err, 'Failed to load roles.'), roles: [], catalog: [] }))
  }

  useEffect(load, [])

  const dirtyRoles = state.roles.filter((r) => {
    const current = draft[r.Role_Id]
    return current && (current.size !== r.permissions.length || r.permissions.some((p) => !current.has(p)))
  })

  const toggle = (role, key) => {
    if (role.Is_Locked) return
    setMessage(null)
    setDraft((prev) => {
      const next = new Set(prev[role.Role_Id])
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return { ...prev, [role.Role_Id]: next }
    })
  }

  const save = async () => {
    setSaving(true)
    setMessage(null)
    try {
      for (const role of dirtyRoles) {
        await updateRolePermissions(role.Role_Id, [...draft[role.Role_Id]])
      }
      setMessage({ ok: true, text: 'Permissions saved. They apply on each agent’s next action.' })
      load()
    } catch (err) {
      setMessage({ ok: false, text: errorText(err, 'Failed to save permissions.') })
    } finally {
      setSaving(false)
    }
  }

  if (state.error) return <Card><ErrorState message={state.error} onRetry={load} /></Card>

  const groups = [...new Set(state.catalog.map((p) => p.group))]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-[13px] text-muted">
          Tick what each role may do. <strong className="text-ink">Admin</strong> always has full access and can't be edited, so the
          Admin page can never be locked out. Changes apply immediately — no re-login needed.
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" icon={RotateCcw} onClick={load} disabled={saving || dirtyRoles.length === 0}>
            Discard
          </Button>
          <Button variant="primary" icon={Check} onClick={save} disabled={saving || dirtyRoles.length === 0}>
            {saving ? 'Saving…' : `Save changes${dirtyRoles.length ? ` (${dirtyRoles.length})` : ''}`}
          </Button>
        </div>
      </div>
      {message && (
        <p className={`rounded-lg px-3 py-2 text-[12.5px] font-medium ${message.ok ? 'bg-success/10 text-success-dark' : 'bg-danger/10 text-danger'}`}>
          {message.text}
        </p>
      )}

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-[12.5px]">
          <TableHead
            columns={[
              { label: 'Permission', width: '34%' },
              ...state.roles.map((r) => ({ label: r.Role_Name, center: true })),
            ]}
          />
          <tbody>
            {state.loading && <SkeletonRows columns={6} />}
            {!state.loading &&
              groups.map((group) => (
                <PermissionGroup key={group} group={group} catalog={state.catalog} roles={state.roles} draft={draft} onToggle={toggle} />
              ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

function PermissionGroup({ group, catalog, roles, draft, onToggle }) {
  return (
    <>
      <tr className="bg-[#F8FAFD]">
        <td colSpan={roles.length + 1} className="px-3.5 py-2 text-[10.5px] font-bold uppercase tracking-wider text-navy">
          {group}
        </td>
      </tr>
      {catalog
        .filter((p) => p.group === group)
        .map((perm) => (
          <tr key={perm.key} className="border-t border-[#EEF2F8]">
            <td className="px-3.5 py-2.5">
              <p className="font-semibold text-ink">{perm.label}</p>
              <p className="text-[11.5px] text-muted">{perm.description}</p>
            </td>
            {roles.map((role) => {
              const checked = draft[role.Role_Id]?.has(perm.key) || false
              return (
                <td key={role.Role_Id} className="px-3.5 py-2.5 text-center">
                  <button
                    onClick={() => onToggle(role, perm.key)}
                    disabled={role.Is_Locked}
                    title={role.Is_Locked ? 'Admin always has full access' : checked ? 'Revoke' : 'Grant'}
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-md border transition ${
                      checked ? 'border-primary bg-primary text-white' : 'border-border-strong bg-white text-transparent hover:border-primary/60'
                    } ${role.Is_Locked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                  >
                    {role.Is_Locked ? <Lock className="h-3 w-3" /> : <Check className="h-3.5 w-3.5" />}
                  </button>
                </td>
              )
            })}
          </tr>
        ))}
    </>
  )
}

/* ─── User Access: who can sign in, temporary passwords, revocation ─── */
function loginState(user) {
  if (user.Has_Login !== 'Y') return { label: 'No sign-in', text: 'text-muted', bg: 'bg-muted/10' }
  if (user.Locked_Until && new Date(user.Locked_Until.replace(' ', 'T') + 'Z') > new Date()) return { label: 'Locked', text: 'text-danger', bg: 'bg-danger/10' }
  if (user.Status !== 'Active') return { label: 'Inactive', text: 'text-muted', bg: 'bg-muted/10' }
  if (user.Must_Change_Password === 'Y') return { label: 'Temp password', text: 'text-warn', bg: 'bg-warn/10' }
  return { label: 'Active', text: 'text-success-dark', bg: 'bg-success/10' }
}

function UsersTab() {
  const { agent: me } = useAuth()
  const [state, setState] = useState({ loading: true, error: null, users: [] })
  const [search, setSearch] = useState('')
  const [passwordFor, setPasswordFor] = useState(null)
  const [tempPassword, setTempPassword] = useState(DEFAULT_TEMP_PASSWORD)
  const [busy, setBusy] = useState(false)
  const [modalError, setModalError] = useState(null)
  const [revokeFor, setRevokeFor] = useState(null)
  const [notice, setNotice] = useState(null)

  const load = () => {
    setState((prev) => ({ ...prev, loading: true, error: null }))
    getAdminUsers()
      .then((res) => setState({ loading: false, error: null, users: res.data }))
      .catch((err) => setState({ loading: false, error: errorText(err, 'Failed to load users.'), users: [] }))
  }
  useEffect(load, [])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return state.users.filter((u) => !q || `${fullNameOf(u)} ${u.Email} ${u.Team_Name || ''}`.toLowerCase().includes(q))
  }, [state.users, search])

  const canTouch = (user) => user.Role_Key !== ROLE_KEYS.ADMIN || me?.roleKey === ROLE_KEYS.ADMIN

  const submitPassword = async () => {
    setBusy(true)
    setModalError(null)
    try {
      await setUserPassword(passwordFor.Agent_Id, tempPassword)
      setNotice(`${fullNameOf(passwordFor)} can now sign in with the temporary password and will be asked to change it.`)
      setPasswordFor(null)
      load()
    } catch (err) {
      setModalError(errorText(err, 'Failed to set password.'))
    } finally {
      setBusy(false)
    }
  }

  const submitRevoke = async () => {
    setBusy(true)
    setModalError(null)
    try {
      await revokeUserLogin(revokeFor.Agent_Id)
      setNotice(`${fullNameOf(revokeFor)} can no longer sign in.`)
      setRevokeFor(null)
      load()
    } catch (err) {
      setModalError(errorText(err, 'Failed to revoke sign-in.'))
    } finally {
      setBusy(false)
    }
  }

  if (state.error) return <Card><ErrorState message={state.error} onRetry={load} /></Card>

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-[13px] text-muted">
          Roles and teams are edited on the <strong className="text-ink">Agents</strong> page. Here you control who can sign in:
          issue a temporary password (they must change it on first login) or revoke access.
        </p>
        <Input icon={Search} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search users" className="w-full sm:w-64" />
      </div>
      {notice && <p className="rounded-lg bg-success/10 px-3 py-2 text-[12.5px] font-medium text-success-dark">{notice}</p>}

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-[12.5px]">
          <TableHead
            columns={[
              { label: 'User', width: '26%' },
              { label: 'Team', width: '15%' },
              { label: 'Role', width: '14%' },
              { label: 'Sign-in', width: '12%' },
              { label: 'Last login', width: '15%' },
              { label: '', width: '18%' },
            ]}
          />
          <tbody>
            {state.loading && <SkeletonRows columns={6} />}
            {!state.loading &&
              visible.map((user) => {
                const ls = loginState(user)
                const style = ROLE_STYLE[user.Role_Key]
                return (
                  <tr key={user.Agent_Id} className="border-t border-[#EEF2F8]">
                    <td className="px-3.5 py-2.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <Avatar name={fullNameOf(user)} size={26} />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-ink">{fullNameOf(user)}</p>
                          <p className="truncate text-[11.5px] text-muted">{user.Email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3.5 py-2.5 text-slate-600">{user.Team_Name || '—'}</td>
                    <td className="px-3.5 py-2.5">
                      {style ? <Badge textClass={style.text} bgClass={style.bg}>{user.Role_Name}</Badge> : <span className="italic text-muted">No role</span>}
                    </td>
                    <td className="px-3.5 py-2.5">
                      <Badge textClass={ls.text} bgClass={ls.bg}>{ls.label}</Badge>
                    </td>
                    <td className="px-3.5 py-2.5 text-muted">{user.Last_Login_Time ? formatDateTime(user.Last_Login_Time) : 'Never'}</td>
                    <td className="px-3.5 py-2.5">
                      {canTouch(user) && (
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setPasswordFor(user)
                              setTempPassword(DEFAULT_TEMP_PASSWORD)
                              setModalError(null)
                            }}
                            className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border px-2 py-1 text-[11.5px] font-semibold text-slate-600 transition hover:bg-slate-50"
                          >
                            <KeyRound className="h-3.5 w-3.5" />
                            {user.Has_Login === 'Y' ? 'Reset' : 'Issue'}
                          </button>
                          {user.Has_Login === 'Y' && user.Agent_Id !== me?.agentId && (
                            <button
                              onClick={() => {
                                setRevokeFor(user)
                                setModalError(null)
                              }}
                              title="Revoke sign-in"
                              className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border px-2 py-1 text-[11.5px] font-semibold text-danger transition hover:bg-danger/5"
                            >
                              <Ban className="h-3.5 w-3.5" />
                              Revoke
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </Card>

      {passwordFor && (
        <Modal title={`${passwordFor.Has_Login === 'Y' ? 'Reset' : 'Issue'} password — ${fullNameOf(passwordFor)}`} onClose={() => setPasswordFor(null)}>
          <p className="mb-3 text-[13px] text-muted">
            Sets a temporary password for <strong className="text-ink">{passwordFor.Email}</strong>. It also unlocks the account.
            They'll be asked to choose their own password right after signing in.
          </p>
          <Input value={tempPassword} onChange={(e) => setTempPassword(e.target.value)} placeholder="Temporary password" autoFocus />
          {modalError && <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-[12.5px] font-medium text-danger">{modalError}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPasswordFor(null)} disabled={busy}>Cancel</Button>
            <Button variant="primary" icon={KeyRound} onClick={submitPassword} disabled={busy || !tempPassword}>
              {busy ? 'Saving…' : 'Set password'}
            </Button>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        open={!!revokeFor}
        title="Revoke sign-in"
        confirmLabel="Revoke"
        message={
          <>
            <strong>{revokeFor ? fullNameOf(revokeFor) : ''}</strong> will be signed out and won't be able to log in until a new
            password is issued. Their tickets and history are kept.
          </>
        }
        loading={busy}
        error={modalError}
        onConfirm={submitRevoke}
        onCancel={() => setRevokeFor(null)}
      />
    </div>
  )
}

/* ─── Mail Integration: which Gmail mailbox feeds the desk ─── */
function MailTab() {
  const [state, setState] = useState({ loading: true, error: null, data: null })
  const [linkError, setLinkError] = useState(null)

  const load = () =>
    getMailIntegration()
      .then((res) => setState({ loading: false, error: null, data: res.data }))
      .catch((err) => setState({ loading: false, error: errorText(err, 'Failed to load mail settings.'), data: null }))
  useEffect(() => {
    load()
  }, [])

  const openConsent = async () => {
    setLinkError(null)
    try {
      const res = await getGmailAuthUrl()
      window.open(res.data.url, '_blank', 'noopener')
    } catch (err) {
      setLinkError(errorText(err, 'Could not start the Gmail connection.'))
    }
  }

  if (state.error) return <Card><ErrorState message={state.error} onRetry={load} /></Card>
  const d = state.data

  const row = (label, value) => (
    <div className="flex items-center justify-between gap-4 border-t border-[#EEF2F8] py-3 first:border-t-0">
      <span className="text-[12px] font-bold uppercase tracking-wider text-muted">{label}</span>
      <span className="text-[13px] font-semibold text-ink">{value}</span>
    </div>
  )

  return (
    <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-2">
      <Card className="p-5">
        <p className="mb-2 text-[13px] font-bold text-ink-strong">Support mailbox</p>
        {state.loading || !d ? (
          <p className="text-[13px] text-muted">Loading…</p>
        ) : (
          <>
            {row('Mailbox', d.mailbox)}
            {row('Connection', d.connected ? <Badge textClass="text-success-dark" bgClass="bg-success/10">Connected</Badge> : <Badge textClass="text-danger" bgClass="bg-danger/10">Not connected</Badge>)}
            {row('Auto sync', d.syncEnabled ? `Every ${d.syncIntervalSeconds}s` : 'Off')}
            <div className="mt-4 flex justify-end">
              <Button variant="secondary" icon={ExternalLink} onClick={openConsent}>
                {d.connected ? 'Re-authorize Gmail' : 'Connect Gmail'}
              </Button>
            </div>
            {linkError && <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-[12.5px] font-medium text-danger">{linkError}</p>}
          </>
        )}
      </Card>
      <Card className="p-5 text-[13px] leading-relaxed text-slate-600">
        <p className="mb-2 font-bold text-ink-strong">How the mailbox credentials work</p>
        <p>
          The Gmail account whose credentials are configured on the server is the desk's intake mailbox, and that account is
          seeded as an <strong>Admin</strong>. In production this is <strong>vision.support@sunoida.com</strong>.
        </p>
        <p className="mt-2">
          Credentials (OAuth client and refresh token) live only in the server's environment file and are never shown here. To
          switch mailbox, sign in to Google as the new mailbox via <em>Connect Gmail</em>, save the refresh token it returns
          to the server's <code className="rounded bg-slate-100 px-1">.env</code>, update <code className="rounded bg-slate-100 px-1">GMAIL_MAILBOX</code>,
          and restart the server.
        </p>
      </Card>
    </div>
  )
}

/* ─── Login Activity: audit trail of sign-ins ─── */
const EVENT_STYLE = {
  LOGIN_SUCCESS: { label: 'Signed in', text: 'text-success-dark', bg: 'bg-success/10' },
  LOGIN_FAILURE: { label: 'Failed', text: 'text-danger', bg: 'bg-danger/10' },
  LOGOUT: { label: 'Signed out', text: 'text-slate-600', bg: 'bg-slate-100' },
  SESSION_REVOKED: { label: 'Revoked', text: 'text-warn', bg: 'bg-warn/10' },
}
const FAILURE_TEXT = {
  UNKNOWN_EMAIL: 'Unknown email',
  NO_CREDENTIAL: 'No sign-in issued',
  BAD_PASSWORD: 'Wrong password',
  LOCKED: 'Account locked',
  INACTIVE: 'Account inactive',
}

function ActivityTab() {
  const [state, setState] = useState({ loading: true, error: null, events: [] })
  const load = () =>
    getLoginEvents()
      .then((res) => setState({ loading: false, error: null, events: res.data }))
      .catch((err) => setState({ loading: false, error: errorText(err, 'Failed to load activity.'), events: [] }))
  useEffect(() => {
    load()
  }, [])

  if (state.error) return <Card><ErrorState message={state.error} onRetry={load} /></Card>

  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse text-[12.5px]">
        <TableHead columns={[{ label: 'When', width: '20%' }, { label: 'User', width: '32%' }, { label: 'Event', width: '14%' }, { label: 'Detail', width: '20%' }, { label: 'IP', width: '14%' }]} />
        <tbody>
          {state.loading && <SkeletonRows columns={5} />}
          {!state.loading &&
            state.events.map((e) => {
              const style = EVENT_STYLE[e.Event_Type] || EVENT_STYLE.LOGOUT
              const name = [e.First_Name, e.Last_Name].filter(Boolean).join(' ')
              return (
                <tr key={e.Login_Event_Id} className="border-t border-[#EEF2F8]">
                  <td className="px-3.5 py-2.5 text-muted">{formatDateTime(e.Event_Time)}</td>
                  <td className="px-3.5 py-2.5">
                    <p className="font-semibold text-ink">{name || '—'}</p>
                    <p className="text-[11.5px] text-muted">{e.Login_Email}</p>
                  </td>
                  <td className="px-3.5 py-2.5"><Badge textClass={style.text} bgClass={style.bg}>{style.label}</Badge></td>
                  <td className="px-3.5 py-2.5 text-slate-600">{e.Failure_Code ? FAILURE_TEXT[e.Failure_Code] || e.Failure_Code : '—'}</td>
                  <td className="px-3.5 py-2.5 font-mono text-[11.5px] text-muted">{e.Ip_Address || '—'}</td>
                </tr>
              )
            })}
        </tbody>
      </table>
      {!state.loading && state.events.length === 0 && <p className="p-8 text-center text-[13px] text-muted">No sign-in activity yet.</p>}
    </Card>
  )
}

export default function AdminPage() {
  const [tab, setTab] = useState('roles')

  return (
    <div className="flex flex-col gap-5">
      <PageTitle title="Admin Controller" subtitle="Who can do what, who can sign in, and where support mail comes from." />

      <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200/90 bg-white p-1 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:w-fit">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12.5px] font-semibold transition ${
              tab === key ? 'bg-navy text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-ink'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'roles' && <RolesTab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'mail' && <MailTab />}
      {tab === 'activity' && <ActivityTab />}
    </div>
  )
}
