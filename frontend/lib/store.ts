import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AuthState {
  token: string | null
  userEmail: string | null
  mustChangePassword: boolean
  hasHydrated: boolean
  setAuth: (token: string, email: string, mustChangePassword: boolean) => void
  setMustChangePassword: (value: boolean) => void
  logout: () => void
  setHasHydrated: (value: boolean) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      userEmail: null,
      mustChangePassword: false,
      hasHydrated: false,
      setAuth: (token, userEmail, mustChangePassword) => set({ token, userEmail, mustChangePassword }),
      setMustChangePassword: (value) => set({ mustChangePassword: value }),
      logout: () => set({ token: null, userEmail: null, mustChangePassword: false }),
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
