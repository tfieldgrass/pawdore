import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { EngineError, RollupEngine } from './domain/engine.ts';
import type { QueueView, SessionSettings } from './domain/types.ts';
import { VERSION } from './version.ts';

export interface ApiContext {
  engine: RollupEngine;
  tokens: Record<string, string>;
  adminKey: string;
  /** Called after any successful mutation: persist + broadcast. */
  onMutation: () => void;
}

type Handler = (req: ApiRequest) => Promise<unknown> | unknown;

interface ApiRequest {
  params: Record<string, string>;
  query: URLSearchParams;
  body: any;
  playerId: string | null;
  isAdmin: boolean;
}

interface Route {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: Handler;
  mutates: boolean;
  auth: 'none' | 'player' | 'admin';
}

export class Api {
  private routes: Route[] = [];

  constructor(private ctx: ApiContext) {
    this.defineRoutes();
  }

  private add(
    method: string,
    path: string,
    auth: Route['auth'],
    mutates: boolean,
    handler: Handler,
  ) {
    const keys: string[] = [];
    const pattern = new RegExp(
      '^' +
        path.replace(/:[^/]+/g, (m) => {
          keys.push(m.slice(1));
          return '([^/]+)';
        }) +
        '$',
    );
    this.routes.push({ method, pattern, keys, handler, mutates, auth });
  }

  private defineRoutes() {
    const { engine } = this.ctx;

    // ---- public ----
    this.add('GET', '/api/health', 'none', false, () => ({
      ok: true,
      version: VERSION,
      club: engine.club.name,
    }));

    this.add('GET', '/api/queues', 'none', false, () => this.allQueues());
    this.add('GET', '/api/club', 'none', false, () => ({
      name: engine.club.name,
      courses: engine.club.courses,
      sessions: engine.activeSessions().map((s) => ({
        id: s.id,
        courseId: s.settings.courseId,
        mode: s.settings.mode,
        status: s.status,
      })),
    }));

    // ---- player ----
    this.add('POST', '/api/players', 'none', true, (req) => {
      const player = engine.registerPlayer(String(req.body?.name ?? ''), !!req.body?.isGuest);
      const token = randomBytes(24).toString('hex');
      this.ctx.tokens[token] = player.id;
      return { player, token };
    });

    this.add('POST', '/api/checkin', 'player', true, (req) =>
      engine.checkIn(req.playerId!, {
        method: req.body?.method === 'code' ? 'code' : 'geo',
        lat: numOrUndef(req.body?.lat),
        lng: numOrUndef(req.body?.lng),
        code: req.body?.code ? String(req.body.code).trim().toUpperCase() : undefined,
      }),
    );

    this.add('GET', '/api/me', 'player', false, (req) => this.meView(req.playerId!));

    this.add('POST', '/api/groups', 'player', true, (req) =>
      engine.createGroup(String(req.body?.sessionId), req.playerId!, {
        name: req.body?.name ? String(req.body.name) : undefined,
        inviteeNames: Array.isArray(req.body?.inviteeNames)
          ? req.body.inviteeNames.map(String)
          : [],
        openToJoiners: req.body?.openToJoiners,
      }),
    );

    this.add('POST', '/api/groups/join', 'player', true, (req) =>
      engine.joinGroup(String(req.body?.joinCode ?? ''), req.playerId!),
    );

    // Open groups a single can join from the list — no code needed.
    this.add('GET', '/api/sessions/:id/joinable', 'player', false, (req) =>
      engine.listJoinable(req.params.id!, engine.getPlayer(req.playerId!).name),
    );

    this.add('POST', '/api/groups/:id/join-open', 'player', true, (req) =>
      engine.joinGroupById(req.params.id!, req.playerId!),
    );

    this.add('POST', '/api/groups/:id/go', 'player', true, (req) =>
      engine.goWithWhoIsHere(req.params.id!, req.playerId!),
    );

    this.add('POST', '/api/groups/:id/withdraw', 'player', true, (req) =>
      engine.withdrawGroup(req.params.id!, req.playerId!),
    );

    this.add('POST', '/api/groups/:id/leave', 'player', true, (req) =>
      engine.leaveGroup(req.params.id!, req.playerId!),
    );

    this.add('POST', '/api/draw/join', 'player', true, (req) =>
      engine.joinDraw(String(req.body?.sessionId), req.playerId!),
    );

    // Virtual starter: a member of the slot confirms tee-off from the tee.
    this.add('POST', '/api/slots/:id/tee-off', 'player', true, (req) =>
      engine.confirmTeeOff(req.params.id!, {
        method: 'player',
        playerId: req.playerId!,
        lat: Number(req.body?.lat),
        lng: Number(req.body?.lng),
      }),
    );

    // ---- admin ----
    this.add('GET', '/api/admin/state', 'admin', false, () => ({
      club: engine.club,
      sessions: engine.activeSessions(),
      queues: this.allQueues(),
      events: engine.events(50),
    }));

    this.add('POST', '/api/admin/sessions', 'admin', true, (req) =>
      engine.openSession(sessionSettings(req.body)),
    );

    this.add('PATCH', '/api/admin/sessions/:id', 'admin', true, (req) => {
      if (req.body?.status) {
        engine.setSessionStatus(req.params.id!, req.body.status);
      }
      if (req.body?.settings) {
        engine.updateSessionSettings(req.params.id!, req.body.settings);
      }
      return engine.getSession(req.params.id!);
    });

    this.add('POST', '/api/admin/sessions/:id/call-next', 'admin', true, (req) =>
      engine.callNext(req.params.id!),
    );

    this.add('POST', '/api/admin/sessions/:id/draw', 'admin', true, (req) =>
      engine.runDraw(req.params.id!),
    );

    this.add('POST', '/api/admin/slots/:id/tee-off', 'admin', true, (req) =>
      engine.confirmTeeOff(req.params.id!, { method: 'admin' }),
    );

    this.add('POST', '/api/admin/slots/:id/no-show', 'admin', true, (req) =>
      engine.markNoShow(req.params.id!, req.body?.action === 'remove' ? 'remove' : 'demote', {
        force: !!req.body?.force,
      }),
    );

    this.add('POST', '/api/admin/slots/:id/move', 'admin', true, (req) => {
      engine.moveSlot(String(req.body?.sessionId), req.params.id!, Number(req.body?.index));
      return { ok: true };
    });

    this.add('DELETE', '/api/admin/slots/:id', 'admin', true, (req) =>
      engine.removeSlot(req.params.id!),
    );

    // Kiosk / pro-shop: register + check in a player with no phone, and
    // optionally queue them straight away as a single.
    this.add('POST', '/api/admin/players', 'admin', true, (req) => {
      const player = engine.registerPlayer(String(req.body?.name ?? ''), !!req.body?.isGuest);
      engine.checkIn(player.id, { method: 'admin' });
      if (req.body?.sessionId) {
        engine.createGroup(String(req.body.sessionId), player.id, {
          openToJoiners: !!req.body?.openToJoiners,
        });
      }
      return player;
    });

    // Pro shop: merge two queued groups (e.g. two 2-balls into a 4-ball).
    this.add('POST', '/api/admin/groups/merge', 'admin', true, (req) =>
      engine.mergeGroups(String(req.body?.groupIdA), String(req.body?.groupIdB)),
    );

    this.add('PATCH', '/api/admin/club', 'admin', true, (req) =>
      engine.updateClub(req.body ?? {}),
    );
  }

  private allQueues(): QueueView[] {
    return this.ctx.engine.activeSessions().map((s) => this.ctx.engine.getQueueView(s.id));
  }

  private meView(playerId: string) {
    const { engine } = this.ctx;
    const player = engine.refreshCheckIn(playerId);
    const result: any = { player, group: null, slots: [] };
    for (const session of engine.activeSessions()) {
      const group = engine.activeGroupForPlayer(session.id, playerId);
      const inDraw = session.drawPool.includes(playerId);
      if (group || inDraw) {
        const view = engine.getQueueView(session.id);
        result.group = group;
        result.inDraw = inDraw;
        result.sessionId = session.id;
        result.courseName = view.courseName;
        result.slots = group
          ? view.entries.filter((e) => e.groupId === group.id)
          : [];
        break;
      }
    }
    return result;
  }

  async handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url ?? '/', 'http://local');
    if (!url.pathname.startsWith('/api/')) return false;

    const route = this.routes.find(
      (r) => r.method === req.method && r.pattern.test(url.pathname),
    );
    if (!route) {
      send(res, 404, { error: 'not_found', message: 'No such endpoint' });
      return true;
    }

    const isAdmin = req.headers['x-admin-key'] === this.ctx.adminKey;
    const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    const playerId = this.ctx.tokens[token] ?? null;

    if (route.auth === 'admin' && !isAdmin) {
      send(res, 401, { error: 'unauthorized', message: 'Admin key required' });
      return true;
    }
    if (route.auth === 'player' && !playerId) {
      send(res, 401, { error: 'unauthorized', message: 'Sign in first' });
      return true;
    }

    const match = url.pathname.match(route.pattern)!;
    const params: Record<string, string> = {};
    route.keys.forEach((k, i) => (params[k] = decodeURIComponent(match[i + 1]!)));

    let body: any = null;
    if (req.method !== 'GET' && req.method !== 'DELETE') {
      body = await readJson(req);
    }

    try {
      const result = await route.handler({
        params,
        query: url.searchParams,
        body,
        playerId,
        isAdmin,
      });
      if (route.mutates) this.ctx.onMutation();
      send(res, 200, result ?? { ok: true });
    } catch (err) {
      if (err instanceof EngineError) {
        send(res, statusFor(err.code), { error: err.code, message: err.message });
      } else {
        console.error(err);
        send(res, 500, { error: 'internal', message: 'Something went wrong' });
      }
    }
    return true;
  }
}

function sessionSettings(body: any): SessionSettings {
  return {
    courseId: String(body?.courseId ?? ''),
    mode: body?.mode === 'draw' ? 'draw' : 'arrival',
    teeIntervalMin: clamp(Number(body?.teeIntervalMin ?? 9), 5, 20),
    maxGroupSize: ([2, 3, 4].includes(Number(body?.maxGroupSize))
      ? Number(body?.maxGroupSize)
      : 4) as 2 | 3 | 4,
    graceMin: clamp(Number(body?.graceMin ?? 5), 0, 30),
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo;
}

function numOrUndef(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function statusFor(code: string): number {
  switch (code) {
    case 'not_found':
      return 404;
    case 'forbidden':
      return 403;
    case 'unauthorized':
      return 401;
    default:
      return 422;
  }
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(json),
  });
  res.end(json);
}

async function readJson(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return null;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return null;
  }
}
