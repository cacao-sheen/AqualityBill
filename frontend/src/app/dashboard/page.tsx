'use client'

import { useEffect, useMemo, useState } from 'react'
import AppShell from '@/components/AppShell'
import apiClient from '@/lib/axios'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

type BillingRecord = {
  id: string
  total_amount: number | string
  payment_status: string
  billing_date?: string
  due_date?: string
  consumption?: number | string
}

type LeakReport = {
  id: string
  status?: string
  submitted_at?: string
}

type Reading = {
  ph: number | null
  turbidity: number | null
  tds_ppm: number | null
  temperature_c: number | null
  timestamp: string | null
}

type ForecastPayload = {
  prediction: {
    ph: number
    temperature_c: number
    tds_ppm: number
    turbidity: number
  }
  is_abnormal: boolean
}

function normalizeStatus(value?: string) {
  return String(value ?? '').trim().toLowerCase()
}

function formatPeso(value: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 2,
  }).format(value)
}

function formatMonthLabel(date: Date) {
  return date.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })
}

function formatDateTime(value?: string) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function toNumber(value: unknown) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

function mapReading(row: Record<string, unknown>): Reading {
  return {
    ph: toNumber(row.ph),
    turbidity: toNumber(row.turbidity),
    tds_ppm: toNumber(row.tds_ppm ?? row.tds ?? row.total_dissolved_solids ?? row.totalDissolvedSolids),
    temperature_c: toNumber(row.temperature_c),
    timestamp: typeof row.timestamp === 'string' ? row.timestamp : null,
  }
}

function getErrorMessage(fetchError: any) {
  return fetchError?.response?.data?.message || fetchError?.message || 'Failed to load dashboard data.'
}

const MONTH_OPTIONS = [
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

export default function DashboardPage() {
  const [bills, setBills] = useState<BillingRecord[]>([])
  const [leakReports, setLeakReports] = useState<LeakReport[]>([])
  const [iotLatest, setIotLatest] = useState<Reading | null>(null)
  const [iotForecast, setIotForecast] = useState<ForecastPayload | null>(null)
  const [disconnectionCount, setDisconnectionCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [monthValue, setMonthValue] = useState(() => String(new Date().getMonth() + 1).padStart(2, '0'))
  const [yearValue, setYearValue] = useState(() => String(new Date().getFullYear()))

  useEffect(() => {
    async function fetchDashboardData() {
      setLoading(true)
      try {
        const results = await Promise.allSettled([
          apiClient.get('/bills'),
          apiClient.get('/leak-reports'),
          apiClient.get('/iot/latest'),
          apiClient.get('/iot/forecast/latest?seq_length=150'),
          apiClient.get('/disconnections'),
        ])

        const [billsRes, leaksRes, latestRes, forecastRes, disconnectionsRes] = results
        let nextError: string | null = null

        if (billsRes.status === 'fulfilled') {
          setBills((billsRes.value.data?.data ?? []) as BillingRecord[])
        } else {
          setBills([])
          nextError = nextError ?? getErrorMessage(billsRes.reason)
        }

        if (leaksRes.status === 'fulfilled') {
          setLeakReports((leaksRes.value.data?.data ?? []) as LeakReport[])
        } else {
          setLeakReports([])
          nextError = nextError ?? getErrorMessage(leaksRes.reason)
        }

        if (latestRes.status === 'fulfilled') {
          const latestRow = latestRes.value.data?.data
          setIotLatest(latestRow ? mapReading(latestRow) : null)
        } else {
          setIotLatest(null)
        }

        if (forecastRes.status === 'fulfilled') {
          setIotForecast(forecastRes.value.data ?? null)
        } else {
          setIotForecast(null)
        }

        if (disconnectionsRes.status === 'fulfilled') {
          const payload = disconnectionsRes.value.data
          setDisconnectionCount(typeof payload?.count === 'number' ? payload.count : (payload?.data?.length ?? 0))
        } else {
          setDisconnectionCount(null)
        }

        setError(nextError)
      } catch (fetchError: any) {
        setError(getErrorMessage(fetchError))
        setBills([])
        setLeakReports([])
        setIotLatest(null)
        setIotForecast(null)
        setDisconnectionCount(null)
      } finally {
        setLoading(false)
      }
    }

    fetchDashboardData()
  }, [])

  const availableYears = useMemo(() => {
    const years = new Set<number>()

    for (const bill of bills) {
      const basisDate = bill.billing_date || bill.due_date
      if (!basisDate) continue
      const parsed = new Date(basisDate)
      if (Number.isNaN(parsed.getTime())) continue
      years.add(parsed.getFullYear())
    }

    years.add(new Date().getFullYear())

    return Array.from(years).sort((a, b) => b - a)
  }, [bills])

  // Keep the year selector pointed at a year that's actually in the list once data loads
  useEffect(() => {
    if (availableYears.length > 0 && !availableYears.includes(Number(yearValue))) {
      setYearValue(String(availableYears[0]))
    }
  }, [availableYears, yearValue])

  const selectedMonthDate = useMemo(() => {
    const year = Number(yearValue)
    const month = Number(monthValue)
    const parsed = new Date(year, month - 1, 1)
    if (Number.isNaN(parsed.getTime())) return new Date()
    return parsed
  }, [monthValue, yearValue])

  const selectedMonth = selectedMonthDate.getMonth()
  const selectedYear = selectedMonthDate.getFullYear()

  const totalCollectionThisMonth = useMemo(() => {
    return bills.reduce((sum, bill) => {
      const status = normalizeStatus(bill.payment_status)
      if (status !== 'paid') return sum

      const basisDate = bill.billing_date || bill.due_date
      if (!basisDate) return sum

      const parsed = new Date(basisDate)
      if (Number.isNaN(parsed.getTime())) return sum
      if (parsed.getMonth() !== selectedMonth || parsed.getFullYear() !== selectedYear) return sum

      return sum + Number(bill.total_amount || 0)
    }, 0)
  }, [bills, selectedMonth, selectedYear])

  const totalCollectionThisYear = useMemo(() => {
    return bills.reduce((sum, bill) => {
      const status = normalizeStatus(bill.payment_status)
      if (status !== 'paid') return sum

      const basisDate = bill.billing_date || bill.due_date
      if (!basisDate) return sum

      const parsed = new Date(basisDate)
      if (Number.isNaN(parsed.getTime())) return sum
      if (parsed.getFullYear() !== selectedYear) return sum

      return sum + Number(bill.total_amount || 0)
    }, 0)
  }, [bills, selectedYear])

  const unpaidCount = useMemo(
    () => bills.filter((bill) => normalizeStatus(bill.payment_status) === 'unpaid').length,
    [bills]
  )

  const overdueCount = useMemo(
    () => bills.filter((bill) => normalizeStatus(bill.payment_status) === 'overdue').length,
    [bills]
  )

  const paidCount = useMemo(
    () => bills.filter((bill) => normalizeStatus(bill.payment_status) === 'paid').length,
    [bills]
  )

  const collectionRate = useMemo(() => {
    const totalBilled = bills.reduce((sum, bill) => sum + Number(bill.total_amount || 0), 0)
    if (totalBilled <= 0) return 0
    const totalPaid = bills.reduce((sum, bill) => {
      return normalizeStatus(bill.payment_status) === 'paid' ? sum + Number(bill.total_amount || 0) : sum
    }, 0)
    return (totalPaid / totalBilled) * 100
  }, [bills])

  const paymentStatusBreakdown = useMemo(
    () => [
      { status: 'Paid', count: paidCount, color: '#059669' },
      { status: 'Unpaid', count: unpaidCount, color: '#f59e0b' },
      { status: 'Overdue', count: overdueCount, color: '#dc2626' },
    ],
    [paidCount, unpaidCount, overdueCount]
  )

  // Last 6 calendar months, oldest first — shared x-axis basis for the trend charts below
  const last6Months = useMemo(() => {
    const now = new Date()
    return Array.from({ length: 6 }, (_, idx) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (5 - idx), 1)
      return {
        year: date.getFullYear(),
        monthIndex: date.getMonth(),
        label: date.toLocaleDateString('en-PH', { month: 'short' }),
      }
    })
  }, [])

  const revenueTrend = useMemo(() => {
    return last6Months.map(({ year, monthIndex, label }) => {
      const monthBills = bills.filter((bill) => {
        const basisDate = bill.billing_date || bill.due_date
        if (!basisDate) return false
        const parsed = new Date(basisDate)
        if (Number.isNaN(parsed.getTime())) return false
        return parsed.getFullYear() === year && parsed.getMonth() === monthIndex
      })
      const billed = monthBills.reduce((sum, bill) => sum + Number(bill.total_amount || 0), 0)
      const collected = monthBills
        .filter((bill) => normalizeStatus(bill.payment_status) === 'paid')
        .reduce((sum, bill) => sum + Number(bill.total_amount || 0), 0)
      return { month: label, Billed: billed, Collected: collected }
    })
  }, [bills, last6Months])

  const consumptionTrend = useMemo(() => {
    return last6Months.map(({ year, monthIndex, label }) => {
      const monthBills = bills.filter((bill) => {
        const basisDate = bill.billing_date || bill.due_date
        if (!basisDate) return false
        const parsed = new Date(basisDate)
        if (Number.isNaN(parsed.getTime())) return false
        return parsed.getFullYear() === year && parsed.getMonth() === monthIndex
      })
      const avg = monthBills.length > 0
        ? monthBills.reduce((sum, bill) => sum + Number(bill.consumption || 0), 0) / monthBills.length
        : 0
      return { month: label, avgConsumption: Number(avg.toFixed(2)) }
    })
  }, [bills, last6Months])

  const leakTrend = useMemo(() => {
    return last6Months.map(({ year, monthIndex, label }) => {
      const count = leakReports.filter((report) => {
        if (!report.submitted_at) return false
        const parsed = new Date(report.submitted_at)
        if (Number.isNaN(parsed.getTime())) return false
        return parsed.getFullYear() === year && parsed.getMonth() === monthIndex
      }).length
      return { month: label, count }
    })
  }, [leakReports, last6Months])

  const hasBillingHistory = bills.length > 0
  const hasLeakHistory = leakReports.length > 0

  const pendingLeaks = useMemo(
    () => leakReports.filter((report) => normalizeStatus(report.status) === 'pending').length,
    [leakReports]
  )

  const ongoingLeaks = useMemo(
    () => leakReports.filter((report) => normalizeStatus(report.status) === 'ongoing').length,
    [leakReports]
  )

  const resolvedLeaks = useMemo(
    () => leakReports.filter((report) => normalizeStatus(report.status) === 'resolved').length,
    [leakReports]
  )

  const leakStatus = [
    { label: 'Pending', value: pendingLeaks, tone: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30' },
    { label: 'Ongoing', value: ongoingLeaks, tone: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/30' },
    { label: 'Resolved', value: resolvedLeaks, tone: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30' },
  ]

  const latestLeakTimestamp = useMemo(() => {
    const values = leakReports
      .map((report) => report.submitted_at)
      .filter((value): value is string => !!value)
      .map((value) => new Date(value).getTime())
      .filter((value) => !Number.isNaN(value))

    if (values.length === 0) return undefined
    return new Date(Math.max(...values)).toISOString()
  }, [leakReports])

  const mlAlerts = useMemo(() => {
    const rows = [] as { message: string; tone: string }[]

    if (iotForecast) {
      rows.push({
        message: iotForecast.is_abnormal
          ? 'ML forecast indicates abnormal conditions for the next reading.'
          : 'ML forecast indicates normal conditions for the next reading.',
        tone: iotForecast.is_abnormal
          ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/30'
          : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30',
      })
    }

    if (iotLatest) {
      const issues: string[] = []

      if (iotLatest.ph !== null && (iotLatest.ph < 6.5 || iotLatest.ph > 8.5)) {
        issues.push('pH')
      }

      if (iotLatest.turbidity !== null && iotLatest.turbidity > 5) {
        issues.push('turbidity')
      }

      if (iotLatest.tds_ppm !== null && iotLatest.tds_ppm > 500) {
        issues.push('TDS')
      }

      if (iotLatest.temperature_c !== null && iotLatest.temperature_c >= 36) {
        issues.push('temperature')
      }

      if (issues.length > 0) {
        rows.push({
          message: `Latest IoT reading outside thresholds for: ${issues.join(', ')}.`,
          tone: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/30',
        })
      }
    }

    return rows
  }, [iotForecast, iotLatest])

  const alerts = useMemo(() => {
    const rows = [] as { message: string; tone: string }[]

    rows.push(...mlAlerts)

    if (overdueCount > 0) {
      rows.push({
        message: `${overdueCount} overdue bill${overdueCount > 1 ? 's are' : ' is'} requiring immediate follow-up.`,
        tone: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/30',
      })
    }

    if (unpaidCount > 0) {
      rows.push({
        message: `${unpaidCount} unpaid bill${unpaidCount > 1 ? 's remain' : ' remains'} open this cycle.`,
        tone: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30',
      })
    }

    if (pendingLeaks > 0) {
      rows.push({
        message: `${pendingLeaks} leak report${pendingLeaks > 1 ? 's are' : ' is'} pending review.`,
        tone: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/30',
      })
    }

    if (ongoingLeaks > 0) {
      rows.push({
        message: `${ongoingLeaks} leak issue${ongoingLeaks > 1 ? 's are' : ' is'} currently ongoing.`,
        tone: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
      })
    }

    if (rows.length === 0) {
      rows.push({
        message: 'No active system alerts right now.',
        tone: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30',
      })
    }

    return rows.slice(0, 4)
  }, [overdueCount, unpaidCount, pendingLeaks, ongoingLeaks, mlAlerts])

  const quickStats = [
    {
      label: 'Monthly Collection',
      value: loading ? '...' : formatPeso(totalCollectionThisMonth),
      caption: `Paid collection for ${formatMonthLabel(selectedMonthDate)}`,
    },
    {
      label: 'Annual Income',
      value: loading ? '...' : formatPeso(totalCollectionThisYear),
      caption: `Total paid collection for ${selectedYear}`,
    },
    {
      label: 'Unpaid Bills',
      value: loading ? '...' : String(unpaidCount),
      caption: 'Consumers with unpaid billing records',
    },
    {
      label: 'Overdue Bills',
      value: loading ? '...' : String(overdueCount),
      caption: 'Billing records marked as overdue',
    },
    {
      label: 'Collection Rate',
      value: loading ? '...' : `${collectionRate.toFixed(1)}%`,
      caption: 'Paid amount as a share of total billed',
    },
    {
      label: 'Eligible for Disconnection',
      value: loading || disconnectionCount === null ? '...' : String(disconnectionCount),
      caption: 'Consumers with a bill 2+ days past due',
    },
  ]

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400">Admin Dashboard Overview</p>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Operations Snapshot</h2>
        </div>

        <div className="flex items-center justify-end gap-4">
          <div className="flex items-center gap-2">
            <label htmlFor="collection-month" className="text-sm text-slate-600 dark:text-slate-300">
              Month
            </label>
            <select
              id="collection-month"
              value={monthValue}
              onChange={(e) => setMonthValue(e.target.value)}
              className="h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {MONTH_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="collection-year" className="text-sm text-slate-600 dark:text-slate-300">
              Year
            </label>
            <select
              id="collection-year"
              value={yearValue}
              onChange={(e) => setYearValue(e.target.value)}
              className="h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {availableYears.map((year) => (
                <option key={year} value={String(year)}>
                  {year}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {quickStats.map((item) => (
            <div key={item.label} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm flex flex-col gap-1.5">
              <p className="text-sm text-slate-500 dark:text-slate-400">{item.label}</p>
              <p className="text-3xl font-semibold text-slate-900 dark:text-slate-100">{item.value}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{item.caption}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Leak Reports Summary</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">Status of reported incidents</p>
              </div>
              <span className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">Last sync: {formatDateTime(latestLeakTimestamp)}</span>
            </div>
            <div className="flex flex-wrap gap-3">
              {leakStatus.map((status) => (
                <div
                  key={status.label}
                  className={`px-4 py-2 rounded-full border text-sm font-medium ${status.tone}`}
                >
                  {status.label}: {status.value}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Recent System Alerts</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">Current operational issues detected from billing and leak records</p>
              </div>
            </div>
            <div className="space-y-4">
              {alerts.map((alert, index) => (
                <div key={`${alert.message}-${index}`} className="flex items-start gap-3">
                  <span className={`h-9 w-9 rounded-full border flex items-center justify-center font-semibold text-xs shrink-0 ${alert.tone}`}>
                    !
                  </span>
                  <div className="pt-1">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{alert.message}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">Updated from latest records</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Analytics</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">Trends across the last 6 months</p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">Revenue Trend: Billed vs. Collected</h4>
            {!loading && !hasBillingHistory ? (
              <div className="h-[250px] flex items-center justify-center text-sm text-slate-400 dark:text-slate-500">No billing data available yet.</div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={revenueTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(value) => `₱${(Number(value) / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value: number) => formatPeso(Number(value))} />
                  <Legend />
                  <Line type="monotone" dataKey="Billed" stroke="#2a78d6" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="Collected" stroke="#eb6834" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">Payment Status Breakdown</h4>
            {!loading && !hasBillingHistory ? (
              <div className="h-[200px] flex items-center justify-center text-sm text-slate-400 dark:text-slate-500">No billing data available yet.</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={paymentStatusBreakdown} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="status" tick={{ fontSize: 12 }} width={64} />
                  <Tooltip />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {paymentStatusBreakdown.map((entry) => (
                      <Cell key={entry.status} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">Average Consumption Trend</h4>
            {!loading && !hasBillingHistory ? (
              <div className="h-[220px] flex items-center justify-center text-sm text-slate-400 dark:text-slate-500">No billing data available yet.</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={consumptionTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} label={{ value: 'm³', angle: -90, position: 'insideLeft' }} />
                  <Tooltip formatter={(value: number) => `${value} m³`} />
                  <Line type="monotone" dataKey="avgConsumption" name="Avg. Consumption" stroke="#2a78d6" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">Leak Reports Trend</h4>
            {!loading && !hasLeakHistory ? (
              <div className="h-[220px] flex items-center justify-center text-sm text-slate-400 dark:text-slate-500">No leak reports submitted yet.</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={leakTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" name="Leak Reports" fill="#4a3aa7" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  )
}
