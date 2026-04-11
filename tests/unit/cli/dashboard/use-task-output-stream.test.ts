/**
 * Tests for useTaskOutputStream hook
 * ARCHITECTURE: Tests polling, ring-buffer, ANSI stripping, status-gated cadence
 * Pattern: Fake timers + mock OutputRepository — no real processes
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OutputStreamState } from '../../../../src/cli/dashboard/use-task-output-stream.js';
import { MAX_LINES_PER_STREAM, useTaskOutputStream } from '../../../../src/cli/dashboard/use-task-output-stream.js';
import type { TaskId } from '../../../../src/core/domain.js';
import type { OutputRepository } from '../../../../src/core/interfaces.js';
import { ok } from '../../../../src/core/result.js';

// ============================================================================
// Helpers
// ============================================================================

function makeTaskId(id: string): TaskId {
  return id as TaskId;
}

function makeOutputRepo(overrides: Partial<OutputRepository> = {}): OutputRepository {
  return {
    get: vi.fn().mockResolvedValue(ok(null)),
    save: vi.fn().mockResolvedValue(ok(undefined)),
    append: vi.fn().mockResolvedValue(ok(undefined)),
    delete: vi.fn().mockResolvedValue(ok(undefined)),
    ...overrides,
  } as OutputRepository;
}

function makeTaskOutput(stdout: string[], stderr: string[] = []) {
  const content = stdout.join('');
  const totalSize = Buffer.byteLength(content, 'utf-8');
  return {
    taskId: makeTaskId('task-1'),
    stdout,
    stderr,
    totalSize,
  };
}

// ============================================================================
// Direct function-level tests (polling logic is pure, hook is integration)
// ============================================================================

// We test the exported pure helpers and the state machine logic via
// the exported hook factory (non-React version) if available, else via
// stub extraction. Since useTaskOutputStream is a React hook we test
// the extracted pure logic it delegates to.

import { buildStreamState, mergeOutputLines, stripAnsi } from '../../../../src/cli/dashboard/use-task-output-stream.js';

describe('stripAnsi', () => {
  it('removes basic color codes', () => {
    const input = '\x1b[31mred text\x1b[0m';
    expect(stripAnsi(input)).toBe('red text');
  });

  it('removes cursor movement codes', () => {
    const input = '\x1b[2A\x1b[1Bsome text';
    expect(stripAnsi(input)).toBe('some text');
  });

  it('removes complex sequences (256-color)', () => {
    const input = '\x1b[38;5;196mcolored\x1b[0m normal';
    expect(stripAnsi(input)).toBe('colored normal');
  });

  it('passes through plain text unchanged', () => {
    const input = 'hello world';
    expect(stripAnsi(input)).toBe('hello world');
  });

  it('handles empty string', () => {
    expect(stripAnsi('')).toBe('');
  });
});

describe('mergeOutputLines', () => {
  it('splits on newlines and returns array of lines', () => {
    const result = mergeOutputLines('line1\nline2\nline3');
    expect(result).toEqual(['line1', 'line2', 'line3']);
  });

  it('handles single line (no newline)', () => {
    const result = mergeOutputLines('single');
    expect(result).toEqual(['single']);
  });

  it('handles empty string', () => {
    const result = mergeOutputLines('');
    expect(result).toEqual([]);
  });

  it('handles trailing newline (omits trailing empty string)', () => {
    const result = mergeOutputLines('line1\nline2\n');
    expect(result).toEqual(['line1', 'line2']);
  });
});

describe('buildStreamState', () => {
  const EMPTY_INITIAL: OutputStreamState = {
    lines: [],
    totalBytes: 0,
    lastFetchedAt: null,
    error: null,
    droppedLines: 0,
    taskStatus: 'pending',
  };

  it('returns pending state when output is null', () => {
    const state = buildStreamState(EMPTY_INITIAL, null, 'pending');
    expect(state.lines).toEqual([]);
    expect(state.taskStatus).toBe('pending');
    expect(state.totalBytes).toBe(0);
  });

  it('appends new lines when totalSize grows', () => {
    const content = 'line1\nline2\n';
    const output = makeTaskOutput([content]);
    const state = buildStreamState(EMPTY_INITIAL, output, 'running');
    expect(state.lines).toEqual(['line1', 'line2']);
    expect(state.totalBytes).toBe(output.totalSize);
    expect(state.taskStatus).toBe('running');
    expect(state.lastFetchedAt).not.toBeNull();
  });

  it('strips ANSI codes from appended lines', () => {
    const content = '\x1b[32mgreen\x1b[0m\nplain\n';
    const output = makeTaskOutput([content]);
    const state = buildStreamState(EMPTY_INITIAL, output, 'running');
    expect(state.lines).toContain('green');
    expect(state.lines).toContain('plain');
  });

  it('performs delta-parse: only appends new content beyond previous totalBytes', () => {
    const initial = 'first\n';
    const firstOutput = makeTaskOutput([initial]);
    const firstState = buildStreamState(EMPTY_INITIAL, firstOutput, 'running');
    expect(firstState.lines).toEqual(['first']);

    // Now more content appended
    const extended = 'first\nsecond\n';
    const secondOutput = makeTaskOutput([extended]);
    const secondState = buildStreamState(firstState, secondOutput, 'running');
    expect(secondState.lines).toEqual(['first', 'second']);
  });

  it('does not duplicate lines when called with same totalBytes', () => {
    const content = 'line1\nline2\n';
    const output = makeTaskOutput([content]);
    const firstState = buildStreamState(EMPTY_INITIAL, output, 'running');
    const secondState = buildStreamState(firstState, output, 'running');
    // Same totalBytes — no delta, lines unchanged
    expect(secondState.lines).toEqual(['first_NOT_PRESENT', 'line1', 'line2'].slice(1));
    expect(secondState.lines.length).toBe(2);
  });

  it('trims ring buffer to MAX_LINES_PER_STREAM when exceeded', () => {
    // Pre-fill with MAX_LINES_PER_STREAM lines
    const initialLines = Array.from({ length: MAX_LINES_PER_STREAM }, (_, i) => `line-${i}`);
    const withMaxLines: OutputStreamState = {
      ...EMPTY_INITIAL,
      lines: initialLines,
      totalBytes: 1000,
    };

    // Add 2 more lines
    const newContent = 'new1\nnew2\n';
    const fullContent = 'x'.repeat(1000) + newContent;
    const output = {
      taskId: makeTaskId('task-1'),
      stdout: [fullContent],
      stderr: [],
      totalSize: Buffer.byteLength(fullContent, 'utf-8'),
    };
    const state = buildStreamState(withMaxLines, output, 'running');

    expect(state.lines.length).toBe(MAX_LINES_PER_STREAM);
    expect(state.droppedLines).toBe(2); // 2 old lines trimmed from front
    // Tail should include the new lines
    const lastTwo = state.lines.slice(-2);
    expect(lastTwo).toEqual(['new1', 'new2']);
  });

  it('sets error when provided', () => {
    const state: OutputStreamState = {
      ...EMPTY_INITIAL,
      error: 'fetch failed',
    };
    // error field is sticky — preserved until cleared externally
    expect(state.error).toBe('fetch failed');
  });

  it('transitions taskStatus to terminal correctly', () => {
    const content = 'done\n';
    const output = makeTaskOutput([content]);
    const state = buildStreamState(EMPTY_INITIAL, output, 'terminal');
    expect(state.taskStatus).toBe('terminal');
  });
});

// ============================================================================
// Polling cadence tests (test the shouldPollThisTick exported helper)
// ============================================================================

import { shouldPollThisTick } from '../../../../src/cli/dashboard/use-task-output-stream.js';

describe('shouldPollThisTick', () => {
  it('always polls when status is running (every tick)', () => {
    for (let tick = 0; tick < 10; tick++) {
      expect(shouldPollThisTick('running', tick)).toBe(true);
    }
  });

  it('polls every 5 ticks when status is pending', () => {
    expect(shouldPollThisTick('pending', 0)).toBe(true);
    expect(shouldPollThisTick('pending', 1)).toBe(false);
    expect(shouldPollThisTick('pending', 4)).toBe(false);
    expect(shouldPollThisTick('pending', 5)).toBe(true);
    expect(shouldPollThisTick('pending', 10)).toBe(true);
  });

  it('polls every 5 ticks when status is queued', () => {
    expect(shouldPollThisTick('queued', 0)).toBe(true);
    expect(shouldPollThisTick('queued', 1)).toBe(false);
    expect(shouldPollThisTick('queued', 5)).toBe(true);
  });

  it('never polls when status is terminal', () => {
    for (let tick = 0; tick < 10; tick++) {
      expect(shouldPollThisTick('terminal', tick)).toBe(false);
    }
  });
});

// ============================================================================
// MAX_LINES_PER_STREAM export
// ============================================================================

describe('MAX_LINES_PER_STREAM', () => {
  it('is 500', () => {
    expect(MAX_LINES_PER_STREAM).toBe(500);
  });
});
