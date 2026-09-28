/** Safety (admin/back-end app/routers/safety.py): delivery riders (on deliveries or item pick-ups) and inter-county
 *  courier drivers who went dark with goods — alert, police report pack, police OB, close — and the UKO goods cover
 *  claims queue, where staff review, approve, reject and pay claims. Rider incidents use /shop/incidents/{id}, pick-up
 *  ones /shop/incidents/pickup/{id}, courier ones /shop/incidents/courier/{id} (lib/api incidentPath). */
import { useEffect, useState, type ReactNode } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { BatteryMedium, Bike, CircleCheck, Clock, ExternalLink, FileText, Gavel, MapPin, Navigation, Package, Phone, Printer, Route as RouteIcon, ShieldAlert, ShieldCheck, Siren, TriangleAlert, Truck, Wallet } from 'lucide-react'
import { api, incidentPath } from '#/lib/api'
import type { ClaimStatus, Incident, IncidentCounts, IncidentKind, IncidentList, InsuranceClaim, PayoutRole } from '#/lib/types'
import { useToast } from '#/lib/toast'
import { fmtDate, ksh, timeAgo } from '#/lib/format'
import { Button, Chip, EmptyState, Input, Notice, PageLoading, Select, StatCard, StatusPill, Tabs, Textarea, cx } from '#/components/ui'
import { DashHeader, Panel, Table, Td } from '#/components/dashboard'
import { Modal, Thumb, usePaged } from '#/components/console'
import { DesktopAlertsButton, INCIDENT_POLL_MS } from '#/components/safety-alarm'

export const Route = createFileRoute('/_console/safety')({ component: SafetyPage })

type Sub = 'riders' | 'claims'

function SafetyPage() {
  const [sub, setSub] = useState<Sub>('riders')
  const [activeCount, setActiveCount] = useState<number | undefined>(undefined)
  const [openClaims, setOpenClaims] = useState<number | undefined>(undefined)
  return (
    <>
      <DashHeader
        title="Safety"
        sub="Riders and courier drivers whose location stopped while goods are in their hands · UKO goods cover claims from riders, shelves and couriers"
        actions={<DesktopAlertsButton />}
      />
      <Tabs<Sub>
        tabs={[
          { key: 'riders', label: 'Missing drivers & riders', count: activeCount },
          { key: 'claims', label: 'Insurance claims', count: openClaims },
        ]}
        value={sub}
        onChange={setSub}
      />
      {sub === 'riders' && <MissingPeople onCount={setActiveCount} />}
      {sub === 'claims' && <ClaimsQueue onOpenCount={setOpenClaims} />}
    </>
  )
}

// ---------------------------------------------------------------- helpers
function minutesLabel(m: number | null | undefined): string {
  if (m === null || m === undefined) return '—'
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  return `${h} h ${m % 60} min`
}

function LevelPill({ level }: { level: string }) {
  return level === 'missing'
    ? <Chip tone="danger" size="sm"><Siren size={11} /> Missing</Chip>
    : <Chip tone="warning" size="sm"><TriangleAlert size={11} /> Warning</Chip>
}

const INCIDENT_STATUS_LABEL: Record<string, string> = { open: 'Open', reported_to_police: 'Reported to police', recovered: 'Found', closed: 'Closed' }

function IncidentStatusPill({ status, kind }: { status: string; kind?: IncidentKind }) {
  const tone = ({ open: 'danger', reported_to_police: 'primary', recovered: 'success', closed: 'neutral' } as Record<string, 'danger' | 'primary' | 'success' | 'neutral'>)[status] || 'neutral'
  const label = status === 'recovered' && kind ? `${kind === 'courier' ? 'Driver' : 'Rider'} found` : INCIDENT_STATUS_LABEL[status] ?? status
  return <Chip tone={tone} size="sm">{label}</Chip>
}

function LinkBtn({ href, icon, children }: { href: string; icon: ReactNode; children: ReactNode }) {
  if (!href) return <span className="inline-flex h-[32px] items-center gap-1.5 rounded-md border border-border px-3 text-xs text-muted">{icon} {children}</span>
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex h-[32px] items-center gap-1.5 rounded-md border border-border-strong px-3 text-xs font-semibold text-ink hover:bg-surface">
      {icon} {children}
    </a>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-bold uppercase tracking-wide text-muted">{label}</span>
      <span className="text-[13px] text-ink">{children || '—'}</span>
    </div>
  )
}

// ---------------------------------------------------------------- Missing drivers & riders
const INCIDENT_FILTERS: { key: string; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'open', label: 'Open' },
  { key: 'reported_to_police', label: 'Reported to police' },
  { key: 'recovered', label: 'Found' },
  { key: 'closed', label: 'Closed' },
  { key: 'all', label: 'All' },
]
type KindFilter = 'all' | IncidentKind
const KIND_FILTERS: { key: KindFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'rider', label: 'Riders' },
  { key: 'pickup', label: 'Pick-ups' },
  { key: 'courier', label: 'Couriers' },
]

/** Who the incident is about, in one word for sentences: "rider" / "driver". */
const who = (kind: IncidentKind) => (kind === 'courier' ? 'driver' : 'rider')
const incidentRef = (i: { kind: IncidentKind; id: number }) =>
  i.kind === 'courier' ? `CINC-${i.id}` : i.kind === 'pickup' ? `PINC-${i.id}` : `INC-${i.id}`
/** What the reference number is called on a card: "waybill" / "pick-up" / "tracking no". */
const refLabel = (kind: IncidentKind) => (kind === 'courier' ? 'waybill' : kind === 'pickup' ? 'pick-up' : 'tracking no')

function KindChip({ i }: { i: Incident }) {
  const vehicle = i.person?.vehicle || (i.kind === 'courier' ? 'van' : 'boda')
  if (i.kind === 'courier') return <Chip tone="secondary" size="sm"><Truck size={11} /> Courier · {vehicle}</Chip>
  if (i.kind === 'pickup') return <Chip tone="primary" size="sm"><Bike size={11} /> Rider · item pick-up</Chip>
  return <Chip tone="primary" size="sm"><Bike size={11} /> Rider · {vehicle}</Chip>
}

/** "Nairobi → Kisumu" for a courier leg, "item → shelf" for a pick-up, the drop-off for a rider. */
function destinationLabel(i: Incident): string {
  if (i.kind === 'pickup') {
    if (!i.job) return '—'
    return `${i.job.item_title || 'Item'} → ${i.job.shelf_name ? `${i.job.shelf_name} shelf` : 'shelf'}${i.job.shelf_ward ? `, ${i.job.shelf_ward}` : ''}`
  }
  if (i.kind === 'courier') {
    const o = i.leg?.origin, d = i.leg?.destination
    if (!o && !d) return '—'
    return `${o?.county || o?.label || '?'} → ${d?.county || d?.label || '?'}`
  }
  return i.delivery?.destination || i.delivery?.destination_ward || '—'
}

const orderNo = (i: Incident) => (i.kind === 'courier' ? i.leg?.order_no : i.kind === 'pickup' ? '' : i.delivery?.order_no) || ''

function MissingPeople({ onCount }: { onCount: (n: number) => void }) {
  const [status, setStatus] = useState('active')
  const [kind, setKind] = useState<KindFilter>('all')
  const [data, setData] = useState<IncidentList | null>(null)
  const [err, setErr] = useState('')
  const [open, setOpen] = useState<{ kind: IncidentKind; id: number } | null>(null)

  const load = async () => {
    try {
      const d = await api.get<IncidentList>('/shop/incidents', { status, kind })
      setData(d)
      onCount(d.counts.active)
      setErr('')
    } catch (e: any) {
      setErr(e.message || 'Could not load incidents')
    }
  }
  useEffect(() => {
    setData(null)
    load()
    const t = window.setInterval(load, INCIDENT_POLL_MS)
    return () => window.clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, kind])

  const c = data?.counts
  const bk = data?.by_kind
  const split = (k: keyof IncidentCounts) => {
    if (!bk) return null
    const pu = bk.pickup?.[k] ?? 0
    const r = bk.rider[k] + pu
    return (
      <span className="ml-2 text-[11px] font-normal text-muted">
        {r} rider{r === 1 ? '' : 's'}{pu ? ` (${pu} pick-up${pu === 1 ? '' : 's'})` : ''} · {bk.courier[k]} courier{bk.courier[k] === 1 ? '' : 's'}
      </span>
    )
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Missing (riders 30 min +, drivers 60 min +)" value={<span><span className={cx(c?.missing ? 'text-danger' : '')}>{c?.missing ?? '—'}</span>{split('missing')}</span>} />
        <StatCard label="Warning (riders 10 min +, drivers 20 min +)" value={<span><span className={cx(c?.warning ? 'text-warning' : '')}>{c?.warning ?? '—'}</span>{split('warning')}</span>} />
        <StatCard label="Reported to police" value={<span>{c?.reported ?? '—'}{split('reported')}</span>} />
        <StatCard label="Active incidents" value={<span>{c?.active ?? '—'}{split('active')}</span>} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {INCIDENT_FILTERS.map((f) => <Chip key={f.key} active={status === f.key} onClick={() => setStatus(f.key)}>{f.label}</Chip>)}
        <span className="flex-1" />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Who">
          {KIND_FILTERS.map((f) => <Chip key={f.key} active={kind === f.key} onClick={() => setKind(f.key)}>{f.label}</Chip>)}
        </div>
      </div>
      {err && <Notice tone="danger" title="Could not load incidents">{err}</Notice>}
      {!data && !err ? (
        <PageLoading />
      ) : data && data.incidents.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck size={28} />}
          title={status === 'active' ? (kind === 'courier' ? 'Every courier driver is reachable' : kind === 'rider' ? 'Every rider is reachable' : kind === 'pickup' ? 'Every rider on an item pick-up is reachable' : 'Every rider and driver is reachable') : 'No incidents here'}
          sub="Riders share their location while a parcel — or a seller's item on its way to a shelf — is in their hands (warning after 10 minutes without a fix, missing after 30). Courier drivers share theirs from pickup to hand-over (20 and 60 minutes — highway coverage is patchy)."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {data?.incidents.map((i) => <IncidentCard key={i.key} i={i} onOpen={() => setOpen({ kind: i.kind, id: i.id })} />)}
        </div>
      )}
      {open !== null && <IncidentModal key={`${open.kind}-${open.id}`} kind={open.kind} id={open.id} onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  )
}

function IncidentCard({ i, onOpen }: { i: Incident; onOpen: () => void }) {
  const hasFix = i.last_lat !== null && i.last_lng !== null
  const p = i.person
  const courier = i.kind === 'courier'
  const pickup = i.kind === 'pickup'
  return (
    <div className={cx('flex flex-col gap-3 rounded-lg border bg-bg p-4', i.level === 'missing' && ['open', 'reported_to_police'].includes(i.status) ? 'border-danger/50' : 'border-border')}>
      <div className="flex flex-wrap items-center gap-2">
        <LevelPill level={i.level} />
        <IncidentStatusPill status={i.status} kind={i.kind} />
        <KindChip i={i} />
        <span className="font-mono text-[12px] text-ink-2">{incidentRef(i)} · {refLabel(i.kind)} {i.tracking_no || '—'}</span>
        <span className="flex-1" />
        <span className="flex items-center gap-1 text-[13px] font-semibold text-ink"><Clock size={13} /> last seen {minutesLabel(i.minutes_since_seen)} ago</span>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-[14px] font-bold">{courier ? <Truck size={14} /> : <Bike size={14} />} {p?.name ?? `${courier ? 'Driver' : 'Rider'} #${p?.id ?? '?'}`}</span>
          <span className="flex items-center gap-1.5 text-[12px] text-ink-2"><Phone size={12} /> {p?.phone || '—'}{p?.alt_phone ? ` · ${p.alt_phone}` : ''}</span>
          <span className="text-[12px] text-ink-2">{p?.vehicle || '—'} · <strong className="font-mono">{p?.plate || 'no plate'}</strong></span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-[12px] text-ink-2"><MapPin size={12} /> {hasFix ? `${i.last_lat?.toFixed(5)}, ${i.last_lng?.toFixed(5)}` : 'No fix recorded'}{i.last_accuracy != null ? ` · ±${Math.round(i.last_accuracy)} m` : ''}</span>
          <span className="flex items-center gap-1.5 text-[12px] text-ink-2"><BatteryMedium size={12} /> battery {i.last_battery != null ? `${i.last_battery}%` : 'unknown'} · {i.last_seen_at ? fmtDate(i.last_seen_at) : '—'}</span>
          <span className="flex items-center gap-1.5 text-[12px] text-ink-2">{courier ? <><RouteIcon size={12} /> {destinationLabel(i)}{i.leg?.distance_km ? ` · ${Math.round(i.leg.distance_km)} km` : ''}</> : pickup ? <><Package size={12} /> {destinationLabel(i)}</> : <>To {destinationLabel(i)}</>}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-[12px] text-ink-2"><Package size={12} /> {pickup
            ? `seller ${i.job?.seller_name || '—'}${i.job?.seller_phone ? ` · ${i.job.seller_phone}` : ''}`
            : `${i.parcel.items.length} item${i.parcel.items.length === 1 ? '' : 's'} · order ${orderNo(i) || '—'}`}</span>
          <span className="text-[15px] font-bold">{ksh(i.parcel.total_value)}</span>
          {i.police_ob && <span className="text-[12px] text-ink-2">{i.police_station} · OB {i.police_ob}</span>}
          {i.claim && <span className="text-[12px] text-ink-2">Claim {i.claim.claim_no} · {i.claim.status.replace(/_/g, ' ')}</span>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <LinkBtn href={i.maps_url} icon={<MapPin size={13} />}>Open in Google Maps</LinkBtn>
        <LinkBtn href={i.tracking_url} icon={<Navigation size={13} />}>Live tracking link</LinkBtn>
        <Button size="sm" onClick={onOpen} icon={<ShieldAlert size={13} />}>Details & actions</Button>
      </div>
    </div>
  )
}

function IncidentModal({ kind, id, onClose, onChanged }: { kind: IncidentKind; id: number; onClose: () => void; onChanged: () => void }) {
  const toast = useToast()
  const [i, setI] = useState<Incident | null>(null)
  const [err, setErr] = useState('')
  const [station, setStation] = useState('')
  const [ob, setOb] = useState('')
  const [notes, setNotes] = useState('')
  const [closeNotes, setCloseNotes] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const path = incidentPath(kind, id)
  const person = who(kind)
  const courier = kind === 'courier'
  const pickup = kind === 'pickup'

  useEffect(() => {
    api.get<Incident>(path).then((d) => {
      setI(d)
      setStation(d.police_station)
      setOb(d.police_ob)
    }).catch((e) => setErr(e.message || 'Could not load the incident'))
  }, [path])

  const pack = async () => {
    setBusy('pack')
    try {
      await api.openHtml(`${path}/police-report`)
    } catch (e: any) {
      toast.error(e.message || 'Could not open the police report pack')
    } finally {
      setBusy(null)
    }
  }
  const report = async () => {
    if (station.trim().length < 2) return toast.alert('Enter the police station')
    if (ob.trim().length < 2) return toast.alert('Enter the OB number the police gave')
    setBusy('report')
    try {
      const r = await api.post<{ incident: Incident; message: string }>(`${path}/report-police`, { police_station: station.trim(), police_ob: ob.trim(), notes: notes.trim() })
      setI(r.incident)
      setNotes('')
      toast.success(r.message)
      onChanged()
    } catch (e: any) {
      toast.error(e.message || 'Could not record the police report')
    } finally {
      setBusy(null)
    }
  }
  const close = async (outcome: 'found' | 'closed') => {
    setBusy(outcome)
    try {
      const d = await api.post<Incident>(`${path}/close`, { outcome, notes: closeNotes.trim() })
      setI(d)
      toast.success(outcome === 'found' ? 'Marked as found — the incident is closed' : 'Incident closed')
      onChanged()
    } catch (e: any) {
      toast.error(e.message || 'Could not close the incident')
    } finally {
      setBusy(null)
    }
  }

  const active = i ? ['open', 'reported_to_police'].includes(i.status) : false
  const p = i?.person
  return (
    <Modal title={`Incident ${incidentRef({ kind, id })}${courier ? ' · courier driver' : pickup ? ' · rider on an item pick-up' : ' · rider'}`} onClose={onClose} wide danger={i?.level === 'missing' && active}>
      {err && <Notice tone="danger">{err}</Notice>}
      {!i && !err && <PageLoading />}
      {i && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <LevelPill level={i.level} />
            <IncidentStatusPill status={i.status} kind={i.kind} />
            <KindChip i={i} />
            <span className="text-[13px] font-semibold">Last seen {minutesLabel(i.minutes_since_seen)} ago</span>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Field label={courier ? 'Driver' : 'Rider'}>{p?.name}</Field>
            <Field label="Phone">{[p?.phone, p?.alt_phone].filter(Boolean).join(' · ')}</Field>
            <Field label="Vehicle / plate">{`${p?.vehicle || ''} · ${p?.plate || ''}`}</Field>
            <Field label="National ID">{p?.national_id}</Field>
            {courier && <Field label="Licence no">{p?.licence_no}</Field>}
            {courier && <Field label="Vehicle insurance">{p?.insurer ? `${p.insurer}${p.insurance_expires ? ` · to ${fmtDate(p.insurance_expires)}` : ''}` : 'Not recorded'}</Field>}
            <Field label={courier ? 'Waybill' : pickup ? 'Pick-up job' : 'Tracking no'}>{i.tracking_no}</Field>
            {!pickup && <Field label="Order">{orderNo(i)}</Field>}
            {pickup ? (
              <>
                <Field label="Item">{i.job ? `${i.job.item_title}${i.job.item_code ? ` · ${i.job.item_code}` : ''}` : ''}</Field>
                <Field label="Seller">{i.job ? [i.job.seller_name, i.job.seller_phone].filter(Boolean).join(' · ') : ''}</Field>
                <Field label="Picked up from">{i.job?.pickup_address}</Field>
                <Field label="Going to (shelf)">{i.job ? [i.job.shelf_name, i.job.shelf_ward, i.job.shelf_phone].filter(Boolean).join(' · ') : ''}</Field>
                <Field label="Pick-up">{i.job ? `${i.job.status.replace(/_/g, ' ')}${i.job.distance_km ? ` · ${i.job.distance_km} km` : ''}${i.job.collected_at ? ` · collected ${fmtDate(i.job.collected_at)}` : ''}` : ''}</Field>
              </>
            ) : courier ? (
              <>
                <Field label="From">{i.leg?.origin.label}</Field>
                <Field label="To">{i.leg?.destination.label}</Field>
                <Field label="Leg">{i.leg ? `${i.leg.status.replace(/_/g, ' ')} · ${Math.round(i.leg.distance_km || 0)} km${i.leg.departed_at ? ` · departed ${fmtDate(i.leg.departed_at)}` : ''}` : ''}</Field>
              </>
            ) : (
              <Field label="Destination">{[i.delivery?.destination, i.delivery?.destination_ward].filter(Boolean).join(', ')}</Field>
            )}
            <Field label="Signal lost">{i.last_seen_at ? `${fmtDate(i.last_seen_at)} (${timeAgo(i.last_seen_at)})` : ''}</Field>
            <Field label="Escalated">{i.escalated_at ? fmtDate(i.escalated_at) : ''}</Field>
            <Field label="Last position">{i.last_lat != null ? `${i.last_lat}, ${i.last_lng} ±${i.last_accuracy ?? '?'} m` : ''}</Field>
            <Field label="Battery">{i.last_battery != null ? `${i.last_battery}%` : ''}</Field>
            <Field label="Police">{i.police_ob ? `${i.police_station} · OB ${i.police_ob}` : 'Not reported'}</Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <LinkBtn href={i.maps_url} icon={<MapPin size={13} />}>Open in Google Maps</LinkBtn>
            <LinkBtn href={i.directions_url} icon={<Navigation size={13} />}>Directions</LinkBtn>
            <LinkBtn href={i.tracking_url} icon={<ExternalLink size={13} />}>Live tracking link</LinkBtn>
            <Button size="sm" variant="secondary" icon={<Printer size={13} />} loading={busy === 'pack'} onClick={pack}>Police report pack</Button>
          </div>

          <Panel title={courier ? 'Load' : pickup ? 'Item' : 'Parcel'} sub={`${ksh(i.parcel.total_value)} in the ${courier ? "driver's van" : "rider's hands"}${pickup ? ' · listed price' : ''}`} padded={false}>
            <Table head={['Item', 'Code', 'Qty', 'Value']}>
              {i.parcel.items.map((it, k) => (
                <tr key={k}><Td>{it.title}</Td><Td className="font-mono text-[12px]">{it.code || '—'}</Td><Td>{it.qty}</Td><Td>{ksh(it.value)}</Td></tr>
              ))}
            </Table>
          </Panel>

          {active && (
            <Panel title="Record police report" sub={i.status === 'reported_to_police' ? `Reported by ${i.reported_by} ${fmtDate(i.reported_at)} — update if the police gave new details` : `Recording it files the goods cover claim for the ${courier ? 'load' : pickup ? 'item' : 'parcel'} and suspends the ${person}`}>
              <div className="grid gap-3 md:grid-cols-2">
                <Input label="Police station" required value={station} onChange={(e) => setStation(e.target.value)} placeholder={courier ? 'e.g. Naivasha Police Station' : 'e.g. Kilimani Police Station'} />
                <Input label="OB number" required value={ob} onChange={(e) => setOb(e.target.value)} placeholder="e.g. OB 12/22/09/2026" />
                <Textarea label="Notes" className="md:col-span-2" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Officer, what the family said…" />
              </div>
              <div className="mt-3 flex justify-end"><Button size="sm" icon={<Gavel size={13} />} loading={busy === 'report'} onClick={report}>Record police report</Button></div>
            </Panel>
          )}

          {active && (
            <Panel title="Close the incident">
              <Textarea label="Notes" value={closeNotes} onChange={(e) => setCloseNotes(e.target.value)} rows={2} placeholder={courier ? 'Where he was found, the state of the load…' : pickup ? "Where he was found, the item's state…" : "Where he was found, the parcel's state…"} />
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <Button size="sm" variant="outline" loading={busy === 'closed'} onClick={() => close('closed')}>Close</Button>
                <Button size="sm" icon={<CircleCheck size={13} />} loading={busy === 'found'} onClick={() => close('found')}>{courier ? 'Driver found' : 'Rider found'}</Button>
              </div>
            </Panel>
          )}

          {i.claim && <Notice tone="info" icon={<ShieldCheck size={15} />} title={`Goods cover claim ${i.claim.claim_no}`}>Status: {i.claim.status.replace(/_/g, ' ')} — decide it under Insurance claims.</Notice>}
          {i.notes && <Panel title="Notes"><pre className="m-0 whitespace-pre-wrap font-sans text-[12px] text-ink-2">{i.notes}</pre></Panel>}

          <Panel title="Route trail" sub={`${i.trail?.length ?? 0} positions · newest first`} padded={false}>
            {i.trail && i.trail.length > 0 ? (
              <div className="max-h-[260px] overflow-y-auto">
                <Table head={['Time', 'Lat', 'Lng', 'Accuracy', '']}>
                  {[...i.trail].reverse().slice(0, 60).map((pt, k) => (
                    <tr key={k}>
                      <Td>{pt.at ? fmtDate(pt.at) : '—'}</Td><Td>{pt.lat}</Td><Td>{pt.lng}</Td><Td>{pt.accuracy != null ? `±${Math.round(pt.accuracy)} m` : '—'}</Td>
                      <Td><a className="text-xs font-semibold text-primary" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${pt.lat},${pt.lng}`}>Map</a></Td>
                    </tr>
                  ))}
                </Table>
              </div>
            ) : <p className="m-0 p-5 text-[13px] text-muted">No positions recorded.</p>}
          </Panel>

          <Panel title={courier ? 'Leg timeline' : pickup ? 'Pick-up timeline' : 'Delivery timeline'}>
            {i.events && i.events.length > 0 ? (
              <ol className="m-0 flex list-none flex-col gap-2 p-0">
                {i.events.map((ev, k) => (
                  <li key={k} className="flex gap-3 text-[13px]">
                    <span className="w-[120px] shrink-0 text-xs text-muted">{fmtDate(ev.time || ev.at || null) || '—'}</span>
                    <span><strong>{ev.title || ev.status}</strong>{(ev.sub || ev.note) && <span className="text-ink-2"> — {ev.sub || ev.note}</span>}</span>
                  </li>
                ))}
              </ol>
            ) : <p className="m-0 text-[13px] text-muted">No events recorded.</p>}
          </Panel>
        </div>
      )}
    </Modal>
  )
}

// ---------------------------------------------------------------- Insurance claims
const CLAIM_FILTERS: { key: '' | ClaimStatus; label: string }[] = [
  { key: '', label: 'All' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'under_review', label: 'Under review' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'paid', label: 'Paid' },
]
const ROLE_LABEL: Record<string, string> = { rider: 'Rider', shelve: 'Shelf', courier: 'Courier', seller: 'Seller', buyer: 'Buyer', external: 'External' }
type ClaimExtras = { counts: Record<string, number>; cover: { limit: number; excess: number; levy_pct: number } }

function ClaimsQueue({ onOpenCount }: { onOpenCount: (n: number) => void }) {
  const [status, setStatus] = useState<'' | ClaimStatus>('')
  const [role, setRole] = useState('')
  const { rows, data, err, reload, pager } = usePaged<InsuranceClaim, ClaimExtras>('/shop/insurance/claims', 'claims', { status, party_role: role })
  const [open, setOpen] = useState<InsuranceClaim | null>(null)
  const counts = data?.counts

  useEffect(() => {
    if (counts) onOpenCount((counts.submitted ?? 0) + (counts.under_review ?? 0))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counts])

  return (
    <div className="flex flex-col gap-4">
      {data?.cover && (
        <p className="m-0 text-[12px] text-ink-2">UKO goods cover: up to <strong>{ksh(data.cover.limit)}</strong> per claim · excess {ksh(data.cover.excess)} · items lost, damaged or stolen in a rider's, shelf's or courier's custody. Theft claims need a police OB number before approval.</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {CLAIM_FILTERS.map((f) => (
          <Chip key={f.key || 'all'} active={status === f.key} onClick={() => setStatus(f.key)}>
            {f.label}{counts && <span className="opacity-70">{counts[f.key || 'all'] ?? 0}</span>}
          </Chip>
        ))}
        <span className="flex-1" />
        <Select value={role} onChange={(e) => setRole(e.target.value)} className="w-[160px]">
          <option value="">Every custodian</option>
          <option value="rider">Riders</option>
          <option value="shelve">Shelves</option>
          <option value="courier">Couriers</option>
        </Select>
      </div>
      {err && <Notice tone="danger" title="Could not load claims">{err}</Notice>}
      <Panel padded={false}>
        {!rows ? <PageLoading /> : rows.length === 0 ? (
          <div className="p-5"><EmptyState icon={<ShieldCheck size={28} />} title="No claims here" sub="Claims are filed from the delivery, shelves and courier apps, or by the system when a missing rider or courier driver is reported to the police." /></div>
        ) : (
          <Table head={['Claim', 'Party', 'Ref', 'Kind', 'Claimed', 'Payable', 'Status', 'Filed']}>
            {rows.map((c) => (
              <tr key={c.id} className="cursor-pointer hover:bg-surface" onClick={() => setOpen(c)}>
                <Td className="font-mono text-[12px] font-semibold">{c.claim_no}</Td>
                <Td><div className="flex flex-col"><span className="text-[11px] text-muted">{ROLE_LABEL[c.party_role] ?? c.party_role}</span><span className="font-semibold">{c.party.name}</span></div></Td>
                <Td><div className="flex flex-col"><span className="text-[11px] text-muted">{c.ref_type.replace(/_/g, ' ')}</span><span className="font-mono text-[12px]">{c.ref_no || '—'}</span></div></Td>
                <Td><Chip size="sm" tone={c.kind === 'stolen' ? 'danger' : c.kind === 'damaged' ? 'warning' : 'neutral'}>{c.kind}</Chip></Td>
                <Td>{ksh(c.amount_claimed)}</Td>
                <Td className="font-semibold">{ksh(c.payable)}</Td>
                <Td><StatusPill status={c.status} /></Td>
                <Td className="text-xs text-ink-2">{fmtDate(c.created_at)}<br /><span className="text-muted">by {c.filed_by}</span></Td>
              </tr>
            ))}
          </Table>
        )}
        {pager}
      </Panel>
      {open && <ClaimModal claim={open} onClose={() => setOpen(null)} onChanged={(c) => { setOpen(c); reload() }} />}
    </div>
  )
}

function ClaimModal({ claim: c, onClose, onChanged }: { claim: InsuranceClaim; onClose: () => void; onChanged: (c: InsuranceClaim) => void }) {
  const toast = useToast()
  const limit = c.cover_limit > 0 ? c.cover_limit : Infinity
  const [amount, setAmount] = useState(String(Math.min(c.amount_claimed, limit === Infinity ? c.amount_claimed : limit)))
  const [note, setNote] = useState('')
  const firstCandidate = c.payout_candidates[0]
  const [payee, setPayee] = useState(firstCandidate ? `${firstCandidate.role}:${firstCandidate.users_id}` : 'external:')
  const [payoutRole, setPayoutRole] = useState<PayoutRole>(firstCandidate?.role ?? 'external')
  const [payoutRef, setPayoutRef] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const needsOb = c.kind === 'stolen' && !c.police_ob
  const amountNum = Number(amount) || 0
  const capped = limit !== Infinity && amountNum > limit
  const walletRole = ['seller', 'shelve', 'rider', 'courier'].includes(payoutRole)
  // a shelf / rider / courier wallet belongs to the partner the claim is about (partner_id); it needs no shop account
  const partnerRole = ['shelve', 'rider', 'courier'].includes(payoutRole)

  const pickPayee = (v: string) => {
    setPayee(v)
    const [r] = v.split(':')
    setPayoutRole(r as PayoutRole)
  }

  const decide = async (action: 'review' | 'approve' | 'reject' | 'pay') => {
    const body: Record<string, unknown> = { action, note: note.trim() || undefined }
    if (action === 'approve') {
      if (amountNum <= 0) return toast.alert('Enter the amount approved')
      body.amount_approved = amountNum
    }
    if (action === 'reject' && !note.trim()) return toast.alert('Say why the claim is rejected')
    if (action === 'pay') {
      const uid = Number(payee.split(':')[1]) || null
      if (partnerRole && payoutRole !== c.party_role) return toast.alert(`Only the ${ROLE_LABEL[c.party_role] ?? c.party_role} this claim is about has a wallet to pay here`)
      if (payoutRole !== 'external' && !partnerRole && !uid) return toast.alert('Pick who is paid')
      if (!walletRole && !payoutRef.trim()) return toast.alert('Enter the M-PESA code or bank reference of the payment')
      body.payout_to_users_id = uid
      body.payout_role = payoutRole
      body.payout_ref = payoutRef.trim() || undefined
    }
    setBusy(action)
    try {
      const d = await api.post<InsuranceClaim>(`/shop/insurance/claims/${c.id}/decide`, body)
      toast.success(`${d.claim_no}: ${d.status.replace(/_/g, ' ')}`)
      setNote('')
      onChanged(d)
    } catch (e: any) {
      toast.error(e.message || 'Could not update the claim')
    } finally {
      setBusy(null)
    }
  }

  const open = c.status === 'submitted' || c.status === 'under_review'
  return (
    <Modal title={`Claim ${c.claim_no}`} onClose={onClose} wide>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={c.status} />
          <Chip size="sm" tone={c.kind === 'stolen' ? 'danger' : 'neutral'}>{c.kind}</Chip>
          <span className="text-[12px] text-ink-2">filed {fmtDate(c.created_at)} by {c.filed_by}{c.decided_by ? ` · last decision by ${c.decided_by} ${fmtDate(c.decided_at)}` : ''}</span>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Field label={ROLE_LABEL[c.party_role] ?? c.party_role}>{c.party.name}</Field>
          <Field label="Phone">{c.party.phone}</Field>
          <Field label="Ref">{`${c.ref_type.replace(/_/g, ' ')} ${c.ref_no}`}</Field>
          <Field label="Claimed">{ksh(c.amount_claimed)}</Field>
          <Field label="Cover limit · excess">{`${ksh(c.cover_limit)} · ${ksh(c.excess)}`}</Field>
          <Field label="Payable">{<strong>{ksh(c.payable)}</strong>}</Field>
          <Field label="Police">{c.police_ob ? `${c.police_station} · OB ${c.police_ob}` : 'No OB number'}</Field>
          {c.incident_id && <Field label="Incident">{c.party_role === 'courier' ? `CINC-${c.incident_id}` : `INC-${c.incident_id}`}</Field>}
          {c.status === 'paid' && <Field label="Paid to">{['shelve', 'rider', 'courier'].includes(c.payout_role) && c.payout_role === c.party_role
            ? `${ROLE_LABEL[c.payout_role] ?? c.payout_role} wallet · ${c.party.name} · ${c.payout_ref}`
            : `${ROLE_LABEL[c.payout_role] ?? c.payout_role} #${c.payout_to_users_id ?? '—'} · ${c.payout_ref}`}</Field>}
        </div>
        <p className="m-0 whitespace-pre-wrap rounded-md bg-surface p-3 text-[13px]">{c.description}</p>

        <Panel title="Items" padded={false}>
          <Table head={['Item', 'Code', 'Value']}>
            {c.items.map((it, k) => <tr key={k}><Td>{it.title}</Td><Td className="font-mono text-[12px]">{it.code || '—'}</Td><Td>{ksh(it.value)}</Td></tr>)}
          </Table>
        </Panel>

        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wide text-muted">Evidence · {c.evidence.length}</span>
          {c.evidence.length === 0 ? <span className="text-[12px] text-muted">No photos or documents attached</span> : (
            <div className="flex flex-wrap gap-2">
              {c.evidence.map((u, k) => (
                <a key={k} href={u} target="_blank" rel="noreferrer" title="Open">
                  {/\.(jpe?g|png|webp|gif)(\?|$)/i.test(u) ? <Thumb src={u} size={72} /> : <Thumb size={72}><FileText size={20} className="absolute text-primary" /></Thumb>}
                </a>
              ))}
            </div>
          )}
        </div>

        {c.decision_note && <Panel title="Decision notes"><pre className="m-0 whitespace-pre-wrap font-sans text-[12px] text-ink-2">{c.decision_note}</pre></Panel>}

        {(open || c.status === 'approved') && (
          <Textarea label={open ? 'Note (required to reject)' : 'Note'} value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
        )}

        {open && (
          <Panel title="Decide">
            {needsOb && <Notice tone="danger" className="mb-3" title="Theft needs a police OB number">This claim cannot be approved until the theft is reported to the police and the OB number is on the claim.</Notice>}
            <div className="flex flex-wrap items-end gap-2">
              {c.status === 'submitted' && <Button size="sm" variant="outline" loading={busy === 'review'} onClick={() => decide('review')}>Review</Button>}
              <Input label="Amount approved (KSh)" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} className="w-[180px]" hint={limit !== Infinity ? `Cover limit ${ksh(limit)}${capped ? ' — will be capped' : ''}` : undefined} />
              <Button size="sm" icon={<CircleCheck size={13} />} disabled={needsOb} loading={busy === 'approve'} onClick={() => decide('approve')}>Approve</Button>
              <Button size="sm" variant="danger" loading={busy === 'reject'} onClick={() => decide('reject')}>Reject</Button>
            </div>
          </Panel>
        )}

        {c.status === 'approved' && (
          <Panel title="Mark paid" sub={`${ksh(c.payable)} payable (approved ${ksh(c.amount_approved)} less excess)`}>
            <div className="grid gap-3 md:grid-cols-3">
              <Select label="Paid to" value={payee} onChange={(e) => pickPayee(e.target.value)}>
                {c.payout_candidates.map((p) => <option key={`${p.role}:${p.users_id}`} value={`${p.role}:${p.users_id}`}>{ROLE_LABEL[p.role] ?? p.role} · {p.name}</option>)}
                <option value="external:">Someone outside UKO</option>
              </Select>
              <Select label="Role" value={payoutRole} onChange={(e) => setPayoutRole(e.target.value as PayoutRole)}>
                {(['seller', 'shelve', 'rider', 'courier', 'buyer', 'external'] as PayoutRole[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </Select>
              <Input label="Payout ref" value={payoutRef} onChange={(e) => setPayoutRef(e.target.value)} placeholder={walletRole ? 'optional' : 'M-PESA code / bank ref'} hint={walletRole ? (partnerRole ? 'Credited to the partner wallet' : 'Credited to his UKO wallet') : 'Pay outside UKO, then record the reference'} />
            </div>
            <div className="mt-3 flex justify-end"><Button size="sm" icon={<Wallet size={13} />} loading={busy === 'pay'} onClick={() => decide('pay')}>Mark paid</Button></div>
          </Panel>
        )}
      </div>
    </Modal>
  )
}
