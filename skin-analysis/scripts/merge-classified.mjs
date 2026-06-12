#!/usr/bin/env node
// Merge data/classified/*.json → data/products-classified.json
// and emit data/review-needed.md for everything low-confidence.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const dir = new URL('../data/classified/', import.meta.url);
const out = new URL('../data/products-classified.json', import.meta.url);
const review = new URL('../data/review-needed.md', import.meta.url);

const VALID_STEPS = new Set(['first_cleanse', 'second_cleanse', 'toner', 'mask',
  'serum_hydration', 'serum_targeted', 'moisturiser', 'face_oil']);
const VALID_CONCERNS = new Set(['breakouts', 'congestion', 'redness', 'pigmentation',
  'fine_lines', 'firmness', 'dullness', 'dehydration', 'sensitivity', 'pores',
  'texture', 'eye_area']);

const all = [];
const problems = [];
for (const f of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
  const items = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
  for (const p of items) {
    if (p.include && !VALID_STEPS.has(p.step)) problems.push(`${f}: ${p.handle} bad step "${p.step}"`);
    for (const c of Object.keys(p.concerns ?? {})) {
      if (!VALID_CONCERNS.has(c)) problems.push(`${f}: ${p.handle} bad concern "${c}"`);
    }
    if (p.step === 'face_oil') { p.step = 'moisturiser'; p.texture = 'oil'; }
    all.push(p);
  }
}

const seen = new Set();
const deduped = all.filter((p) => !seen.has(p.handle) && seen.add(p.handle));
deduped.sort((a, b) => a.step?.localeCompare(b.step ?? '') || a.handle.localeCompare(b.handle));
writeFileSync(out, JSON.stringify(deduped, null, 2));

const low = deduped.filter((p) => p.include && p.confidence === 'low');
writeFileSync(review, `# Needs review by the EoB team\n\n${low.length} products were classified with low confidence (sparse tags/description — inferred from brand knowledge). Please confirm step, skin types, concerns and pregnancy safety.\n\n${low.map((p) => `- **${p.title}** (${p.vendor}) — \`${p.handle}\` → ${p.step}; ${JSON.stringify(p.concerns)}; ${p.rationale}`).join('\n')}\n`);

console.log(`merged ${deduped.length} products (${all.length - deduped.length} dupes removed)`);
console.log(`include:true ${deduped.filter((p) => p.include).length}, low confidence ${low.length}`);
const stepCounts = {};
for (const p of deduped.filter((x) => x.include)) stepCounts[p.step] = (stepCounts[p.step] ?? 0) + 1;
console.log('per step:', stepCounts);
if (problems.length) { console.log('\nPROBLEMS:'); problems.forEach((p) => console.log(' -', p)); process.exitCode = 1; }
