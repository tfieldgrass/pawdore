// Prescription engine — see docs/engine.md for the design this implements.

export const CORE_STEPS = [
  'first_cleanse',
  'second_cleanse',
  'toner',
  'mask',
  'serum_hydration',
  'serum_targeted',
  'moisturiser',
];

const STRENGTH_RANK = { none: 0, gentle: 1, moderate: 2, strong: 3 };
const TOLERANCE_CEILING = { reactive: 1, none: 1, moderate: 2, high: 3 };

export function buildProfile(answers) {
  const concerns = {};
  for (const c of answers.concerns_selected ?? []) concerns[c] = 0.5;
  (answers.concerns_ranked ?? []).forEach((c, i) => {
    concerns[c] = 3 - i; // rank 1 → 3, rank 2 → 2, rank 3 → 1
  });

  // Derived signals
  if (answers.end_of_day === 'tight') concerns.dehydration = (concerns.dehydration ?? 0) + 1;
  if (['45-54', '55+'].includes(answers.age)) {
    concerns.firmness = Math.max(concerns.firmness ?? 0, 0.5);
    concerns.fine_lines = Math.max(concerns.fine_lines ?? 0, 0.5);
  }

  return {
    name: answers.name ?? null,
    skin_type: answers.skin_type,
    sensitivity: answers.sensitivity ?? 'low',
    concerns,
    acid_tolerance: answers.acid_tolerance ?? 'none',
    retinoid_tolerance: answers.retinoid_tolerance ?? 'none',
    pregnant: answers.pregnant === true,
    avoid: answers.avoid ?? [],
    texture_pref: answers.texture_pref ?? 'none',
    brand_affinity: answers.brand_affinity ?? [],
    age: answers.age ?? null,
    environment: answers.environment ?? null,
    lifestyle: answers.lifestyle ?? [],
    presentation: answers.presentation ?? 'complete',
    free_text_allergy: answers.free_text_allergy ?? null,
  };
}

export function hardFilter(product, profile) {
  if (!product.include) return 'not quiz-eligible';
  if (profile.pregnant && product.pregnancy_safe !== true) return 'pregnancy';
  if (profile.sensitivity === 'high') {
    if (product.sensitive_safe === 'no') return 'sensitivity';
    if (product.actives_strength === 'strong') return 'sensitivity: strong actives';
  }
  if (STRENGTH_RANK[product.actives_strength] > TOLERANCE_CEILING[profile.acid_tolerance]
      && product.actives_family === 'acid') return 'acid tolerance';
  if (STRENGTH_RANK[product.actives_strength] > TOLERANCE_CEILING[profile.retinoid_tolerance]
      && product.actives_family === 'retinoid') return 'retinoid tolerance';
  for (const a of profile.avoid) {
    if ((product.contains ?? []).includes(a)) return `avoids ${a}`;
  }
  if (product.skin_types?.length && !product.skin_types.includes(profile.skin_type)) {
    return 'skin type';
  }
  return null;
}

export function score(product, profile) {
  let s = 0;
  const universal = !product.skin_types || product.skin_types.length === 0
    || product.skin_types.length === 4;
  s += universal ? 24 : (product.skin_types.includes(profile.skin_type) ? 30 : 0);

  for (const [concern, weight] of Object.entries(profile.concerns)) {
    const strength = product.concerns?.[concern] ?? 0;
    s += 12 * strength * weight;
  }

  if (profile.texture_pref === 'rich' && ['cream', 'balm', 'oil'].includes(product.texture)) s += 6;
  if (profile.texture_pref === 'light' && ['gel', 'liquid', 'lotion'].includes(product.texture)) s += 6;
  if (profile.brand_affinity.includes(product.vendor)) s += 5;
  if (profile.sensitivity === 'moderate' && product.sensitive_safe === 'yes') s += 4;
  if (product.bestseller) s += 3;
  return s;
}

function rankFor(step, products, profile, opts = {}) {
  const eligible = products
    .filter((p) => p.step === step)
    .filter((p) => !hardFilter(p, profile))
    .filter((p) => !opts.exclude || !opts.exclude(p));

  return eligible
    .map((p) => ({ product: p, score: score(p, profile) + (opts.boost ? opts.boost(p) : 0) }))
    .sort((a, b) => b.score - a.score);
}

export function prescribe(products, profile) {
  const regime = [];
  const flags = [];
  const pick = (step, ranked) => {
    if (!ranked.length) {
      flags.push(`no eligible product for ${step}`);
      return;
    }
    regime.push({
      step,
      product: ranked[0].product,
      alternate: ranked[1]?.product ?? null,
      score: Math.round(ranked[0].score * 10) / 10,
    });
  };

  pick('first_cleanse', rankFor('first_cleanse', products, profile));
  pick('second_cleanse', rankFor('second_cleanse', products, profile));

  // Toner: actives anchor. Prefer the strongest tolerated within the ceiling.
  const ceiling = profile.sensitivity === 'high'
    ? Math.min(TOLERANCE_CEILING[profile.acid_tolerance], 2)
    : TOLERANCE_CEILING[profile.acid_tolerance];
  const tonerRanked = rankFor('toner', products, profile, {
    boost: (p) => Math.min(STRENGTH_RANK[p.actives_strength], ceiling) * 4,
    exclude: (p) => STRENGTH_RANK[p.actives_strength] > ceiling,
  });
  pick('toner', tonerRanked);
  const tonerStrength = regime.find((r) => r.step === 'toner')?.product.actives_strength ?? 'none';

  pick('mask', rankFor('mask', products, profile));

  // Hydration serum: scored on dehydration regardless of ranked concerns.
  const hydrationProfile = {
    ...profile,
    concerns: { ...profile.concerns, dehydration: Math.max(profile.concerns.dehydration ?? 0, 2) },
  };
  pick('serum_hydration', rankFor('serum_hydration', products, hydrationProfile));

  // Targeted serum: prescribed against the top non-dehydration concern,
  // respecting total actives load.
  const ranked = Object.entries(profile.concerns).sort((a, b) => b[1] - a[1]);
  const target = ranked.find(([c]) => c !== 'dehydration')?.[0] ?? ranked[0]?.[0];
  const targetProfile = target
    ? { ...profile, concerns: { [target]: 3, ...profile.concerns } }
    : profile;
  pick('serum_targeted', rankFor('serum_targeted', products, targetProfile, {
    exclude: (p) => tonerStrength === 'strong'
      && p.actives_strength === 'strong'
      && profile.acid_tolerance !== 'high',
  }));

  // Moisturiser slot: creams and oils compete.
  pick('moisturiser', rankFor('moisturiser', products, profile, {
    boost: (p) => {
      if (p.texture !== 'oil') return 0;
      if (profile.skin_type === 'oily') return -20;
      if (profile.skin_type === 'dry' && profile.texture_pref === 'rich') return 8;
      return -4;
    },
  }));

  if (profile.free_text_allergy) flags.push('free-text allergy — offer expert review');

  const total = regime.reduce((t, r) => t + Number(r.product.priceMin ?? 0), 0);
  return { profile, regime, total: Math.round(total * 100) / 100, flags, target_concern: target ?? null };
}
