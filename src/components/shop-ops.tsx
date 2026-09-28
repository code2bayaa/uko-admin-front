/**
 * The UKOshop console beyond shelves and riders (admin/back-end/app/routers/shop_ops.py): the shelve report
 * appended to the Shelves tab, the Sellers and Courier tabs, disputes segmented by category, and the
 * direct-message button every list row carries.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { AlertCircle, BellRing, ImageIcon, CheckCheck, Coins, CircleCheck, Clock, Copy, ExternalLink, FileText, Gavel, IdCard, Mail, MessageSquare, Phone, Route, Search, Send, ShieldCheck, Star, Store, Trash2, TriangleAlert, Truck, Users } from 'lucide-react'
import { api, COMPANY_EMAIL_DOMAIN, SHOP_URL, suggestCompanyMailbox } from '#/lib/api'
import { useToast } from '#/lib/toast'
import { fmtDate, ksh, num, timeAgo } from '#/lib/format'
import { Avatar, Button, Chip, EmptyState, Input, Notice, PageLoading, ProgressBar, Select, StatCard, StatusPill, Tabs, Textarea, cx } from './ui'
import { DashHeader, Panel, Table, Td } from './dashboard'
import { CompanyEmailField, DocumentList, Modal, Pager, useCompanyEmails, usePaged, type AppFile } from './console'
import { LiveBoard, useLiveCount } from './live'

// ---------------------------------------------------------------- shared: report window
export type Days = 7 | 30 | 90 | 0
const WINDOWS: { value: Days; label: string }[] = [
  { value: 7, label: 'Last 7 days' },
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: 'Last 90 days' },
  { value: 0, label: 'All time' },
]

function WindowSelect({ value, onChange }: { value: Days; onChange: (d: Days) => void }) {
  return (
    <Select value={String(value)} onChange={(e) => onChange(Number(e.target.value) as Days)} className="w-[140px]">
      {WINDOWS.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
    </Select>
  )
}

/** A report route with `days`: its totals cover the whole window, its table comes 20 rows a page. */
function useReport<T extends { rows: unknown[] }>(path: string, days: Days) {
  const { rows, data, err, reload, pager } = usePaged<T['rows'][number], Omit<T, 'rows'>>(path, 'rows', { days })
  return { data: data && rows ? ({ ...data, rows } as unknown as T) : null, err, reload, pager }
}

// ---------------------------------------------------------------- shared: direct message
export type MessageRole = 'shelve' | 'seller' | 'delivery' | 'courier'
type SentMessage = { id: number; title: string; body: string; read: boolean; time: string | null }
type MessageTarget = { usersId: number; name: string; role: MessageRole }

const ROLE_NOUN: Record<MessageRole, string> = { shelve: 'shelf host', seller: 'seller', delivery: 'delivery partner', courier: 'courier driver' }

/** The envelope in a list row. Staff messages are shop notifications, so a partner not linked to a UKOshop account
 *  cannot be messaged here (contact them on their company email or phone instead). */
export function MessageButton({ usersId, name, role, onOpen }: { usersId?: number | null; name: string; role: MessageRole; onOpen: (t: MessageTarget) => void }) {
  const off = !usersId
  return (
    <button
      type="button"
      disabled={off}
      onClick={() => usersId && onOpen({ usersId, name, role })}
      title={off ? 'Not linked to a UKOshop account — reach them by company email or phone' : `Message ${name}`}
      aria-label={`Message ${name}`}
      className="flex h-[26px] w-[26px] items-center justify-center rounded-sm bg-primary-050 text-primary hover:opacity-80 disabled:cursor-not-allowed disabled:bg-surface disabled:text-border-strong"
    >
      <MessageSquare size={13} />
    </button>
  )
}

/** Renders the modal for whichever row's envelope was clicked. One per tab. */
export function useMessenger() {
  const [target, setTarget] = useState<MessageTarget | null>(null)
  const modal = target ? <MessageModal target={target} onClose={() => setTarget(null)} /> : null
  return { open: setTarget, modal }
}

/**
 * Sends a staff message (POST /api/shop/messages): it lands on the person's Notifications page and goes
 * out by push, SMS and e-mail, since notices from UKO itself cannot be switched off. What staff sent
 * before is listed above the compose box, so nobody sends the same thing twice.
 */
function MessageModal({ target, onClose }: { target: MessageTarget; onClose: () => void }) {
  const toast = useToast()
  const [history, setHistory] = useState<SentMessage[] | null>(null)
  const [contact, setContact] = useState<{ email: string; telephone: string } | null>(null)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    api.get<{ user: { email: string; telephone: string } | null; messages: SentMessage[] }>('/shop/messages', { users_id: target.usersId })
      .then((r) => { setHistory(r.messages); setContact(r.user) })
      .catch((e: any) => { setErr(e.message); setHistory([]) })
  }, [target.usersId])

  const send = async () => {
    setErr('')
    if (body.trim().length < 2) return setErr('Write the message first')
    setBusy(true)
    try {
      const m = await api.post<SentMessage>('/shop/messages', { users_id: target.usersId, role: target.role, body: body.trim() })
      setHistory((h) => [m, ...(h || [])])
      setBody('')
      toast.success(`Message sent to ${target.name}`)
    } catch (e: any) {
      setErr(e.message || 'Could not send the message')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={`Message ${target.name}`} onClose={onClose} wide>
      <div className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-2">
          <Chip size="sm" tone="primary">{ROLE_NOUN[target.role]}</Chip>
          {contact?.telephone && <span className="flex items-center gap-1.5"><Phone size={12} className="text-muted" /> {contact.telephone}</span>}
          {contact?.email && <span className="flex items-center gap-1.5"><Mail size={12} className="text-muted" /> {contact.email}</span>}
        </div>
        <div className="flex max-h-[240px] flex-col gap-2 overflow-y-auto rounded-sm bg-surface p-3">
          {!history ? (
            <span className="text-[11px] text-muted">Loading earlier messages…</span>
          ) : history.length === 0 ? (
            <span className="text-[11px] text-muted">No messages from staff yet.</span>
          ) : (
            history.map((m) => (
              <div key={m.id} className="flex flex-col gap-1 rounded-sm border border-border bg-bg px-3 py-2">
                <div className="flex items-center justify-between gap-2 text-[10px] text-muted">
                  <span className="font-semibold uppercase tracking-wide">{m.title}</span>
                  <span className="flex items-center gap-1">{m.read && <CheckCheck size={12} className="text-success" />}{fmtDate(m.time)}</span>
                </div>
                <p className="m-0 whitespace-pre-line text-[12px] leading-relaxed text-ink">{m.body}</p>
              </div>
            ))
          )}
        </div>
        <Textarea label="New message" rows={4} maxLength={1000} placeholder={`Write to the ${ROLE_NOUN[target.role]}…`} value={body} onChange={(e) => setBody(e.target.value)} hint={`${body.length} / 1000 · delivered in the app and by push, SMS and e-mail`} />
        {err && <Notice tone="danger" icon={<TriangleAlert size={14} />}>{err}</Notice>}
        <div className="flex gap-2.5">
          <Button variant="outline" className="flex-1" onClick={onClose}>Close</Button>
          <Button className="flex-1" icon={<Send size={14} />} loading={busy} onClick={send}>Send</Button>
        </div>
      </div>
    </Modal>
  )
}

function ReportLoading({ err, reload, children }: { err: string; reload: () => void; children: ReactNode }) {
  if (err) return <Notice tone="warning" icon={<AlertCircle size={16} />} title="Report unavailable" action={<Button size="sm" variant="outline" onClick={reload}>Retry</Button>}>{err}</Notice>
  return <>{children}</>
}

// ---------------------------------------------------------------- Shelve report (appended under the Shelves register)
type ShelfRow = {
  id: number; name: string; ward: string; county: string; owner_name: string; owner_users_id: number | null; status: string; items: number
  capacity_used_pct: number; orders: number; sales: number; commission: number; claims: number; runs: number; reports: number; last_report: string | null
}
type ShelvesReport = { days: number; totals: Record<'orders' | 'sales' | 'commission' | 'claims' | 'runs' | 'reports' | 'shelves' | 'reported_shelves', number>; rows: ShelfRow[] }

export function ShelvesReportPanel() {
  const [days, setDays] = useState<Days>(30)
  const { data, err, reload, pager } = useReport<ShelvesReport>('/shop/reports/shelves', days)
  const msg = useMessenger()
  const t = data?.totals

  return (
    <Panel title="Shelve report" sub="Orders, sales and commission through each shelf, buyer claims, rider runs out of it and the reports sellers filed against it · reported shelves are listed first" action={<WindowSelect value={days} onChange={setDays} />}>
      <ReportLoading err={err} reload={reload}>
        {!data || !t ? <PageLoading /> : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <StatCard label="Paid orders" value={num(t.orders)} />
              <StatCard label="Sales" value={ksh(t.sales, { compact: true })} />
              <StatCard label="Commission" value={ksh(t.commission, { compact: true })} />
              <StatCard label="Claims" value={num(t.claims)} />
              <StatCard label="Rider runs" value={num(t.runs)} />
              <StatCard label="Seller reports" value={`${num(t.reports)} · ${t.reported_shelves} shel${t.reported_shelves === 1 ? 'f' : 'ves'}`} />
            </div>
            {data.rows.length === 0 ? (
              <EmptyState icon={<Store size={26} />} title="No shelves to report on" sub="Live shelves appear here once they are on the register." />
            ) : (
              <div className="-mx-5 overflow-hidden border-t border-border">
                <Table head={['Shelf', 'Host', 'Items · used', 'Orders', 'Sales', 'Commission', 'Claims', 'Runs', 'Reports', '']}>
                  {data.rows.map((r) => (
                    <tr key={r.id}>
                      <Td>
                        <span className="block font-semibold text-ink">{r.name}</span>
                        <span className="text-[11px] text-muted">{r.ward}{r.county ? ` · ${r.county}` : ''}</span>
                      </Td>
                      <Td className="text-ink-2">{r.owner_name || '—'}</Td>
                      <Td>
                        <div className="flex w-[90px] flex-col gap-1.5">
                          <span className="text-[11px] font-bold text-ink">{r.items} · {r.capacity_used_pct}%</span>
                          <ProgressBar value={r.capacity_used_pct} tone={r.capacity_used_pct > 90 ? 'warning' : 'primary'} className="h-[5px]" />
                        </div>
                      </Td>
                      <Td className="text-ink-2">{num(r.orders)}</Td>
                      <Td className="whitespace-nowrap font-semibold text-ink">{ksh(r.sales)}</Td>
                      <Td className="whitespace-nowrap text-ink-2">{ksh(r.commission)}</Td>
                      <Td className="text-ink-2">{r.claims}</Td>
                      <Td className="text-ink-2">{r.runs}</Td>
                      <Td>
                        {r.reports ? (
                          <span className="flex flex-col">
                            <Chip size="sm" tone="danger">{r.reports} report{r.reports === 1 ? '' : 's'}</Chip>
                            {r.last_report && <span className="mt-1 text-[10px] text-muted">last {timeAgo(r.last_report)}</span>}
                          </span>
                        ) : <span className="text-muted">0</span>}
                      </Td>
                      <Td><MessageButton usersId={r.owner_users_id} name={r.owner_name || r.name} role="shelve" onOpen={msg.open} /></Td>
                    </tr>
                  ))}
                </Table>
                {pager}
              </div>
            )}
          </div>
        )}
      </ReportLoading>
      {msg.modal}
    </Panel>
  )
}

// ---------------------------------------------------------------- Sellers tab
type Seller = {
  id: number; name: string; store_name: string; email: string; telephone: string; county: string; ward: string; avatar: string
  ads: number; live_ads: number; shelved: number; items_sold: number; positive_rate: number; is_shelve_owner: boolean; joined: string | null
}
type SellersData = { sellers: Seller[]; total: number; page: number; per_page: number; stats: { sellers: number; live_ads: number; shelved: number } }
type SellerRow = { id: number; name: string; email: string; orders: number; units: number; sales: number; cancelled: number; returned: number; refunds: number; positive_rate: number }
type SellersReport = { days: number; totals: Record<'orders' | 'units' | 'sales' | 'cancelled' | 'returned' | 'refunds' | 'active_sellers', number>; rows: SellerRow[] }

export function SellersTab() {
  const [sub, setSub] = useState<'sellers' | 'report'>('sellers')
  const [count, setCount] = useState<number | undefined>(undefined)
  return (
    <>
      <DashHeader title="Sellers" sub="Every account that has posted an ad · message a seller straight from the list · the seller report ranks them by sales" />
      <Tabs<'sellers' | 'report'> tabs={[{ key: 'sellers', label: 'Sellers', count }, { key: 'report', label: 'Seller report' }]} value={sub} onChange={setSub} />
      {sub === 'sellers' ? <SellersPanel onCount={setCount} /> : <SellersReportPanel />}
    </>
  )
}

function SellersPanel({ onCount }: { onCount: (n: number) => void }) {
  const [data, setData] = useState<SellersData | null>(null)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [page, setPage] = useState(1)
  const msg = useMessenger()

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (q.trim() === debouncedQ) return
      setDebouncedQ(q.trim())
      setPage(1)
    }, 300)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const reload = async () => {
    try {
      const d = await api.get<SellersData>('/shop/sellers', { q: debouncedQ, page })
      setData(d)
      onCount(d.stats.sellers)
      if (d.page !== page) setPage(d.page)
      setErr('')
    } catch (e: any) {
      setErr(e.message || 'Could not load sellers')
    }
  }
  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ, page])

  if (err && !data) return <Notice tone="warning" icon={<Users size={16} />} title="Sellers unavailable" action={<Button size="sm" variant="outline" onClick={reload}>Retry</Button>}>{err}</Notice>
  if (!data) return <PageLoading />

  return (
    <>
      <div className="grid grid-cols-3 gap-3 md:gap-4">
        <StatCard label="Sellers" value={num(data.stats.sellers)} />
        <StatCard label="Live ads" value={num(data.stats.live_ads)} />
        <StatCard label="Items on shelves" value={num(data.stats.shelved)} />
      </div>
      <div className="flex flex-col gap-2.5 md:flex-row md:items-center">
        <Input className="md:w-[320px]" placeholder="Search seller, store, e-mail, phone or ward" leading={<Search size={15} />} value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="text-xs text-muted md:ml-auto">{data.total ? `${num(data.total)} seller${data.total === 1 ? '' : 's'}` : 'No matches'}</span>
      </div>
      <Panel padded={false}>
        {data.sellers.length === 0 ? (
          <div className="p-5"><EmptyState icon={<Users size={26} />} title={debouncedQ ? 'No seller matches' : 'No sellers yet'} sub={debouncedQ ? 'Try another name, e-mail or phone.' : 'An account becomes a seller with its first ad.'} /></div>
        ) : (
          <Table head={['Seller', 'Contact', 'Location', 'Ads · live', 'On shelves', 'Sold', 'Positive', 'Joined', '']}>
            {data.sellers.map((s) => (
              <tr key={s.id}>
                <Td>
                  <div className="flex items-center gap-2.5">
                    <Avatar name={s.store_name || s.name || 'Seller'} src={s.avatar || undefined} size={36} />
                    <div className="flex min-w-0 flex-col">
                      <span className="font-semibold text-ink">{s.store_name || s.name}</span>
                      <span className="truncate text-[11px] text-muted">{s.store_name ? s.name : `#${s.id}`}{s.is_shelve_owner ? ' · also hosts a shelf' : ''}</span>
                    </div>
                  </div>
                </Td>
                <Td className="whitespace-nowrap text-ink-2">
                  {s.telephone || '—'}
                  <span className="block max-w-[200px] truncate text-[11px] text-muted">{s.email}</span>
                </Td>
                <Td className="text-ink-2">{[s.ward, s.county].filter(Boolean).join(' · ') || '—'}</Td>
                <Td className="text-ink-2">{s.ads} · <strong className="text-ink">{s.live_ads}</strong></Td>
                <Td className="text-ink-2">{s.shelved}</Td>
                <Td className="text-ink-2">{num(s.items_sold)}</Td>
                <Td className="text-ink-2">{Math.round(s.positive_rate)}%</Td>
                <Td className="whitespace-nowrap text-ink-2">{s.joined ? fmtDate(s.joined, false) : '—'}</Td>
                <Td>
                  <div className="flex items-center gap-1.5">
                    <a href={`${SHOP_URL}/items?seller=${s.id}`} target="_blank" rel="noreferrer" aria-label="View this seller's ads on UKOshop" className="flex h-[26px] w-[26px] items-center justify-center rounded-sm bg-surface text-ink-2 hover:text-primary"><ExternalLink size={13} /></a>
                    <MessageButton usersId={s.id} name={s.store_name || s.name} role="seller" onOpen={msg.open} />
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        )}
        <Pager page={data.page} perPage={data.per_page} total={data.total} onPage={setPage} />
      </Panel>
      {msg.modal}
    </>
  )
}

function SellersReportPanel() {
  const [days, setDays] = useState<Days>(30)
  const { data, err, reload, pager } = useReport<SellersReport>('/shop/reports/sellers', days)
  const msg = useMessenger()
  const t = data?.totals
  return (
    <Panel title="Seller report" sub="From each seller's own order lines on paid orders · cancelled and returned are the seller's own decisions · ranked by sales" action={<WindowSelect value={days} onChange={setDays} />}>
      <ReportLoading err={err} reload={reload}>
        {!data || !t ? <PageLoading /> : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <StatCard label="Sellers with sales" value={num(t.active_sellers)} />
              <StatCard label="Orders" value={num(t.orders)} />
              <StatCard label="Units sold" value={num(t.units)} />
              <StatCard label="Sales" value={ksh(t.sales, { compact: true })} />
              <StatCard label="Cancelled · returned" value={`${t.cancelled} · ${t.returned}`} />
              <StatCard label="Refunded" value={ksh(t.refunds, { compact: true })} />
            </div>
            {data.rows.length === 0 ? (
              <EmptyState icon={<Users size={26} />} title="No sales in this window" sub="Pick a longer window, or wait for the first paid order." />
            ) : (
              <div className="-mx-5 overflow-hidden border-t border-border">
                <Table head={['#', 'Seller', 'Orders', 'Units', 'Sales', 'Cancelled', 'Returned', 'Refunded', 'Positive', '']}>
                  {data.rows.map((r, i) => (
                    <tr key={r.id}>
                      <Td className="text-muted">{i + 1}</Td>
                      <Td>
                        <span className="block font-semibold text-ink">{r.name}</span>
                        <span className="text-[11px] text-muted">{r.email}</span>
                      </Td>
                      <Td className="text-ink-2">{r.orders}</Td>
                      <Td className="text-ink-2">{r.units}</Td>
                      <Td className="whitespace-nowrap font-semibold text-ink">{ksh(r.sales)}</Td>
                      <Td>{r.cancelled ? <Chip size="sm" tone="warning">{r.cancelled}</Chip> : <span className="text-muted">0</span>}</Td>
                      <Td>{r.returned ? <Chip size="sm" tone="danger">{r.returned}</Chip> : <span className="text-muted">0</span>}</Td>
                      <Td className="whitespace-nowrap text-ink-2">{ksh(r.refunds)}</Td>
                      <Td className="text-ink-2">{Math.round(r.positive_rate)}%</Td>
                      <Td><MessageButton usersId={r.id} name={r.name} role="seller" onOpen={msg.open} /></Td>
                    </tr>
                  ))}
                </Table>
                {pager}
              </div>
            )}
          </div>
        )}
      </ReportLoading>
      {msg.modal}
    </Panel>
  )
}

// ---------------------------------------------------------------- Courier tab
type Courier = {
  id: number; users_id: number | null; name: string; phone: string; alt_phone: string; email: string; national_id: string; licence_no: string
  vehicle_type: string; number_plate: string; capacity_kg: number; counties: string[]; classes: string[]; insured: boolean; insurer: string
  insurance_expires: string | null; rating: number; trips: number; days: string[]; start_time: string; end_time: string; is_online: boolean
  status: string; avatar: string; joined: string | null; active_jobs: number; company_email: string; mpesa_number?: string
} & PartnerAccountFields
type CourierApp = {
  id: number; ref: string; users_id: number | null; full_name: string; national_id: string; phone: string; email: string; licence_no: string
  vehicle_type: string; number_plate: string; capacity_kg: number; base_county: string; routes: string[]; classes: string[]; insured: boolean
  insurer: string; insurance_expires: string | null; days: string[]; start_time: string; end_time: string; files: AppFile[]; status: string; created_at: string | null
}
type CourierRow = { id: number; users_id: number | null; name: string; vehicle: string; rating: number; legs: number; delivered: number; in_progress: number; failed: number; earned: number; avg_travel_minutes: number; issues: number }
type CouriersReport = {
  days: number; totals: Record<'legs' | 'delivered' | 'in_progress' | 'failed' | 'earned' | 'issues' | 'drivers' | 'unassigned' | 'avg_travel_minutes', number>
  rows: CourierRow[]; routes: { from: string; to: string; legs: number; fees: number }[]
}
type CourierSub = 'live' | 'drivers' | 'applications' | 'reports'

const CLASS_LABEL: Record<string, string> = { standard: 'Standard', fragile: 'Fragile', bulky: 'Bulky' }
const cap = (s: string) => (s ? s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : '—')
const hours = (m: number) => (m ? (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ''}`.trim() : `${m} min`) : '—')

export function CouriersTab() {
  const [sub, setSub] = useState<CourierSub>('live')
  const liveCount = useLiveCount('courier')
  const [drivers, setDrivers] = useState<number | undefined>(undefined)
  const [pending, setPending] = useState<number | undefined>(undefined)
  return (
    <>
      <DashHeader title="UKO courier" sub="City-to-city drivers who carry loads shelf to shelf · approve new driver applications · the report covers legs, earnings and time on the road" />
      <Tabs<CourierSub>
        tabs={[
          { key: 'live', label: 'Live legs', count: liveCount },
          { key: 'drivers', label: 'Drivers', count: drivers },
          { key: 'applications', label: 'Applications', count: pending },
          { key: 'reports', label: 'Courier report' },
        ]}
        value={sub}
        onChange={setSub}
      />
      {sub === 'live' && <LiveBoard kind="courier" />}
      {sub === 'drivers' && <CouriersPanel onCount={setDrivers} />}
      {sub === 'applications' && <CourierApplicationsPanel onCount={setPending} />}
      {sub === 'reports' && <CouriersReportPanel />}
    </>
  )
}

function CouriersPanel({ onCount }: { onCount: (n: number) => void }) {
  const toast = useToast()
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [removing, setRemoving] = useState<Courier | null>(null)
  const [linking, setLinking] = useState<LinkTarget | null>(null)
  const msg = useMessenger()

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(q.trim()), 300)
    return () => window.clearTimeout(t)
  }, [q])
  const { rows, data, err, reload, pager } = usePaged<Courier, { online: number; backlog?: BacklogSummary }>('/shop/couriers', 'couriers', { q: debouncedQ })
  const actions = usePartnerActions('couriers', reload)
  useEffect(() => {
    if (data && !debouncedQ) onCount(data.total)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.total, debouncedQ])

  if (err && !rows) return <Notice tone="warning" icon={<Truck size={16} />} title="Courier drivers unavailable" action={<Button size="sm" variant="outline" onClick={reload}>Retry</Button>}>{err}</Notice>

  return (
    <>
      <div className="flex flex-col gap-2.5 md:flex-row md:items-center">
        <Input className="md:w-[320px]" placeholder="Search driver, phone, plate or licence" leading={<Search size={15} />} value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="text-xs text-muted">{data ? `${data.total} driver${data.total === 1 ? '' : 's'}` : 'Loading…'}{data?.online ? ` · ${data.online} online now` : ''}</span>
      </div>
      <BacklogNotice kind="couriers" summary={data?.backlog} actions={actions} />
      <Panel padded={false}>
        {!rows ? <PageLoading /> : rows.length === 0 ? (
          <div className="p-5"><EmptyState icon={<Truck size={26} />} title={debouncedQ ? 'No driver matches' : 'No courier drivers yet'} sub={debouncedQ ? 'Try another name, phone or plate.' : 'Approve a courier application to add the first driver.'} /></div>
        ) : (
          <Table head={['Driver', 'Phone', 'Licence', 'Vehicle', 'Routes', 'Classes · cover', 'Rating · trips', 'Legs in hand', 'Status', 'Sign-in · wallet', '']}>
            {rows.map((c) => (
              <tr key={c.id}>
                <Td>
                  <div className="flex items-center gap-2.5">
                    <Avatar name={c.name || 'Driver'} src={c.avatar || undefined} size={36} />
                    <div className="flex min-w-0 flex-col">
                      <span className="font-semibold text-ink">{c.name}</span>
                      <span className="truncate text-[11px] text-muted">{c.company_email || c.email || `since ${c.joined ? fmtDate(c.joined, false) : '—'}`}</span>
                    </div>
                  </div>
                </Td>
                <Td className="whitespace-nowrap text-ink-2">{c.phone || '—'}{c.alt_phone ? <span className="block text-[11px] text-muted">alt {c.alt_phone}</span> : null}</Td>
                <Td className="whitespace-nowrap text-ink-2">{c.licence_no || '—'}<span className="block text-[11px] text-muted">ID {c.national_id || '—'}</span></Td>
                <Td className="whitespace-nowrap text-ink-2">{cap(c.vehicle_type)} · {c.number_plate || 'no plate'}<span className="block text-[11px] text-muted">{num(c.capacity_kg)} kg</span></Td>
                <Td><div className="flex max-w-[220px] flex-wrap gap-1">{c.counties.length ? c.counties.map((k) => <Chip key={k} size="sm">{k}</Chip>) : <span className="text-muted">—</span>}</div></Td>
                <Td>
                  <div className="flex max-w-[180px] flex-wrap gap-1">{c.classes.map((k) => <Chip key={k} size="sm" tone={k === 'standard' ? 'neutral' : 'secondary'}>{CLASS_LABEL[k] || cap(k)}</Chip>)}</div>
                  <span className={cx('mt-1 flex items-center gap-1 text-[11px]', c.insured ? 'text-success' : 'text-muted')}><ShieldCheck size={11} /> {c.insured ? c.insurer || 'Insured' : 'No cover'}</span>
                </Td>
                <Td className="whitespace-nowrap">
                  <span className="flex items-center gap-1 font-semibold text-ink"><Star size={12} className="fill-secondary text-secondary" /> {c.rating ? c.rating.toFixed(1) : '—'}</span>
                  <span className="text-[11px] text-muted">{c.trips} trip{c.trips === 1 ? '' : 's'}</span>
                </Td>
                <Td className="text-center">{c.active_jobs ? <Chip size="sm" tone="primary">{c.active_jobs}</Chip> : <span className="text-muted">0</span>}</Td>
                <Td>
                  <div className="flex flex-col items-start gap-1">
                    <StatusPill status={c.is_online ? 'live' : c.status === 'suspended' ? 'suspended' : 'paused'} label={c.is_online ? 'Online' : c.status === 'suspended' ? 'Suspended' : 'Offline'} />
                  </div>
                </Td>
                <Td><PartnerAccountCell kind="couriers" row={c} actions={actions} onLinkShop={() => setLinking({ id: c.id, name: c.name })} /></Td>
                <Td>
                  <div className="flex items-center gap-1.5">
                    <MessageButton usersId={c.users_id} name={c.name} role="courier" onOpen={msg.open} />
                    <button type="button" onClick={() => setRemoving(c)} aria-label={`Remove ${c.name}`} className="flex h-[26px] w-[26px] items-center justify-center rounded-sm bg-danger-050 text-danger hover:opacity-80"><Trash2 size={13} /></button>
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
      {linking && <LinkAccountModal kind="couriers" target={linking} onClose={() => setLinking(null)} onDone={async () => { setLinking(null); await reload() }} />}
      {removing && (
        <RemoveCourierModal
          courier={removing}
          onClose={() => setRemoving(null)}
          onDone={async () => {
            toast.success(`${removing.name} removed from UKO courier`)
            setRemoving(null)
            await reload()
          }}
        />
      )}
    </>
  )
}

function RemoveCourierModal({ courier, onClose, onDone }: { courier: Courier; onClose: () => void; onDone: () => Promise<void> }) {
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const remove = async () => {
    setErr('')
    setBusy(true)
    try {
      await api.del(`/shop/couriers/${courier.id}`, { confirm })
      await onDone()
    } catch (e: any) {
      setErr(e.message || 'Could not remove the driver')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal onClose={onClose} danger>
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-danger-050 text-danger"><TriangleAlert size={18} /></span>
          <div className="flex flex-col gap-1">
            <h3 className="text-[17px] leading-tight">Remove {courier.name}?</h3>
            <p className="m-0 text-xs leading-relaxed text-ink-2">They lose the courier dashboard and are offered no more legs ({cap(courier.vehicle_type)} · {courier.number_plate || 'no plate'}). A driver with a leg in hand cannot be removed until it is finished.</p>
          </div>
        </div>
        {courier.active_jobs > 0 && <Notice tone="warning" icon={<Truck size={14} />}>{courier.active_jobs} leg{courier.active_jobs === 1 ? ' is' : 's are'} in hand right now.</Notice>}
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

function CourierApplicationsPanel({ onCount }: { onCount: (n: number) => void }) {
  const toast = useToast()
  const [filter, setFilter] = useState<'pending' | 'all'>('pending')
  const [busy, setBusy] = useState<number | null>(null)
  const [approved, setApproved] = useState<{ name: string; account: PartnerAccount } | null>(null)
  const { rows: apps, data, err, reload, pager } = usePaged<CourierApp, { pending: number }>('/shop/courier-applications', 'applications', { status: filter })
  const emails = useCompanyEmails()
  useEffect(() => {
    if (data) onCount(data.pending)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.pending])

  const decide = async (a: CourierApp, action: 'approve' | 'reject') => {
    setBusy(a.id)
    try {
      const r = await api.post<{ account?: PartnerAccount }>(`/shop/courier-applications/${a.id}/${action}`, action === 'approve' ? emails.body(a.id, a.full_name) : undefined)
      toast.success(action === 'approve' ? `${a.full_name} approved — legs on their routes will start coming through` : `Application ${a.ref} rejected`)
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
      title="Courier applications"
      sub="Submitted through Apply to drive on the courier app · open each document, check the licence, logbook and (for fragile loads) goods-in-transit cover, then approve. Approving creates the driver, gives them a courier-app sign-in on their company email and e-mails a set-password link — no UKOshop account needed."
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
        <Notice tone="warning" icon={<FileText size={16} />} title="Courier applications unavailable" action={<Button size="sm" variant="outline" onClick={reload}>Retry</Button>}>{err}</Notice>
      ) : !apps ? <PageLoading /> : apps.length === 0 ? (
        <EmptyState icon={<FileText size={26} />} title={filter === 'pending' ? 'No courier applications waiting' : 'No courier applications yet'} sub="Applications from the courier app's Apply to drive form appear here." />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {apps.map((a) => {
            const open = a.status === 'pending'
            const missing = a.files.filter((f) => f.missing)
            const blocker = missing.length ? `${missing.length} required document${missing.length === 1 ? ' is' : 's are'} missing` : ''
            return (
              <div key={a.id} className={cx('flex flex-col gap-3 rounded-md border bg-bg p-4', open ? 'border-border' : 'border-border/60 opacity-80')}>
                <div className="flex items-start gap-2.5">
                  <Avatar name={a.full_name || 'Applicant'} size={38} />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-head text-sm font-bold text-ink">{a.full_name}</span>
                    <span className="text-[11px] text-muted">{a.ref} · applied {a.created_at ? fmtDate(a.created_at, false) : '—'}</span>
                  </div>
                  <StatusPill status={a.status} />
                </div>
                <div className="grid gap-x-5 gap-y-1.5 text-[12px] text-ink-2 sm:grid-cols-2">
                  <span className="flex items-center gap-2"><IdCard size={13} className="shrink-0 text-muted" /> ID <strong className="text-ink">{a.national_id || '—'}</strong></span>
                  <span className="flex items-center gap-2"><FileText size={13} className="shrink-0 text-muted" /> Licence <strong className="text-ink">{a.licence_no || '—'}</strong></span>
                  <span className="flex items-center gap-2"><Phone size={13} className="shrink-0 text-muted" /> {a.phone || '—'}</span>
                  <span className="flex min-w-0 items-center gap-2"><Mail size={13} className="shrink-0 text-muted" /> <span className="truncate">{a.email || '—'}</span></span>
                  <span className="flex items-center gap-2"><Truck size={13} className="shrink-0 text-muted" /> {cap(a.vehicle_type)} · <strong className="text-ink">{a.number_plate || 'no plate'}</strong> · {num(a.capacity_kg)} kg</span>
                  <span className="flex items-center gap-2"><Clock size={13} className="shrink-0 text-muted" /> {a.days.length ? a.days.join(', ') : 'no days'} · {a.start_time} – {a.end_time}</span>
                  <span className={cx('flex items-center gap-2 sm:col-span-2', a.insured ? 'text-success' : '')}><ShieldCheck size={13} className="shrink-0" /> {a.insured ? `${a.insurer || 'Insured'}${a.insurance_expires ? ` · until ${fmtDate(a.insurance_expires, false)}` : ''}` : 'No goods-in-transit cover'}</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-muted">Routes{a.base_county ? ` · based in ${a.base_county}` : ''}</span>
                  <div className="flex flex-wrap gap-1">{a.routes.length ? a.routes.map((r) => <Chip key={r} size="sm" tone="primary">{r}</Chip>) : <span className="text-[11px] text-muted">No counties listed</span>}{a.classes.map((k) => <Chip key={k} size="sm" tone="secondary">{CLASS_LABEL[k] || cap(k)}</Chip>)}</div>
                </div>
                <DocumentList files={a.files} downloadBase={`/shop/courier-applications/${a.id}/documents`} fallbackName={a.ref} />
                {open && (
                  <div className="mt-auto flex flex-col gap-2">
                    {blocker && <span className="flex items-center gap-1.5 text-[11px] text-muted"><TriangleAlert size={13} /> {blocker}</span>}
                    {!blocker && <CompanyEmailField value={emails.mailbox(a.id, a.full_name)} onChange={(v) => emails.set(a.id, v)} disabled={busy === a.id} />}
                    <div className="grid grid-cols-2 gap-2">
                      <Button size="sm" disabled={!!blocker || !emails.mailbox(a.id, a.full_name) || busy === a.id} loading={busy === a.id} onClick={() => decide(a, 'approve')}>Approve</Button>
                      <Button size="sm" variant="outline" disabled={busy === a.id} onClick={() => decide(a, 'reject')}>Reject</Button>
                    </div>
                  </div>
                )}
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

function CouriersReportPanel() {
  const [days, setDays] = useState<Days>(30)
  const { data, err, reload, pager } = useReport<CouriersReport>('/shop/reports/couriers', days)
  const msg = useMessenger()
  const t = data?.totals
  return (
    <Panel title="Courier report" sub="Legs per driver and how they ended, what delivered legs paid, average time on the road, and how many legs a driver raised with UKO" action={<WindowSelect value={days} onChange={setDays} />}>
      <ReportLoading err={err} reload={reload}>
        {!data || !t ? <PageLoading /> : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
              <StatCard label="Legs" value={num(t.legs)} />
              <StatCard label="Delivered" value={num(t.delivered)} />
              <StatCard label="In progress" value={num(t.in_progress)} />
              <StatCard label="Failed" value={num(t.failed)} />
              <StatCard label="Waiting for a driver" value={num(t.unassigned)} />
              <StatCard label="Earned by drivers" value={ksh(t.earned, { compact: true })} />
              <StatCard label="Avg. time on road" value={hours(t.avg_travel_minutes)} />
            </div>
            {data.routes.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wide text-muted">Busiest routes</span>
                <div className="flex flex-wrap gap-2">
                  {data.routes.map((r) => (
                    <span key={`${r.from}-${r.to}`} className="flex items-center gap-1.5 rounded-sm border border-border bg-surface px-2.5 py-1.5 text-[11px] text-ink-2">
                      <Route size={12} className="text-primary" /> <strong className="text-ink">{r.from || '?'} → {r.to || '?'}</strong> · {r.legs} leg{r.legs === 1 ? '' : 's'} · {ksh(r.fees)}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {data.rows.length === 0 ? (
              <EmptyState icon={<Truck size={26} />} title="No legs in this window" sub="Pick a longer window, or wait for a driver to take the first leg." />
            ) : (
              <div className="-mx-5 overflow-hidden border-t border-border">
                <Table head={['Driver', 'Vehicle', 'Rating', 'Legs', 'Delivered', 'In progress', 'Failed', 'Earned', 'Avg. road time', 'Raised with UKO', '']}>
                  {data.rows.map((r) => (
                    <tr key={r.id}>
                      <Td className="font-semibold text-ink">{r.name}</Td>
                      <Td className="whitespace-nowrap text-ink-2">{cap(r.vehicle)}</Td>
                      <Td className="whitespace-nowrap"><span className="flex items-center gap-1 text-ink"><Star size={12} className="fill-secondary text-secondary" /> {r.rating ? r.rating.toFixed(1) : '—'}</span></Td>
                      <Td className="text-ink-2">{r.legs}</Td>
                      <Td className="text-ink-2">{r.delivered}</Td>
                      <Td className="text-ink-2">{r.in_progress}</Td>
                      <Td>{r.failed ? <Chip size="sm" tone="danger">{r.failed}</Chip> : <span className="text-muted">0</span>}</Td>
                      <Td className="whitespace-nowrap font-semibold text-ink">{ksh(r.earned)}</Td>
                      <Td className="whitespace-nowrap text-ink-2">{hours(r.avg_travel_minutes)}</Td>
                      <Td>{r.issues ? <Chip size="sm" tone="warning">{r.issues}</Chip> : <span className="text-muted">0</span>}</Td>
                      <Td><MessageButton usersId={r.users_id} name={r.name} role="courier" onOpen={msg.open} /></Td>
                    </tr>
                  ))}
                </Table>
                {pager}
              </div>
            )}
          </div>
        )}
      </ReportLoading>
      {msg.modal}
    </Panel>
  )
}

// ---------------------------------------------------------------- Disputes, segmented by category
type Category = 'courier' | 'seller' | 'shelve' | 'delivery' | 'other'
type Dispute = {
  key: string; kind: 'complaint' | 'report' | 'courier'; id: number; category: Category; title: string; body: string; from_name: string; from_email: string
  users_id: number | null; about: string; about_users_id: number | null; status: 'open' | 'resolved'; messages: number; time: string | null
}
type DisputesData = { disputes: Dispute[]; counts: Record<Category | 'all', number> }
type ThreadMsg = { id: number; mine: boolean; sender: string; body: string; attachment: string; time: string | null }

const SEGMENTS: { key: Category | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'courier', label: 'Courier' },
  { key: 'seller', label: 'Seller' },
  { key: 'shelve', label: 'Shelve' },
  { key: 'delivery', label: 'Delivery' },
  { key: 'other', label: 'Other' },
]
const CATEGORY_TONE: Record<Category, 'primary' | 'secondary' | 'warning' | 'success' | 'neutral'> = { courier: 'secondary', seller: 'primary', shelve: 'warning', delivery: 'success', other: 'neutral' }
const SOURCE_LABEL: Record<Dispute['kind'], string> = { complaint: 'Contact form', report: 'Seller report on a shelf', courier: 'Driver → UKO thread' }
/** Who the "Message" button on a dispute reaches besides the person who raised it. */
const ROLE_OF: Record<Category, MessageRole> = { courier: 'courier', seller: 'seller', shelve: 'shelve', delivery: 'delivery', other: 'seller' }

export function DisputesTab() {
  const toast = useToast()
  const [segment, setSegment] = useState<Category | 'all'>('all')
  const [status, setStatus] = useState<'open' | 'all'>('open')
  const [replying, setReplying] = useState<Dispute | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const msg = useMessenger()

  const { rows: disputes, data, err, reload, pager } = usePaged<Dispute, Pick<DisputesData, 'counts'>>('/shop/disputes', 'disputes', { category: segment, status })

  const resolve = async (d: Dispute) => {
    setBusy(d.key)
    try {
      await api.post(`/shop/disputes/${d.kind}/${d.id}/resolve`)
      toast.success(`${d.title} marked resolved`)
      await reload()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <DashHeader title="Disputes" sub="Complaints from the contact form, sellers' reports against shelves and drivers' threads to UKO · segmented by who the dispute concerns" />
      <div className="flex flex-col gap-2.5 md:flex-row md:items-center">
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
          {SEGMENTS.map((s) => (
            <Chip key={s.key} active={segment === s.key} onClick={() => setSegment(s.key)}>
              {s.label}
              {data && <span className="ml-1.5 text-[10px] opacity-70">{data.counts[s.key] ?? 0}</span>}
            </Chip>
          ))}
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value as 'open' | 'all')} className="md:ml-auto md:w-[150px]">
          <option value="open">Open only</option>
          <option value="all">Open and resolved</option>
        </Select>
      </div>

      {err && !disputes ? (
        <Notice tone="warning" icon={<Gavel size={16} />} title="Disputes unavailable" action={<Button size="sm" variant="outline" onClick={reload}>Retry</Button>}>{err}</Notice>
      ) : !disputes ? <PageLoading /> : disputes.length === 0 ? (
        <EmptyState icon={<Gavel size={26} />} title={status === 'open' ? 'Nothing open here' : 'No disputes in this segment'} sub="Complaints, shelf reports and driver threads land here as they come in." />
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {disputes.map((d) => (
            <li key={d.key} className={cx('flex flex-col gap-3 rounded-md border bg-bg p-4', d.status === 'open' ? 'border-border' : 'border-border/60 opacity-80')}>
              <div className="flex flex-col gap-2 md:flex-row md:items-start">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Chip size="sm" tone={CATEGORY_TONE[d.category]}>{SEGMENTS.find((s) => s.key === d.category)?.label}</Chip>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">{SOURCE_LABEL[d.kind]}</span>
                  </div>
                  <span className="font-head text-sm font-bold text-ink">{d.title}</span>
                  <span className="text-[11px] text-ink-2">
                    {d.from_name || 'Anonymous'}{d.from_email ? ` · ${d.from_email}` : ''}{d.about ? ` · ${d.about}` : ''} · {d.time ? timeAgo(d.time) : '—'}
                    {d.kind === 'courier' && ` · ${d.messages} message${d.messages === 1 ? '' : 's'}`}
                  </span>
                </div>
                <StatusPill status={d.status === 'open' ? 'pending' : 'completed'} label={d.status === 'open' ? 'Open' : 'Resolved'} />
              </div>
              {d.body && <p className="m-0 whitespace-pre-line rounded-sm bg-surface px-3 py-2.5 text-[12px] leading-relaxed text-ink">{d.body}</p>}
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" icon={<MessageSquare size={13} />} onClick={() => setReplying(d)} disabled={d.kind !== 'courier' && !d.users_id}>{d.kind === 'courier' ? 'Open thread' : 'Reply'}</Button>
                {d.about_users_id && (
                  <Button size="sm" variant="outline" icon={<Store size={13} />} onClick={() => msg.open({ usersId: d.about_users_id!, name: d.about.split(' · ')[0] || 'Shelf host', role: ROLE_OF[d.category] })}>Message shelf host</Button>
                )}
                {!d.users_id && d.from_email && d.kind === 'complaint' && (
                  <a href={`mailto:${d.from_email}?subject=${encodeURIComponent(`Re: ${d.title}`)}`} className="flex h-[30px] items-center gap-1.5 rounded-sm border border-border px-3 text-[12px] font-semibold text-ink-2 hover:text-primary"><Mail size={13} /> E-mail (no account)</a>
                )}
                {d.status === 'open' && d.kind !== 'report' && (
                  <Button size="sm" variant="outline" icon={<CircleCheck size={13} />} loading={busy === d.key} onClick={() => resolve(d)} className="md:ml-auto">Mark resolved</Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {disputes && disputes.length > 0 && <div className="overflow-hidden rounded-md border border-border bg-bg">{pager}</div>}

      {replying && <ReplyModal dispute={replying} onClose={() => setReplying(null)} onSent={reload} />}
      {msg.modal}
    </>
  )
}

/** A courier leg shows its whole UKO thread and replies into it; a complaint or report replies as a staff message. */
function ReplyModal({ dispute: d, onClose, onSent }: { dispute: Dispute; onClose: () => void; onSent: () => Promise<void> }) {
  const toast = useToast()
  const [thread, setThread] = useState<ThreadMsg[] | null>(d.kind === 'courier' ? null : [])
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const loadThread = () => api.get<ThreadMsg[]>(`/shop/disputes/courier/${d.id}/thread`).then(setThread).catch((e: any) => { setErr(e.message); setThread([]) })
  useEffect(() => {
    if (d.kind === 'courier') loadThread()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.key])

  const send = async () => {
    setErr('')
    if (body.trim().length < 2) return setErr('Write the reply first')
    setBusy(true)
    try {
      await api.post(`/shop/disputes/${d.kind}/${d.id}/reply`, { body: body.trim() })
      toast.success(`Reply sent to ${d.from_name || 'the sender'}`)
      setBody('')
      if (d.kind === 'courier') await loadThread()
      else onClose()
      await onSent()
    } catch (e: any) {
      setErr(e.message || 'Could not send the reply')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={d.kind === 'courier' ? d.title : `Reply · ${d.title}`} onClose={onClose} wide>
      <div className="flex flex-col gap-3.5">
        {d.kind === 'courier' ? (
          <div className="flex max-h-[300px] flex-col gap-2 overflow-y-auto rounded-sm bg-surface p-3">
            {!thread ? <span className="text-[11px] text-muted">Loading the thread…</span> : thread.length === 0 ? <span className="text-[11px] text-muted">No messages.</span> : thread.map((m) => (
              <div key={m.id} className={cx('flex max-w-[85%] flex-col gap-1 rounded-md px-3 py-2', m.mine ? 'self-end bg-primary-050' : 'self-start border border-border bg-bg')}>
                <span className="text-[10px] text-muted">{m.mine ? 'UKO support' : m.sender || 'Driver'} · {fmtDate(m.time)}</span>
                <p className="m-0 whitespace-pre-line text-[12px] leading-relaxed text-ink">{m.body}</p>
                {m.attachment && <a href={m.attachment} target="_blank" rel="noreferrer" className="text-[11px] font-semibold text-primary">View attachment</a>}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-sm bg-surface px-3 py-2.5 text-[12px] text-ink-2">
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted">{d.from_name} wrote</span>
            <p className="m-0 mt-1 whitespace-pre-line text-ink">{d.body}</p>
          </div>
        )}
        <Textarea label={d.kind === 'courier' ? 'Reply on the thread' : 'Your reply'} rows={4} maxLength={1000} value={body} onChange={(e) => setBody(e.target.value)} hint={d.kind === 'courier' ? 'The driver sees it on this leg in the courier app' : 'Delivered in the app and by push, SMS and e-mail'} />
        {err && <Notice tone="danger" icon={<TriangleAlert size={14} />}>{err}</Notice>}
        <div className="flex gap-2.5">
          <Button variant="outline" className="flex-1" onClick={onClose}>Close</Button>
          <Button className="flex-1" icon={<Send size={14} />} loading={busy} onClick={send}>Send reply</Button>
        </div>
      </div>
    </Modal>
  )
}


// ---------------------------------------------------------------- Revenue: what UKO itself keeps, stream by stream
// GET /shop/reports/revenue/{overview|shelves|delivery|courier|protect|marketing|boosts|prompts} (admin/back-end/app/routers/revenue.py).
// Figures are money the shop has already booked. Withdrawal fees count once M-PESA has paid the withdrawal out.
type RevenueSub = 'overview' | 'shelves' | 'delivery' | 'courier' | 'protect' | 'marketing' | 'boosts' | 'prompts'
const REVENUE_TABS: { key: RevenueSub; label: string }[] = [
  { key: 'overview', label: 'Revenue' },
  { key: 'shelves', label: 'Shelve revenue' },
  { key: 'delivery', label: 'Delivery revenue' },
  { key: 'courier', label: 'Courier revenue' },
  { key: 'protect', label: 'UKO Protect' },
  { key: 'marketing', label: 'Marketing (notifications)' },
  { key: 'boosts', label: 'Boost packages' },
  { key: 'prompts', label: 'AI prompts' },
]

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0)

type Segment = { key: string; label: string; amount: number; className: string }

/** One horizontal bar of where a sum of money went, with a legend underneath. */
function SplitBar({ title, note, whole, segments }: { title: ReactNode; note?: ReactNode; whole: number; segments: Segment[] }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-[13px] font-semibold text-ink">{title}</span>
        {note && <span className="text-xs text-muted">{note}</span>}
      </div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface" role="img" aria-label={segments.map((s) => `${s.label} ${ksh(s.amount)}`).join(', ')}>
        {segments.map((s) => s.amount > 0 && <span key={s.key} className={cx('h-full', s.className)} style={{ width: `${pct(s.amount, whole)}%` }} />)}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1.5">
        {segments.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-xs text-ink-2">
            <span className={cx('h-2.5 w-2.5 rounded-full', s.className)} />
            {s.label} <strong className="text-ink">{ksh(s.amount)}</strong> <span className="text-muted">{pct(s.amount, whole)} %</span>
          </span>
        ))}
      </div>
    </div>
  )
}

/** Withdrawal fees still waiting on M-PESA: not earned yet, so shown apart from the totals. */
function PendingFees({ amount, who }: { amount: number; who: string }) {
  if (!amount) return null
  return (
    <Notice tone="info" icon={<Clock size={16} />}>
      {ksh(amount)} more in {who} withdrawal fees is waiting for M-PESA to pay those withdrawals out. It counts once they are paid.
    </Notice>
  )
}

export function RevenueTab() {
  const [sub, setSub] = useState<RevenueSub>('overview')
  const [days, setDays] = useState<Days>(30)
  return (
    <>
      <DashHeader title="Revenue" sub="What UKO keeps from each part of UKOshop · money the shop has already booked" actions={<WindowSelect value={days} onChange={setDays} />} />
      <Tabs<RevenueSub> tabs={REVENUE_TABS} value={sub} onChange={setSub} />
      {sub === 'overview' && <RevenueOverview days={days} onOpen={setSub} />}
      {sub === 'shelves' && <ShelveRevenue days={days} />}
      {sub === 'delivery' && <DeliveryRevenue days={days} />}
      {sub === 'courier' && <CourierRevenue days={days} />}
      {sub === 'protect' && <ProtectRevenue days={days} />}
      {sub === 'marketing' && <MarketingRevenue days={days} />}
      {sub === 'boosts' && <BoostRevenue days={days} />}
      {sub === 'prompts' && <PromptRevenue days={days} />}
    </>
  )
}

// ---------------------------------------------------------------- overview
type Stream = { key: RevenueSub | 'other'; label: string; amount: number; detail: string }
type RevenueOverviewData = {
  days: Days; total: number; streams: Stream[]; pending_withdrawal_fees: number; in_escrow: number
  other: { direct_commission: number; legacy_packages: number; seller_withdrawal_fees: number }
  trip_commission: { rider: number; rider_delivery: number; rider_pickup: number; courier: number; pct: number }
  withdrawal_fees: {
    pct: number
    rows: { role: string; label: string; earned: number; earned_count: number; pending: number; pending_count: number }[]
  }
}
const STREAM_COLOR: Record<string, string> = {
  shelves: 'bg-success', delivery: 'bg-warning', courier: 'bg-primary-600', marketing: 'bg-secondary', boosts: 'bg-primary', prompts: 'bg-danger', protect: 'bg-primary-300', other: 'bg-border-strong',
}

function RevenueOverview({ days, onOpen }: { days: Days; onOpen: (s: RevenueSub) => void }) {
  const [data, setData] = useState<RevenueOverviewData | null>(null)
  const [err, setErr] = useState('')
  const load = async () => {
    try {
      setData(await api.get<RevenueOverviewData>('/shop/reports/revenue/overview', { days }))
      setErr('')
    } catch (e: any) {
      setErr(e.message || 'Could not load the report')
    }
  }
  useEffect(() => {
    setData(null)
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days])

  return (
    <Panel title="All revenue" sub="Each stream is what UKO keeps after paying shelf hosts, riders, drivers and messaging providers">
      <ReportLoading err={err} reload={load}>
        {!data ? <PageLoading /> : (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label="UKO revenue" value={ksh(data.total)} />
              <StatCard label="Biggest stream" value={[...data.streams].sort((a, b) => b.amount - a.amount)[0]?.label || '—'} />
              <StatCard label="Withdrawal fees pending" value={ksh(data.pending_withdrawal_fees)} />
              <StatCard label="Delivery + courier in escrow" value={ksh(data.in_escrow)} />
            </div>
            <SplitBar title={`Where ${ksh(data.total)} came from`} whole={data.total}
              segments={data.streams.map((s) => ({ key: s.key, label: s.label, amount: s.amount, className: STREAM_COLOR[s.key] || 'bg-border-strong' }))} />
            {/* UKO's cut of every trip. Already inside the Delivery and Courier streams, so it is shown here, not added to the total. */}
            <div className="flex flex-col gap-2 rounded-md bg-surface px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-[13px] font-semibold text-ink">Trip commission · {data.trip_commission.pct} % of every trip</span>
                <span className="text-xs text-muted">Included in Delivery and Courier above</span>
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="flex flex-col"><span className="text-[11px] text-muted">Riders · deliveries</span><span className="font-semibold text-ink">{ksh(data.trip_commission.rider_delivery)}</span></div>
                <div className="flex flex-col"><span className="text-[11px] text-muted">Riders · item to shelf</span><span className="font-semibold text-ink">{ksh(data.trip_commission.rider_pickup)}</span></div>
                <div className="flex flex-col"><span className="text-[11px] text-muted">Courier legs</span><span className="font-semibold text-ink">{ksh(data.trip_commission.courier)}</span></div>
                <div className="flex flex-col"><span className="text-[11px] text-muted">Total</span><span className="font-head text-[15px] font-extrabold text-ink">{ksh(data.trip_commission.rider + data.trip_commission.courier)}</span></div>
              </div>
            </div>
            {/* UKO's cut when money leaves an earnings wallet. Earned fees are already in the streams (sellers under Other);
                pending ones are waiting for M-PESA to pay the withdrawal out and are not counted anywhere yet. */}
            <div className="flex flex-col gap-2 rounded-md bg-surface px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-[13px] font-semibold text-ink">Withdrawal fees · {data.withdrawal_fees.pct} % of every withdrawal to M-PESA</span>
                <span className="text-xs text-muted">Earned fees are included in the streams above</span>
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                {data.withdrawal_fees.rows.map((r) => (
                  <div key={r.role} className="flex flex-col">
                    <span className="text-[11px] text-muted">{r.label} · {num(r.earned_count)}</span>
                    <span className="font-semibold text-ink">{ksh(r.earned)}</span>
                    {r.pending > 0 && <span className="text-[11px] text-warning">+{ksh(r.pending)} pending · {num(r.pending_count)}</span>}
                  </div>
                ))}
                <div className="flex flex-col">
                  <span className="text-[11px] text-muted">Total earned</span>
                  <span className="font-head text-[15px] font-extrabold text-ink">{ksh(data.withdrawal_fees.rows.reduce((a, r) => a + r.earned, 0))}</span>
                  {data.pending_withdrawal_fees > 0 && <span className="text-[11px] text-warning">+{ksh(data.pending_withdrawal_fees)} awaiting M-PESA</span>}
                </div>
              </div>
            </div>
            <div className="-mx-5 overflow-hidden border-t border-border">
              <Table head={['Stream', 'UKO keeps', 'Share', 'What it is', '']}>
                {data.streams.map((s) => (
                  <tr key={s.key}>
                    <Td><span className="flex items-center gap-2 font-semibold text-ink"><span className={cx('h-2.5 w-2.5 rounded-full', STREAM_COLOR[s.key])} />{s.label}</span></Td>
                    <Td className="whitespace-nowrap font-semibold text-ink">{ksh(s.amount)}</Td>
                    <Td className="text-ink-2">{pct(s.amount, data.total)} %</Td>
                    <Td className="text-ink-2">{s.detail}</Td>
                    <Td>{s.key !== 'other' && <Button size="sm" variant="outline" onClick={() => onOpen(s.key as RevenueSub)}>Open</Button>}</Td>
                  </tr>
                ))}
              </Table>
            </div>
            <span className="text-xs text-muted">
              Other: seller withdrawal fees {ksh(data.other.seller_withdrawal_fees)} ·
              commission on direct sales {ksh(data.other.direct_commission)} · legacy Pro packages {ksh(data.other.legacy_packages)}.
              Money for undelivered orders stays in escrow and is not counted until the order is settled.
            </span>
          </div>
        )}
      </ReportLoading>
    </Panel>
  )
}

// ---------------------------------------------------------------- shelves
type ShelveRevenueRow = { id: number; name: string; ward: string; county: string; orders: number; sales: number; host_share: number; uko: number }
type ShelveRevenueReport = {
  days: Days; rows: ShelveRevenueRow[]
  totals: { orders: number; sales: number; host_share: number; commission: number; withdrawal_fees: number; withdrawal_fees_pending: number; uko_total: number }
}

function ShelveRevenue({ days }: { days: Days }) {
  const { data, err, reload, pager } = useReport<ShelveRevenueReport>('/shop/reports/revenue/shelves', days)
  const t = data?.totals
  const commission = t ? t.host_share + t.commission : 0
  return (
    <Panel title="Shelve revenue" sub="Items sold through a shelf pay 20 % commission: the shelf host gets 15 points of the item price, UKO keeps 5. Storage is free.">
      <ReportLoading err={err} reload={reload}>
        {!data || !t ? <PageLoading /> : (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label="UKO keeps" value={ksh(t.uko_total)} />
              <StatCard label="Shelf sales" value={ksh(t.sales, { compact: true })} />
              <StatCard label="Paid to shelf hosts" value={ksh(t.host_share)} />
              <StatCard label="Shelf withdrawal fees" value={ksh(t.withdrawal_fees)} />
            </div>
            <SplitBar title={`Where the ${ksh(commission)} commission went`} note={`${num(t.orders)} settled order${t.orders === 1 ? '' : 's'}`} whole={commission}
              segments={[
                { key: 'host', label: 'Shelf hosts (15 points)', amount: t.host_share, className: 'bg-success' },
                { key: 'uko', label: 'UKO (5 points)', amount: t.commission, className: 'bg-primary' },
              ]} />
            <PendingFees amount={t.withdrawal_fees_pending} who="shelf host" />
            {data.rows.length === 0 ? (
              <EmptyState icon={<Store size={26} />} title="No shelf sales settled in this window" sub="Commission is earned when the buyer collects and escrow is released." />
            ) : (
              <div className="-mx-5 overflow-hidden border-t border-border">
                <Table head={['Shelf', 'Location', 'Orders', 'Sales', 'Host share', 'UKO keeps']}>
                  {data.rows.map((r) => (
                    <tr key={r.id}>
                      <Td><span className="font-semibold text-ink">{r.name}</span></Td>
                      <Td className="text-ink-2">{[r.ward, r.county].filter(Boolean).join(' · ') || '—'}</Td>
                      <Td className="text-ink-2">{r.orders}</Td>
                      <Td className="whitespace-nowrap text-ink-2">{ksh(r.sales)}</Td>
                      <Td className="whitespace-nowrap text-ink-2">{ksh(r.host_share)}</Td>
                      <Td className="whitespace-nowrap font-semibold text-ink">{ksh(r.uko)}</Td>
                    </tr>
                  ))}
                </Table>
                {pager}
              </div>
            )}
          </div>
        )}
      </ReportLoading>
    </Panel>
  )
}

// ---------------------------------------------------------------- delivery
type TripRow = { kind: 'delivery' | 'pickup'; ref: string; time: string | null; status: string; charged: number; rider_paid: number; uko: number }
type DeliveryRevenueReport = {
  days: Days; rows: TripRow[]
  totals: {
    orders: number; charged: number; rider_paid: number; margin: number
    pickup_trips: number; pickup_fees: number; pickup_rider_paid: number; pickup_held: number; pickup_refunded: number; pickup_uko: number; pickup_legacy: number
    commission_delivery: number; commission_pickup: number; commission_pct: number
    withdrawal_fees: number; withdrawal_fees_pending: number; in_escrow: number; uko_total: number
  }
}

function DeliveryRevenue({ days }: { days: Days }) {
  const { data, err, reload, pager } = useReport<DeliveryRevenueReport>('/shop/reports/revenue/delivery', days)
  const t = data?.totals
  return (
    <Panel title="Delivery revenue" sub="UKO keeps 10 % of every rider trip: deliveries to buyers and item-to-shelf pick-ups. Riders get the rest when the trip is done. Plus the 10 % rider withdrawal fee.">
      <ReportLoading err={err} reload={reload}>
        {!data || !t ? <PageLoading /> : (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label="UKO keeps" value={ksh(t.uko_total)} />
              <StatCard label={`${t.commission_pct} % of rider trips`} value={ksh(t.commission_delivery + t.commission_pickup)} />
              <StatCard label={`Item-to-shelf trips · ${num(t.pickup_trips)}`} value={ksh(t.pickup_fees)} />
              <StatCard label="Rider withdrawal fees" value={ksh(t.withdrawal_fees)} />
            </div>
            <SplitBar title={`Where ${ksh(t.charged)} of buyers' delivery fees went`} note={`${num(t.orders)} settled order${t.orders === 1 ? '' : 's'} · ${ksh(t.in_escrow)} still in escrow`} whole={t.charged}
              segments={[
                { key: 'riders', label: 'Riders', amount: t.rider_paid, className: 'bg-warning' },
                { key: 'uko', label: 'UKO', amount: Math.max(0, t.margin), className: 'bg-primary' },
              ]} />
            {t.pickup_fees > 0 && (
              <SplitBar title={`Where ${ksh(t.pickup_fees)} of item-to-shelf trip fees went`} whole={t.pickup_fees}
                note="A rider is paid when the shelf checks the item in; a withdrawn trip goes back to the seller"
                segments={[
                  { key: 'rider', label: 'Riders', amount: t.pickup_rider_paid, className: 'bg-warning' },
                  { key: 'uko', label: 'UKO', amount: t.pickup_uko, className: 'bg-primary' },
                  { key: 'held', label: 'Held for riders', amount: t.pickup_held, className: 'bg-border-strong' },
                  { key: 'refunded', label: 'Refunded to sellers', amount: t.pickup_refunded, className: 'bg-surface-2' },
                ]} />
            )}
            {t.pickup_legacy > 0 && (
              <Notice tone="info" icon={<AlertCircle size={16} />}>
                {ksh(t.pickup_legacy)} of trips were paid before rider pick-up jobs existed and never got a rider, so UKO kept them.
              </Notice>
            )}
            <PendingFees amount={t.withdrawal_fees_pending} who="rider" />
            {data.rows.length === 0 ? (
              <EmptyState icon={<Truck size={26} />} title="No rider trips in this window" sub="Pick a longer window." />
            ) : (
              <div className="-mx-5 overflow-hidden border-t border-border">
                <Table head={['Trip', 'Date', 'Status', 'Paid by buyer / seller', 'Paid to rider', 'UKO keeps']}>
                  {data.rows.map((r) => (
                    <tr key={`${r.kind}-${r.ref}`}>
                      <Td>
                        <span className="block font-semibold text-ink">{r.ref}</span>
                        <span className="text-[11px] text-muted">{r.kind === 'pickup' ? 'Item to shelf' : 'Delivery to buyer'}</span>
                      </Td>
                      <Td className="whitespace-nowrap text-ink-2">{r.time ? fmtDate(r.time, false) : '—'}</Td>
                      <Td className="text-ink-2">{r.status}</Td>
                      <Td className="whitespace-nowrap text-ink-2">{ksh(r.charged)}</Td>
                      <Td className="whitespace-nowrap text-ink-2">{ksh(r.rider_paid)}</Td>
                      <Td className={cx('whitespace-nowrap font-semibold', r.uko < 0 ? 'text-danger' : 'text-ink')}>{ksh(r.uko)}</Td>
                    </tr>
                  ))}
                </Table>
                {pager}
              </div>
            )}
          </div>
        )}
      </ReportLoading>
    </Panel>
  )
}

// ---------------------------------------------------------------- courier
type LegRow = { order_no: string; time: string | null; legs: number; charged: number; drivers_paid: number; uko: number }
type CourierRevenueReport = {
  days: Days; rows: LegRow[]
  totals: {
    orders: number; legs: number; charged: number; drivers_paid: number; margin: number; commission: number; commission_pct: number
    withdrawal_fees: number; withdrawal_fees_pending: number; in_escrow: number; uko_total: number
  }
}

function CourierRevenue({ days }: { days: Days }) {
  const { data, err, reload, pager } = useReport<CourierRevenueReport>('/shop/reports/revenue/courier', days)
  const t = data?.totals
  return (
    <Panel title="Courier revenue" sub="UKO keeps 10 % of every courier leg: drivers get the rest when the load is handed over at the far shelf. On settled orders, plus the 10 % courier withdrawal fee.">
      <ReportLoading err={err} reload={reload}>
        {!data || !t ? <PageLoading /> : (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label="UKO keeps" value={ksh(t.uko_total)} />
              <StatCard label={`${t.commission_pct} % of courier legs`} value={ksh(t.commission)} />
              <StatCard label="Legs settled" value={num(t.legs)} />
              <StatCard label="Courier withdrawal fees" value={ksh(t.withdrawal_fees)} />
            </div>
            <SplitBar title={`Where ${ksh(t.charged)} of courier fees went`} note={`${num(t.orders)} settled order${t.orders === 1 ? '' : 's'} · ${ksh(t.in_escrow)} still in escrow`} whole={t.charged}
              segments={[
                { key: 'drivers', label: 'Courier drivers', amount: t.drivers_paid, className: 'bg-primary-600' },
                { key: 'uko', label: 'UKO', amount: Math.max(0, t.margin), className: 'bg-primary' },
              ]} />
            <PendingFees amount={t.withdrawal_fees_pending} who="courier" />
            {data.rows.length === 0 ? (
              <EmptyState icon={<Route size={26} />} title="No courier orders settled in this window" sub={t.in_escrow ? `${ksh(t.in_escrow)} in courier fees is still in escrow on orders not yet collected.` : 'Pick a longer window.'} />
            ) : (
              <div className="-mx-5 overflow-hidden border-t border-border">
                <Table head={['Order', 'Date', 'Legs', 'Buyer paid', 'Paid to drivers', 'UKO keeps']}>
                  {data.rows.map((r) => (
                    <tr key={r.order_no}>
                      <Td><span className="font-semibold text-ink">{r.order_no}</span></Td>
                      <Td className="whitespace-nowrap text-ink-2">{r.time ? fmtDate(r.time, false) : '—'}</Td>
                      <Td className="text-ink-2">{r.legs}</Td>
                      <Td className="whitespace-nowrap text-ink-2">{ksh(r.charged)}</Td>
                      <Td className="whitespace-nowrap text-ink-2">{ksh(r.drivers_paid)}</Td>
                      <Td className={cx('whitespace-nowrap font-semibold', r.uko < 0 ? 'text-danger' : 'text-ink')}>{ksh(r.uko)}</Td>
                    </tr>
                  ))}
                </Table>
                {pager}
              </div>
            )}
          </div>
        )}
      </ReportLoading>
    </Panel>
  )
}

// ---------------------------------------------------------------- marketing (messaging packages, push split)
type MarketingTotals = {
  packages: number; gross: number; push_revenue: number; push_mpesa_fee: number; push_net: number; other_revenue: number
  other_uko: number; other_tools: number; uko_total: number; push_units_sold: number; push_units_sent: number; legacy_packages: number
}
type MarketingRow = {
  id: number; time: string | null; seller: string; seller_id: number; bundle: string; method: string; gross: number
  push_units: number; push_revenue: number; push_mpesa_fee: number; uko_share: number; tools_budget: number; legacy: boolean
}
type MarketingReport = { days: Days; totals: MarketingTotals; rows: MarketingRow[] }

function MarketingRevenue({ days }: { days: Days }) {
  const { data, err, reload, pager } = useReport<MarketingReport>('/shop/reports/revenue/marketing', days)
  const t = data?.totals
  return (
    <>
      <Panel title="Marketing (notifications)" sub="Messaging packages sellers bought · push notifications are 100 % UKO, every other channel is split 45 % UKO / 55 % tools budget">
        <ReportLoading err={err} reload={reload}>
          {!data || !t ? <PageLoading /> : (
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <StatCard label="Push revenue · 100 % UKO" value={ksh(t.push_revenue)} />
                <StatCard label="M-PESA fee on push" value={ksh(t.push_mpesa_fee)} />
                <StatCard label="Push kept by UKO" value={ksh(t.push_net)} />
                <StatCard label="Push units sold · sent" value={`${num(t.push_units_sold)} · ${num(t.push_units_sent)}`} />
              </div>
              <SplitBar title={`Where ${ksh(t.gross)} of package money went`} whole={t.gross}
                note={`${num(t.packages)} package${t.packages === 1 ? '' : 's'} · UKO keeps ${ksh(t.uko_total)} (${pct(t.uko_total, t.gross)} %)`}
                segments={[
                  { key: 'push', label: 'Push → UKO (100 %)', amount: t.push_revenue, className: 'bg-secondary' },
                  { key: 'uko', label: 'Other channels → UKO (45 %)', amount: t.other_uko, className: 'bg-primary' },
                  { key: 'tools', label: 'Other channels → tools budget (55 %)', amount: t.other_tools, className: 'bg-border-strong' },
                ]} />
              <div className="-mx-5 overflow-hidden border-t border-border">
                <Table head={['Channel', 'Revenue', 'To UKO', 'To tools budget', 'Provider behind it']}>
                  <tr>
                    <Td><span className="flex items-center gap-2 font-semibold text-ink"><BellRing size={14} className="text-secondary" /> Push notifications</span></Td>
                    <Td className="whitespace-nowrap text-ink-2">{ksh(t.push_revenue)}</Td>
                    <Td className="whitespace-nowrap font-semibold text-ink">{ksh(t.push_revenue)} <span className="text-[11px] font-normal text-muted">100 %</span></Td>
                    <Td className="whitespace-nowrap text-muted">KSh 0</Td>
                    <Td className="text-ink-2">None. Browsers' own push services, no fee. Only M-PESA's {ksh(t.push_mpesa_fee)} on the money in.</Td>
                  </tr>
                  <tr>
                    <Td><span className="flex items-center gap-2 font-semibold text-ink"><Send size={14} className="text-primary" /> SMS · e-mail · WhatsApp · posts</span></Td>
                    <Td className="whitespace-nowrap text-ink-2">{ksh(t.other_revenue)}</Td>
                    <Td className="whitespace-nowrap font-semibold text-ink">{ksh(t.other_uko)} <span className="text-[11px] font-normal text-muted">{pct(t.other_uko, t.other_revenue)} %</span></Td>
                    <Td className="whitespace-nowrap text-ink-2">{ksh(t.other_tools)} <span className="text-[11px] text-muted">{pct(t.other_tools, t.other_revenue)} %</span></Td>
                    <Td className="text-ink-2">Africa's Talking, AWS SES, Meta, X, plus the M-PESA fee</Td>
                  </tr>
                </Table>
              </div>
              {t.legacy_packages > 0 && (
                <Notice tone="info" icon={<AlertCircle size={16} />}>
                  {num(t.legacy_packages)} package{t.legacy_packages === 1 ? ' was' : 's were'} bought before push was booked to UKO whole. They carry no push revenue and are counted under the other channels.
                </Notice>
              )}
            </div>
          )}
        </ReportLoading>
      </Panel>

      <Panel title="Packages" sub="Newest first · every paid package in the window, 20 a page" padded={false}>
        {!data ? <div className="p-5"><PageLoading /></div> : data.rows.length === 0 ? (
          <div className="p-5"><EmptyState icon={<Coins size={26} />} title="No paid packages in this window" sub="Pick a longer window, or wait for a seller to buy messaging units." /></div>
        ) : (
          <Table head={['Date', 'Seller', 'Bundle', 'Paid by', 'Price', 'Push units', 'Push → UKO', 'UKO total', 'Tools budget']}>
            {data.rows.map((r) => (
              <tr key={r.id}>
                <Td className="whitespace-nowrap text-ink-2">{r.time ? fmtDate(r.time, false) : '—'}</Td>
                <Td><span className="font-semibold text-ink">{r.seller}</span></Td>
                <Td className="text-ink-2">{r.bundle ? r.bundle.replace(/^\w/, (c) => c.toUpperCase()) : '—'}{r.legacy && <span className="block text-[11px] text-muted">before push split</span>}</Td>
                <Td className="text-ink-2">{r.method === 'wallet' ? 'Wallet' : 'M-PESA'}</Td>
                <Td className="whitespace-nowrap font-semibold text-ink">{ksh(r.gross)}</Td>
                <Td className="text-ink-2">{r.push_units ? num(r.push_units) : <span className="text-muted">0</span>}</Td>
                <Td className="whitespace-nowrap">{r.push_revenue ? <Chip size="sm" tone="secondary">{ksh(r.push_revenue)}</Chip> : <span className="text-muted">—</span>}</Td>
                <Td className="whitespace-nowrap text-ink">{ksh(r.uko_share)}</Td>
                <Td className="whitespace-nowrap text-ink-2">{ksh(r.tools_budget)}</Td>
              </tr>
            ))}
          </Table>
        )}
        {pager}
      </Panel>
    </>
  )
}

// ---------------------------------------------------------------- boost packages
type BoostChannel = { channel: string; label: string; amount: number; boosts: number }
type BoostRow = { id: number; time: string | null; seller: string; method: string; amount: number; channels: string[] }
type BoostRevenueReport = { days: Days; totals: { boosts: number; uko_total: number }; channels: BoostChannel[]; rows: BoostRow[] }
const BOOST_COLOR: Record<string, string> = { shop: 'bg-primary', carousel: 'bg-secondary', adsite: 'bg-success', other: 'bg-border-strong' }

function BoostRevenue({ days }: { days: Days }) {
  const { data, err, reload, pager } = useReport<BoostRevenueReport>('/shop/reports/revenue/boosts', days)
  const t = data?.totals
  return (
    <Panel title="Boost packages" sub="Boosts are 100 % UKO: search and carousel days per county, ad-site views per 1,000. An ad bill's shelf-trip fee is left out here, it counts under delivery.">
      <ReportLoading err={err} reload={reload}>
        {!data || !t ? <PageLoading /> : (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label="UKO keeps · 100 %" value={ksh(t.uko_total)} />
              <StatCard label="Boosts paid" value={num(t.boosts)} />
              <StatCard label="Average boost" value={ksh(t.boosts ? t.uko_total / t.boosts : 0)} />
              <StatCard label="Top channel" value={data.channels[0]?.label || '—'} />
            </div>
            <SplitBar title={`Where ${ksh(t.uko_total)} of boosts ran`} whole={t.uko_total}
              segments={data.channels.map((c) => ({ key: c.channel, label: c.label, amount: c.amount, className: BOOST_COLOR[c.channel] || 'bg-border-strong' }))} />
            {data.rows.length === 0 ? (
              <EmptyState icon={<Star size={26} />} title="No boosts paid in this window" sub="Pick a longer window." />
            ) : (
              <div className="-mx-5 overflow-hidden border-t border-border">
                <Table head={['Date', 'Seller', 'Ran on', 'Paid by', 'UKO keeps']}>
                  {data.rows.map((r) => (
                    <tr key={r.id}>
                      <Td className="whitespace-nowrap text-ink-2">{r.time ? fmtDate(r.time, false) : '—'}</Td>
                      <Td><span className="font-semibold text-ink">{r.seller}</span></Td>
                      <Td className="text-ink-2">{r.channels.join(' · ') || '—'}</Td>
                      <Td className="text-ink-2">{r.method === 'wallet' ? 'Wallet' : 'M-PESA'}</Td>
                      <Td className="whitespace-nowrap font-semibold text-ink">{ksh(r.amount)}</Td>
                    </tr>
                  ))}
                </Table>
                {pager}
              </div>
            )}
          </div>
        )}
      </ReportLoading>
    </Panel>
  )
}

// ---------------------------------------------------------------- AI prompts
type PromptRow = { id: number; time: string | null; seller: string; method: string; prompts: number; amount: number }
type PromptRevenueReport = {
  days: Days; rows: PromptRow[]
  totals: { packs: number; prompts: number; uko_total: number; sellers: number; per_prompt: number; mpesa: number; wallet: number }
}

function PromptRevenue({ days }: { days: Days }) {
  const { data, err, reload, pager } = useReport<PromptRevenueReport>('/shop/reports/revenue/prompts', days)
  const t = data?.totals
  return (
    <Panel title="AI prompts" sub="Image prompt packs sellers buy to generate product photos. All of it is booked to UKO: the image provider's cost per image is not recorded, so it is not taken off here.">
      <ReportLoading err={err} reload={reload}>
        {!data || !t ? <PageLoading /> : (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label="UKO keeps" value={ksh(t.uko_total)} />
              <StatCard label="Packs sold" value={num(t.packs)} />
              <StatCard label="Prompts sold" value={num(t.prompts)} />
              <StatCard label="Per prompt" value={ksh(t.per_prompt)} />
            </div>
            <SplitBar title={`How ${ksh(t.uko_total)} was paid`} note={`${num(t.sellers)} seller${t.sellers === 1 ? '' : 's'}`} whole={t.uko_total}
              segments={[
                { key: 'mpesa', label: 'M-PESA', amount: t.mpesa, className: 'bg-success' },
                { key: 'wallet', label: 'Wallet', amount: t.wallet, className: 'bg-primary' },
              ]} />
            {data.rows.length === 0 ? (
              <EmptyState icon={<ImageIcon size={26} />} title="No prompt packs sold in this window" sub="Pick a longer window." />
            ) : (
              <div className="-mx-5 overflow-hidden border-t border-border">
                <Table head={['Date', 'Seller', 'Prompts', 'Paid by', 'UKO keeps']}>
                  {data.rows.map((r) => (
                    <tr key={r.id}>
                      <Td className="whitespace-nowrap text-ink-2">{r.time ? fmtDate(r.time, false) : '—'}</Td>
                      <Td><span className="font-semibold text-ink">{r.seller}</span></Td>
                      <Td className="text-ink-2">{r.prompts || '—'}</Td>
                      <Td className="text-ink-2">{r.method === 'wallet' ? 'Wallet' : 'M-PESA'}</Td>
                      <Td className="whitespace-nowrap font-semibold text-ink">{ksh(r.amount)}</Td>
                    </tr>
                  ))}
                </Table>
                {pager}
              </div>
            )}
          </div>
        )}
      </ReportLoading>
    </Panel>
  )
}

// ---------------------------------------------------------------- partner accounts (shelves, riders and courier drivers)
// Partners sign in to their own app (shelves / delivery / courier) with the company email assigned on approval — no
// UKOshop account needed — and are paid into their partner wallet (wallets.partner_id) whether or not they are linked
// to a shop account. GET /shop/{kind} gives each row `has_account`, `password_set`, `shop_linked`, `wallet` and
// `unpaid` (finished work that never reached the wallet, from before partner wallets) plus a `backlog` summary.
// POST /shop/{kind}/{id}/account/link (re-)sends the set-password link, POST /shop/{kind}/{id}/pay-owed pays the
// backlog, and POST /shop/{kind}/{id}/link optionally links a shop account (admin/back-end routers shop.py / shop_ops.py).
export type PartnerKind = 'riders' | 'couriers' | 'shelves'
export type UnpaidTrips = { trips: number; fees: number; owed: number; name?: string; removed?: boolean }
/** The `backlog` block of the list response — the count key is `riders`, `couriers` or `shelves`. */
export type BacklogSummary = { riders?: number; couriers?: number; shelves?: number; trips: number; owed: number; pct: number; list: (UnpaidTrips & { id: number })[] }
export type LinkTarget = { id: number; name: string }
/** What approving an application or re-sending the link answers: `link` only when the e-mail was not sent. */
export type PartnerAccount = { email: string; link_sent: boolean; link?: string }
/** The account fields every partner list row carries. */
export type PartnerAccountFields = {
  has_account?: boolean; password_set?: boolean; account_email?: string; last_login_at?: string | null
  shop_linked?: boolean; wallet?: number; unpaid?: UnpaidTrips | null; company_email?: string
}

const PARTNER_WORDS: Record<PartnerKind, { one: string; many: string; trip: string; trips: string; wallet: string; app: string; basis: string }> = {
  riders: { one: 'rider', many: 'riders', trip: 'trip', trips: 'trips', wallet: 'rider wallet', app: 'the delivery app', basis: "trip fees less UKO's 10 %" },
  couriers: { one: 'courier driver', many: 'courier drivers', trip: 'leg', trips: 'legs', wallet: 'courier wallet', app: 'the courier app', basis: "leg fees less UKO's 10 %" },
  shelves: { one: 'shelf', many: 'shelves', trip: 'sale', trips: 'sales', wallet: 'shelf wallet', app: 'the shelves app', basis: 'its 15-point commission share plus barter inspection fees' },
}
const LINK_INTRO = 'Optional. Partners sign in with their company email and are paid into their partner wallet either way. Linking a UKOshop account only lets it spend that wallet on UKO services in the shop (boosts, ad posting, messaging, AI prompts) and receive shop notifications.'

/** The result of creating / re-issuing a partner's sign-in: e-mailed, or the link to hand over with a copy button. */
export function AccountLinkResult({ account }: { account: PartnerAccount }) {
  const toast = useToast()
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(account.link || '')
      toast.success('Set-password link copied')
    } catch {
      toast.alert('Could not copy — select the link and copy it by hand')
    }
  }
  if (account.link_sent) {
    return <Notice tone="success" icon={<Mail size={16} />} title={`Set-password link e-mailed to ${account.email}`}>It works once and expires in 72 hours.</Notice>
  }
  return (
    <Notice tone="warning" icon={<Mail size={16} />} title={`The link could not be e-mailed to ${account.email}`}>
      Hand this set-password link to the partner yourself. It works once and expires in 72 hours.
      <span className="mt-2 flex items-center gap-2">
        <input readOnly value={account.link || ''} onFocus={(e) => e.currentTarget.select()} aria-label="Set-password link"
          className="min-w-0 flex-1 rounded-sm border border-border bg-bg px-2 py-1 font-mono text-[11px] text-ink" />
        <Button size="sm" variant="outline" icon={<Copy size={12} />} onClick={copy}>Copy</Button>
      </span>
    </Notice>
  )
}

/** Shown after approving an application or sending a link. */
export function AccountResultModal({ title, account, onClose }: { title: string; account: PartnerAccount; onClose: () => void }) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <AccountLinkResult account={account} />
        <p className="m-0 text-xs leading-relaxed text-ink-2">They sign in with {account.email}, their password and a code e-mailed to that address. No UKOshop account is needed.</p>
        <Button onClick={onClose}>Done</Button>
      </div>
    </Modal>
  )
}

type PartnerRef = { id: number; name: string; company_email?: string }

/** Row actions shared by the shelf, rider and courier lists: send the set-password link, pay what is owed. */
export function usePartnerActions(kind: PartnerKind, reload: () => void | Promise<void>) {
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const [result, setResult] = useState<{ name: string; account: PartnerAccount } | null>(null)
  const [asking, setAsking] = useState<PartnerRef | null>(null)
  const [mailbox, setMailbox] = useState('')
  const w = PARTNER_WORDS[kind]

  const sendLink = async (p: PartnerRef, companyEmail?: string) => {
    if (!p.company_email && !companyEmail) {
      setMailbox(suggestCompanyMailbox(p.name))
      setAsking(p)
      return
    }
    setBusy(`link-${p.id}`)
    try {
      const r = await api.post<{ account: PartnerAccount }>(`/shop/${kind}/${p.id}/account/link`, companyEmail ? { company_email: companyEmail } : undefined)
      setAsking(null)
      setResult({ name: p.name, account: r.account })
      await reload()
    } catch (e: any) {
      toast.error(e.message || 'Could not send the set-password link')
    } finally {
      setBusy(null)
    }
  }

  const payOwed = async (p: PartnerRef) => {
    setBusy(`pay-${p.id}`)
    try {
      const r = await api.post<{ paid: { trips: number; amount: number } }>(`/shop/${kind}/${p.id}/pay-owed`)
      toast.success(r.paid.trips
        ? `${ksh(r.paid.amount)} for ${r.paid.trips} ${r.paid.trips === 1 ? w.trip : w.trips} paid into ${p.name}'s ${w.wallet}`
        : `${p.name} is owed nothing`)
      await reload()
    } catch (e: any) {
      toast.error(e.message || 'Could not pay')
    } finally {
      setBusy(null)
    }
  }

  const modal = (
    <>
      {result && <AccountResultModal title={`${result.name} · sign-in`} account={result.account} onClose={() => setResult(null)} />}
      {asking && (
        <Modal title={`Assign ${asking.name} a company email`} onClose={() => setAsking(null)}>
          <div className="flex flex-col gap-4">
            <p className="m-0 text-xs leading-relaxed text-ink-2">This {w.one} was approved before company emails. The company email is their sign-in to {w.app}; the set-password link goes there.</p>
            <CompanyEmailField value={mailbox} onChange={(v) => setMailbox(v.trim().toLowerCase().replace(/@.*$/, ''))} disabled={busy === `link-${asking.id}`} />
            <div className="flex gap-2.5">
              <Button variant="outline" className="flex-1" onClick={() => setAsking(null)}>Cancel</Button>
              <Button className="flex-1" disabled={!mailbox} loading={busy === `link-${asking.id}`} onClick={() => sendLink(asking, `${mailbox}@${COMPANY_EMAIL_DOMAIN}`)}>Assign and send link</Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
  return { sendLink, payOwed, busy, modal }
}

/** A partner row's sign-in and money state: account chip, "Send set-password link", wallet, owed, optional shop link. */
export function PartnerAccountCell({ kind, row, actions, onLinkShop }: {
  kind: PartnerKind; row: PartnerAccountFields & PartnerRef; actions: ReturnType<typeof usePartnerActions>; onLinkShop: () => void
}) {
  const w = PARTNER_WORDS[kind]
  const signIn = !row.has_account
    ? <Chip size="sm" tone="danger">No sign-in yet</Chip>
    : row.password_set
      ? <Chip size="sm" tone="success">Password set</Chip>
      : <Chip size="sm" tone="warning">Password not set</Chip>
  return (
    <div className="flex flex-col items-start gap-1">
      <span title={row.account_email || row.company_email || 'No company email'}>{signIn}</span>
      <Button size="sm" variant="outline" icon={<Send size={12} />} loading={actions.busy === `link-${row.id}`} onClick={() => actions.sendLink(row)}
        title={`E-mail a 72-hour set-password link to ${row.company_email || 'their company email'}`}>
        {row.password_set ? 'Send reset link' : 'Send set-password link'}
      </Button>
      {typeof row.wallet === 'number' && <span className="text-[11px] text-muted">{w.wallet} {ksh(row.wallet)}</span>}
      {row.unpaid && row.unpaid.trips > 0 && (
        <Button size="sm" variant="outline" icon={<Coins size={12} />} loading={actions.busy === `pay-${row.id}`} onClick={() => actions.payOwed(row)}
          title={`${row.unpaid.trips} finished ${row.unpaid.trips === 1 ? w.trip : w.trips} never reached the ${w.wallet} (${w.basis})`}>
          Pay {ksh(row.unpaid.owed)} owed
        </Button>
      )}
      {row.shop_linked
        ? <span className="text-[11px] text-muted" title="Can spend the partner wallet on UKO services in the shop">Shop account linked</span>
        : <button type="button" onClick={onLinkShop} className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"><Users size={11} /> Link shop account (optional)</button>}
    </div>
  )
}

/** The banner over a partner list: finished work that never reached a partner wallet, with a pay button each. */
export function BacklogNotice({ kind, summary, actions }: { kind: PartnerKind; summary?: BacklogSummary | null; actions: ReturnType<typeof usePartnerActions> }) {
  const count = summary ? (summary.riders ?? summary.couriers ?? summary.shelves ?? 0) : 0
  if (!summary || !count) return null
  const w = PARTNER_WORDS[kind]
  return (
    <Notice tone="warning" icon={<Coins size={16} />} title={`${count} ${count === 1 ? w.one : w.many} ${count === 1 ? 'is' : 'are'} owed for finished ${w.trips} that never reached the ${w.wallet}`}>
      {summary.trips} settled {summary.trips === 1 ? w.trip : w.trips} come to {ksh(summary.owed)} ({w.basis}) — from before partners were paid without a shop account.
      Pay each into their {w.wallet}; nothing is paid twice.
      <span className="mt-1.5 flex flex-wrap gap-1.5">
        {summary.list.map((r) => (
          <button key={r.id} type="button" disabled={actions.busy === `pay-${r.id}`} onClick={() => actions.payOwed({ id: r.id, name: r.name || `#${r.id}` })} title={`Pay ${r.name}`}>
            <Chip size="sm" tone="warning">
              {r.name}{r.removed ? ' (removed)' : ''} · {r.trips} {r.trips === 1 ? w.trip : w.trips} · {ksh(r.owed)} · Pay
            </Chip>
          </button>
        ))}
      </span>
    </Notice>
  )
}

type AccountCandidate = { id: number; name: string; email: string; telephone: string; match: string; linked_to: string | null }
type CandidatesData = { rider?: { phone: string; email: string }; courier?: { phone: string; email: string }; shelf?: { phone: string; email: string }; unpaid: UnpaidTrips | null; accounts: AccountCandidate[] }

/** Optionally link a partner to a UKOshop account. Accounts sharing their phone or e-mail are suggested; anything else
 *  is found by search. Anything they were never paid is paid into their partner wallet as well. */
export function LinkAccountModal({ kind, target, onClose, onDone }: { kind: PartnerKind; target: LinkTarget; onClose: () => void; onDone: () => Promise<void> }) {
  const toast = useToast()
  const w = PARTNER_WORDS[kind]
  const [q, setQ] = useState('')
  const [data, setData] = useState<CandidatesData | null>(null)
  const [picked, setPicked] = useState<AccountCandidate | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    const t = window.setTimeout(() => {
      api.get<CandidatesData>(`/shop/${kind}/${target.id}/account-candidates`, { q: q.trim() })
        .then((d) => { setData(d); setErr('') })
        .catch((e: any) => setErr(e.message || 'Could not search accounts'))
    }, 300)
    return () => window.clearTimeout(t)
  }, [kind, target.id, q])

  const link = async () => {
    if (!picked) return
    setErr('')
    setBusy(true)
    try {
      const r = await api.post<{ paid: { trips: number; amount: number } }>(`/shop/${kind}/${target.id}/link`, { users_id: picked.id })
      toast.success(r.paid.trips
        ? `${target.name} is linked to ${picked.email} · ${ksh(r.paid.amount)} for ${r.paid.trips} ${r.paid.trips === 1 ? w.trip : w.trips} paid into the ${w.wallet}`
        : `${target.name} is linked to ${picked.email}`)
      await onDone()
    } catch (e: any) {
      setErr(e.message || 'Could not link the account')
    } finally {
      setBusy(false)
    }
  }

  const who = data?.rider ?? data?.courier ?? data?.shelf
  const unpaid = data?.unpaid
  return (
    <Modal onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="text-[17px] leading-tight">Link {target.name} to a UKOshop account</h3>
          <p className="m-0 text-xs leading-relaxed text-ink-2">
            {LINK_INTRO}
            {who ? ` On file: ${[who.phone, who.email].filter(Boolean).join(' · ') || 'no phone or e-mail'}.` : ''}
          </p>
        </div>
        {unpaid && unpaid.trips > 0 && (
          <Notice tone="info">
            {ksh(unpaid.owed)} for {unpaid.trips} settled {unpaid.trips === 1 ? w.trip : w.trips} never reached the {w.wallet} ({w.basis}); linking pays it there too.
          </Notice>
        )}
        <Input placeholder="Search name, e-mail or phone" leading={<Search size={15} />} value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="flex max-h-[260px] flex-col gap-1.5 overflow-y-auto">
          {!data ? <span className="text-[11px] text-muted">Looking for matching accounts…</span>
            : data.accounts.length === 0 ? <span className="text-[11px] text-muted">{q.trim() ? 'No account matches that search.' : `No account shares this ${w.one}'s phone or e-mail. Search for one.`}</span>
            : data.accounts.map((a) => {
              const taken = !!a.linked_to
              return (
                <button key={a.id} type="button" disabled={taken} onClick={() => setPicked(a)}
                  className={cx('flex items-center gap-2.5 rounded-sm border px-3 py-2 text-left text-[12px] transition-colors',
                    picked?.id === a.id ? 'border-primary bg-primary-050' : 'border-border hover:bg-surface',
                    taken && 'cursor-not-allowed opacity-60')}>
                  <Avatar name={a.name || a.email} size={30} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-semibold text-ink">{a.name || 'No name'} <span className="font-normal text-muted">#{a.id}</span></span>
                    <span className="truncate text-muted">{[a.email, a.telephone].filter(Boolean).join(' · ')}</span>
                  </span>
                  {a.match && <Chip size="sm" tone="success">{a.match}</Chip>}
                  {taken && <Chip size="sm" tone="warning">linked: {a.linked_to}</Chip>}
                </button>
              )
            })}
        </div>
        {err && <Notice tone="danger">{err}</Notice>}
        <div className="flex gap-2.5">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" disabled={!picked} loading={busy} onClick={link}>{picked ? `Link to ${picked.email || `#${picked.id}`}` : 'Pick an account'}</Button>
        </div>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------- UKO Protect
type ProtectRow = { id: number; order_no: string; time: string | null; subtotal: number; fee: number; rate_pct: number; claim: number }
type ProtectReport = {
  days: Days; rows: ProtectRow[]
  totals: { orders: number; sales: number; collected: number; claims: number; claims_paid: number; reserve: number; loss_ratio_pct: number; effective_rate_pct: number; in_escrow: number; uko_total: number }
}

function ProtectRevenue({ days }: { days: Days }) {
  const { data, err, reload, pager } = useReport<ProtectReport>('/shop/reports/revenue/protect', days)
  const t = data?.totals
  return (
    <Panel title="UKO Protect" sub="The fee buyers pay at checkout (1 % of each item, KSh 20 minimum an order, KSh 500 maximum a unit) against the loss claims paid out of it. It pays for the goods-in-transit cover and the loss reserve, so it is not profit.">
      <ReportLoading err={err} reload={reload}>
        {!data || !t ? <PageLoading /> : (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label="Collected" value={ksh(t.collected)} />
              <StatCard label="Claims paid" value={ksh(t.claims_paid)} />
              <StatCard label="Reserve left" value={ksh(t.reserve)} />
              <StatCard label="Loss ratio" value={`${t.loss_ratio_pct} %`} />
            </div>
            <SplitBar title={`Where the ${ksh(t.collected)} collected went`} note={`${num(t.orders)} settled order${t.orders === 1 ? '' : 's'} · ${t.effective_rate_pct} % of ${ksh(t.sales, { compact: true })} sales`} whole={t.collected}
              segments={[
                { key: 'claims', label: `Claims paid · ${num(t.claims)}`, amount: t.claims_paid, className: 'bg-danger' },
                { key: 'reserve', label: 'Reserve', amount: Math.max(0, t.reserve), className: 'bg-success' },
              ]} />
            {t.reserve < 0 && (
              <Notice tone="warning" icon={<TriangleAlert size={16} />}>Claims have paid out {ksh(-t.reserve)} more than Protect collected in this window. Raise the rate or claim on the goods-in-transit policy.</Notice>
            )}
            {t.in_escrow > 0 && (
              <Notice tone="info" icon={<Clock size={16} />}>{ksh(t.in_escrow)} more in Protect fees is on orders still in escrow. It counts once those orders are settled.</Notice>
            )}
            {data.rows.length === 0 ? (
              <EmptyState icon={<ShieldCheck size={26} />} title="No Protect fees settled in this window" sub="The fee is booked when the buyer collects and escrow is released." />
            ) : (
              <div className="-mx-5 overflow-hidden border-t border-border">
                <Table head={['Date', 'Order', 'Item value', 'Rate', 'Protect fee', 'Claim paid']}>
                  {data.rows.map((r) => (
                    <tr key={r.id}>
                      <Td className="whitespace-nowrap text-ink-2">{r.time ? fmtDate(r.time, false) : '—'}</Td>
                      <Td><span className="font-semibold text-ink">{r.order_no}</span></Td>
                      <Td className="whitespace-nowrap text-ink-2">{ksh(r.subtotal)}</Td>
                      <Td className="text-ink-2">{r.rate_pct ? `${r.rate_pct} %` : '—'}</Td>
                      <Td className="whitespace-nowrap font-semibold text-ink">{ksh(r.fee)}</Td>
                      <Td className={cx('whitespace-nowrap', r.claim ? 'font-semibold text-danger' : 'text-muted')}>{r.claim ? ksh(r.claim) : '—'}</Td>
                    </tr>
                  ))}
                </Table>
                {pager}
              </div>
            )}
          </div>
        )}
      </ReportLoading>
    </Panel>
  )
}
