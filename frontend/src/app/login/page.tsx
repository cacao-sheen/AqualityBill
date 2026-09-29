'use client'

import { useState, useEffect, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { Mail, Lock, Eye, EyeOff, Droplets, Activity, ShieldCheck, Smartphone } from 'lucide-react'
import BrandMark from '@/components/BrandMark'

// This page is always dark-mode, regardless of the admin's theme preference
// elsewhere in the app — it's the first thing anyone sees, logged out, so it
// shouldn't depend on a localStorage/system setting that hasn't loaded yet.
export default function LoginPage() {
  const router = useRouter()
  const login = useAuthStore((s) => s.login)
  const initialize = useAuthStore((s) => s.initialize)

  useEffect(() => {
    let cleanup: (() => void) | undefined
    initialize().then((unsub) => { cleanup = unsub })
    return () => { cleanup?.() }
  }, [initialize])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      router.push('/dashboard')
    } catch (err: unknown) {
      const message =
        (err as { message?: string })?.message || 'Invalid email or password.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen relative overflow-hidden flex flex-col items-center justify-center bg-gradient-to-br from-primary-500 via-primary-700 to-slate-900 p-4 sm:p-8">
      {/* Soft blurred glows for an abstract gradient-mesh feel */}
      <div className="pointer-events-none absolute -top-32 -left-20 h-[28rem] w-[28rem] rounded-full bg-white/10 blur-[100px]" />
      <div className="pointer-events-none absolute top-1/4 -right-16 h-[26rem] w-[26rem] rounded-full bg-cyan-300/20 blur-[100px]" />
      <div className="pointer-events-none absolute -bottom-24 left-1/4 h-[24rem] w-[24rem] rounded-full bg-primary-300/20 blur-[100px]" />

      <div className="relative z-10 w-full max-w-5xl rounded-3xl shadow-2xl overflow-hidden flex flex-col lg:flex-row bg-slate-900 lg:min-h-[620px]">
        {/* Left: decorative brand panel */}
        <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-primary-500 via-primary-700 to-slate-900 flex-col justify-between p-12 text-white">
          {/* Dot grid */}
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage: 'radial-gradient(rgba(255,255,255,0.9) 1px, transparent 1px)',
              backgroundSize: '22px 22px',
            }}
          />

          {/* Soft glow shapes */}
          <div className="absolute -top-24 -left-16 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute top-1/3 -right-10 h-64 w-64 rounded-full bg-cyan-300/20 blur-3xl" />

          {/* Bottom wave */}
          <svg
            className="absolute bottom-0 left-0 w-full text-white/10"
            viewBox="0 0 600 300"
            fill="currentColor"
            preserveAspectRatio="none"
          >
            <path d="M0 180C120 240 260 60 420 120C500 148 560 220 600 200V300H0V180Z" />
          </svg>
          <svg
            className="absolute bottom-0 left-0 w-full text-white/5"
            viewBox="0 0 600 300"
            fill="currentColor"
            preserveAspectRatio="none"
          >
            <path d="M0 220C140 160 300 260 460 200C520 178 570 190 600 210V300H0V220Z" />
          </svg>

          <div className="relative z-10 flex items-center gap-3">
            <BrandMark className="h-10 w-10" />
            <span className="text-xl font-bold tracking-tight">AqualityBill</span>
          </div>

          <div className="relative z-10 max-w-sm">
            <h1 className="text-4xl font-bold leading-tight tracking-tight">
              Clarity in<br />every drop.
            </h1>
            <p className="mt-4 text-sm text-primary-50/80 leading-relaxed">
              The admin console for managing billing, water quality, and service
              requests across your community — all in one place.
            </p>

            <div className="mt-8 space-y-3">
              {[
                { icon: <Activity className="h-4 w-4" />, text: 'Real-time IoT water quality monitoring' },
                { icon: <Droplets className="h-4 w-4" />, text: 'Automated billing and consumption tracking' },
                { icon: <ShieldCheck className="h-4 w-4" />, text: 'Admin-reviewed consumer account access' },
              ].map((item) => (
                <div key={item.text} className="flex items-center gap-3 text-sm text-primary-50/90">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10">
                    {item.icon}
                  </span>
                  {item.text}
                </div>
              ))}
            </div>
          </div>

          <p className="relative z-10 text-xs text-primary-50/60">
            Aquality Cooperative © {new Date().getFullYear()}
          </p>
        </div>

        {/* Right: form */}
        <div className="flex flex-1 items-center justify-center px-6 py-12 sm:px-12">
          <div className="w-full max-w-sm">
            <div className="flex flex-col items-center text-center mb-6 lg:hidden">
              <BrandMark className="h-11 w-11" />
              <span className="mt-2 text-lg font-bold text-slate-100 tracking-tight">
                AqualityBill
              </span>
            </div>

            <h2 className="text-2xl font-semibold text-slate-100">
              Hello! Welcome back
            </h2>
            <p className="mt-1.5 text-sm text-slate-400">
              Sign in to access the admin dashboard.
            </p>

            {error && (
              <div className="mt-6 rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-slate-300 mb-1.5"
                >
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email address"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 pl-10 pr-3 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-slate-300 mb-1.5"
                >
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 pl-10 pr-10 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 text-sm text-slate-300 select-none cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-600 text-primary-600 focus:ring-primary-500"
                  />
                  Remember me
                </label>
                <button
                  type="button"
                  onClick={() => setError('Password resets aren’t self-service yet — contact another admin to reset your password.')}
                  className="text-sm font-medium text-primary-400 hover:text-primary-300 transition"
                >
                  Forgot password?
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-primary-600 hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold py-3 transition focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-slate-900"
              >
                {loading ? 'Signing in…' : 'Login'}
              </button>
            </form>

            <p className="mt-6 text-center text-xs text-slate-500 lg:hidden">
              Aquality Cooperative © {new Date().getFullYear()}
            </p>
          </div>
        </div>
      </div>

      <Link
        href="/download"
        className="relative z-10 mt-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white/90 backdrop-blur-sm hover:bg-white/20 hover:text-white transition"
      >
        <Smartphone className="h-4 w-4" />
        Download the AqualityBill mobile app
      </Link>
    </div>
  )
}
