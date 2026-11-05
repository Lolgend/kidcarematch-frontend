/**
 * Family preference profile helpers, validation, and schema conversion.
 */

export const nextMonthValue = (referenceDate = new Date()) => {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const nextDate = new Date(year, month + 1, 1);
  return `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
};

export const PROFILE_DEFAULTS = {
  level: 'n1',
  citizenship: 'SC',
  service: 'Full Day',
  enrolMonth: '',
  home: '',
  work: '',
  locationPref: 'HOME',
  income: '',
  members: '',
  budget: 750,
  weights: { vacancy: 50, cost: 35, travel: 15 },
};

export const WEIGHT_KEYS = ['vacancy', 'cost', 'travel'];
export const WEIGHT_LABELS = { vacancy: 'Vacancy fit', cost: 'Cost fit', travel: 'Travel fit' };
export const RANK_WEIGHTS = [50, 35, 15];

// Most important first. Ties keep default order.
export function priorityOrder(weights) {
  return [...WEIGHT_KEYS].sort(
    (a, b) => (Number(weights?.[b]) || 0) - (Number(weights?.[a]) || 0) || WEIGHT_KEYS.indexOf(a) - WEIGHT_KEYS.indexOf(b)
  );
}

export function weightsFromOrder(order) {
  return Object.fromEntries(WEIGHT_KEYS.map((key) => [key, RANK_WEIGHTS[order.indexOf(key)]]));
}

// Snap any weights to the standard ranking.
export const normalizeWeights = (weights) => weightsFromOrder(priorityOrder(weights));

// Give `key` the chosen rank (0-based); factor that held that rank takes its old one.
export function setRank(weights, key, rank) {
  const order = priorityOrder(weights);
  const from = order.indexOf(key);
  [order[from], order[rank]] = [order[rank], order[from]];
  return weightsFromOrder(order);
}

// Recover weights ranking from 2-factor cost share.
export function weightsFromCostShare(share) {
  const target = Number.isFinite(share) ? share : 0.7;
  const [a, b, c] = WEIGHT_KEYS;
  const orders = [[a, b, c], [a, c, b], [b, a, c], [b, c, a], [c, a, b], [c, b, a]];
  let best = weightsFromOrder(orders[0]);
  let bestDiff = Infinity;
  orders.forEach((order) => {
    const w = weightsFromOrder(order);
    const diff = Math.abs(w.cost / (w.cost + w.travel) - target);
    if (diff < bestDiff - 1e-9) { best = w; bestDiff = diff; }
  });
  return best;
}

/**
 * Validates a family profile form object.
 * Returns an array of error messages, or an empty array if valid.
 */
export function validateFamilyProfile(form) {
  const errors = [];
  if (!form || typeof form !== 'object') {
    return ['Form data is missing.'];
  }

  // 6-digit home postal code
  const home = String(form.home || '').trim();
  if (!/^\d{6}$/.test(home)) {
    errors.push('Enter your 6-digit home postal code.');
  }

  // Required selection: child level
  if (!form.level || !String(form.level).trim()) {
    errors.push('Select a child level.');
  }

  // Required selection: citizenship status
  if (!form.citizenship || !String(form.citizenship).trim()) {
    errors.push('Select citizenship status.');
  }

  // Required selection: care service
  if (!form.service || !String(form.service).trim()) {
    errors.push('Select care service required.');
  }

  // Required: enrolment month in YYYY-MM format
  const enrolMonth = String(form.enrolMonth || '').trim();
  if (!/^\d{4}-\d{2}$/.test(enrolMonth)) {
    errors.push('Enter enrolment month in YYYY-MM format.');
  }

  // Required: monthly budget > 0
  const budgetNum = Number(form.budget);
  if (!Number.isFinite(budgetNum) || budgetNum <= 0) {
    errors.push('Enter a monthly budget.');
  }

  // Workplace postal code: optional unless locationPref is WORKPLACE or EITHER
  const locationPref = form.locationPref || 'HOME';
  const workPostal = form.work ? String(form.work).trim() : '';

  if (['WORKPLACE', 'EITHER'].includes(locationPref) && !workPostal) {
    errors.push('Add your workplace postal code for this location preference.');
  } else if (workPostal && !/^\d{6}$/.test(workPostal)) {
    errors.push('Workplace postal code must be 6 digits.');
  }

  return errors;
}

export function isProfileComplete(form) {
  return validateFamilyProfile(form).length === 0;
}

export function toApiProfile(form, profileName) {
  const resolvedProfileName =
    profileName || form?.profile_name || form?.profileName || 'My family profile';
  const weights = normalizeWeights(form?.weights || PROFILE_DEFAULTS.weights);

  return {
    profile_name: resolvedProfileName,
    level: form.level,
    citizenship_status: form.citizenship,
    service_required: form.service || 'Full Day',
    home_postal_code: form.home,
    workplace_postal_code: form.work || null,
    location_preference: form.locationPref || 'HOME',
    household_income: Number(form.income) || 0,
    household_member_count: Math.max(1, Number(form.members) || 1),
    budget_max: Number(form.budget),
    enrollment_month_year: form.enrolMonth || nextMonthValue(),
    vacancy_weight: Math.round(weights.vacancy) / 100,
    cost_weight: Math.round(weights.cost) / 100,
    travel_weight: Math.round(weights.travel) / 100,
  };
}

export function fromApiProfile(api, local) {
  let resolvedWeights = PROFILE_DEFAULTS.weights;
  if (local?.weights) {
    resolvedWeights = normalizeWeights(local.weights);
  } else if (api?.vacancy_weight != null && (api?.cost_weight != null || api?.travel_weight != null)) {
    resolvedWeights = normalizeWeights({
      vacancy: Math.round(Number(api.vacancy_weight) * 100),
      cost: Math.round(Number(api.cost_weight) * 100),
      travel: Math.round(Number(api.travel_weight) * 100),
    });
  } else if (api?.cost_weight != null) {
    resolvedWeights = weightsFromCostShare(Number(api.cost_weight));
  }

  return {
    ...PROFILE_DEFAULTS,
    profile_id: api?.profile_id ?? api?.id ?? null,
    profile_name: api?.profile_name ?? api?.name ?? 'My family profile',
    profileId: api?.profile_id ?? api?.id ?? null,
    profileName: api?.profile_name ?? api?.name ?? 'My family profile',
    level: api?.level ?? PROFILE_DEFAULTS.level,
    citizenship: api?.citizenship_status ?? PROFILE_DEFAULTS.citizenship,
    service: api?.service_required ?? PROFILE_DEFAULTS.service,
    home: api?.home_postal_code ?? '',
    work: api?.workplace_postal_code || '',
    locationPref: api?.location_preference ?? PROFILE_DEFAULTS.locationPref,
    income: api?.household_income ? String(api.household_income) : '',
    members: api?.household_member_count ? String(api.household_member_count) : '',
    budget: api?.budget_max != null ? Number(api.budget_max) : PROFILE_DEFAULTS.budget,
    enrolMonth: api?.enrollment_month_year || '',
    weights: resolvedWeights,
  };
}
