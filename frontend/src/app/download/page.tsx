'use client'

import { useState, FormEvent } from 'react'
import Link from 'next/link'
import { Download, ArrowLeft, ShieldCheck, Smartphone, Droplet, ClipboardList, Lock, X } from 'lucide-react'
import BrandMark from '@/components/BrandMark'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'

const APPS = [
  {
    key: 'consumer',
    name: 'AqualityBill',
    tagline: 'For consumers',
    description: 'View your water bill, check your payment status, and report leaks from your phone.',
    apkPath: '/downloads/aqualitybill.apk',
    locked: false,
    icon: <Droplet className="h-6 w-6" />,
    iconClass: 'bg-primary-500/10 text-primary-400',
  },
  {
    key: 'collector',
    name: 'AquaBilling',
    tagline: 'For collectors',
    description: 'For water meter collectors — record readings and manage on-the-ground bill collection. Metolza staff only.',
    apkPath: null,
    locked: true,
    icon: <ClipboardList className="h-6 w-6" />,
    iconClass: 'bg-emerald-500/10 text-emerald-400',
  },
] as const

// Always dark-mode, same as /login — public-facing, not gated behind the
// admin's theme preference.
export default function DownloadPage() {
  const [passwordModalOpen, setPasswordModalOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [downloading, setDownloading] = useState(false)

  function openPasswordModal() {
    setPassword('')
    setPasswordError('')
    setPasswordModalOpen(true)
  }

  async function submitPassword(e: FormEvent) {
    e.preventDefault()
    setDownloading(true)
    setPasswordError('')

    try {
      const res = await fetch(`${API_URL}/downloads/collector-app`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.message || 'Incorrect password.')
      }

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'AquaBilling.apk'
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)

      setPasswordModalOpen(false)
    } catch (err: unknown) {
      const message = (err as { message?: string })?.message || 'Something went wrong. Try again.'
      setPasswordError(message)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="h-screen overflow-x-hidden overflow-y-auto relative flex flex-col items-center justify-center gap-6 bg-gradient-to-br from-primary-500 via-primary-700 to-slate-900 px-4 py-6">
      <div className="pointer-events-none absolute -top-32 -left-20 h-[28rem] w-[28rem] rounded-full bg-white/10 blur-[100px]" />
      <div className="pointer-events-none absolute top-1/4 -right-16 h-[26rem] w-[26rem] rounded-full bg-cyan-300/20 blur-[100px]" />
      <div className="pointer-events-none absolute -bottom-24 left-1/4 h-[24rem] w-[24rem] rounded-full bg-primary-300/20 blur-[100px]" />

      <div className="relative z-10 flex flex-col items-center text-center max-w-md">
        <BrandMark className="h-11 w-11" />
        <h1 className="mt-3 text-2xl font-bold text-white tracking-tight">
          Download Our Apps
        </h1>
        <p className="mt-1.5 text-sm text-primary-50/80 leading-relaxed">
          Two apps for AqualityBill Cooperative — one for consumers, one for
          meter collectors.
        </p>
      </div>

      <div className="relative z-10 flex flex-col sm:flex-row gap-6 w-full max-w-3xl justify-center">
        {APPS.map((app) => (
          <div
            key={app.key}
            className="flex-1 sm:max-w-sm min-h-[300px] rounded-3xl shadow-2xl bg-slate-900 p-7 flex flex-col items-center text-center"
          >
            <div className="flex flex-col items-center">
              <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${app.iconClass}`}>
                {app.icon}
              </span>
              <h2 className="mt-3.5 text-lg font-semibold text-slate-100">{app.name}</h2>
              <span className="mt-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                {app.tagline}
              </span>
              <p className="mt-3 mb-6 text-sm text-slate-400 leading-relaxed">
                {app.description}
              </p>
            </div>

            {app.locked ? (
              <button
                type="button"
                onClick={openPasswordModal}
                className="mt-auto w-full flex items-center justify-center gap-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold py-3 transition"
              >
                <Lock className="h-4 w-4" />
                Staff Download
              </button>
            ) : (
              <a
                href={app.apkPath ?? undefined}
                download
                className="mt-auto w-full flex items-center justify-center gap-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold py-3 transition"
              >
                <Download className="h-4 w-4" />
                Download for Android
              </a>
            )}
          </div>
        ))}
      </div>

      <div className="relative z-10 max-w-md space-y-2 text-left">
        <div className="flex items-start gap-2.5 text-xs text-primary-50/80">
          <Smartphone className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            Neither app is on the Google Play Store yet — open the downloaded
            file and tap <span className="font-semibold text-white">Install anyway</span> when Android warns you.
          </span>
        </div>
        <div className="flex items-start gap-2.5 text-xs text-primary-50/80">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            Already have a bill with us? Use your meter number to link your
            account after signing up in the AqualityBill app.
          </span>
        </div>
      </div>

      <Link
        href="/login"
        className="relative z-10 inline-flex items-center gap-1.5 text-sm font-medium text-primary-50/80 hover:text-white transition"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to admin login
      </Link>

      {passwordModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                  <Lock className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">Collector Access Only</h3>
                  <p className="text-xs text-slate-400">Metolza staff password required</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPasswordModalOpen(false)}
                aria-label="Close"
                className="text-slate-500 hover:text-slate-300 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={submitPassword} className="mt-5 space-y-3">
              <input
                type="password"
                autoFocus
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter staff password"
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition"
              />

              {passwordError && (
                <p className="text-xs text-red-400">{passwordError}</p>
              )}

              <button
                type="submit"
                disabled={downloading}
                className="w-full rounded-xl bg-primary-600 hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 transition"
              >
                {downloading ? 'Checking…' : 'Download'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
