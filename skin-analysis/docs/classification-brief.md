# Product classification brief

You are classifying Embassy of Beauty face-skincare products into the
prescription-engine schema. The engine prescribes ONE product per routine
step, so classifications must be honest and discriminating — a product
that claims everything helps no one.

## Output record (one per product, JSON array)

```jsonc
{
  "handle": "lotion-p50w",
  "title": "Lotion P50W",
  "vendor": "Biologique Recherche",
  "productType": "Toners",
  "priceMin": 90,
  "include": true,            // false for: sets/duos/kits, "coming soon" or "not-live" tagged, devices/tools, refills
  "step": "toner",            // first_cleanse | second_cleanse | toner | mask | serum_hydration | serum_targeted | moisturiser | face_oil
  "skin_types": ["dry","normal"],   // subset of dry|normal|combination|oily; [] = suits all
  "sensitive_safe": "yes",    // yes (formulated/safe for sensitive & reactive skin) | caution | no
  "concerns": { "pigmentation": 3, "dullness": 2 },  // ONLY concerns the product genuinely targets, strength 1–3 (3 = its primary purpose)
  "actives_strength": "moderate",   // none | gentle | moderate | strong (exfoliating acids, retinoids, potent vit C)
  "actives_family": "acid",   // acid | retinoid | vitamin_c | enzyme | none
  "pregnancy_safe": false,    // BE CONSERVATIVE: false for retinoids/vitamin A, salicylic acid, phenol (P50 1970), strong acids, EO-heavy formulas; when unsure → false + say so in rationale
  "am_pm": "both",            // am | pm | both
  "texture": "liquid",        // liquid | gel | lotion | cream | balm | oil | milk | foam | mask
  "contains": ["fragrance"],  // flags for client-avoid matching: "fragrance", "essential oils" — only when present/likely
  "bestseller": true,         // tag "bestseller" present
  "confidence": "high",       // high | medium | low — low = needs EoB team review
  "rationale": "1 short sentence: why this step/skin types/concerns"
}
```

## Concern keys (use ONLY these)

`breakouts` (active blemishes/acne) · `congestion` (blackheads, blocked
pores) · `redness` (rosacea, erythema, capillaries) · `pigmentation`
(dark spots, uneven tone, melasma) · `fine_lines` · `firmness`
(elasticity, sagging, contour) · `dullness` (radiance, glow,
brightening) · `dehydration` (tightness, lack of water) · `sensitivity`
(reactive, weakened barrier — soothing/repair products) · `pores`
(visible/enlarged) · `texture` (roughness, uneven grain) · `eye_area`

## Step decision rules

- **Cleansers** split into `first_cleanse` (milks, oils, balms, micellar
  waters — dissolve makeup/SPF; e.g. cleansing milk, cleansing oil) and
  `second_cleanse` (gels, foams, creams/washes that treat the skin). If a
  cleanser is genuinely positioned as a single do-everything cleanse,
  pick the step it serves best and note the dual use in the rationale.
- **Toners** includes exfoliating lotions (the P50 family etc.) AND
  gentle/hydrating toners and essences. Mists are toners only if
  positioned as a treatment step; pure refresher mists → include: false
  for v1.
- **Face Serums** split into `serum_hydration` (primary job is
  hydration/plumping/barrier) and `serum_targeted` (primary job is a
  specific concern: pigmentation, redness, ageing, blemishes…). A serum
  that does both goes where its PRIMARY claim is.
- **Face Creams** → `moisturiser`. **Facial Oil** → also `moisturiser`
  with `texture: "oil"` — creams and oils compete for one prescription
  slot and the engine arbitrates by skin type and texture preference.
- **Masks** → `mask`.

## Tag interpretation (normalise duplicates)

Concern tags: Fine Lines/finelines → fine_lines; eventone /
evenyourcomplexion / discolouration / pigmentedskin / antispot →
pigmentation; rosacea / erythema / skinredness / capillaries /
blotchiness → redness; antiacne / sebum / sebumcontrol → breakouts;
dilatedpores / pores → pores; skinelasticity / facialcontour(s) →
firmness; gettheglow / radiance / brighten / illuminate /
glowingandradiant → dullness; soothe / soothing / calming / calm →
sensitivity; hydrating / hydration / moisture / Dehydrated Skin →
dehydration; oily → skin_types includes oily; sensitiveskin /
sensitive-skin / skinsensitivity → sensitive_safe yes.

Strength signals: Hydroxy Acids (AHA/BHA/PHA), Salicylic Acid, Lactic
Acid, Retinol, Vitamin A, exfoliant/exfoliator tags. PHA-only → gentle.

Ignore operational tags entirely (show-price, properproduct, BFBR*,
inventory, feature-*, Cross_sell_flow, EB Collection, seasonal…).

Newer brands (Vie de Mer, Future 5 Elements, AWvi, Demain Beauty, recent
Auteur/Venn/RAESO/Irene Forte/Ayuna additions) have sparse tags — rely on
the product DESCRIPTION (fetch it) and your skincare knowledge of these
lines. Mark confidence accordingly.

## Honesty rules

- Max 4 concerns per product; at most one concern at strength 3.
- skin_types: only restrict when the product is clearly for those types;
  otherwise [].
- confidence "low" whenever you inferred mostly from brand knowledge
  rather than description/tags.
