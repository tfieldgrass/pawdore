# Golfdore

Geofenced walk-up queue management for golf clubs. Players check in when they
are physically at the course, join as singles or groups, and the system runs
the start list: estimated tee times, "called to the tee", virtual-starter
tee-off confirmation, and clubhouse admin control.

Product background, competitor research and roadmap:
[`docs/PRODUCT_BRIEF.md`](docs/PRODUCT_BRIEF.md).

## What's here (MVP scaffold — phase 1 of the brief)

```
server
├── src/domain/      # Pure queue engine + geofence maths (fully unit-tested)
│   ├── types.ts     # Domain model: club, sessions, players, groups, tee slots
│   ├── engine.ts    # RollupEngine: check-in, groups, waves, calls, no-shows, draw
│   └── engine.test.ts
├── src/api.ts       # REST API (player + admin) with bearer/admin-key auth
├── src/store.ts     # Debounced atomic JSON persistence (pilot-grade)
├── src/server.ts    # HTTP + WebSocket server, serves the web apps
└── web/
    ├── player/      # Player app: check in, create/join group, queue status
    ├── board/       # TV board for clubhouse & 1st tee (zero-login URL)
    └── admin/       # Clubhouse console: sessions, queue control, kiosk
```

Implemented engine rules (each covered by a test):

- Geo check-in must be inside the club geofence; QR-code and pro-shop kiosk
  check-in as fallbacks (also the anti-GPS-spoofing path).
- The first arrival creates the group and **names their playing partners**;
  each partner claims their spot when they check in. The group enters the
  start list when the **last named partner** arrives; queue position is the
  *completed* check-in time. "Go with who's here" queues a partial group.
- Forming groups appear on the board and in the app as "waiting for players",
  with any spare slots shown as open.
- Open slots are joinable from a list in the app (no code needed) — but a
  stranger can never take a spot reserved for a named invitee. A friend with
  the group's join code can always claim a spot.
- Pro shop can **merge two queued groups** (e.g. two 2-balls into a 4-ball);
  the merged group keeps the better position.
- Groups bigger than the max ball size split into balanced consecutive waves
  (7 → 4+3, 9 → 3+3+3) and stay together on the list.
- Arrival-order **and** random-draw (swindle) session modes.
- ETAs anchor to the last actual tee-off plus the configured interval.
- Virtual starter: a group member confirms tee-off, accepted only from inside
  the tee geofence; pro shop can always confirm/override.
- No-shows: grace period, then demote or remove. Frost-delay pause keeps
  the order. Every admin override is written to the audit log.
- Two courses (Burhill Old/New) run independent queues.

## Run it

```bash
cd server
npm install
npm test        # 19 engine tests
npm run dev     # http://localhost:3000
```

- Player app: `http://localhost:3000/player/`
- Tee board (point a TV at it): `http://localhost:3000/board/`
- Admin console: `http://localhost:3000/admin/` — default key `burhill-dev`
  (set `ADMIN_KEY` in production).

The default club config is Burhill GC (Old + New) with a 400 m geofence
around the clubhouse; adjust via `PATCH /api/admin/club` or in
`src/server.ts`.

To try the full loop locally: open the admin console, open a session, then in
the player app check in with code `BURHILL` (geolocation will fail unless you
are actually in Walton-on-Thames), create a group, and drive the queue from
the admin console with the board open in another tab.

## Deploy (Render.com — free tier)

The repo root has a `render.yaml` blueprint. In Render: **New → Blueprint**,
connect this GitHub repo, pick branch `main`, deploy.
You get an HTTPS URL like `https://golfdore-xxxx.onrender.com` — HTTPS is what
lets phone browsers use GPS, so this is the way to test the geofence for
real. The admin key is auto-generated: Render dashboard → the `golfdore`
service → **Environment** → `ADMIN_KEY`.

Free-tier caveats: the service sleeps after ~15 min idle (first visit takes
~1 min to wake) and **saved state is wiped on redeploy/restart** — fine for
testing, not for a pilot. For the pilot, move to a paid instance with a
persistent disk (set `DATA_FILE` to the disk mount).

Testing the geofence away from the club: admin console → **Club settings**
→ stand where check-in should work → "📍 Use my location" → Save.

## Troubleshooting

- **Which version am I running?** The startup banner prints it
  (`Roll-Up server v0.2.0 — …`), and `http://localhost:3000/api/health`
  returns it. If it doesn't match the latest in `src/version.ts` on the
  branch, you're running an old copy — delete the whole folder and
  re-download; extracting a new ZIP *over* an old folder leaves stale files
  behind.
- **Old/broken saved data**: the server validates `data/state.json` at
  startup; unusable data is moved aside to `state.json.corrupt-<timestamp>`
  and the server starts fresh (it never crash-loops on bad data). To reset
  manually: stop the server and delete the `data` folder.
- **"EADDRINUSE" / can't reach the site**: another copy of the server is
  (or isn't) running. One server per port — stop old terminals first
  (Windows: `taskkill /f /im node.exe`).
- **Check-ins expire** after 12h (club-configurable `checkInValidHours`), so
  yesterday's testing session won't leave phantom checked-in players today.

## Not yet built (per the brief's phasing)

Push notifications (currently in-app/WebSocket + browser Notification),
native mobile wrapper, on-course pace tracking, scoring/handicaps, analytics
dashboards, intelligentgolf integration.
