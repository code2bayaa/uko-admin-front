/** Staff accounts in the admin database — shared by the UKOshop, Eden and UKOapp consoles (moved from the shop's admin page). */
import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Banknote, Pencil, Plus, Save, ShieldCheck, TriangleAlert, UserCog } from 'lucide-react'
import { api } from '#/lib/api'
import { PLATFORM_LABEL, type Platform, type Staff as StaffRow, type StaffSalary } from '#/lib/types'
import { useAuth } from '#/lib/auth'
import { useToast } from '#/lib/toast'
import { fmtDate, ksh } from '#/lib/format'
import { Button, Chip, EmptyState, Input, Notice, PageLoading, Select } from '#/components/ui'
import { DashHeader, Panel, Table, Td } from '#/components/dashboard'
import { usePaged } from '#/components/console'

export const Route = createFileRoute('/_console/staff')({ component: StaffPage })

// ---------------------------------------------------------------- Staff (GET/POST /api/staff → admin.staff)
const ROLES = ['admin', 'support', 'finance']

type StaffForm = { staff_id: string; name: string; email: string; telephone: string; location: string; office: string; platform: Platform; password: string; role: string }
const EMPTY_STAFF: StaffForm = { staff_id: '', name: '', email: '', telephone: '', location: '', office: '', platform: 'shop', password: '', role: 'admin' }

function StaffPage() {
  const toast = useToast()
  const { staff: me } = useAuth()
  const { rows, data, err: loadErr, reload, pager } = usePaged<StaffRow>('/staff', 'staff', {})
  const [form, setForm] = useState<StaffForm>(EMPTY_STAFF)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k: keyof StaffForm, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async () => {
    setErr('')
    if (form.staff_id.trim().length < 3) return setErr('Staff ID needs at least 3 characters (e.g. UKO-002)')
    if (!form.name.trim()) return setErr("Enter the staff member's name")
    if (form.password.length < 8) return setErr('Password needs at least 8 characters')
    setBusy(true)
    try {
      const s = await api.post<StaffRow>('/staff', { ...form, staff_id: form.staff_id.trim().toUpperCase(), name: form.name.trim(), email: form.email.trim(), telephone: form.telephone.trim(), location: form.location.trim(), office: form.office.trim() })
      toast.success(`${s.staff_id} · ${s.name} added — they sign in with the staff ID or email`)
      setForm(EMPTY_STAFF)
      await reload()
    } catch (e: any) {
      setErr(e.message || 'Could not add the staff member')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <DashHeader title="Staff" sub="Staff for UKOshop, Eden and UKOapp (admin database) · they sign in with the staff ID or email, password and a 2FA code e-mailed to their email" />
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <Panel title="Staff accounts" action={<Chip size="sm">{data?.total ?? 0}</Chip>} padded={false}>
          {loadErr && !rows ? (
            <div className="p-5"><Notice tone="warning" icon={<UserCog size={16} />} title="Staff list unavailable" action={<Button size="sm" variant="outline" onClick={reload}>Retry</Button>}>{loadErr}</Notice></div>
          ) : !rows ? (
            <PageLoading />
          ) : rows.length === 0 ? (
            <div className="p-5"><EmptyState icon={<UserCog size={26} />} title="No staff accounts" sub="Add the first staff member with the form." /></div>
          ) : (
            <Table head={['Staff ID', 'Name', 'Role', 'Email', 'Telephone', 'Location', 'Office', 'Platform', 'Since']}>
              {rows.map((s) => (
                <tr key={s.staff_id}>
                  <Td className="whitespace-nowrap font-head font-bold text-ink">{s.staff_id}</Td>
                  <Td className="text-ink">{s.name}</Td>
                  <Td><Chip size="sm" tone={s.role === 'admin' ? 'primary' : 'neutral'}>{s.role}</Chip></Td>
                  <Td className="text-ink-2">{s.email}</Td>
                  <Td className="whitespace-nowrap text-ink-2">{s.telephone || '—'}</Td>
                  <Td className="text-ink-2">{s.location || '—'}</Td>
                  <Td className="text-ink-2">{s.office || '—'}</Td>
                  <Td><Chip size="sm" tone={s.platform === 'shop' ? 'primary' : 'neutral'}>{PLATFORM_LABEL[s.platform] ?? s.platform}</Chip></Td>
                  <Td className="whitespace-nowrap text-ink-2">{s.since ? fmtDate(s.since, false) : '—'}</Td>
                </tr>
              ))}
            </Table>
          )}
          {pager}
        </Panel>

        <Panel title="Add staff" sub="Creates a console sign-in for a colleague">
          <form className="flex flex-col gap-3.5" onSubmit={(e) => { e.preventDefault(); submit() }}>
            <Notice tone="info" icon={<ShieldCheck size={14} />}>Staff IDs are assigned manually (no auto increment) — pick the next free ID, e.g. UKO-002.</Notice>
            <Input label="Staff ID" required placeholder="UKO-002" value={form.staff_id} onChange={(e) => set('staff_id', e.target.value.toUpperCase())} hint="Letters, digits and dashes · 3 – 30 characters" />
            <Input label="Name" required placeholder="Full name" value={form.name} onChange={(e) => set('name', e.target.value)} />
            <Input label="Email" type="email" required autoComplete="off" placeholder="name@uko.co.ke" value={form.email} onChange={(e) => set('email', e.target.value)} hint="Sign-in 2FA codes are e-mailed here — use a mailbox they can open" />
            <Input label="Telephone" type="tel" autoComplete="off" placeholder="0712 345 678" value={form.telephone} onChange={(e) => set('telephone', e.target.value)} />
            <Input label="Location" placeholder="e.g. Nairobi CBD" value={form.location} onChange={(e) => set('location', e.target.value)} />
            <Input label="Office" placeholder="e.g. HQ · 3rd floor" value={form.office} onChange={(e) => set('office', e.target.value)} />
            <Select label="Platform" value={form.platform} onChange={(e) => set('platform', e.target.value)}>
              {(Object.keys(PLATFORM_LABEL) as Platform[]).map((p) => <option key={p} value={p}>{PLATFORM_LABEL[p]}</option>)}
            </Select>
            <Input label="Password" type="password" required autoComplete="new-password" placeholder="At least 8 characters" value={form.password} onChange={(e) => set('password', e.target.value)} />
            <Select label="Role" value={form.role} onChange={(e) => set('role', e.target.value)}>
              {ROLES.map((r) => <option key={r} value={r}>{cap(r)}</option>)}
            </Select>
            {err && <Notice tone="danger" icon={<TriangleAlert size={14} />}>{err}</Notice>}
            <Button type="submit" full loading={busy} icon={<Plus size={15} />}>Add staff</Button>
          </form>
        </Panel>
      </div>
      {me?.role?.toLowerCase() === 'admin' && <SalariesPanel />}
    </>
  )
}

const cap = (r: string) => r.charAt(0).toUpperCase() + r.slice(1)

// ---------------------------------------------------------------- Salaries (GET/PUT /api/staff/salaries → admin.staff_salaries, main admin only)
function SalariesPanel() {
  const toast = useToast()
  const [rows, setRows] = useState<StaffSalary[] | null>(null)
  const [loadErr, setLoadErr] = useState('')
  const [role, setRole] = useState('finance')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const load = () => api.get<StaffSalary[]>('/staff/salaries').then((d) => { setRows(d); setLoadErr('') }).catch((e) => setLoadErr(e.message))
  useEffect(() => { load() }, [])

  const existing = rows?.find((r) => r.role === role)
  const save = async () => {
    setErr('')
    const n = Number(amount)
    if (amount.trim() === '' || !Number.isInteger(n) || n < 0) return setErr('Enter the monthly salary in whole shillings, e.g. 20000')
    setBusy(true)
    try {
      const r = await api.put<StaffSalary>('/staff/salaries', { role, amount: n })
      toast.success(`${cap(r.role)} salary ${existing ? 'updated' : 'set'} to ${ksh(r.amount)}`)
      setAmount('')
      await load()
    } catch (e: any) {
      setErr(e.message || 'Could not save the salary')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_380px]">
      <Panel title="Salaries" sub="Monthly salary per role · visible to the main admin only" action={<Chip size="sm">{rows?.length ?? 0}</Chip>} padded={false}>
        {loadErr && !rows ? (
          <div className="p-5"><Notice tone="warning" icon={<Banknote size={16} />} title="Salaries unavailable" action={<Button size="sm" variant="outline" onClick={load}>Retry</Button>}>{loadErr}</Notice></div>
        ) : !rows ? (
          <PageLoading />
        ) : rows.length === 0 ? (
          <div className="p-5"><EmptyState icon={<Banknote size={26} />} title="No salaries set" sub="Set the first role's salary with the form, e.g. Finance · 20000." /></div>
        ) : (
          <Table head={['Role', 'Monthly salary', 'Staff', 'Updated by', 'Updated', '']}>
            {rows.map((r) => (
              <tr key={r.role}>
                <Td><Chip size="sm" tone={r.role === 'admin' ? 'primary' : 'neutral'}>{r.role}</Chip></Td>
                <Td className="whitespace-nowrap font-head font-bold text-ink">{ksh(r.amount)}</Td>
                <Td className="text-ink-2">{r.staff_count}</Td>
                <Td className="text-ink-2">{r.updated_by || '—'}</Td>
                <Td className="whitespace-nowrap text-ink-2">{r.updated_at ? fmtDate(r.updated_at) : '—'}</Td>
                <Td><Button size="sm" variant="outline" icon={<Pencil size={13} />} onClick={() => { setRole(r.role); setAmount(String(r.amount)); setErr('') }}>Edit</Button></Td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>

      <Panel title={existing ? 'Update salary' : 'Set salary'} sub="Saving a role that already has a salary replaces it">
        <form className="flex flex-col gap-3.5" onSubmit={(e) => { e.preventDefault(); save() }}>
          <Select label="Role" value={role} onChange={(e) => setRole(e.target.value)}>
            {Array.from(new Set([...ROLES, ...(rows ?? []).map((r) => r.role)])).map((r) => <option key={r} value={r}>{cap(r)}</option>)}
          </Select>
          <Input label="Monthly salary (KSh)" type="number" min={0} step={1} required placeholder="20000" value={amount} onChange={(e) => setAmount(e.target.value)}
            hint={existing ? `Currently ${ksh(existing.amount)}` : 'No salary set for this role yet'} />
          {err && <Notice tone="danger" icon={<TriangleAlert size={14} />}>{err}</Notice>}
          <Button type="submit" full loading={busy} icon={<Save size={15} />}>{existing ? 'Update salary' : 'Save salary'}</Button>
        </form>
      </Panel>
    </div>
  )
}
