/**
 * UKOapp → Producers and Payouts: blockbuster rights holders' accounts (uko.producers). Staff create an account — it gets
 * an account number (UKP-123456) and a set-password link for the producers web-app — review title claims against the
 * proof-of-ownership documents, and finance pay producers' payment requests. There is no direct withdrawal: a producer
 * requests an amount to a bank account, finance transfers it by hand and records it paid with the reference and date.
 */
import { useEffect, useState } from 'react'
import { Banknote, Check, Copy, ExternalLink, FileText, KeyRound, Mail, Plus, Search, Trash2, Users, X } from 'lucide-react'
import { api } from '#/lib/api'
import { useAuth } from '#/lib/auth'
import { useToast } from '#/lib/toast'
import { fmtDate, ksh, num } from '#/lib/format'
import type { Producer, ProducerAccountResult, ProducerDetail, ProducerPayout, ProducerTitle } from '#/lib/types'
import { Button, Chip, EmptyState, Input, KeyValue, Notice, PageLoading, Select, StatCard, Textarea } from './ui'
import { Panel, Table, Td } from './dashboard'
import { Modal, Thumb, useDebounced, usePaged } from './console'

type TitlePick = { kind: 'movie' | 'tv'; tmdb_id: number; title: string; rights_region: string; poster?: string; year?: string }
type Preset = { name?: string; contact_name?: string; email?: string; phone?: string; titles?: TitlePick[] }

const STATUS_TONE: Record<string, 'neutral' | 'primary' | 'success' | 'warning' | 'danger'> = {
  pending: 'warning', approved: 'success', verified: 'success', rejected: 'danger', withdrawn: 'neutral', requested: 'warning',
  paid: 'success', cancelled: 'neutral', active: 'success', suspended: 'danger',
}
const DOC_LABEL: Record<string, string> = {
  ownership: 'Proof of ownership', distribution: 'Distribution rights', registration: 'Company registration', tax: 'Tax (KRA PIN / TIN)',
  id: 'ID of the signatory', other: 'Other',
}

export function useIsFinance() {
  const { staff } = useAuth()
  return ['admin', 'finance'].includes((staff?.role || '').toLowerCase())
}

// ------------------------------------------------------------------ list
export function ProducersPanel() {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  const dq = useDebounced(q)
  const { rows, err, pager, reload } = usePaged<Producer>('/ukoapp/producers', 'producers', { q: dq })
  return (
    <>
      <Panel title="Producers" sub="Rights holders of blockbuster titles. They sign in to the producers app with their account number."
        padded={false} action={<Button size="sm" icon={<Plus size={14} />} onClick={() => setCreating(true)}>New producer</Button>}>
        <div className="border-b border-border p-3">
          <Input placeholder="Search name, account number or email" value={q} onChange={(e) => setQ(e.target.value)} leading={<Search size={14} />} />
        </div>
        {err ? <div className="p-5"><Notice tone="danger">{err}</Notice></div> : !rows ? <PageLoading /> : rows.length === 0 ? (
          <div className="p-5"><EmptyState icon={<Users size={24} />} title="No producers yet"
            sub="Create one from a blockbuster's outreach once the rights holder has agreed, or here." /></div>
        ) : (
          <>
            <Table head={['Producer', 'Account', 'Titles', 'Earned', 'Balance', 'To review', 'Status']}>
              {rows.map((p) => {
                const todo = p.queue.claims + p.queue.documents + p.queue.payouts
                return (
                  <tr key={p.id} className="cursor-pointer hover:bg-surface" onClick={() => setOpen(p.id)}>
                    <Td>
                      <div className="flex flex-col">
                        <span className="font-semibold text-ink">{p.name}</span>
                        <span className="text-xs text-muted">{p.contact_name ? `${p.contact_name} · ` : ''}{p.email}</span>
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap font-mono text-xs text-ink">{p.account_no}</Td>
                    <Td className="text-ink-2">{num(p.titles || 0)}</Td>
                    <Td className="whitespace-nowrap text-ink-2">{ksh(p.money.earned_ksh)}</Td>
                    <Td className="whitespace-nowrap font-semibold text-ink">{ksh(p.money.balance_ksh)}</Td>
                    <Td>{todo ? <Chip size="sm" tone="warning">{todo}</Chip> : <span className="text-xs text-muted">—</span>}</Td>
                    <Td>
                      <div className="flex flex-col gap-1">
                        <Chip size="sm" tone={STATUS_TONE[p.status]}>{p.status}</Chip>
                        {!p.password_set && <span className="text-[11px] text-warning">No password yet</span>}
                      </div>
                    </Td>
                  </tr>
                )
              })}
            </Table>
            {pager}
          </>
        )}
      </Panel>
      {creating && <CreateProducerModal onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); reload(); setOpen(id) }} />}
      {open !== null && <ProducerModal id={open} onClose={() => setOpen(null)} onChanged={reload} />}
    </>
  )
}

// ------------------------------------------------------------------ title search
function TitleSearch({ onPick, exclude }: { onPick: (t: TitlePick) => void; exclude: TitlePick[] }) {
  const [q, setQ] = useState('')
  const dq = useDebounced(q)
  const [results, setResults] = useState<TitlePick[]>([])
  useEffect(() => {
    if (dq.trim().length < 2) { setResults([]); return }
    api.get<{ results: (TitlePick & { poster: string; year: string })[] }>('/ukoapp/catalogue', { q: dq })
      .then((r) => setResults(r.results.map((x) => ({ ...x, rights_region: 'Kenya' })))).catch(() => setResults([]))
  }, [dq])
  const shown = results.filter((r) => !exclude.some((e) => e.kind === r.kind && e.tmdb_id === r.tmdb_id))
  return (
    <div className="flex flex-col gap-2">
      <Input placeholder="Search UKO's catalogue to add a title" value={q} onChange={(e) => setQ(e.target.value)} leading={<Search size={14} />} />
      {shown.length > 0 && (
        <div className="flex max-h-48 flex-col divide-y divide-border overflow-y-auto rounded-md border border-border">
          {shown.map((r) => (
            <button key={`${r.kind}-${r.tmdb_id}`} type="button" className="flex items-center gap-3 px-3 py-2 text-left hover:bg-surface"
              onClick={() => { onPick(r); setQ('') }}>
              <Thumb src={r.poster} size={32} />
              <span className="flex-1 text-[13px] text-ink">{r.title}<span className="text-xs text-muted"> · {r.kind === 'tv' ? 'Series' : 'Movie'}{r.year ? ` · ${r.year}` : ''}</span></span>
              <Plus size={14} className="text-primary" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ create
export function CreateProducerModal({ preset, onClose, onCreated }: { preset?: Preset; onClose: () => void; onCreated: (id: number) => void }) {
  const toast = useToast()
  const [form, setForm] = useState({ name: preset?.name || '', contact_name: preset?.contact_name || '', email: preset?.email || '',
                                     phone: preset?.phone || '', country: 'Kenya', address: '', notes: '' })
  const [titles, setTitles] = useState<TitlePick[]>(preset?.titles || [])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [result, setResult] = useState<ProducerAccountResult | null>(null)
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value })

  const submit = async () => {
    setBusy(true)
    setErr('')
    try {
      const r = await api.post<ProducerAccountResult>('/ukoapp/producers', {
        ...form, titles: titles.map(({ kind, tmdb_id, rights_region }) => ({ kind, tmdb_id, rights_region })),
      })
      setResult(r)
      toast.success(`Account ${r.account_no} created`)
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (result) {
    return (
      <Modal title="Producer account created" onClose={() => onCreated(result.id!)}>
        <div className="flex flex-col gap-4">
          <AccountResult result={result} />
          <Button onClick={() => onCreated(result.id!)}>Open the producer</Button>
        </div>
      </Modal>
    )
  }
  return (
    <Modal title="New producer" onClose={onClose} wide>
      <form className="flex flex-col gap-3.5" onSubmit={(e) => { e.preventDefault(); submit() }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Company / rights holder" required value={form.name} onChange={set('name')} />
          <Input label="Contact person" value={form.contact_name} onChange={set('contact_name')} />
          <Input label="Email" type="email" required hint="Sign-in codes and the set-password link go here" value={form.email} onChange={set('email')} />
          <Input label="Phone" value={form.phone} onChange={set('phone')} />
          <Input label="Country" value={form.country} onChange={set('country')} />
          <Input label="Address" value={form.address} onChange={set('address')} />
        </div>
        <Textarea label="Notes (staff only)" rows={2} value={form.notes} onChange={set('notes')} />
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold">Titles</span>
          <p className="m-0 text-xs text-ink-2">Each starts as a claim to review. It earns once you approve it against an approved proof-of-ownership document, and then earns every view since the first.</p>
          {titles.map((t, i) => (
            <div key={`${t.kind}-${t.tmdb_id}`} className="flex items-center gap-2 rounded-md border border-border p-2">
              <span className="flex-1 text-[13px] font-semibold text-ink">{t.title}<span className="text-xs font-normal text-muted"> · {t.kind === 'tv' ? 'Series' : 'Movie'}</span></span>
              <input className="w-36 rounded-sm border border-border bg-bg px-2 py-1 text-xs" value={t.rights_region} aria-label="Territory"
                onChange={(e) => setTitles(titles.map((x, j) => (j === i ? { ...x, rights_region: e.target.value } : x)))} />
              <button type="button" aria-label="Remove" className="p-1 text-ink-2 hover:text-danger" onClick={() => setTitles(titles.filter((_, j) => j !== i))}><X size={14} /></button>
            </div>
          ))}
          <TitleSearch exclude={titles} onPick={(t) => setTitles([...titles, t])} />
        </div>
        {err && <Notice tone="danger">{err}</Notice>}
        <Button type="submit" full loading={busy} icon={<Plus size={15} />}>Create account and send the link</Button>
      </form>
    </Modal>
  )
}

function AccountResult({ result }: { result: ProducerAccountResult }) {
  const toast = useToast()
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`${what} copied`)
    } catch {
      toast.alert('Could not copy — select it and copy it by hand')
    }
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between rounded-md bg-surface px-4 py-3">
        <div className="flex flex-col"><span className="text-xs text-ink-2">Account number</span>
          <span className="font-mono text-xl font-extrabold tracking-wider text-primary">{result.account_no}</span></div>
        <Button size="sm" variant="outline" icon={<Copy size={12} />} onClick={() => copy(result.account_no, 'Account number')}>Copy</Button>
      </div>
      {result.link_sent ? (
        <Notice tone="success" icon={<Mail size={16} />} title={`Account number and set-password link e-mailed to ${result.email}`}>The link works once and expires in 72 hours.</Notice>
      ) : (
        <Notice tone="warning" icon={<Mail size={16} />} title={`Nothing could be e-mailed to ${result.email}`}>
          Give the producer the account number and this set-password link yourself. It works once and expires in 72 hours.
          <span className="mt-2 flex items-center gap-2">
            <input readOnly value={result.link || ''} onFocus={(e) => e.currentTarget.select()} aria-label="Set-password link"
              className="min-w-0 flex-1 rounded-sm border border-border bg-bg px-2 py-1 font-mono text-[11px] text-ink" />
            <Button size="sm" variant="outline" icon={<Copy size={12} />} onClick={() => copy(result.link || '', 'Link')}>Copy</Button>
          </span>
        </Notice>
      )}
      <p className="m-0 text-xs text-ink-2">They sign in with the account number, their password and a code e-mailed to {result.email}.</p>
    </div>
  )
}

// ------------------------------------------------------------------ one producer
function ProducerModal({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => void }) {
  const toast = useToast()
  const [p, setP] = useState<ProducerDetail | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState('')
  const [link, setLink] = useState<ProducerAccountResult | null>(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ name: '', contact_name: '', email: '', phone: '', country: '', address: '', notes: '' })
  const [adding, setAdding] = useState(false)

  const load = () => api.get<ProducerDetail>(`/ukoapp/producers/${id}`).then((x) => {
    setP(x)
    setForm({ name: x.name, contact_name: x.contact_name, email: x.email, phone: x.phone, country: x.country, address: x.address, notes: x.notes })
  }).catch((e) => setErr(e.message))
  useEffect(() => { load() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key)
    try {
      await fn()
      if (ok) toast.success(ok)
      await load()
      onChanged()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy('')
    }
  }
  const review = (path: string, status: string, needsReason: boolean, what: string) => {
    const note = needsReason ? window.prompt(`Why is this ${what} ${status}? The producer sees this.`) : ''
    if (needsReason && !note?.trim()) return
    act(`${path}-${status}`, () => api.put(path, { status, note: note || '' }), `${what[0].toUpperCase()}${what.slice(1)} ${status}`)
  }
  const reissue = () => act('link', async () => setLink(await api.post<ProducerAccountResult>(`/ukoapp/producers/${id}/link`)), '')

  if (err) return <Modal title="Producer" onClose={onClose}><Notice tone="danger">{err}</Notice></Modal>
  if (!p) return <Modal title="Producer" onClose={onClose}><PageLoading /></Modal>
  const docsFor = (t: ProducerTitle | null) => p.documents.filter((d) => (t ? d.title_id === t.id : d.title_id === null))

  return (
    <Modal title={p.name} onClose={onClose} wide>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-bold text-primary">{p.account_no}</span>
          <Chip size="sm" tone={STATUS_TONE[p.status]}>{p.status}</Chip>
          {p.password_set ? <Chip size="sm" tone="success">Password set</Chip> : <Chip size="sm" tone="warning">No password yet</Chip>}
          {p.last_login_at && <span className="text-xs text-muted">Last sign-in {fmtDate(p.last_login_at)}</span>}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatCard label="Views (approved titles)" value={num(p.money.views)} />
          <StatCard label="Earned" value={ksh(p.money.earned_ksh)} />
          <StatCard label="Paid out" value={ksh(p.money.paid_ksh)} />
          <StatCard label="Balance" value={ksh(p.money.balance_ksh)} />
        </div>

        {link && <AccountResult result={link} />}

        {/* ---------------- profile */}
        <section className="flex flex-col gap-3 rounded-md border border-border p-4">
          <div className="flex items-center justify-between">
            <h4 className="m-0 text-sm font-bold">Account</h4>
            {!editing && <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Edit</Button>}
          </div>
          {editing ? (
            <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); act('save', () => api.put(`/ukoapp/producers/${id}`, form), 'Saved').then(() => setEditing(false)) }}>
              <div className="grid gap-3 sm:grid-cols-2">
                {(['name', 'contact_name', 'email', 'phone', 'country', 'address'] as const).map((k) => (
                  <Input key={k} label={k.replace('_', ' ').replace(/^\w/, (c) => c.toUpperCase())} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
                ))}
              </div>
              <Textarea label="Notes (staff only)" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" type="button" onClick={() => setEditing(false)}>Cancel</Button>
                <Button size="sm" type="submit" loading={busy === 'save'}>Save</Button>
              </div>
            </form>
          ) : (
            <div className="flex flex-col gap-1.5">
              <KeyValue label="Contact" value={p.contact_name || '—'} />
              <KeyValue label="Email" value={p.email} />
              <KeyValue label="Phone" value={p.phone || '—'} />
              <KeyValue label="Country" value={p.country || '—'} />
              {p.notes && <p className="m-0 mt-1 whitespace-pre-wrap text-xs text-ink-2">{p.notes}</p>}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {p.status === 'active' && <Button size="sm" variant="outline" icon={<KeyRound size={13} />} loading={busy === 'link'} onClick={reissue}>Send a set-password link</Button>}
            {p.status === 'active'
              ? <Button size="sm" variant="danger" loading={busy === 'status'} onClick={() => window.confirm(`Suspend ${p.name}? They are signed out and cannot sign in or request payouts.`) && act('status', () => api.put(`/ukoapp/producers/${id}`, { status: 'suspended' }), 'Producer suspended')}>Suspend</Button>
              : <Button size="sm" variant="outline" loading={busy === 'status'} onClick={() => act('status', () => api.put(`/ukoapp/producers/${id}`, { status: 'active' }), 'Producer reactivated')}>Reactivate</Button>}
          </div>
        </section>

        {/* ---------------- titles + their documents */}
        <section className="flex flex-col gap-3 rounded-md border border-border p-4">
          <div className="flex items-center justify-between">
            <h4 className="m-0 text-sm font-bold">Titles</h4>
            <Button size="sm" variant="ghost" icon={<Plus size={13} />} onClick={() => setAdding(!adding)}>Add a title</Button>
          </div>
          {adding && <TitleSearch exclude={p.titles.filter((t) => ['pending', 'approved'].includes(t.status))}
            onPick={(t) => act('add', () => api.post(`/ukoapp/producers/${id}/titles`, { kind: t.kind, tmdb_id: t.tmdb_id, rights_region: t.rights_region }), `${t.title} added as a claim`).then(() => setAdding(false))} />}
          {p.titles.length === 0 && <p className="m-0 text-xs text-muted">No titles yet.</p>}
          {p.titles.map((t) => (
            <div key={t.id} className="flex flex-col gap-2 rounded-md bg-surface p-3">
              <div className="flex items-start gap-3">
                <Thumb src={t.poster} size={44} />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[13px] font-semibold text-ink">{t.title} <span className="font-normal text-muted">· {t.kind === 'tv' ? 'Series' : 'Movie'} · {t.rights_region || 'territory not given'}</span></span>
                  <span className="text-xs text-ink-2">{t.submitted_by === 'staff' ? 'Added by staff' : 'Claimed by the producer'} {fmtDate(t.created_at, false)}{t.note ? ` · ${t.note}` : ''}</span>
                  {t.stats && <span className="text-xs text-ink-2">{num(t.stats.views)} views · earned {ksh(t.stats.producer_ksh)}</span>}
                </div>
                <Chip size="sm" tone={STATUS_TONE[t.status]}>{t.status}</Chip>
              </div>
              <DocumentRows docs={docsFor(t)} busy={busy} onReview={review} />
              {t.status === 'pending' && (
                <div className="flex gap-2">
                  <Button size="sm" icon={<Check size={13} />} loading={busy === `/ukoapp/producer-titles/${t.id}-approved`} onClick={() => review(`/ukoapp/producer-titles/${t.id}`, 'approved', false, 'claim')}>Approve claim</Button>
                  <Button size="sm" variant="outline" loading={busy === `/ukoapp/producer-titles/${t.id}-rejected`} onClick={() => review(`/ukoapp/producer-titles/${t.id}`, 'rejected', true, 'claim')}>Reject</Button>
                </div>
              )}
            </div>
          ))}
          {docsFor(null).length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-ink-2">Company documents</span>
              <DocumentRows docs={docsFor(null)} busy={busy} onReview={review} />
            </div>
          )}
        </section>

        {/* ---------------- payment requests */}
        <section className="flex flex-col gap-2 rounded-md border border-border p-4">
          <h4 className="m-0 text-sm font-bold">Payment requests</h4>
          {p.payouts.length === 0 ? <p className="m-0 text-xs text-muted">None requested yet.</p> : p.payouts.map((x) => (
            <div key={x.id} className="flex items-center justify-between gap-2 text-[13px]">
              <span>{ksh(x.amount)} <span className="text-xs text-muted">· {x.bank.summary || '—'} · requested {fmtDate(x.requested_at)}</span>
                {x.paid_at && <span className="text-xs text-ink-2"> · paid {fmtDate(x.paid_at)}</span>}
                {x.reference && <span className="text-xs text-ink-2"> · ref {x.reference}</span>}</span>
              <Chip size="sm" tone={STATUS_TONE[x.status]}>{x.status}</Chip>
            </div>
          ))}
          <p className="m-0 text-xs text-muted">Pay requests by bank transfer from the Producer payment requests tab.</p>
        </section>
      </div>
    </Modal>
  )
}

function DocumentRows({ docs, busy, onReview }: { docs: ProducerDetail['documents']; busy: string; onReview: (path: string, status: string, needsReason: boolean, what: string) => void }) {
  if (!docs.length) return <p className="m-0 text-xs text-warning">No documents uploaded for this title.</p>
  return (
    <div className="flex flex-col gap-1.5">
      {docs.map((d) => (
        <div key={d.id} className="flex flex-wrap items-center gap-2 text-xs">
          <FileText size={13} className="text-ink-2" />
          <a href={d.url} target="_blank" rel="noreferrer" className="font-semibold text-primary hover:underline">{DOC_LABEL[d.kind] || d.kind}{d.name ? ` — ${d.name}` : ''} <ExternalLink size={11} className="inline" /></a>
          <Chip size="sm" tone={STATUS_TONE[d.status]}>{d.status}</Chip>
          {d.note && <span className="text-ink-2">{d.note}</span>}
          {d.status === 'pending' && (
            <span className="ml-auto flex gap-1.5">
              <Button size="sm" variant="outline" loading={busy === `/ukoapp/producer-documents/${d.id}-approved`} onClick={() => onReview(`/ukoapp/producer-documents/${d.id}`, 'approved', false, 'document')}>Approve</Button>
              <Button size="sm" variant="ghost" icon={<Trash2 size={12} />} loading={busy === `/ukoapp/producer-documents/${d.id}-rejected`} onClick={() => onReview(`/ukoapp/producer-documents/${d.id}`, 'rejected', true, 'document')}>Reject</Button>
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

// ------------------------------------------------------------------ payouts (finance)
export function ProducerPayoutsPanel() {
  const finance = useIsFinance()
  const [status, setStatus] = useState('requested')
  const [paying, setPaying] = useState<ProducerPayout | null>(null)
  const { rows, err, pager, reload } = usePaged<ProducerPayout>('/ukoapp/producer-payouts', 'payouts', { status })
  return (
    <>
      <Panel title="Producer payment requests" padded={false}
        sub="Producers cannot withdraw directly. Transfer each request by hand from UKO's bank account to the account on the request, then record the reference and date. Only finance or a main admin can."
        action={<Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="requested">To pay</option><option value="paid">Paid</option><option value="rejected">Rejected</option>
          <option value="cancelled">Cancelled</option><option value="">All</option></Select>}>
        {err ? <div className="p-5"><Notice tone="danger">{err}</Notice></div> : !rows ? <PageLoading /> : rows.length === 0 ? (
          <div className="p-5"><EmptyState icon={<Banknote size={24} />} title={status === 'requested' ? 'Nothing to pay' : 'No payment requests'} /></div>
        ) : (
          <>
            <Table head={['Producer', 'Amount', 'Bank account', 'Requested', 'Status', '']}>
              {rows.map((x) => (
                <tr key={x.id}>
                  <Td><div className="flex flex-col"><span className="font-semibold text-ink">{x.producer}</span><span className="font-mono text-xs text-muted">{x.account_no}</span></div></Td>
                  <Td className="whitespace-nowrap font-semibold text-ink">{ksh(x.amount)}</Td>
                  <Td className="text-xs text-ink-2"><BankLines bank={x.bank} /></Td>
                  <Td className="whitespace-nowrap text-xs text-ink-2">{fmtDate(x.requested_at)}</Td>
                  <Td><Chip size="sm" tone={STATUS_TONE[x.status]}>{x.status}</Chip>
                    {x.paid_at && <span className="block text-[11px] text-muted">paid {fmtDate(x.paid_at)}</span>}
                    {x.reference && <span className="block text-[11px] text-muted">ref {x.reference}</span>}
                    {x.note && <span className="block text-[11px] text-muted">{x.note}</span>}</Td>
                  <Td>{finance && x.status === 'requested' && <Button size="sm" onClick={() => setPaying(x)}>Settle</Button>}</Td>
                </tr>
              ))}
            </Table>
            {pager}
          </>
        )}
      </Panel>
      {paying && <SettleModal payout={paying} onClose={() => setPaying(null)} onDone={() => { setPaying(null); reload() }} />}
    </>
  )
}

function BankLines({ bank }: { bank: ProducerPayout['bank'] }) {
  if (!bank.bank_account_number) return <>—</>
  return (
    <div className="flex flex-col">
      <span className="font-semibold text-ink">{bank.bank_account_name}</span>
      <span>{bank.bank_name}{bank.bank_branch ? `, ${bank.bank_branch}` : ''} · <span className="font-mono">{bank.bank_account_number}</span></span>
      <span>{bank.currency}{bank.swift_code ? ` · SWIFT ${bank.swift_code}` : ''}{bank.bank_country ? ` · ${bank.bank_country}` : ''}</span>
    </div>
  )
}

/** "YYYY-MM-DDTHH:mm" in local time, for a datetime-local input. */
const localNow = () => {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

function SettleModal({ payout, onClose, onDone }: { payout: ProducerPayout; onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const [reference, setReference] = useState('')
  const [paidAt, setPaidAt] = useState(localNow)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState('')
  const b = payout.bank
  const copy = (v: string) => navigator.clipboard?.writeText(v).then(() => toast.success('Copied'), () => undefined)
  const decide = async (status: 'paid' | 'rejected') => {
    setBusy(status)
    try {
      await api.put(`/ukoapp/producer-payouts/${payout.id}`, {
        status, reference, note, paid_at: status === 'paid' && paidAt ? new Date(paidAt).toISOString() : null,
      })
      toast.success(status === 'paid' ? 'Payment recorded' : 'Request rejected — the amount is back on their balance')
      onDone()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy('')
    }
  }
  return (
    <Modal title={`Pay ${ksh(payout.amount)} to ${payout.producer}`} onClose={onClose}>
      <div className="flex flex-col gap-3.5">
        <Notice tone="info">Requested {fmtDate(payout.requested_at)}. Their balance after this request: {ksh(payout.balance_ksh ?? 0)}. Check the account name matches {payout.producer}, make the bank transfer, then record it here.</Notice>
        <div className="flex flex-col gap-1.5 rounded-md bg-surface p-3">
          {([['Account name', b.bank_account_name], ['Account number', b.bank_account_number], ['Bank', b.bank_name],
            ['Branch', b.bank_branch], ['SWIFT / BIC', b.swift_code], ['Country', b.bank_country], ['Currency', b.currency]] as const)
            .filter(([, v]) => v).map(([k, v]) => (
              <KeyValue key={k} label={k} value={<button type="button" className="inline-flex items-center gap-1.5 font-mono hover:text-primary" onClick={() => copy(v)} title="Copy">{v} <Copy size={12} /></button>} />
            ))}
        </div>
        <Input label="Bank transfer reference" value={reference} onChange={(e) => setReference(e.target.value)} />
        <Input label="Transferred on" type="datetime-local" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
        <Textarea label="Note (the producer sees it)" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="flex gap-2">
          <Button full loading={busy === 'paid'} disabled={!reference.trim() || !paidAt} icon={<Check size={14} />} onClick={() => decide('paid')}>Record payment</Button>
          <Button full variant="outline" loading={busy === 'rejected'} disabled={!note.trim()} onClick={() => decide('rejected')}>Reject</Button>
        </div>
      </div>
    </Modal>
  )
}
