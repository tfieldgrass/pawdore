# Embassy of Beauty — Skin Analysis Quiz (v1 question set)

Long-form consultation quiz. Every question feeds the prescription engine
(see `engine.md`). Questions marked **[filter]** create hard exclusions;
**[score]** questions adjust product scoring; **[profile]** questions shape
copy/rationale and Klaviyo properties.

Estimated completion time: 3–4 minutes. Progress bar across 6 sections.

---

## Section A — About you

**A1. What's your first name?** (text) [profile]
Used to personalise the prescription ("Sophie's Skin Prescription").

**A2. Your age** [score]
- Under 25
- 25–34
- 35–44
- 45–54
- 55+

**A3. Are you currently pregnant or breastfeeding?** [filter]
- Yes → excludes products flagged `pregnancy_safe: false` (strong acids,
  retinoids, some essential-oil-heavy formulas) and adds a note to the
  prescription
- No

**A4. Which best describes your environment?** [score]
- City life — pollution, central heating / air-con
- Hot and humid climate
- Cold or dry climate
- Lots of sun exposure
- Mix of the above / I travel a lot

---

## Section B — Your skin, functionally

We never ask "what's your skin type" directly — clients routinely
misdiagnose themselves. We infer it.

**B1. Two to three hours after cleansing, with nothing applied, your skin feels…** [score → skin_type]
- Tight, uncomfortable, sometimes flaky → **dry**
- Comfortable, you don't think about it → **normal**
- Shiny on the forehead/nose, normal elsewhere → **combination**
- Shiny or oily all over → **oily**

**B2. How often does your skin react — redness, stinging, itching, breakouts — when you try new products?** [filter + score → sensitivity]
- Often, my skin is reactive → **sensitive: high** (excludes
  `actives_strength: strong`, prefers `sensitive_safe: yes`)
- Occasionally → **sensitive: moderate** (strong actives allowed only with
  proven tolerance, see D2/D3)
- Rarely or never → **sensitive: low**

**B3. Your pores are…** [score]
- Barely visible
- Visible in the T-zone
- Enlarged across cheeks and T-zone

**B4. By the end of the day, your skin typically…** [score]
- Feels tight or shows dry patches → dehydration signal
- Looks much the same as the morning
- Is shiny / makeup has slipped → oil signal

---

## Section C — Your concerns

**C1. Which of the following do you see in your skin today?** (multi-select) [score]
- Breakouts and blemishes
- Blackheads and congestion
- Redness or rosacea
- Pigmentation, dark spots, uneven tone
- Fine lines and wrinkles
- Loss of firmness and elasticity
- Dullness, lack of radiance
- Dehydration and tightness
- Sensitivity and reactivity
- Enlarged pores
- Uneven, rough texture
- Dark circles or puffiness (eye area — v2, extended routine)

**C2. Now rank your top three.** (drag to order) [score]
Rank 1 → weight 3, rank 2 → weight 2, rank 3 → weight 1. The targeted
serum is prescribed against rank 1.

**C3. Conditional drill-downs** (only shown if the concern is in the top 3):
- *Breakouts*: Do they cluster around your chin and jaw before your period
  / are they constant / occasional? [score → hormonal vs congestion]
- *Pigmentation*: Mostly from sun / marks left after blemishes / melasma
  (often hormonal, larger patches)? [score]
- *Redness*: Have you been diagnosed with rosacea? Does it flush with
  heat, alcohol, spicy food? [filter → rosacea pathway]

---

## Section D — History and tolerance

**D1. Which steps are already in your routine?** (multi-select) [profile]
Makeup remover / first cleanse · second cleanse · toner or essence ·
exfoliant · mask · serum · moisturiser · facial oil · SPF · none of these

**D2. Have you used exfoliating acids (AHA/BHA, e.g. glycolic, lactic, salicylic)?** [filter + score → acid_tolerance]
- Regularly, my skin loves them → **high**
- Occasionally / in the past → **moderate**
- Never → **none** (start gentle)
- I tried them and my skin reacted → **reactive** (exclude strong acids)

**D3. Have you used retinol or other vitamin-A products?** [filter + score → retinoid_tolerance]
Same scale as D2.

**D4. Is there anything your skin can't tolerate, or you prefer to avoid?** (multi-select + free text) [filter]
- Fragrance
- Essential oils
- Other (free text — stored on the prescription for the team; if an
  allergy is listed the result page invites them to "Ask an Expert" review)

---

## Section E — Preferences and lifestyle

**E1. Which textures do you enjoy?** [score]
- Rich creams, balms and oils
- Light lotions, gels and fluids
- No preference — whatever my skin needs

**E2. How is your daily sun exposure / SPF habit?** [score + profile]
- I wear SPF daily
- Only in summer or on holiday
- Rarely

**E3. Which of these apply to your life right now?** (multi-select) [score]
- Frequent flying / travel
- High stress
- Disrupted sleep
- Smoking
- Hormonal changes (perimenopause, menopause, post-partum, coming off the pill)
- Intense exercise / outdoor sport

**E4. Are there brands from our edit you already know and love?** (optional multi-select of storefront vendors) [score]
Small affinity bonus — never overrides skin logic.

**E5. How would you like your prescription?** [profile]
- The complete ritual — every step (full 8-step core routine)
- Prioritised — show me everything, but tell me where to start
  (full routine shown with the 3 "begin here" heroes highlighted)

---

## Section F — Your prescription

**F1. Email gate** (skipped when logged in — prefill from customer account)
- Email (required to view results)
- Opt-in checkbox: skincare advice and offers (Klaviyo marketing consent —
  separate from the transactional prescription email)

On submit:
1. Engine returns prescription instantly → results page
2. Prescription saved (customer metafield when account exists; Klaviyo
   profile properties always)
3. Klaviyo event `Skin Prescription Created` fires with the full payload
   → triggers prescription email + follow-up flow

---

## Results page anatomy

- "**{Name}'s Skin Prescription**" — skin summary paragraph generated from
  the profile (type, sensitivity, top concerns) in EoB tone of voice
- The 8 steps in ritual order, each with: product, price, *why we chose
  this for you* (2 sentences referencing their answers), AM/PM badge
- **Add complete ritual to bag** (one click) + per-product add buttons
- Each step offers one alternate ("prefer a different texture? swap")
- Total + note that the prescription is saved to their account
- Footer: "Want a human to double-check? Send this prescription to our
  experts" → existing Ask an Expert flow with the quiz payload attached
