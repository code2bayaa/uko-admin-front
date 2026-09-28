import { useEffect } from 'react'
import { Link, Outlet, createFileRoute, useNavigate } from '@tanstack/react-router'
import { Clapperboard, LogOut, MonitorPlay, ShieldAlert, ShoppingBag, UserCheck, UserCog } from 'lucide-react'
import { useAuth } from '#/lib/auth'
import { PLATFORM_LABEL } from '#/lib/types'
import { Avatar, PageLoading } from '#/components/ui'
import { SafetyAlarm } from '#/components/safety-alarm'

export const Route = createFileRoute('/_console')({ component: ConsoleLayout })

const NAV = [
  { to: '/shop', label: 'UKOshop', icon: ShoppingBag },
  { to: '/safety', label: 'Safety', icon: ShieldAlert },
  { to: '/eden', label: 'Eden', icon: Clapperboard },
  { to: '/ukoapp', label: 'UKOapp', icon: MonitorPlay },
  { to: '/staff', label: 'Staff', icon: UserCog },
  { to: '/signed-in', label: 'Signed in', icon: UserCheck },
] as const

/** Signed-in shell: platform switcher + staff bar. Any route under it needs an active staff session. */
function ConsoleLayout() {
  const { staff, ready, logout } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (ready && !staff) navigate({ to: '/login' })
  }, [ready, staff, navigate])

  if (!ready || !staff) return <PageLoading />

  const signOut = async () => {
    await logout()
    navigate({ to: '/login' })
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <header className="sticky top-0 z-40 bg-primary text-white">
        <div className="flex h-12 items-center gap-4 px-4 md:px-7">
          <Link to="/" className="shrink-0 font-head text-[15px] font-extrabold text-white">UKO admin</Link>
          <nav className="no-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className="flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-[13px] font-normal text-white/60 transition-colors hover:text-white"
                activeProps={{ className: 'bg-white/15 !font-bold !text-white' }}
              >
                <n.icon size={14} /> {n.label}
              </Link>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-3">
            <span className="hidden text-xs text-white/70 md:inline">{staff.staff_id} · {PLATFORM_LABEL[staff.platform] ?? staff.platform}</span>
            <Avatar name={staff.name} size={28} />
            <button type="button" onClick={signOut} className="flex items-center gap-1.5 rounded-md border border-white/25 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-white/10"><LogOut size={13} /> <span className="hidden sm:inline">Sign out</span></button>
          </div>
        </div>
        {/* riders unreachable with parcels — polled every 30 s, shown on every console page */}
        <SafetyAlarm />
      </header>
      <main className="flex flex-1 flex-col gap-5 px-4 py-6 md:px-7 md:pb-10">
        <Outlet />
      </main>
    </div>
  )
}
