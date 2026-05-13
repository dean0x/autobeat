/**
 * Unit tests for loop-detail pure helper functions
 * ARCHITECTURE: Pure function tests — no React mounting, no Ink dependency
 * Covers: resolveIterationIndex, renderConvergenceLine
 */

import { describe, expect, it } from 'vitest';
import { resolveIterationIndex } from '../../../../src/cli/dashboard/keyboard/helpers.js';
import { parseEvalResponseJson, renderConvergenceLine } from '../../../../src/cli/dashboard/views/loop-detail.js';
import type { LoopIteration } from '../../../../src/core/domain.js';
import type { LoopId, TaskId } from '../../../../src/core/types.js';

// ============================================================================
// Fixtures
// ============================================================================

function makeIter(
  n: number,
  opts: {
    score?: number;
    status?: LoopIteration['status'];
    taskId?: string;
  } = {},
): LoopIteration {
  return {
    id: n,
    loopId: 'loop-test' as LoopId,
    iterationNumber: n,
    taskId: opts.taskId ? (opts.taskId as TaskId) : undefined,
    status: opts.status ?? 'pass',
    score: opts.score,
    startedAt: Date.now(),
  } as LoopIteration;
}

// ============================================================================
// resolveIterationIndex
// ============================================================================

describe('resolveIterationIndex', () => {
  const iterations = [makeIter(1), makeIter(2), makeIter(3)];

  it('returns 0 when selectedNumber is null', () => {
    expect(resolveIterationIndex(null, iterations)).toBe(0);
  });

  it('returns correct index for found iterationNumber', () => {
    expect(resolveIterationIndex(2, iterations)).toBe(1);
    expect(resolveIterationIndex(3, iterations)).toBe(2);
  });

  it('returns 0 when iterationNumber not found', () => {
    expect(resolveIterationIndex(99, iterations)).toBe(0);
  });

  it('returns 0 for empty array', () => {
    expect(resolveIterationIndex(1, [])).toBe(0);
    expect(resolveIterationIndex(null, [])).toBe(0);
  });

  it('finds the first iteration by number', () => {
    expect(resolveIterationIndex(1, iterations)).toBe(0);
  });
});

// ============================================================================
// renderConvergenceLine
// ============================================================================

describe('renderConvergenceLine', () => {
  it('returns empty string when no scored iterations', () => {
    const iters = [makeIter(1, { score: undefined })];
    expect(renderConvergenceLine(iters, 'maximize')).toBe('');
  });

  it('returns empty string for single scored iteration', () => {
    // 1 scored iteration: no trend to show (need 0 comparison baseline)
    // NOTE: First iter always gets → since runningBest=scored[0].score
    const iters = [makeIter(1, { score: 3.5 })];
    const result = renderConvergenceLine(iters, 'maximize');
    // Single item: gets the → arrow because it equals itself (runningBest)
    expect(result).toBe('3.5→');
  });

  it('maximize: shows ↑ when score improves', () => {
    // DESC order (newest first) → reverses to [1, 2] chronologically
    const iters = [makeIter(2, { score: 5.0 }), makeIter(1, { score: 3.0 })];
    const result = renderConvergenceLine(iters, 'maximize');
    // chronological: iter1=3.0→, iter2=5.0↑
    expect(result).toBe('3.0→ 5.0↑');
  });

  it('maximize: shows ↓ when score regresses', () => {
    const iters = [makeIter(2, { score: 2.0 }), makeIter(1, { score: 5.0 })];
    const result = renderConvergenceLine(iters, 'maximize');
    // chronological: iter1=5.0→, iter2=2.0↓
    expect(result).toBe('5.0→ 2.0↓');
  });

  it('maximize: shows → when score stays same', () => {
    const iters = [makeIter(2, { score: 3.0 }), makeIter(1, { score: 3.0 })];
    const result = renderConvergenceLine(iters, 'maximize');
    expect(result).toBe('3.0→ 3.0→');
  });

  it('minimize: shows ↑ when score decreases (improvement)', () => {
    const iters = [makeIter(2, { score: 2.0 }), makeIter(1, { score: 5.0 })];
    const result = renderConvergenceLine(iters, 'minimize');
    // chronological: iter1=5.0→, iter2=2.0↑ (lower is better)
    expect(result).toBe('5.0→ 2.0↑');
  });

  it('minimize: shows ↓ when score increases (regression)', () => {
    const iters = [makeIter(2, { score: 8.0 }), makeIter(1, { score: 3.0 })];
    const result = renderConvergenceLine(iters, 'minimize');
    // chronological: iter1=3.0→, iter2=8.0↓ (higher is worse)
    expect(result).toBe('3.0→ 8.0↓');
  });

  it('defaults to maximize when evalDirection is undefined', () => {
    const iters = [makeIter(2, { score: 5.0 }), makeIter(1, { score: 3.0 })];
    const maximize = renderConvergenceLine(iters, 'maximize');
    const defaultDir = renderConvergenceLine(iters, undefined);
    expect(defaultDir).toBe(maximize);
  });

  it('excludes progress-status iterations from trend', () => {
    const iters = [
      makeIter(3, { score: 4.0, status: 'pass' }),
      makeIter(2, { score: 3.5, status: 'progress' }), // excluded
      makeIter(1, { score: 3.0, status: 'pass' }),
    ];
    const result = renderConvergenceLine(iters, 'maximize');
    // chronological: iter1=3.0→, iter3=4.0↑ (iter2 skipped)
    expect(result).toBe('3.0→ 4.0↑');
  });

  it('caps at last 20 scored iterations', () => {
    // Create 25 iterations in DESC order (newest first)
    const iters: LoopIteration[] = [];
    for (let i = 25; i >= 1; i--) {
      iters.push(makeIter(i, { score: i * 1.0 }));
    }
    const result = renderConvergenceLine(iters, 'maximize');
    const parts = result.split(' ');
    // Should only have 20 parts (last 20 of 25)
    expect(parts).toHaveLength(20);
    // First part should be iter 6 (scores 6.0 through 25.0)
    expect(parts[0]).toMatch(/^6\.0/);
  });

  it('returns empty string when all iterations have undefined scores', () => {
    const iters = [makeIter(1, { score: undefined }), makeIter(2, { score: undefined })];
    expect(renderConvergenceLine(iters, 'maximize')).toBe('');
  });

  it('running best tracks improvements correctly over multiple iters', () => {
    // Ascending scores: 1→3→2→5→4 — best should track: 1, 3, 3, 5, 5
    const iters = [
      makeIter(5, { score: 4.0 }), // DESC order
      makeIter(4, { score: 5.0 }),
      makeIter(3, { score: 2.0 }),
      makeIter(2, { score: 3.0 }),
      makeIter(1, { score: 1.0 }),
    ];
    const result = renderConvergenceLine(iters, 'maximize');
    // chronological: 1→, 3↑, 2↓, 5↑, 4↓
    expect(result).toBe('1.0→ 3.0↑ 2.0↓ 5.0↑ 4.0↓');
  });
});

// ============================================================================
// parseEvalResponseJson
// ============================================================================

describe('parseEvalResponseJson', () => {
  it('returns structured object with all fields for valid JSON', () => {
    const raw = JSON.stringify({ decision: 'pass', score: 0.95, reasoning: 'Looks good' });
    const result = parseEvalResponseJson(raw);
    expect(result).toEqual({ decision: 'pass', score: 0.95, reasoning: 'Looks good' });
  });

  it('returns object with only score field when only score is present', () => {
    const raw = JSON.stringify({ score: 0.7 });
    const result = parseEvalResponseJson(raw);
    expect(result).toEqual({ score: 0.7, decision: undefined, reasoning: undefined });
  });

  it('coerces score from string to number', () => {
    const raw = JSON.stringify({ decision: 'fail', score: '0.87', reasoning: 'Too slow' });
    const result = parseEvalResponseJson(raw);
    expect(result).not.toBeNull();
    expect(result?.score).toBe(0.87);
  });

  it('returns null for invalid JSON string', () => {
    expect(parseEvalResponseJson('not valid json {')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseEvalResponseJson('')).toBeNull();
  });

  it('returns null for JSON array (non-object)', () => {
    expect(parseEvalResponseJson(JSON.stringify([1, 2, 3]))).toBeNull();
  });

  it('returns null for JSON number (non-object)', () => {
    expect(parseEvalResponseJson(JSON.stringify(42))).toBeNull();
  });

  it('returns null for JSON null', () => {
    expect(parseEvalResponseJson(JSON.stringify(null))).toBeNull();
  });

  it('omits fields with wrong types rather than coercing them', () => {
    const raw = JSON.stringify({ decision: 123, score: true, reasoning: null });
    const result = parseEvalResponseJson(raw);
    // decision is not a string, score is not number/parseable string, reasoning is not string
    expect(result).not.toBeNull();
    expect(result?.decision).toBeUndefined();
    expect(result?.score).toBeUndefined();
    expect(result?.reasoning).toBeUndefined();
  });
});
