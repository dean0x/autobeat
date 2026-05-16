/**
 * TmuxConnector — high-level managed session lifecycle with push-based events
 *
 * DESIGN DECISION: Sentinel detection via fs.watch() is push-based (no polling).
 * A 50ms debounce window suppresses platform double-fire events. Message files
 * are delivered in sequence order regardless of fs.watch() arrival order.
 *
 * DESIGN DECISION: The watcher is created BEFORE the tmux session launches to
 * eliminate the race condition where the agent exits before the watcher is ready.
 *
 * DESIGN DECISION: Staleness detection (setInterval + isAlive) acts as a safety
 * net for processes that crash without writing a sentinel. It fires onExit(null,
 * 'STALE') and stops itself after the first firing to prevent double-fire.
 */

import * as fs from 'fs';
import * as path from 'path';
import { AutobeatError } from '../../core/errors.js';
import type { Logger } from '../../core/interfaces.js';
import { err, ok, Result } from '../../core/result.js';
import { TmuxHooks } from './tmux-hooks.js';
import { TmuxSessionManager } from './tmux-session-manager.js';
import { TmuxValidator } from './tmux-validator.js';
import { DEFAULT_STALENESS_CONFIG, OutputMessage, StalenessConfig, TmuxHandle, TmuxSpawnConfig } from './types.js';

/** fs.watch callback signature */
type WatchFn = typeof fs.watch;

/** Debounce window for suppressing fs.watch double-fires (ms) */
const DEBOUNCE_MS = 50;

/** Maximum number of pending out-of-order messages before forcing delivery */
const MAX_PENDING_MESSAGES = 100;

export interface TmuxConnectorDeps {
  sessionManager: TmuxSessionManager;
  hooks: TmuxHooks;
  validator: TmuxValidator;
  logger: Logger;
  watch: WatchFn;
  /** Injectable readFileSync — defaults to fs.readFileSync; injected in tests */
  readFileSync?: (path: string, encoding: BufferEncoding) => string;
}

export interface SpawnCallbacks {
  onOutput: (msg: OutputMessage) => void;
  onExit: (code: number | null, signal?: string) => void;
}

/**
 * Internal state for a single managed session
 */
interface ActiveSession {
  handle: TmuxHandle;
  sentinelWatcher: fs.FSWatcher | null;
  messagesWatcher: fs.FSWatcher | null;
  stalenessTimer: ReturnType<typeof setInterval> | null;
  exited: boolean;
  /** Messages delivered so far, keyed by sequence number */
  deliveredSequences: Set<number>;
  /** Pending messages waiting for gap-filling (sequence ordering) */
  pendingMessages: Map<number, OutputMessage>;
  /** Next expected sequence number */
  nextExpectedSeq: number;
  /** Debounce timers keyed by filename */
  debounceTimers: Map<string, ReturnType<typeof setTimeout>>;
}

export class TmuxConnector {
  private readonly activeSessions = new Map<string, ActiveSession>();
  private readonly readFileSyncFn: (path: string, encoding: BufferEncoding) => string;

  constructor(private readonly deps: TmuxConnectorDeps) {
    this.readFileSyncFn = deps.readFileSync ?? ((p, enc) => fs.readFileSync(p, enc));
  }

  /**
   * Spawns a new managed tmux session.
   * 1. Validates tmux availability
   * 2. Generates the wrapper script
   * 3. Starts fs.watch watchers (BEFORE session launch to avoid race)
   * 4. Creates the tmux session running the wrapper
   * 5. Starts the staleness timer
   */
  async spawn(config: TmuxSpawnConfig, callbacks: SpawnCallbacks): Promise<Result<TmuxHandle, AutobeatError>> {
    // 1. Validate tmux
    const validationResult = this.deps.validator.validate();
    if (!validationResult.ok) return validationResult;

    // 2. Generate wrapper
    const manifestResult = this.deps.hooks.generateWrapper({
      taskId: config.taskId,
      agent: 'claude',
      sessionsDir: config.sessionsDir,
      agentCommand: config.command,
      agentArgs: [],
    });
    if (!manifestResult.ok) return manifestResult;
    const manifest = manifestResult.value;

    const sessionDir = manifest.sessionsDir;

    // Build the internal session state (before launching, to set up watchers first)
    const session: ActiveSession = {
      handle: {
        sessionName: config.name,
        taskId: config.taskId,
        sessionsDir: config.sessionsDir,
      },
      sentinelWatcher: null,
      messagesWatcher: null,
      stalenessTimer: null,
      exited: false,
      deliveredSequences: new Set(),
      pendingMessages: new Map(),
      nextExpectedSeq: 1,
      debounceTimers: new Map(),
    };

    // 3a. Start sentinel watcher (BEFORE session launch)
    try {
      session.sentinelWatcher = this.deps.watch(
        sessionDir,
        { persistent: false },
        (_eventType: string, filename: string | null) => {
          if (!filename) return;
          if (filename === '.done' || filename === '.exit') {
            this.handleSentinel(config.taskId, sessionDir, filename, callbacks);
          }
        },
      );
    } catch {
      // Directory may not exist yet — sentinel detection degrades gracefully
      this.deps.logger.warn('Failed to start sentinel watcher', { taskId: config.taskId, sessionDir });
    }

    // 3b. Start messages watcher
    try {
      session.messagesWatcher = this.deps.watch(
        manifest.messagesDir,
        { persistent: false },
        (_eventType: string, filename: string | null) => {
          if (!filename) return;
          // Ignore temp files
          if (filename.endsWith('.tmp')) return;
          if (!filename.endsWith('.json')) return;

          // Debounce double-fires for the same file
          const existing = session.debounceTimers.get(filename);
          if (existing) clearTimeout(existing);
          const timer = setTimeout(() => {
            session.debounceTimers.delete(filename);
            this.handleMessageFile(path.join(manifest.messagesDir, filename), session, callbacks);
          }, DEBOUNCE_MS);
          session.debounceTimers.set(filename, timer);
        },
      );
    } catch {
      this.deps.logger.warn('Failed to start messages watcher', {
        taskId: config.taskId,
        messagesDir: manifest.messagesDir,
      });
    }

    // 4. Create tmux session running the wrapper
    const stalenessConfig: StalenessConfig = {
      ...DEFAULT_STALENESS_CONFIG,
      ...config.staleness,
    };

    const sessionResult = this.deps.sessionManager.createSession({
      ...config,
      command: manifest.wrapperPath,
    });
    if (!sessionResult.ok) {
      // Clean up watchers and generated session directory on failure
      this.closeSession(session);
      this.deps.hooks.cleanup(config.taskId, config.sessionsDir);
      return sessionResult;
    }

    // Update handle with the actual session handle details
    session.handle = {
      ...session.handle,
      sessionName: sessionResult.value.sessionName,
    };

    // 5. Start staleness timer
    let lastAliveCheck = Date.now();
    session.stalenessTimer = setInterval(() => {
      if (session.exited) {
        if (session.stalenessTimer) {
          clearInterval(session.stalenessTimer);
          session.stalenessTimer = null;
        }
        return;
      }

      const aliveResult = this.deps.sessionManager.isAlive(session.handle.sessionName);
      const isAlive = aliveResult.ok && aliveResult.value;

      if (!isAlive) {
        const silentMs = Date.now() - lastAliveCheck;
        if (silentMs >= stalenessConfig.maxSilenceMs) {
          this.deps.logger.warn('Session stale — no heartbeat detected', {
            sessionName: session.handle.sessionName,
            silentMs,
          });
          this.triggerExit(config.taskId, session, null, 'STALE', callbacks);
        }
      } else {
        lastAliveCheck = Date.now();
      }
    }, stalenessConfig.checkIntervalMs);

    this.activeSessions.set(config.taskId, session);
    return ok(session.handle);
  }

  /**
   * Destroys a session and cleans up all watchers and timers.
   * Idempotent.
   */
  destroy(handle: TmuxHandle): Result<void, AutobeatError> {
    const session = this.activeSessions.get(handle.taskId);
    if (session) {
      this.closeSession(session);
      this.activeSessions.delete(handle.taskId);
    }
    return this.deps.sessionManager.destroySession(handle.sessionName);
  }

  sendKeys(handle: TmuxHandle, keys: string): Result<void, AutobeatError> {
    return this.deps.sessionManager.sendKeys(handle.sessionName, keys);
  }

  isAlive(handle: TmuxHandle): Result<boolean, AutobeatError> {
    return this.deps.sessionManager.isAlive(handle.sessionName);
  }

  getActiveHandles(): TmuxHandle[] {
    return Array.from(this.activeSessions.values()).map((s) => s.handle);
  }

  /**
   * Cleans up ALL active sessions. Call on process shutdown.
   */
  dispose(): void {
    const sessions = Array.from(this.activeSessions.entries());
    this.activeSessions.clear();
    for (const [, session] of sessions) {
      this.closeSession(session);
      this.deps.sessionManager.destroySession(session.handle.sessionName);
    }
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private handleSentinel(taskId: string, sessionDir: string, filename: string, callbacks: SpawnCallbacks): void {
    const session = this.activeSessions.get(taskId);
    if (!session || session.exited) return;

    // Read exit code from sentinel file
    let code: number | null = null;
    try {
      const sentinelPath = path.join(sessionDir, filename);
      const raw = this.readFileSyncFn(sentinelPath, 'utf8').trim();
      code = parseInt(raw, 10);
      if (isNaN(code)) code = null;
    } catch {
      // Sentinel may not be readable yet — use null
    }

    // For .exit sentinel, code is the actual exit code; for .done it's 0
    const exitCode = filename === '.done' ? (code ?? 0) : (code ?? 1);
    this.triggerExit(taskId, session, exitCode, undefined, callbacks);
  }

  private handleMessageFile(filePath: string, session: ActiveSession, callbacks: SpawnCallbacks): void {
    if (session.exited) return;

    let parsed: OutputMessage;
    try {
      const raw = this.readFileSyncFn(filePath, 'utf8');
      parsed = JSON.parse(raw) as OutputMessage;
    } catch {
      this.deps.logger.warn('Failed to parse output message file', { filePath });
      return;
    }

    if (
      typeof parsed.sequence !== 'number' ||
      typeof parsed.timestamp !== 'string' ||
      typeof parsed.type !== 'string' ||
      typeof parsed.content !== 'string'
    ) {
      this.deps.logger.warn('Output message missing required fields', { filePath });
      return;
    }

    // Buffer for ordered delivery
    session.pendingMessages.set(parsed.sequence, parsed);

    // Deliver all consecutive messages starting from nextExpectedSeq
    while (session.pendingMessages.has(session.nextExpectedSeq)) {
      const msg = session.pendingMessages.get(session.nextExpectedSeq)!;
      session.pendingMessages.delete(session.nextExpectedSeq);
      if (!session.deliveredSequences.has(msg.sequence)) {
        session.deliveredSequences.add(msg.sequence);
        callbacks.onOutput(msg);
      }
      session.nextExpectedSeq++;
    }

    // Safety cap: if too many pending messages accumulate (gap that won't fill),
    // skip ahead and deliver what we have to prevent unbounded memory growth
    if (session.pendingMessages.size > MAX_PENDING_MESSAGES) {
      this.deps.logger.warn('Pending message buffer exceeded cap, skipping gap', {
        nextExpectedSeq: session.nextExpectedSeq,
        pendingCount: session.pendingMessages.size,
      });
      // Find the lowest pending sequence and deliver from there
      const sortedSeqs = Array.from(session.pendingMessages.keys()).sort((a, b) => a - b);
      session.nextExpectedSeq = sortedSeqs[0]!;
      // Re-run the delivery loop
      while (session.pendingMessages.has(session.nextExpectedSeq)) {
        const msg = session.pendingMessages.get(session.nextExpectedSeq)!;
        session.pendingMessages.delete(session.nextExpectedSeq);
        if (!session.deliveredSequences.has(msg.sequence)) {
          session.deliveredSequences.add(msg.sequence);
          callbacks.onOutput(msg);
        }
        session.nextExpectedSeq++;
      }
    }
  }

  private triggerExit(
    taskId: string,
    session: ActiveSession,
    code: number | null,
    signal: string | undefined,
    callbacks: SpawnCallbacks,
  ): void {
    if (session.exited) return;
    session.exited = true;

    this.closeSession(session);
    this.activeSessions.delete(taskId);
    callbacks.onExit(code, signal);
  }

  private closeSession(session: ActiveSession): void {
    if (session.sentinelWatcher) {
      try {
        session.sentinelWatcher.close();
      } catch {
        /* ignore */
      }
      session.sentinelWatcher = null;
    }
    if (session.messagesWatcher) {
      try {
        session.messagesWatcher.close();
      } catch {
        /* ignore */
      }
      session.messagesWatcher = null;
    }
    if (session.stalenessTimer) {
      clearInterval(session.stalenessTimer);
      session.stalenessTimer = null;
    }
    // Clear any pending debounce timers
    for (const timer of session.debounceTimers.values()) {
      clearTimeout(timer);
    }
    session.debounceTimers.clear();
  }
}
