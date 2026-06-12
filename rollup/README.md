# Roll-Up

Geofenced walk-up queue management for golf clubs. Players check in when they
are physically at the course, join as singles or groups, and the system runs
the start list: estimated tee times, "called to the tee", virtual-starter
tee-off confirmation, and clubhouse admin control.

Product background, competitor research and roadmap:
[`docs/golf-rollup-app/PRODUCT_BRIEF.md`](../docs/golf-rollup-app/PRODUCT_BRIEF.md).

## What's here (MVP scaffold — phase 1 of the brief)

```
rollup/server
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
- A group enters the start list only when its **last expected member** checks
  in; queue position is the *completed* check-in time. "Go with who's here"
  queues a partial group.
- Groups bigger than the max ball size split into balanced consecutive waves
  (7 → 4+3, 9 → 3+3+3) and stay together on the list.
- Singles can be open to matchmaking; another single can join their slot
  while it still has room.
- Arrival-order **and** random-draw (swindle) session modes.
- ETAs anchor to the last actual tee-off plus the configured interval.
- Virtual starter: a group member confirms tee-off, accepted only from inside
  the tee geofence; pro shop can always confirm/override.
- No-shows: grace period, then demote or remove. Frost-delay pause keeps
  the order. Every admin override is written to the audit log.
- Two courses (Burhill Old/New) run independent queues.

## Run it

```bash
cd rollup/server
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

## Not yet built (per the brief's phasing)

Push notifications (currently in-app/WebSocket + browser Notification),
native mobile wrapper, on-course pace tracking, scoring/handicaps, analytics
dashboards, intelligentgolf integration.
