const bcrypt = require('bcryptjs');
const supabase = require('../lib/supabase');

// The collector app's unlock PIN. Only a bcrypt hash is stored, in
// app_settings (no RLS policies, so only this backend can read it).
const SETTING_KEY = 'collector_pin';

// ── Brute-force protection ──────────────────────────────────────────────────
// A 6-digit PIN is only a million combinations, so guesses must be limited.
// Per device/network: 5 wrong PINs → locked out for 15 minutes.
// Overall: more than 30 wrong PINs in 15 minutes from anywhere → everyone is
// paused until that window ends (stops someone rotating IP addresses).
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS_PER_IP = 5;
const MAX_FAILS_GLOBAL = 30;

const failuresByIp = new Map(); // ip -> { count, firstAt, lockedUntil }
let globalFailTimes = [];

function now() {
  return Date.now();
}

function lockRemainingMs(ip) {
  const t = now();
  globalFailTimes = globalFailTimes.filter((at) => t - at < WINDOW_MS);
  if (globalFailTimes.length >= MAX_FAILS_GLOBAL) {
    return WINDOW_MS - (t - globalFailTimes[0]);
  }
  const entry = failuresByIp.get(ip);
  if (entry?.lockedUntil && entry.lockedUntil > t) return entry.lockedUntil - t;
  return 0;
}

function recordFailure(ip) {
  const t = now();
  globalFailTimes.push(t);
  let entry = failuresByIp.get(ip);
  if (!entry || t - entry.firstAt > WINDOW_MS) entry = { count: 0, firstAt: t, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= MAX_FAILS_PER_IP) entry.lockedUntil = t + WINDOW_MS;
  failuresByIp.set(ip, entry);
  return Math.max(0, MAX_FAILS_PER_IP - entry.count);
}

// Easy-to-guess PINs the admin isn't allowed to choose.
function isTooSimple(pin) {
  if (/^(\d)\1{5}$/.test(pin)) return true; // 000000, 111111, ...
  const ascending = '01234567890';
  const descending = '09876543210';
  return ascending.includes(pin) || descending.includes(pin); // 123456, 654321, ...
}

async function loadPinRow() {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value, updated_at, updated_by')
    .eq('key', SETTING_KEY)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// GET /api/collector-pin  (admin) — whether a PIN is set and when it last changed.
exports.getPinStatus = async (req, res) => {
  try {
    const row = await loadPinRow();
    res.status(200).json({
      configured: Boolean(row),
      updatedAt: row?.updated_at ?? null,
      updatedBy: row?.updated_by ?? null,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PUT /api/collector-pin  (admin) — set or change the PIN.
exports.setPin = async (req, res) => {
  try {
    const pin = String(req.body?.pin ?? '');
    if (!/^\d{6}$/.test(pin)) {
      return res.status(400).json({ message: 'The PIN must be exactly 6 digits.' });
    }
    if (isTooSimple(pin)) {
      return res.status(400).json({ message: 'That PIN is too easy to guess. Avoid repeated or sequential digits.' });
    }

    const hash = await bcrypt.hash(pin, 10);
    const updatedAt = new Date().toISOString();
    const { error } = await supabase.from('app_settings').upsert({
      key: SETTING_KEY,
      value: hash,
      updated_at: updatedAt,
      updated_by: req.user?.email ?? null,
    });
    if (error) throw error;

    // A new PIN starts everyone with a clean slate.
    failuresByIp.clear();
    globalFailTimes = [];

    res.status(200).json({ success: true, configured: true, updatedAt, updatedBy: req.user?.email ?? null });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/collector-pin/verify  (public, used by the collector app)
// 200 { valid: true, version }   — correct; version changes whenever the PIN does
// 401 { valid: false, attemptsLeft }
// 429 { valid: false, retryAfterSeconds }
// 503 { configured: false }      — no PIN set yet on the admin site
exports.verifyPin = async (req, res) => {
  try {
    const ip = req.ip || 'unknown';
    const lockedMs = lockRemainingMs(ip);
    if (lockedMs > 0) {
      const retryAfterSeconds = Math.ceil(lockedMs / 1000);
      res.set('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({
        valid: false,
        retryAfterSeconds,
        message: `Too many wrong PINs. Try again in ${Math.ceil(retryAfterSeconds / 60)} minute(s).`,
      });
    }

    const row = await loadPinRow();
    if (!row) {
      return res.status(503).json({
        configured: false,
        message: 'No collector PIN has been set yet. Ask an admin to set it in the admin site Settings.',
      });
    }

    const pin = String(req.body?.pin ?? '');
    const valid = /^\d{6}$/.test(pin) && (await bcrypt.compare(pin, row.value));
    if (!valid) {
      const attemptsLeft = recordFailure(ip);
      return res.status(401).json({
        valid: false,
        attemptsLeft,
        message: attemptsLeft > 0 ? `Wrong PIN. ${attemptsLeft} attempt(s) left.` : 'Wrong PIN. Locked for 15 minutes.',
      });
    }

    failuresByIp.delete(ip);
    res.status(200).json({ valid: true, version: row.updated_at });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
