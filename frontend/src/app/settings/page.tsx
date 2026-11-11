'use client'

import { useEffect, useState, FormEvent } from 'react'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabase'
import apiClient from '@/lib/axios'
import { Eye, EyeOff } from 'lucide-react'

type PinStatus = { configured: boolean; updatedAt: string | null; updatedBy: string | null }

const inputClass =
  'w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition'

function StatusBox({ status }: { status: { type: 'success' | 'error'; msg: string } }) {
  return (
    <div className={`rounded-lg px-4 py-3 text-sm border ${status.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300' : 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300'}`}>
      {status.msg}
    </div>
  )
}

// Password-style input with an eye button to show/hide what's been typed.
function RevealInput({
  value,
  onChange,
  placeholder,
  numeric = false,
  autoComplete = 'off',
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  numeric?: boolean
  autoComplete?: string
}) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        inputMode={numeric ? 'numeric' : undefined}
        autoComplete={autoComplete}
        required
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClass} pr-11 ${numeric ? 'tracking-[0.4em]' : ''}`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide' : 'Show'}
        title={visible ? 'Hide' : 'Show'}
        className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:text-slate-500 dark:hover:text-slate-300 dark:hover:bg-slate-700 transition-colors"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
}

// The 6-digit PIN collectors enter to open the collector (billing) app.
// Only admins can set it; the backend stores just a hash of it.
function CollectorPinCard() {
  const [pinStatus, setPinStatus] = useState<PinStatus | null>(null)
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    apiClient.get('/collector-pin')
      .then((res) => setPinStatus(res.data))
      .catch(() => setPinStatus(null))
  }, [])

  const digitsOnly = (value: string) => value.replace(/\D/g, '').slice(0, 6)

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    setStatus(null)
    if (!/^\d{6}$/.test(pin)) {
      setStatus({ type: 'error', msg: 'The PIN must be exactly 6 digits.' })
      return
    }
    if (pin !== confirmPin) {
      setStatus({ type: 'error', msg: 'The two PINs do not match.' })
      return
    }

    setLoading(true)
    try {
      // Confirm it's really the admin before changing what every collector types in.
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) throw new Error('No active session. Please log in again.')
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: user.email, password: adminPassword })
      if (signInError) throw new Error('Admin password is incorrect.')

      const res = await apiClient.put('/collector-pin', { pin })
      setPinStatus(res.data)
      setStatus({
        type: 'success',
        msg: pinStatus?.configured
          ? 'Collector PIN changed. Collectors must use the new PIN from now on.'
          : 'Collector PIN set. Collectors can now unlock the app with it.',
      })
      setPin('')
      setConfirmPin('')
      setAdminPassword('')
    } catch (err: any) {
      setStatus({ type: 'error', msg: err?.response?.data?.message || err?.message || 'Failed to save the PIN.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
      <div>
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Collector App PIN</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Collectors must enter this 6-digit PIN to open the collector (billing) app.
        </p>
        <p className="mt-2 text-xs">
          {pinStatus === null ? (
            <span className="text-slate-400 dark:text-slate-500">Checking PIN status…</span>
          ) : pinStatus.configured ? (
            <span className="text-emerald-600 dark:text-emerald-400">
              PIN is set · last changed {pinStatus.updatedAt ? new Date(pinStatus.updatedAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
              {pinStatus.updatedBy ? ` by ${pinStatus.updatedBy}` : ''}
            </span>
          ) : (
            <span className="text-amber-600 dark:text-amber-400">
              No PIN set yet — collectors can’t open the app until you set one.
            </span>
          )}
        </p>
      </div>

      {status && <StatusBox status={status} />}

      <form onSubmit={handleSave} className="space-y-3">
        <RevealInput
          numeric
          placeholder={pinStatus?.configured ? 'New 6-digit PIN' : '6-digit PIN'}
          value={pin}
          onChange={(v) => setPin(digitsOnly(v))}
        />
        <RevealInput
          numeric
          placeholder="Confirm PIN"
          value={confirmPin}
          onChange={(v) => setConfirmPin(digitsOnly(v))}
        />
        <RevealInput
          placeholder="Your admin password"
          autoComplete="current-password"
          value={adminPassword}
          onChange={setAdminPassword}
        />
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Avoid easy PINs like 123456 or 000000; they’re rejected. The saved PIN can’t be shown
          later (only a scrambled copy is stored), so note it down before saving. If it’s
          forgotten, just set a new one.
        </p>
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold px-5 py-2.5 transition"
        >
          {loading ? 'Saving…' : pinStatus?.configured ? 'Change PIN' : 'Set PIN'}
        </button>
      </form>
    </div>
  )
}

export default function SettingsPage() {
  const [email, setEmail] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [emailStatus, setEmailStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [passStatus, setPassStatus]   = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [emailLoading, setEmailLoading] = useState(false)
  const [passLoading, setPassLoading]   = useState(false)

  async function handleEmailUpdate(e: FormEvent) {
    e.preventDefault()
    setEmailStatus(null)
    setEmailLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ email })
      if (error) throw error
      setEmailStatus({ type: 'success', msg: 'Confirmation sent to your new email. Check your inbox.' })
      setEmail('')
    } catch (err: unknown) {
      setEmailStatus({ type: 'error', msg: (err as Error).message })
    } finally {
      setEmailLoading(false)
    }
  }

  async function handlePasswordUpdate(e: FormEvent) {
    e.preventDefault()
    setPassStatus(null)

    if (newPassword !== confirmPassword) {
      setPassStatus({ type: 'error', msg: 'New passwords do not match.' })
      return
    }
    if (newPassword.length < 6) {
      setPassStatus({ type: 'error', msg: 'Password must be at least 6 characters.' })
      return
    }

    setPassLoading(true)
    try {
      // Re-authenticate first to verify current password
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) throw new Error('No active session.')

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      })
      if (signInError) throw new Error('Current password is incorrect.')

      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error

      setPassStatus({ type: 'success', msg: 'Password updated successfully.' })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: unknown) {
      setPassStatus({ type: 'error', msg: (err as Error).message })
    } finally {
      setPassLoading(false)
    }
  }

  return (
    <AppShell>
      <div className="space-y-6 max-w-lg">
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400">Admin Account</p>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Settings</h2>
        </div>

        {/* Email */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Change Email</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">A confirmation link will be sent to the new address.</p>
          </div>

          {emailStatus && (
            <div className={`rounded-lg px-4 py-3 text-sm border ${emailStatus.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300' : 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300'}`}>
              {emailStatus.msg}
            </div>
          )}

          <form onSubmit={handleEmailUpdate} className="space-y-3">
            <input
              type="email"
              required
              placeholder="New email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            />
            <button
              type="submit"
              disabled={emailLoading}
              className="rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold px-5 py-2.5 transition"
            >
              {emailLoading ? 'Updating…' : 'Update Email'}
            </button>
          </form>
        </div>

        {/* Password */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Change Password</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">Enter your current password to confirm.</p>
          </div>

          {passStatus && (
            <div className={`rounded-lg px-4 py-3 text-sm border ${passStatus.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300' : 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300'}`}>
              {passStatus.msg}
            </div>
          )}

          <form onSubmit={handlePasswordUpdate} className="space-y-3">
            <input
              type="password"
              required
              placeholder="Current password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            />
            <input
              type="password"
              required
              placeholder="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            />
            <input
              type="password"
              required
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            />
            <button
              type="submit"
              disabled={passLoading}
              className="rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold px-5 py-2.5 transition"
            >
              {passLoading ? 'Updating…' : 'Update Password'}
            </button>
          </form>
        </div>

        <CollectorPinCard />
      </div>
    </AppShell>
  )
}
