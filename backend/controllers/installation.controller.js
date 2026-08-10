const supabase = require('../lib/supabase');
const { randomUUID } = require('crypto');

function buildCreatePayload(body) {
  const profileId = String(body?.profile_id ?? body?.profileId ?? '').trim();
  const requesterName = String(body?.requester_name ?? body?.requesterName ?? body?.full_name ?? body?.fullName ?? body?.name ?? '').trim();
  const contact = String(body?.contact ?? body?.contact_number ?? body?.contactNumber ?? body?.phone ?? body?.mobile ?? '').trim();
  const address = String(body?.address ?? body?.installation_address ?? '').trim();
  const email = String(body?.email ?? '').trim();
  const note = String(body?.note ?? body?.notes ?? '').trim();

  return {
    ...(profileId ? { profile_id: profileId } : {}),
    ...(requesterName ? { requester_name: requesterName } : {}),
    contact: contact || undefined,
    address: address || undefined,
    email: email || undefined,
    note: note || undefined,
    ...(body?.status ? { status: body.status } : {}),
  };
}

async function insertInstallationWithFallback(initialPayload) {
  const payload = { ...initialPayload };
  let lastError = null;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const { data, error } = await supabase
      .from('installation_requests')
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
      message.match(/column\s+"([^"]+)"\s+of relation\s+"installation_requests"\s+does not exist/i) ||
      message.match(/could not find the\s+'([^']+)'\s+column\s+of\s+'installation_requests'/i);

    if (missingColumnMatch?.[1]) {
      delete payload[String(missingColumnMatch[1])];
      continue;
    }

    if (lower.includes('null value in column "id"') && !payload.id) {
      payload.id = randomUUID();
      continue;
    }

    if (lower.includes('null value in column "user_id"')) {
      throw new Error('installation_requests.user_id is required. Make it nullable to accept admin-created requests without a consumer profile.');
    }

    break;
  }

  throw lastError || new Error('Failed to create installation request');
}

function normalizeStatusInput(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'ongoing') return 'ongoing';
  if (normalized === 'done' || normalized === 'resolved') return 'done';
  return 'pending';
}

async function tryUpdateStatusByColumns(id, statusValue, columns) {
  const status = normalizeStatusInput(statusValue);
  let lastError = null;

  for (const column of columns) {
    const { error } = await supabase
      .from('installation_requests')
      .update({ [column]: status })
      .eq('id', id);

    if (!error) {
      return { ok: true, column, value: status };
    }

    lastError = error;
    const msg = String(error.message || '').toLowerCase();
    const isMissingColumn = msg.includes(`column \"${column}\"`) && msg.includes('does not exist');
    if (isMissingColumn) {
      continue;
    }
  }

  return { ok: false, statusCode: 500, message: lastError?.message || 'Failed to update status' };
}

// Get all installation requests
exports.getAllInstallations = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('installation_requests_view')
      .select('*');

    if (error) throw error;

    res.status(200).json({ success: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Create installation request
exports.createInstallation = async (req, res) => {
  try {
    const payload = buildCreatePayload(req.body);
    const data = await insertInstallationWithFallback(payload);

    res.status(201).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update installation request status only
exports.updateInstallationStatus = async (req, res) => {
  try {
    const result = await tryUpdateStatusByColumns(req.params.id, req.body?.status, ['status']);

    if (!result.ok) {
      return res.status(result.statusCode).json({ message: result.message });
    }

    const { data, error } = await supabase
      .from('installation_requests')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !data) {
      return res.status(404).json({ message: 'Installation request not found' });
    }

    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete installation request
exports.deleteInstallation = async (req, res) => {
  try {
    const { error } = await supabase
      .from('installation_requests')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;

    res.status(200).json({ success: true, message: 'Installation request deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
