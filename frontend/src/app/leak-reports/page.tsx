'use client'

import { useEffect, useRef, useState } from 'react'
import AppShell from '@/components/AppShell'
import { Plus, Trash2, X } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import apiClient from '@/lib/axios'

type LeakReport = {
  id: string
  userId?: string | null
  date: string
  location: string
  description: string
  reporter: string
  status: 'pending' | 'ongoing' | 'resolved'
  hasPhoto: boolean
  photoUrl?: string | null
}

const statusStyles: Record<LeakReport['status'], string> = {
  pending: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  ongoing: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300',
  resolved: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
}

export default function LeakReportsPage() {
  const [reports, setReports] = useState<LeakReport[]>([])
  const [statusFilter, setStatusFilter] = useState<'all' | LeakReport['status']>('all')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [reportModalOpen, setReportModalOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [photoOpen, setPhotoOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [formData, setFormData] = useState({ location: '', description: '', reporter: '' })

  function formatDate(value: string | null | undefined) {
    if (!value) return '—'
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return value
    return parsed.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })
  }

  function normalizeStatus(value: string | null | undefined): LeakReport['status'] {
    const normalized = String(value ?? '').trim().toLowerCase()
    if (normalized === 'ongoing') return 'ongoing'
    if (normalized === 'resolved') return 'resolved'
    return 'pending'
  }

  function mapRowToReport(row: Record<string, any>): LeakReport {
    const userId = row.user_id ? String(row.user_id) : null
    const photoUrl = row.photo_uri ?? row.photo_url ?? row.image_url ?? row.photo ?? null
    return {
      id: String(row.id),
      userId,
      date: formatDate(row.submitted_at ?? row.reported_at ?? row.date),
      location: row.location_text ?? row.location ?? row.address ?? row.barangay ?? '—',
      description: row.description ?? row.details ?? '—',
      reporter: row.reporter_full_name ?? row.reporter ?? row.reporter_name ?? row.reported_by ?? '—',
      status: normalizeStatus(row.status ?? row.report_status),
      hasPhoto: !!photoUrl,
      photoUrl,
    }
  }

  async function fetchReports() {
    setLoading(true)
    setError(null)
    try {
      const reportsRes = await apiClient.get('/leak-reports')
      const mapped = (reportsRes?.data?.data ?? []).map((row: Record<string, any>) => mapRowToReport(row))
      setReports(mapped)
      setError(null)
    } catch (fetchError: any) {
      setError(fetchError?.response?.data?.message || fetchError?.message || 'Failed to load leak reports.')
      setReports([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchReports()
  }, [])

  useEffect(() => {
    return () => {
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current)
      }
    }
  }, [])

  const filteredReports = statusFilter === 'all'
    ? reports
    : reports.filter((report) => report.status === statusFilter)

  const selectedReport = reports.find((report) => report.id === selectedId) || null

  function openDetails(report: LeakReport) {
    setSelectedId(report.id)
    setDetailsOpen(true)
  }

  function openPhoto(report: LeakReport) {
    setSelectedId(report.id)
    setPhotoOpen(true)
  }

  async function updateStatus(id: string, status: LeakReport['status']) {
    const previous = reports.find((report) => report.id === id)?.status
    setReports((prev) => prev.map((report) => (
      report.id === id ? { ...report, status } : report
    )))

    try {
      await apiClient.patch(`/leak-reports/${id}/status`, { status })
      setError(null)
      setSuccessMessage('Leak report status successfully updated.')
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current)
      }
      successTimerRef.current = setTimeout(() => setSuccessMessage(null), 2200)
    } catch (updateError: any) {
      if (previous) {
        setReports((prev) => prev.map((report) => (
          report.id === id ? { ...report, status: previous } : report
        )))
      }
      setError(updateError?.response?.data?.message || updateError?.message || 'Failed to update status.')
      setSuccessMessage(null)
    }
  }

  async function deleteReport(id: string) {
    const previous = reports
    setReports((prev) => prev.filter((report) => report.id !== id))

    try {
      await apiClient.delete(`/leak-reports/${id}`)
      setError(null)
    } catch (deleteError: any) {
      setReports(previous)
      setError(deleteError?.response?.data?.message || deleteError?.message || 'Failed to delete report.')
      return
    }
  }

  async function submitReport() {
    if (!formData.location.trim() || !formData.description.trim() || !formData.reporter.trim()) {
      setError('Location, description, and reporter name are required.')
      return
    }

    const payload = {
      location: formData.location.trim(),
      description: formData.description.trim(),
      reporter: formData.reporter.trim(),
      status: 'pending',
    }

    try {
      setSubmitting(true)
      await apiClient.post('/leak-reports', payload)
      await fetchReports()
      setReportModalOpen(false)
      setFormData({ location: '', description: '', reporter: '' })
      setError(null)
      setSuccessMessage('Leak report submitted successfully.')
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current)
      }
      successTimerRef.current = setTimeout(() => setSuccessMessage(null), 2200)
    } catch (createError: any) {
      setError(createError?.response?.data?.message || createError?.message || 'Failed to submit leak report.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Leak Report Management</h2>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">All Leak Reports</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Overview of all reported water leaks and their current statuses.</p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {(['all', 'pending', 'ongoing', 'resolved'] as const).map((option) => {
                  const isActive = statusFilter === option
                  const count = option === 'all' ? reports.length : reports.filter((report) => report.status === option).length
                  const styles = {
                    all: isActive
                      ? 'bg-slate-800 text-white border-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:border-slate-100'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800',
                    pending: isActive
                      ? 'bg-amber-500 text-white border-amber-500'
                      : 'border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-500/10',
                    ongoing: isActive
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-500/10',
                    resolved: isActive
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-500/10',
                  }[option]
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setStatusFilter(option)}
                      className={`h-8 px-3 rounded-lg border text-xs font-medium transition-colors ${styles}`}
                    >
                      <span className="capitalize">{option}</span> ({count})
                    </button>
                  )
                })}
              </div>

              <Dialog.Root open={reportModalOpen} onOpenChange={setReportModalOpen}>
                <Dialog.Trigger asChild>
                  <button
                    type="button"
                    className="h-9 px-4 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium flex items-center gap-2 transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                    Report New Leak
                  </button>
                </Dialog.Trigger>
                <Dialog.Portal>
                  <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
                  <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-slate-900 rounded-xl shadow-lg p-6 w-full max-w-xl z-50">
                    <div className="flex items-center justify-between mb-2">
                      <Dialog.Title className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                        Report New Leak
                      </Dialog.Title>
                      <Dialog.Close asChild>
                        <button
                          type="button"
                          aria-label="Close dialog"
                          className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                          <X className="h-5 w-5" />
                        </button>
                      </Dialog.Close>
                    </div>
                    <Dialog.Description className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                      Submit a new water leak report with details below.
                    </Dialog.Description>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-900 dark:text-slate-100 mb-2">Location</label>
                        <input
                          type="text"
                          placeholder="Enter leak location"
                          value={formData.location}
                          onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                          className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-900 dark:text-slate-100 mb-2">Description</label>
                        <input
                          type="text"
                          placeholder="Describe the leak"
                          value={formData.description}
                          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                          className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-900 dark:text-slate-100 mb-2">Reporter Name</label>
                        <input
                          type="text"
                          placeholder="Your name"
                          value={formData.reporter}
                          onChange={(e) => setFormData({ ...formData, reporter: e.target.value })}
                          className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-3 mt-6">
                      <Dialog.Close asChild>
                        <button
                          type="button"
                          className="h-9 px-4 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                        >
                          Cancel
                        </button>
                      </Dialog.Close>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={submitReport}
                        className="h-9 px-4 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
                      >
                        {submitting ? 'Submitting...' : 'Submit Report'}
                      </button>
                    </div>
                  </Dialog.Content>
                </Dialog.Portal>
              </Dialog.Root>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Location</th>
                  <th className="px-5 py-3">Description</th>
                  <th className="px-5 py-3">Reporter</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {loading && (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
                      Loading leak reports...
                    </td>
                  </tr>
                )}
                {!loading && error && (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-sm text-red-500 dark:text-red-400">
                      {error}
                    </td>
                  </tr>
                )}
                {!loading && !error && filteredReports.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
                      No leak reports found for the selected status.
                    </td>
                  </tr>
                )}
                {!loading && !error && filteredReports.map((report) => (
                  <tr key={report.id} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{report.date}</td>
                    <td className="px-5 py-3 text-slate-900 dark:text-slate-100">{report.location}</td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{report.description}</td>
                    <td className="px-5 py-3 text-slate-600 dark:text-slate-300">{report.reporter}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex px-2.5 py-1 rounded-md text-xs font-medium ${statusStyles[report.status]}`}>
                        {report.status.charAt(0).toUpperCase() + report.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openDetails(report)}
                          className="h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                        >
                          View Details
                        </button>
                        {report.hasPhoto && (
                          <button
                            type="button"
                            onClick={() => openPhoto(report)}
                            className="h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                          >
                            View Photo
                          </button>
                        )}
                        <div className="h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center">
                          <select
                            aria-label="Update status"
                            value={report.status}
                            onChange={(e) => updateStatus(report.id, e.target.value as LeakReport['status'])}
                            className="bg-transparent dark:bg-slate-800 outline-none cursor-pointer text-slate-700 dark:text-slate-200"
                          >
                            <option value="pending" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">Pending</option>
                            <option value="ongoing" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">Ongoing</option>
                            <option value="resolved" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">Resolved</option>
                          </select>
                        </div>
                        <button
                          type="button"
                          onClick={() => deleteReport(report.id)}
                          className="h-8 w-8 rounded-lg flex items-center justify-center text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                          aria-label="Delete report"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-800 text-sm text-slate-500 dark:text-slate-400">
            Showing {filteredReports.length} of {reports.length} reported water leak{reports.length !== 1 ? 's' : ''}.
          </div>
        </div>
      </div>

      {successMessage && (
        <div className="fixed right-6 top-20 z-50 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 shadow-sm dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
          {successMessage}
        </div>
      )}

      <Dialog.Root open={detailsOpen} onOpenChange={setDetailsOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-slate-900 rounded-xl shadow-lg p-6 w-full max-w-xl z-50">
            <div className="flex items-center justify-between mb-4">
              <Dialog.Title className="text-lg font-semibold text-slate-900 dark:text-slate-100">Leak Report Details</Dialog.Title>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close dialog"
                  className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </Dialog.Close>
            </div>

            {selectedReport && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 text-sm text-slate-700 dark:text-slate-300">
                <div>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mb-1">Report ID</p>
                  <p>{selectedReport.id}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mb-1">Date</p>
                  <p>{selectedReport.date}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mb-1">Location</p>
                  <p>{selectedReport.location}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mb-1">Reporter</p>
                  <p>{selectedReport.reporter}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mb-1">Status</p>
                  <span className={`inline-flex px-2.5 py-1 rounded-md text-xs font-medium ${statusStyles[selectedReport.status]}`}>
                    {selectedReport.status.charAt(0).toUpperCase() + selectedReport.status.slice(1)}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mb-1">Photo</p>
                  <button
                    type="button"
                    onClick={() => openPhoto(selectedReport)}
                    className="h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    View Photo
                  </button>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs text-slate-400 dark:text-slate-500 mb-1">Description</p>
                  <p>{selectedReport.description}</p>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end mt-6">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="h-9 px-5 rounded-lg bg-slate-900 text-white text-sm font-medium"
                >
                  Close
                </button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={photoOpen} onOpenChange={setPhotoOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-slate-900 rounded-xl shadow-lg p-6 w-full max-w-2xl z-50">
            <div className="flex items-center justify-between mb-2">
              <Dialog.Title className="text-lg font-semibold text-slate-900 dark:text-slate-100">Leak Report Photo</Dialog.Title>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close dialog"
                  className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </Dialog.Close>
            </div>
            <Dialog.Description className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              Photo evidence for the reported leak.
            </Dialog.Description>

            <div className="h-56 sm:h-72 rounded-lg border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-sm text-slate-400 dark:text-slate-500">
              {selectedReport?.photoUrl ? (
                <img src={selectedReport.photoUrl} alt="Leak report" className="h-full w-full object-contain rounded-lg" />
              ) : (
                'No photo available'
              )}
            </div>

            <div className="flex items-center justify-end mt-6">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="h-9 px-5 rounded-lg bg-slate-900 text-white text-sm font-medium"
                >
                  Close
                </button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </AppShell>
  )
}
