import { useEffect, useState, type FormEvent } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { CircleAlert, Eye, EyeOff, MailCheck, ShieldCheck } from 'lucide-react'
import { ApiError } from '#/lib/api'
import { useAuth } from '#/lib/auth'
import type { LoginCodeSent } from '#/lib/types'
import { Button, Input, Notice } from '#/components/ui'

export const Route = createFileRoute('/login')({ component: LoginPage })

/** Staff sign-in for UKOshop, Eden and UKOapp. No registration — accounts live in admin.staff. */
function LoginPage() {
  const navigate = useNavigate()
  const { staff, ready, sendCode, login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [show, setShow] = useState(false)
  const [sent, setSent] = useState<LoginCodeSent | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (ready && staff) navigate({ to: '/' })
  }, [ready, staff, navigate])

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const fail = (err: unknown) => setError(err instanceof ApiError ? err.message : 'Could not sign in. Check your connection and try again.')

  // step 1: staff ID/email + password → 2FA code e-mailed to the staff email
  const requestCode = async () => {
    setError('')
    setBusy(true)
    try {
      const r = await sendCode(email.trim(), password)
      setSent(r)
      setCode('')
      setCooldown(r.resend_in)
    } catch (err) {
      fail(err)
    } finally {
      setBusy(false)
    }
  }

  // step 2: same credentials + the e-mailed code → 2-hour staff session
  const signIn = async () => {
    setError('')
    setBusy(true)
    try {
      await login(email.trim(), password, code.trim())
      navigate({ to: '/' })
    } catch (err) {
      fail(err)
    } finally {
      setBusy(false)
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (sent) signIn()
    else requestCode()
  }

  const startOver = () => {
    setSent(null)
    setCode('')
    setError('')
  }

  return (
    <div className="grad-hero flex min-h-screen items-center justify-center px-4 py-10">
      <form onSubmit={submit} className="fade-up flex w-full max-w-[420px] flex-col gap-4 rounded-[20px] bg-bg p-6 shadow-card md:p-[30px]">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-[30px] w-[30px] items-center justify-center rounded-md bg-primary font-head text-sm font-extrabold text-white">U</span>
            <span className="font-head text-[17px] font-extrabold text-ink">UKO admin</span>
          </div>
          <h1 className="text-[22px] leading-tight">Staff console</h1>
          <p className="m-0 text-xs leading-relaxed text-ink-2">UKOshop · Eden · UKOapp. Restricted to UKO staff — every action is logged against your account.</p>
        </div>

        <Input label="Staff ID or email" type="text" required autoComplete="username" placeholder="UKO-001 or you@uko.co.ke" value={email} disabled={!!sent} onChange={(e) => setEmail(e.target.value)} />
        <Input
          label="Password"
          required
          type={show ? 'text' : 'password'}
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          disabled={!!sent}
          onChange={(e) => setPassword(e.target.value)}
          trailing={<button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'} className="flex text-muted hover:text-ink">{show ? <EyeOff size={15} /> : <Eye size={15} />}</button>}
        />

        {sent && (
          <>
            <Notice tone="info" icon={<MailCheck size={14} />}>
              We e-mailed a 6-digit code to <b>{sent.to}</b>. It expires in {Math.round(sent.expires_in / 60)} minutes.
            </Notice>
            <Input label="2FA code from your e-mail" required autoFocus inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          </>
        )}

        {error && <Notice tone="danger" icon={<CircleAlert size={14} />}><span className="text-danger">{error}</span></Notice>}

        {sent ? (
          <>
            <Button type="submit" size="lg" full loading={busy} disabled={code.length !== 6}>Sign in</Button>
            <div className="flex items-center justify-between text-xs">
              <button type="button" onClick={startOver} className="text-ink-2 hover:text-ink">Use a different account</button>
              <button type="button" onClick={requestCode} disabled={busy || cooldown > 0} className="font-semibold text-primary disabled:text-muted">
                {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
              </button>
            </div>
          </>
        ) : (
          <Button type="submit" size="lg" full loading={busy}>Send sign-in code</Button>
        )}

        <div className="flex items-start gap-2.5 rounded-sm bg-surface p-3">
          <ShieldCheck size={14} className="mt-0.5 shrink-0 text-primary" />
          <p className="m-0 text-[11px] leading-relaxed text-ink-2">No self sign-up: ask an existing staff member to add your account. Sessions expire 2 hours after sign-in.</p>
        </div>
      </form>
    </div>
  )
}
