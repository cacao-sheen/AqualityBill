'use client'

import { useEffect, useMemo, useState } from 'react'
import AppShell from '@/components/AppShell'
import apiClient from '@/lib/axios'
import { AlertTriangle, Bell } from 'lucide-react'

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

type AlertItem = {
  title: string
  timestamp: string
  tone: string
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

function formatTimestamp(value?: string | null) {
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

export default function NotificationsPage() {
  const [latest, setLatest] = useState<Reading | null>(null)
  const [forecast, setForecast] = useState<ForecastPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchNotifications() {
      setLoading(true)
      try {
        const [latestRes, forecastRes] = await Promise.all([
          apiClient.get('/iot/latest'),
          apiClient.get('/iot/forecast/latest?seq_length=150'),
        ])

        const latestRow = latestRes.data?.data
        setLatest(latestRow ? mapReading(latestRow) : null)
        setForecast(forecastRes.data ?? null)
        setError(null)
      } catch (fetchError: any) {
        setLatest(null)
        setForecast(null)
        setError(fetchError?.response?.data?.message || fetchError?.message || 'Failed to load notifications.')
      } finally {
        setLoading(false)
      }
    }

    fetchNotifications()
  }, [])

  const alerts = useMemo<AlertItem[]>(() => {
    const items: AlertItem[] = []

    if (forecast) {
      items.push({
        title: forecast.is_abnormal
          ? 'ML forecast indicates abnormal conditions for the next reading.'
          : 'ML forecast indicates normal conditions for the next reading.',
        timestamp: formatTimestamp(new Date().toISOString()),
        tone: forecast.is_abnormal
          ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/30'
          : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30',
      })
    }

    if (latest) {
      const timestamp = formatTimestamp(latest.timestamp)

      if (latest.ph !== null && (latest.ph < 6.5 || latest.ph > 8.5)) {
        items.push({
          title: `pH out of normal range: ${latest.ph.toFixed(2)}`,
          timestamp,
          tone: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/30',
        })
      }

      if (latest.turbidity !== null && latest.turbidity > 5) {
        items.push({
          title: `High turbidity detected: ${latest.turbidity.toFixed(2)} NTU`,
          timestamp,
          tone: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/30',
        })
      }

      if (latest.tds_ppm !== null && latest.tds_ppm > 500) {
        items.push({
          title: `High total dissolved solids: ${latest.tds_ppm.toFixed(0)} ppm`,
          timestamp,
          tone: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/30',
        })
      }

      if (latest.temperature_c !== null && latest.temperature_c >= 36) {
        items.push({
          title: `High water temperature: ${latest.temperature_c.toFixed(1)}°C`,
          timestamp,
          tone: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/30',
        })
      }
    }

    return items
  }, [latest, forecast])

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400">ML Notifications</p>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Water Quality Alerts</h2>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center dark:bg-blue-500/10 dark:text-blue-300">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Latest ML Signals</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">Abnormalities and forecast-driven notifications</p>
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Loading notifications...</p>
          ) : alerts.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">No ML notifications at the moment.</p>
          ) : (
            <div className="space-y-3">
              {alerts.map((alert, index) => (
                <div key={`${alert.title}-${index}`} className={`flex gap-3 rounded-lg border p-3 ${alert.tone}`}>
                  <AlertTriangle className="h-5 w-5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">{alert.title}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{alert.timestamp}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
