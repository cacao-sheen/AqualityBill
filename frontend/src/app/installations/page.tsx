'use client'

import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import AppShell from '@/components/AppShell'
import apiClient from '@/lib/axios'

type InstallationRequest = {
  id: string
  requester_name?: string | null
  profile_id?: string | null
  contact?: string | null
  address?: string | null
  request_date?: string | null
  note?: string | null
  email?: string | null
  status?: string | null
}

type InstallationStatus = 'pending' | 'ongoing' | 'done'
type StatusFilter = 'all' | InstallationStatus

const statusOptions: InstallationStatus[] = ['pending', 'ongoing', 'done']

const monthOptions = [
  { value: 'all', label: 'Month' },
  { value: '0', label: 'January' },
  { value: '1', label: 'February' },
  { value: '2', label: 'March' },
  { value: '3', label: 'April' },
  { value: '4', label: 'May' },
  { value: '5', label: 'June' },
  { value: '6', label: 'July' },
  { value: '7', label: 'August' },
  { value: '8', label: 'September' },
  { value: '9', label: 'October' },
  { value: '10', label: 'November' },
  { value: '11', label: 'December' },
]

const statusStyles: Record<InstallationStatus, string> = {
  pending: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300',
  ongoing: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300',
  done: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300',
}

function normalizeStatus(value?: string | null): InstallationStatus {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'ongoing') return 'ongoing'
  if (normalized === 'done' || normalized === 'resolved') return 'done'
  return 'pending'
}

export default function InstallationsPage() {
  const [showForm, setShowForm] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [requests, setRequests] = useState<InstallationRequest[]>([])
  const [loadingRequests, setLoadingRequests] = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [monthFilter, setMonthFilter] = useState<string>('all')
  const [yearFilter, setYearFilter] = useState<string>('all')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState<InstallationRequest | null>(null)
  const [noteOpen, setNoteOpen] = useState(false)
  const [selectedNote, setSelectedNote] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<InstallationRequest | null>(null)
  const [form, setForm] = useState({
    requesterName: '',
    contact: '',
    address: '',
    email: '',
    note: '',
  })

  function matchesMonth(requestDate?: string | null) {
    if (!requestDate || monthFilter === 'all') return true
    const parsed = new Date(requestDate)
    if (Number.isNaN(parsed.getTime())) return false
    return String(parsed.getMonth()) === monthFilter
  }

  function matchesYear(requestDate?: string | null) {
    if (!requestDate || yearFilter === 'all') return true
    const parsed = new Date(requestDate)
    if (Number.isNaN(parsed.getTime())) return false
    return String(parsed.getFullYear()) === yearFilter
  }

  const yearOptions = Array.from(
    new Set(
      requests
        .map((request) => request.request_date)
        .filter(Boolean)
        .map((value) => new Date(String(value)))
        .filter((date) => !Number.isNaN(date.getTime()))
        .map((date) => String(date.getFullYear()))
    )
  ).sort((a, b) => Number(b) - Number(a))

  const filteredRequests = requests.filter((request) => {
    const status = normalizeStatus(request.status)
    const statusOk = statusFilter === 'all' || status === statusFilter
    return statusOk && matchesMonth(request.request_date) && matchesYear(request.request_date)
  })

  function updateField<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function resetForm() {
    setForm({
      requesterName: '',
      contact: '',
      address: '',
      email: '',
      note: '',
    })
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (submitting) return

    const payload = {
      requester_name: form.requesterName.trim(),
      contact: form.contact.trim(),
      address: form.address.trim(),
      email: form.email.trim() || null,
      note: form.note.trim() || null,
    }

    try {
      setSubmitting(true)
      setErrorMessage(null)
      await apiClient.post('/installations', payload)
      setSubmitted(true)
      setShowForm(false)
      resetForm()
      await fetchRequests()
      window.setTimeout(() => setSubmitted(false), 2500)
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || error?.message || 'Failed to submit installation request.')
    } finally {
      setSubmitting(false)
    }
  }

  function normalizeRequest(row: Record<string, any>): InstallationRequest {
    return {
      id: String(row.id),
      requester_name: row.requester_name ?? null,
      profile_id: row.profile_id ?? null,
      contact: row.contact ?? row.contact_number ?? row.contactNumber ?? null,
      address: row.address ?? row.installation_address ?? null,
      request_date: row.request_date ?? row.submitted_at ?? row.created_at ?? null,
      note: row.note ?? row.notes ?? null,
      email: row.email ?? null,
      status: row.status ?? null,
    }
  }

  async function fetchRequests() {
    setLoadingRequests(true)
    try {
      const res = await apiClient.get('/installations')
      const rows = res?.data?.data ?? []
      setRequests(rows.map((row: Record<string, any>) => normalizeRequest(row)))
      setErrorMessage(null)
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || error?.message || 'Failed to load installation requests.')
      setRequests([])
    } finally {
      setLoadingRequests(false)
    }
  }

  async function updateStatus(id: string, status: InstallationStatus) {
    const previous = requests.find((request) => request.id === id)?.status
    setRequests((prev) => prev.map((request) => (
      request.id === id ? { ...request, status } : request
    )))

    try {
      await apiClient.patch(`/installations/${id}/status`, { status })
      setErrorMessage(null)
    } catch (error: any) {
      setRequests((prev) => prev.map((request) => (
        request.id === id ? { ...request, status: previous ?? 'pending' } : request
      )))
      setErrorMessage(error?.response?.data?.message || error?.message || 'Failed to update status.')
    }
  }

  async function deleteRequest(id: string) {
    try {
      await apiClient.delete(`/installations/${id}`)
      setRequests((prev) => prev.filter((request) => request.id !== id))
      setErrorMessage(null)
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || error?.message || 'Failed to delete installation request.')
    }
  }

  function openDeleteDialog(request: InstallationRequest) {
    setDeleteTarget(request)
    setDeleteOpen(true)
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    await deleteRequest(deleteTarget.id)
    setDeleteOpen(false)
    setDeleteTarget(null)
  }

  useEffect(() => {
    fetchRequests()
  }, [])

  function openDetails(request: InstallationRequest) {
    setSelectedRequest(request)
    setDetailsOpen(true)
  }

  function openNote(note: string | null | undefined) {
    setSelectedNote(note ?? null)
    setNoteOpen(true)
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Installation Requests</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Review consumer requests for new water meter installations.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            Add New Request
          </button>
        </div>

        {submitted && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
            Installation request submitted.
          </div>
        )}

        {errorMessage && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
            {errorMessage}
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <select
              value={monthFilter}
              onChange={(event) => setMonthFilter(event.target.value)}
              className="h-10 rounded-xl border border-slate-200/70 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 text-sm font-semibold text-slate-700 dark:text-slate-100 shadow-sm"
              aria-label="Filter by month"
            >
              {monthOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              value={yearFilter}
              onChange={(event) => setYearFilter(event.target.value)}
              className="h-10 rounded-xl border border-slate-200/70 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 text-sm font-semibold text-slate-700 dark:text-slate-100 shadow-sm"
              aria-label="Filter by year"
            >
              <option value="all">Year</option>
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                className="h-10 rounded-xl border border-slate-200/70 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 pr-12 text-sm font-semibold text-slate-700 dark:text-slate-100 shadow-sm"
                aria-label="Filter by status"
              >
                <option value="all">All</option>
                {statusOptions.map((option) => (
                  <option key={option} value={option}>
                    {option.charAt(0).toUpperCase() + option.slice(1)}
                  </option>
                ))}
              </select>
              <span className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex h-6 min-w-[24px] items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-200">
                {filteredRequests.length}
              </span>
            </div>
          </div>
          {loadingRequests ? (
            <div className="text-sm text-slate-500 dark:text-slate-400">Loading installation requests...</div>
          ) : filteredRequests.length === 0 ? (
            <div className="text-sm text-slate-500 dark:text-slate-400">
              No installation requests match the selected filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-slate-200 dark:border-slate-800 text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Requester</th>
                    <th className="px-3 py-2 text-left">Note</th>
                    <th className="px-3 py-2 text-left">Address</th>
                    <th className="px-3 py-2 text-left">Contact</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {filteredRequests.map((request) => {
                    const status = normalizeStatus(request.status)
                    return (
                    <tr key={request.id} className="text-slate-700 dark:text-slate-200">
                      <td className="px-3 py-3 text-xs text-slate-500 dark:text-slate-400">
                        {request.request_date ? new Date(request.request_date).toLocaleDateString('en-PH', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        }) : 'No date'}
                      </td>
                      <td className="px-3 py-3 font-medium">
                        {request.requester_name || 'Unknown requester'}
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-500 dark:text-slate-400">
                        {request.note ? (
                          <button
                            type="button"
                            onClick={() => openNote(request.note)}
                            className="inline-flex items-center rounded-full border border-slate-200 dark:border-slate-700 px-2 py-0.5 text-[11px] font-semibold uppercase text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            View note
                          </button>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-500 dark:text-slate-400">
                        {request.address || '—'}
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-500 dark:text-slate-400">
                        {request.contact || 'No contact number'}
                      </td>
                      <td className="px-3 py-3">
                        <select
                          value={status}
                          onChange={(event) => updateStatus(request.id, event.target.value as InstallationStatus)}
                          aria-label="Update installation status"
                          className={`h-9 rounded-lg border-2 px-3 text-xs font-semibold uppercase shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-400/40 dark:focus:ring-slate-500/40 ${statusStyles[status]}`}
                        >
                          {statusOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openDetails(request)}
                            className="inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            View Details
                          </button>
                          <button
                            type="button"
                            onClick={() => openDeleteDialog(request)}
                            aria-label="Delete request"
                            className="h-8 w-8 rounded-lg flex items-center justify-center text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
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

      {detailsOpen && selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Installation Request Details</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">Request information and status.</p>
              </div>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold uppercase text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                {selectedRequest.status || 'pending'}
              </span>
            </div>
            <div className="p-5 space-y-3 text-sm text-slate-600 dark:text-slate-300">
              <div>
                <span className="font-medium text-slate-700 dark:text-slate-200">Requester:</span>{' '}
                {selectedRequest.requester_name || 'Unknown requester'}
              </div>
              <div>
                <span className="font-medium text-slate-700 dark:text-slate-200">Email:</span>{' '}
                {selectedRequest.email || 'No email'}
              </div>
              <div>
                <span className="font-medium text-slate-700 dark:text-slate-200">Contact:</span>{' '}
                {selectedRequest.contact || 'No contact number'}
              </div>
              <div>
                <span className="font-medium text-slate-700 dark:text-slate-200">Address:</span>{' '}
                {selectedRequest.address || '—'}
              </div>
              <div>
                <span className="font-medium text-slate-700 dark:text-slate-200">Request date:</span>{' '}
                {selectedRequest.request_date ? new Date(selectedRequest.request_date).toLocaleDateString('en-PH', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                }) : 'No date'}
              </div>
              {selectedRequest.note && (
                <div>
                  <span className="font-medium text-slate-700 dark:text-slate-200">Note:</span>{' '}
                  {selectedRequest.note}
                </div>
              )}
            </div>
            <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setDetailsOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {noteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Note</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">Request note</p>
              </div>
            </div>
            <div className="p-5 text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
              {selectedNote || 'No note provided.'}
            </div>
            <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setNoteOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Delete Request</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">Are you sure you want to delete this request?</p>
            </div>
            <div className="p-5 text-sm text-slate-600 dark:text-slate-300">
              {deleteTarget?.requester_name ? `Requester: ${deleteTarget.requester_name}` : 'This action cannot be undone.'}
            </div>
            <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">New Installation Request</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">Fill out the details below.</p>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label htmlFor="install-requester-name" className="text-xs font-medium text-slate-600 dark:text-slate-300">Requester Name</label>
                <input
                  id="install-requester-name"
                  type="text"
                  required
                  value={form.requesterName}
                  onChange={(e) => updateField('requesterName', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500/30"
                />
              </div>
              <div>
                <label htmlFor="install-contact" className="text-xs font-medium text-slate-600 dark:text-slate-300">Contact Number</label>
                <input
                  id="install-contact"
                  type="tel"
                  required
                  value={form.contact}
                  onChange={(e) => updateField('contact', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500/30"
                />
              </div>
              <div>
                <label htmlFor="install-address" className="text-xs font-medium text-slate-600 dark:text-slate-300">Installation Address</label>
                <input
                  id="install-address"
                  type="text"
                  required
                  value={form.address}
                  onChange={(e) => updateField('address', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500/30"
                />
              </div>
              <div>
                <label htmlFor="install-email" className="text-xs font-medium text-slate-600 dark:text-slate-300">Email (optional)</label>
                <input
                  id="install-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500/30"
                />
              </div>
              <div>
                <label htmlFor="install-note" className="text-xs font-medium text-slate-600 dark:text-slate-300">Note (optional)</label>
                <textarea
                  id="install-note"
                  value={form.note}
                  onChange={(e) => updateField('note', e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500/30"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
                >
                  {submitting ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  )
}
