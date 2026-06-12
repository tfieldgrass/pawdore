import { randomUUID } from 'node:crypto';
import { insideFence } from './geo.ts';
import type {
  AuditEvent,
  ClubConfig,
  EngineState,
  Group,
  Player,
  QueueEntryView,
  QueueView,
  Session,
  SessionSettings,
  SlotStatus,
  TeeSlot,
} from './types.ts';

export class EngineError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export type Clock = () => number;

export interface CheckInProof {
  method: 'geo' | 'code' | 'admin';
  lat?: number;
  lng?: number;
  code?: string;
}

const MIN_PER_MS = 60_000;

export class RollupEngine {
  private state: EngineState;
  private now: Clock;
  private newId: () => string;

  constructor(
    club: ClubConfig,
    opts: { now?: Clock; newId?: () => string; restore?: EngineState } = {},
  ) {
    this.now = opts.now ?? Date.now;
    this.newId = opts.newId ?? randomUUID;
    this.state = opts.restore ?? {
      club,
      sessions: {},
      players: {},
      groups: {},
      slots: {},
      queues: {},
      events: [],
    };
  }

  // ---- persistence -------------------------------------------------------

  toJSON(): EngineState {
    return this.state;
  }

  get club(): ClubConfig {
    return this.state.club;
  }

  updateClub(patch: Partial<ClubConfig>): ClubConfig {
    this.state.club = { ...this.state.club, ...patch };
    this.log('club.updated', { patch });
    return this.state.club;
  }

  // ---- players -----------------------------------------------------------

  registerPlayer(name: string, isGuest = false): Player {
    const trimmed = name.trim();
    if (!trimmed) throw new EngineError('invalid_name', 'Player name required');
    const player: Player = {
      id: this.newId(),
      name: trimmed,
      isGuest,
      checkedInAt: null,
      checkInMethod: null,
    };
    this.state.players[player.id] = player;
    this.log('player.registered', { playerId: player.id, name: trimmed });
    return player;
  }

  getPlayer(playerId: string): Player {
    const p = this.state.players[playerId];
    if (!p) throw new EngineError('not_found', 'Unknown player');
    return p;
  }

  /**
   * Check a player in at the club. Geo check-ins must be inside the club
   * geofence; code check-ins must quote the QR poster code. Admin check-in
   * is the kiosk / pro-shop path for players without a phone.
   */
  checkIn(playerId: string, proof: CheckInProof): Player {
    const player = this.getPlayer(playerId);
    if (player.checkedInAt !== null) return player;

    if (proof.method === 'geo') {
      if (proof.lat === undefined || proof.lng === undefined) {
        throw new EngineError('bad_proof', 'Location required for geo check-in');
      }
      if (!insideFence(this.state.club.clubGeofence, proof.lat, proof.lng)) {
        throw new EngineError(
          'outside_geofence',
          'You need to be at the club to join the roll-up',
        );
      }
    } else if (proof.method === 'code') {
      if (proof.code !== this.state.club.checkInCode) {
        throw new EngineError('bad_code', 'Check-in code not recognised');
      }
    }

    player.checkedInAt = this.now();
    player.checkInMethod = proof.method;
    this.log('player.checked_in', { playerId, method: proof.method });
    return player;
  }

  private requireCheckedIn(playerId: string): Player {
    const p = this.getPlayer(playerId);
    if (p.checkedInAt === null) {
      throw new EngineError('not_checked_in', 'Check in at the club first');
    }
    return p;
  }

  // ---- sessions ----------------------------------------------------------

  openSession(settings: SessionSettings): Session {
    if (!this.state.club.courses.some((c) => c.id === settings.courseId)) {
      throw new EngineError('not_found', 'Unknown course');
    }
    const existing = this.activeSessionForCourse(settings.courseId);
    if (existing) {
      throw new EngineError(
        'session_exists',
        'A session is already open for this course',
      );
    }
    const session: Session = {
      id: this.newId(),
      status: 'open',
      settings,
      openedAt: this.now(),
      lastTeeOffAt: null,
      drawPool: [],
    };
    this.state.sessions[session.id] = session;
    this.state.queues[session.id] = [];
    this.log('session.opened', { sessionId: session.id, settings });
    return session;
  }

  getSession(sessionId: string): Session {
    const s = this.state.sessions[sessionId];
    if (!s) throw new EngineError('not_found', 'Unknown session');
    return s;
  }

  activeSessionForCourse(courseId: string): Session | null {
    return (
      Object.values(this.state.sessions).find(
        (s) => s.settings.courseId === courseId && s.status !== 'closed',
      ) ?? null
    );
  }

  activeSessions(): Session[] {
    return Object.values(this.state.sessions).filter((s) => s.status !== 'closed');
  }

  setSessionStatus(sessionId: string, status: 'open' | 'paused' | 'closed'): Session {
    const session = this.getSession(sessionId);
    session.status = status;
    this.log('session.status', { sessionId, status });
    return session;
  }

  updateSessionSettings(sessionId: string, patch: Partial<SessionSettings>): Session {
    const session = this.getSession(sessionId);
    if (patch.courseId && patch.courseId !== session.settings.courseId) {
      throw new EngineError('invalid', 'Cannot move a session between courses');
    }
    session.settings = { ...session.settings, ...patch };
    this.log('session.settings', { sessionId, patch });
    return session;
  }

  // ---- groups ------------------------------------------------------------

  createGroup(
    sessionId: string,
    creatorId: string,
    opts: { name?: string; expectedSize?: number; openToJoiners?: boolean } = {},
  ): Group {
    const session = this.requireOpenSession(sessionId);
    if (session.settings.mode === 'draw') {
      throw new EngineError('draw_mode', 'This session uses a random draw — join the draw instead');
    }
    const creator = this.requireCheckedIn(creatorId);
    this.requireNotInActiveGroup(sessionId, creatorId);

    const expectedSize = Math.max(1, Math.floor(opts.expectedSize ?? 1));
    const group: Group = {
      id: this.newId(),
      sessionId,
      name: opts.name?.trim() || `${creator.name}'s group`,
      creatorId,
      memberIds: [creatorId],
      expectedSize,
      joinCode: this.makeJoinCode(),
      openToJoiners: opts.openToJoiners ?? expectedSize === 1,
      status: 'forming',
      createdAt: this.now(),
      queuedAt: null,
    };
    this.state.groups[group.id] = group;
    this.log('group.created', { groupId: group.id, sessionId, creatorId, expectedSize });

    if (group.memberIds.length >= group.expectedSize) this.queueGroup(group);
    return group;
  }

  /**
   * Join a forming group by code, or an already-queued group that is open
   * to joiners and still has room in a single slot (singles matchmaking).
   */
  joinGroup(joinCode: string, playerId: string): Group {
    this.requireCheckedIn(playerId);
    const group = Object.values(this.state.groups).find(
      (g) =>
        g.joinCode === joinCode.toUpperCase() &&
        (g.status === 'forming' || g.status === 'queued'),
    );
    if (!group) throw new EngineError('not_found', 'No joinable group with that code');
    this.requireNotInActiveGroup(group.sessionId, playerId);

    const session = this.requireOpenSession(group.sessionId);

    if (group.status === 'forming') {
      group.memberIds.push(playerId);
      this.log('group.joined', { groupId: group.id, playerId });
      if (group.memberIds.length >= group.expectedSize) this.queueGroup(group);
      return group;
    }

    // Queued group: only if open to joiners, single wave, with room.
    if (!group.openToJoiners) {
      throw new EngineError('group_closed', 'That group is already on the start list');
    }
    const slots = this.slotsForGroup(group.id).filter((s) => s.status === 'queued');
    if (slots.length !== 1) {
      throw new EngineError('group_closed', 'That group can no longer be joined');
    }
    const slot = slots[0]!;
    if (slot.playerIds.length >= session.settings.maxGroupSize) {
      throw new EngineError('group_full', 'That group is full');
    }
    group.memberIds.push(playerId);
    slot.playerIds.push(playerId);
    this.log('group.joined_queued', { groupId: group.id, playerId, slotId: slot.id });
    return group;
  }

  /** "Go with who's here" — queue a forming group before everyone arrives. */
  goWithWhoIsHere(groupId: string, byPlayerId: string): Group {
    const group = this.getGroup(groupId);
    if (group.status !== 'forming') {
      throw new EngineError('invalid', 'Group is not waiting for players');
    }
    if (group.creatorId !== byPlayerId) {
      throw new EngineError('forbidden', 'Only the group creator can do that');
    }
    group.expectedSize = group.memberIds.length;
    this.queueGroup(group);
    return group;
  }

  withdrawGroup(groupId: string, byPlayerId: string | null): Group {
    const group = this.getGroup(groupId);
    if (byPlayerId !== null && group.creatorId !== byPlayerId) {
      throw new EngineError('forbidden', 'Only the group creator can withdraw it');
    }
    if (group.status === 'done') {
      throw new EngineError('invalid', 'Group has already played');
    }
    group.status = 'withdrawn';
    for (const slot of this.slotsForGroup(groupId)) {
      if (slot.status === 'queued' || slot.status === 'called') {
        slot.status = 'removed';
        this.removeFromQueue(group.sessionId, slot.id);
      }
    }
    this.log('group.withdrawn', { groupId, byPlayerId });
    return group;
  }

  getGroup(groupId: string): Group {
    const g = this.state.groups[groupId];
    if (!g) throw new EngineError('not_found', 'Unknown group');
    return g;
  }

  activeGroupForPlayer(sessionId: string, playerId: string): Group | null {
    return (
      Object.values(this.state.groups).find(
        (g) =>
          g.sessionId === sessionId &&
          g.memberIds.includes(playerId) &&
          (g.status === 'forming' || g.status === 'queued'),
      ) ?? null
    );
  }

  private requireNotInActiveGroup(sessionId: string, playerId: string): void {
    if (this.activeGroupForPlayer(sessionId, playerId)) {
      throw new EngineError('already_in_group', 'Already in a group for this session');
    }
    const session = this.getSession(sessionId);
    if (session.drawPool.includes(playerId)) {
      throw new EngineError('already_in_group', 'Already in the draw for this session');
    }
  }

  /**
   * Put a group on the start list. Groups bigger than the session's max
   * ball size are split into balanced consecutive waves (7 -> 4+3, 9 -> 3+3+3)
   * so the group plays back-to-back.
   */
  private queueGroup(group: Group): void {
    const session = this.requireOpenSession(group.sessionId);
    const waves = splitIntoWaves(group.memberIds, session.settings.maxGroupSize);
    group.status = 'queued';
    group.queuedAt = this.now();

    waves.forEach((playerIds, wave) => {
      const slot: TeeSlot = {
        id: this.newId(),
        sessionId: group.sessionId,
        groupId: group.id,
        wave,
        playerIds,
        status: 'queued',
        calledAt: null,
        teedOffAt: null,
      };
      this.state.slots[slot.id] = slot;
      this.queue(group.sessionId).push(slot.id);
    });
    this.log('group.queued', { groupId: group.id, waves: waves.length });
  }

  // ---- draw mode ---------------------------------------------------------

  joinDraw(sessionId: string, playerId: string): Session {
    const session = this.requireOpenSession(sessionId);
    if (session.settings.mode !== 'draw') {
      throw new EngineError('invalid', 'Session is not in draw mode');
    }
    this.requireCheckedIn(playerId);
    this.requireNotInActiveGroup(sessionId, playerId);
    session.drawPool.push(playerId);
    this.log('draw.joined', { sessionId, playerId });
    return session;
  }

  /** Shuffle the draw pool into groups and queue them. Admin action. */
  runDraw(sessionId: string, random: () => number = Math.random): Group[] {
    const session = this.requireOpenSession(sessionId);
    if (session.settings.mode !== 'draw') {
      throw new EngineError('invalid', 'Session is not in draw mode');
    }
    if (session.drawPool.length === 0) {
      throw new EngineError('invalid', 'Nobody in the draw');
    }
    const pool = [...session.drawPool];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    session.drawPool = [];

    const waves = splitIntoWaves(pool, session.settings.maxGroupSize);
    const groups: Group[] = [];
    waves.forEach((memberIds, i) => {
      const group: Group = {
        id: this.newId(),
        sessionId,
        name: `Draw group ${i + 1}`,
        creatorId: memberIds[0]!,
        memberIds,
        expectedSize: memberIds.length,
        joinCode: this.makeJoinCode(),
        openToJoiners: false,
        status: 'forming',
        createdAt: this.now(),
        queuedAt: null,
      };
      this.state.groups[group.id] = group;
      this.queueGroup(group);
      groups.push(group);
    });
    this.log('draw.run', { sessionId, players: pool.length, groups: groups.length });
    return groups;
  }

  // ---- the tee -----------------------------------------------------------

  /** Call the next queued slot to the tee (push + board highlight upstream). */
  callNext(sessionId: string): TeeSlot {
    this.requireOpenSession(sessionId);
    const next = this.orderedSlots(sessionId).find((s) => s.status === 'queued');
    if (!next) throw new EngineError('queue_empty', 'Nobody waiting');
    next.status = 'called';
    next.calledAt = this.now();
    this.log('slot.called', { slotId: next.id, groupId: next.groupId });
    return next;
  }

  /**
   * Confirm a group has teed off and advance the queue. Player-confirmed
   * (virtual starter) taps must come from a member of the slot inside the
   * tee geofence; admin/starter confirmations are always accepted.
   */
  confirmTeeOff(
    slotId: string,
    by: { method: 'admin' } | { method: 'player'; playerId: string; lat: number; lng: number },
  ): TeeSlot {
    const slot = this.getSlot(slotId);
    if (slot.status !== 'called' && slot.status !== 'queued') {
      throw new EngineError('invalid', 'Slot is not on the tee');
    }
    if (slot.status === 'queued' && this.orderedSlots(slot.sessionId)[0]?.id !== slotId) {
      throw new EngineError('not_your_turn', 'Slot is not at the front of the queue');
    }
    if (by.method === 'player') {
      if (!slot.playerIds.includes(by.playerId)) {
        throw new EngineError('forbidden', 'Not a member of this group');
      }
      if (!insideFence(this.state.club.teeGeofence, by.lat, by.lng)) {
        throw new EngineError('outside_geofence', 'You need to be at the tee to confirm');
      }
    }
    const session = this.getSession(slot.sessionId);
    slot.status = 'teed_off';
    slot.teedOffAt = this.now();
    session.lastTeeOffAt = slot.teedOffAt;
    this.removeFromQueue(slot.sessionId, slot.id);
    this.finishGroupIfDone(slot.groupId);
    this.log('slot.teed_off', { slotId, groupId: slot.groupId, by: by.method });
    return slot;
  }

  /**
   * Handle a called group that never showed. 'demote' drops them back a few
   * places (default 2); 'remove' takes them off the list. Admin can force
   * before the grace period elapses.
   */
  markNoShow(
    slotId: string,
    action: 'demote' | 'remove',
    opts: { demoteBy?: number; force?: boolean } = {},
  ): TeeSlot {
    const slot = this.getSlot(slotId);
    if (slot.status !== 'called') {
      throw new EngineError('invalid', 'Slot has not been called');
    }
    const session = this.getSession(slot.sessionId);
    const graceMs = session.settings.graceMin * MIN_PER_MS;
    if (!opts.force && this.now() - (slot.calledAt ?? 0) < graceMs) {
      throw new EngineError('grace_period', 'Grace period has not elapsed');
    }
    if (action === 'remove') {
      slot.status = 'no_show';
      this.removeFromQueue(slot.sessionId, slot.id);
      this.finishGroupIfDone(slot.groupId);
    } else {
      slot.status = 'queued';
      slot.calledAt = null;
      const queue = this.queue(slot.sessionId);
      const from = queue.indexOf(slot.id);
      queue.splice(from, 1);
      queue.splice(Math.min(from + (opts.demoteBy ?? 2), queue.length), 0, slot.id);
    }
    this.log('slot.no_show', { slotId, action });
    return slot;
  }

  /** Admin: move a slot to a new position in the queue. Logged for audit. */
  moveSlot(sessionId: string, slotId: string, newIndex: number): void {
    const queue = this.queue(sessionId);
    const from = queue.indexOf(slotId);
    if (from === -1) throw new EngineError('not_found', 'Slot not in queue');
    queue.splice(from, 1);
    queue.splice(Math.max(0, Math.min(newIndex, queue.length)), 0, slotId);
    this.log('slot.moved', { sessionId, slotId, from, to: newIndex });
  }

  /** Admin: remove a slot outright (e.g. players went home). */
  removeSlot(slotId: string): TeeSlot {
    const slot = this.getSlot(slotId);
    if (slot.status !== 'queued' && slot.status !== 'called') {
      throw new EngineError('invalid', 'Slot is not on the start list');
    }
    slot.status = 'removed';
    this.removeFromQueue(slot.sessionId, slot.id);
    this.finishGroupIfDone(slot.groupId);
    this.log('slot.removed', { slotId });
    return slot;
  }

  // ---- views -------------------------------------------------------------

  /**
   * Board/app view: who's on the tee, who's called, the queue, and
   * estimated tee times anchored to the last actual tee-off.
   */
  getQueueView(sessionId: string): QueueView {
    const session = this.getSession(sessionId);
    const course = this.state.club.courses.find(
      (c) => c.id === session.settings.courseId,
    );
    const intervalMs = session.settings.teeIntervalMin * MIN_PER_MS;
    const now = this.now();
    const anchor = session.lastTeeOffAt
      ? Math.max(now, session.lastTeeOffAt + intervalMs)
      : now;

    const entries: QueueEntryView[] = this.orderedSlots(sessionId).map((slot, i) => {
      const group = this.getGroup(slot.groupId);
      const waveCount = this.slotsForGroup(group.id).length;
      return {
        slotId: slot.id,
        groupId: group.id,
        groupName: group.name,
        wave: slot.wave,
        waveCount,
        playerNames: slot.playerIds.map((id) => this.getPlayer(id).name),
        status: slot.status,
        position: i + 1,
        estimatedTeeAt: anchor + i * intervalMs,
        calledAt: slot.calledAt,
      };
    });

    const lastOff = Object.values(this.state.slots)
      .filter((s) => s.sessionId === sessionId && s.status === 'teed_off')
      .sort((a, b) => (b.teedOffAt ?? 0) - (a.teedOffAt ?? 0))[0];

    return {
      sessionId,
      courseName: course?.name ?? 'Course',
      sessionStatus: session.status,
      teeIntervalMin: session.settings.teeIntervalMin,
      nowOnTee: lastOff
        ? {
            slotId: lastOff.id,
            groupId: lastOff.groupId,
            groupName: this.getGroup(lastOff.groupId).name,
            wave: lastOff.wave,
            waveCount: this.slotsForGroup(lastOff.groupId).length,
            playerNames: lastOff.playerIds.map((id) => this.getPlayer(id).name),
            status: lastOff.status,
            position: 0,
            estimatedTeeAt: lastOff.teedOffAt ?? 0,
            calledAt: lastOff.calledAt,
          }
        : null,
      entries,
    };
  }

  events(limit = 100): AuditEvent[] {
    return this.state.events.slice(-limit);
  }

  // ---- internals ---------------------------------------------------------

  private getSlot(slotId: string): TeeSlot {
    const s = this.state.slots[slotId];
    if (!s) throw new EngineError('not_found', 'Unknown slot');
    return s;
  }

  private slotsForGroup(groupId: string): TeeSlot[] {
    return Object.values(this.state.slots)
      .filter((s) => s.groupId === groupId)
      .sort((a, b) => a.wave - b.wave);
  }

  private finishGroupIfDone(groupId: string): void {
    const group = this.getGroup(groupId);
    const open = this.slotsForGroup(groupId).some(
      (s) => s.status === 'queued' || s.status === 'called',
    );
    if (!open && group.status === 'queued') group.status = 'done';
  }

  private queue(sessionId: string): string[] {
    const q = this.state.queues[sessionId];
    if (!q) throw new EngineError('not_found', 'Unknown session');
    return q;
  }

  private orderedSlots(sessionId: string): TeeSlot[] {
    return this.queue(sessionId).map((id) => this.getSlot(id));
  }

  private removeFromQueue(sessionId: string, slotId: string): void {
    const queue = this.queue(sessionId);
    const i = queue.indexOf(slotId);
    if (i !== -1) queue.splice(i, 1);
  }

  private requireOpenSession(sessionId: string): Session {
    const session = this.getSession(sessionId);
    if (session.status === 'closed') {
      throw new EngineError('session_closed', 'Session is closed');
    }
    if (session.status === 'paused') {
      throw new EngineError('session_paused', 'Session is paused (e.g. frost delay)');
    }
    return session;
  }

  private makeJoinCode(): string {
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    const taken = Object.values(this.state.groups).some(
      (g) => g.joinCode === code && (g.status === 'forming' || g.status === 'queued'),
    );
    return taken ? this.makeJoinCode() : code;
  }

  private log(type: string, detail: Record<string, unknown>): void {
    this.state.events.push({ at: this.now(), type, detail });
  }
}

/**
 * Split players into balanced consecutive waves no bigger than maxSize:
 * 7 with max 4 -> [4,3]; 9 with max 4 -> [3,3,3]; 4 -> [4].
 */
export function splitIntoWaves<T>(players: T[], maxSize: number): T[][] {
  const waveCount = Math.max(1, Math.ceil(players.length / maxSize));
  const base = Math.floor(players.length / waveCount);
  const remainder = players.length - base * waveCount;
  const waves: T[][] = [];
  let cursor = 0;
  for (let w = 0; w < waveCount; w++) {
    const size = base + (w < remainder ? 1 : 0);
    waves.push(players.slice(cursor, cursor + size));
    cursor += size;
  }
  return waves;
}
