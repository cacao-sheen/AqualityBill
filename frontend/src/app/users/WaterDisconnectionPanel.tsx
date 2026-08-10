'use client'

import { useMemo, useState } from 'react'
import { PowerOff, Power, Search } from 'lucide-react'
import apiClient from '@/lib/axios'

// Matches the shape returned by GET /disconnections (aggregated from billing_records + profiles)
export type DisconnectionCandidate = {
  consumer_id: string
  name: string
  address?: string | null
  mobile?: string | null
  connection_status: 'connected' | 'disconnected'
  total_due: number
  unpaid_bill_count: number
  oldest_due_date: string
  days_overdue: number
}

function formatDisplayDate(value?: string) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function WaterDisconnectionPanel({
  candidates,
  loading,
  error,
  onStatusChange,
}: {
  candidates: DisconnectionCandidate[]
  loading: boolean
  error: string | null
  onStatusChange: (consumerId: string, status: 'connected' | 'disconnected') => void
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const list = q
      ? candidates.filter(
          (c) => c.name.toLowerCase().includes(q) || c.address?.toLowerCase().includes(q)
        )
      : candidates
    return [...list].sort((a, b) => b.days_overdue - a.days_overdue)
  }, [candidates, searchQuery])

  async function toggleConnection(candidate: DisconnectionCandidate) {
    const nextStatus = candidate.connection_status === 'disconnected' ? 'connected' : 'disconnected'
    setPendingId(candidate.consumer_id)
    setActionError(null)

    const previousStatus = candidate.connection_status
    onStatusChange(candidate.consumer_id, nextStatus)

    try {
      await apiClient.patch(`/disconnections/${candidate.consumer_id}/status`, { status: nextStatus })
    } catch (err: any) {
      onStatusChange(candidate.consumer_id, previousStatus)
      setActionError(err?.response?.data?.message || err?.message || 'Failed to update connection status.')
    } finally {
      setPendingId(null)
    }
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
      <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Water Disconnection</h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Consumers with an unpaid bill whose due date passed 2+ days ago appear here automatically.
        </p>
      </div>

      <div className="p-5 border-b border-slate-200 dark:border-slate-800">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
          <input
            type="text"
            placeholder="Search overdue consumers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-10 pl-10 pr-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
      </div>

      {actionError && (
        <div className="mx-5 mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {actionError}
        </div>
      )}

      <div className="overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-400 dark:text-slate-500">Loading overdue consumers...</div>
        ) : error ? (
          <div className="p-8 text-center text-sm text-red-500 dark:text-red-400">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400 dark:text-slate-500">
            {searchQuery ? 'No overdue consumers found matching your search.' : 'No consumers are currently eligible for disconnection.'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Address</th>
                <th className="px-5 py-3">Oldest Due Date</th>
                <th className="px-5 py-3 text-center">Days Overdue</th>
                <th className="px-5 py-3 text-center">Unpaid Bills</th>
                <th className="px-5 py-3 text-right">Total Due</th>
                <th className="px-5 py-3 text-center">Status</th>
                <th className="px-5 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((c) => {
                const isDisconnected = c.connection_status === 'disconnected'
                return (
                  <tr key={c.consumer_id} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                    <td className="px-5 py-3 font-medium text-slate-900 dark:text-slate-100">{c.name}</td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{c.address || '—'}</td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{formatDisplayDate(c.oldest_due_date)}</td>
                    <td className="px-5 py-3 text-center">
                      <span className="inline-flex px-2.5 py-1 rounded-md text-xs font-semibold bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300">
                        {c.days_overdue}d
                      </span>
                    </td>
                    <td className="px-5 py-3 text-center text-slate-600 dark:text-slate-300">{c.unpaid_bill_count}</td>
                    <td className="px-5 py-3 text-right font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                      ₱{c.total_due.toFixed(2)}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <span
                        className={`inline-flex px-2.5 py-1 rounded-md text-xs font-medium ${
                          isDisconnected
                            ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                            : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'
                        }`}
                      >
                        {isDisconnected ? 'Disconnected' : 'Pending Disconnection'}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-center">
                        <button
                          type="button"
                          disabled={pendingId === c.consumer_id}
                          onClick={() => toggleConnection(c)}
                          title={isDisconnected ? 'Reconnect water supply' : 'Disconnect water supply'}
                          className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                            isDisconnected
                              ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20'
                              : 'bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20'
                          }`}
                        >
                          {isDisconnected ? <Power className="h-3.5 w-3.5" /> : <PowerOff className="h-3.5 w-3.5" />}
                          {isDisconnected ? 'Reconnect' : 'Disconnect'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
