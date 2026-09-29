'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, X, AlertTriangle } from 'lucide-react'
import AppShell from '@/components/AppShell'
import apiClient from '@/lib/axios'

type MatchedProfile = {
  id: string
  name: string | null
  meter_no: string
  already_linked: boolean
  email: string | null
  mobile: string | null
}

type ClaimRequest = {
  id: string
  auth_user_id: string
  meter_no: string
  full_name: string | null
  email: string | null
  phone: string | null
  status: 'pending' | 'approved' | 'rejected'
  admin_note: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  matched_profile: MatchedProfile | null
}

type StatusFilter = 'pending' | 'approved' | 'rejected' | 'all'

const statusStyles: Record<string, string> = {
  pending: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300',
  approved: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300',
  rejected: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300',
}

function formatDate(value?: string | null) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function AccountRequestsPage() {
  const [requests, setRequests] = useState<ClaimRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending')
  const [pendingActionId, setPendingActionId] = useState<string | null>(null)
  const [rejectTarget, setRejectTarget] = useState<ClaimRequest | null>(null)
  const [rejectNote, setRejectNote] = useState('')

  async function fetchRequests() {
    setLoading(true)
    try {
      const res = await apiClient.get('/account-claims')
      setRequests(res?.data?.data ?? [])
      setErrorMessage(null)
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || error?.message || 'Failed to load account requests.')
      setRequests([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRequests()
  }, [])

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return requests
    return requests.filter((r) => r.status === statusFilter)
  }, [requests, statusFilter])

  const pendingCount = useMemo(() => requests.filter((r) => r.status === 'pending').length, [requests])

  async function approve(request: ClaimRequest) {
    setPendingActionId(request.id)
    setErrorMessage(null)
    try {
      const res = await apiClient.patch(`/account-claims/${request.id}/approve`)
      const updated = res?.data?.data
      setRequests((prev) => prev.map((r) => (r.id === request.id ? { ...r, ...updated } : r)))
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || error?.message || 'Failed to approve this request.')
    } finally {
      setPendingActionId(null)
    }
  }

  function openReject(request: ClaimRequest) {
    setRejectTarget(request)
    setRejectNote('')
  }

  async function confirmReject() {
    if (!rejectTarget) return
    setPendingActionId(rejectTarget.id)
    setErrorMessage(null)
    try {
      const res = await apiClient.patch(`/account-claims/${rejectTarget.id}/reject`, { note: rejectNote.trim() || undefined })
      const updated = res?.data?.data
      setRequests((prev) => prev.map((r) => (r.id === rejectTarget.id ? { ...r, ...updated } : r)))
      setRejectTarget(null)
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || error?.message || 'Failed to reject this request.')
    } finally {
      setPendingActionId(null)
    }
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Account Requests</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Review consumers who signed up in the mobile app and claimed an existing meter number, then bind their account to the matching record.
          </p>
        </div>

        {errorMessage && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
            {errorMessage}
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {(['pending', 'approved', 'rejected', 'all'] as StatusFilter[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setStatusFilter(option)}
                className={`h-9 px-4 rounded-lg text-xs font-semibold uppercase transition-colors ${
                  statusFilter === option
                    ? 'bg-primary-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                {option}
                {option === 'pending' && pendingCount > 0 ? ` (${pendingCount})` : ''}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="text-sm text-slate-500 dark:text-slate-400">Loading account requests...</div>
          ) : filtered.length === 0 ? (
            <div className="text-sm text-slate-500 dark:text-slate-400">
              {statusFilter === 'pending'
                ? 'No pending account requests. New signups that claim a meter number will show up here.'
                : 'No account requests match the selected filter.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-slate-200 dark:border-slate-800 text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-2 text-left">Submitted</th>
                    <th className="px-3 py-2 text-left">Meter No.</th>
                    <th className="px-3 py-2 text-left">Submitted By</th>
                    <th className="px-3 py-2 text-left">Matched Profile</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {filtered.map((request) => {
                    const profile = request.matched_profile
                    const busy = pendingActionId === request.id
                    return (
                      <tr key={request.id} className="align-top text-slate-700 dark:text-slate-200">
                        <td className="px-3 py-3 text-xs text-slate-500 dark:text-slate-400">{formatDate(request.created_at)}</td>
                        <td className="px-3 py-3 font-mono text-xs font-semibold">{request.meter_no}</td>
                        <td className="px-3 py-3">
                          <div className="font-medium">{request.full_name || 'Unnamed'}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">{request.email || 'No email'}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">{request.phone || 'No phone'}</div>
                        </td>
                        <td className="px-3 py-3">
                          {profile ? (
                            <>
                              <div className="font-medium">{profile.name || 'Unnamed on file'}</div>
                              {profile.already_linked && (
                                <div className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
                                  <AlertTriangle className="h-3.5 w-3.5" /> Already linked to an account
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 dark:text-rose-400">
                              <AlertTriangle className="h-3.5 w-3.5" /> No profile with this meter number
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase ${statusStyles[request.status]}`}>
                            {request.status}
                          </span>
                          {request.status === 'rejected' && request.admin_note && (
                            <div className="mt-1 max-w-[200px] text-xs text-slate-500 dark:text-slate-400">{request.admin_note}</div>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {request.status === 'pending' ? (
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                disabled={busy || !profile || profile.already_linked}
                                title={!profile ? 'No matching profile found' : profile.already_linked ? 'Meter already linked to an account' : 'Approve'}
                                onClick={() => approve(request)}
                                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20 transition-colors"
                              >
                                <Check className="h-3.5 w-3.5" /> Approve
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => openReject(request)}
                                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20 transition-colors"
                              >
                                <X className="h-3.5 w-3.5" /> Reject
                              </button>
                            </div>
                          ) : (
                            <div className="text-xs text-slate-400 dark:text-slate-500">
                              {request.reviewed_by ? `by ${request.reviewed_by}` : ''}
                              {request.reviewed_at ? <div>{formatDate(request.reviewed_at)}</div> : null}
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Reject Account Request</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Meter {rejectTarget.meter_no} — {rejectTarget.full_name || 'Unnamed'}
              </p>
            </div>
            <div className="p-5">
              <label htmlFor="reject-note" className="text-xs font-medium text-slate-600 dark:text-slate-300">Reason (optional)</label>
              <textarea
                id="reject-note"
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                rows={3}
                placeholder="e.g. Name doesn't match our record for this meter number"
                className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            </div>
            <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectTarget(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmReject}
                disabled={pendingActionId === rejectTarget.id}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-60"
              >
                Reject Request
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}
