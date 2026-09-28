/** UKOshop console (moved from shop/front-end admin.shelves): shelves (applications and the shelve report underneath), delivery partners,
 *  sellers, UKO courier and disputes. The last three, and the direct-message button on every list, live in components/shop-ops.tsx. */
import { useEffect, useState, type ReactNode } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Bike, CircleCheck, Clock, Download, Eye, FileText, IdCard, ImageIcon, Mail, MapPin, Package, Pencil, Phone, Search, Star, Store, Trash2, TriangleAlert, Truck, Users } from 'lucide-react'
import { api, SHELVES_PER_WARD, SHOP_URL } from '#/lib/api'
import type { Rider, Shelve } from '#/lib/types'
import { useToast } from '#/lib/toast'
import { fmtDate } from '#/lib/format'
import { Avatar, Button, Chip, EmptyState, Input, Notice, PageLoading, ProgressBar, Select, StatCard, StatusPill, Tabs, cx } from '#/components/ui'
import { DashHeader, Panel, Table, Td } from '#/components/dashboard'
import { CompanyEmailField, DocumentList, ImageUploader, Modal, Pager, Thumb, useCompanyEmails, usePaged, type AppFile } from '#/components/console'
import { AccountResultModal, BacklogNotice, CouriersTab, DisputesTab, LinkAccountModal, MessageButton, PartnerAccountCell, RevenueTab, SellersTab,
  ShelvesReportPanel, useMessenger, usePartnerActions, type BacklogSummary, type LinkTarget, type PartnerAccount, type PartnerAccountFields } from '#/components/shop-ops'
import { LiveBoard, useLiveCount } from '#/components/live'

export const Route = createFileRoute('/_console/shop')({ component: ShopConsole })

// ---------------------------------------------------------------- types
type Stats = { live: number; applications_pending: number; wards_without: number; suspended: number; avg_capacity: number; riders: number; rider_applications: number }
/** A register row: shelve_dict plus the shelf's sign-in account, shop link, wallet and what it is owed (admin shop.py list_shelves). */
type RegisterShelve = Shelve & PartnerAccountFields
type ShelvesData = { shelves: RegisterShelve[]; stats: Stats; counties: string[]; total: number; page: number; per_page: number; backlog?: BacklogSummary }
type Application = {
  id: number; ref: string; full_name: string; national_id: string; kra_pin: string; phone: string; email: string; shelve_name: string
  ward: string; country: string; county: string; building: string; landmark: string; item_capacity: number
  opening_time: string; closing_time: string; ward_free: boolean; status: string; image: string; documents: Record<string, any>
  files: AppFile[]; created_at: string | null
}
/** GET /api/shop/delivery-applications */
type DeliveryApp = {
  id: number; full_name: string; national_id: string; phone: string; email: string; vehicle_type: string; number_plate: string; wards: string[]; days: string[]
  start_time: string; end_time: string; documents: Record<string, any>; files: AppFile[]; status: string; created_at: string | null
}
/** GET /api/shop/riders — rider_dict + active_jobs + the sign-in account, shop link, wallet and what he is owed */
type AdminRider = Rider & PartnerAccountFields & {
  users_id?: number | null; national_id?: string; status?: string; joined?: string | null; active_jobs: number; mpesa_number?: string
}
type Geo = { wards: string[]; counties: string[]; countries: string[]; default_country: string }
type Tab = 'shelves' | 'delivery' | 'sellers' | 'couriers' | 'disputes' | 'revenue'

const TABS: { key: Tab; label: string }[] = [
  { key: 'shelves', label: 'Shelves' },
  { key: 'delivery', label: 'Delivery partners' },
  { key: 'sellers', label: 'Sellers' },
  { key: 'couriers', label: 'Courier' },
  { key: 'disputes', label: 'Disputes' },
  { key: 'revenue', label: 'Revenue' },
]
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function vehicleLabel(v: string) {
  return ({ motorbike: 'Motorbike', bicycle: 'Bicycle', car: 'Car', van: 'Van / pickup', foot: 'On foot' } as Record<string, string>)[v] || (v ? v.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : '—')
}

/** "Mon – Sat" when the days are contiguous, otherwise the list. */
function dayRange(days: string[]): string {
  if (!days?.length) return 'no days set'
  const idx = days.map((d) => DAYS.indexOf(d)).filter((i) => i >= 0).sort((a, b) => a - b)
  if (idx.length === 7) return 'Every day'
  const contiguous = idx.length > 1 && idx.every((v, i) => i === 0 || v === idx[i - 1] + 1)
  return contiguous ? `${DAYS[idx[0]]} – ${DAYS[idx[idx.length - 1]]}` : idx.map((i) => DAYS[i]).join(', ')
}

// ---------------------------------------------------------------- page
function ShopConsole() {
  const [tab, setTab] = useState<Tab>('shelves')
  const [geo, setGeo] = useState<Geo>({ wards: [], counties: [], countries: [], default_country: 'Kenya' })

  useEffect(() => {
    api.get<Geo>('/shop/wards').then(setGeo).catch(() => {})
  }, [])

  return (
    <>
      <div className="no-scrollbar -mx-4 -mt-6 flex items-center gap-1 overflow-x-auto border-b border-border bg-bg px-4 md:-mx-7 md:px-7">
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)} className={cx('whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] transition-colors', tab === t.key ? 'border-primary font-bold text-primary' : 'border-transparent text-ink-2 hover:text-ink')}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'shelves' && <ShelvesTab geo={geo} />}
      {tab === 'delivery' && <DeliveryPartnersTab />}
      {tab === 'sellers' && <SellersTab />}
      {tab === 'couriers' && <CouriersTab />}
      {tab === 'disputes' && <DisputesTab />}
      {tab === 'revenue' && <RevenueTab />}
    </>
  )
}

type CapFilter = 'any' | 'lt50' | '50-90' | 'gt90'
type ShelvesSub = 'shelves' | 'applications' | 'report'

/** Shelves | Applications | Shelve report — the same mini-tabs as Delivery partners. */
function ShelvesTab({ geo }: { geo: Geo }) {
  const [sub, setSub] = useState<ShelvesSub>('shelves')
  const [shelfCount, setShelfCount] = useState<number | undefined>(undefined)
  const [pendingCount, setPendingCount] = useState<number | undefined>(undefined)
  return (
    <>
      <DashHeader title="Shelves" sub={`The ward register · up to ${SHELVES_PER_WARD} shelves per ward · applications are verified here · the shelve report covers orders, sales, claims and seller reports`} />
      <Tabs<ShelvesSub>
        tabs={[
          { key: 'shelves', label: 'Shelves', count: shelfCount },
          { key: 'applications', label: 'Applications', count: pendingCount },
          { key: 'report', label: 'Shelve report' },
        ]}
        value={sub}
        onChange={setSub}
      />
      {sub === 'shelves' && <ShelvesRegister geo={geo} onCount={setShelfCount} onPending={setPendingCount} />}
      {sub === 'applications' && <ApplicationsPanel onCount={setPendingCount} />}
      {sub === 'report' && <ShelvesReportPanel />}
    </>
  )
}

function ShelvesRegister({ geo, onCount, onPending }: { geo: Geo; onCount: (n: number) => void; onPending: (n: number) => void }) {
  const toast = useToast()
  const [data, setData] = useState<ShelvesData | null>(null)
  const [loadErr, setLoadErr] = useState('')
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [status, setStatus] = useState('all')
  const [county, setCounty] = useState('')
  const [cap, setCap] = useState<CapFilter>('any')
  const [page, setPage] = useState(1)
  const [exporting, setExporting] = useState(false)
  const [editing, setEditing] = useState<Shelve | null>(null)
  const [removing, setRemoving] = useState<Shelve | null>(null)
  const [linking, setLinking] = useState<LinkTarget | null>(null)
  const msg = useMessenger()
  const actions = usePartnerActions('shelves', () => reload())

  // A new search or filter starts again from page 1 (set in the same render, so only one fetch goes out).
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (q.trim() === debouncedQ) return
      setDebouncedQ(q.trim())
      setPage(1)
    }, 300)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const filters = { q: debouncedQ, status, county, cap }
  const reload = async () => {
    try {
      const d = await api.get<ShelvesData>('/shop/shelves', { ...filters, page })
      setData(d)
      onCount(d.stats.live)
      onPending(d.stats.applications_pending)
      if (d.page !== page) setPage(d.page) // the last page emptied (removal) — the API clamps, follow it
      setLoadErr('')
    } catch (e: any) {
      setLoadErr(e.message || 'Could not load shelves')
    }
  }
  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ, status, county, cap, page])

  const rows = data?.shelves ?? []

  /** Exports every shelf matching the filters, not just the page on screen (per_page=0 = all). */
  const exportCsv = async () => {
    setExporting(true)
    let all: Shelve[]
    try {
      all = (await api.get<ShelvesData>('/shop/shelves', { ...filters, per_page: 0 })).shelves
    } catch (e: any) {
      toast.error(e.message || 'Could not export the register')
      return
    } finally {
      setExporting(false)
    }
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const head = ['Shelf', 'Owner', 'Licence', 'Country', 'County', 'Ward', 'Contact', 'Email', 'Opens', 'Closes', 'Capacity', 'Used %', 'Status']
    const body = all.map((s) => [s.name, s.owner_name, s.licence, s.country, s.county, s.ward, s.contact_phone, s.contact_email, s.opening_time, s.closing_time, s.capacity, s.capacity_used_pct ?? 0, s.status])
    const csv = [head, ...body].map((r) => r.map(esc).join(',')).join('\r\n')
    const a = document.createElement('a')
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent('﻿' + csv)
    a.download = `uko-shelves-${new Date().toISOString().slice(0, 10)}.csv`
    a.target = '_blank'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  if (loadErr && !data) {
    return <Notice tone="warning" icon={<Store size={16} />} title="Shelves register unavailable" action={<Button size="sm" variant="outline" onClick={reload}>Retry</Button>}>{loadErr}</Notice>
  }
  if (!data) return <PageLoading />
  const { stats } = data
  const counties = data.counties.length ? data.counties : geo.counties

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7 md:gap-4">
        <StatCard label="Live shelves" value={stats.live.toLocaleString()} />
        <StatCard label="Applications pending" value={stats.applications_pending} />
        <StatCard label="Wards without a shelf" value={stats.wards_without.toLocaleString()} />
        <StatCard label="Suspended" value={stats.suspended} />
        <StatCard label="Avg. capacity used" value={`${stats.avg_capacity}%`} />
        <StatCard label="Riders" value={(stats.riders ?? 0).toLocaleString()} />
        <StatCard label="Rider applications" value={stats.rider_applications ?? 0} />
      </div>

      <div className="flex flex-col gap-2.5 md:flex-row md:items-center">
        <Input className="md:w-[320px]" placeholder="Search shelf, owner, licence or ward" leading={<Search size={15} />} value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="grid grid-cols-3 gap-2 md:flex">
          <Select value={county} onChange={(e) => { setCounty(e.target.value); setPage(1) }} className="md:w-[170px]">
            <option value="">County: All</option>
            {counties.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} className="md:w-[160px]">
            <option value="all">Status: All</option>
            <option value="live">Live</option>
            <option value="at_capacity">At capacity</option>
            <option value="suspended">Suspended</option>
            <option value="pending">Pending</option>
          </Select>
          <Select value={cap} onChange={(e) => { setCap(e.target.value as CapFilter); setPage(1) }} className="md:w-[160px]">
            <option value="any">Capacity: Any</option>
            <option value="lt50">Under 50%</option>
            <option value="50-90">50 – 90%</option>
            <option value="gt90">Over 90%</option>
          </Select>
        </div>
        <div className="flex shrink-0 gap-2 whitespace-nowrap md:ml-auto">
          <Button variant="outline" size="sm" icon={<Download size={14} />} onClick={exportCsv} disabled={!data.total} loading={exporting}>Export</Button>
        </div>
      </div>

      <BacklogNotice kind="shelves" summary={data.backlog} actions={actions} />
      <Panel padded={false}>
        {rows.length === 0 ? (
          <div className="p-5"><EmptyState icon={<Store size={26} />} title="No shelves match" sub="Try clearing the search or filters. New shelves join the register when their application is approved below." /></div>
        ) : (
          <Table head={['Shelf', 'Owner', 'Licence', 'Location', 'Contact', 'Hours', 'Capacity', 'Status', 'Sign-in · wallet', '']}>
            {rows.map((s) => {
              const pct = s.capacity_used_pct ?? 0
              return (
                <tr key={s.id}>
                  <Td>
                    <div className="flex items-center gap-2.5">
                      <Thumb src={s.image} size={40}>{!s.image && <Store size={15} className="text-border-strong" />}</Thumb>
                      <div className="flex min-w-0 flex-col">
                        <span className="font-semibold text-ink">{s.name}</span>
                        {s.company_email && <span className="truncate text-[11px] text-muted">{s.company_email}</span>}
                      </div>
                    </div>
                  </Td>
                  <Td className="text-ink-2">{s.owner_name || '—'}</Td>
                  <Td className="text-ink-2">{s.licence || '—'}</Td>
                  <Td className="text-ink-2">{s.ward}{s.county ? ` · ${s.county}` : ''}</Td>
                  <Td className="text-ink-2">{s.contact_phone || '—'}</Td>
                  <Td className="whitespace-nowrap text-ink-2">{s.opening_time} – {s.closing_time}</Td>
                  <Td>
                    <div className="flex w-[90px] flex-col gap-1.5">
                      <span className="text-[11px] font-bold text-ink">{pct}%</span>
                      <ProgressBar value={pct} tone={pct > 90 ? 'warning' : 'primary'} className="h-[5px]" />
                    </div>
                  </Td>
                  <Td>
                    <div className="flex flex-col items-start gap-1">
                      <StatusPill status={s.status} />
                    </div>
                  </Td>
                  <Td><PartnerAccountCell kind="shelves" row={s} actions={actions} onLinkShop={() => setLinking({ id: s.id, name: s.name })} /></Td>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      <a href={`${SHOP_URL}/shelves/${s.id}`} target="_blank" rel="noreferrer" aria-label="View shelf page on UKOshop" className="flex h-[26px] w-[26px] items-center justify-center rounded-sm bg-surface text-ink-2 hover:text-primary"><Eye size={13} /></a>
                      <MessageButton usersId={s.owner_users_id} name={s.owner_name || s.name} role="shelve" onOpen={msg.open} />
                      <button type="button" onClick={() => setEditing(s)} aria-label="Edit shelf" className="flex h-[26px] w-[26px] items-center justify-center rounded-sm bg-surface text-ink-2 hover:text-primary"><Pencil size={13} /></button>
                      <button type="button" onClick={() => setRemoving(s)} aria-label="Remove shelf" className="flex h-[26px] w-[26px] items-center justify-center rounded-sm bg-danger-050 text-danger hover:opacity-80"><Trash2 size={13} /></button>
                    </div>
                  </Td>
                </tr>
              )
            })}
          </Table>
        )}
        <Pager page={data.page} perPage={data.per_page} total={data.total} onPage={setPage} />
      </Panel>

      {msg.modal}
      {actions.modal}
      {linking && <LinkAccountModal kind="shelves" target={linking} onClose={() => setLinking(null)} onDone={async () => { setLinking(null); await reload() }} />}

      {editing && (
        <ShelfFormModal
          shelve={editing}
          wards={geo.wards}
          counties={counties.length ? counties : ['Nairobi']}
          countries={geo.countries.length ? geo.countries : ['Kenya']}
          onClose={() => setEditing(null)}
          onSaved={async (s) => {
            setEditing(null)
            toast.success(`${s.name} updated`)
            await reload()
          }}
        />
      )}
      {removing && (
        <RemoveModal
          shelve={removing}
          onClose={() => setRemoving(null)}
          onDone={async () => {
            toast.success(`${removing.name} removed from the ward register`)
            setRemoving(null)
            await reload()
          }}
        />
      )}
    </>
  )
}

// ---------------------------------------------------------------- Edit shelf
// There is no Add: a shelf joins the register only by an approved (verified) application.
type ShelfForm = { name: string; owner_name: string; licence: string; country: string; county: string; ward: string; address: string; contact_phone: string; contact_email: string; opening_time: string; closing_time: string; delivery_fee: string; capacity: string; image: string; status: string }

function toForm(s: Shelve): ShelfForm {
  return {
    name: s?.name || '', owner_name: s?.owner_name || '', licence: s?.licence || '', country: s?.country || 'Kenya', county: s?.county || 'Nairobi', ward: s?.ward || '',
    address: s?.address || '', contact_phone: s?.contact_phone || '', contact_email: s?.contact_email || '', opening_time: s?.opening_time || '08:00', closing_time: s?.closing_time || '19:00',
    delivery_fee: String(s?.delivery_fee ?? 180), capacity: String(s?.capacity ?? 100), image: s?.image || '', status: s?.status || 'live',
  }
}

function ShelfFormModal({ shelve, wards, counties, countries, onClose, onSaved }: { shelve: Shelve; wards: string[]; counties: string[]; countries: string[]; onClose: () => void; onSaved: (s: Shelve) => Promise<void> }) {
  const [form, setForm] = useState<ShelfForm>(() => toForm(shelve))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k: keyof ShelfForm, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const wardOptions = form.ward && !wards.includes(form.ward) ? [form.ward, ...wards] : wards

  const submit = async () => {
    setErr('')
    if (!form.name.trim()) return setErr('Give the shelf a name')
    if (!form.ward) return setErr(`Pick the ward — up to ${SHELVES_PER_WARD} shelves per ward`)
    setBusy(true)
    const body = {
      ...form,
      owner_users_id: shelve.owner_users_id ?? null,
      delivery_fee: Number(form.delivery_fee) || 0,
      capacity: Number(form.capacity) || 100,
    }
    try {
      await onSaved(await api.put<Shelve>(`/shop/shelves/${shelve.id}`, body))
    } catch (e: any) {
      setErr(e.message || 'Could not save the shelf')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={`Edit · ${shelve.name}`} onClose={onClose} wide>
      <form className="flex flex-col gap-3.5" onSubmit={(e) => { e.preventDefault(); submit() }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Shelf name" required placeholder="e.g. Kilimani Shelf 01" value={form.name} onChange={(e) => set('name', e.target.value)} />
          <Input label="Owner name" placeholder="As on the contract" value={form.owner_name} onChange={(e) => set('owner_name', e.target.value)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Input label="Licence" placeholder="SH-0000" value={form.licence} onChange={(e) => set('licence', e.target.value.toUpperCase())} />
          <Select label="Country" value={form.country} onChange={(e) => set('country', e.target.value)}>
            {(countries.includes(form.country) ? countries : [form.country, ...countries]).map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
          <Select label="County" value={form.county} onChange={(e) => set('county', e.target.value)}>
            {(counties.includes(form.county) ? counties : [form.county, ...counties]).map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="Ward" required placeholder="Select ward" value={form.ward} onChange={(e) => set('ward', e.target.value)} hint={`Up to ${SHELVES_PER_WARD} shelves per ward — a full ward is rejected`}>
            {wardOptions.map((w) => <option key={w} value={w}>{w}</option>)}
          </Select>
          <Input label="Address" placeholder="Building, street" value={form.address} onChange={(e) => set('address', e.target.value)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Contact phone" placeholder="07xx xxx xxx" value={form.contact_phone} onChange={(e) => set('contact_phone', e.target.value)} />
          <Input label="Contact email" type="email" placeholder="owner@example.com" value={form.contact_email} onChange={(e) => set('contact_email', e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Input label="Opening time" type="time" value={form.opening_time} onChange={(e) => set('opening_time', e.target.value)} />
          <Input label="Closing time" type="time" value={form.closing_time} onChange={(e) => set('closing_time', e.target.value)} />
          <Input label="Delivery fee" inputMode="decimal" leading={<span className="text-xs">KSh</span>} value={form.delivery_fee} onChange={(e) => set('delivery_fee', e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Capacity (items)" inputMode="numeric" value={form.capacity} onChange={(e) => set('capacity', e.target.value.replace(/\D/g, ''))} />
          <Select label="Status" value={form.status} onChange={(e) => set('status', e.target.value)}>
            <option value="live">Live</option>
            <option value="pending">Pending</option>
            <option value="suspended">Suspended</option>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold text-ink-2">Shelf photo</span>
          <ImageUploader value={form.image} onChange={(url) => set('image', url)} />
        </div>
        {err && <Notice tone="danger" icon={<TriangleAlert size={14} />}>{err}</Notice>}
        <div className="flex gap-2.5">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button type="submit" className="flex-1" loading={busy}>Save changes</Button>
        </div>
      </form>
    </Modal>
  )
}

// ---------------------------------------------------------------- Remove prompt
type Impact = { items: number; open_claims: number; deliveries_today: number }

function RemoveModal({ shelve, onClose, onDone }: { shelve: Shelve; onClose: () => void; onDone: () => Promise<void> }) {
  const [impact, setImpact] = useState<Impact | null>(null)
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    api.get<{ shelve: Shelve; impact: Impact }>(`/shop/shelves/${shelve.id}/impact`).then((r) => setImpact(r.impact)).catch((e: any) => setErr(e.message))
  }, [shelve.id])

  const remove = async () => {
    setErr('')
    setBusy(true)
    try {
      await api.del(`/shop/shelves/${shelve.id}`, { confirm })
      await onDone()
    } catch (e: any) {
      setErr(e.message || 'Could not remove the shelf')
    } finally {
      setBusy(false)
    }
  }

  const impactRows: { icon: ReactNode; text: string }[] = impact
    ? [
        { icon: <Package size={14} />, text: `${impact.items} item${impact.items === 1 ? '' : 's'} still on this shelf must be returned to sellers` },
        { icon: <Users size={14} />, text: `${impact.open_claims} buyer${impact.open_claims === 1 ? ' has' : 's have'} open claims here` },
        { icon: <Truck size={14} />, text: `${impact.deliveries_today} deliver${impact.deliveries_today === 1 ? 'y is' : 'ies are'} scheduled from this shelf today` },
      ]
    : []

  return (
    <Modal onClose={onClose} danger>
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-danger-050 text-danger"><TriangleAlert size={18} /></span>
          <div className="flex flex-col gap-1">
            <h3 className="text-[17px] leading-tight">Remove {shelve.name}?</h3>
            <p className="m-0 text-xs leading-relaxed text-ink-2">This removes the shelf from the ward register. {shelve.ward} will have no shelf until a new application is approved.</p>
          </div>
        </div>
        <div className="flex flex-col gap-2.5 rounded-sm bg-surface p-3.5">
          {impact ? impactRows.map((r, i) => (
            <div key={i} className="flex items-start gap-2.5 text-[11px] leading-relaxed text-ink-2">
              <span className="mt-0.5 shrink-0 text-danger">{r.icon}</span>
              <span>{r.text}</span>
            </div>
          )) : <span className="text-[11px] text-muted">Checking impact…</span>}
        </div>
        <Input label="Type REMOVE to confirm" placeholder="REMOVE" value={confirm} onChange={(e) => setConfirm(e.target.value.toUpperCase())} className="font-head" />
        {err && <Notice tone="danger">{err}</Notice>}
        <div className="flex gap-2.5">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button variant="danger" className="flex-1" disabled={confirm !== 'REMOVE'} loading={busy} onClick={remove}>Remove</Button>
        </div>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------- Shelve applications (under the register)
/**
 * Submitted through Apply for a shelve. Each application lists its uploaded documents (Backblaze) to open
 * or download. Approving is what verifies a shelf — the API refuses while a required document is missing
 * or the ward is full, and the console disables Approve for the same reasons.
 */
function ApplicationsPanel({ onCount }: { onCount: (n: number) => void }) {
  const toast = useToast()
  const [filter, setFilter] = useState<'pending' | 'all'>('pending')
  const [busy, setBusy] = useState<number | null>(null)
  const [approved, setApproved] = useState<{ name: string; account: PartnerAccount } | null>(null)
  const { rows: apps, data, err, reload, pager } = usePaged<Application, { pending: number }>('/shop/applications', 'applications', { status: filter })
  const emails = useCompanyEmails()
  const shelfName = (a: Application) => a.shelve_name || `${a.ward} Shelf`
  useEffect(() => {
    if (data) onCount(data.pending)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.pending])

  const decide = async (a: Application, action: 'approve' | 'reject') => {
    setBusy(a.id)
    try {
      const r = await api.post<{ account?: PartnerAccount }>(`/shop/applications/${a.id}/${action}`, action === 'approve' ? emails.body(a.id, shelfName(a)) : undefined)
      toast.success(action === 'approve' ? `${a.shelve_name} verified — the shelf is now live in ${a.ward}` : `Application ${a.ref} rejected`)
      if (action === 'approve' && r.account) setApproved({ name: shelfName(a), account: r.account })
      await reload()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(null)
    }
  }

  const pending = data?.pending ?? 0

  return (
    <Panel
      title="Shelve applications"
      sub="Submitted through Apply for a shelve · download and check each document, then approve. Approving verifies the shelf, puts it live, gives the host a shelves-app sign-in on the company email and e-mails a set-password link (no UKOshop account needed) — an application without its required documents cannot be approved."
      action={
        <div className="flex items-center gap-2">
          <Chip size="sm" tone="warning">{pending} pending</Chip>
          <Select value={filter} onChange={(e) => setFilter(e.target.value as 'pending' | 'all')} className="w-[130px]">
            <option value="pending">Pending</option>
            <option value="all">All</option>
          </Select>
        </div>
      }
    >
      {err && !apps ? (
        <Notice tone="warning" icon={<FileText size={16} />} title="Applications unavailable" action={<Button size="sm" variant="outline" onClick={reload}>Retry</Button>}>{err}</Notice>
      ) : !apps ? (
        <PageLoading />
      ) : apps.length === 0 ? (
        <EmptyState icon={<FileText size={26} />} title={filter === 'pending' ? 'No applications waiting' : 'No applications yet'} sub="New shelf applications from the public form show up here." />
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {apps.map((a) => {
            const open = a.status === 'pending'
            const missing = a.files.filter((f) => f.missing).length
            const blocker = missing ? `${missing} required document${missing === 1 ? ' is' : 's are'} missing — cannot be verified` : !a.ward_free ? `${a.ward} already has ${SHELVES_PER_WARD} shelves` : ''
            return (
              <li key={a.id} className={cx('flex flex-col gap-4 rounded-md border bg-bg p-4', open ? 'border-border' : 'border-border/60 opacity-80')}>
                <div className="flex flex-col gap-3 md:flex-row md:items-start">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <Thumb src={a.image} size={48}>{!a.image && <ImageIcon size={15} className="text-border-strong" />}</Thumb>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate font-head text-sm font-bold text-ink">{a.shelve_name || `${a.ward} Shelf`}</span>
                      <span className="truncate text-[11px] text-ink-2">{a.full_name} · {a.ref} · applied {a.created_at ? fmtDate(a.created_at, false) : '—'}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 md:shrink-0">
                    <StatusPill status={a.status} label={a.status === 'approved' ? 'Verified' : undefined} />
                    {open && <Chip size="sm" tone={a.ward_free ? 'success' : 'warning'}>{a.ward_free ? 'Ward has a free slot' : 'Ward full'}</Chip>}
                  </div>
                </div>

                <div className="grid gap-x-6 gap-y-1.5 text-[12px] text-ink-2 sm:grid-cols-2 xl:grid-cols-3">
                  <span className="flex items-center gap-2"><IdCard size={13} className="shrink-0 text-muted" /> National ID <strong className="text-ink">{a.national_id || '—'}</strong></span>
                  <span className="flex items-center gap-2"><FileText size={13} className="shrink-0 text-muted" /> KRA PIN <strong className="text-ink">{a.kra_pin || '—'}</strong></span>
                  <span className="flex items-center gap-2"><Phone size={13} className="shrink-0 text-muted" /> {a.phone || '—'}</span>
                  <span className="flex min-w-0 items-center gap-2"><Mail size={13} className="shrink-0 text-muted" /> <span className="truncate">{a.email || '—'}</span></span>
                  <span className="flex min-w-0 items-center gap-2"><MapPin size={13} className="shrink-0 text-muted" /> <span className="truncate">{[a.ward, a.county, a.building, a.landmark].filter(Boolean).join(' · ') || '—'}</span></span>
                  <span className="flex items-center gap-2"><Clock size={13} className="shrink-0 text-muted" /> {a.opening_time} – {a.closing_time}{a.item_capacity ? ` · ${a.item_capacity} items` : ''}</span>
                </div>

                <DocumentList files={a.files} downloadBase={`/shop/applications/${a.id}/documents`} fallbackName={a.ref} />

                {open && !blocker && <CompanyEmailField value={emails.mailbox(a.id, shelfName(a))} onChange={(v) => emails.set(a.id, v)} disabled={busy === a.id} />}
                {open && (
                  <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
                    <span className={cx('flex flex-1 items-center gap-1.5 text-[11px]', blocker ? 'text-muted' : 'text-success')}>
                      {blocker ? <TriangleAlert size={13} /> : <CircleCheck size={13} />} {blocker || 'All required documents uploaded — check them, then approve to verify'}
                    </span>
                    <div className="grid grid-cols-2 gap-2 sm:flex">
                      <Button size="sm" disabled={!!blocker || !emails.mailbox(a.id, shelfName(a)) || busy === a.id} loading={busy === a.id} onClick={() => decide(a, 'approve')}>Approve</Button>
                      <Button size="sm" variant="outline" disabled={busy === a.id} onClick={() => decide(a, 'reject')}>Reject</Button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {apps && apps.length > 0 && <div className="-mx-5 -mb-5 mt-3">{pager}</div>}
      {approved && <AccountResultModal title={`${approved.name} approved`} account={approved.account} onClose={() => setApproved(null)} />}
    </Panel>
  )
}

// ---------------------------------------------------------------- Delivery partners tab (PRD: "Driver, rider details | remove – prompt" + driver application confirmation)
type RiderSub = 'live' | 'riders' | 'applications'

function DeliveryPartnersTab() {
  const [sub, setSub] = useState<RiderSub>('live')
  const liveCount = useLiveCount('rider')
  const [riderCount, setRiderCount] = useState<number | undefined>(undefined)
  const [pendingCount, setPendingCount] = useState<number | undefined>(undefined)
  return (
    <>
      <DashHeader title="Delivery partners" sub="Driver and rider details · removing a partner asks for confirmation · new driver applications are confirmed here" />
      <Tabs<RiderSub>
        tabs={[
          { key: 'live', label: 'Live deliveries', count: liveCount },
          { key: 'riders', label: 'Riders', count: riderCount },
          { key: 'applications', label: 'Driver applications', count: pendingCount },
        ]}
        value={sub}
        onChange={setSub}
      />
      {sub === 'live' && <LiveBoard kind="rider" />}
      {sub === 'riders' && <RidersPanel onCount={setRiderCount} />}
      {sub === 'applications' && <DriverApplicationsPanel onCount={setPendingCount} />}
    </>
  )
}

// ---- Riders register (GET /api/shop/riders?q=)
function RidersPanel({ onCount }: { onCount: (n: number) => void }) {
  const toast = useToast()
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [removing, setRemoving] = useState<AdminRider | null>(null)
  const [linking, setLinking] = useState<LinkTarget | null>(null)
  const msg = useMessenger()

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(q.trim()), 300)
    return () => window.clearTimeout(t)
  }, [q])

  const { rows: riders, data, err: loadErr, reload, pager } = usePaged<AdminRider, { online: number; backlog?: BacklogSummary }>('/shop/riders', 'riders', { q: debouncedQ })
  const actions = usePartnerActions('riders', reload)
  useEffect(() => {
    if (data && !debouncedQ) onCount(data.total)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.total, debouncedQ])

  if (loadErr && !riders) {
    return <Notice tone="warning" icon={<Truck size={16} />} title="Delivery partners unavailable" action={<Button size="sm" variant="outline" onClick={reload}>Retry</Button>}>{loadErr}</Notice>
  }

  return (
    <>
      <div className="flex flex-col gap-2.5 md:flex-row md:items-center">
        <Input className="md:w-[320px]" placeholder="Search rider, phone or number plate" leading={<Search size={15} />} value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="text-xs text-muted">{data ? `${data.total} active partner${data.total === 1 ? '' : 's'}` : 'Loading…'}{data?.online ? ` · ${data.online} online now` : ''}</span>
      </div>

      <BacklogNotice kind="riders" summary={data?.backlog} actions={actions} />

      <Panel padded={false}>
        {!riders ? (
          <PageLoading />
        ) : riders.length === 0 ? (
          <div className="p-5"><EmptyState icon={<Bike size={26} />} title={debouncedQ ? 'No rider matches' : 'No delivery partners yet'} sub={debouncedQ ? 'Try another name, phone or plate.' : 'Approve a driver application to add the first rider.'} /></div>
        ) : (
          <Table head={['Rider', 'Phone', 'National ID', 'Vehicle · plate', 'Wards', 'Hours', 'Rating · drops', 'Active jobs', 'Status', 'Sign-in · wallet', '']}>
            {riders.map((r) => (
              <tr key={r.id}>
                <Td>
                  <div className="flex items-center gap-2.5">
                    <Avatar name={r.name || 'Rider'} src={r.avatar || undefined} size={36} />
                    <div className="flex min-w-0 flex-col">
                      <span className="font-semibold text-ink">{r.name}</span>
                      <span className="truncate text-[11px] text-muted">{r.company_email || r.email || `since ${r.joined ? fmtDate(r.joined, false) : '—'}`}</span>
                    </div>
                  </div>
                </Td>
                <Td className="whitespace-nowrap text-ink-2">
                  {r.phone || '—'}
                  {r.alt_phone ? <span className="block text-[11px] text-muted">alt {r.alt_phone}</span> : null}
                </Td>
                <Td className="whitespace-nowrap text-ink-2">{r.national_id || '—'}</Td>
                <Td className="whitespace-nowrap text-ink-2">{vehicleLabel(r.vehicle_type)} · {r.number_plate || 'no plate'}</Td>
                <Td>
                  <div className="flex max-w-[220px] flex-wrap gap-1">
                    {r.wards?.length ? r.wards.map((w) => <Chip key={w} size="sm">{w}</Chip>) : <span className="text-muted">—</span>}
                  </div>
                </Td>
                <Td className="whitespace-nowrap text-ink-2">
                  {r.start_time || '—'} – {r.end_time || '—'}
                  <span className="block text-[11px] text-muted">{dayRange(r.days)}</span>
                </Td>
                <Td className="whitespace-nowrap">
                  <span className="flex items-center gap-1 font-semibold text-ink"><Star size={12} className="fill-secondary text-secondary" /> {r.rating ? r.rating.toFixed(1) : '—'}</span>
                  <span className="text-[11px] text-muted">{r.drops} drop{r.drops === 1 ? '' : 's'}</span>
                </Td>
                <Td className="text-center">{r.active_jobs ? <Chip size="sm" tone="primary">{r.active_jobs}</Chip> : <span className="text-muted">0</span>}</Td>
                <Td>
                  <div className="flex flex-col items-start gap-1">
                    <StatusPill status={r.is_online ? 'live' : r.status === 'suspended' ? 'suspended' : 'paused'} label={r.is_online ? 'Online' : r.status === 'suspended' ? 'Suspended' : 'Offline'} />
                  </div>
                </Td>
                <Td><PartnerAccountCell kind="riders" row={r} actions={actions} onLinkShop={() => setLinking({ id: r.id, name: r.name })} /></Td>
                <Td>
                  <div className="flex items-center gap-1.5">
                    <MessageButton usersId={r.users_id} name={r.name} role="delivery" onOpen={msg.open} />
                    <button type="button" onClick={() => setRemoving(r)} aria-label={`Remove ${r.name}`} className="flex h-[26px] w-[26px] items-center justify-center rounded-sm bg-danger-050 text-danger hover:opacity-80"><Trash2 size={13} /></button>
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        )}
        {pager}
      </Panel>

      {msg.modal}
      {actions.modal}
      {linking && <LinkAccountModal kind="riders" target={linking} onClose={() => setLinking(null)} onDone={async () => { setLinking(null); await reload() }} />}
      {removing && (
        <RemoveRiderModal
          rider={removing}
          onClose={() => setRemoving(null)}
          onDone={async () => {
            toast.success(`${removing.name} removed — their active jobs are being re-offered`)
            setRemoving(null)
            await reload()
          }}
        />
      )}
    </>
  )
}

// ---- Remove rider prompt (GET /api/shop/riders/{id}/impact → DELETE /api/shop/riders/{id} {confirm})
type RiderImpact = { active_jobs: number; drops: number }

function RemoveRiderModal({ rider, onClose, onDone }: { rider: AdminRider; onClose: () => void; onDone: () => Promise<void> }) {
  const [impact, setImpact] = useState<RiderImpact | null>(null)
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    api.get<{ rider: Rider; impact: RiderImpact }>(`/shop/riders/${rider.id}/impact`).then((r) => setImpact(r.impact)).catch((e: any) => setErr(e.message))
  }, [rider.id])

  const remove = async () => {
    setErr('')
    setBusy(true)
    try {
      await api.del(`/shop/riders/${rider.id}`, { confirm })
      await onDone()
    } catch (e: any) {
      setErr(e.message || 'Could not remove the delivery partner')
    } finally {
      setBusy(false)
    }
  }

  const impactRows: { icon: ReactNode; text: string }[] = impact
    ? [
        { icon: <Truck size={14} />, text: `${impact.active_jobs} active job${impact.active_jobs === 1 ? '' : 's'} will be re-offered to other riders` },
        { icon: <Package size={14} />, text: `${impact.drops} completed drop${impact.drops === 1 ? '' : 's'} stay on record for 90 days` },
      ]
    : []

  return (
    <Modal onClose={onClose} danger>
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-danger-050 text-danger"><TriangleAlert size={18} /></span>
          <div className="flex flex-col gap-1">
            <h3 className="text-[17px] leading-tight">Remove {rider.name}?</h3>
            <p className="m-0 text-xs leading-relaxed text-ink-2">This removes the delivery partner ({vehicleLabel(rider.vehicle_type)} · {rider.number_plate || 'no plate'}) and their delivery-app sign-in. They will no longer be offered jobs.</p>
          </div>
        </div>
        <div className="flex flex-col gap-2.5 rounded-sm bg-surface p-3.5">
          {impact ? impactRows.map((r, i) => (
            <div key={i} className="flex items-start gap-2.5 text-[11px] leading-relaxed text-ink-2">
              <span className="mt-0.5 shrink-0 text-danger">{r.icon}</span>
              <span>{r.text}</span>
            </div>
          )) : <span className="text-[11px] text-muted">Checking impact…</span>}
        </div>
        <Input label="Type REMOVE to confirm" placeholder="REMOVE" value={confirm} onChange={(e) => setConfirm(e.target.value.toUpperCase())} className="font-head" />
        {err && <Notice tone="danger">{err}</Notice>}
        <div className="flex gap-2.5">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button variant="danger" className="flex-1" disabled={confirm !== 'REMOVE'} loading={busy} onClick={remove}>Remove</Button>
        </div>
      </div>
    </Modal>
  )
}

// ---- Driver application confirmation (GET /api/shop/delivery-applications?status=pending|all)
function DriverApplicationsPanel({ onCount }: { onCount: (n: number) => void }) {
  const toast = useToast()
  const [filter, setFilter] = useState<'pending' | 'all'>('pending')
  const [busy, setBusy] = useState<number | null>(null)
  const [approved, setApproved] = useState<{ name: string; account: PartnerAccount } | null>(null)
  const { rows: apps, data, err, reload, pager } = usePaged<DeliveryApp, { pending: number }>('/shop/delivery-applications', 'applications', { status: filter })
  const emails = useCompanyEmails()
  useEffect(() => {
    if (data) onCount(data.pending)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.pending])

  const decide = async (a: DeliveryApp, action: 'approve' | 'reject') => {
    setBusy(a.id)
    try {
      const r = await api.post<{ account?: PartnerAccount }>(`/shop/delivery-applications/${a.id}/${action}`, action === 'approve' ? emails.body(a.id, a.full_name) : undefined)
      toast.success(action === 'approve' ? `${a.full_name} verified — they can now accept jobs from shelves` : `${a.full_name}'s application rejected`)
      if (action === 'approve' && r.account) setApproved({ name: a.full_name, account: r.account })
      await reload()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(null)
    }
  }

  const pending = data?.pending ?? 0

  return (
    <Panel
      title="Driver application confirmation"
      sub="Submitted through Apply for delivery · download and check the ID, licence and vehicle documents, then approve. Approving verifies the rider, gives them a delivery-app sign-in on the company email and e-mails a set-password link (no UKOshop account needed) — an application without its required documents cannot be approved."
      action={
        <div className="flex items-center gap-2">
          <Chip size="sm" tone="warning">{pending} pending</Chip>
          <Select value={filter} onChange={(e) => setFilter(e.target.value as 'pending' | 'all')} className="w-[130px]">
            <option value="pending">Pending</option>
            <option value="all">All</option>
          </Select>
        </div>
      }
    >
      {err && !apps ? (
        <Notice tone="warning" icon={<Truck size={16} />} title="Driver applications unavailable" action={<Button size="sm" variant="outline" onClick={reload}>Retry</Button>}>{err}</Notice>
      ) : !apps ? (
        <PageLoading />
      ) : apps.length === 0 ? (
        <EmptyState icon={<Truck size={26} />} title={filter === 'pending' ? 'No driver applications waiting' : 'No driver applications yet'} sub="Applications from Apply for delivery appear here for approval." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {apps.map((a) => {
            const open = a.status === 'pending'
            const missing = a.files.filter((f) => f.missing).length
            return (
              <div key={a.id} className={cx('flex flex-col gap-3 rounded-md border bg-bg p-4', open ? 'border-border' : 'border-border/60 opacity-80')}>
                <div className="flex items-start gap-2.5">
                  <Avatar name={a.full_name || 'Applicant'} size={38} />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-head text-sm font-bold text-ink">{a.full_name}</span>
                    <span className="text-[11px] text-muted">Applied {a.created_at ? fmtDate(a.created_at, false) : '—'}</span>
                  </div>
                  <StatusPill status={a.status} />
                </div>
                <div className="flex flex-col gap-1.5 text-[12px] text-ink-2">
                  <span className="flex items-center gap-2"><IdCard size={13} className="shrink-0 text-muted" /> National ID <strong className="text-ink">{a.national_id || '—'}</strong></span>
                  <span className="flex items-center gap-2"><Phone size={13} className="shrink-0 text-muted" /> {a.phone || '—'}</span>
                  <span className="flex min-w-0 items-center gap-2"><Mail size={13} className="shrink-0 text-muted" /> <span className="truncate">{a.email || '—'}</span></span>
                  <span className="flex items-center gap-2"><Bike size={13} className="shrink-0 text-muted" /> {vehicleLabel(a.vehicle_type)} · <strong className="text-ink">{a.number_plate || 'no plate'}</strong></span>
                  <span className="flex items-center gap-2"><Clock size={13} className="shrink-0 text-muted" /> {dayRange(a.days)} · {a.start_time || '—'} – {a.end_time || '—'}</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-muted">Wards</span>
                  <div className="flex flex-wrap gap-1">{a.wards?.length ? a.wards.map((w) => <Chip key={w} size="sm" tone="primary">{w}</Chip>) : <span className="text-[11px] text-muted">No wards listed</span>}</div>
                </div>
                <DocumentList files={a.files} downloadBase={`/shop/delivery-applications/${a.id}/documents`} fallbackName={`DL-APP-${a.id}`} />
                {open && missing > 0 && <span className="flex items-center gap-1.5 text-[11px] text-muted"><TriangleAlert size={13} /> {missing} required document{missing === 1 ? ' is' : 's are'} missing — cannot be verified</span>}
                {open && missing === 0 && <CompanyEmailField value={emails.mailbox(a.id, a.full_name)} onChange={(v) => emails.set(a.id, v)} disabled={busy === a.id} />}
                <div className="mt-auto grid grid-cols-2 gap-2">
                  <Button size="sm" disabled={!open || missing > 0 || !emails.mailbox(a.id, a.full_name) || busy === a.id} loading={busy === a.id} onClick={() => decide(a, 'approve')}>{a.status === 'approved' ? 'Verified' : 'Approve'}</Button>
                  <Button size="sm" variant="outline" disabled={!open || busy === a.id} onClick={() => decide(a, 'reject')}>{a.status === 'rejected' ? 'Rejected' : 'Reject'}</Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
      {apps && apps.length > 0 && <div className="-mx-5 -mb-5 mt-3">{pager}</div>}
      {approved && <AccountResultModal title={`${approved.name} approved`} account={approved.account} onClose={() => setApproved(null)} />}
    </Panel>
  )
}
