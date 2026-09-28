/**
 * Fetch wrapper for the UKO admin API (admin/back-end).
 *  - sends the staff session token (localStorage "uko_admin_token")
 *  - on 401 (expired / revoked session) clears the token and fires "uko-admin:signed-out" so the app returns to /login
 *  - throws ApiError with the server's `detail` message
 */
export const API_URL: string = import.meta.env.VITE_ADMIN_API_URL || 'http://localhost:8010'
export const SHOP_URL: string = import.meta.env.VITE_SHOP_URL || 'http://localhost:3000'

const TOKEN_KEY = 'uko_admin_token'
export const SIGNED_OUT_EVENT = 'uko-admin:signed-out'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {}
}

type Query = Record<string, string | number | boolean | undefined | null>

export function qs(params?: Query): string {
  if (!params) return ''
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '' || v === false) continue
    sp.set(k, String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}

/**
 * A FastAPI 422 body carries `detail` as a list of { loc, msg } rather than a sentence, and two things
 * make those unreadable as they arrive: pydantic puts "Value error, " in front of whatever our own
 * validator wrote, and `loc` is a path whose first element is always "body". So drop the prefix, turn
 * the rest of the path into words, and leave the field name off when the message already opens with it —
 * "Gender must be male or female" needs nothing in front of it, pydantic's own "Field required" does.
 */
const PYDANTIC_PREFIX = /^(?:Value error|Assertion failed),\s+/

function validationMessage(d: any): string {
  const msg = String(d?.msg || 'is not valid').replace(PYDANTIC_PREFIX, '')
  const path = (Array.isArray(d?.loc) ? d.loc : []).slice(1)
  // A position in a list is counted from 1, the way the person sees the rows on the page.
  const field = path.map((p: unknown) => (typeof p === 'number' ? `[${p + 1}]` : String(p).replace(/_/g, ' '))).join(' ').trim()
  if (!field) return msg
  if (msg.toLowerCase().startsWith(field.split(' [')[0].toLowerCase())) return msg
  return `${field.charAt(0).toUpperCase()}${field.slice(1)}: ${msg}`
}

async function request<T>(method: string, path: string, body?: unknown, form?: FormData): Promise<T> {
  const headers: Record<string, string> = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  let payload: BodyInit | undefined
  if (form) payload = form
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  let res: Response
  try {
    res = await fetch(`${API_URL}/api${path}`, { method, headers, body: payload })
  } catch {
    throw new ApiError(0, `The admin API is not reachable at ${API_URL} — start admin/back-end (run.ps1).`)
  }
  const text = await res.text()
  let data: any = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  if (!res.ok) {
    if (res.status === 401 && token) {
      setToken(null)
      window.dispatchEvent(new Event(SIGNED_OUT_EVENT))
    }
    const detail = data?.detail
    const msg = Array.isArray(detail)
      ? detail.map(validationMessage).join('; ')
      : detail || res.statusText || 'Request failed'
    throw new ApiError(res.status, msg)
  }
  return data as T
}

export const api = {
  get: <T>(path: string, params?: Query) => request<T>('GET', path + qs(params)),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  del: <T>(path: string, body?: unknown) => request<T>('DELETE', path, body),
  upload: (path: string, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<{ path: string; url: string; kind: 'image' }>('POST', path, undefined, form)
  },
  /**
   * GET an HTML page with the staff session and show it in a new tab through a blob URL (a plain link would not
   * carry the bearer token). The tab is opened before the fetch, while the click still counts as a user gesture,
   * so popup blockers let it through.
   */
  openHtml: async (path: string) => {
    const win = window.open('', '_blank')
    const token = getToken()
    let res: Response
    try {
      res = await fetch(`${API_URL}/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    } catch {
      win?.close()
      throw new ApiError(0, `The admin API is not reachable at ${API_URL} — start admin/back-end (run.ps1).`)
    }
    if (!res.ok) {
      win?.close()
      let msg = res.statusText || 'Could not open the page'
      try {
        msg = (await res.json())?.detail || msg
      } catch {}
      if (res.status === 401 && token) {
        setToken(null)
        window.dispatchEvent(new Event(SIGNED_OUT_EVENT))
      }
      throw new ApiError(res.status, msg)
    }
    const url = URL.createObjectURL(new Blob([await res.text()], { type: 'text/html' }))
    if (win) win.location.href = url
    else {
      const a = document.createElement('a')
      a.href = url
      a.target = '_blank'
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      a.remove()
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  },
  /** GET a file with the staff session and save it under the server's Content-Disposition filename. */
  download: async (path: string, fallbackName: string) => {
    const token = getToken()
    let res: Response
    try {
      res = await fetch(`${API_URL}/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    } catch {
      throw new ApiError(0, `The admin API is not reachable at ${API_URL} — start admin/back-end (run.ps1).`)
    }
    if (!res.ok) {
      let msg = res.statusText || 'Download failed'
      try {
        msg = (await res.json())?.detail || msg
      } catch {}
      if (res.status === 401 && token) {
        setToken(null)
        window.dispatchEvent(new Event(SIGNED_OUT_EVENT))
      }
      throw new ApiError(res.status, msg)
    }
    const name = /filename="?([^";]+)"?/.exec(res.headers.get('Content-Disposition') || '')?.[1] || fallbackName
    const url = URL.createObjectURL(await res.blob())
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  },
}

/** How many verified shelves UKO runs in one ward — the shop API's `config.SHELVES_PER_WARD`. Keep the
 *  two in step: this is the number the console quotes when adding a shelf or approving an application. */
export const SHELVES_PER_WARD = 3

/** The domain of the company address admin assigns a shelf, rider or courier on approval — the admin API's
 *  `COMPANY_EMAIL_DOMAIN`, which checks it. The console suggests a mailbox name from the applicant's name. */
export const COMPANY_EMAIL_DOMAIN = 'uko.co.ke'
export const suggestCompanyMailbox = (name: string) =>
  name.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 40)

/** Where one Safety incident lives in the admin API: rider incidents keep their original /shop/incidents/{id} routes,
 *  courier-driver incidents sit under /shop/incidents/courier/{id} and rider item pick-ups under
 *  /shop/incidents/pickup/{id}. Append /police-report, /report-police or /close. */
export function incidentPath(kind: 'rider' | 'pickup' | 'courier', id: number): string {
  if (kind === 'courier') return `/shop/incidents/courier/${id}`
  if (kind === 'pickup') return `/shop/incidents/pickup/${id}`
  return `/shop/incidents/${id}`
}
