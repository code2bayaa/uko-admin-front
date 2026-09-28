/**
 * The console-wide safety alarm. Polls GET /api/shop/incidents?status=active every 30 s and, while a delivery rider
 * (on a delivery or an item pick-up) or an inter-county courier driver is unreachable with goods, shows a banner on
 * every console page ("2 riders (1 on an item pick-up) and 1 courier unreachable with goods"): red when any is
 * `missing`, amber when only warnings are open. "Enable desktop alerts" asks for the browser Notification permission;
 * once granted, every new `missing` incident fires one desktop notification. Incidents are remembered by `key`
 * ("rider-12" / "pickup-4" / "courier-3") for the browser session — ids alone repeat across the kinds.
 */
import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { BellRing, Siren, TriangleAlert } from 'lucide-react'
import { api } from '#/lib/api'
import type { IncidentCounts, IncidentList } from '#/lib/types'
import { cx } from './ui'

export const INCIDENT_POLL_MS = 30_000
const SEEN_KEY = 'uko_admin_missing_alerted_keys' // was 'uko_admin_missing_alerted' (bare rider ids)

function loadSeen(): Set<string> {
  try {
    const raw = sessionStorage.getItem(SEEN_KEY)
    const keys = raw ? (JSON.parse(raw) as unknown[]) : []
    return new Set(keys.filter((k): k is string => typeof k === 'string'))
  } catch {
    return new Set()
  }
}

function saveSeen(keys: Set<string>) {
  try {
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...keys].slice(-500)))
  } catch {}
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** "2 riders (1 on an item pick-up) and 1 courier" — only the kinds that have any; riders on pick-ups count as riders.
 *  Falls back to the total when by_kind is absent. */
function whoCount(field: keyof IncidentCounts, d: IncidentList, fallbackWord: string): string {
  const p = d.by_kind?.pickup?.[field] ?? 0
  const r = (d.by_kind?.rider?.[field] ?? 0) + p
  const c = d.by_kind?.courier?.[field] ?? 0
  if (!d.by_kind) return plural(d.counts[field], fallbackWord)
  const riders = r ? plural(r, 'rider') + (p ? (p === r ? ' (on an item pick-up)' : ` (${p} on an item pick-up)`) : '') : ''
  const parts = [riders, c ? plural(c, 'courier') : ''].filter(Boolean)
  return parts.join(' and ') || plural(d.counts[field], fallbackWord)
}

function notificationPermission(): NotificationPermission | 'unsupported' {
  try {
    return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
  } catch {
    return 'unsupported'
  }
}

export async function requestDesktopAlerts(): Promise<NotificationPermission | 'unsupported'> {
  try {
    return await Notification.requestPermission()
  } catch {
    return notificationPermission()
  }
}

/** The same switch for the Safety page, so alerts can be turned on before anything goes wrong. */
export function DesktopAlertsButton() {
  const [perm, setPerm] = useState(notificationPermission())
  if (perm === 'unsupported') return <span className="text-xs text-muted">This browser has no desktop notifications</span>
  if (perm === 'granted') return <span className="flex items-center gap-1.5 text-xs font-semibold text-success"><BellRing size={13} /> Desktop alerts on</span>
  if (perm === 'denied') return <span className="text-xs text-muted">Desktop alerts are blocked in this browser's site settings</span>
  return (
    <button type="button" onClick={async () => setPerm(await requestDesktopAlerts())} className="flex items-center gap-1.5 rounded-md border border-border-strong px-3 py-2 text-[13px] font-semibold text-ink hover:bg-surface">
      <BellRing size={14} /> Enable desktop alerts
    </button>
  )
}

export function SafetyAlarm() {
  const [data, setData] = useState<IncidentList | null>(null)
  const [, rerender] = useState(0)
  const perm = notificationPermission() // read on every render: the Safety page can grant it too
  const seen = useRef<Set<string>>(loadSeen())

  useEffect(() => {
    let alive = true
    const poll = async () => {
      try {
        const d = await api.get<IncidentList>('/shop/incidents', { status: 'active' })
        if (!alive) return
        setData(d)
        if (notificationPermission() === 'granted') {
          let changed = false
          for (const i of d.incidents) {
            const key = i.key || `${i.kind || 'rider'}-${i.id}`
            if (i.level !== 'missing' || seen.current.has(key)) continue
            seen.current.add(key)
            changed = true
            const courier = i.kind === 'courier'
            const pickup = i.kind === 'pickup'
            const person = i.person ?? i.rider
            const title = courier ? 'UKO: courier driver unreachable with a load'
              : pickup ? "UKO: rider unreachable with a seller's item" : 'UKO: rider unreachable with a parcel'
            const ref = courier ? `waybill ${i.tracking_no}` : pickup ? `pick-up ${i.tracking_no}${i.job?.item_title ? ` (${i.job.item_title})` : ''}` : i.tracking_no
            try {
              const n = new Notification(title, {
                body: `${person?.name ?? (courier ? 'A driver' : 'A rider')} (${person?.plate || 'no plate'}) · ${ref} · last seen ${i.minutes_since_seen ?? '?'} min ago`,
                tag: `uko-incident-${key}`,
                requireInteraction: true,
              })
              n.onclick = () => {
                window.focus()
                window.location.assign('/safety')
              }
            } catch {}
          }
          if (changed) saveSeen(seen.current)
        }
      } catch {
        // the banner simply stays as it was; a 401 signs the console out through the api helper
      }
    }
    poll()
    const t = window.setInterval(poll, INCIDENT_POLL_MS)
    return () => {
      alive = false
      window.clearInterval(t)
    }
  }, [])

  const enable = async () => {
    await requestDesktopAlerts()
    rerender((n) => n + 1)
  }

  const c = data?.counts
  if (!data || !c || c.active === 0) return null
  const red = c.missing > 0
  const text = red
    ? `${whoCount('missing', data, 'rider')} unreachable with goods`
    : `${whoCount('warning', data, 'rider')} not sending location`
  return (
    <div role="alert" className={cx('flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 text-[13px] text-white md:px-7', red ? 'bg-danger' : 'bg-warning')}>
      {red ? <Siren size={16} className="shrink-0" /> : <TriangleAlert size={16} className="shrink-0" />}
      <span className="font-semibold">{text}</span>
      {red && c.warning > 0 && <span className="text-white/80">· {c.warning} more late</span>}
      {c.reported > 0 && <span className="text-white/80">· {c.reported} reported to police</span>}
      <Link to="/safety" className="rounded-md bg-white/20 px-2.5 py-1 text-xs font-bold text-white hover:bg-white/30">Open Safety</Link>
      <span className="flex-1" />
      {perm === 'default' && (
        <button type="button" onClick={enable} className="flex items-center gap-1.5 rounded-md border border-white/40 px-2.5 py-1 text-xs font-semibold hover:bg-white/10">
          <BellRing size={13} /> Enable desktop alerts
        </button>
      )}
      {perm === 'denied' && <span className="text-[11px] text-white/80">Desktop alerts are blocked in this browser's site settings</span>}
    </div>
  )
}
