const supabase = require('../lib/supabase');
const ml = require('../lib/ml');

function toFiniteNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function pickValue(body, keys) {
  for (const key of keys) {
    if (body[key] !== undefined && body[key] !== null && body[key] !== '') {
      return body[key];
    }
  }
  return null;
}

function normalizeIncomingReading(body) {
  const deviceIdRaw = pickValue(body, ['device_id', 'deviceId', 'device']);
  const timestampRaw = pickValue(body, ['timestamp', 'recorded_at', 'created_at']);

  return {
    device_id: String(deviceIdRaw || '').trim(),
    ph: toFiniteNumber(pickValue(body, ['ph', 'ph_level'])),
    turbidity: toFiniteNumber(pickValue(body, ['turbidity', 'turbidity_ntu', 'ntu'])),
    tds_ppm: toFiniteNumber(pickValue(body, ['tds_ppm', 'tds', 'total_dissolved_solids', 'totalDissolvedSolids'])),
    temperature_c: toFiniteNumber(pickValue(body, ['temperature_c', 'temperatureC', 'temperature'])),
    timestamp: timestampRaw ? new Date(String(timestampRaw)).toISOString() : new Date().toISOString(),
  };
}

function validateReadingPayload(payload) {
  const errors = [];

  if (!payload.device_id) errors.push('device_id is required');
  if (payload.ph === null || payload.ph < 0 || payload.ph > 14) errors.push('ph must be between 0 and 14');
  if (payload.turbidity === null || payload.turbidity < 0 || payload.turbidity > 5000) errors.push('turbidity must be between 0 and 5000');
  if (payload.tds_ppm !== null && (payload.tds_ppm < 0 || payload.tds_ppm > 5000)) {
    errors.push('tds_ppm must be between 0 and 5000');
  }
  if (payload.temperature_c === null || payload.temperature_c < -30 || payload.temperature_c > 120) errors.push('temperature_c must be between -30 and 120');
  if (!payload.timestamp || Number.isNaN(new Date(payload.timestamp).getTime())) errors.push('timestamp must be a valid ISO date');

  return errors;
}

function mapRow(row) {
  return {
    id: row.id,
    device_id: row.device_id ?? row.deviceId ?? row.device ?? null,
    ph: toFiniteNumber(row.ph ?? row.ph_level),
    turbidity: toFiniteNumber(row.turbidity ?? row.turbidity_ntu),
    tds_ppm: toFiniteNumber(row.tds_ppm ?? row.tds ?? row.total_dissolved_solids ?? row.totalDissolvedSolids),
    temperature_c: toFiniteNumber(row.temperature_c ?? row.temperature),
    timestamp: row.timestamp ?? row.recorded_at ?? row.created_at ?? null,
  };
}

function buildForecastSequence(readings, seqLength) {
  if (!Array.isArray(readings) || readings.length < seqLength) {
    return null;
  }

  const slice = readings.slice(-seqLength);
  const sequence = slice.map((reading) => {
    const ph = toFiniteNumber(reading.ph ?? reading.ph_level);
    const temperature = toFiniteNumber(reading.temperature_c ?? reading.temperature);
    const tds = toFiniteNumber(reading.tds_ppm ?? reading.tds ?? reading.total_dissolved_solids);
    const turbidity = toFiniteNumber(reading.turbidity ?? reading.turbidity_ntu);

    if ([ph, temperature, tds, turbidity].some((value) => value === null)) {
      return null;
    }

    return [ph, temperature, tds, turbidity];
  });

  if (sequence.some((row) => row === null)) {
    return null;
  }

  return sequence;
}

function getThresholds() {
  return {
    temp: Number(process.env.ML_THRESHOLD_TEMP || 25),
    ph_min: Number(process.env.ML_THRESHOLD_PH_MIN || 6.5),
    ph_max: Number(process.env.ML_THRESHOLD_PH_MAX || 8.5),
    tds: Number(process.env.ML_THRESHOLD_TDS || 300),
    turb: Number(process.env.ML_THRESHOLD_TURB || 3),
  };
}

function parseHorizonSeconds(value, defaultSeconds = 600) {
  const parsed = parseInt(String(value ?? defaultSeconds), 10)
  if (!Number.isFinite(parsed)) return defaultSeconds
  return Math.min(Math.max(parsed, 60), 3600)
}

function sortReadingsByTimestamp(readings) {
  return [...readings].sort((a, b) => {
    const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return aTime - bTime;
  });
}

async function buildSequenceFromDatabase(seqLength) {
  const { data, orderColumn } = await getLatestRows(seqLength, false);
  const mapped = (data || []).map((row) => mapRow(row));

  if (mapped.length < seqLength) {
    return { sequence: null, orderColumn };
  }

  const sorted = sortReadingsByTimestamp(mapped);
  return { sequence: buildForecastSequence(sorted, seqLength), orderColumn };
}

async function getLatestRows(limit, ascending = false) {
  const orderColumns = ['timestamp', 'recorded_at', 'created_at'];
  let lastError = null;

  for (const column of orderColumns) {
    const query = supabase
      .from('sensor_readings')
      .select('*')
      .order(column, { ascending })
      .limit(limit);

    const { data, error } = await query;
    if (!error) return { data, orderColumn: column };

    lastError = error;
    const message = String(error.message || '').toLowerCase();
    const isMissingColumn = message.includes(`column \"${column}\"`) && message.includes('does not exist');
    if (!isMissingColumn) break;
  }

  throw lastError || new Error('Unable to query sensor readings');
}

async function insertWithMissingColumnFallback(payload) {
  const mutablePayload = { ...payload };
  let lastError = null;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data, error } = await supabase
      .from('sensor_readings')
      .insert(mutablePayload)
      .select('*')
      .single();

    if (!error) return data;

    lastError = error;
    const message = String(error.message || '');
    const missingColumnMatch =
      message.match(/column\s+\"([^\"]+)\"\s+of relation\s+\"sensor_readings\"\s+does not exist/i) ||
      message.match(/could not find the\s+'([^']+)'\s+column\s+of\s+'sensor_readings'/i);

    if (missingColumnMatch?.[1]) {
      delete mutablePayload[String(missingColumnMatch[1])];
      continue;
    }

    break;
  }

  throw lastError || new Error('Failed to save sensor reading');
}

exports.ingestReading = async (req, res) => {
  try {
    const configuredDeviceKey = String(process.env.IOT_DEVICE_KEY || '').trim();
    if (!configuredDeviceKey) {
      return res.status(500).json({ message: 'IOT_DEVICE_KEY is not configured on the server' });
    }

    const requestDeviceKey = String(req.headers['x-device-key'] || '').trim();
    if (!requestDeviceKey || requestDeviceKey !== configuredDeviceKey) {
      return res.status(401).json({ message: 'Invalid device key' });
    }

    const normalized = normalizeIncomingReading(req.body || {});
    const errors = validateReadingPayload(normalized);

    if (errors.length > 0) {
      return res.status(400).json({ message: 'Invalid sensor payload', errors });
    }

    const inserted = await insertWithMissingColumnFallback(normalized);
    return res.status(201).json({ success: true, data: mapRow(inserted) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.getLatestReading = async (req, res) => {
  try {
    const { data } = await getLatestRows(1, false);
    const row = data?.[0] ? mapRow(data[0]) : null;
    return res.status(200).json({ success: true, data: row });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.getReadingHistory = async (req, res) => {
  try {
    const hours = Math.min(Math.max(parseInt(String(req.query.hours || '8'), 10) || 8, 1), 24);
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || '240'), 10) || 240, 1), 1000);
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const ordered = await getLatestRows(limit, false);
    const filtered = (ordered.data || [])
      .filter((row) => {
        const stamp = row[ordered.orderColumn] || row.timestamp || row.recorded_at || row.created_at;
        if (!stamp) return false;
        return new Date(stamp).getTime() >= new Date(since).getTime();
      })
      .map((row) => mapRow(row))
      .sort((a, b) => {
        const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return aTime - bTime;
      });

    return res.status(200).json({ success: true, count: filtered.length, data: filtered });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.forecastReading = async (req, res) => {
  try {
    const seqLength = Math.max(parseInt(String(process.env.ML_SEQ_LENGTH || '150'), 10), 1);
    const readings = req.body?.readings;
    const horizonSeconds = parseHorizonSeconds(req.body?.horizon_seconds ?? req.query?.horizon_seconds, 600);

    const sequence = buildForecastSequence(readings, seqLength);
    if (!sequence) {
      return res.status(400).json({
        message: `Provide a readings array with at least ${seqLength} valid items`,
      });
    }

    const prediction = await ml.forecast(sequence, { horizonSeconds, sampleIntervalSeconds: 10 });
    const [ph, temp, tds, turb] = prediction;

    const thresholds = getThresholds();
    const isAbnormal =
      temp > thresholds.temp ||
      ph < thresholds.ph_min ||
      ph > thresholds.ph_max ||
      tds > thresholds.tds ||
      turb > thresholds.turb;

    return res.status(200).json({
      success: true,
      prediction: {
        ph,
        temperature_c: temp,
        tds_ppm: tds,
        turbidity: turb,
      },
      thresholds,
      is_abnormal: isAbnormal,
      horizon_seconds: horizonSeconds,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.forecastLatestReadings = async (req, res) => {
  try {
    const seqLength = Math.max(parseInt(String(req.query.seq_length || process.env.ML_SEQ_LENGTH || '150'), 10), 1);
    const horizonSeconds = parseHorizonSeconds(req.query.horizon_seconds, 600);
    const { sequence } = await buildSequenceFromDatabase(seqLength);

    if (!sequence) {
      return res.status(400).json({
        message: `Not enough sensor readings available for a ${seqLength}-step forecast`,
      });
    }

    const prediction = await ml.forecast(sequence, { horizonSeconds, sampleIntervalSeconds: 10 });
    const [ph, temp, tds, turb] = prediction;

    const thresholds = getThresholds();
    const isAbnormal =
      temp > thresholds.temp ||
      ph < thresholds.ph_min ||
      ph > thresholds.ph_max ||
      tds > thresholds.tds ||
      turb > thresholds.turb;

    return res.status(200).json({
      success: true,
      prediction: {
        ph,
        temperature_c: temp,
        tds_ppm: tds,
        turbidity: turb,
      },
      thresholds,
      is_abnormal: isAbnormal,
      horizon_seconds: horizonSeconds,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};