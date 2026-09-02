'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from './store'

const CHANGE_PASSWORD_PATH = '/change-password'

export function useRequireAuth() {
  const token = useAuthStore((s) => s.token)
  const mustChangePassword = useAuthStore((s) => s.mustChangePassword)
  const hasHydrated = useAuthStore((s) => s.hasHydrated)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!hasHydrated) return
    if (!token) {
      router.replace('/login')
      return
    }
    if (mustChangePassword && pathname !== CHANGE_PASSWORD_PATH) {
      router.replace(CHANGE_PASSWORD_PATH)
    }
  }, [hasHydrated, token, mustChangePassword, pathname, router])

  return hasHydrated ? token : null
}
