import { useAuthStore } from '../store/authStore'
import { authApi } from '../services/api'
import type { RegisterData } from '../types'

export function useAuth() {
  const { user, isAuthenticated, isLoading, login, logout } = useAuthStore()

  const register = async (data: RegisterData) => {
    const { accessToken, refreshToken } = await authApi.register(data)
    const tokens = { accessToken, refreshToken }
    localStorage.setItem('accessToken', accessToken)
    localStorage.setItem('refreshToken', refreshToken)
    const me = await authApi.getMe()
    useAuthStore.setState({ user: me, tokens, isAuthenticated: true })
  }

  return { user, isAuthenticated, isLoading, login, logout, register }
}
