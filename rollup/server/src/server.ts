import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Api } from './api.ts';
import { RollupEngine } from './domain/engine.ts';
import type { ClubConfig } from './domain/types.ts';
import { FileStore } from './store.ts';

const PORT = Number(process.env.PORT ?? 3000);
const ADMIN_KEY = process.env.ADMIN_KEY ?? 'burhill-dev';
const DATA_FILE = process.env.DATA_FILE ?? fileURLToPath(new URL('../data/state.json', import.meta.url));
const WEB_DIR = fileURLToPath(new URL('../web', import.meta.url));

// Default pilot config: Burhill GC, Walton-on-Thames (Old + New courses).
const DEFAULT_CLUB: ClubConfig = {
  name: 'Burhill Golf Club',
  courses: [
    { id: 'old', name: 'Old Course' },
    { id: 'new', name: 'New Course' },
  ],
  clubGeofence: { lat: 51.3525, lng: -0.4136, radiusM: 400 },
  teeGeofence: { lat: 51.3525, lng: -0.4136, radiusM: 400 },
  checkInCode: 'BURHILL',
};

const store = new FileStore(DATA_FILE);
const saved = store.load();
const engine = new RollupEngine(DEFAULT_CLUB, saved ? { restore: saved.engine } : {});
const tokens: Record<string, string> = saved?.tokens ?? {};

const wss = new WebSocketServer({ noServer: true });

function broadcast(): void {
  const payload = JSON.stringify({
    type: 'queues',
    queues: engine.activeSessions().map((s) => engine.getQueueView(s.id)),
  });
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) client.send(payload);
  }
}

const api = new Api({
  engine,
  tokens,
  adminKey: ADMIN_KEY,
  onMutation: () => {
    store.save({ engine: engine.toJSON(), tokens });
    broadcast();
  },
});

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

function serveStatic(pathname: string, res: import('node:http').ServerResponse): void {
  let rel = normalize(pathname).replace(/^([/\\.])+/, '');
  let file = join(WEB_DIR, rel);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}

const server = createServer(async (req, res) => {
  try {
    if (await api.handle(req, res)) return;
    const url = new URL(req.url ?? '/', 'http://local');
    serveStatic(url.pathname === '/' ? '/player/index.html' : url.pathname, res);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
});

server.on('upgrade', (req, socket, head) => {
  if (new URL(req.url ?? '/', 'http://local').pathname !== '/ws') {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    ws.send(
      JSON.stringify({
        type: 'queues',
        queues: engine.activeSessions().map((s) => engine.getQueueView(s.id)),
      }),
    );
  });
});

server.listen(PORT, () => {
  console.log(`Roll-Up server: http://localhost:${PORT}`);
  console.log(`  player app : http://localhost:${PORT}/player/`);
  console.log(`  tee board  : http://localhost:${PORT}/board/`);
  console.log(`  admin      : http://localhost:${PORT}/admin/  (key: ${ADMIN_KEY})`);
});
