const supabase = require('../lib/supabase');
const { randomUUID } = require('crypto');

function statusCandidates(value) {
  if (typeof value !== 'string') return [];
  const normalized = value.trim().toLowerCase();
  const variants = {
    pending: ['pending', 'Pending', 'PENDING'],
    ongoing: ['ongoing', 'Ongoing', 'ONGOING'],
    resolved: ['resolved', 'Resolved', 'RESOLVED'],
  };
  return variants[normalized] || [];
}

async function tryUpdateStatusByColumns(id, statusValue, columns) {
  const candidates = statusCandidates(statusValue);
  if (candidates.length === 0) {
    return { ok: false, statusCode: 400, message: 'Invalid status value' };
  }

  let lastError = null;

  for (const column of columns) {
    for (const candidate of candidates) {
      const payload = { [column]: candidate };
      const { error } = await supabase
        .from('leak_reports')
        .update(payload)
        .eq('id', id);

      if (!error) {
        return { ok: true, column, value: candidate };
      }

      lastError = error;
      const msg = String(error.message || '').toLowerCase();
      const isConstraint = msg.includes('check constraint');
      const isMissingColumn = msg.includes(`column \"${column}\"`) && msg.includes('does not exist');

      if (isMissingColumn) {
        break;
      }

      if (!isConstraint) {
        return { ok: false, statusCode: 500, message: error.message };
      }
    }
  }

  return { ok: false, statusCode: 500, message: lastError?.message || 'Failed to update status' };
}

function normalizeStatusInput(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'ongoing') return 'ongoing';
  if (normalized === 'resolved') return 'resolved';
  return 'pending';
}

function buildCreatePayload(body, reqUserId) {
  const location = String(body?.location ?? body?.location_text ?? body?.address ?? body?.barangay ?? '').trim();
  const description = String(body?.description ?? body?.details ?? '').trim();
  const reporter = String(body?.reporter ?? body?.reporter_name ?? body?.reported_by ?? '').trim();
  const status = normalizeStatusInput(body?.status ?? body?.report_status);
  const nowIso = new Date().toISOString();

  return {
    ...body,
    user_id: body?.user_id ?? reqUserId ?? null,
    location,
    location_text: location || undefined,
    description,
    details: description || undefined,
    reporter,
    reporter_name: reporter || undefined,
    reported_by: reporter || undefined,
    status,
    submitted_at: body?.submitted_at ?? nowIso,
    ...(body?.reported_at ? { reported_at: body.reported_at } : {}),
    ...(body?.date ? { date: body.date } : {}),
  };
}

async function insertLeakReportWithFallback(initialPayload) {
  const payload = { ...initialPayload };
  let lastError = null;
  const statusAttempts = payload.status ? statusCandidates(payload.status) : [];
  let statusAttemptIndex = 0;

  for (let attempt = 0; attempt < 14; attempt += 1) {
    const { data, error } = await supabase
      .from('leak_reports')
      .insert(payload)
      .select('*')
      .single();

    if (!error) {
      return data;
    }

    lastError = error;
    const message = String(error.message || '');
    const lower = message.toLowerCase();

    const missingColumnMatch =
      message.match(/column\s+"([^"]+)"\s+of relation\s+"leak_reports"\s+does not exist/i) ||
      message.match(/could not find the\s+'([^']+)'\s+column\s+of\s+'leak_reports'/i);

    if (missingColumnMatch?.[1]) {
      delete payload[String(missingColumnMatch[1])];
      continue;
    }

    if (lower.includes('null value in column "id"') && !payload.id) {
      payload.id = randomUUID();
      continue;
    }

    if (lower.includes('null value in column "user_id"') && !payload.user_id) {
      payload.user_id = randomUUID();
      continue;
    }

    if (lower.includes('check constraint') && payload.status) {
      if (statusAttemptIndex < statusAttempts.length) {
        payload.status = statusAttempts[statusAttemptIndex];
        statusAttemptIndex += 1;
        continue;
      }

      const altCandidates = ['pending', 'Pending', 'PENDING', 'ongoing', 'Ongoing', 'ONGOING', 'resolved', 'Resolved', 'RESOLVED'];
      const nextCandidate = altCandidates.find((candidate) => candidate !== payload.status);
      if (nextCandidate) {
        payload.status = nextCandidate;
        continue;
      }
    }

    break;
  }

  throw lastError || new Error('Failed to create leak report');
}

// Get all leak reports
exports.getAllLeakReports = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('leak_reports')
      .select('*');

    if (error) throw error;

    const userIds = Array.from(
      new Set(
        (data || [])
          .map((row) => row.user_id)
          .filter((value) => value !== null && value !== undefined)
      )
    );

    let profilesById = new Map();
    if (userIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .in('id', userIds);

      if (profilesError) throw profilesError;

      profilesById = new Map(
        (profiles || []).map((profile) => [
          String(profile.id),
          `${profile.first_name || ''} ${profile.last_name || ''}`.trim(),
        ])
      );
    }

    const enriched = (data || []).map((row) => ({
      ...row,
      reporter_full_name: row.user_id ? (profilesById.get(String(row.user_id)) || null) : null,
    }));

    res.status(200).json({ success: true, count: enriched.length, data: enriched });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Create leak report
exports.createLeakReport = async (req, res) => {
  try {
    const payload = buildCreatePayload(req.body, req.user?.id);
    const data = await insertLeakReportWithFallback(payload);

    res.status(201).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update leak report
exports.updateLeakReport = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('leak_reports')
      .update(req.body)
      .eq('id', req.params.id)
      .select('*')
      .single();

    if (error || !data) return res.status(404).json({ message: 'Leak report not found' });

    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update leak report status only
exports.updateLeakReportStatus = async (req, res) => {
  try {
    const result = await tryUpdateStatusByColumns(req.params.id, req.body?.status, ['status']);

    if (!result.ok) {
      return res.status(result.statusCode).json({ message: result.message });
    }

    const { data, error } = await supabase
      .from('leak_reports')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !data) {
      return res.status(404).json({ message: 'Leak report not found' });
    }

    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete leak report
exports.deleteLeakReport = async (req, res) => {
  try {
    const { error } = await supabase
      .from('leak_reports')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;

    res.status(200).json({ success: true, message: 'Leak report deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
