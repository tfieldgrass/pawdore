import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EngineError, RollupEngine, splitIntoWaves } from './engine.ts';
import type { ClubConfig, SessionSettings } from './types.ts';

// Burhill-ish test fixture. Club at (51.36, -0.40); tee 100m away.
const CLUB: ClubConfig = {
  name: 'Test GC',
  courses: [
    { id: 'old', name: 'Old Course' },
    { id: 'new', name: 'New Course' },
  ],
  clubGeofence: { lat: 51.36, lng: -0.4, radiusM: 300 },
  teeGeofence: { lat: 51.3609, lng: -0.4, radiusM: 50 },
  checkInCode: 'BURHILL',
};

const AT_CLUB = { lat: 51.3601, lng: -0.4001 };
const AT_TEE = { lat: 51.3609, lng: -0.4 };
const AT_HOME = { lat: 51.5, lng: -0.1 };

const SETTINGS: SessionSettings = {
  courseId: 'old',
  mode: 'arrival',
  teeIntervalMin: 9,
  maxGroupSize: 4,
  graceMin: 5,
};

function makeEngine(startAt = 8 * 3600_000) {
  let t = startAt;
  const clock = { tick: (ms: number) => (t += ms) };
  const engine = new RollupEngine(CLUB, { now: () => t });
  return { engine, clock };
}

function checkedInPlayer(engine: RollupEngine, name: string) {
  const p = engine.registerPlayer(name);
  engine.checkIn(p.id, { method: 'geo', ...AT_CLUB });
  return p;
}

describe('check-in', () => {
  it('rejects geo check-in from outside the club geofence', () => {
    const { engine } = makeEngine();
    const p = engine.registerPlayer('Home Harry');
    assert.throws(
      () => engine.checkIn(p.id, { method: 'geo', ...AT_HOME }),
      (e: EngineError) => e.code === 'outside_geofence',
    );
  });

  it('accepts geo check-in inside the fence and QR code check-in', () => {
    const { engine } = makeEngine();
    const a = engine.registerPlayer('Geo Gail');
    const b = engine.registerPlayer('Code Colin');
    engine.checkIn(a.id, { method: 'geo', ...AT_CLUB });
    engine.checkIn(b.id, { method: 'code', code: 'BURHILL' });
    assert.ok(a.checkedInAt && b.checkedInAt);
    assert.throws(
      () => engine.checkIn(engine.registerPlayer('X').id, { method: 'code', code: 'WRONG' }),
      (e: EngineError) => e.code === 'bad_code',
    );
  });
});

describe('groups and the start list', () => {
  it('queues a single immediately', () => {
    const { engine } = makeEngine();
    const s = engine.openSession(SETTINGS);
    const p = checkedInPlayer(engine, 'Solo Sam');
    const g = engine.createGroup(s.id, p.id);
    assert.equal(g.status, 'queued');
    assert.equal(engine.getQueueView(s.id).entries.length, 1);
  });

  it('only enters the list when the last named invitee arrives', () => {
    const { engine } = makeEngine();
    const s = engine.openSession(SETTINGS);
    const a = checkedInPlayer(engine, 'Alice');
    const b = checkedInPlayer(engine, 'Bob');
    const c = checkedInPlayer(engine, 'Carol');
    const g = engine.createGroup(s.id, a.id, { inviteeNames: ['Bob', 'Carol'] });
    engine.joinGroup(g.joinCode, b.id);
    assert.equal(g.status, 'forming');
    assert.equal(engine.getQueueView(s.id).entries.length, 0);
    engine.joinGroup(g.joinCode, c.id);
    assert.equal(g.status, 'queued');
    assert.equal(engine.getQueueView(s.id).entries[0]!.playerNames.length, 3);
  });

  it('queue position is set by completed check-in, not first arrival', () => {
    const { engine, clock } = makeEngine();
    const s = engine.openSession(SETTINGS);
    const early = checkedInPlayer(engine, 'Early Ed');
    const g = engine.createGroup(s.id, early.id, { inviteeNames: ['Late Lou'] });
    clock.tick(60_000);
    const solo = checkedInPlayer(engine, 'Prompt Pat');
    engine.createGroup(s.id, solo.id);
    clock.tick(60_000);
    const late = checkedInPlayer(engine, 'Late Lou');
    engine.joinGroup(g.joinCode, late.id);

    const names = engine.getQueueView(s.id).entries.map((e) => e.playerNames[0]);
    assert.deepEqual(names, ['Prompt Pat', 'Early Ed']);
  });

  it('splits big groups into balanced consecutive waves', () => {
    const { engine } = makeEngine();
    const s = engine.openSession(SETTINGS);
    const players = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'].map((n) =>
      checkedInPlayer(engine, n),
    );
    const g = engine.createGroup(s.id, players[0]!.id, {
      inviteeNames: ['P2', 'P3', 'P4', 'P5', 'P6', 'P7'],
    });
    players.slice(1).forEach((p) => engine.joinGroup(g.joinCode, p.id));

    const entries = engine.getQueueView(s.id).entries;
    assert.equal(entries.length, 2);
    assert.deepEqual(entries.map((e) => e.playerNames.length), [4, 3]);
    assert.ok(entries.every((e) => e.groupId === g.id));
  });

  it('"go with who is here" queues a partial group and releases invitees', () => {
    const { engine } = makeEngine();
    const s = engine.openSession(SETTINGS);
    const a = checkedInPlayer(engine, 'A');
    const g = engine.createGroup(s.id, a.id, { inviteeNames: ['B', 'C', 'D'] });
    engine.goWithWhoIsHere(g.id, a.id);
    assert.equal(g.status, 'queued');
    assert.equal(g.invitees.length, 0);
  });

  it('shows forming groups on the board with who they wait for', () => {
    const { engine } = makeEngine();
    const s = engine.openSession(SETTINGS);
    const a = checkedInPlayer(engine, 'Tom');
    engine.createGroup(s.id, a.id, { inviteeNames: ['Dave', 'Bill'] });
    const view = engine.getQueueView(s.id);
    assert.equal(view.forming.length, 1);
    assert.deepEqual(view.forming[0]!.hereNames, ['Tom']);
    assert.deepEqual(view.forming[0]!.waitingForNames, ['Dave', 'Bill']);
    assert.equal(view.forming[0]!.openSpots, 1); // 4-ball minus Tom minus 2 invited
  });

  it('an open joiner can take spare capacity but never a reserved spot', () => {
    const { engine } = makeEngine();
    const s = engine.openSession(SETTINGS);
    const a = checkedInPlayer(engine, 'Tom');
    const g = engine.createGroup(s.id, a.id, { inviteeNames: ['Dave', 'Bill'] });

    const stranger = checkedInPlayer(engine, 'Stranger');
    engine.joinGroupById(g.id, stranger.id); // takes the one spare spot
    assert.equal(g.memberIds.length, 2);
    assert.deepEqual(g.invitees.map((i) => i.claimedBy), [null, null]);

    const another = checkedInPlayer(engine, 'Another');
    assert.throws(
      () => engine.joinGroupById(g.id, another.id),
      (e: EngineError) => e.code === 'group_full',
    );
    // Dave's reserved spot is still there for Dave.
    const dave = checkedInPlayer(engine, 'Dave');
    engine.joinGroup(g.joinCode, dave.id);
    assert.equal(g.invitees.find((i) => i.name === 'Dave')!.claimedBy, dave.id);
  });

  it('listJoinable flags groups expecting this player by name', () => {
    const { engine } = makeEngine();
    const s = engine.openSession(SETTINGS);
    const a = checkedInPlayer(engine, 'Tom');
    engine.createGroup(s.id, a.id, { inviteeNames: ['Dave'], openToJoiners: false });
    const { forming } = engine.listJoinable(s.id, 'dave');
    assert.equal(forming.length, 1);
    assert.equal(forming[0]!.expectingYou, true);
    // A stranger doesn't even see the closed group.
    assert.equal(engine.listJoinable(s.id, 'Nobody').forming.length, 0);
  });

  it('pro shop can merge two queued 2-balls into one 4-ball', () => {
    const { engine, clock } = makeEngine();
    const s = engine.openSession(SETTINGS);
    const a = checkedInPlayer(engine, 'A1');
    const gA = engine.createGroup(s.id, a.id, { inviteeNames: ['A2'] });
    engine.joinGroup(gA.joinCode, checkedInPlayer(engine, 'A2').id);
    clock.tick(60_000);
    const b = checkedInPlayer(engine, 'B1');
    const gB = engine.createGroup(s.id, b.id, { inviteeNames: ['B2'] });
    engine.joinGroup(gB.joinCode, checkedInPlayer(engine, 'B2').id);

    const merged = engine.mergeGroups(gB.id, gA.id);
    assert.equal(merged.id, gA.id); // earlier group keeps its position
    const entries = engine.getQueueView(s.id).entries;
    assert.equal(entries.length, 1);
    assert.deepEqual(entries[0]!.playerNames.sort(), ['A1', 'A2', 'B1', 'B2']);

    // A merged 4-ball cannot absorb anyone else.
    const c = checkedInPlayer(engine, 'C1');
    const gC = engine.createGroup(s.id, c.id);
    assert.throws(
      () => engine.mergeGroups(gA.id, gC.id),
      (e: EngineError) => e.code === 'group_full',
    );
  });

  it('lets a single join an open queued single (matchmaking)', () => {
    const { engine } = makeEngine();
    const s = engine.openSession(SETTINGS);
    const a = checkedInPlayer(engine, 'A');
    const g = engine.createGroup(s.id, a.id, { openToJoiners: true });
    const b = checkedInPlayer(engine, 'B');
    engine.joinGroup(g.joinCode, b.id);
    const entries = engine.getQueueView(s.id).entries;
    assert.equal(entries.length, 1);
    assert.equal(entries[0]!.playerNames.length, 2);
  });

  it('prevents being in two groups in one session', () => {
    const { engine } = makeEngine();
    const s = engine.openSession(SETTINGS);
    const a = checkedInPlayer(engine, 'A');
    engine.createGroup(s.id, a.id);
    assert.throws(
      () => engine.createGroup(s.id, a.id),
      (e: EngineError) => e.code === 'already_in_group',
    );
  });
});

describe('the tee', () => {
  it('call, player-confirmed tee-off at the tee, queue advances', () => {
    const { engine } = makeEngine();
    const s = engine.openSession(SETTINGS);
    const a = checkedInPlayer(engine, 'A');
    const b = checkedInPlayer(engine, 'B');
    engine.createGroup(s.id, a.id);
    engine.createGroup(s.id, b.id);

    const called = engine.callNext(s.id);
    assert.equal(called.playerIds[0], a.id);

    // Confirming from the car park is rejected; from the tee it works.
    assert.throws(
      () =>
        engine.confirmTeeOff(called.id, {
          method: 'player',
          playerId: a.id,
          ...AT_CLUB,
        }),
      (e: EngineError) => e.code === 'outside_geofence',
    );
    engine.confirmTeeOff(called.id, { method: 'player', playerId: a.id, ...AT_TEE });

    const view = engine.getQueueView(s.id);
    assert.equal(view.nowOnTee?.playerNames[0], 'A');
    assert.equal(view.entries.length, 1);
    assert.equal(view.entries[0]!.playerNames[0], 'B');
  });

  it('rejects tee-off confirmation from a non-member', () => {
    const { engine } = makeEngine();
    const s = engine.openSession(SETTINGS);
    const a = checkedInPlayer(engine, 'A');
    const stranger = checkedInPlayer(engine, 'S');
    engine.createGroup(s.id, a.id);
    const called = engine.callNext(s.id);
    assert.throws(
      () =>
        engine.confirmTeeOff(called.id, {
          method: 'player',
          playerId: stranger.id,
          ...AT_TEE,
        }),
      (e: EngineError) => e.code === 'forbidden',
    );
  });

  it('ETAs anchor to the last actual tee-off plus the interval', () => {
    const { engine, clock } = makeEngine();
    const s = engine.openSession(SETTINGS);
    const a = checkedInPlayer(engine, 'A');
    const b = checkedInPlayer(engine, 'B');
    const c = checkedInPlayer(engine, 'C');
    for (const p of [a, b, c]) engine.createGroup(s.id, p.id);

    const called = engine.callNext(s.id);
    const offAt = clock.tick(0);
    engine.confirmTeeOff(called.id, { method: 'admin' });

    const view = engine.getQueueView(s.id);
    const interval = 9 * 60_000;
    assert.equal(view.entries[0]!.estimatedTeeAt, offAt + interval);
    assert.equal(view.entries[1]!.estimatedTeeAt, offAt + 2 * interval);
  });

  it('no-show: demote drops back, remove takes off the list, grace enforced', () => {
    const { engine, clock } = makeEngine();
    const s = engine.openSession(SETTINGS);
    const names = ['A', 'B', 'C'];
    for (const n of names) engine.createGroup(s.id, checkedInPlayer(engine, n).id);

    const called = engine.callNext(s.id);
    assert.throws(
      () => engine.markNoShow(called.id, 'demote'),
      (e: EngineError) => e.code === 'grace_period',
    );
    clock.tick(6 * 60_000); // grace is 5 min
    engine.markNoShow(called.id, 'demote');
    assert.deepEqual(
      engine.getQueueView(s.id).entries.map((e) => e.playerNames[0]),
      ['B', 'C', 'A'],
    );

    const next = engine.callNext(s.id);
    engine.markNoShow(next.id, 'remove', { force: true });
    assert.deepEqual(
      engine.getQueueView(s.id).entries.map((e) => e.playerNames[0]),
      ['C', 'A'],
    );
  });

  it('admin can reorder the queue', () => {
    const { engine } = makeEngine();
    const s = engine.openSession(SETTINGS);
    for (const n of ['A', 'B', 'C']) {
      engine.createGroup(s.id, checkedInPlayer(engine, n).id);
    }
    const last = engine.getQueueView(s.id).entries[2]!;
    engine.moveSlot(s.id, last.slotId, 0);
    assert.deepEqual(
      engine.getQueueView(s.id).entries.map((e) => e.playerNames[0]),
      ['C', 'A', 'B'],
    );
  });
});

describe('sessions', () => {
  it('pausing (frost delay) blocks new queue activity but keeps order', () => {
    const { engine } = makeEngine();
    const s = engine.openSession(SETTINGS);
    engine.createGroup(s.id, checkedInPlayer(engine, 'A').id);
    engine.setSessionStatus(s.id, 'paused');
    assert.throws(
      () => engine.createGroup(s.id, checkedInPlayer(engine, 'B').id),
      (e: EngineError) => e.code === 'session_paused',
    );
    engine.setSessionStatus(s.id, 'open');
    assert.equal(engine.getQueueView(s.id).entries.length, 1);
  });

  it('two courses run independent queues', () => {
    const { engine } = makeEngine();
    const oldS = engine.openSession(SETTINGS);
    const newS = engine.openSession({ ...SETTINGS, courseId: 'new' });
    engine.createGroup(oldS.id, checkedInPlayer(engine, 'Old Olly').id);
    engine.createGroup(newS.id, checkedInPlayer(engine, 'New Nora').id);
    assert.equal(engine.getQueueView(oldS.id).entries.length, 1);
    assert.equal(engine.getQueueView(newS.id).entries.length, 1);
    assert.throws(
      () => engine.openSession(SETTINGS),
      (e: EngineError) => e.code === 'session_exists',
    );
  });
});

describe('draw mode', () => {
  it('draws the pool into balanced random groups', () => {
    const { engine } = makeEngine();
    const s = engine.openSession({ ...SETTINGS, mode: 'draw' });
    for (let i = 1; i <= 9; i++) {
      engine.joinDraw(s.id, checkedInPlayer(engine, `P${i}`).id);
    }
    assert.throws(
      () => engine.createGroup(s.id, checkedInPlayer(engine, 'X').id),
      (e: EngineError) => e.code === 'draw_mode',
    );
    const groups = engine.runDraw(s.id, () => 0.5);
    assert.equal(groups.length, 3);
    const entries = engine.getQueueView(s.id).entries;
    assert.deepEqual(entries.map((e) => e.playerNames.length), [3, 3, 3]);
    assert.equal(s.drawPool.length, 0);
  });
});

describe('splitIntoWaves', () => {
  it('balances waves', () => {
    assert.deepEqual(splitIntoWaves([1, 2, 3, 4], 4), [[1, 2, 3, 4]]);
    assert.deepEqual(splitIntoWaves([1, 2, 3, 4, 5, 6, 7], 4).map((w) => w.length), [4, 3]);
    assert.deepEqual(splitIntoWaves([1, 2, 3, 4, 5], 4).map((w) => w.length), [3, 2]);
    assert.deepEqual(
      splitIntoWaves([1, 2, 3, 4, 5, 6, 7, 8, 9], 4).map((w) => w.length),
      [3, 3, 3],
    );
  });
});

describe('persistence', () => {
  it('round-trips state through JSON', () => {
    const { engine } = makeEngine();
    const s = engine.openSession(SETTINGS);
    engine.createGroup(s.id, checkedInPlayer(engine, 'A').id);
    const restored = new RollupEngine(CLUB, {
      restore: JSON.parse(JSON.stringify(engine.toJSON())),
    });
    assert.equal(restored.getQueueView(s.id).entries.length, 1);
  });

  it('migrates state saved by an older version (missing new fields)', () => {
    const { engine } = makeEngine();
    const s = engine.openSession(SETTINGS);
    engine.createGroup(s.id, checkedInPlayer(engine, 'A').id);
    const old = JSON.parse(JSON.stringify(engine.toJSON()));
    // Simulate pre-invitee schema.
    for (const g of Object.values(old.groups)) delete (g as any).invitees;
    for (const sess of Object.values(old.sessions)) delete (sess as any).drawPool;
    const restored = new RollupEngine(CLUB, { restore: old });
    const view = restored.getQueueView(s.id); // must not throw
    assert.equal(view.entries.length, 1);
    assert.deepEqual(view.forming, []);
  });
});
