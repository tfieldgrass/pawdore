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
  private pending: PersistedData | null = null;

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
    this.pending = data;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 250);
  }

  /** Write any pending state immediately (called on shutdown). */
  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.pending) return;
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      const tmp = `${this.path}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.pending));
      renameSync(tmp, this.path);
      this.pending = null;
    } catch (err) {
      console.error('Failed to save state:', err);
    }
  }

  /**
   * Move an unreadable state file out of the way so the server can start
   * fresh instead of crash-looping. Returns the backup path, or null.
   */
  quarantine(): string | null {
    try {
      const backup = `${this.path}.corrupt-${Date.now()}`;
      renameSync(this.path, backup);
      return backup;
    } catch {
      return null;
    }
  }
}
