/** Signed in — how many accounts are logged in to each UKO app right now, and the device / IP / browser of each one's
 * latest active session. Refreshed every 60 s (GET /api/signed-in/summary, /api/signed-in/{key}). */
import { useCallback, useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { RefreshCw, UserCheck } from 'lucide-react'
import { api } from '#/lib/api'
import type { Paged, SignedInAccount, SignedInSummary } from '#/lib/types'
import { fmtDate, num, timeAgo } from '#/lib/format'
import { Button, Chip, EmptyState, Notice, PageLoading, cx } from '#/components/ui'
import { DashHeader, Panel, Table, Td } from '#/components/dashboard'
import { Pager } from '#/components/console'

export const Route = createFileRoute('/_console/signed-in')({ component: SignedInConsole })

const REFRESH_MS = 60_000
/** users.verification.apps platforms (movies user service) */
const APP_LABELS: Record<string, string> = { web: 'Web', tv: 'TV', android: 'Android', ios: 'iOS' }
type AccountsPage = Paged<'accounts', SignedInAccount> & { key: string; app: string }

function SignedInConsole() {
  const [summary, setSummary] = useState<SignedInSummary[] | null>(null)
  const [err, setErr] = useState('')
  const [selected, setSelected] = useState('staff')
  const [tick, setTick] = useState(0)   // bumped by Refresh and the 60 s timer; the accounts table reloads on it too
  const [loading, setLoading] = useState(false)
  const [updated, setUpdated] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setSummary(await api.get<SignedInSummary[]>('/signed-in/summary'))
      setErr('')
      setUpdated(new Date().toISOString())
    } catch (e: any) {
      setErr(e.message || 'Could not load who is signed in')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load, tick])
  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), REFRESH_MS)
    return () => window.clearInterval(t)
  }, [])

  const current = summary?.find((s) => s.key === selected)

  return (
    <>
      <DashHeader
        title="Signed in"
        sub={`Accounts logged in to each UKO app right now · refreshes every minute${updated ? ` · updated ${fmtDate(updated)}` : ''}`}
        actions={<Button size="sm" variant="outline" icon={<RefreshCw size={13} />} loading={loading} onClick={() => setTick((n) => n + 1)}>Refresh</Button>}
      />
      {err && <Notice tone="danger" title="Sign-in data unavailable">{err}</Notice>}
      {!summary && !err ? (
        <PageLoading />
      ) : summary ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {summary.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setSelected(s.key)}
                title={s.error || undefined}
                className={cx('flex flex-col gap-1.5 rounded-md border bg-bg p-4 text-left transition-colors hover:border-primary',
                  s.key === selected ? 'border-primary ring-1 ring-primary' : 'border-border')}
              >
                <span className="text-xs text-ink-2">{s.app}</span>
                {s.signed_in === null ? (
                  <span className="font-head text-[15px] font-bold leading-tight text-muted">Not migrated</span>
                ) : (
                  <span className="font-head text-[26px] font-extrabold leading-tight text-ink">
                    {num(s.signed_in)}<span className="text-sm font-semibold text-muted"> / {num(s.total)}</span>
                  </span>
                )}
              </button>
            ))}
          </div>
          {current && <AccountsPanel key={current.key} group={current} tick={tick} />}
        </>
      ) : null}
    </>
  )
}

function AccountsPanel({ group, tick }: { group: SignedInSummary; tick: number }) {
  const [page, setPage] = useState(1)
  const [data, setData] = useState<AccountsPage | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    api.get<AccountsPage>(`/signed-in/${group.key}`, { page }).then((d) => { setData(d); setErr('') }).catch((e) => setErr(e.message))
  }, [group.key, page, tick])

  const hasSessions = data?.accounts.some((a) => a.sessions_count !== null)
  const hasApps = data?.accounts.some((a) => a.apps !== null)
  return (
    <Panel title={group.app} sub="Most recent active session per account, newest activity first" action={<Chip size="sm">{num(data?.total ?? group.signed_in ?? 0)}</Chip>} padded={false}>
      {group.error ? (
        <div className="p-5"><Notice tone="warning" title="Not migrated">{group.error}</Notice></div>
      ) : err ? (
        <div className="p-5"><Notice tone="danger">{err}</Notice></div>
      ) : !data ? <PageLoading /> : data.accounts.length === 0 ? (
        <div className="p-5"><EmptyState icon={<UserCheck size={24} />} title="Nobody is signed in" /></div>
      ) : (
        <>
          <Table head={['Account', ...(hasApps ? ['Apps'] : []), 'Device', 'IP', 'Browser', 'Last seen', 'Signed in', 'Expires', ...(hasSessions ? ['Sessions'] : [])]}>
            {data.accounts.map((a) => (
              <tr key={a.id}>
                <Td>
                  <div className="font-semibold text-ink">{a.name || `#${a.id}`}</div>
                  {a.contact && <div className="text-xs text-muted">{a.contact}</div>}
                </Td>
                {hasApps && (
                  <Td>
                    {a.apps?.length ? (
                      <div className="flex flex-wrap gap-1">
                        {a.apps.map((app) => (
                          <span key={app.platform} title={app.is_logged_in ? 'Signed in' : 'Signed out'}>
                            <Chip size="sm" tone={app.is_logged_in ? 'success' : 'neutral'}>{APP_LABELS[app.platform] ?? app.platform}</Chip>
                          </span>
                        ))}
                      </div>
                    ) : <span className="text-ink-2">—</span>}
                  </Td>
                )}
                <Td className="whitespace-nowrap text-ink-2">{a.device || '—'}</Td>
                <Td className="whitespace-nowrap text-ink-2">{a.ip || '—'}</Td>
                <Td className="max-w-[220px] text-ink-2"><span className="block truncate" title={a.user_agent || undefined}>{a.user_agent || '—'}</span></Td>
                <Td className="whitespace-nowrap text-ink-2"><span title={a.last_seen_at ? fmtDate(a.last_seen_at) : undefined}>{a.last_seen_at ? timeAgo(a.last_seen_at) : '—'}</span></Td>
                <Td className="whitespace-nowrap text-ink-2">{a.last_login_at ? fmtDate(a.last_login_at) : '—'}</Td>
                <Td className="whitespace-nowrap text-ink-2">{a.expires_at ? fmtDate(a.expires_at) : '—'}</Td>
                {hasSessions && <Td><Chip size="sm" tone={a.sessions_count ? 'success' : 'neutral'}>{a.sessions_count ?? 0}</Chip></Td>}
              </tr>
            ))}
          </Table>
          <Pager page={data.page} perPage={data.per_page} total={data.total} onPage={setPage} />
        </>
      )}
    </Panel>
  )
}
