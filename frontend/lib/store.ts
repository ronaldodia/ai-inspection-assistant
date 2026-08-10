import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AuthState {
  token: string | null
  userEmail: string | null
  hasHydrated: boolean
  setAuth: (token: string, email: string) => void
  logout: () => void
  setHasHydrated: (value: boolean) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      userEmail: null,
      hasHydrated: false,
      setAuth: (token, userEmail) => set({ token, userEmail }),
      logout: () => set({ token: null, userEmail: null }),
      setHasHydrated: (value) => set({ hasHydrated: value }),
    }),
    {
      name: 'inspect-auth',
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    }
  )
)
