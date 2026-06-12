# Prescription engine — design

The engine turns a quiz profile into a complete skincare prescription:
exactly one product per step of the core routine, mixed across brands,
with a rationale per product.

## Core routine (v1)

| # | Step key          | Step name            | Notes |
|---|-------------------|----------------------|-------|
| 1 | `first_cleanse`   | First cleanse        | Milk / oil / micellar — removes makeup, SPF, the day |
| 2 | `second_cleanse`  | Second cleanse       | Treats the skin itself |
| 3 | `toner`           | Toner / lotion       | Includes exfoliating lotions (P50 family etc.) — strength gated by tolerance |
| 4 | `mask`            | Mask                 | 1–3× weekly |
| 5 | `serum_hydration` | Hydration serum      | Hydration layer, near-universal |
| 6 | `serum_targeted`  | Targeted serum       | Prescribed against the #1 ranked concern |
| 7 | `moisturiser`     | Cream / oil          | Cream by default; oil wins for dry skin + rich-texture preference |

(`moisturiser` and `face_oil` are one prescription slot — the engine picks
whichever scores higher under the profile.)

Extended routine (eye, SPF, mist, specifics, body) is v2 — the data model
already supports the extra step keys so nothing needs reshaping.

## Product attribute schema

Every quiz-eligible product carries a classification record
(`data/products-classified.json` in this repo now; Shopify metafields
under namespace `skin_quiz` in production so the team can edit without a
deploy):

```jsonc
{
  "handle": "lotion-p50w",
  "title": "Lotion P50W",
  "vendor": "Biologique Recherche",
  "priceMin": 90,
  "include": true,                 // face-skincare, quiz-eligible
  "step": "toner",                 // one of the step keys above
  "skin_types": ["dry","normal","combination","oily"], // empty/all = universal
  "sensitive_safe": "yes",         // yes | caution | no
  "concerns": {                    // concern → strength of claim (1–3)
    "texture": 3, "dullness": 2, "sensitivity": 2
  },
  "actives_strength": "moderate",  // none | gentle | moderate | strong
  "pregnancy_safe": true,          // false when in doubt (acids/retinoids/EO-heavy)
  "am_pm": "both",                 // am | pm | both
  "texture": "liquid",             // liquid | gel | lotion | cream | balm | oil | mask
  "confidence": "high",            // classification confidence — low → team review
  "rationale": "AHA/BHA/PHA blend formulated for sensitised skin"
}
```

Concern taxonomy (mirrors quiz C1): `breakouts`, `congestion`, `redness`,
`pigmentation`, `fine_lines`, `firmness`, `dullness`, `dehydration`,
`sensitivity`, `pores`, `texture`, `eye_area`.

## Algorithm

### 1. Build the profile

From quiz answers: `skin_type` (dry|normal|combination|oily),
`sensitivity` (high|moderate|low), `concerns` (ranked map → weights
3/2/1 plus 0.5 for unranked selections), `acid_tolerance`,
`retinoid_tolerance`, `pregnant`, `avoid` (fragrance/essential oils/free
text), `texture_pref`, `brand_affinity`, `age_band`, `environment`,
`lifestyle`.

Derived signals: B4 "tight by evening" adds `dehydration +1`; hormonal
breakout pattern boosts `breakouts` weighting on PM products; age 45+
adds `firmness +0.5` and `fine_lines +0.5` unless already ranked.

### 2. Hard filters (per product)

A product is excluded from consideration when:
- `include` is false or it is out of stock
- pregnancy: profile pregnant and `pregnancy_safe` ≠ true
- sensitivity high and (`sensitive_safe` = no or `actives_strength` = strong)
- acid tolerance `none`/`reactive` and product is a strong acid
- retinoid tolerance `none`/`reactive` and product is a retinoid
- profile avoids an ingredient the product is flagged for
- `skin_types` set and profile type not in it

### 3. Scoring (per surviving product)

```
score = 30 × skin_type_match            // in set, or universal (×0.8)
      + 12 × Σ (product_concern_strength × profile_concern_weight)
      +  6 × texture preference match
      +  5 × brand affinity (E4)
      +  4 × sensitive_safe=yes when sensitivity=moderate
      +  3 × bestseller tag
      + step-specific boosts (below)
```

### 4. Selection — one pass per step, in routine order

Selection is ordered so later steps can see what's already prescribed
(regime coherence):

1. **first_cleanse / second_cleanse** — straightforward top score.
2. **toner** — the actives anchor. Strength ceiling from
   `acid_tolerance`: none→gentle, moderate→moderate, high→strong. Within
   the ceiling prefer the strongest tolerated exfoliating lotion that
   matches concerns (this is where P50 vs P50W vs PIGM 400-type
   distinctions happen via skin_types + concerns).
3. **mask** — top score; if top-2 concerns conflict (e.g. congestion +
   dehydration) the alternate is the other mask, and the rationale says
   to alternate weekly.
4. **serum_hydration** — best `concerns.dehydration` scorer in serum
   steps; universal hydration serums qualify.
5. **serum_targeted** — best scorer against rank-1 concern (rank-2 if
   rank-1 is dehydration, already covered). **Actives load rule**: if the
   chosen toner is `strong`, the targeted serum may not also be `strong`
   unless `acid_tolerance` is high — take the next eligible product.
6. **moisturiser** — creams and oils compete; oils get +8 when skin_type
   = dry and texture_pref = rich, −20 when oily.

Each step also returns the runner-up as the swap alternate.

### 5. Output

```jsonc
{
  "profile_summary": { ... },
  "regime": [
    { "step": "toner", "product": {...}, "alternate": {...},
      "usage": "PM, after cleansing, 5–6 nights a week",
      "why": "Your skin is sensitised but you tolerate acids well, so …" }
  ],
  "total": 612.00,
  "heroes": ["lotion-p50w", "serum-erythros", "creme-..."],  // E5 prioritised view
  "flags": []   // e.g. "free-text allergy — offer expert review"
}
```

## Validation loop

`npm run prescribe -- profiles/<name>.json` prints a prescription for a
saved profile. We validate by encoding real consultations from the EoB
team as profile JSONs and comparing engine output to what the
facialist actually prescribed; divergences become rule fixes or
classification fixes. Target: engine matches expert choice (or its
alternate) on ≥80% of steps before launch.

## Production shape (later phase)

- Classifications move to product metafields (`skin_quiz.*`), editable in
  Shopify admin; a sync script round-trips them with this repo.
- Engine runs server-side in a small Shopify app (app proxy under
  `/apps/skin-analysis`), so the same endpoint can serve the future
  native app.
- Results: customer metafield `skin_quiz.prescription` (account page
  rendering) + Klaviyo event `Skin Prescription Created` (email + flows).
