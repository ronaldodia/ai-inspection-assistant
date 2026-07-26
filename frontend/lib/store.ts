import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AuthState {
  token: string | null
  userEmail: string | null
  setAuth: (token: string, email: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      userEmail: null,
      setAuth: (token, userEmail) => set({ token, userEmail }),
      logout: () => set({ token: null, userEmail: null }),
    }),
    { name: 'inspect-auth' }
  )
)
