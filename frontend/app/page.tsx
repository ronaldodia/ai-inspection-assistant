'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import { LandingPage } from '@/components/LandingPage'

export default function Home() {
  const token = useAuthStore((s) => s.token)
  const router = useRouter()

  useEffect(() => {
    if (token) router.replace('/dashboard')
  }, [token, router])

  if (token) return null
  return <LandingPage />
}
