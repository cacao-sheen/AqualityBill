const supabase = require('../lib/supabase');

function displayName(profile) {
  const first = String(profile?.first_name ?? '').trim();
  const last = String(profile?.last_name ?? '').trim();
  if (last) return first ? `${last}, ${first}` : last;
  return first || null;
}

// Attaches the matching profiles row (by meter_no) to each claim request so
// the admin can compare what the consumer submitted against what's on file.
// Selects '*' (not a fixed column list) since the exact contact-field names
// on `profiles` (mobile vs. phone, etc.) vary — see normalizeCreatePayload
// in user.controller.js for the same defensiveness.
async function attachMatchedProfiles(requests) {
  const meterNos = Array.from(new Set(requests.map((r) => r.meter_no).filter(Boolean)));
  if (meterNos.length === 0) return requests.map((r) => ({ ...r, matched_profile: null }));

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('*')
    .in('meter_no', meterNos);

  if (error) throw error;

  const profileByMeterNo = new Map((profiles || []).map((p) => [p.meter_no, p]));

  return requests.map((request) => {
    const profile = profileByMeterNo.get(request.meter_no) || null;
    return {
      ...request,
      matched_profile: profile
        ? {
            id: profile.id,
            name: displayName(profile),
            meter_no: profile.meter_no,
            already_linked: Boolean(profile.auth_user_id),
            email: profile.email ?? null,
            mobile: profile.mobile ?? profile.phone ?? null,
          }
        : null,
    };
  });
}

// Get all account claim requests, newest first, with the matching profile (if any) attached
exports.getAllClaimRequests = async (req, res) => {
  try {
    let query = supabase
      .from('account_claim_requests')
      .select('*')
      .order('created_at', { ascending: false });

    const status = String(req.query?.status || '').trim().toLowerCase();
    if (['pending', 'approved', 'rejected'].includes(status)) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) throw error;

    const withProfiles = await attachMatchedProfiles(data || []);

    res.status(200).json({ success: true, count: withProfiles.length, data: withProfiles });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Approve a claim: bind the Supabase Auth account to the matching profile
// (by meter_no), backfilling any contact fields the profile is missing.
exports.approveClaimRequest = async (req, res) => {
  try {
    const { data: claim, error: claimError } = await supabase
      .from('account_claim_requests')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (claimError || !claim) {
      return res.status(404).json({ message: 'Account claim request not found' });
    }

    if (claim.status !== 'pending') {
      return res.status(400).json({ message: `This request was already ${claim.status}.` });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('meter_no', claim.meter_no)
      .maybeSingle();

    if (profileError) throw profileError;

    if (!profile) {
      return res.status(404).json({
        message: `No consumer profile found with meter number "${claim.meter_no}". Add that meter number to a profile before approving.`,
      });
    }

    if (profile.auth_user_id && profile.auth_user_id !== claim.auth_user_id) {
      return res.status(409).json({ message: 'This meter number is already linked to a different account.' });
    }

    // Only backfill a contact field the profile actually has as a column
    // (checked via `in`, since `select('*')` still returns null-valued keys
    // for real columns) and that is currently blank.
    const profileUpdates = { auth_user_id: claim.auth_user_id };
    if ('email' in profile && !profile.email && claim.email) profileUpdates.email = claim.email;
    if ('mobile' in profile && !profile.mobile && claim.phone) profileUpdates.mobile = claim.phone;
    if ('phone' in profile && !profile.phone && claim.phone) profileUpdates.phone = claim.phone;
    if ('address' in profile && !profile.address && claim.address) profileUpdates.address = claim.address;
    if ('gender' in profile && !profile.gender && claim.gender) profileUpdates.gender = claim.gender;
    if ('birth_date' in profile && !profile.birth_date && claim.birth_date) profileUpdates.birth_date = claim.birth_date;

    const { error: updateProfileError } = await supabase
      .from('profiles')
      .update(profileUpdates)
      .eq('id', profile.id);

    if (updateProfileError) throw updateProfileError;

    const { data: updatedClaim, error: updateClaimError } = await supabase
      .from('account_claim_requests')
      .update({
        status: 'approved',
        reviewed_by: req.user?.email || req.user?.id || null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', claim.id)
      .select('*')
      .single();

    if (updateClaimError) throw updateClaimError;

    res.status(200).json({ success: true, data: updatedClaim });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Reject a claim (e.g. meter number doesn't match the submitted name)
exports.rejectClaimRequest = async (req, res) => {
  try {
    const { data: claim, error: claimError } = await supabase
      .from('account_claim_requests')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (claimError || !claim) {
      return res.status(404).json({ message: 'Account claim request not found' });
    }

    if (claim.status !== 'pending') {
      return res.status(400).json({ message: `This request was already ${claim.status}.` });
    }

    const note = String(req.body?.note ?? req.body?.admin_note ?? '').trim();

    const { data: updatedClaim, error: updateError } = await supabase
      .from('account_claim_requests')
      .update({
        status: 'rejected',
        admin_note: note || null,
        reviewed_by: req.user?.email || req.user?.id || null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', claim.id)
      .select('*')
      .single();

    if (updateError) throw updateError;

    res.status(200).json({ success: true, data: updatedClaim });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
