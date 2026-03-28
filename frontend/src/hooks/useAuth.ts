import { useAuthStore } from '../store/authStore'
import { authApi } from '../services/api'
import type { RegisterData } from '../types'

export function useAuth() {
  const { user, isAuthenticated, isLoading, login, logout } = useAuthStore()

  const register = async (data: RegisterData) => {
    const { tokens } = await authApi.register(data)
    localStorage.setItem('accessToken', tokens.accessToken)
    localStorage.setItem('refreshToken', tokens.refreshToken)
    const me = await authApi.getMe()
    useAuthStore.setState({ user: me, tokens, isAuthenticated: true })
  }

  return { user, isAuthenticated, isLoading, login, logout, register }
}
