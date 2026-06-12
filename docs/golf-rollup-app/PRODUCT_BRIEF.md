# Roll-Up — Product Brief (working draft v0.1)

An app for golf clubs to run the daily "roll-up": players check in on arrival
at the course (verified by geofence), join the queue as singles or groups, and
the system manages the start list, calls groups to the tee, and tracks pace of
play out on the course.

This is a discussion document. Open questions are marked **[DISCUSS]**.

---

## 1. The core idea (as agreed)

- **Geofenced check-in.** You can only join the roll-up when your phone is
  physically at the club. This stops people joining the list from home.
- **Singles and groups.** Join alone, or create/join a named group. A group
  only enters the start list when its **last member checks in** — no one can
  arrive early and "hold" a place for absent friends.
- **Groups bigger than 4** take consecutive slots so they play back-to-back.
- **Live start list / leaderboard** on the app, on TV screens in the clubhouse
  and at the 1st tee: now teeing off, next up, full queue, estimated tee times.
- **Called to the tee.** When a group is next: push notification + highlighted
  on the boards.
- **Tee-off confirmation** moves the queue along (see §4 for options).
- **Admin console** for the clubhouse: configure tee intervals, allowed group
  sizes by time of day, manage/override the queue.
- **Pace of play.** If every player has the app, track positions on course,
  compare to a club-defined pace target, nudge slow groups by push
  notification, and keep history on persistently slow players.
- **Later:** scoring, handicaps, wider club features.

## 2. Competitive landscape (researched June 2026)

### 2.1 Closest functional competitor — Whoosh
[Whoosh](https://www.whoosh.io/) (US, private-club focus) built "the first
waitlist to match the workflow of facilities with no tee times": staff track
walk-ups in real time and drag-and-drop them onto the tee sheet. It also has a
member booking app, restriction management, and pace-of-play tracking.
**Key difference:** Whoosh's waitlist is *staff-driven from the pro shop*.
Ours is *player-self-service, gated by physical presence*. Nobody found in
this research does geofenced self-check-in to a walk-up queue.

### 2.2 UK/Ireland club-management incumbents (tee sheets, comps, handicaps)
These own the club relationship we'd be selling into, so we must either
coexist or replace a slice of them:

- **[BRS Golf](https://www.brsgolf.com/web/tee-sheet/)** (GolfNow/NBC) —
  dominant UK&I tee-time booking, ~3,500 clubs, 670k+ members.
- **[intelligentgolf](https://www.intelligentgolf.co.uk/)** — full club
  management: tee booking, competitions, member app (igMember), analytics.
  Reputed expensive but popular all-rounder.
- **ClubV1 / [HowDidiDo](https://apps.apple.com/gb/app/howdidido/id6742023251)**
  (Club Systems) — 1M+ golfers, 2,000+ clubs. The rebuilt HowDidiDo app merges
  ClubV1 Members Hub and igMember: tee booking, competition entry, score
  entry, live leaderboards, WHS Handicap Index, open comps. Freemium
  (£2.99–£9.99/yr to members).

Notable: clubs currently bodge roll-ups *through* these systems — the pro
shop pre-books blocks of slots and manually shuffles names in. Golf Monthly
forum threads confirm roll-ups have become painful since booked tee times
took over ("fastest finger first"). That pain is our wedge.

### 2.3 US/global tee-sheet platforms
foreUP, Lightspeed Golf (Chronogolf), Teesnap, TenFore, Golfmanager, Jonas,
Cobalt, Tee On. All are full POS + tee sheet + booking suites. None centre on
walk-up queues. Relevant mainly as future integration targets / acquirers.

### 2.4 Pace-of-play specialists
- **[Tagmarshal](https://www.tagmarshal.com/)** — GPS pucks (bag clips for
  walkers, under-seat units for carts) + AI pace management. Case study: 19-min
  reduction in average round time. Uses geofence buzzer alerts.
- **[FAIRWAYiQ](https://www.fairwayiq.com/)** — cart GPS, real-time location,
  path tracking, geofence violations, and **per-player profiles**: play
  history, individual round pace, average pace over time.

Both rely on **dedicated hardware**. Our phone-based approach is far cheaper
for the club but weaker for players without the app / with dead batteries —
see §6. Feature parity to aim for: *out-of-position* detection (vs the group
in front, not just absolute time), checkpoint times per hole, pace history per
player, marshal dispatch view.

### 2.5 Roll-up/swindle social apps
- **[Quick9](https://quick9.app/)** — UK app explicitly targeting "rollups,
  swindles and fiddles" (site blocked automated access; needs a manual look —
  **[DISCUSS]** worth downloading and trialling). From its marketing it covers
  organising the social/competition side of roll-ups; no indication of
  geofenced arrival queuing or tee management.
- **Scoring/handicap consumer apps** (TheGrint, Hole19, Golfshot) — set the
  UX bar for score entry and casual handicaps but don't run queues.

### 2.6 Feature checklist derived from competitors

| Feature (who does it) | In our plan? |
|---|---|
| Walk-up waitlist → tee sheet (Whoosh) | ✅ core, but self-service |
| Restriction mgmt: group size/intervals by time (Whoosh, all tee sheets) | ✅ |
| Live leaderboards & comp scoring (HowDidiDo, intelligentgolf) | ✅ phase 3 |
| WHS handicap display (HowDidiDo) | ⚠️ needs licensed integration — §7 |
| Per-player pace profiles & history (FAIRWAYiQ) | ✅ phase 2 |
| Out-of-position alerts & marshal view (Tagmarshal) | ➕ added — §6 |
| Course utilisation analytics (Tagmarshal, intelligentgolf Claritee) | ➕ added — §8 |
| Random-draw groupings for swindles (Quick9 territory) | ➕ added — §5 |
| Member comms/news/events (igMember, HowDidiDo) | later "club features" |
| POS / green-fee payments (all suites) | ❌ out of scope v1 — **[DISCUSS]** |

## 3. Roles

| Role | Capabilities |
|---|---|
| Player (member) | Check in, join/create group, view queue & ETA, receive calls/pace nudges, enter scores |
| Player (guest/visitor) | As above but flagged; club decides if guests allowed in roll-up |
| Starter / marshal | Mark groups teed off, dispatch view, on-course pace map |
| Pro shop / admin | Full queue control, settings, manual add (no-phone players), reports |
| Club super-admin | Course setup, geofences, pace targets, staff accounts |
| Public screen | Read-only board (clubhouse TV, 1st-tee display) — just a URL |

## 4. The queue engine

**Check-in:** geofence around the club (configurable radius/polygon).
Fallbacks because GPS alone isn't enough:
- QR code poster at the pro shop / locker room (scan to check in) — also the
  answer for geofence edge cases and **GPS spoofing** (see §9).
- Kiosk/tablet at the clubhouse for players without the app.
- Admin manual add.

**Group lifecycle:**
1. Anyone checked in can create a group and invite others (or share a join
   code). Pending members show as "expected".
2. Group enters the start list when the last member checks in. Its queue
   position = time of *completed* check-in (so a 4-ball whose last player
   strolls in at 9:40 queues behind a single who arrived at 9:35 — fair).
3. **Partial start option:** group creator can press "go with who's here" to
   enter the list with current members only. **[DISCUSS]** auto-prompt after
   N minutes?
4. Groups > max-ball-size split into consecutive slots, balanced (7 → 4+3,
   not 4+2+1). The group chooses who's in which wave, or it's auto-split.
5. Singles can flag "happy to be joined up" → system offers to merge singles/
   pairs into fuller groups (matchmaking). Club can force this at busy times.

**Two queue modes** (per club, per session):
- **Arrival order** (the spec above).
- **Random draw** — the classic swindle: everyone checks in by a cut-off
  time, then the system draws random groups. Many roll-ups *deliberately* mix
  players; supporting only arrival-order groups would lose those clubs.

**Estimated tee times:** position × configured interval, anchored to the
actual tee-off times being confirmed, re-broadcast live on every change.

**Tee-off confirmation** (moves the queue) — support all three, club picks:
- **Virtual starter mode (primary for Burhill):** a player in the group taps
  "we're off", geofence-validated at tee 1, with auto-detect (phones leaving
  the 1st-tee zone) as corroboration and a timeout-based fallback (assume
  teed off N min after being called if signals agree). The club's stated aim
  is to *remove the need for a staffed starter*, so this flow must be robust
  unattended — pro-shop gets an exceptions view (stalled tee, dispute) rather
  than a per-group task.
- Starter/pro-shop taps "teed off" (staffed mode, most reliable).
- Auto-detect only (no tap), for low-stakes sessions.

**No-shows:** when called, a group has a grace period (configurable, e.g.
5 min) to reach the tee; otherwise admin can skip them (drop back N places or
remove). All overrides logged.

**Hybrid with bookings:** the club's stated preference is tee-time-style
structure — which is exactly what this system provides for walk-up demand:
the roll-up queue *is* a self-filling tee sheet. The club defines **roll-up
windows** (e.g. weekdays before 9am, Sat 7–10) and possibly reserved booked
slots inside them; everything inside a window is queue-managed, with the
same interval/group-size discipline as booked play. v1 keeps our own simple
tee sheet; integrating with BRS/intelligentgolf tee sheets is a later (and
commercially significant) step.

## 5. Club settings (admin)

- Tee interval (e.g. 8/9/10 min), per time band.
- Allowed group sizes per time band (2/3/4-balls only at certain times).
- Roll-up session windows; cut-off times; random-draw vs arrival mode.
- Geofence shape/radius; earliest check-in (e.g. no more than 45 min before
  the session opens — stops camping).
- Guest policy, junior policy; members-only times.
- Grace period, no-show penalty.
- 1st/10th tee operation, two-tee starts, 9-hole loops. **[DISCUSS]**
- Course status: frost delay (pause queue, keep order), temporary closure,
  suspension (lightning) with push to all on-course players — doubles as a
  safety feature.
- Buggy/trolley availability flag shown at check-in. **[DISCUSS]** full
  buggy reservation later?

## 6. Pace of play (phase 2)

- Club defines a pace target as **cumulative checkpoint times per hole**
  (not one number) — e.g. through 6 holes: 1h10.
- Primary metric is **out of position** (gap to the group in front), which is
  fairer than absolute time; both Tagmarshal and FAIRWAYiQ converge on this.
- Escalation ladder: in-app gentle nudge → stronger notification → flag to
  marshal dispatch view. Clubs choose how automated this is.
- Per-player pace history; "consistently slow" report for the committee
  (rolling average, percentile vs field). Sensitive — see §9.
- Reality check: phone GPS in background drains battery and players forget
  phones. Track at **group** level (any one phone in the group is enough),
  degrade gracefully when no signal, never make pace data load-bearing for
  the queue.

## 7. Scoring & handicaps (phase 3)

- Score entry per hole (medal, stableford, match play, team formats), one
  marker per group, attestation by a playing partner.
- Live roll-up leaderboard (same screens as the queue board).
- **Roll-up handicap:** a club-local handicap adjusted by roll-up results
  (cut for winning — exactly how swindles already work on paper). This avoids
  the hard problem: **official WHS handicaps are licensed** (England Golf /
  USGA via authorised software). Display-only WHS via integration later;
  never compute official WHS ourselves in v1.
- Sweep/pot support: entry fee tracking and payout calculation (cash
  reconciliation first; in-app payments later **[DISCUSS]**).

## 8. Things the original spec hadn't covered (beyond the above)

1. **Multi-course clubs** — two courses = two queues; players pick at
   check-in. (Burhill has Old + New, so this is MVP scope — see §10.)
2. **TV display mode** — a zero-login web URL per screen with big-type
   layouts; this is also the cheapest marketing surface in the clubhouse.
3. **Analytics for the club** — rounds/day, queue length by hour, average
   wait, average round time, no-show rate, utilisation heatmap. (Matches
   intelligentgolf's "Claritee" and Tagmarshal's reporting pitch.)
4. **Clubhouse footfall forecasting** — the system knows three things no
   other club system does: who has *arrived* (check-in), who is *about to
   finish* (group on the 16th ≈ in the bar in 40 min), and historic demand
   curves. Surface this as a live "expected finishers" dashboard for F&B
   (kitchen/bar staffing, halfway-hut stocking) plus a morning forecast of
   the day's footfall. This is a club-side revenue feature, not a golf
   feature — and a key part of the Burhill ROI case (§10).
5. **Privacy/GDPR** — location tracking needs explicit opt-in, on-course only
   (auto-stop after round), retention limits, and club data-processing
   agreements. Pace "league tables of shame" must be committee-only.
6. **Anti-spoofing/fairness** — mock-location apps exist; mitigations:
   QR check-in option, plausibility checks (speed/teleport detection), and
   making the starter confirmation authoritative.
7. **Offline tolerance** — rural courses have poor signal. Queue state cached
   on device; score entry offline-first with sync.
8. **Accessibility of the no-phone path** — older membership is exactly who
   roll-ups serve. Kiosk + admin add must be first-class, not an afterthought.
9. **Comms** — a simple message-to-queue / message-to-course broadcast
   ("halfway hut closed today") covers a lot of "club features" cheaply.

## 9. Risks / open questions

- **Who pays / beachhead** — resolved: Burhill as design partner, BGL group
  upsell; pricing model in §10.
- **[DISCUSS] Quick9** needs a hands-on trial — closest in spirit, site
  blocked automated research.
- WHS licensing constraints (above).
- Geofence reliability near clubhouse Wi-Fi/GPS shadow — pilot will tell.

## 10. Go-to-market: Burhill / BGL (design partner)

**The club.** Burhill Golf Club, Walton-on-Thames: a 36-hole members club
(Old course 1907, New course 2001) — which makes **multi-course support an
MVP requirement, not a later phase**. Premium membership: ~£6,000 joining fee,
~£2,000 annual subscription.

**The group.** Burhill is the flagship of Burhill Group Limited (BGL), a
commercial operator of ~11 golf venues (Hoebridge, Wycombe Heights, Birchwood
Park, Thornbury, Ramsdale, Aldwickbury Park, Redbourn, Abbey Hill, Sidcup…)
plus leisure brands. Two consequences:
1. **One buyer, eleven venues.** A successful Burhill pilot is pitched to BGL
   head office, not ten separate committees. Group-wide rollout is one deal.
2. BGL's other venues are mostly **pay-and-play/proprietary** — different
   dynamics (visitor walk-ups rather than member roll-ups), which the
   arrival-order queue actually fits *better* than the swindle model. Design
   both modes from the start (§4 already does).

**Incumbent tech.** Burhill runs on **intelligentgolf**
(burhill.intelligentgolf.co.uk) for tee booking and competitions. v1 strategy:
**coexist, don't replace** — the pro shop blocks out roll-up windows in IG;
our app owns everything inside those windows. An IG tee-sheet integration is
the phase-4 prize.

### Pricing — agreed: £1 per member per month

£1/member/month (£12/member/year), with the club choosing to absorb it or
pass it through on the subscription (opex, not capex — monthly SaaS billing,
no upfront fee, cancel-anytime in year one). Benchmarks that make this an
easy yes: HowDidiDo charges members £2.99–£9.99/yr; a full club-management
suite costs the club roughly 30–80p/member/month equivalent. At ~1,000+
members this is ~£12k+/yr from Burhill alone, and a BGL portfolio deal
(11 venues, discounted flat rate per venue) is where it scales.
Phase 2/3 features (pace analytics, scoring/sweeps) become upsell tiers later.
**Pilot:** free or nominal for one season in exchange for design-partner
access, a named case study, and the intro to BGL head office.

### The club-side ROI case (why the club says yes)

The member pitch is fairness and convenience; the *club* pitch is:

1. **Remove the staffed starter.** Virtual-starter mode (§4) does the
   calling, sequencing, no-show handling and tee-off confirmation
   unattended. A weekend starter at ~£12–15/hr × 6h × 2 days ≈ **£7–9k/yr**
   — the app pays for itself on this line alone at most clubs.
2. **Tee-time-style control over walk-up golf.** The club prefers the
   discipline of tee times; the roll-up queue *is* a self-filling tee sheet —
   same intervals, same group-size rules, but demand-driven. The club gets
   the manageability without killing the roll-up culture members want.
3. **Demand data they've never had.** Walk-up play is currently invisible to
   intelligentgolf. Check-in data gives arrival curves, queue lengths, wait
   times, utilisation by hour/day — the basis for staffing, course setup and
   membership-capacity decisions.
4. **Clubhouse footfall forecasting** (§8.4) — know who's just arrived and
   who finishes in 40 minutes; staff the bar and kitchen to match. For a
   group like BGL whose venues lean heavily on F&B revenue, this may be the
   single most persuasive line in the deck.

**[DISCUSS]** Who's the economic buyer at Burhill — club GM, or does anything
member-facing route through BGL head office from day one? Worth finding out
before the first pitch; it changes whether the pilot pitch is "help your
roll-up" or "portfolio walk-up revenue tool".

## 11. Suggested build phasing

| Phase | Scope |
|---|---|
| 1 — MVP | Check-in (geofence + QR + kiosk), groups, queue engine (arrival mode), admin console, TV board, push "called to tee", starter tee-off confirmation, core club settings |
| 1.5 | Random-draw mode, singles matchmaking, no-show handling polish, course status/broadcasts |
| 2 | On-course tracking, pace targets, out-of-position nudges, marshal view, pace history |
| 3 | Scoring, roll-up handicaps, sweeps, club analytics |
| 4 | WHS display integration, tee-sheet (BRS etc.) integration, payments, wider club features |

**Tech sketch (for later discussion):** cross-platform mobile (React
Native/Expo or Flutter) for geofencing + push (APNs/FCM); web app for admin
console and TV boards; realtime sync (WebSockets) for queue state; the queue
engine is the one piece worth getting formally right (state machine with an
audit log, since admins override it live).
