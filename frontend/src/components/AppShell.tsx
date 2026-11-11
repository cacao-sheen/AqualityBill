'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import apiClient from '@/lib/axios'
import BrandMark from '@/components/BrandMark'
import {
  LayoutDashboard,
  Receipt,
  Users,
  Wifi,
  Droplets,
  Sun,
  Moon,
  LogOut,
  Settings,
  FileText,
  Wrench,
  Bell,
  X,
  UserCheck,
  Menu,
} from 'lucide-react'

const navItems = [
  { label: 'Dashboard',      href: '/dashboard',    icon: <LayoutDashboard className="h-5 w-5" /> },
  { label: 'Billing',        href: '/bills',        icon: <Receipt         className="h-5 w-5" /> },
  { label: 'Consumers',      href: '/users',        icon: <Users           className="h-5 w-5" /> },
  { label: 'Account Requests', href: '/account-requests', icon: <UserCheck className="h-5 w-5" /> },
  { label: 'IoT Monitoring', href: '/iot',          icon: <Wifi            className="h-5 w-5" /> },
  { label: 'Leak Reports',   href: '/leak-reports', icon: <Droplets        className="h-5 w-5" /> },
  { label: 'Installations',  href: '/installations', icon: <Wrench        className="h-5 w-5" /> },
  { label: 'Reports',        href: '/reports',     icon: <FileText        className="h-5 w-5" /> },
  { label: 'Settings',       href: '/settings',     icon: <Settings        className="h-5 w-5" /> },
]

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, isAuthenticated, loading, initialize, logout } = useAuthStore()
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [toastVisible, setToastVisible] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  // Close the mobile menu whenever the page changes
  useEffect(() => {
    setMobileNavOpen(false)
  }, [pathname])

  // Stop the page behind the open mobile menu from scrolling
  useEffect(() => {
    if (!mobileNavOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileNavOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [mobileNavOpen])

  // Initialize Supabase auth session listener
  useEffect(() => {
    let cleanup: (() => void) | undefined
    initialize().then((unsub) => { cleanup = unsub })
    return () => { cleanup?.() }
  }, [initialize])

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.replace('/login')
    }
  }, [loading, isAuthenticated, router])

  useEffect(() => {
    const storedTheme = localStorage.getItem('theme')
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const initialTheme = (storedTheme || (prefersDark ? 'dark' : 'light')) as 'light' | 'dark'
    setTheme(initialTheme)
    document.documentElement.classList.toggle('dark', initialTheme === 'dark')
  }, [])

  useEffect(() => {
    let timeoutId: number | undefined

    function toNumber(value: unknown) {
      const numberValue = Number(value)
      return Number.isFinite(numberValue) ? numberValue : null
    }

    function formatTimestamp(value?: string | null) {
      if (!value) return '—'
      const parsed = new Date(value)
      if (Number.isNaN(parsed.getTime())) return '—'
      return parsed.toLocaleString('en-PH', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    }

    async function loadMlNotification() {
      // Check last notification time to prevent spam
      const lastNotificationTime = document.cookie
        .split('; ')
        .find(row => row.startsWith('lastNotificationTime='))
        ?.split('=')[1]

      const THIRTY_MINUTES = 30 * 60 * 1000
      if (lastNotificationTime && Date.now() - parseInt(lastNotificationTime) < THIRTY_MINUTES) {
        return // Skip notification if shown recently
      }

      try {
        const [latestRes, forecastRes] = await Promise.all([
          apiClient.get('/iot/latest'),
          apiClient.get('/iot/forecast/latest?seq_length=150&horizon_seconds=600').catch((error) => {
            if (error?.response?.status === 400) return null
            throw error
          }),
        ])

        const latestRow = latestRes.data?.data ?? {}
        const forecast = forecastRes?.data

        const ph = toNumber(latestRow.ph)
        const turbidity = toNumber(latestRow.turbidity)
        const tds = toNumber(latestRow.tds_ppm ?? latestRow.tds ?? latestRow.total_dissolved_solids ?? latestRow.totalDissolvedSolids)
        const temperature = toNumber(latestRow.temperature_c)
        const timestamp = formatTimestamp(latestRow.timestamp)

        const messages: string[] = []

        if (forecast?.is_abnormal) {
          messages.push('ML forecast flags abnormal conditions for the next reading.')
        }

        if (ph !== null && (ph < 6.5 || ph > 8.5)) {
          messages.push(`Latest pH reading is outside the safe range (${ph.toFixed(2)}).`)
        }

        if (turbidity !== null && turbidity > 5) {
          messages.push(`Latest turbidity reading is above normal (${turbidity.toFixed(2)} NTU).`)
        }

        if (tds !== null && tds > 500) {
          messages.push(`Latest TDS reading is above normal (${tds.toFixed(0)} ppm).`)
        }

        if (temperature !== null && temperature > 36) {
          messages.push(`Latest temperature reading is above normal (${temperature.toFixed(1)}°C).`)
        }

        if (messages.length > 0) {
          setToastMessage(`${messages[0]} Last update: ${timestamp}`)
          setToastVisible(true)
          
          // Save notification time
          document.cookie = `lastNotificationTime=${Date.now()}; max-age=86400; path=/`
          
          timeoutId = window.setTimeout(() => {
            setToastVisible(false)
          }, 4000)
        }
      } catch (err) {
        console.error('ML notification error:', err)
      }
    }

    loadMlNotification()

    return () => {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId)
      }
    }
  }, [])

  function toggleTheme() {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark'
      document.documentElement.classList.toggle('dark', next === 'dark')
      localStorage.setItem('theme', next)
      return next
    })
  }

  if (loading || !isAuthenticated) return null

  const sidebarContent = (
    <>
      <div className="px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <BrandMark className="h-8 w-8" />
          <span className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">AqualityBill</span>
        </div>
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setMobileNavOpen(false)}
          className="lg:hidden h-8 w-8 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const active = pathname === item.href
          return (
            <Link
              key={item.label}
              href={item.href}
              onClick={() => setMobileNavOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 lg:py-2 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-primary-50 text-primary-700 dark:bg-slate-800 dark:text-slate-100'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <span className={active ? 'text-primary-600' : 'text-slate-400 dark:text-slate-500'}>{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>
      <div className="p-4 text-xs text-slate-400 dark:text-slate-500">Aquality Cooperative © {new Date().getFullYear()}</div>
    </>
  )

  return (
    <div className="h-[100dvh] overflow-hidden bg-gray-50 dark:bg-slate-950 flex">
      {/* Sidebar (desktop) */}
      <aside className="hidden lg:flex lg:flex-col w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shrink-0">
        {sidebarContent}
      </aside>

      {/* Sidebar (mobile drawer) */}
      <div
        className={`lg:hidden fixed inset-0 z-40 bg-black/50 transition-opacity ${mobileNavOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setMobileNavOpen(false)}
        aria-hidden="true"
      />
      <aside
        className={`lg:hidden fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] flex flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-xl transition-transform duration-200 ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Navigation menu"
        aria-hidden={!mobileNavOpen}
      >
        {sidebarContent}
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 px-4 sm:px-6 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              aria-label="Open menu"
              aria-expanded={mobileNavOpen}
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden -ml-1 h-9 w-9 shrink-0 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Menu className="h-5 w-5" />
            </button>
            <BrandMark className="lg:hidden h-7 w-7 shrink-0" />
            <h1 className="hidden sm:block text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{user?.email || 'Administrator'}</h1>
            <span className="sm:hidden text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight">AqualityBill</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <Link
              href="/notifications"
              aria-label="View notifications"
              className="h-8 w-8 rounded-full border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <Bell className="h-4 w-4" />
            </Link>
            <button
              type="button"
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              onClick={toggleTheme}
              className="h-8 w-8 rounded-full border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={async () => {
                await logout()
                router.push('/login')
              }}
              aria-label="Logout"
              className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-300 hover:text-slate-700 dark:hover:text-slate-100 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </header>

        <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 sm:p-6">
          {toastVisible && toastMessage ? (
            <div className="fixed top-4 left-4 right-4 sm:left-auto z-50 sm:max-w-sm rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-semibold dark:bg-blue-500/10 dark:text-blue-300">
                  ML
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{toastMessage}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Auto-dismisses in 4 seconds</p>
                </div>
                <button
                  type="button"
                  aria-label="Close notification"
                  onClick={() => setToastVisible(false)}
                  className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  )
}
