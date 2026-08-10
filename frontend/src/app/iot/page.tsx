'use client'

import { useEffect, useMemo, useState } from 'react'
import AppShell from '@/components/AppShell'
import { AlertTriangle, Droplets, Thermometer, Zap } from 'lucide-react'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import apiClient from '@/lib/axios'

type Reading = {
  id?: string
  device_id?: string | null
  ph: number | null
  turbidity: number | null
  tds_ppm: number | null
  water_level_cm: number | null
  temperature_c: number | null
  timestamp: string | null
}

type AlertItem = {
  title: string
  timestamp: string
}

type ForecastPayload = {
  prediction: {
    ph: number
    temperature_c: number
    tds_ppm: number
    turbidity: number
  }
  thresholds?: {
    temp: number
    ph_min: number
    ph_max: number
    tds: number
    turb: number
  }
  is_abnormal: boolean
}

function toNumber(value: unknown) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

function mapReading(row: Record<string, unknown>): Reading {
  return {
    id: typeof row.id === 'string' ? row.id : undefined,
    device_id: typeof row.device_id === 'string' ? row.device_id : null,
    ph: toNumber(row.ph),
    turbidity: toNumber(row.turbidity),
    tds_ppm: toNumber(row.tds_ppm ?? row.tds ?? row.total_dissolved_solids ?? row.totalDissolvedSolids),
    water_level_cm: toNumber(row.water_level_cm),
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

function formatAxisTime(value?: string | null) {
  if (!value) return '--:--'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '--:--'
  return parsed.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
}

function metricStatus(value: number | null | undefined, min: number, max: number) {
  if (value === null || value === undefined) {
    return {
      label: 'NO DATA',
      className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    }
  }

  const isNormal = value >= min && value <= max
  return {
    label: isNormal ? 'NORMAL' : 'ABNORMAL',
    className: isNormal
      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
      : 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300',
  }
}

export default function IoTMonitoringPage() {
  const [latest, setLatest] = useState<Reading | null>(null)
  const [history, setHistory] = useState<Reading[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [forecast, setForecast] = useState<ForecastPayload | null>(null)
  const [forecastLoading, setForecastLoading] = useState(false)
  const [forecastError, setForecastError] = useState<string | null>(null)

  async function fetchIoTData() {
    try {
      const [latestRes, historyRes] = await Promise.all([
        apiClient.get('/iot/latest'),
        apiClient.get('/iot/history?hours=1&limit=720'),
      ])

      const latestRow = latestRes.data?.data
      const historyRows = Array.isArray(historyRes.data?.data) ? historyRes.data.data : []

      setLatest(latestRow ? mapReading(latestRow) : null)
      setHistory(historyRows.map((item: Record<string, unknown>) => mapReading(item)))
      setError(null)
    } catch (fetchError: any) {
      setLatest(null)
      setHistory([])
      setError(fetchError?.response?.data?.message || fetchError?.message || 'Failed to load IoT sensor readings.')
    } finally {
      setLoading(false)
    }
  }

  async function fetchForecast() {
    setForecastLoading(true)
    try {
      const response = await apiClient.get('/iot/forecast/latest?seq_length=150&horizon_seconds=600')
      setForecast(response.data)
      setForecastError(null)
    } catch (err: any) {
      const statusCode = err?.response?.status
      if (statusCode === 400) {
        setForecast(null)
        setForecastError('Forecast unavailable until more readings are collected.')
      } else {
        console.error('Forecast error:', err)
        setForecast(null)
        setForecastError(err?.response?.data?.message || 'Failed to load forecast data.')
      }
    } finally {
      setForecastLoading(false)
    }
  }

  useEffect(() => {
    fetchIoTData()
    fetchForecast()
    const interval = window.setInterval(fetchIoTData, 5000)
    return () => window.clearInterval(interval)
  }, [])

  const tankLevelData = useMemo(
    () => history
      .filter((item) => item.water_level_cm !== null && item.timestamp)
      .map((item) => ({
        time: formatAxisTime(item.timestamp),
        level: item.water_level_cm,
      })),
    [history]
  )

  const qualityData = useMemo(
    () => history
      .filter((item) => item.timestamp)
      .map((item) => ({
        label: formatAxisTime(item.timestamp),
        ph: item.ph,
        turbidity: item.turbidity,
        tds: item.tds_ppm,
        temperature: item.temperature_c,
      })),
    [history]
  )

  const alerts = useMemo<AlertItem[]>(() => {
    if (!latest) return []

    const nextAlerts: AlertItem[] = []
    const timestamp = formatTimestamp(latest.timestamp)

    if (latest.ph !== null && (latest.ph < 6.5 || latest.ph > 8.5)) {
      nextAlerts.push({
        title: `pH out of normal range: ${latest.ph.toFixed(2)}`,
        timestamp,
      })
    }

    if (latest.turbidity !== null && latest.turbidity > 5) {
      nextAlerts.push({
        title: `High turbidity detected: ${latest.turbidity.toFixed(2)} NTU`,
        timestamp,
      })
    }

    if (latest.tds_ppm !== null && latest.tds_ppm > 500) {
      nextAlerts.push({
        title: `High total dissolved solids: ${latest.tds_ppm.toFixed(0)} ppm`,
        timestamp,
      })
    }

    if (latest.temperature_c !== null && latest.temperature_c >= 36) {
      nextAlerts.push({
        title: `High water temperature: ${latest.temperature_c.toFixed(1)}°C`,
        timestamp,
      })
    }

    return nextAlerts
  }, [latest])

  const waterLevelStatus = metricStatus(latest?.water_level_cm, 0, 20.32)
  const phStatus = metricStatus(latest?.ph, 6.5, 8.5)
  const turbidityStatus = metricStatus(latest?.turbidity, 0, 5)
  const tdsStatus = metricStatus(latest?.tds_ppm, 0, 500)
  const temperatureStatus = metricStatus(latest?.temperature_c, 20, 36)

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">IoT Monitoring Dashboard</h2>
          {error && <p className="text-sm text-red-500 dark:text-red-400 mt-2">{error}</p>}
        </div>

        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Real-time System Overview</p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <Zap className="h-5 w-5 text-slate-400 dark:text-slate-500" />
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Current Water Level</p>
              </div>
              <p className="text-3xl font-bold text-primary-600">
                {latest?.water_level_cm !== null && latest?.water_level_cm !== undefined
                  ? `${latest.water_level_cm.toFixed(1)} L`
                  : '—'}
              </p>
              <span className={`mt-2 inline-flex px-2.5 py-1 rounded-md text-xs font-medium ${waterLevelStatus.className}`}>
                {waterLevelStatus.label}
              </span>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">Last updated: {formatTimestamp(latest?.timestamp)}</p>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <Droplets className="h-5 w-5 text-slate-400 dark:text-slate-500" />
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Current pH Level</p>
              </div>
              <p className="text-3xl font-bold text-primary-600">
                {latest?.ph !== null && latest?.ph !== undefined ? latest.ph.toFixed(2) : '—'}
              </p>
              <span className={`mt-2 inline-flex px-2.5 py-1 rounded-md text-xs font-medium ${phStatus.className}`}>
                {phStatus.label}
              </span>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">Healthy range: 6.5–8.5</p>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <Droplets className="h-5 w-5 text-slate-400 dark:text-slate-500" />
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Turbidity</p>
              </div>
              <p className="text-3xl font-bold text-primary-600">
                {latest?.turbidity !== null && latest?.turbidity !== undefined
                  ? `${latest.turbidity.toFixed(2)} NTU`
                  : '—'}
              </p>
              <span className={`mt-2 inline-flex px-2.5 py-1 rounded-md text-xs font-medium ${turbidityStatus.className}`}>
                {turbidityStatus.label}
              </span>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">Normal range: 0–5 NTU</p>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <Droplets className="h-5 w-5 text-slate-400 dark:text-slate-500" />
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Total Dissolved Solids</p>
              </div>
              <p className="text-3xl font-bold text-primary-600">
                {latest?.tds_ppm !== null && latest?.tds_ppm !== undefined
                  ? `${latest.tds_ppm.toFixed(0)} ppm`
                  : '—'}
              </p>
              <span className={`mt-2 inline-flex px-2.5 py-1 rounded-md text-xs font-medium ${tdsStatus.className}`}>
                {tdsStatus.label}
              </span>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">Normal range: 0–500 ppm</p>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <Thermometer className="h-5 w-5 text-slate-400 dark:text-slate-500" />
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Temperature</p>
              </div>
              <p className="text-3xl font-bold text-primary-600">
                {latest?.temperature_c !== null && latest?.temperature_c !== undefined
                  ? `${latest.temperature_c.toFixed(1)}°C`
                  : '—'}
              </p>
              <span className={`mt-2 inline-flex px-2.5 py-1 rounded-md text-xs font-medium ${temperatureStatus.className}`}>
                {temperatureStatus.label}
              </span>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">Normal range: 20–36°C</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Water Quality Forecast (10 min ahead)</h3>
            <button onClick={fetchForecast} disabled={forecastLoading} className="px-3 py-1 bg-blue-600 text-white rounded text-sm disabled:opacity-50">
              {forecastLoading ? 'Loading...' : 'Refresh Forecast'}
            </button>
          </div>
          {forecast ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-300">Predicted pH</p>
                  <p className="text-lg font-bold">{forecast.prediction.ph.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-300">Predicted Temp (°C)</p>
                  <p className="text-lg font-bold">{forecast.prediction.temperature_c.toFixed(1)}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-300">Predicted TDS (ppm)</p>
                  <p className="text-lg font-bold">{forecast.prediction.tds_ppm.toFixed(0)}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-300">Predicted Turbidity (NTU)</p>
                  <p className="text-lg font-bold">{forecast.prediction.turbidity.toFixed(2)}</p>
                </div>
              </div>
              {forecast.is_abnormal ? (
                <div className="p-3 bg-red-50 dark:bg-red-500/10 rounded-lg border border-red-200 dark:border-red-500/30">
                  <p className="text-sm font-medium text-red-800 dark:text-red-200">⚠️ Abnormal conditions predicted in next reading!</p>
                </div>
              ) : (
                <p className="text-sm text-emerald-600 dark:text-emerald-300">Normal prediction within thresholds.</p>
              )}
            </div>
          ) : forecastError ? (
            <p className="text-sm text-red-500 dark:text-red-400">{forecastError}</p>
          ) : (
            <p className="text-sm text-slate-500">No forecast available.</p>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4">Water Tank Level Analytics</h3>
          <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4">
            <h4 className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-4">Water Level History (Last 8 Hours)</h4>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={tankLevelData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="time" tick={{ fontSize: 12 }} />
                <YAxis label={{ value: 'Level (cm)', angle: -90, position: 'insideLeft' }} />
                <Tooltip formatter={(value) => `${value} cm`} />
                <Line
                  type="monotone"
                  dataKey="level"
                  stroke="#5b6eef"
                  dot={false}
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4">Water Quality Parameters (Last 8 Hours)</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={qualityData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="left" label={{ value: 'pH Level', angle: -90, position: 'insideLeft' }} />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  label={{ value: 'Turbidity / TDS (NTU/ppm)', angle: 90, position: 'insideRight' }}
                />
                <Tooltip />
                <Legend />
                <Bar yAxisId="left" dataKey="ph" fill="#5b6eef" name="pH Level" />
                <Bar yAxisId="right" dataKey="turbidity" fill="#ec4899" name="Turbidity (NTU)" />
                <Bar yAxisId="right" dataKey="tds" fill="#f59e0b" name="TDS (ppm)" />
                <Bar yAxisId="left" dataKey="temperature" fill="#10b981" name="Temperature (°C)" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4">Recent System Alerts</h3>
            {loading ? (
              <p className="text-sm text-slate-400 dark:text-slate-500">Loading sensor alerts...</p>
            ) : alerts.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">No active alerts in latest reading.</p>
            ) : (
              <div className="space-y-3">
                {alerts.map((alert, idx) => (
                  <div key={idx} className="flex gap-3 p-3 bg-red-50 dark:bg-red-500/10 rounded-lg border border-red-200 dark:border-red-500/30">
                    <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{alert.title}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{alert.timestamp}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  )
}
