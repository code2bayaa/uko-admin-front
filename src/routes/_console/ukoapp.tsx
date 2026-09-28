/** UKOapp console — viewers, payments and feedback from the movies app (read-only over the shared `uko` database), and
 * blockbuster rights holders: titles past the view threshold, outreach, producer accounts and their payouts. */
import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { CreditCard, MessageSquare, Search, Users } from 'lucide-react'
import { api } from '#/lib/api'
import type { Paged, ProducerQueue, UkoappFeedback, UkoappOverview, UkoappPayment, UkoappUser } from '#/lib/types'
import { fmtDate, num } from '#/lib/format'
import { Chip, EmptyState, Input, Notice, PageLoading, StatCard, Tabs } from '#/components/ui'
import { DashHeader, Panel, Table, Td } from '#/components/dashboard'
import { Pager, useDebounced } from '#/components/console'
import { BlockbustersPanel } from '#/components/blockbusters'
import { ProducerPayoutsPanel, ProducersPanel } from '#/components/producers'

export const Route = createFileRoute('/_console/ukoapp')({ component: UkoappConsole })

type Tab = 'users' | 'payments' | 'feedback' | 'blockbusters' | 'producers' | 'payouts'

function UkoappConsole() {
  const [overview, setOverview] = useState<UkoappOverview | null>(null)
  const [err, setErr] = useState('')
  const [tab, setTab] = useState<Tab>('users')
  const [queue, setQueue] = useState<ProducerQueue | null>(null)

  useEffect(() => {
    api.get<UkoappOverview>('/ukoapp/overview').then(setOverview).catch((e) => setErr(e.message))
  }, [])
  useEffect(() => {   // what is waiting on staff in the producers' tabs; refreshed whenever the tab changes
    api.get<ProducerQueue>('/ukoapp/producers/queue').then(setQueue).catch(() => setQueue(null))
  }, [tab])

  const paymentsTotal = overview ? Object.values(overview.payments).reduce((a, b) => a + b, 0) : 0

  return (
    <>
      <DashHeader title="UKOapp" sub="Viewers of the UKOapp movies site and apps, and the rights holders of the blockbusters they watch" />
      {err && <Notice tone="danger" title="UKOapp data unavailable">{err}</Notice>}
      {!overview && !err ? (
        <PageLoading />
      ) : overview ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <StatCard label="Viewers" value={num(overview.users)} />
            <StatCard label="Views" value={num(overview.views)} />
            <StatCard label="Likes" value={num(overview.likes)} />
            <StatCard label="Playlists" value={num(overview.playlists)} />
            <StatCard label="Credits in / out" value={`${num(overview.credits_in)} / ${num(overview.credits_out)}`} />
            <StatCard label="Newsletter" value={num(overview.newsletter)} />
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-ink-2">
            {Object.entries(overview.views_by_platform).map(([p, n]) => <Chip key={p} size="sm">{p}: {num(n)} views</Chip>)}
            {Object.entries(overview.payments).map(([p, n]) => <Chip key={p} size="sm" tone="primary">{p}: {num(n)} payments</Chip>)}
          </div>
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { key: 'users', label: 'Viewers', count: overview.users },
              { key: 'payments', label: 'Payments', count: paymentsTotal },
              { key: 'feedback', label: 'Feedback', count: overview.feedback },
              { key: 'blockbusters', label: 'Blockbusters 5k+' },
              { key: 'producers', label: 'Producers', count: queue ? queue.claims + queue.documents || undefined : undefined },
              { key: 'payouts', label: 'Producer payment requests', count: queue?.payouts || undefined },
            ]}
          />
          {tab === 'users' && <UsersPanel />}
          {tab === 'payments' && <PaymentsPanel />}
          {tab === 'feedback' && <FeedbackPanel />}
          {tab === 'blockbusters' && <BlockbustersPanel />}
          {tab === 'producers' && <ProducersPanel />}
          {tab === 'payouts' && <ProducerPayoutsPanel />}
        </>
      ) : null}
    </>
  )
}

function usePaged<K extends string, T>(path: string, params: Record<string, string>) {
  const [page, setPage] = useState(1)
  const [data, setData] = useState<Paged<K, T> | null>(null)
  const [err, setErr] = useState('')
  const key = JSON.stringify(params)
  useEffect(() => setPage(1), [key])
  useEffect(() => {
    api.get<Paged<K, T>>(path, { ...params, page }).then((d) => { setData(d); setErr('') }).catch((e) => setErr(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, key, page])
  return { data, err, setPage }
}

function UsersPanel() {
  const [q, setQ] = useState('')
  const dq = useDebounced(q)
  const { data, err, setPage } = usePaged<'users', UkoappUser>('/ukoapp/users', { q: dq })
  return (
    <Panel title="Viewers" padded={false}>
      <div className="border-b border-border p-3">
        <Input placeholder="Search name, email or phone" value={q} onChange={(e) => setQ(e.target.value)} leading={<Search size={14} />} />
      </div>
      {err ? <div className="p-5"><Notice tone="danger">{err}</Notice></div> : !data ? <PageLoading /> : data.users.length === 0 ? (
        <div className="p-5"><EmptyState icon={<Users size={24} />} title="No viewers found" /></div>
      ) : (
        <>
          <Table head={['Name', 'Email', 'Telephone', 'Views', 'Credits', 'Status', 'Joined']}>
            {data.users.map((u) => (
              <tr key={u.id}>
                <Td className="font-semibold text-ink">{u.name || `User #${u.id}`}</Td>
                <Td className="text-ink-2">{u.email || '—'}</Td>
                <Td className="whitespace-nowrap text-ink-2">{u.telephone || '—'}</Td>
                <Td className="text-ink-2">{num(u.views)}</Td>
                <Td className="text-ink-2">{num(u.credits)}</Td>
                <Td><Chip size="sm" tone={u.signed_in ? 'success' : 'neutral'}>{u.signed_in ? 'Signed in' : 'Signed out'}</Chip></Td>
                <Td className="whitespace-nowrap text-ink-2">{u.joined ? fmtDate(u.joined, false) : '—'}</Td>
              </tr>
            ))}
          </Table>
          <Pager page={data.page} perPage={data.per_page} total={data.total} onPage={setPage} />
        </>
      )}
    </Panel>
  )
}

function PaymentsPanel() {
  const { data, err, setPage } = usePaged<'payments', UkoappPayment>('/ukoapp/payments', {})
  return (
    <Panel title="Payments" sub="M-PESA subscription payments" padded={false}>
      {err ? <div className="p-5"><Notice tone="danger">{err}</Notice></div> : !data ? <PageLoading /> : data.payments.length === 0 ? (
        <div className="p-5"><EmptyState icon={<CreditCard size={24} />} title="No payments yet" /></div>
      ) : (
        <>
          <Table head={['#', 'Method', 'Email', 'Status', 'App', 'When']}>
            {data.payments.map((p) => (
              <tr key={p.id}>
                <Td className="text-ink-2">{p.id}</Td>
                <Td><Chip size="sm" tone="primary">{p.method || '—'}</Chip></Td>
                <Td className="text-ink-2">{p.email || '—'}</Td>
                <Td className="text-ink">{p.status || '—'}</Td>
                <Td className="text-ink-2">{p.app || '—'}</Td>
                <Td className="whitespace-nowrap text-ink-2">{fmtDate(p.time)}</Td>
              </tr>
            ))}
          </Table>
          <Pager page={data.page} perPage={data.per_page} total={data.total} onPage={setPage} />
        </>
      )}
    </Panel>
  )
}

function FeedbackPanel() {
  const { data, err, setPage } = usePaged<'feedback', UkoappFeedback>('/ukoapp/feedback', {})
  return (
    <Panel title="Feedback" sub="Messages sent from the UKOapp contact form" padded={false}>
      {err ? <div className="p-5"><Notice tone="danger">{err}</Notice></div> : !data ? <PageLoading /> : data.feedback.length === 0 ? (
        <div className="p-5"><EmptyState icon={<MessageSquare size={24} />} title="No feedback yet" /></div>
      ) : (
        <>
          <div className="flex flex-col divide-y divide-border">
            {data.feedback.map((f) => (
              <div key={f.id} className="flex flex-col gap-1 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-ink">{f.subject || 'No subject'}</span>
                  <span className="text-xs text-muted">{fmtDate(f.time)}</span>
                </div>
                <p className="m-0 text-[13px] text-ink-2">{f.message}</p>
                <span className="text-xs text-muted">{f.name || 'Anonymous'}{f.email ? ` · ${f.email}` : ''}</span>
              </div>
            ))}
          </div>
          <Pager page={data.page} perPage={data.per_page} total={data.total} onPage={setPage} />
        </>
      )}
    </Panel>
  )
}
