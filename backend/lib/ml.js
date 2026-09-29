'use strict'

const fs = require('fs')
const path = require('path')
const tf = require('@tensorflow/tfjs')

let modelPromise = null
let scaler = null

function resolveExistingPath(pathValue) {
  if (!pathValue) return null

  const candidates = []
  if (path.isAbsolute(pathValue)) {
    candidates.push(pathValue)
  }

  candidates.push(path.resolve(pathValue))
  candidates.push(path.resolve(__dirname, '..', pathValue))

  if (pathValue.startsWith('backend/') || pathValue.startsWith(`backend${path.sep}`)) {
    const trimmed = pathValue.replace(/^backend[\\/]/, '')
    candidates.push(path.resolve(__dirname, '..', trimmed))
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  return null
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min
  return Math.min(Math.max(value, min), max)
}

function median(values) {
  if (!Array.isArray(values) || values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2
  }
  return sorted[mid]
}

function linearRegressionSlope(xs, ys) {
  if (!Array.isArray(xs) || !Array.isArray(ys) || xs.length !== ys.length || xs.length < 2) return 0

  const n = xs.length
  const meanX = xs.reduce((sum, v) => sum + v, 0) / n
  const meanY = ys.reduce((sum, v) => sum + v, 0) / n

  let num = 0
  let den = 0
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i] - meanX
    num += dx * (ys[i] - meanY)
    den += dx * dx
  }

  if (den === 0) return 0
  return num / den
}

function trendForecast(sequence, options = {}) {
  if (!Array.isArray(sequence) || sequence.length < 2) return null

  const horizonSeconds = clamp(Number(options.horizonSeconds ?? 600), 60, 3600)
  const sampleIntervalSeconds = clamp(Number(options.sampleIntervalSeconds ?? 3), 1, 60)

  const featureCount = sequence[0]?.length ?? 0
  if (featureCount < 4) return null

  const windowSize = Math.min(sequence.length, clamp(Number(options.windowSize ?? 120), 10, 300))
  const recent = sequence.slice(-windowSize)

  const xs = recent.map((_, index) => index * sampleIntervalSeconds)

  const lastSmoothing = Math.min(recent.length, clamp(Number(options.smoothingWindow ?? 7), 3, 21))
  const smoothingSlice = recent.slice(-lastSmoothing)

  const predictions = []
  for (let featureIndex = 0; featureIndex < 4; featureIndex += 1) {
    const ys = recent.map((row) => row[featureIndex])
    const slopePerSecond = linearRegressionSlope(xs, ys)
    const smoothLast = median(smoothingSlice.map((row) => row[featureIndex]))
    if (smoothLast === null) return null
    predictions.push(smoothLast + slopePerSecond * horizonSeconds)
  }

  // Clamp to sane physical ranges
  const ph = clamp(predictions[0], 0, 14)
  const temperature = clamp(predictions[1], -30, 120)
  const tds = clamp(predictions[2], 0, 5000)
  const turbidity = clamp(predictions[3], 0, 5000)
  return [ph, temperature, tds, turbidity]
}

function loadScaler(scalerPath) {
  const resolved = resolveExistingPath(scalerPath)
  if (!resolved) {
    throw new Error(`Scaler file not found at ${scalerPath}`)
  }

  const raw = fs.readFileSync(resolved, 'utf8')
  const parsed = JSON.parse(raw)

  if (!Array.isArray(parsed.min) || !Array.isArray(parsed.max)) {
    throw new Error('Scaler JSON must include min and max arrays')
  }

  return {
    min: parsed.min,
    max: parsed.max,
    featureOrder: parsed.featureOrder || ['ph', 'temperature_c', 'tds_ppm', 'turbidity'],
  }
}

function getScaler() {
  if (scaler) return scaler

  const scalerPath = process.env.ML_SCALER_PATH
  if (!scalerPath) {
    throw new Error('ML_SCALER_PATH is not set')
  }

  scaler = loadScaler(scalerPath)
  return scaler
}

// The model was exported from Keras 3, whose layer config format differs from what
// @tensorflow/tfjs-layers (still Keras-2-shaped) expects: InputLayer uses `batch_shape`
// instead of `batch_input_shape`, and every layer's `dtype` is a nested DTypePolicy
// object instead of a plain string. This walks the topology and rewrites both to the
// shape tfjs-layers can deserialize, without altering the actual weights/architecture.
function normalizeKerasTopology(modelTopology) {
  const layers = modelTopology?.model_config?.config?.layers
  if (!Array.isArray(layers)) return modelTopology

  for (const layer of layers) {
    const config = layer.config
    if (!config) continue

    if (layer.class_name === 'InputLayer' && config.batch_shape && !config.batch_input_shape) {
      config.batch_input_shape = config.batch_shape
      delete config.batch_shape
    }

    if (config.dtype && typeof config.dtype === 'object') {
      config.dtype = config.dtype.config?.name || 'float32'
    }
  }

  return modelTopology
}

// Plain @tensorflow/tfjs has no Node filesystem I/O router (that only comes with the
// native @tensorflow/tfjs-node binding, which requires a C++ compile toolchain this
// environment doesn't have). This handler reads model.json and its weight shard(s)
// directly via fs and hands tfjs the parsed artifacts, so the trained model can load
// and run on the pure-JS CPU backend without any native dependency.
function createFileSystemIOHandler(modelJsonPath) {
  return {
    async load() {
      const modelJson = JSON.parse(fs.readFileSync(modelJsonPath, 'utf8'))
      const modelDir = path.dirname(modelJsonPath)

      const weightSpecs = []
      const buffers = []
      for (const group of modelJson.weightsManifest) {
        weightSpecs.push(...group.weights)
        for (const weightPath of group.paths) {
          buffers.push(fs.readFileSync(path.join(modelDir, weightPath)))
        }
      }

      const concatenated = Buffer.concat(buffers)
      const weightData = concatenated.buffer.slice(
        concatenated.byteOffset,
        concatenated.byteOffset + concatenated.byteLength
      )

      return {
        modelTopology: normalizeKerasTopology(modelJson.modelTopology),
        weightSpecs,
        weightData,
        format: modelJson.format,
        generatedBy: modelJson.generatedBy,
        convertedBy: modelJson.convertedBy,
      }
    },
  }
}

function getModel() {
  if (modelPromise) return modelPromise

  const modelPath = process.env.ML_MODEL_PATH
  if (!modelPath) {
    throw new Error('ML_MODEL_PATH is not set')
  }

  const resolvedModelPath = resolveExistingPath(modelPath)
  if (!resolvedModelPath) {
    throw new Error(`Model file not found at ${modelPath}`)
  }

  modelPromise = tf.loadLayersModel(createFileSystemIOHandler(resolvedModelPath))
  return modelPromise
}

function scaleValue(value, min, max) {
  if (max === min) return 0
  return (value - min) / (max - min)
}

function unscaleValue(value, min, max) {
  return value * (max - min) + min
}

function scaleSequence(sequence, scalerInfo) {
  return sequence.map((row) =>
    row.map((value, index) => scaleValue(value, scalerInfo.min[index], scalerInfo.max[index]))
  )
}

function unscalePrediction(prediction, scalerInfo) {
  return prediction.map((value, index) => unscaleValue(value, scalerInfo.min[index], scalerInfo.max[index]))
}

async function forecastWithLSTM(sequence, options = {}) {
  const scalerInfo = getScaler()
  const model = await getModel()

  const scaled = scaleSequence(sequence, scalerInfo)
  const inputTensor = tf.tensor3d([scaled])

  const outputTensor = model.predict(inputTensor)
  const outputArray = await outputTensor.array()

  inputTensor.dispose()
  outputTensor.dispose()

  const rawPrediction = Array.isArray(outputArray[0][0]) ? outputArray[0][0] : outputArray[0]
  return unscalePrediction(rawPrediction, scalerInfo)
}

// The trained LSTM (forecastWithLSTM, still available above) was backtested against
// real stored readings in backend/scripts/backtest-forecast.js and found roughly two
// orders of magnitude less accurate than this simpler trend method across every
// feature -- it was very likely trained on a dataset that doesn't represent this
// deployment's actual sensors/water source. Using the trend method as the real
// forecaster until the LSTM is retrained on this project's own collected data and
// re-validated with the same backtest.
async function forecast(sequence, options = {}) {
  const result = trendForecast(sequence, options)
  if (!result) {
    throw new Error('Not enough sensor readings available for forecasting')
  }
  return result
}

module.exports = {
  forecast,
  forecastWithLSTM,
  getScaler,
  trendForecast,
}
