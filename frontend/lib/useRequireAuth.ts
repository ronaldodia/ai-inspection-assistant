'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from './store'

export function useRequireAuth() {
  const token = useAuthStore((s) => s.token)
  const hasHydrated = useAuthStore((s) => s.hasHydrated)
  const router = useRouter()

  useEffect(() => {
    if (hasHydrated && !token) router.replace('/login')
  }, [hasHydrated, token, router])

  return hasHydrated ? token : null
}
