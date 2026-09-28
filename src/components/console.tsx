/** Pieces shared by the console pages (moved from the shop's admin.shelves page). */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Download, ExternalLink, FileText, FileWarning, ImageIcon, Upload, X } from 'lucide-react'
import { api, COMPANY_EMAIL_DOMAIN, suggestCompanyMailbox } from '#/lib/api'
import { useToast } from '#/lib/toast'
import { Button, Input, Spinner, cx } from './ui'

export function Modal({ title, onClose, children, wide, danger }: { title?: string; onClose: () => void; children: ReactNode; wide?: boolean; danger?: boolean }) {
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-ink/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className={cx('fade-up max-h-[92vh] w-full overflow-y-auto rounded-t-lg border bg-bg p-5 shadow-card sm:rounded-lg', wide ? 'max-w-[640px]' : 'max-w-[420px]', danger ? 'border-danger' : 'border-border')} onClick={(e) => e.stopPropagation()}>
        {title && (
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-base font-bold">{title}</h3>
            <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1 text-ink-2 hover:bg-surface"><X size={16} /></button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

export function Thumb({ src, size = 56, className, children }: { src?: string; size?: number; className?: string; children?: ReactNode }) {
  return (
    <div style={{ width: size, height: size }} className={cx('relative flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-2', className)}>
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <ImageIcon size={size * 0.35} className="text-border-strong" />}
      {children}
    </div>
  )
}

/** Single shelf image → POST /api/shop/upload */
export function ImageUploader({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const handle = async (files: FileList | null) => {
    const f = files?.[0]
    if (!f) return
    setErr('')
    if (f.size > 10 * 1024 * 1024) return setErr(`${f.name} is larger than 10 MB`)
    setBusy(true)
    try {
      const r = await api.upload('/shop/upload', f)
      onChange(r.url)
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-3">
        {value ? (
          <div className="relative h-[120px] w-[140px] overflow-hidden rounded-md border border-border">
            <img src={value} alt="" className="h-full w-full object-cover" />
            <button type="button" onClick={() => onChange('')} aria-label="Remove image" className="absolute right-1.5 top-1.5 rounded-full bg-ink/70 p-1 text-white"><X size={12} /></button>
          </div>
        ) : (
          <button type="button" onClick={() => input.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); handle(e.dataTransfer.files) }} className="flex h-[120px] w-[140px] flex-col items-center justify-center gap-1.5 rounded-md border-2 border-dashed border-border-strong bg-surface text-center text-ink-2 hover:border-primary-300 hover:text-primary">
            {busy ? <Spinner /> : <Upload size={20} />}
            <span className="text-xs font-semibold">{busy ? 'Uploading…' : 'Drop image or browse'}</span>
          </button>
        )}
      </div>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => { handle(e.target.files); e.target.value = '' }} />
      {err && <span className="text-xs text-danger">{err}</span>}
    </div>
  )
}

/** 20 rows a page everywhere — the admin API's app/paging.py PER_PAGE. */
export const PER_PAGE = 20

/**
 * The footer under every table: which rows are on screen and Prev / Next. It is shown whenever there are
 * rows, so a one-page table still says how many there are; the buttons only come alive past 20.
 */
export function Pager({ page, perPage, total, onPage }: { page: number; perPage: number; total: number; onPage: (p: number) => void }) {
  if (!total) return null
  const pages = Math.max(1, Math.ceil(total / perPage))
  const from = (page - 1) * perPage + 1
  const to = Math.min(total, page * perPage)
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs text-ink-2">
      <span>{from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()} · page {page} of {pages}</span>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)} icon={<ChevronLeft size={14} />}>Prev</Button>
        <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next <ChevronRight size={14} /></Button>
      </div>
    </div>
  )
}

export type PageMeta = { total: number; page: number; per_page: number }

/**
 * One page of a list route that takes `page` (admin/back-end app/paging.py) and answers
 * `{<key>: rows, total, page, per_page, ...extra}`. A change to `params` goes back to page 1; a page the
 * API clamped (the last row on the last page was removed) is followed rather than fetched again empty.
 * `data` keeps the extras (pending counts, category counts, report totals).
 */
export function usePaged<T, X extends object = object>(path: string, key: string, params: Record<string, string | number | boolean | undefined | null>) {
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<T[] | null>(null)
  const [data, setData] = useState<(PageMeta & X) | null>(null)
  const [err, setErr] = useState('')
  const sig = JSON.stringify(params)
  const lastSig = useRef(sig)

  const load = async (p: number) => {
    try {
      const d = await api.get<PageMeta & X & Record<string, unknown>>(path, { ...params, page: p })
      setRows((d[key] as T[]) ?? [])
      setData(d)
      if (d.page !== p) setPage(d.page)
      setErr('')
    } catch (e: any) {
      setErr(e.message || 'Could not load the list')
    }
  }
  useEffect(() => {
    if (lastSig.current !== sig) {
      lastSig.current = sig
      setRows(null)
      if (page !== 1) {
        setPage(1) // the effect runs again for page 1
        return
      }
    }
    load(page)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, sig, page])

  const pager = data ? <Pager page={data.page} perPage={data.per_page} total={data.total} onPage={setPage} /> : null
  return { rows, data, err, page, setPage, reload: () => load(page), pager }
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

/** One uploaded file of an application — admin/back-end serialize.application_files(); a missing required slot has no url. */
export type AppFile = { slot: string; label: string; required: boolean; index: number; url: string; name: string; missing: boolean }

/**
 * An application's documents, each with View (the signed Backblaze URL, opens in a tab) and Download (fetched
 * through `{downloadBase}/{slot}?i=` — signed URLs are cross-origin, so a plain `download` link would not save).
 * Required slots with nothing uploaded are flagged; the API refuses to approve while any are.
 */
export function DocumentList({ files, downloadBase, fallbackName }: { files: AppFile[]; downloadBase: string; fallbackName: string }) {
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const uploaded = files.filter((f) => !f.missing)

  const download = async (f: AppFile) => {
    const k = `${f.slot}:${f.index}`
    setBusy(k)
    try {
      await api.download(`${downloadBase}/${encodeURIComponent(f.slot)}?i=${f.index}`, f.name || `${fallbackName}-${f.slot}`)
    } catch (e: any) {
      toast.error(e.message || 'Could not download the document')
    } finally {
      setBusy(null)
    }
  }
  const downloadAll = async () => {
    for (const f of uploaded) await download(f)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wide text-muted">Documents · {uploaded.length} uploaded</span>
        {uploaded.length > 1 && <Button size="sm" variant="outline" icon={<Download size={13} />} onClick={downloadAll} disabled={!!busy}>Download all</Button>}
      </div>
      {files.length === 0 ? (
        <span className="text-[11px] text-muted">No documents uploaded</span>
      ) : (
        <ul className="m-0 flex list-none flex-col divide-y divide-border rounded-sm border border-border p-0">
          {files.map((f) => {
            const k = `${f.slot}:${f.index}`
            return (
              <li key={k} className="flex flex-wrap items-center gap-2.5 px-3 py-2">
                {f.missing ? <FileWarning size={15} className="shrink-0 text-danger" /> : /\.(jpe?g|png|webp|gif)$/i.test(f.name) && f.url ? <Thumb src={f.url} size={28} /> : <FileText size={15} className="shrink-0 text-primary" />}
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[12px] font-semibold text-ink">{f.label}{f.required && <span className="text-danger"> *</span>}</span>
                  <span className={cx('truncate text-[11px]', f.missing ? 'text-danger' : 'text-muted')}>{f.missing ? 'Not uploaded' : f.name}</span>
                </div>
                {!f.missing && (
                  <div className="flex items-center gap-1.5">
                    {f.url && <a href={f.url} target="_blank" rel="noreferrer" className="flex h-[28px] items-center gap-1 rounded-sm bg-surface px-2.5 text-[11px] font-semibold text-ink-2 hover:text-primary"><ExternalLink size={12} /> View</a>}
                    <Button size="sm" variant="outline" icon={<Download size={12} />} loading={busy === k} onClick={() => download(f)}>Download</Button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** The company email each pending application is given on approval, keyed by application id. The mailbox starts as a
 *  suggestion from the applicant's name; `body(id, name)` is what the approve call posts. */
export function useCompanyEmails() {
  const [boxes, setBoxes] = useState<Record<number, string>>({})
  const mailbox = (id: number, name: string) => boxes[id] ?? suggestCompanyMailbox(name)
  return {
    mailbox,
    set: (id: number, v: string) => setBoxes((b) => ({ ...b, [id]: v.trim().toLowerCase().replace(/@.*$/, '') })),
    body: (id: number, name: string) => ({ company_email: `${mailbox(id, name)}@${COMPANY_EMAIL_DOMAIN}` }),
  }
}

export function CompanyEmailField({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <Input label="Company email" required value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}
      autoComplete="off" spellCheck={false} placeholder="firstname.lastname" trailing={`@${COMPANY_EMAIL_DOMAIN}`}
      hint="Assigned on approval — must not already belong to another shelf, rider or courier" />
  )
}
