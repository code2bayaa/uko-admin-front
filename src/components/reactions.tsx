/**
 * UKOapp → Reactions: watch parties and the party fees guests paid (movies PRD #28, #29). Each fee is split by the
 * credits that paid it — subscribed (bought), ad-earned, free — then 60% to the host and 40% to UKO. The host's part of
 * bought / ad-paid fees is money in their profile wallet (host_earnings, PRD #30); of free-paid fees, credits.
 * UKO's money is its share applied to what those credits were worth; free credits are worth nothing.
 * admin/back-end GET /ukoapp/reactions. Members' ordinary play charges are views, not counted here.
 */
import { Smartphone, Users } from 'lucide-react'
import { fmtDate, num } from '#/lib/format'
import type { OfflineSaleRow, OfflineSalesSummary, ReactionFees, ReactionRow, ReactionsSummary } from '#/lib/types'
import { Chip, EmptyState, Notice, PageLoading, StatCard, StatusPill } from './ui'
import { Panel, Table, Td } from './dashboard'
import { usePaged } from './console'

const money = (n: number) => `KSh ${n.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function Sources({ f }: { f: ReactionFees }) {
  if (!f.fees) return <span className="text-muted">—</span>
  return (
    <div className="flex flex-wrap gap-1">
      <Chip size="sm" tone="success">{num(f.by_source.subscribed)} subscribed</Chip>
      <Chip size="sm" tone="primary">{num(f.by_source.ad)} ad</Chip>
      <Chip size="sm">{num(f.by_source.free)} free</Chip>
    </div>
  )
}

export function ReactionsPanel() {
  const { rows, data, err, pager } = usePaged<ReactionRow, { summary: ReactionsSummary; rates: Record<string, number> }>(
    '/ukoapp/reactions', 'reactions', {})
  const s = data?.summary
  return (
    <>
      {s && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Reactions" value={`${num(s.parties)} (${num(s.open)} live)`} />
          <StatCard label="With a fee" value={num(s.paid_parties)} />
          <StatCard label="Seats taken" value={num(s.members)} />
          <StatCard label="Fee credits paid" value={num(s.credits)} />
          <StatCard label="Hosts earned (money)" value={money(s.host_ksh)} />
          <StatCard label="UKO earned" value={money(s.uko_ksh)} />
        </div>
      )}
      {s && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-2">
          <span>Fee credits by source:</span>
          <Sources f={s} />
          {data?.rates && (
            <span className="text-muted">· 1 subscribed credit = KSh {data.rates.ksh_per_subscribed_credit}, 1 ad credit = KSh {data.rates.ksh_per_ad_credit}, free = KSh 0</span>
          )}
        </div>
      )}
      <Panel title="Reactions" sub="Watch parties, newest first — fees paid to join, by the credits that paid them" padded={false}>
        {err ? <div className="p-5"><Notice tone="danger">{err}</Notice></div> : !rows ? <PageLoading /> : rows.length === 0 ? (
          <div className="p-5"><EmptyState icon={<Users size={24} />} title="No reactions yet" /></div>
        ) : (
          <>
            <Table head={['Code', 'Title', 'Host', 'Seats', 'Fee', 'Fees paid by', 'Host / UKO credits', 'Host money', 'UKO earned', 'Status', 'Started']}>
              {rows.map((r) => (
                <tr key={r.id}>
                  <Td className="font-mono text-ink-2">{r.code}</Td>
                  <Td className="text-ink">{r.title || '—'}{r.eden ? <Chip size="sm" className="ml-1">Eden</Chip> : null}</Td>
                  <Td className="text-ink-2">{r.host || '—'}</Td>
                  <Td className="text-ink-2">{num(r.members)}</Td>
                  <Td className="text-ink-2">{r.fee ? `${num(r.fee)} cr` : 'free'}</Td>
                  <Td><Sources f={r} /></Td>
                  <Td className="text-ink-2">{r.fees ? `${num(r.host_credits)} / ${num(r.uko_credits)}` : '—'}</Td>
                  <Td className="text-ink-2">{r.host_ksh ? money(r.host_ksh) : '—'}</Td>
                  <Td className="text-ink">{r.fees ? money(r.uko_ksh) : '—'}</Td>
                  <Td><StatusPill status={r.status === 'open' ? 'live' : 'completed'} label={r.status === 'open' ? 'live' : 'ended'} /></Td>
                  <Td className="whitespace-nowrap text-ink-2">{fmtDate(r.started)}</Td>
                </tr>
              ))}
            </Table>
            {pager}
          </>
        )}
      </Panel>
    </>
  )
}

/**
 * UKOapp → Offline sales: downloaded videos sold phone to phone (movies PRD #10, #29). Each paid sale: 70% to the
 * seller's profile wallet, 30% to UKO. "Owed" is what sellers and reaction hosts have earned and not yet withdrawn
 * or got pending — the same wallet pays both. admin/back-end GET /ukoapp/offline-sales.
 */
export function OfflineSalesPanel() {
  const { rows, data, err, pager } = usePaged<OfflineSaleRow, { summary: OfflineSalesSummary }>('/ukoapp/offline-sales', 'sales', {})
  const s = data?.summary
  return (
    <>
      {s && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Sales" value={`${num(s.sales)} by ${num(s.sellers)} sellers`} />
          <StatCard label="Buyers paid" value={money(s.gross_ksh)} />
          <StatCard label="Sellers earned (70%)" value={money(s.seller_ksh)} />
          <StatCard label="UKO earned (30%)" value={money(s.uko_ksh)} />
          <StatCard label="Withdrawn / pending" value={`${money(s.paid_out_ksh)} / ${money(s.pending_ksh)}`} />
          <StatCard label="Owed to wallets" value={money(s.owed_ksh)} />
        </div>
      )}
      {s && (
        <div className="flex flex-wrap gap-2 text-xs text-ink-2">
          <Chip size="sm">Reaction host money in the same wallets: {money(s.host_ksh)}</Chip>
          {s.failed_withdrawals > 0 && <Chip size="sm" tone="warning">{num(s.failed_withdrawals)} failed withdrawals (returned to balances)</Chip>}
          {Math.abs(s.uko_booked_ksh - s.uko_ksh) > 0.01 && <Chip size="sm" tone="danger">UKO share booked {money(s.uko_booked_ksh)} does not match sales {money(s.uko_ksh)}</Chip>}
        </div>
      )}
      <Panel title="Offline sales" sub="Videos sold phone to phone over Wi-Fi / hotspot, paid by M-PESA — newest first" padded={false}>
        {err ? <div className="p-5"><Notice tone="danger">{err}</Notice></div> : !rows ? <PageLoading /> : rows.length === 0 ? (
          <div className="p-5"><EmptyState icon={<Smartphone size={24} />} title="No offline sales yet" /></div>
        ) : (
          <>
            <Table head={['#', 'Title', 'Seller', 'Buyer', 'Price', 'Seller 70%', 'UKO 30%', 'Status', 'Paid']}>
              {rows.map((r) => (
                <tr key={r.id}>
                  <Td className="text-ink-2">{r.id}</Td>
                  <Td className="text-ink">{r.title || '—'}{r.eden ? <Chip size="sm" className="ml-1">Eden</Chip> : null}</Td>
                  <Td className="text-ink-2">{r.seller || '—'}</Td>
                  <Td className="text-ink-2">{r.buyer || '—'}</Td>
                  <Td className="text-ink">{money(r.price)}</Td>
                  <Td className="text-ink-2">{money(r.seller_ksh)}</Td>
                  <Td className="text-ink-2">{money(r.uko_ksh)}</Td>
                  <Td><StatusPill status={['paid', 'delivered', 'failed'].includes(r.status) ? r.status : 'pending'} label={r.status} /></Td>
                  <Td className="whitespace-nowrap text-ink-2">{r.paid ? fmtDate(r.paid) : '—'}</Td>
                </tr>
              ))}
            </Table>
            {pager}
          </>
        )}
      </Panel>
    </>
  )
}
