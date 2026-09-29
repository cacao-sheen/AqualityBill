'use strict'

// Backtests the ML forecast model against real stored sensor_readings: for each
// point far enough back in history to have 150 prior readings AND a known future
// reading, it predicts once and compares that prediction against actual readings
// at several candidate horizons (the model doesn't take horizon as an input, so
// this also reveals empirically which horizon its output actually corresponds to).
//
// Run from backend/: node scripts/backtest-forecast.js

require('dotenv').config()

const supabase = require('../lib/supabase')
const ml = require('../lib/ml')

const FEATURES = ['ph', 'temperature_c', 'tds_ppm', 'turbidity']
const SEQ_LENGTH = Math.max(parseInt(process.env.ML_SEQ_LENGTH || '150', 10), 1)
const HORIZONS_SECONDS = [10, 30, 60, 180, 300, 600]
const MATCH_TOLERANCE_RATIO = 0.25

function toFiniteNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

async function fetchAllReadings() {
  const orderColumns = ['timestamp', 'recorded_at', 'created_at']
  let lastError = null

  for (const column of orderColumns) {
    const { data, error } = await supabase
      .from('sensor_readings')
      .select('*')
      .order(column, { ascending: true })
      .limit(5000)

    if (!error) return { data: data || [], orderColumn: column }
    lastError = error
    const msg = String(error.message || '').toLowerCase()
    const missing = msg.includes(`column "${column}"`) && msg.includes('does not exist')
    if (!missing) break
  }

  throw lastError || new Error('Unable to query sensor_readings')
}

function mapRow(row, orderColumn) {
  const ts = row.timestamp ?? row.recorded_at ?? row.created_at ?? row[orderColumn]
  return {
    ph: toFiniteNumber(row.ph ?? row.ph_level),
    temperature_c: toFiniteNumber(row.temperature_c ?? row.temperature),
    tds_ppm: toFiniteNumber(row.tds_ppm ?? row.tds ?? row.total_dissolved_solids),
    turbidity: toFiniteNumber(row.turbidity ?? row.turbidity_ntu),
    timestamp: ts ? new Date(ts).getTime() : null,
  }
}

function toFeatureVector(row) {
  return FEATURES.map((f) => row[f])
}

function findClosestByTime(rows, targetTime, toleranceMs) {
  let best = null
  let bestDiff = Infinity
  for (const row of rows) {
    if (row.timestamp === null) continue
    const diff = Math.abs(row.timestamp - targetTime)
    if (diff < bestDiff) {
      bestDiff = diff
      best = row
    }
  }
  return best && bestDiff <= toleranceMs ? best : null
}

function mae(errors) {
  if (errors.length === 0) return null
  return errors.reduce((sum, v) => sum + Math.abs(v), 0) / errors.length
}

async function runBacktest() {
  console.log('Fetching stored sensor_readings...')
  const { data, orderColumn } = await fetchAllReadings()
  const rows = data
    .map((r) => mapRow(r, orderColumn))
    .filter((r) => r.timestamp !== null)
    .sort((a, b) => a.timestamp - b.timestamp)

  console.log(`Loaded ${rows.length} readings.`)
  if (rows.length < SEQ_LENGTH + 2) {
    console.log(`Not enough data yet: need at least ${SEQ_LENGTH + 2} readings, have ${rows.length}.`)
    console.log('Let the ESP32 keep running and try again later.')
    return
  }

  const totalSpanSeconds = (rows[rows.length - 1].timestamp - rows[0].timestamp) / 1000
  console.log(`Data spans ~${(totalSpanSeconds / 60).toFixed(1)} minutes.\n`)

  // One prediction per anchor point (the model output doesn't depend on horizonSeconds),
  // then compare that single prediction against actual readings at each candidate horizon.
  // Also tracks a naive "nothing changes" baseline (last reading in the window) at the
  // same horizons, since a trained model is only worth using if it beats that for free.
  const errorsByHorizon = new Map(HORIZONS_SECONDS.map((h) => [h, FEATURES.map(() => [])]))
  const baselineErrorsByHorizon = new Map(HORIZONS_SECONDS.map((h) => [h, FEATURES.map(() => [])]))
  const trendErrorsByHorizon = new Map(HORIZONS_SECONDS.map((h) => [h, FEATURES.map(() => [])]))
  let anchorsUsed = 0

  for (let i = SEQ_LENGTH; i < rows.length; i += 1) {
    const windowRows = rows.slice(i - SEQ_LENGTH, i)
    if (windowRows.some((r) => FEATURES.some((f) => r[f] === null))) continue

    const sequence = windowRows.map(toFeatureVector)
    let prediction
    try {
      prediction = await ml.forecastWithLSTM(sequence)
    } catch (err) {
      continue
    }
    anchorsUsed += 1

    const lastKnown = windowRows[windowRows.length - 1]
    const anchorTime = lastKnown.timestamp
    const futureRows = rows.slice(i)

    for (const horizonSeconds of HORIZONS_SECONDS) {
      const targetTime = anchorTime + horizonSeconds * 1000
      const toleranceMs = horizonSeconds * MATCH_TOLERANCE_RATIO * 1000
      const actualRow = findClosestByTime(futureRows, targetTime, toleranceMs)
      if (!actualRow || FEATURES.some((f) => actualRow[f] === null)) continue

      const trendPrediction = ml.trendForecast(sequence, { horizonSeconds, sampleIntervalSeconds: 10 })

      const errors = errorsByHorizon.get(horizonSeconds)
      const baselineErrors = baselineErrorsByHorizon.get(horizonSeconds)
      const trendErrors = trendErrorsByHorizon.get(horizonSeconds)
      FEATURES.forEach((f, idx) => {
        errors[idx].push(prediction[idx] - actualRow[f])
        baselineErrors[idx].push(lastKnown[f] - actualRow[f])
        if (trendPrediction) trendErrors[idx].push(trendPrediction[idx] - actualRow[f])
      })
    }
  }

  console.log(`Ran the model on ${anchorsUsed} historical anchor points.\n`)

  for (const horizonSeconds of HORIZONS_SECONDS) {
    const errors = errorsByHorizon.get(horizonSeconds)
    const baselineErrors = baselineErrorsByHorizon.get(horizonSeconds)
    const trendErrors = trendErrorsByHorizon.get(horizonSeconds)
    const n = errors[0].length
    console.log(`--- Horizon: ${horizonSeconds}s (${(horizonSeconds / 60).toFixed(1)} min) ---`)
    if (n < 3) {
      console.log(`  Not enough valid pairs yet (${n}). Need data spanning further ahead.\n`)
      continue
    }
    FEATURES.forEach((f, idx) => {
      const modelMae = mae(errors[idx])
      const baseMae = mae(baselineErrors[idx])
      const trendMae = trendErrors[idx].length ? mae(trendErrors[idx]) : null
      const candidates = [['LSTM', modelMae], ['baseline', baseMae], ['trend', trendMae]].filter(([, v]) => v !== null)
      const winner = candidates.reduce((best, cur) => (cur[1] < best[1] ? cur : best))[0]
      const trendStr = trendMae !== null ? trendMae.toFixed(3) : 'n/a'
      console.log(`  ${f.padEnd(15)} LSTM MAE = ${modelMae.toFixed(3).padEnd(9)} baseline MAE = ${baseMae.toFixed(3).padEnd(9)} trend MAE = ${trendStr.padEnd(9)} (winner: ${winner}, n=${n})`)
    })
    console.log('')
  }

  console.log('baseline = naive "assume nothing changes from the last reading" prediction.')
  console.log('trend = linear-regression extrapolation over the recent window (the old silent fallback).')
  console.log('If LSTM isn\'t consistently winning, it isn\'t adding value over the simpler options.')
}

runBacktest()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Backtest failed:', err)
    process.exit(1)
  })
