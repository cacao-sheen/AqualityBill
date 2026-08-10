import axios from 'axios'
import { supabase } from '@/lib/supabase'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'

const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor — attach Supabase session token
apiClient.interceptors.request.use(
  async (config) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.access_token) {
      config.headers.Authorization = `Bearer ${session.access_token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor to handle errors
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      const originalRequest = error.config as typeof error.config & { _retry?: boolean }

      if (!originalRequest?._retry) {
        originalRequest._retry = true

        try {
          const { data, error: refreshError } = await supabase.auth.refreshSession()
          if (!refreshError && data.session?.access_token) {
            originalRequest.headers = originalRequest.headers || {}
            originalRequest.headers.Authorization = `Bearer ${data.session.access_token}`
            return apiClient(originalRequest)
          }
        } catch {
          // fall through to sign out
        }
      }

      await supabase.auth.signOut()
      if (typeof window !== 'undefined') {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export default apiClient
