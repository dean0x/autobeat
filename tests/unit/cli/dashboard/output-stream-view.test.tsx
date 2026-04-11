/**
 * Tests for OutputStreamView component
 * ARCHITECTURE: Tests viewport clipping, auto-tail, pause indicator, dropped badge
 * Pattern: ink-testing-library render — behavioral tests, not snapshots
 */

import { render } from 'ink-testing-library';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { OutputStreamView } from '../../../../src/cli/dashboard/components/output-stream-view.js';
import type { OutputStreamState } from '../../../../src/cli/dashboard/use-task-output-stream.js';

// ============================================================================
// Test fixtures
// ============================================================================

function makeStream(overrides: Partial<OutputStreamState> = {}): OutputStreamState {
  return {
    lines: [],
    totalBytes: 0,
    lastFetchedAt: null,
    error: null,
    droppedLines: 0,
    taskStatus: 'running',
    ...overrides,
  };
}

function makeLines(n: number, prefix = 'line'): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}-${i + 1}`);
}

// ============================================================================
// Tests
// ============================================================================

describe('OutputStreamView', () => {
  describe('auto-tail mode', () => {
    it('shows the tail of lines when autoTail is true', () => {
      const lines = makeLines(10);
      const stream = makeStream({ lines });
      const { lastFrame } = render(
        <OutputStreamView stream={stream} viewportHeight={5} scrollOffset={0} autoTail={true} />,
      );
      const frame = lastFrame() ?? '';
      // Should show last 5 lines (tail)
      expect(frame).toContain('line-6');
      expect(frame).toContain('line-10');
      // Should NOT show the very first lines (they're scrolled off)
      // Note: test uses line-2 to avoid substring match with line-10
      expect(frame).not.toContain('line-2');
      expect(frame).not.toContain('line-5');
    });

    it('shows all lines when lines fit within viewport', () => {
      const lines = makeLines(3);
      const stream = makeStream({ lines });
      const { lastFrame } = render(
        <OutputStreamView stream={stream} viewportHeight={5} scrollOffset={0} autoTail={true} />,
      );
      const frame = lastFrame() ?? '';
      expect(frame).toContain('line-1');
      expect(frame).toContain('line-3');
    });
  });

  describe('scroll/pause mode', () => {
    it('shows [paused] indicator when autoTail is false', () => {
      const lines = makeLines(10);
      const stream = makeStream({ lines });
      const { lastFrame } = render(
        <OutputStreamView stream={stream} viewportHeight={5} scrollOffset={0} autoTail={false} />,
      );
      const frame = lastFrame() ?? '';
      expect(frame).toContain('[paused]');
    });

    it('does not show [paused] when autoTail is true', () => {
      const lines = makeLines(5);
      const stream = makeStream({ lines });
      const { lastFrame } = render(
        <OutputStreamView stream={stream} viewportHeight={5} scrollOffset={0} autoTail={true} />,
      );
      const frame = lastFrame() ?? '';
      expect(frame).not.toContain('[paused]');
    });

    it('shows lines from scrollOffset when autoTail is false', () => {
      const lines = makeLines(10);
      const stream = makeStream({ lines });
      const { lastFrame } = render(
        <OutputStreamView stream={stream} viewportHeight={3} scrollOffset={5} autoTail={false} />,
      );
      const frame = lastFrame() ?? '';
      expect(frame).toContain('line-6'); // scrollOffset=5, shows lines 6,7,8
    });

    it('shows ↑ more indicator when not at beginning', () => {
      const lines = makeLines(10);
      const stream = makeStream({ lines });
      const { lastFrame } = render(
        <OutputStreamView stream={stream} viewportHeight={3} scrollOffset={3} autoTail={false} />,
      );
      const frame = lastFrame() ?? '';
      expect(frame).toContain('↑');
    });

    it('shows ↓ N more indicator when not at end', () => {
      const lines = makeLines(10);
      const stream = makeStream({ lines });
      const { lastFrame } = render(
        <OutputStreamView stream={stream} viewportHeight={3} scrollOffset={0} autoTail={false} />,
      );
      const frame = lastFrame() ?? '';
      expect(frame).toContain('↓');
    });
  });

  describe('dropped lines badge', () => {
    it('shows dropped lines count when droppedLines > 0', () => {
      const stream = makeStream({ lines: makeLines(5), droppedLines: 42 });
      const { lastFrame } = render(
        <OutputStreamView stream={stream} viewportHeight={5} scrollOffset={0} autoTail={true} />,
      );
      const frame = lastFrame() ?? '';
      expect(frame).toContain('42 dropped');
    });

    it('does not show dropped badge when droppedLines is 0', () => {
      const stream = makeStream({ lines: makeLines(3), droppedLines: 0 });
      const { lastFrame } = render(
        <OutputStreamView stream={stream} viewportHeight={5} scrollOffset={0} autoTail={true} />,
      );
      const frame = lastFrame() ?? '';
      expect(frame).not.toContain('dropped');
    });
  });

  describe('empty state', () => {
    it('renders without crashing when lines is empty', () => {
      const stream = makeStream({ lines: [] });
      expect(() => {
        render(<OutputStreamView stream={stream} viewportHeight={5} scrollOffset={0} autoTail={true} />);
      }).not.toThrow();
    });
  });

  describe('error state', () => {
    it('shows error message when stream.error is set', () => {
      const stream = makeStream({ error: 'fetch failed: DB error' });
      const { lastFrame } = render(
        <OutputStreamView stream={stream} viewportHeight={5} scrollOffset={0} autoTail={true} />,
      );
      const frame = lastFrame() ?? '';
      expect(frame).toContain('fetch failed');
    });
  });
});
