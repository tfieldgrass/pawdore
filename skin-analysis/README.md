# Embassy of Beauty — Skin Analysis

A long-form skin analysis quiz for [embassyofbeauty.co.uk](https://www.embassyofbeauty.co.uk)
that writes each client a complete skincare **prescription**: one product
per step of the core routine, mixed across the brands in the EoB edit,
chosen by a rules engine driven by the catalogue's own tags and
classifications.

Decisions agreed so far:

- **Web first**, native app later (the engine is built to be reused by an app)
- **Instant results**, no AI photo analysis — the existing *Ask an Expert*
  flow remains the human route
- **Brands mix** within one prescription (e.g. BR cleanser + RAESO serum)
- **Email required** (or logged-in account); prescription saved to the
  account, emailed via Klaviyo, flows built off the event
- The old single-brand quiz (`quiz-include` tags) is ignored

## Core routine (v1)

First cleanse · Second cleanse · Toner · Mask · Hydration serum ·
Targeted serum · Cream/Oil — extended routine (eye, SPF, mist…) is v2.

## Repo layout

| Path | What |
|---|---|
| `docs/quiz.md` | Full long-form question set and results-page anatomy |
| `docs/engine.md` | Prescription engine design (schema, filters, scoring, coherence rules) |
| `docs/architecture.md` | How this ships on Shopify + Klaviyo |
| `data/catalog.json` | Full active catalogue snapshot (title, vendor, type, tags, price) |
| `data/taxonomy.md` | Tag/type/vendor analysis of the catalogue |
| `data/products-classified.json` | Per-product engine attributes (step, skin types, concerns, strength…) |
| `src/engine.mjs` | The engine |
| `bin/prescribe.mjs` | CLI: run a profile, print the prescription |
| `profiles/` | Test client profiles for validation |

## Try it

```sh
node bin/prescribe.mjs profiles/dry-sensitive-45.json
```

## Validation

The engine is validated against real EoB consultations: each example
consult becomes a `profiles/*.json`, and the engine output is compared
with what the facialist prescribed. Divergence → fix the rule or the
product classification, never hand-hardcode the answer.

Classification confidence is recorded per product; everything marked
`"confidence": "low"` needs a pass from the EoB team before launch
(`data/review-needed.md`).
