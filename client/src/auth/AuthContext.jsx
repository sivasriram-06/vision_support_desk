import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  getMe,
  login as apiLogin,
  logout as apiLogout,
  changePassword as apiChangePassword,
  getStoredToken,
  setStoredToken,
  setUnauthorizedHandler,
} from '../utils/api.js'

const AuthContext = createContext(null)

/**
 * Holds the signed-in agent (from GET /auth/me: role, team, permissions).
 * `status` is 'loading' until a stored token has been checked, then
 * 'signedOut' or 'signedIn'.
 */
export function AuthProvider({ children }) {
  const [agent, setAgent] = useState(null)
  const [status, setStatus] = useState(() => (getStoredToken() ? 'loading' : 'signedOut'))

  const clearSession = useCallback(() => {
    setStoredToken(null)
    setAgent(null)
    setStatus('signedOut')
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(clearSession)
    return () => setUnauthorizedHandler(null)
  }, [clearSession])

  // All tabs share one stored login. If another tab signs in as someone
  // else (or signs out), this tab would otherwise keep showing the old
  // person while its requests go out as the new one - so follow the
  // change: reload as the new account, or drop to the sign-in page.
  useEffect(() => {
    const onStorage = (event) => {
      if (event.key !== 'vsd:token' || event.newValue === event.oldValue) return
      if (event.newValue) window.location.reload()
      else {
        setAgent(null)
        setStatus('signedOut')
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  useEffect(() => {
    if (!getStoredToken()) return
    getMe()
      .then((res) => {
        setAgent(res.data)
        setStatus('signedIn')
      })
      .catch(clearSession)
  }, [clearSession])

  const login = useCallback(async (email, password) => {
    const res = await apiLogin(email, password)
    setStoredToken(res.data.token)
    setAgent(res.data.agent)
    setStatus('signedIn')
  }, [])

  const logout = useCallback(async () => {
    try {
      await apiLogout()
    } catch {
      // the local session is cleared either way
    }
    clearSession()
  }, [clearSession])

  const changePassword = useCallback(async (currentPassword, newPassword) => {
    const res = await apiChangePassword(currentPassword, newPassword)
    setAgent(res.data)
  }, [])

  const value = useMemo(() => {
    const permissions = agent?.permissions || []
    return {
      agent,
      status,
      login,
      logout,
      changePassword,
      can: (permission) => permissions.includes(permission),
    }
  }, [agent, status, login, logout, changePassword])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext)
