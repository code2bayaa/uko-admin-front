/** Eden console — studios (creators), their content and payouts. Read-only over the shared `uko` database. */
import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Clapperboard, Film, Search, Wallet } from 'lucide-react'
import { api } from '#/lib/api'
import type { EdenContent, EdenOverview, EdenStudio, Paged } from '#/lib/types'
import { fmtDate, ksh, num } from '#/lib/format'
import { Chip, EmptyState, Input, Notice, PageLoading, Select, StatCard } from '#/components/ui'
import { DashHeader, Panel, Table, Td } from '#/components/dashboard'
import { Pager, Thumb, useDebounced } from '#/components/console'

export const Route = createFileRoute('/_console/eden')({ component: EdenConsole })

const TMDB_IMG = 'https://image.tmdb.org/t/p/w92'
const TYPE_LABEL: Record<string, string> = { movie: 'Movie', tv: 'TV show', season: 'Season', episode: 'Episode' }

function EdenConsole() {
  const [overview, setOverview] = useState<EdenOverview | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    api.get<EdenOverview>('/eden/overview').then(setOverview).catch((e) => setErr(e.message))
  }, [])

  return (
    <>
      <DashHeader title="Eden" sub="Studios publishing movies and TV to UKOapp · shared uko database (read-only)" />
      {err && <Notice tone="danger" title="Eden data unavailable">{err}</Notice>}
      {!overview && !err ? (
        <PageLoading />
      ) : overview ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <StatCard label="Studios" value={num(overview.studios)} />
            <StatCard label="Movies" value={num(overview.content.movie)} />
            <StatCard label="TV shows" value={num(overview.content.tv)} />
            <StatCard label="Episodes" value={num(overview.content.episode)} />
            <StatCard label="People (cast & crew)" value={num(overview.people)} />
            <StatCard label="Studio followers" value={num(overview.followers)} />
          </div>
          <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
            <StudiosPanel />
            <Panel title="Payouts" sub={`Wallet ${ksh(overview.wallet_total)} · withdrawn ${ksh(overview.withdrawn_total)}`} padded={false}>
              {overview.recent_withdrawals.length === 0 ? (
                <div className="p-5"><EmptyState icon={<Wallet size={24} />} title="No withdrawals yet" sub="Studio withdrawals will be listed here." /></div>
              ) : (
                <Table head={['Studio', 'Amount', 'When']}>
                  {overview.recent_withdrawals.map((w) => (
                    <tr key={w.id}>
                      <Td className="text-ink">{w.studio}</Td>
                      <Td className="whitespace-nowrap font-semibold text-ink">{ksh(w.amount)}</Td>
                      <Td className="whitespace-nowrap text-ink-2">{fmtDate(w.time)}</Td>
                    </tr>
                  ))}
                </Table>
              )}
            </Panel>
          </div>
          <ContentPanel />
        </>
      ) : null}
    </>
  )
}

function StudiosPanel() {
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<Paged<'studios', EdenStudio> | null>(null)
  const [err, setErr] = useState('')
  const dq = useDebounced(q)

  useEffect(() => setPage(1), [dq])
  useEffect(() => {
    api.get<Paged<'studios', EdenStudio>>('/eden/studios', { q: dq, page }).then((d) => { setData(d); setErr('') }).catch((e) => setErr(e.message))
  }, [dq, page])

  return (
    <Panel title="Studios" action={<Chip size="sm">{data?.total ?? 0}</Chip>} padded={false}>
      <div className="border-b border-border p-3">
        <Input placeholder="Search studio name or phone" value={q} onChange={(e) => setQ(e.target.value)} leading={<Search size={14} />} />
      </div>
      {err ? (
        <div className="p-5"><Notice tone="danger">{err}</Notice></div>
      ) : !data ? (
        <PageLoading />
      ) : data.studios.length === 0 ? (
        <div className="p-5"><EmptyState icon={<Clapperboard size={24} />} title="No studios found" /></div>
      ) : (
        <>
          <Table head={['Studio', 'Phone', 'Followers', 'Earned', 'Withdrawn', 'Balance', 'Joined']}>
            {data.studios.map((s) => (
              <tr key={s.id}>
                <Td className="font-semibold text-ink">{s.name || `Studio #${s.id}`}</Td>
                <Td className="whitespace-nowrap text-ink-2">{s.phone || '—'}</Td>
                <Td className="text-ink-2">{num(s.followers)}</Td>
                <Td className="whitespace-nowrap text-ink-2">{ksh(s.earned)}</Td>
                <Td className="whitespace-nowrap text-ink-2">{ksh(s.withdrawn)}</Td>
                <Td className="whitespace-nowrap font-semibold text-ink">{ksh(s.balance)}</Td>
                <Td className="whitespace-nowrap text-ink-2">{s.joined ? fmtDate(s.joined, false) : '—'}</Td>
              </tr>
            ))}
          </Table>
          <Pager page={data.page} perPage={data.per_page} total={data.total} onPage={setPage} />
        </>
      )}
    </Panel>
  )
}

function ContentPanel() {
  const [type, setType] = useState('all')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<Paged<'items', EdenContent> | null>(null)
  const [err, setErr] = useState('')
  const dq = useDebounced(q)

  useEffect(() => setPage(1), [dq, type])
  useEffect(() => {
    api.get<Paged<'items', EdenContent>>('/eden/content', { type, q: dq, page }).then((d) => { setData(d); setErr('') }).catch((e) => setErr(e.message))
  }, [type, dq, page])

  return (
    <Panel title="Content library" sub="Movies, TV shows, seasons and episodes published through Eden" action={<Chip size="sm">{num(data?.total ?? 0)}</Chip>} padded={false}>
      <div className="grid gap-3 border-b border-border p-3 sm:grid-cols-[1fr_200px]">
        <Input placeholder="Search titles" value={q} onChange={(e) => setQ(e.target.value)} leading={<Search size={14} />} />
        <Select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="all">All types</option>
          {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </div>
      {err ? (
        <div className="p-5"><Notice tone="danger">{err}</Notice></div>
      ) : !data ? (
        <PageLoading />
      ) : data.items.length === 0 ? (
        <div className="p-5"><EmptyState icon={<Film size={24} />} title="No titles match" /></div>
      ) : (
        <>
          <Table head={['Title', 'Type', 'Released', 'Rating', 'Added']}>
            {data.items.map((c) => (
              <tr key={c.id}>
                <Td>
                  <div className="flex items-center gap-3">
                    <Thumb src={c.poster_path ? (c.poster_path.startsWith('http') ? c.poster_path : `${TMDB_IMG}${c.poster_path}`) : ''} size={40} />
                    <span className="font-semibold text-ink">{c.title}</span>
                  </div>
                </Td>
                <Td><Chip size="sm" tone={c.type === 'movie' ? 'primary' : 'neutral'}>{TYPE_LABEL[c.type] ?? (c.type || '—')}</Chip></Td>
                <Td className="whitespace-nowrap text-ink-2">{c.release_date || '—'}</Td>
                <Td className="text-ink-2">{c.vote_average != null ? Number(c.vote_average).toFixed(1) : '—'}</Td>
                <Td className="whitespace-nowrap text-ink-2">{c.added ? fmtDate(c.added, false) : '—'}</Td>
              </tr>
            ))}
          </Table>
          <Pager page={data.page} perPage={data.per_page} total={data.total} onPage={setPage} />
        </>
      )}
    </Panel>
  )
}
