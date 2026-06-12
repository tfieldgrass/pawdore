#!/usr/bin/env node
// Usage: node bin/prescribe.mjs profiles/<name>.json
import { readFileSync } from 'node:fs';
import { buildProfile, prescribe } from '../src/engine.mjs';

const profilePath = process.argv[2];
if (!profilePath) {
  console.error('Usage: node bin/prescribe.mjs profiles/<name>.json');
  process.exit(1);
}

const answers = JSON.parse(readFileSync(profilePath, 'utf8'));
const products = JSON.parse(readFileSync(new URL('../data/products-classified.json', import.meta.url), 'utf8'));

const profile = buildProfile(answers);
const rx = prescribe(products, profile);

const STEP_NAMES = {
  first_cleanse: 'First cleanse',
  second_cleanse: 'Second cleanse',
  toner: 'Toner / lotion',
  mask: 'Mask',
  serum_hydration: 'Hydration serum',
  serum_targeted: 'Targeted serum',
  moisturiser: 'Cream / oil',
};

console.log(`\n— Skin Prescription${profile.name ? ` for ${profile.name}` : ''} —`);
console.log(`skin type: ${profile.skin_type} · sensitivity: ${profile.sensitivity}` +
  ` · target concern: ${rx.target_concern ?? 'n/a'}\n`);
for (const r of rx.regime) {
  console.log(`${STEP_NAMES[r.step].padEnd(16)} ${r.product.title} — ${r.product.vendor}` +
    `  £${r.product.priceMin}  [score ${r.score}]`);
  if (r.alternate) console.log(`${''.padEnd(16)} alt: ${r.alternate.title} — ${r.alternate.vendor}`);
}
console.log(`\nTotal: £${rx.total}`);
if (rx.flags.length) console.log(`Flags: ${rx.flags.join('; ')}`);
