import { useEffect } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useAuth } from '#/lib/auth'
import { PageLoading } from '#/components/ui'

export const Route = createFileRoute('/_console/')({ component: Home })

const HOME = { shop: '/shop', eden: '/eden', ad: '/ukoapp' } as const

/** Opens the console of the staff member's own platform; every console stays reachable from the top bar. */
function Home() {
  const { staff } = useAuth()
  const navigate = useNavigate()
  useEffect(() => {
    navigate({ to: HOME[staff?.platform ?? 'shop'] ?? '/shop', replace: true })
  }, [staff, navigate])
  return <PageLoading />
}
