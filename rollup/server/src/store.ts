import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { EngineState } from './domain/types.ts';

export interface PersistedData {
  engine: EngineState;
  /** Bearer token -> player id. */
  tokens: Record<string, string>;
}

/** Tiny JSON-file store: good enough for a single-club pilot prototype. */
export class FileStore {
  private timer: NodeJS.Timeout | null = null;

  constructor(private path: string) {}

  load(): PersistedData | null {
    try {
      return JSON.parse(readFileSync(this.path, 'utf8')) as PersistedData;
    } catch {
      return null;
    }
  }

  /** Debounced write; atomic via rename so a crash can't corrupt state. */
  save(data: PersistedData): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      mkdirSync(dirname(this.path), { recursive: true });
      const tmp = `${this.path}.tmp`;
      writeFileSync(tmp, JSON.stringify(data));
      renameSync(tmp, this.path);
    }, 250);
  }
}
