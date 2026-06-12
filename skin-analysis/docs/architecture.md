# Architecture — how this ships

## Phase 1 (this repo): the brain

Catalogue snapshot → per-product classification → rules engine → CLI
validation against real consultations. No storefront code yet; getting
the prescription logic right is the hard part and it's fully testable
offline.

## Phase 2: on the website

```
embassyofbeauty.co.uk/pages/skin-analysis
        │  (App Proxy: /apps/skin-analysis → small Shopify app)
        ▼
  Quiz UI (theme-styled, multi-step)
        ▼
  POST answers → app server runs the engine
        ├── reads product classifications from metafields (skin_quiz.*)
        ├── writes customer metafield skin_quiz.prescription (if account)
        ├── fires Klaviyo event "Skin Prescription Created" (full payload)
        └── returns prescription JSON → results page renders instantly
```

Why a small app + app proxy rather than pure theme JS:

- the engine and scoring stay **server-side** (not exposed/scrapable in
  theme JS, no logic forked between web and the future native app)
- it can write **customer metafields** (account-page prescription) and
  call **Klaviyo server-side** with the customer's consent state
- the same endpoint later serves the native app

Product classifications live as **metafields** (`skin_quiz.step`,
`skin_quiz.skin_types`, `skin_quiz.concerns`, …) so the team can adjust a
product's prescription behaviour from Shopify admin without a deploy. A
sync script round-trips metafields ↔ `data/products-classified.json`.

## Klaviyo

- Event: `Skin Prescription Created` — properties: skin type,
  sensitivity, ranked concerns, regime (product handles + prices), total
- Profile properties mirrored (skin type, top concern…) for segmentation
- Flows to build:
  1. **Prescription email** (immediate, transactional-styled): the full
     regime, add-to-bag links, "reviewed routines" tone
  2. **Education series** (days 2–10): how to use each step, in ritual order
  3. **Abandoned prescription** (no purchase after N days): nudge + offer
  4. **Replenishment**: per-step reorder timing (cleanser ~3 months, etc.)
- Marketing consent captured separately at the email gate (F1)

## Account page

Theme section "My Skin Prescription" reading
`customer.metafields.skin_quiz.prescription` — re-orderable, re-takeable
(retake overwrites; previous kept in a history list inside the metafield).

## Phase 3: native app

The app consumes the same prescription endpoint. Loyalty/discount
mechanics live at the commerce layer (app-exclusive discount via Shopify
Functions or a price list), not in the quiz.
