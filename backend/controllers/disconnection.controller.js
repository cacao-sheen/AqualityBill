const supabase = require('../lib/supabase');

const DISCONNECTION_GRACE_DAYS = 2;

function normalizePaymentStatus(value) {
  return String(value ?? '').trim().toLowerCase();
}

// Whole calendar days between the due date and now (ignores time-of-day)
function daysPastDue(dueDateValue, now = new Date()) {
  if (!dueDateValue) return null;
  const dueDate = new Date(dueDateValue);
  if (Number.isNaN(dueDate.getTime())) return null;

  const dueDateOnly = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
  const nowDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = nowDateOnly.getTime() - dueDateOnly.getTime();
  return Math.floor(diffMs / (24 * 60 * 60 * 1000));
}

function isEligibleForDisconnection(billingRecord, now = new Date()) {
  const status = normalizePaymentStatus(billingRecord.payment_status);
  if (status !== 'unpaid' && status !== 'overdue') return false;

  const days = daysPastDue(billingRecord.due_date, now);
  return days !== null && days >= DISCONNECTION_GRACE_DAYS;
}

function isMissingTableError(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('does not exist') || message.includes('could not find the table');
}

// Latest disconnect/reconnect action per consumer_id (undefined = never touched, i.e. connected)
async function getLatestConnectionStatuses(consumerIds) {
  const { data, error } = await supabase
    .from('disconnection_records')
    .select('consumer_id, status, created_at')
    .in('consumer_id', consumerIds)
    .order('created_at', { ascending: false });

  if (error) {
    if (isMissingTableError(error)) return new Map();
    throw error;
  }

  const latestByConsumer = new Map();
  for (const record of data || []) {
    if (!latestByConsumer.has(record.consumer_id)) {
      latestByConsumer.set(record.consumer_id, record.status);
    }
  }
  return latestByConsumer;
}

// Get consumers eligible for water disconnection: unpaid/overdue bills whose
// due date is more than DISCONNECTION_GRACE_DAYS days in the past.
exports.getDisconnectionCandidates = async (req, res) => {
  try {
    const { data: bills, error: billsError } = await supabase
      .from('billing_records')
      .select('id, consumer_id, due_date, total_amount, payment_status');

    if (billsError) throw billsError;

    const now = new Date();
    const overdueByConsumer = new Map();

    for (const bill of bills || []) {
      if (!bill.consumer_id || !isEligibleForDisconnection(bill, now)) continue;

      const days = daysPastDue(bill.due_date, now);
      const existing = overdueByConsumer.get(bill.consumer_id);

      const oldestDueDate =
        !existing || new Date(bill.due_date) < new Date(existing.oldest_due_date)
          ? bill.due_date
          : existing.oldest_due_date;

      overdueByConsumer.set(bill.consumer_id, {
        consumer_id: bill.consumer_id,
        total_due: (existing?.total_due || 0) + Number(bill.total_amount || 0),
        unpaid_bill_count: (existing?.unpaid_bill_count || 0) + 1,
        oldest_due_date: oldestDueDate,
        days_overdue: Math.max(existing?.days_overdue || 0, days),
      });
    }

    const consumerIds = Array.from(overdueByConsumer.keys());
    if (consumerIds.length === 0) {
      return res.status(200).json({ success: true, count: 0, data: [] });
    }

    const [{ data: profiles, error: profilesError }, latestStatuses] = await Promise.all([
      supabase.from('profiles').select('*').in('id', consumerIds),
      getLatestConnectionStatuses(consumerIds),
    ]);

    if (profilesError) throw profilesError;

    const profileById = new Map((profiles || []).map((p) => [String(p.id), p]));

    const data = consumerIds
      .map((id) => {
        const summary = overdueByConsumer.get(id);
        const profile = profileById.get(String(id)) || {};
        const firstName = String(profile.first_name ?? '').trim();
        const lastName = String(profile.last_name ?? '').trim();
        const name =
          firstName && lastName
            ? `${lastName}, ${firstName}`
            : lastName || firstName || profile.name || '—';

        return {
          consumer_id: id,
          name,
          address: profile.address ?? profile.location ?? profile.barangay ?? null,
          mobile: profile.mobile ?? profile.phone ?? profile.phone_number ?? profile.contact_number ?? null,
          connection_status: latestStatuses.get(id) === 'disconnected' ? 'disconnected' : 'connected',
          total_due: summary.total_due,
          unpaid_bill_count: summary.unpaid_bill_count,
          oldest_due_date: summary.oldest_due_date,
          days_overdue: summary.days_overdue,
        };
      })
      .sort((a, b) => b.days_overdue - a.days_overdue);

    res.status(200).json({ success: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Record a disconnect / reconnect action for a consumer (append-only audit trail)
exports.updateConnectionStatus = async (req, res) => {
  try {
    const status = String(req.body?.status || '').trim().toLowerCase();
    if (status !== 'connected' && status !== 'disconnected') {
      return res.status(400).json({ message: 'Invalid connection status value' });
    }

    const { data, error } = await supabase
      .from('disconnection_records')
      .insert({
        consumer_id: req.params.id,
        status,
        performed_by: req.user?.email || req.user?.id || null,
      })
      .select('id, consumer_id, status, created_at')
      .single();

    if (error) {
      if (isMissingTableError(error)) {
        return res.status(500).json({
          message:
            "The 'disconnection_records' table does not exist yet. Run the SQL migration in Supabase to enable disconnect/reconnect actions.",
        });
      }
      throw error;
    }

    res.status(200).json({
      success: true,
      data: { consumer_id: data.consumer_id, connection_status: data.status },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
