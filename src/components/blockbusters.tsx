/**
 * UKOapp → Blockbusters: TMDB titles watched on UKOapp past the view threshold (5,000 by default), what their rights
 * holder's 3:2 share adds up to, and staff's outreach to that rights holder — contacts, a log of every call and e-mail,
 * a drafted e-mail and a printable report to attach. Staff send the e-mail themselves.
 */
import { useEffect, useState } from 'react'
import { Clapperboard, Copy, FileText, Mail, MessageSquarePlus, RefreshCw, Search, UserPlus } from 'lucide-react'
import { api } from '#/lib/api'
import { useToast } from '#/lib/toast'
import { fmtDate, ksh, num } from '#/lib/format'
import type { BlockbusterDetail, BlockbusterRow, BlockbusterSummary, Outreach, OutreachStatus } from '#/lib/types'
import { Button, Checkbox, Chip, EmptyState, Input, Notice, PageLoading, Select, StatCard, Textarea } from './ui'
import { Panel, Table, Td } from './dashboard'
import { Modal, Thumb, useDebounced, usePaged } from './console'
import { CreateProducerModal } from './producers'

export const OUTREACH_LABEL: Record<OutreachStatus, string> = {
  new: 'Not started', researching: 'Finding the rights holder', contacted: 'Contacted', replied: 'Replied',
  negotiating: 'Negotiating', onboarded: 'Onboarded', declined: 'Declined', no_response: 'No response',
}
const OUTREACH_TONE: Record<OutreachStatus, 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'secondary'> = {
  new: 'neutral', researching: 'secondary', contacted: 'primary', replied: 'primary', negotiating: 'warning',
  onboarded: 'success', declined: 'danger', no_response: 'neutral',
}
const THRESHOLDS = [1000, 5000, 10000, 50000]

export function BlockbustersPanel() {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [minViews, setMinViews] = useState(5000)
  const [recounting, setRecounting] = useState(false)
  const [open, setOpen] = useState<BlockbusterRow | null>(null)
  const dq = useDebounced(q)
  const { rows, data, err, pager, reload } = usePaged<BlockbusterRow, { summary: BlockbusterSummary }>(
    '/ukoapp/blockbusters', 'titles', { q: dq, status, min_views: minViews })
  const s = data?.summary
  const recount = async () => {   // the list is cached for two minutes on the server; this counts again now
    setRecounting(true)
    try {
      await api.get('/ukoapp/blockbusters', { min_views: minViews, refresh: true })
      await reload()
    } finally {
      setRecounting(false)
    }
  }

  return (
    <>
      {s && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <StatCard label={`Titles with ${num(s.threshold)}+ views`} value={num(s.titles)} />
          <StatCard label="Their views" value={num(s.views)} />
          <StatCard label="Rights holders' share (60%)" value={ksh(s.producer_ksh)} />
          <StatCard label="Held — no producer yet" value={ksh(s.held_unclaimed_ksh)} />
          <StatCard label="Onboarded / in talks" value={`${num(s.onboarded)} / ${num(s.in_progress)}`} />
        </div>
      )}
      <Panel title="Blockbusters to follow up" padded={false}
        sub="Most viewed first. Open a title to see its report, log the outreach and create the producer's account."
        action={<Button size="sm" variant="outline" icon={<RefreshCw size={13} />} loading={recounting} onClick={recount}>Recount</Button>}>
        <div className="grid gap-2 border-b border-border p-3 md:grid-cols-[1fr_200px_220px]">
          <Input placeholder="Search title, production company or rights holder" value={q} onChange={(e) => setQ(e.target.value)} leading={<Search size={14} />} />
          <Select value={String(minViews)} onChange={(e) => setMinViews(Number(e.target.value))} aria-label="View threshold">
            {THRESHOLDS.map((t) => <option key={t} value={t}>{num(t)}+ views</option>)}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Outreach status">
            <option value="">Every outreach status</option>
            <option value="claimed">Has an approved producer</option>
            {(Object.keys(OUTREACH_LABEL) as OutreachStatus[]).map((k) => <option key={k} value={k}>{OUTREACH_LABEL[k]}</option>)}
          </Select>
        </div>
        {err ? <div className="p-5"><Notice tone="danger">{err}</Notice></div> : !rows ? <PageLoading /> : rows.length === 0 ? (
          <div className="p-5">
            <EmptyState icon={<Clapperboard size={24} />} title={`No blockbuster has ${num(minViews)}+ views yet`}
              sub={s ? `${num(s.watched_titles)} blockbuster titles have been watched in all. Lower the threshold to see them.` : undefined} />
          </div>
        ) : (
          <>
            <Table head={['Title', 'Views', 'Paid views', 'Share held', 'Production', 'Outreach', 'Producer']}>
              {rows.map((r) => (
                <tr key={`${r.kind}-${r.tmdb_id}`} className="cursor-pointer hover:bg-surface" onClick={() => setOpen(r)}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Thumb src={r.poster} size={40} />
                      <div className="flex flex-col">
                        <span className="font-semibold text-ink">{r.title || `TMDB ${r.tmdb_id}`}</span>
                        <span className="text-xs text-muted">{r.kind === 'tv' ? 'Series' : 'Movie'}{r.year ? ` · ${r.year}` : ''}</span>
                      </div>
                    </div>
                  </Td>
                  <Td className="font-semibold text-ink">{num(r.views)}</Td>
                  <Td className="text-ink-2">{num(r.paid_views)}</Td>
                  <Td className="whitespace-nowrap font-semibold text-ink">{ksh(r.producer_ksh)}</Td>
                  <Td className="max-w-[220px] text-xs text-ink-2">{r.companies.slice(0, 2).join(', ') || '—'}</Td>
                  <Td><Chip size="sm" tone={OUTREACH_TONE[r.outreach.status]}>{OUTREACH_LABEL[r.outreach.status]}</Chip></Td>
                  <Td className="text-xs">
                    {r.claimed_by ? <span className="font-semibold text-success">{r.claimed_by.producer}</span>
                      : r.pending_claims ? <span className="text-warning">{r.pending_claims} claim{r.pending_claims === 1 ? '' : 's'} to review</span>
                        : <span className="text-muted">None</span>}
                  </Td>
                </tr>
              ))}
            </Table>
            {pager}
          </>
        )}
      </Panel>
      {open && <BlockbusterModal row={open} onClose={() => setOpen(null)} onChanged={reload} />}
    </>
  )
}

function BlockbusterModal({ row, onClose, onChanged }: { row: BlockbusterRow; onClose: () => void; onChanged: () => void }) {
  const toast = useToast()
  const base = `/ukoapp/blockbusters/${row.kind}/${row.tmdb_id}`
  const [d, setD] = useState<BlockbusterDetail | null>(null)
  const [err, setErr] = useState('')
  const [form, setForm] = useState<Outreach | null>(null)
  const [note, setNote] = useState('')
  const [contacted, setContacted] = useState(false)
  const [busy, setBusy] = useState('')
  const [creating, setCreating] = useState(false)

  const load = () => api.get<BlockbusterDetail>(base).then((x) => { setD(x); setForm(x.outreach) }).catch((e) => setErr(e.message))
  useEffect(() => { load() }, [base]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!form) return
    setBusy('save')
    try {
      await api.put(`${base}/outreach`, { ...form, next_step_at: form.next_step_at ? form.next_step_at.slice(0, 10) : null })
      toast.success('Outreach saved')
      await load()
      onChanged()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy('')
    }
  }
  const addNote = async () => {
    if (!note.trim()) return
    setBusy('note')
    try {
      await api.post(`${base}/notes`, { body: note, contacted })
      setNote('')
      setContacted(false)
      await load()
      onChanged()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy('')
    }
  }
  const copyEmail = async () => {
    if (!d) return
    try {
      await navigator.clipboard.writeText(`Subject: ${d.email.subject}\n\n${d.email.body}`)
      toast.success('E-mail copied — paste it into your mail and attach the report')
    } catch {
      toast.alert('Could not copy — select the text and copy it by hand')
    }
  }
  const openReport = async () => {
    try {
      await api.openHtml(`${base}/report`)
    } catch (e: any) {
      toast.error(e.message)
    }
  }
  const set = (k: keyof Outreach) => (e: { target: { value: string } }) => form && setForm({ ...form, [k]: e.target.value })

  return (
    <>
    <Modal title={row.title || `TMDB ${row.tmdb_id}`} onClose={onClose} wide>
      {err ? <Notice tone="danger">{err}</Notice> : !d || !form ? <PageLoading /> : (
        <div className="flex flex-col gap-5">
          <div className="flex gap-4">
            <Thumb src={d.poster} size={88} />
            <div className="flex min-w-0 flex-col gap-1 text-[13px]">
              <span className="text-ink-2">{d.kind === 'tv' ? `Series${d.episodes ? ` · ${d.episodes} episodes on UKO` : ''}` : 'Movie'}{d.year ? ` · ${d.year}` : ''} · TMDB {d.tmdb_id}</span>
              <span className="text-ink-2">Production: <b className="text-ink">{d.companies.join(', ') || 'not in the catalogue — look it up on TMDB / IMDbPro'}</b></span>
              {d.countries.length > 0 && <span className="text-ink-2">Countries: {d.countries.join(', ')}</span>}
              <span className="text-xs text-muted">First view {fmtDate(d.totals.first_view, false) || '—'} · latest {fmtDate(d.totals.last_view, false) || '—'}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatCard label="Views" value={num(d.totals.views)} />
            <StatCard label="Viewers" value={num(d.totals.viewers)} />
            <StatCard label="Revenue" value={ksh(d.totals.revenue_ksh)} />
            <StatCard label="Share held (60%)" value={ksh(d.totals.producer_ksh)} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Chip size="sm" tone="primary">{num(d.totals.sources.paid)} bought credits</Chip>
            <Chip size="sm" tone="primary">{num(d.totals.sources.ad)} Google ads</Chip>
            <Chip size="sm" tone="primary">{num(d.totals.sources.ukoshop)} UKOshop ads</Chip>
            {d.totals.sources.mixed > 0 && <Chip size="sm" tone="primary">{num(d.totals.sources.mixed)} mixed</Chip>}
            <Chip size="sm">{num(d.totals.sources.free)} free credits (earn nothing)</Chip>
          </div>

          {d.months.length > 0 && (
            <div className="overflow-hidden rounded-md border border-border">
              <Table head={['Month', 'Views', 'Paid', 'Revenue', 'Share']}>
                {d.months.slice(-6).reverse().map((m) => (
                  <tr key={m.period}>
                    <Td>{m.period}</Td><Td>{num(m.views)}</Td><Td>{num(m.paid_views)}</Td>
                    <Td>{ksh(m.revenue_ksh)}</Td><Td className="font-semibold text-ink">{ksh(m.producer_ksh)}</Td>
                  </tr>
                ))}
              </Table>
            </div>
          )}
          {d.regions.length > 0 && (
            <p className="m-0 text-xs text-ink-2">Viewers from: {d.regions.map((r) => `${r.place} (${num(r.viewers)})`).join(' · ')}</p>
          )}

          {d.claims.length > 0 && (
            <Notice tone={d.claims.some((c) => c.status === 'approved') ? 'success' : 'info'} title="Producer claims">
              {d.claims.map((c) => <div key={c.title_id}>{c.producer} ({c.account_no}) — {c.status}{c.rights_region ? ` · ${c.rights_region}` : ''}</div>)}
            </Notice>
          )}

          <div className="flex flex-col gap-3 rounded-md border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="m-0 text-sm font-bold">Outreach</h4>
              {form.last_contact_at && <span className="text-xs text-muted">Last contact {fmtDate(form.last_contact_at)}</span>}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Select label="Status" value={form.status} onChange={set('status')}>
                {(Object.keys(OUTREACH_LABEL) as OutreachStatus[]).map((k) => <option key={k} value={k}>{OUTREACH_LABEL[k]}</option>)}
              </Select>
              <Input label="Rights holder / distributor (this territory)" value={form.rights_holder} onChange={set('rights_holder')} />
              <Input label="Contact name" value={form.contact_name} onChange={set('contact_name')} />
              <Input label="Contact e-mail" type="email" value={form.contact_email} onChange={set('contact_email')} />
              <Input label="Contact phone" value={form.contact_phone} onChange={set('contact_phone')} />
              <Input label="Next step on" type="date" value={(form.next_step_at || '').slice(0, 10)} onChange={set('next_step_at')} />
              <Input label="Handled by (staff ID)" value={form.assigned_to} onChange={set('assigned_to')} placeholder="UKO-001" />
            </div>
            <div className="flex justify-end"><Button size="sm" loading={busy === 'save'} onClick={save}>Save outreach</Button></div>
          </div>

          <div className="flex flex-col gap-3 rounded-md border border-border p-4">
            <h4 className="m-0 text-sm font-bold">E-mail to the rights holder</h4>
            <p className="m-0 text-xs text-ink-2">Drafted from the figures above. Open the report, print it to PDF and attach it. Send it from your UKO mailbox, then log it below.</p>
            <div className="rounded-sm bg-surface p-3 text-xs">
              <div className="font-semibold text-ink">{d.email.subject}</div>
              <pre className="m-0 mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap font-sans text-ink-2">{d.email.body}</pre>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" icon={<FileText size={13} />} onClick={openReport}>Open report</Button>
              <Button size="sm" variant="outline" icon={<Copy size={13} />} onClick={copyEmail}>Copy e-mail</Button>
              <a href={d.email.mailto} className="inline-flex"><Button size="sm" variant="outline" icon={<Mail size={13} />}>Open in mail app</Button></a>
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-md border border-border p-4">
            <h4 className="m-0 text-sm font-bold">Log</h4>
            <Textarea placeholder="Called the Nairobi office, they gave the licensing manager's e-mail…" value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Checkbox checked={contacted} onChange={setContacted} label="This was a call / e-mail to them" />
              <Button size="sm" icon={<MessageSquarePlus size={13} />} loading={busy === 'note'} disabled={!note.trim()} onClick={addNote}>Add to log</Button>
            </div>
            {d.notes.length === 0 ? <p className="m-0 text-xs text-muted">Nothing logged yet.</p> : (
              <div className="flex flex-col divide-y divide-border">
                {d.notes.map((n) => (
                  <div key={n.id} className="py-2 text-[13px]">
                    <div className="text-xs text-muted">{n.staff} · {fmtDate(n.time)}</div>
                    <div className="whitespace-pre-wrap text-ink">{n.body}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {!d.claims.some((c) => c.status === 'approved') && (
            <Button icon={<UserPlus size={15} />} onClick={() => setCreating(true)}>Create the producer's account</Button>
          )}
        </div>
      )}
    </Modal>
      {creating && d && (
        <CreateProducerModal
          preset={{ name: form?.rights_holder || '', contact_name: form?.contact_name || '', email: form?.contact_email || '',
                    phone: form?.contact_phone || '', titles: [{ kind: d.kind, tmdb_id: d.tmdb_id, title: d.title, rights_region: 'Kenya' }] }}
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); load(); onChanged() }} />
      )}
    </>
  )
}
