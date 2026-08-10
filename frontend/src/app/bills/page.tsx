'use client'

import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import AppShell from '@/components/AppShell'
import { Download, ArrowUpAZ, Search, ChevronDown } from 'lucide-react'
import apiClient from '@/lib/axios'
import {
  createReportDocument,
  drawSectionLabel,
  drawHighlightBox,
  drawKeyValueRows,
  drawStatusBadge,
  addReportFooter,
  PDF_COLORS,
} from '@/lib/pdfReport'

// Matches the billing_records table in Supabase
type BillingRecord = {
  id: string
  consumer_id: string
  period_start: string
  period_end: string
  previous_reading: number
  current_reading: number
  consumption: number
  base_charge: number
  rate_per_cbm: number
  total_amount: number
  due_date: string
  billing_date: string
  payment_status: 'unpaid' | 'paid' | 'overdue'
  profiles?: { first_name: string; last_name: string; address?: string }
}

const statusStyles: Record<string, string> = {
  paid:    'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30',
  unpaid:  'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30',
  overdue: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/30',
}

const statusOptions = ['paid', 'unpaid', 'overdue'] as const
type Status = typeof statusOptions[number]

function StatusSelect({ value, onChange }: { value: Status; onChange: (val: Status) => void }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  // Position the portal popup below the trigger button
  useEffect(() => {
    if (!open || !btnRef.current || !menuRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    const top  = rect.bottom + 4
    const left = rect.left + rect.width / 2
    setPos({ top, left })
    menuRef.current.style.top  = `${top}px`
    menuRef.current.style.left = `${left}px`
  }, [open])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Close on scroll so position doesn't drift
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('scroll', close, true)
    return () => window.removeEventListener('scroll', close, true)
  }, [open])

  return (
    <div className="relative inline-flex">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-medium transition-colors ${statusStyles[value]}`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70 shrink-0" />
        <span className="capitalize">{value}</span>
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          className="z-[9999] fixed -translate-x-1/2 min-w-[120px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl overflow-hidden"
        >
          {statusOptions.map((option) => (
            <button
              key={option}
              onClick={() => { onChange(option); setOpen(false) }}
              className={`w-full px-4 py-2 text-left text-xs font-medium capitalize transition-colors ${
                option === value
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {option}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}



function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function BillsPage() {
  const [records, setRecords] = useState<BillingRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'paid' | 'unpaid' | 'overdue'>('all')
  const [search, setSearch] = useState('')
  const [sortAZ, setSortAZ] = useState(false)
  const [monthValue, setMonthValue] = useState('')
  const [yearValue, setYearValue] = useState('')
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current)
      }
    }
  }, [])

  const monthFilter = monthValue && yearValue ? `${yearValue}-${monthValue}` : ''

  const filtered = useMemo(() => {
    let result = filter === 'all' ? records : records.filter((r) => r.payment_status === filter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter((r) =>
        r.profiles
          ? `${r.profiles.last_name} ${r.profiles.first_name}`.toLowerCase().includes(q)
          : false
      )
    }
    if (monthFilter) {
      result = result.filter((r) => {
        const date = r.billing_date || r.period_start
        if (!date) return false
        const d = new Date(date)
        const y = d.getFullYear()
        const m = String(d.getMonth() + 1).padStart(2, '0')
        return `${y}-${m}` === monthFilter
      })
    }
    if (sortAZ) {
      result = [...result].sort((a, b) => {
        const la = a.profiles?.last_name ?? ''
        const lb = b.profiles?.last_name ?? ''
        return la.localeCompare(lb)
      })
    } else {
      // Default: sort by billing_date descending (most recent first)
      result = [...result].sort((a, b) => {
        const dateA = new Date(a.billing_date || a.period_start || 0).getTime()
        const dateB = new Date(b.billing_date || b.period_start || 0).getTime()
        return dateB - dateA
      })
    }
    return result
  }, [records, filter, search, sortAZ, monthFilter])

  const availableYears = useMemo(() => {
    const years = new Set<number>()
    records.forEach((r) => {
      const date = r.billing_date || r.period_start
      if (!date) return
      const d = new Date(date)
      if (!Number.isNaN(d.getTime())) years.add(d.getFullYear())
    })
    const sorted = Array.from(years).sort((a, b) => b - a)
    if (sorted.length > 0) return sorted
    const currentYear = new Date().getFullYear()
    return [currentYear, currentYear - 1, currentYear - 2]
  }, [records])

  const monthOptions = [
    { value: '01', label: 'January' },
    { value: '02', label: 'February' },
    { value: '03', label: 'March' },
    { value: '04', label: 'April' },
    { value: '05', label: 'May' },
    { value: '06', label: 'June' },
    { value: '07', label: 'July' },
    { value: '08', label: 'August' },
    { value: '09', label: 'September' },
    { value: '10', label: 'October' },
    { value: '11', label: 'November' },
    { value: '12', label: 'December' },
  ]

  useEffect(() => {
    apiClient.get('/bills')
      .then((res) => {
        const normalized = (res.data.data ?? []).map((record: BillingRecord & { payment_status: string }) => ({
          ...record,
          payment_status: (record.payment_status?.toLowerCase?.() ?? 'unpaid') as BillingRecord['payment_status'],
        }))
        setRecords(normalized)
      })
      .catch((err) => setError(err.response?.data?.message ?? 'Failed to load billing records.'))
      .finally(() => setLoading(false))
  }, [])

  function downloadBill(record: BillingRecord) {
    const fullName = record.profiles ? `${record.profiles.first_name} ${record.profiles.last_name}` : '—'
    const address = record.profiles?.address ?? '—'
    const status = record.payment_status.toUpperCase()

    const { doc, cursorY } = createReportDocument({
      title: 'Water Bill Ticket',
      subtitle: 'Barangay Montelza Water Services — Official Water Bill Ticket',
    })

    let y = drawSectionLabel(doc, 'Consumer Information', cursorY)
    y = drawKeyValueRows(doc, [
      ['Name:', fullName],
      ['Address:', address],
    ], y)

    y += 4
    y = drawSectionLabel(doc, 'Billing Details', y)
    y = drawKeyValueRows(doc, [
      ['Billing Period:', `${formatDate(record.period_start)} – ${formatDate(record.period_end)}`],
      ['Previous Reading:', `${Number(record.previous_reading).toFixed(2)} Cu.M`],
      ['Current Reading:', `${Number(record.current_reading).toFixed(2)} Cu.M`],
      ['Consumption:', `${Number(record.consumption).toFixed(2)} Cu.M`],
      ['Base Charge:', `PHP ${Number(record.base_charge).toFixed(2)}`],
      ['Rate per Cu.M:', `PHP ${Number(record.rate_per_cbm).toFixed(2)}`],
    ], y)

    y += 6
    y = drawHighlightBox(doc, {
      x: 14,
      y,
      width: 90,
      label: 'Total Amount Due',
      value: `PHP ${Number(record.total_amount).toFixed(2)}`,
    })

    y += 10
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(...PDF_COLORS.textDark)
    doc.text('Due Date:', 14, y)
    doc.setFont('helvetica', 'normal')
    doc.text(formatDate(record.due_date), 55, y)

    const statusColor =
      record.payment_status === 'paid' ? PDF_COLORS.statusPaid :
      record.payment_status === 'overdue' ? PDF_COLORS.statusOverdue :
      PDF_COLORS.statusUnpaid
    drawStatusBadge(doc, status, 120, y, statusColor)

    addReportFooter(doc, 'This is a system-generated document. No signature required.')
    doc.save(`bill_${fullName.replace(/\s+/g, '_')}_${formatDate(record.billing_date)}.pdf`)
  }

  async function updateStatus(id: string, status: string) {
    // Grab the previous status so we can roll back on failure
    const previous = records.find((r) => r.id === id)?.payment_status

    const statusCandidates = Array.from(
      new Set([
        status.toLowerCase(),
        `${status.charAt(0).toUpperCase()}${status.slice(1).toLowerCase()}`,
        status.toUpperCase(),
      ])
    )

    // Optimistic update
    setRecords((prev) => prev.map((r) => r.id === id ? { ...r, payment_status: status as BillingRecord['payment_status'] } : r))

    try {
      let persisted = false
      let firstErr: any = null

      for (const candidate of statusCandidates) {
        try {
          await apiClient.patch(`/bills/${id}/status`, { payment_status: candidate })
          persisted = true
          break
        } catch (err: any) {
          if (!firstErr) firstErr = err
        }
      }

      if (!persisted) {
        for (const candidate of statusCandidates) {
          try {
            await apiClient.put(`/bills/${id}`, { payment_status: candidate })
            persisted = true
            break
          } catch (err: any) {
            if (!firstErr) firstErr = err
          }
        }
      }

      if (persisted) {
        setError(null)
        setSuccessMessage('Payment status updated successfully.')
        if (successTimerRef.current) clearTimeout(successTimerRef.current)
        successTimerRef.current = setTimeout(() => setSuccessMessage(null), 2200)
        return
      }

      throw firstErr || new Error('Failed to update payment status.')
    } catch (err: any) {
      try {
        // Roll back to previous status if DB calls failed
        if (previous) {
          setRecords((prev) => prev.map((r) => r.id === id ? { ...r, payment_status: previous } : r))
        }

        const backendMessage =
          err?.response?.data?.message ||
          err?.message ||
          'Failed to update payment status.'

        setError(backendMessage)
        setSuccessMessage(null)
        console.warn('Failed to update payment status:', {
          error: err,
          message: backendMessage,
        })
      } catch {
        // no-op
      }
    }
  }

  return (
    <AppShell>
      <div className="space-y-6">

        {/* Page header */}
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Billing Management</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">View and manage consumer water billing records.</p>
        </div>

        {/* Table card */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-lg overflow-hidden min-h-[520px] flex flex-col">

          {/* Card header */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-5 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Billing Records</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {filtered.length} of {records.length} record{records.length !== 1 ? 's' : ''}
              </p>
            </div>

            {/* Right-side controls */}
            <div className="flex flex-wrap items-center gap-2">

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search consumer..."
                  className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 dark:focus:border-blue-500 transition-colors w-44"
                />
              </div>

              {/* A–Z sort */}
              <button
                onClick={() => setSortAZ((v) => !v)}
                title="Sort A–Z by last name"
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                  sortAZ
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'text-slate-600 border-slate-200 hover:bg-slate-100 dark:text-slate-400 dark:border-slate-700 dark:hover:bg-slate-800'
                }`}
              >
                <ArrowUpAZ className="h-3.5 w-3.5" />
                A–Z
              </button>

              {/* Monthly filter */}
              <div className="flex items-center gap-1.5">
                <select
                  value={monthValue}
                  onChange={(e) => setMonthValue(e.target.value)}
                  aria-label="Filter billing records by month"
                  className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 dark:focus:border-blue-500 transition-colors"
                >
                  <option value="">Month</option>
                  {monthOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <select
                  value={yearValue}
                  onChange={(e) => setYearValue(e.target.value)}
                  aria-label="Filter billing records by year"
                  className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 dark:focus:border-blue-500 transition-colors"
                >
                  <option value="">Year</option>
                  {availableYears.map((year) => (
                    <option key={year} value={String(year)}>{year}</option>
                  ))}
                </select>
                {(monthValue || yearValue) && (
                  <button
                    type="button"
                    onClick={() => { setMonthValue(''); setYearValue('') }}
                    className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Filter buttons */}
              <div className="flex items-center gap-1.5">
                {(['all', 'paid', 'unpaid', 'overdue'] as const).map((f) => {
                  const active = filter === f
                  const styles = {
                    all:     active ? 'bg-slate-800 text-white border-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:border-slate-100' : 'text-slate-600 border-slate-200 hover:bg-slate-100 dark:text-slate-400 dark:border-slate-700 dark:hover:bg-slate-800',
                    paid:    active ? 'bg-emerald-600 text-white border-emerald-600' : 'text-emerald-700 border-emerald-200 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:hover:bg-emerald-500/10',
                    unpaid:  active ? 'bg-amber-500 text-white border-amber-500' : 'text-amber-700 border-amber-200 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-800 dark:hover:bg-amber-500/10',
                    overdue: active ? 'bg-red-600 text-white border-red-600' : 'text-red-700 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-500/10',
                  }[f]
                  const count = f === 'all' ? records.length : records.filter((r) => r.payment_status === f).length
                  return (
                    <button
                      key={f}
                      onClick={() => setFilter(f)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${styles}`}
                    >
                      <span className="capitalize">{f}</span>
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                        active ? 'bg-white/20 text-inherit' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                      }`}>{count}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {successMessage && (
            <div className="mx-6 mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
              {successMessage}
            </div>
          )}

          {/* Table */}
          <div className="overflow-x-auto flex-1">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-sm text-slate-400 dark:text-slate-500 gap-2">
                <svg className="animate-spin h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Loading billing records...
              </div>
            ) : error ? (
              <div className="py-16 text-center text-sm text-red-500 dark:text-red-400">{error}</div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center text-sm text-slate-400 dark:text-slate-500">
                No <span className="font-medium capitalize">{filter === 'all' ? '' : filter}</span> billing records found.
              </div>
            ) : (
              <table className="w-full text-sm table-fixed">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60">
                    <th className="px-6 py-3.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-left w-[26%]">Consumer Name</th>
                    <th className="px-6 py-3.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center w-[14%]">Consumption (m³)</th>
                    <th className="px-6 py-3.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-left w-[16%]">Billing Month</th>
                    <th className="px-6 py-3.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right w-[16%]">Total Amount</th>
                    <th className="px-6 py-3.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center w-[20%]">Payment Status</th>
                    <th className="px-6 py-3.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center w-[8%]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filtered.map((record) => (
                    <tr key={record.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors group">

                      {/* Consumer Name */}
                      <td className="px-6 py-4 text-left">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center shrink-0">
                            <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                              {record.profiles
                                ? `${record.profiles.last_name[0]}${record.profiles.first_name[0]}`
                                : '?'}
                            </span>
                          </div>
                          <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                            {record.profiles ? `${record.profiles.last_name}, ${record.profiles.first_name}` : '—'}
                          </span>
                        </div>
                      </td>

                      {/* Consumption */}
                      <td className="px-6 py-4 text-center text-slate-700 dark:text-slate-300 tabular-nums">
                        {record.consumption} m³
                      </td>

                      {/* Billing Month & Due Date */}
                      <td className="px-6 py-4 text-left">
                        <div className="flex flex-col">
                          <span className="font-medium text-slate-900 dark:text-slate-100">
                            {new Date(record.billing_date || record.period_start || record.due_date).toLocaleString('en-US', { month: 'long', year: 'numeric' })}
                          </span>
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            Due: {formatDate(record.due_date)}
                          </span>
                        </div>
                      </td>

                      {/* Total Amount */}
                      <td className="px-6 py-4 text-right font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                        ₱{Number(record.total_amount).toFixed(2)}
                      </td>

                      {/* Payment Status */}
                      <td className="px-6 py-4 text-center">
                        <StatusSelect
                          value={record.payment_status}
                          onChange={(status) => updateStatus(record.id, status)}
                        />
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center">
                          <button
                            title="Download PDF"
                            onClick={() => downloadBill(record)}
                            className="h-8 w-8 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-400 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-300 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-all"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>

                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Footer */}
          {records.length > 0 && (
            <div className="mt-auto px-6 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Showing {filtered.length} of {records.length} billing record{records.length !== 1 ? 's' : ''}
                {filter !== 'all' && <span className="ml-1 capitalize">· filtered by <strong>{filter}</strong></span>}
              </p>
            </div>
          )}
        </div>

      </div>
    </AppShell>
  )
}
