import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, getToken, setToken, SIGNED_OUT_EVENT } from './api'
import type { LoginCodeSent, LoginResponse, Staff } from './types'

type AuthCtx = {
  staff: Staff | null
  ready: boolean
  /** step 1 — checks the password and e-mails a 6-digit code to the staff email */
  sendCode: (email: string, password: string) => Promise<LoginCodeSent>
  /** step 2 — same credentials + the e-mailed code → 2-hour session */
  login: (email: string, password: string, code: string) => Promise<Staff>
  logout: () => Promise<void>
}

const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [staff, setStaff] = useState<Staff | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!getToken()) {
      setReady(true)
      return
    }
    api.get<Staff>('/auth/me').then(setStaff).catch(() => setStaff(null)).finally(() => setReady(true))
  }, [])

  // any 401 from the API (session expired after 2 hours, or revoked) signs the console out
  useEffect(() => {
    const onSignedOut = () => setStaff(null)
    window.addEventListener(SIGNED_OUT_EVENT, onSignedOut)
    return () => window.removeEventListener(SIGNED_OUT_EVENT, onSignedOut)
  }, [])

  const sendCode = useCallback((email: string, password: string) => api.post<LoginCodeSent>('/auth/login/code', { email, password }), [])

  const login = useCallback(async (email: string, password: string, code: string) => {
    const r = await api.post<LoginResponse>('/auth/login', { email, password, code })
    setToken(r.token)
    setStaff(r.user)
    return r.user
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout')
    } catch {}
    setToken(null)
    setStaff(null)
  }, [])

  const value = useMemo(() => ({ staff, ready, sendCode, login, logout }), [staff, ready, sendCode, login, logout])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>')
  return v
}
