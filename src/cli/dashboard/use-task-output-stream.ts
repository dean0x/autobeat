/**
 * useTaskOutputStream — live per-task output streaming via polling
 * ARCHITECTURE: Ring-buffer hook, ANSI-stripped, delta-parse for efficiency
 * Pattern: Custom React hook + exported pure helpers for unit-testability
 *
 * Key exports:
 *  - useTaskOutputStream: React hook (used by App/WorkspaceView)
 *  - buildStreamState: Pure function (exported for testing)
 *  - stripAnsi: Pure function (exported for testing)
 *  - mergeOutputLines: Pure function (exported for testing)
 *  - shouldPollThisTick: Pure function (exported for testing)
 *  - MAX_LINES_PER_STREAM: Constant (exported for testing)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TaskId, TaskOutput } from '../../core/domain.js';
import type { OutputRepository } from '../../core/interfaces.js';

// ============================================================================
// Types
// ============================================================================

export type TaskStreamStatus = 'pending' | 'queued' | 'running' | 'terminal';

export interface OutputStreamState {
  /** Tail buffer, capped at MAX_LINES_PER_STREAM */
  readonly lines: readonly string[];
  readonly totalBytes: number;
  readonly lastFetchedAt: Date | null;
  readonly error: string | null;
  /** Number of lines trimmed from front due to ring buffer overflow */
  readonly droppedLines: number;
  readonly taskStatus: TaskStreamStatus;
}

// ============================================================================
// Constants
// ============================================================================

export const MAX_LINES_PER_STREAM = 500;

/** ANSI escape sequence regex — permissive for colors/cursor/clear sequences */
const ANSI_REGEX = /\x1b\[[0-?]*[ -/]*[@-~]/g;

/** Number of ticks between polls for non-running tasks */
const SLOW_POLL_INTERVAL = 5;

// ============================================================================
// Pure helper functions (exported for unit testing)
// ============================================================================

/**
 * Strip ANSI escape sequences from a string.
 * Uses the permissive regex from the plan §5.
 */
export function stripAnsi(input: string): string {
  return input.replace(ANSI_REGEX, '');
}

/**
 * Split a string on newlines into an array of lines.
 * Trailing empty string (from trailing newline) is omitted.
 */
export function mergeOutputLines(content: string): string[] {
  if (content === '') return [];
  const lines = content.split('\n');
  // Omit trailing empty string from trailing newline
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines;
}

/**
 * Determine whether a task should be polled on the given tick number.
 * - running: every tick
 * - pending/queued: every SLOW_POLL_INTERVAL ticks
 * - terminal: never (one final fetch was already done at transition time)
 */
export function shouldPollThisTick(status: TaskStreamStatus, tick: number): boolean {
  switch (status) {
    case 'running':
      return true;
    case 'pending':
    case 'queued':
      return tick % SLOW_POLL_INTERVAL === 0;
    case 'terminal':
      return false;
  }
}

/**
 * Build the next OutputStreamState from the previous state and a fresh TaskOutput.
 *
 * Algorithm:
 * 1. If output is null, return updated-status copy of prev state.
 * 2. Delta-parse: recompute only bytes beyond prev.totalBytes.
 * 3. ANSI-strip the new suffix.
 * 4. Merge new lines into ring buffer, trim from front if over MAX_LINES_PER_STREAM.
 */
export function buildStreamState(
  prev: OutputStreamState,
  output: TaskOutput | null,
  nextStatus: TaskStreamStatus,
): OutputStreamState {
  if (output === null) {
    return {
      ...prev,
      taskStatus: nextStatus,
    };
  }

  const newTotalBytes = output.totalSize;

  // No new data — update status and timestamp only
  if (newTotalBytes <= prev.totalBytes && prev.lines.length > 0) {
    return {
      ...prev,
      taskStatus: nextStatus,
      lastFetchedAt: new Date(),
    };
  }

  // Reconstruct full stdout content (all chunks concatenated)
  const fullContent = output.stdout.join('');

  // Delta: only the bytes after what we've already processed
  let newContent: string;
  if (prev.totalBytes > 0 && prev.totalBytes < Buffer.byteLength(fullContent, 'utf-8')) {
    // Extract the suffix beyond what was previously consumed
    // We work in byte offsets — convert byte offset to char offset
    const buf = Buffer.from(fullContent, 'utf-8');
    const suffix = buf.slice(prev.totalBytes).toString('utf-8');
    newContent = suffix;
  } else if (prev.totalBytes === 0) {
    newContent = fullContent;
  } else {
    // No new bytes
    return {
      ...prev,
      taskStatus: nextStatus,
      lastFetchedAt: new Date(),
    };
  }

  // Strip ANSI and split into lines
  const stripped = stripAnsi(newContent);
  const newLines = mergeOutputLines(stripped);

  if (newLines.length === 0) {
    return {
      ...prev,
      totalBytes: newTotalBytes,
      taskStatus: nextStatus,
      lastFetchedAt: new Date(),
    };
  }

  // Merge into ring buffer
  const combined = [...prev.lines, ...newLines];
  let droppedLines = prev.droppedLines;

  if (combined.length > MAX_LINES_PER_STREAM) {
    const excess = combined.length - MAX_LINES_PER_STREAM;
    droppedLines += excess;
    combined.splice(0, excess);
  }

  return {
    lines: combined,
    totalBytes: newTotalBytes,
    lastFetchedAt: new Date(),
    error: null,
    droppedLines,
    taskStatus: nextStatus,
  };
}

// ============================================================================
// React hook
// ============================================================================

const INITIAL_STREAM_STATE: OutputStreamState = {
  lines: [],
  totalBytes: 0,
  lastFetchedAt: null,
  error: null,
  droppedLines: 0,
  taskStatus: 'pending',
};

function classifyStatus(rawStatus: string): TaskStreamStatus {
  switch (rawStatus) {
    case 'running':
      return 'running';
    case 'queued':
      return 'queued';
    case 'completed':
    case 'failed':
    case 'cancelled':
      return 'terminal';
    case 'pending':
    default:
      return 'pending';
  }
}

/**
 * Hook that polls OutputRepository for each taskId in the list, maintaining
 * per-task stream state in a ref-backed Map (version counter triggers renders).
 *
 * Polling strategy:
 * - running tasks: every tick (1s)
 * - pending/queued tasks: every 5 ticks
 * - terminal tasks: one final fetch at transition, then stopped
 *
 * On taskIds prop change: entries for removed tasks are purged; new entries
 * start as pending.
 */
export function useTaskOutputStream(
  outputRepo: OutputRepository,
  taskIds: readonly TaskId[],
  taskStatuses: ReadonlyMap<TaskId, string>,
  enabled: boolean,
): { streams: ReadonlyMap<TaskId, OutputStreamState>; refreshNow: () => void } {
  // Version counter drives re-renders without exposing the mutable Map to React
  const [, setVersion] = useState(0);

  // Internal mutable Map — never directly set to React state
  const streamsRef = useRef<Map<TaskId, OutputStreamState>>(new Map());

  // Tick counter for cadence gating
  const tickRef = useRef(0);

  // Guard against overlapping in-flight fetches
  const fetchingRef = useRef(false);

  // Closing ref to prevent setState after unmount
  const closingRef = useRef(false);

  // Track previous task IDs to detect changes
  const prevTaskIdsRef = useRef<readonly TaskId[]>([]);

  // Synchronize streamsRef when taskIds change
  const taskIdsKey = taskIds.join(',');

  // Track which terminal tasks have had their final fetch done
  const terminalFetchedRef = useRef<Set<TaskId>>(new Set());

  useEffect(() => {
    const prevIds = new Set(prevTaskIdsRef.current);
    const nextIds = new Set(taskIds);

    // Purge removed tasks
    for (const [id] of streamsRef.current) {
      if (!nextIds.has(id)) {
        streamsRef.current.delete(id);
        terminalFetchedRef.current.delete(id);
      }
    }

    // Initialize new tasks
    for (const id of taskIds) {
      if (!prevIds.has(id)) {
        streamsRef.current.set(id, { ...INITIAL_STREAM_STATE });
      }
    }

    prevTaskIdsRef.current = taskIds;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskIdsKey]);

  const doPoll = useCallback(async (): Promise<void> => {
    if (fetchingRef.current || !enabled) return;
    fetchingRef.current = true;

    const currentTick = tickRef.current;
    tickRef.current += 1;

    try {
      const fetches: Array<Promise<void>> = [];

      for (const taskId of taskIds) {
        const prev = streamsRef.current.get(taskId) ?? { ...INITIAL_STREAM_STATE };
        const rawStatus = taskStatuses.get(taskId) ?? 'pending';
        const status = classifyStatus(rawStatus);

        // Terminal tasks: one final fetch, then stop
        if (status === 'terminal') {
          if (terminalFetchedRef.current.has(taskId)) {
            continue; // Already done final fetch
          }
        } else if (!shouldPollThisTick(status, currentTick)) {
          continue;
        }

        const fetchTask = async (): Promise<void> => {
          try {
            const result = await outputRepo.get(taskId);
            if (closingRef.current) return;

            if (!result.ok) {
              const errorState: OutputStreamState = {
                ...(streamsRef.current.get(taskId) ?? INITIAL_STREAM_STATE),
                error: result.error.message,
              };
              streamsRef.current.set(taskId, errorState);
              return;
            }

            const nextStatus = status === 'terminal' ? 'terminal' : classifyStatus(rawStatus);
            const prevState = streamsRef.current.get(taskId) ?? INITIAL_STREAM_STATE;
            const nextState = buildStreamState(prevState, result.value, nextStatus);
            streamsRef.current.set(taskId, nextState);

            // Mark terminal task as final-fetched
            if (status === 'terminal') {
              terminalFetchedRef.current.add(taskId);
            }
          } catch (e) {
            if (!closingRef.current) {
              const errorState: OutputStreamState = {
                ...(streamsRef.current.get(taskId) ?? INITIAL_STREAM_STATE),
                error: e instanceof Error ? e.message : String(e),
              };
              streamsRef.current.set(taskId, errorState);
            }
          }
        };

        fetches.push(fetchTask());
      }

      if (fetches.length > 0) {
        await Promise.all(fetches);
        if (!closingRef.current) {
          setVersion((v) => v + 1);
        }
      }
    } finally {
      fetchingRef.current = false;
    }
  }, [outputRepo, taskIds, taskStatuses, enabled]);

  useEffect(() => {
    closingRef.current = false;

    if (!enabled) return;

    // Immediate poll on mount or when enabled
    void doPoll();

    const interval = setInterval(() => {
      void doPoll();
    }, 1_000);

    return () => {
      closingRef.current = true;
      clearInterval(interval);
    };
  }, [doPoll, enabled]);

  const refreshNow = useCallback(() => {
    void doPoll();
  }, [doPoll]);

  return {
    streams: streamsRef.current as ReadonlyMap<TaskId, OutputStreamState>,
    refreshNow,
  };
}
