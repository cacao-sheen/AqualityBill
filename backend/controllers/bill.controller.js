const supabase = require('../lib/supabase');

function paymentStatusCandidates(status) {
  if (typeof status !== 'string') return [];
  const key = status.trim().toLowerCase();
  const variants = {
    paid: ['paid', 'Paid', 'PAID'],
    unpaid: ['unpaid', 'Unpaid', 'UNPAID'],
    overdue: ['overdue', 'Overdue', 'OVERDUE'],
  };
  return variants[key] || [];
}

function normalizePaymentStatus(value) {
  return String(value ?? '').trim().toLowerCase();
}

function isPastDueByMonth(dueDateValue, now = new Date()) {
  if (!dueDateValue) return false;
  const dueDate = new Date(dueDateValue);
  if (Number.isNaN(dueDate.getTime())) return false;

  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  return dueDate < currentMonthStart;
}

async function syncOverdueBillingRecords() {
  const { data, error } = await supabase
    .from('billing_records')
    .select('id, due_date, payment_status');

  if (error) throw error;

  const overdueTargets = (data || [])
    .filter((record) => normalizePaymentStatus(record.payment_status) === 'unpaid')
    .filter((record) => isPastDueByMonth(record.due_date));

  for (const record of overdueTargets) {
    await updateStatusWithCompatibleValue(record.id, 'overdue');
  }
}

async function updateStatusWithCompatibleValue(id, statusInput) {
  const candidates = paymentStatusCandidates(statusInput);
  if (candidates.length === 0) {
    return { ok: false, statusCode: 400, message: 'Invalid payment_status value' };
  }

  let lastError = null;
  for (const candidate of candidates) {
    const { error } = await supabase
      .from('billing_records')
      .update({ payment_status: candidate })
      .eq('id', id);

    if (!error) {
      return { ok: true, value: candidate };
    }

    lastError = error;
    const message = String(error.message || '').toLowerCase();
    if (!message.includes('check constraint')) {
      break;
    }
  }

  return { ok: false, statusCode: 500, message: lastError?.message || 'Failed to update payment status' };
}

// Get all billing records
exports.getAllBills = async (req, res) => {
  try {
    await syncOverdueBillingRecords();

    const { data, error } = await supabase
      .from('billing_records')
      .select('id, consumer_id, period_start, period_end, previous_reading, current_reading, consumption, base_charge, rate_per_cbm, total_amount, due_date, billing_date, payment_status, profiles(first_name, last_name, address, meter_no)')
      .order('due_date', { ascending: false });

    if (error) throw error;

    res.status(200).json({ success: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get single billing record
exports.getBill = async (req, res) => {
  try {
    await syncOverdueBillingRecords();

    const { data, error } = await supabase
      .from('billing_records')
      .select('id, consumer_id, period_start, period_end, previous_reading, current_reading, consumption, base_charge, rate_per_cbm, total_amount, due_date, billing_date, payment_status, profiles(first_name, last_name, address, meter_no)')
      .eq('id', req.params.id)
      .single();

    if (error || !data) return res.status(404).json({ message: 'Billing record not found' });

    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Create billing record
exports.createBill = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('billing_records')
      .insert(req.body)
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update billing record
exports.updateBill = async (req, res) => {
  try {
    const payload = { ...req.body };
    if (payload.payment_status !== undefined) {
      const statusResult = await updateStatusWithCompatibleValue(req.params.id, payload.payment_status);
      if (!statusResult.ok) {
        return res.status(statusResult.statusCode).json({ message: statusResult.message });
      }
      delete payload.payment_status;
    }

    let error = null;
    if (Object.keys(payload).length > 0) {
      const updateResult = await supabase
        .from('billing_records')
        .update(payload)
        .eq('id', req.params.id);
      error = updateResult.error;
    }

    if (error) return res.status(500).json({ message: error.message });

    // Fetch the updated record to return it
    const { data, error: fetchError } = await supabase
      .from('billing_records')
      .select('id, consumer_id, period_start, period_end, previous_reading, current_reading, consumption, base_charge, rate_per_cbm, total_amount, due_date, billing_date, payment_status, profiles(first_name, last_name, address, meter_no)')
      .eq('id', req.params.id)
      .single();

    if (fetchError || !data) return res.status(404).json({ message: 'Billing record not found' });

    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update payment status only
exports.updatePaymentStatus = async (req, res) => {
  try {
    const statusResult = await updateStatusWithCompatibleValue(req.params.id, req.body?.payment_status);

    if (!statusResult.ok) {
      console.error('Supabase updatePaymentStatus error:', statusResult.message);
      return res.status(statusResult.statusCode).json({ message: statusResult.message });
    }

    // Fetch the updated row so the client can reflect the persisted value
    const { data, error: fetchError } = await supabase
      .from('billing_records')
      .select('id, payment_status')
      .eq('id', req.params.id)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return res.status(404).json({ message: 'Billing record not found' });
      }
      console.error('Supabase fetch after updatePaymentStatus error:', fetchError.message);
      return res.status(500).json({ message: fetchError.message });
    }

    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('updatePaymentStatus handler error:', error);
    res.status(500).json({ message: error.message || 'Unexpected error' });
  }
};

// Delete billing record
exports.deleteBill = async (req, res) => {
  try {
    const { error } = await supabase.from('billing_records').delete().eq('id', req.params.id);
    if (error) throw error;
    res.status(200).json({ success: true, message: 'Billing record deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Mark billing record as paid
exports.markAsPaid = async (req, res) => {
  try {
    const statusResult = await updateStatusWithCompatibleValue(req.params.id, 'paid');

    if (!statusResult.ok) {
      return res.status(statusResult.statusCode).json({ message: statusResult.message });
    }

    const { data, error } = await supabase
      .from('billing_records')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !data) return res.status(404).json({ message: 'Billing record not found' });

    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
