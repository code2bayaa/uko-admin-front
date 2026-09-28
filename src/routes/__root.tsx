import { Outlet, createRootRoute } from '@tanstack/react-router'
import { AuthProvider } from '#/lib/auth'
import { ToastProvider } from '#/lib/toast'

export const Route = createRootRoute({
  component: () => (
    <ToastProvider>
      <AuthProvider>
        <Outlet />
      </AuthProvider>
    </ToastProvider>
  ),
  notFoundComponent: NotFound,
})

function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-surface px-4 text-center">
      <span className="rounded-full bg-primary-050 px-3 py-1 text-xs font-semibold text-primary">404</span>
      <h1 className="text-2xl">That console page does not exist</h1>
      <a href="/" className="mt-2 rounded-md bg-primary px-5 py-3 text-sm font-semibold text-white hover:bg-primary-600">Back to the console</a>
    </div>
  )
}
