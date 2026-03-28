import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User, AuthTokens, LoginCredentials, RegisterData } from '../types'
import { authApi } from '../services/api'

interface AuthState {
  user: User | null
  tokens: AuthTokens | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (credentials: LoginCredentials) => Promise<void>
  register: (data: RegisterData) => Promise<void>
  logout: () => void
  initAuth: () => Promise<void>
  setUser: (user: User) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      tokens: null,
      isAuthenticated: false,
      isLoading: false,

      login: async (credentials: LoginCredentials) => {
        set({ isLoading: true })
        try {
          const { user, accessToken, refreshToken } = await authApi.login(credentials)
          localStorage.setItem('accessToken', accessToken)
          localStorage.setItem('refreshToken', refreshToken)
          set({ user, tokens: { accessToken, refreshToken }, isAuthenticated: true, isLoading: false })
        } catch (error) {
          set({ isLoading: false })
          throw error
        }
      },

      register: async (data: RegisterData) => {
        set({ isLoading: true })
        try {
          const { user, accessToken, refreshToken } = await authApi.register(data)
          localStorage.setItem('accessToken', accessToken)
          localStorage.setItem('refreshToken', refreshToken)
          set({ user, tokens: { accessToken, refreshToken }, isAuthenticated: true, isLoading: false })
        } catch (error) {
          set({ isLoading: false })
          throw error
        }
      },

      logout: () => {
        localStorage.removeItem('accessToken')
        localStorage.removeItem('refreshToken')
        set({ user: null, tokens: null, isAuthenticated: false })
      },

      initAuth: async () => {
        const accessToken = localStorage.getItem('accessToken')
        if (!accessToken) {
          set({ isAuthenticated: false })
          return
        }
        set({ isLoading: true })
        try {
          const user = await authApi.getMe()
          const { tokens } = get()
          set({ user, isAuthenticated: true, isLoading: false, tokens })
        } catch {
          localStorage.removeItem('accessToken')
          localStorage.removeItem('refreshToken')
          set({ user: null, tokens: null, isAuthenticated: false, isLoading: false })
        }
      },

      setUser: (user: User) => set({ user }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ user: state.user, tokens: state.tokens, isAuthenticated: state.isAuthenticated }),
    },
  ),
)
