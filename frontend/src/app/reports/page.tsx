'use client'

import { useEffect, useMemo, useState } from 'react'
import AppShell from '@/components/AppShell'
import apiClient from '@/lib/axios'
import { Download, FileText, Droplets, FileSpreadsheet } from 'lucide-react'
import {
  createReportDocument,
  createLetterheadDocument,
  formatGeneratedTimestamp,
  formatNumber,
  drawSectionLabel,
  drawHighlightBox,
  drawKeyValueRows,
  drawReportTable,
  addReportFooter,
  PDF_COLORS,
} from '@/lib/pdfReport'

// Matches the columns shown on the Billing Management page (/bills)
type BillingRecord = {
  id: string
  total_amount: number | string
  payment_status: string
  billing_date?: string
  due_date?: string
  previous_reading?: number | string
  current_reading?: number | string
  consumption?: number | string
  profiles?: { first_name: string; last_name: string; address?: string; meter_no?: string }
}

type Reading = {
  ph: number | null
  turbidity: number | null
  temperature_c: number | null
  timestamp: string | null
}

type LeakReport = {
  id: string
  status?: string
  submitted_at?: string
}

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

function normalizeStatus(value?: string) {
  return String(value ?? '').trim().toLowerCase()
}

function safeNumber(value: number | string | undefined) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatMonthLabel(year: number, monthIndex: number) {
  return new Date(year, monthIndex, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })
}

function formatDate(value?: string | null) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

function summarizeNumbers(values: Array<number | null | undefined>) {
  const filtered = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  if (filtered.length === 0) return null
  const sum = filtered.reduce((acc, value) => acc + value, 0)
  const min = Math.min(...filtered)
  const max = Math.max(...filtered)
  const avg = sum / filtered.length
  return { min, max, avg, count: filtered.length }
}

export default function ReportsPage() {
  const [billingRecords, setBillingRecords] = useState<BillingRecord[]>([])
  const [latestReading, setLatestReading] = useState<Reading | null>(null)
  const [readingHistory, setReadingHistory] = useState<Reading[]>([])
  const [leakReports, setLeakReports] = useState<LeakReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [billingMode, setBillingMode] = useState<'monthly' | 'annual'>('monthly')
  const [monthValue, setMonthValue] = useState('')
  const [yearValue, setYearValue] = useState('')
  const [leakMode, setLeakMode] = useState<'monthly' | 'annual'>('monthly')
  const [leakMonthValue, setLeakMonthValue] = useState('')
  const [leakYearValue, setLeakYearValue] = useState('')

  useEffect(() => {
    async function fetchReportsData() {
      setLoading(true)
      try {
        const [billsRes, latestRes, historyRes, leakRes] = await Promise.all([
          apiClient.get('/bills'),
          apiClient.get('/iot/latest'),
          apiClient.get('/iot/history?hours=24&limit=500'),
          apiClient.get('/leak-reports'),
        ])

        setBillingRecords((billsRes.data?.data ?? []) as BillingRecord[])
        setLatestReading((latestRes.data?.data ?? null) as Reading | null)
        setReadingHistory((historyRes.data?.data ?? []) as Reading[])
        setLeakReports((leakRes.data?.data ?? []) as LeakReport[])
        setError(null)
      } catch (fetchError: any) {
        setError(fetchError?.response?.data?.message || fetchError?.message || 'Failed to load report data.')
        setBillingRecords([])
        setLatestReading(null)
        setReadingHistory([])
        setLeakReports([])
      } finally {
        setLoading(false)
      }
    }

    fetchReportsData()
  }, [])

  const availableYears = useMemo(() => {
    const years = new Set<number>()
    billingRecords.forEach((record) => {
      const basis = record.billing_date || record.due_date
      if (!basis) return
      const parsed = new Date(basis)
      if (!Number.isNaN(parsed.getTime())) years.add(parsed.getFullYear())
    })
    const sorted = Array.from(years).sort((a, b) => b - a)
    if (sorted.length > 0) return sorted
    const currentYear = new Date().getFullYear()
    return [currentYear, currentYear - 1, currentYear - 2]
  }, [billingRecords])

  useEffect(() => {
    if (!yearValue && availableYears.length > 0) {
      setYearValue(String(availableYears[0]))
    }
  }, [availableYears, yearValue])

  useEffect(() => {
    if (!monthValue) {
      const now = new Date()
      const month = String(now.getMonth() + 1).padStart(2, '0')
      setMonthValue(month)
    }
  }, [monthValue])

  const availableLeakYears = useMemo(() => {
    const years = new Set<number>()
    leakReports.forEach((report) => {
      if (!report.submitted_at) return
      const parsed = new Date(report.submitted_at)
      if (!Number.isNaN(parsed.getTime())) years.add(parsed.getFullYear())
    })
    const sorted = Array.from(years).sort((a, b) => b - a)
    if (sorted.length > 0) return sorted
    const currentYear = new Date().getFullYear()
    return [currentYear, currentYear - 1, currentYear - 2]
  }, [leakReports])

  useEffect(() => {
    if (!leakYearValue && availableLeakYears.length > 0) {
      setLeakYearValue(String(availableLeakYears[0]))
    }
  }, [availableLeakYears, leakYearValue])

  useEffect(() => {
    if (!leakMonthValue) {
      const now = new Date()
      const month = String(now.getMonth() + 1).padStart(2, '0')
      setLeakMonthValue(month)
    }
  }, [leakMonthValue])

  const filteredBills = useMemo(() => {
    if (!yearValue) return []
    return billingRecords.filter((record) => {
      const basis = record.billing_date || record.due_date
      if (!basis) return false
      const parsed = new Date(basis)
      if (Number.isNaN(parsed.getTime())) return false

      if (String(parsed.getFullYear()) !== yearValue) return false

      if (billingMode === 'monthly') {
        const month = String(parsed.getMonth() + 1).padStart(2, '0')
        return month === monthValue
      }

      return true
    })
  }, [billingRecords, billingMode, monthValue, yearValue])

  const billingSummary = useMemo(() => {
    const totalBilled = filteredBills.reduce((sum, record) => sum + safeNumber(record.total_amount), 0)
    const totalPaid = filteredBills.reduce((sum, record) => {
      return normalizeStatus(record.payment_status) === 'paid'
        ? sum + safeNumber(record.total_amount)
        : sum
    }, 0)
    const unpaid = filteredBills.filter((record) => normalizeStatus(record.payment_status) === 'unpaid').length
    const overdue = filteredBills.filter((record) => normalizeStatus(record.payment_status) === 'overdue').length
    const paid = filteredBills.filter((record) => normalizeStatus(record.payment_status) === 'paid').length
    const avgConsumption = filteredBills.length > 0
      ? filteredBills.reduce((sum, record) => sum + safeNumber(record.consumption), 0) / filteredBills.length
      : 0

    return {
      totalBilled,
      totalPaid,
      unpaid,
      overdue,
      paid,
      totalCount: filteredBills.length,
      avgConsumption,
    }
  }, [filteredBills])

  const annualBreakdown = useMemo(() => {
    if (billingMode !== 'annual' || !yearValue) return []

    const months = Array.from({ length: 12 }, (_, idx) => {
      const key = String(idx + 1).padStart(2, '0')
      return { monthIndex: idx, key, total: 0, paid: 0, count: 0 }
    })

    billingRecords.forEach((record) => {
      const basis = record.billing_date || record.due_date
      if (!basis) return
      const parsed = new Date(basis)
      if (Number.isNaN(parsed.getTime())) return
      if (String(parsed.getFullYear()) !== yearValue) return

      const idx = parsed.getMonth()
      const bucket = months[idx]
      const amount = safeNumber(record.total_amount)
      bucket.total += amount
      bucket.count += 1
      if (normalizeStatus(record.payment_status) === 'paid') {
        bucket.paid += amount
      }
    })

    return months.map((item) => ({
      ...item,
      label: formatMonthLabel(Number(yearValue), item.monthIndex),
    }))
  }, [billingMode, billingRecords, yearValue])

  const qualityStats = useMemo(() => {
    const ph = summarizeNumbers(readingHistory.map((row) => row.ph))
    const turbidity = summarizeNumbers(readingHistory.map((row) => row.turbidity))
    const temperature = summarizeNumbers(readingHistory.map((row) => row.temperature_c))
    return { ph, turbidity, temperature }
  }, [readingHistory])

  const filteredLeaks = useMemo(() => {
    if (!leakYearValue) return []
    return leakReports.filter((report) => {
      if (!report.submitted_at) return false
      const parsed = new Date(report.submitted_at)
      if (Number.isNaN(parsed.getTime())) return false

      if (String(parsed.getFullYear()) !== leakYearValue) return false

      if (leakMode === 'monthly') {
        const month = String(parsed.getMonth() + 1).padStart(2, '0')
        return month === leakMonthValue
      }

      return true
    })
  }, [leakMode, leakMonthValue, leakReports, leakYearValue])

  const leakSummary = useMemo(() => {
    const pending = filteredLeaks.filter((report) => normalizeStatus(report.status) === 'pending').length
    const ongoing = filteredLeaks.filter((report) => normalizeStatus(report.status) === 'ongoing').length
    const resolved = filteredLeaks.filter((report) => normalizeStatus(report.status) === 'resolved').length
    return {
      total: filteredLeaks.length,
      pending,
      ongoing,
      resolved,
    }
  }, [filteredLeaks])

  function downloadBillingReport() {
    const periodLabel = billingMode === 'annual'
      ? `${yearValue}`
      : formatMonthLabel(Number(yearValue), Number(monthValue) - 1)

    const periodStart = billingMode === 'annual'
      ? new Date(Number(yearValue), 0, 1)
      : new Date(Number(yearValue), Number(monthValue) - 1, 1)
    const periodEnd = billingMode === 'annual'
      ? new Date(Number(yearValue), 11, 31)
      : new Date(Number(yearValue), Number(monthValue), 0)

    const { doc, cursorY } = createLetterheadDocument({
      documentTitle: 'Billing Summary Report',
      meta: [
        { label: 'Period', value: periodLabel },
        { label: 'Generated', value: formatGeneratedTimestamp() },
      ],
    })

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...PDF_COLORS.textMuted)
    doc.text(`Coverage: ${formatDate(periodStart.toISOString())} to ${formatDate(periodEnd.toISOString())}`, 14, cursorY - 4)

    let y = drawHighlightBox(doc, {
      x: 14,
      y: cursorY,
      width: 90,
      label: 'Total Collection',
      value: `PHP ${formatNumber(billingSummary.totalPaid)}`,
    })
    y += 10

    y = drawSectionLabel(doc, 'Summary', y)
    y = drawKeyValueRows(doc, [
      ['Total Billing Records:', String(billingSummary.totalCount)],
      ['Total Billed Amount:', `PHP ${formatNumber(billingSummary.totalBilled)}`],
      ['Total Paid Amount:', `PHP ${formatNumber(billingSummary.totalPaid)}`],
      ['Paid / Unpaid / Overdue:', `${billingSummary.paid} / ${billingSummary.unpaid} / ${billingSummary.overdue}`],
      ['Average Consumption:', `${formatNumber(billingSummary.avgConsumption)} m3`],
    ], y)

    y += 4
    y = drawSectionLabel(doc, 'Report Scope', y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...PDF_COLORS.textDark)
    doc.text(
      billingMode === 'annual'
        ? `This report includes all billing records for the year ${yearValue}.`
        : `This report includes all billing records for ${periodLabel} only.`,
      14,
      y
    )
    y += 12

    if (billingMode === 'annual' && annualBreakdown.length > 0) {
      y = drawSectionLabel(doc, 'Monthly Breakdown', y)
      y = drawReportTable(doc, {
        startY: y,
        head: [['Month', 'Records', 'Billed (PHP)', 'Paid (PHP)']],
        body: annualBreakdown.map((rowItem) => [
          rowItem.label,
          String(rowItem.count),
          formatNumber(rowItem.total),
          formatNumber(rowItem.paid),
        ]),
        columnStyles: {
          1: { halign: 'right' },
          2: { halign: 'right' },
          3: { halign: 'right' },
        },
      })
    }

    addReportFooter(doc, 'Generated from billing records for administrative review.')
    doc.save(`billing_summary_${billingMode}_${yearValue}${billingMode === 'monthly' ? `_${monthValue}` : ''}.pdf`)
  }

  function escapeCsvValue(value: string | number) {
    const str = String(value ?? '')
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
  }

  // Row-level export of the Billing Management table, styled after the original
  // Metolza Aqua Flow spreadsheet (Meter No. / Name / Present Reading / Previous
  // Reading / Total cubic m. consumed / Amount) — with Billing Date, Due Date, and
  // Payment Status kept on the end. Missing values are left blank, not "—", since
  // this is meant to be read back into a spreadsheet.
  function downloadBillingCsv() {
    const headers = [
      'Meter No.', 'Name', 'Present Reading', 'Previous Reading', 'Total cubic m. consumed', 'Amount',
      'Billing Date', 'Due Date', 'Payment Status',
    ]

    const csvDate = (value?: string | null) => {
      if (!value) return ''
      const parsed = new Date(value)
      return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
    }
    const csvNumber = (value: number | string | undefined) => {
      if (value === undefined || value === null || value === '') return ''
      const n = Number(value)
      return Number.isFinite(n) ? n.toFixed(2) : ''
    }

    const rows = filteredBills.map((record) => {
      const last = record.profiles?.last_name?.trim()
      const first = record.profiles?.first_name?.trim() ?? ''
      const name = record.profiles ? (last ? `${last}, ${first}` : first) : ''

      return [
        record.profiles?.meter_no ?? '',
        name,
        csvNumber(record.current_reading),
        csvNumber(record.previous_reading),
        csvNumber(record.consumption),
        csvNumber(record.total_amount),
        csvDate(record.billing_date),
        csvDate(record.due_date),
        normalizeStatus(record.payment_status) || '',
      ]
    })

    rows.sort((a, b) => String(a[1]).localeCompare(String(b[1])))

    const csvContent = [headers, ...rows]
      .map((row) => row.map(escapeCsvValue).join(','))
      .join('\r\n')

    // The "sep=," directive forces Excel to split columns on commas regardless of
    // the user's regional list-separator setting — without it, Excel on some locales
    // treats each whole row as one cell, which looks like the data is "overlapping".
    const blob = new Blob([`﻿sep=,\r\n${csvContent}`], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `billing_management_${billingMode}_${yearValue}${billingMode === 'monthly' ? `_${monthValue}` : ''}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  function downloadWaterQualityReport() {
    const { doc, cursorY } = createLetterheadDocument({
      documentTitle: 'Water Quality Summary Report',
      meta: [
        { label: 'Window', value: 'Last 24 Hours' },
        { label: 'Generated', value: formatGeneratedTimestamp() },
      ],
    })

    let y = drawHighlightBox(doc, {
      x: 14,
      y: cursorY,
      width: 90,
      label: 'Latest pH Reading',
      value: latestReading?.ph !== null && latestReading?.ph !== undefined ? latestReading.ph.toFixed(2) : '—',
    })
    y += 10

    y = drawSectionLabel(doc, 'Latest Reading', y)
    y = drawKeyValueRows(doc, [
      ['Timestamp:', formatDate(latestReading?.timestamp)],
      ['pH:', latestReading?.ph !== null && latestReading?.ph !== undefined ? latestReading.ph.toFixed(2) : '—'],
      ['Turbidity:', latestReading?.turbidity !== null && latestReading?.turbidity !== undefined ? `${latestReading.turbidity.toFixed(2)} NTU` : '—'],
      ['Temperature:', latestReading?.temperature_c !== null && latestReading?.temperature_c !== undefined ? `${latestReading.temperature_c.toFixed(1)} C` : '—'],
    ], y)

    y += 4
    y = drawSectionLabel(doc, '24-hour Statistics', y)
    drawKeyValueRows(doc, [
      ['pH Range:', qualityStats.ph ? `${qualityStats.ph.min.toFixed(2)} - ${qualityStats.ph.max.toFixed(2)} (avg ${qualityStats.ph.avg.toFixed(2)})` : 'No data'],
      ['Turbidity Range:', qualityStats.turbidity ? `${qualityStats.turbidity.min.toFixed(2)} - ${qualityStats.turbidity.max.toFixed(2)} (avg ${qualityStats.turbidity.avg.toFixed(2)})` : 'No data'],
      ['Temperature Range:', qualityStats.temperature ? `${qualityStats.temperature.min.toFixed(1)} - ${qualityStats.temperature.max.toFixed(1)} (avg ${qualityStats.temperature.avg.toFixed(1)})` : 'No data'],
    ], y)

    addReportFooter(doc, 'Sensor data summary for external compliance review.')
    doc.save('water_quality_summary.pdf')
  }

  function downloadLeakReportsSummary() {
    const leakPeriodLabel = leakMode === 'annual'
      ? `${leakYearValue}`
      : formatMonthLabel(Number(leakYearValue), Number(leakMonthValue) - 1)

    const leakPeriodStart = leakMode === 'annual'
      ? new Date(Number(leakYearValue), 0, 1)
      : new Date(Number(leakYearValue), Number(leakMonthValue) - 1, 1)
    const leakPeriodEnd = leakMode === 'annual'
      ? new Date(Number(leakYearValue), 11, 31)
      : new Date(Number(leakYearValue), Number(leakMonthValue), 0)

    const { doc, cursorY } = createReportDocument({
      title: 'Leak Reports Summary',
      subtitle: `Reporting Period: ${leakPeriodLabel}`,
      meta: [`Coverage: ${formatDate(leakPeriodStart.toISOString())} to ${formatDate(leakPeriodEnd.toISOString())}`],
    })

    let y = drawHighlightBox(doc, {
      x: 14,
      y: cursorY,
      width: 90,
      label: 'Total Reports',
      value: String(leakSummary.total),
    })
    y += 10

    y = drawSectionLabel(doc, 'Status Breakdown', y)
    y = drawReportTable(doc, {
      startY: y,
      head: [['Status', 'Count']],
      body: [
        ['Pending', String(leakSummary.pending)],
        ['Ongoing', String(leakSummary.ongoing)],
        ['Resolved', String(leakSummary.resolved)],
      ],
      columnStyles: { 1: { halign: 'right' } },
    })

    y += 8
    y = drawSectionLabel(doc, 'Report Scope', y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...PDF_COLORS.textDark)
    doc.text(
      leakMode === 'annual'
        ? `This report includes all leak reports for the year ${leakYearValue}.`
        : `This report includes all leak reports for ${leakPeriodLabel} only.`,
      14,
      y
    )

    addReportFooter(doc, 'This summary excludes photos and attachments.')
    doc.save('leak_reports_summary.pdf')
  }

  const periodLabel = billingMode === 'annual'
    ? yearValue || 'Select year'
    : monthValue && yearValue
      ? formatMonthLabel(Number(yearValue), Number(monthValue) - 1)
      : 'Select month'

  const leakPeriodLabel = leakMode === 'annual'
    ? leakYearValue || 'Select year'
    : leakMonthValue && leakYearValue
      ? formatMonthLabel(Number(leakYearValue), Number(leakMonthValue) - 1)
      : 'Select month'

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Reports</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Choose a report and download a PDF.</p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-stretch">
          <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 shadow-sm overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-slate-200/70 dark:border-slate-800">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-blue-600 dark:text-blue-300" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Billing Summary Report</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Monthly or annual billing totals.</p>
                </div>
              </div>
            </div>

            <div className="p-5 space-y-4 flex-1 flex flex-col">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setBillingMode('monthly')}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                      billingMode === 'monthly'
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'text-slate-600 border-slate-200 hover:bg-slate-100 dark:text-slate-400 dark:border-slate-700 dark:hover:bg-slate-800'
                    }`}
                  >
                    Monthly
                  </button>
                  <button
                    type="button"
                    onClick={() => setBillingMode('annual')}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                      billingMode === 'annual'
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'text-slate-600 border-slate-200 hover:bg-slate-100 dark:text-slate-400 dark:border-slate-700 dark:hover:bg-slate-800'
                    }`}
                  >
                    Annual
                  </button>
                </div>

                {billingMode === 'monthly' && (
                  <select
                    value={monthValue}
                    onChange={(e) => setMonthValue(e.target.value)}
                    aria-label="Select billing month"
                    className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 dark:focus:border-blue-500 transition-colors"
                  >
                    {monthOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                )}

                <select
                  value={yearValue}
                  onChange={(e) => setYearValue(e.target.value)}
                  aria-label="Select billing year"
                  className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 dark:focus:border-blue-500 transition-colors"
                >
                  {availableYears.map((year) => (
                    <option key={year} value={String(year)}>{year}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 bg-blue-50/50 dark:bg-blue-500/10">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Total Collection</p>
                  <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">PHP {formatNumber(billingSummary.totalPaid)}</p>
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Total Billed</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">PHP {formatNumber(billingSummary.totalBilled)}</p>
                </div>
              </div>

              <div className="mt-auto pt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={downloadBillingReport}
                  disabled={loading || filteredBills.length === 0}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors w-full sm:w-auto min-w-[220px]"
                >
                  <Download className="h-4 w-4" />
                  Download Billing Report
                </button>
                <button
                  type="button"
                  onClick={downloadBillingCsv}
                  disabled={loading || filteredBills.length === 0}
                  title="Export the billing management table (same columns as the Billing page) as CSV"
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-blue-200 text-blue-700 text-sm font-semibold hover:bg-blue-50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors dark:border-blue-500/30 dark:text-blue-300 dark:hover:bg-blue-500/10 w-full sm:w-auto min-w-[220px]"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  Export Billing CSV
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 shadow-sm overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-slate-200/70 dark:border-slate-800">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center">
                  <Droplets className="h-5 w-5 text-emerald-600 dark:text-emerald-300" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Water Quality Report</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Summary report of sensor readings for compliance checks.</p>
                </div>
              </div>
            </div>

            <div className="p-5 space-y-4 flex-1 flex flex-col">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Latest Sample</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{formatDate(latestReading?.timestamp)}</p>
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                  <p className="text-xs text-slate-500 dark:text-slate-400">pH Range (24h)</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {qualityStats.ph ? `${qualityStats.ph.min.toFixed(2)} - ${qualityStats.ph.max.toFixed(2)}` : 'No data'}
                  </p>
                </div>
              </div>

              <div className="mt-auto pt-2">
                <button
                  type="button"
                  onClick={downloadWaterQualityReport}
                  disabled={loading || !latestReading}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors w-full sm:w-auto min-w-[220px]"
                >
                  <Download className="h-4 w-4" />
                  Download Water Quality Report
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200/70 dark:border-slate-800">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">LR</span>
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Leak Reports Summary</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">Status breakdown for leak submissions (no photos included).</p>
              </div>
            </div>
          </div>
          <div className="p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
              <p className="text-xs text-slate-500 dark:text-slate-400">Total Reports</p>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{leakSummary.total}</p>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
              <p className="text-xs text-slate-500 dark:text-slate-400">Pending / Ongoing / Resolved</p>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{leakSummary.pending} / {leakSummary.ongoing} / {leakSummary.resolved}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setLeakMode('monthly')}
                className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                  leakMode === 'monthly'
                    ? 'bg-slate-700 text-white border-slate-700'
                    : 'text-slate-600 border-slate-200 hover:bg-slate-100 dark:text-slate-400 dark:border-slate-700 dark:hover:bg-slate-800'
                }`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setLeakMode('annual')}
                className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                  leakMode === 'annual'
                    ? 'bg-slate-700 text-white border-slate-700'
                    : 'text-slate-600 border-slate-200 hover:bg-slate-100 dark:text-slate-400 dark:border-slate-700 dark:hover:bg-slate-800'
                }`}
              >
                Annual
              </button>
            </div>

            {leakMode === 'monthly' && (
              <select
                value={leakMonthValue}
                onChange={(e) => setLeakMonthValue(e.target.value)}
                aria-label="Select leak report month"
                className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 dark:focus:border-blue-500 transition-colors"
              >
                {monthOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            )}

            <select
              value={leakYearValue}
              onChange={(e) => setLeakYearValue(e.target.value)}
              aria-label="Select leak report year"
              className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 dark:focus:border-blue-500 transition-colors"
            >
              {availableLeakYears.map((year) => (
                <option key={year} value={String(year)}>{year}</option>
              ))}
            </select>

          </div>
          <div className="mt-4">
            <button
              type="button"
              onClick={downloadLeakReportsSummary}
              disabled={loading || leakSummary.total === 0}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-slate-700 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed transition-colors w-full sm:w-auto min-w-[220px]"
            >
              <Download className="h-4 w-4" />
              Download Leak Reports Summary
            </button>
          </div>
          </div>
        </div>

        {loading && (
          <div className="text-sm text-slate-500 dark:text-slate-400">Loading report data...</div>
        )}
      </div>
    </AppShell>
  )
}
