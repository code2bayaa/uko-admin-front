/**
 * Live board for the Delivery partners (riders: deliveries and item pick-ups) and Courier (vans) tabs: every job in progress, where it is on the map,
 * and whether it looks SAFE or IRREGULAR — with the reasons (no GPS, not moving, off the route, overdue, low battery, an
 * open safety incident). GET /api/shop/live/deliveries · /couriers, refreshed every 15 s. Irregular jobs come first.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { BatteryLow, CircleCheck, ExternalLink, MapPin, Phone, Radio, ShieldAlert, TriangleAlert } from 'lucide-react'
import { api } from '#/lib/api'
import { Chip, EmptyState, StatCard, Tabs, cx } from './ui'
import { Panel } from './dashboard'
import { MapView, type MapPoint } from './map'

type Place = { name: string; lat: number | null; lng: number | null; phone: string }
export type LiveRow = {
  kind: 'rider' | 'pickup' | 'courier'; id: number; ref: string; item?: string; status: string; in_hand: boolean; order_no: string; fee: number
  window?: string; eta?: string; route?: string; distance_km?: number; parcel_class?: string; started_at: string | null
  person: { id: number; name: string; phone: string; plate: string; vehicle: string } | null
  from: Place; to: Place; parcel: { items: { title: string; qty: number; value: number }[]; total_value: number }
  tracking_url: string; incident: { id: number; level: string; status: string } | null
  verdict: 'safe' | 'irregular'; reasons: string[]; last_seen_at: string | null; minutes_since_seen: number | null
  position: { lat: number; lng: number; accuracy: number | null; battery: number | null; maps_url: string } | null
  trail: [number, number][]
}
type Board = { summary: { live: number; safe: number; irregular: number; in_hand: number; no_gps: number }; rows: LiveRow[]; generated_at: string }
type Filter = 'all' | 'irregular' | 'safe'

const POLL_MS = 15_000
const STAGE: Record<string, string> = {
  accepted: 'Going to collect', picked_up: 'Parcel on board', on_the_way: 'On the way to the drop',
  collected: 'Loaded, not left yet', in_transit: 'On the road',
}

const PICKUP_STAGE: Record<string, string> = { accepted: 'Going to the seller', collected: 'Item on board, to the shelf' }

function seen(m: number | null): string {
  if (m == null) return 'no GPS yet'
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.floor(m / 60)} h ${m % 60} min ago`
}
const ksh = (n: number) => `KSh ${Math.round(n || 0).toLocaleString('en-KE')}`

export function useLiveCount(kind: 'rider' | 'courier'): number | undefined {
  const [n, setN] = useState<number | undefined>(undefined)
  useEffect(() => {
    let alive = true
    const get = () => api.get<Board>(kind === 'rider' ? '/shop/live/deliveries' : '/shop/live/couriers')
      .then((b) => { if (alive) setN(b.summary.irregular || b.summary.live) }).catch(() => {})
    get()
    const t = window.setInterval(get, POLL_MS)
    return () => { alive = false; window.clearInterval(t) }
  }, [kind])
  return n
}

export function LiveBoard({ kind }: { kind: 'rider' | 'courier' }) {
  const [board, setBoard] = useState<Board | null>(null)
  const [err, setErr] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [picked, setPicked] = useState<string | null>(null)   // `${kind}-${id}`: a delivery and a pick-up can share an id
  const who = kind === 'rider' ? 'rider' : 'driver'

  useEffect(() => {
    let alive = true
    const get = () => api.get<Board>(kind === 'rider' ? '/shop/live/deliveries' : '/shop/live/couriers')
      .then((b) => { if (alive) { setBoard(b); setErr('') } })
      .catch((e) => { if (alive) setErr(e.message || 'Could not load the live board') })
    get()
    const t = window.setInterval(get, POLL_MS)
    return () => { alive = false; window.clearInterval(t) }
  }, [kind])

  const rows = useMemo(() => (board?.rows ?? []).filter((r) => filter === 'all' || r.verdict === filter), [board, filter])
  const points: MapPoint[] = useMemo(() => {
    const focus = rows.find((r) => `${r.kind}-${r.id}` === picked)
    const list = focus ? [focus] : rows
    const pts: MapPoint[] = []
    for (const r of list) {
      if (r.position) pts.push({ id: `${r.kind}-${r.id}`, lat: r.position.lat, lng: r.position.lng, tone: r.verdict === 'safe' ? 'success' : 'secondary',
                                 label: `${r.verdict === 'safe' ? '✓' : '⚠'} ${r.ref} · ${r.person?.name.split(' ')[0] ?? ''}` })
      if (focus) {
        if (r.from.lat != null) pts.unshift({ id: 'from', lat: r.from.lat, lng: r.from.lng, label: r.from.name, tone: 'primary' })
        if (r.to.lat != null) pts.push({ id: 'to', lat: r.to.lat, lng: r.to.lng, label: r.to.name, tone: 'primary' })
      }
    }
    return pts
  }, [rows, picked])

  const s = board?.summary
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5 md:gap-4">
        <StatCard label={kind === 'rider' ? 'Deliveries live' : 'Legs live'} value={s?.live ?? '—'} />
        <StatCard label="Safe" value={s?.safe ?? '—'} />
        <StatCard label="Irregular" value={s?.irregular ?? '—'} />
        <StatCard label={kind === 'rider' ? 'Parcels in hand' : 'Loads on vans'} value={s?.in_hand ?? '—'} />
        <StatCard label="No GPS yet" value={s?.no_gps ?? '—'} />
      </div>

      <Panel
        title={kind === 'rider' ? 'Live deliveries' : 'Live courier legs'}
        sub={`Every job in progress · refreshes every 15 s${board ? ` · updated ${new Date(board.generated_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : ''}${picked ? ' · showing one job — click it again to see all' : ''}`}
        action={<Tabs<Filter> tabs={[{ key: 'all', label: 'All', count: s?.live }, { key: 'irregular', label: 'Irregular', count: s?.irregular }, { key: 'safe', label: 'Safe', count: s?.safe }]} value={filter} onChange={setFilter} />}
      >
        {err && !board ? (
          <EmptyState icon={<TriangleAlert size={24} />} title="Live board unavailable" sub={err} />
        ) : (
          <div className="flex flex-col gap-4">
            <MapView points={points} height={360} hint={points.length ? undefined : (board ? `No ${who} is sending GPS right now` : 'Loading…')} />
            {board && rows.length === 0 ? (
              <EmptyState icon={<Radio size={24} />} title={filter === 'all' ? `Nothing in progress` : `No ${filter} jobs`} sub={`Jobs appear here from the moment a ${who} accepts until the hand-over.`} />
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                {rows.map((r) => <LiveCard key={`${r.kind}-${r.id}`} r={r} picked={picked === `${r.kind}-${r.id}`} onPick={() => setPicked(picked === `${r.kind}-${r.id}` ? null : `${r.kind}-${r.id}`)} />)}
              </ul>
            )}
          </div>
        )}
      </Panel>
    </>
  )
}

function LiveCard({ r, picked, onPick }: { r: LiveRow; picked: boolean; onPick: () => void }) {
  const safe = r.verdict === 'safe'
  const btn = 'inline-flex items-center gap-1.5 rounded-md border border-border-strong px-2.5 py-1 text-[11px] font-semibold text-ink hover:bg-surface'
  return (
    <li className={cx('flex flex-col gap-2.5 rounded-lg border p-3.5 transition-colors', safe ? 'border-border' : 'border-danger bg-danger-050', picked && 'ring-2 ring-primary')}>
      <div className="flex flex-wrap items-start gap-3">
        <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide',
                            safe ? 'bg-success-050 text-success' : 'bg-danger text-white')}>
          {safe ? <CircleCheck size={13} /> : <ShieldAlert size={13} />} {safe ? 'Safe' : 'Irregular'}
        </span>
        <button type="button" onClick={onPick} className="flex min-w-0 flex-1 flex-col text-left" title="Show only this job on the map">
          <span className="truncate text-[13px] font-bold text-ink">{r.ref} · {r.person?.name ?? 'Unassigned'} <span className="font-normal text-muted">· {r.person?.plate || r.person?.vehicle}</span></span>
          <span className="truncate text-[11px] text-ink-2">
            {r.kind === 'pickup' && <span className="mr-1 rounded bg-secondary-050 px-1.5 py-0.5 text-[10px] font-bold uppercase text-secondary-600">Item pick-up</span>}
            {(r.kind === 'pickup' ? PICKUP_STAGE[r.status] : STAGE[r.status]) ?? r.status.replace(/_/g, ' ')} · {r.route ?? `${r.from.name} → ${r.to.name}`}
            {r.kind === 'pickup' ? ` · ${r.item || 'item'} · worth ${ksh(r.parcel.total_value)}` : ` · order ${r.order_no} · parcel ${ksh(r.parcel.total_value)}`}
          </span>
        </button>
        <span className={cx('flex items-center gap-1 text-[11px] font-semibold', r.minutes_since_seen == null ? 'text-muted' : !safe && r.reasons.some((x) => /GPS|Signal|Missing/.test(x)) ? 'text-danger' : 'text-success')}>
          <Radio size={12} /> {seen(r.minutes_since_seen)}
        </span>
        {r.position?.battery != null && (
          <span className={cx('flex items-center gap-1 text-[11px]', r.position.battery <= 15 ? 'font-bold text-danger' : 'text-muted')}><BatteryLow size={12} /> {r.position.battery}%</span>
        )}
      </div>
      {!safe && (
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
          {r.reasons.map((x) => <li key={x}><Chip size="sm" tone="danger">{x}</Chip></li>)}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {r.position && <a className={btn} href={r.position.maps_url} target="_blank" rel="noreferrer"><MapPin size={11} /> Google Maps <ExternalLink size={9} /></a>}
        {r.tracking_url && <a className={btn} href={r.tracking_url} target="_blank" rel="noreferrer"><Radio size={11} /> Live tracking link <ExternalLink size={9} /></a>}
        {r.person?.phone && <a className={btn} href={`tel:${r.person.phone.replace(/\s+/g, '')}`}><Phone size={11} /> Call {r.person.name.split(' ')[0]}</a>}
        {r.incident && <Link to="/safety" className={cx(btn, 'border-danger text-danger')}><ShieldAlert size={11} /> Open in Safety ({r.incident.level})</Link>}
        <span className="ml-auto text-[10px] text-muted">{r.in_hand ? (r.kind === 'pickup' ? 'Item in hand' : 'Parcel in hand') : 'Not collected yet'}{r.started_at ? ` · since ${new Date(r.started_at).toLocaleString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}</span>
      </div>
    </li>
  )
}
