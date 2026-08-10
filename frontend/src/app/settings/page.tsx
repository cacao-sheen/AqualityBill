'use client'

import { useState, FormEvent } from 'react'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabase'

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
      </div>
    </AppShell>
  )
}
