const supabase = require('../lib/supabase');
const { randomUUID } = require('crypto');

function splitName(name) {
  const raw = String(name || '').trim();
  if (!raw) return { first_name: '', last_name: '' };

  if (raw.includes(',')) {
    const [lastNamePart, firstNamePart] = raw.split(',');
    return {
      first_name: String(firstNamePart || '').trim(),
      last_name: String(lastNamePart || '').trim(),
    };
  }

  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { first_name: parts[0], last_name: '' };
  return {
    first_name: parts.slice(0, -1).join(' '),
    last_name: parts[parts.length - 1],
  };
}

function normalizeCreatePayload(body) {
  const payload = { ...(body || {}) };

  if ((!payload.first_name && !payload.last_name) && payload.name) {
    const split = splitName(payload.name);
    payload.first_name = split.first_name;
    payload.last_name = split.last_name;
  }

  if (payload.contact && !payload.email && !payload.mobile && !payload.phone) {
    if (String(payload.contact).includes('@')) {
      payload.email = String(payload.contact).trim();
    } else {
      payload.mobile = String(payload.contact).trim();
      payload.phone = String(payload.contact).trim();
    }
  }

  if (payload.mobile && !payload.phone) payload.phone = payload.mobile;
  if (payload.phone && !payload.mobile) payload.mobile = payload.phone;

  return payload;
}

async function insertProfileWithFallback(rawPayload) {
  const payload = normalizeCreatePayload(rawPayload);
  let lastError = null;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data, error } = await supabase
      .from('profiles')
      .insert(payload)
      .select('*')
      .single();

    if (!error) {
      return data;
    }

    lastError = error;
    const message = String(error.message || '');
    const lower = message.toLowerCase();

    const missingColumn = message.match(/column\s+"([^"]+)"\s+of relation\s+"profiles"\s+does not exist/i);
    if (missingColumn?.[1]) {
      delete payload[missingColumn[1]];
      continue;
    }

    if (lower.includes('null value in column "id"') && !payload.id) {
      payload.id = randomUUID();
      continue;
    }

    break;
  }

  throw lastError || new Error('Failed to create consumer profile');
}

// Get all users
exports.getAllUsers = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*');

    if (error) throw error;

    res.status(200).json({ success: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get single user
exports.getUser = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !data) return res.status(404).json({ message: 'User not found' });

    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Create user
exports.createUser = async (req, res) => {
  try {
    const data = await insertProfileWithFallback(req.body);

    res.status(201).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update user
exports.updateUser = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .update(req.body)
      .eq('id', req.params.id)
      .select('*')
      .single();

    if (error || !data) return res.status(404).json({ message: 'User not found' });

    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete user
exports.deleteUser = async (req, res) => {
  try {
    const { error } = await supabase.from('profiles').delete().eq('id', req.params.id);
    if (error) throw error;
    res.status(200).json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
