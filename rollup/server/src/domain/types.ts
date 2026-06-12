export type SessionMode = 'arrival' | 'draw';

export interface GeoFence {
  lat: number;
  lng: number;
  radiusM: number;
}

export interface Course {
  id: string;
  name: string;
}

export interface ClubConfig {
  name: string;
  courses: Course[];
  /** Players must be inside this fence (or use the QR code) to check in. */
  clubGeofence: GeoFence;
  /** "We're off" taps are only accepted from inside this fence. */
  teeGeofence: GeoFence;
  /** Rotating code printed on the QR poster in the pro shop / locker room. */
  checkInCode: string;
}

export interface SessionSettings {
  courseId: string;
  mode: SessionMode;
  teeIntervalMin: number;
  maxGroupSize: 2 | 3 | 4;
  /** Minutes a called group has to reach the tee before it can be skipped. */
  graceMin: number;
}

export type SessionStatus = 'open' | 'paused' | 'closed';

export interface Session {
  id: string;
  status: SessionStatus;
  settings: SessionSettings;
  openedAt: number;
  /** Set when the last confirmed tee-off happened; anchors ETA calculation. */
  lastTeeOffAt: number | null;
  /** Draw mode only: checked-in players waiting for the random draw. */
  drawPool: string[];
}

export interface Player {
  id: string;
  name: string;
  isGuest: boolean;
  checkedInAt: number | null;
  checkInMethod: 'geo' | 'code' | 'admin' | null;
}

export type GroupStatus = 'forming' | 'queued' | 'done' | 'withdrawn';

export interface Group {
  id: string;
  sessionId: string;
  name: string;
  creatorId: string;
  /** Checked-in players who have joined. */
  memberIds: string[];
  /** Total players the creator expects; group auto-queues when reached. */
  expectedSize: number;
  /** Short code friends type to join this group. */
  joinCode: string;
  /** Singles/pairs can opt in to being merged with others. */
  openToJoiners: boolean;
  status: GroupStatus;
  createdAt: number;
  queuedAt: number | null;
}

export type SlotStatus = 'queued' | 'called' | 'teed_off' | 'no_show' | 'removed';

/**
 * One tee slot on the start list. Groups larger than maxGroupSize occupy
 * several consecutive slots (waves) and keep their group identity.
 */
export interface TeeSlot {
  id: string;
  sessionId: string;
  groupId: string;
  /** 0-based wave index within the group (0 unless the group was split). */
  wave: number;
  playerIds: string[];
  status: SlotStatus;
  calledAt: number | null;
  teedOffAt: number | null;
}

export interface AuditEvent {
  at: number;
  type: string;
  detail: Record<string, unknown>;
}

export interface EngineState {
  club: ClubConfig;
  sessions: Record<string, Session>;
  players: Record<string, Player>;
  groups: Record<string, Group>;
  slots: Record<string, TeeSlot>;
  /** Ordered start list per session (slot ids, queued/called only). */
  queues: Record<string, string[]>;
  events: AuditEvent[];
}

/** A queued slot with its computed estimated tee time, for boards/apps. */
export interface QueueEntryView {
  slotId: string;
  groupId: string;
  groupName: string;
  wave: number;
  waveCount: number;
  playerNames: string[];
  status: SlotStatus;
  position: number;
  estimatedTeeAt: number;
  calledAt: number | null;
}

export interface QueueView {
  sessionId: string;
  courseName: string;
  sessionStatus: SessionStatus;
  teeIntervalMin: number;
  nowOnTee: QueueEntryView | null;
  entries: QueueEntryView[];
}
