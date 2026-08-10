import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { User, Session } from '@supabase/supabase-js'

interface AuthState {
  user: User | null
  session: Session | null
  isAuthenticated: boolean
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  initialize: () => Promise<() => void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  isAuthenticated: false,
  loading: true,

  login: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error

    // Block non-admin accounts
    if (data.user?.user_metadata?.role !== 'admin') {
      await supabase.auth.signOut()
      throw new Error('Access denied. This portal is for admins only.')
    }

    set({ user: data.user, session: data.session, isAuthenticated: true, loading: false })
  },

  logout: async () => {
    await supabase.auth.signOut()
    set({ user: null, session: null, isAuthenticated: false, loading: false })
  },

  initialize: async () => {
    const { data: { session } } = await supabase.auth.getSession()

    const isAdmin = session?.user?.user_metadata?.role === 'admin'
    if (session && !isAdmin) await supabase.auth.signOut()
    set({
      user: isAdmin ? session!.user : null,
      session: isAdmin ? session : null,
      isAuthenticated: isAdmin,
      loading: false,
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const isAdmin = session?.user?.user_metadata?.role === 'admin'
      if (session && !isAdmin) {
        supabase.auth.signOut()
        set({ user: null, session: null, isAuthenticated: false, loading: false })
        return
      }
      set({ user: session?.user ?? null, session, isAuthenticated: isAdmin, loading: false })
    })

    return () => subscription.unsubscribe()
  },
}))
