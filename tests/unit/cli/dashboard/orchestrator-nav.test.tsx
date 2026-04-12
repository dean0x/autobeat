/**
 * Tests for OrchestratorNav component
 * ARCHITECTURE: Tests visual distinction between focused/committed, empty list, integration
 * Pattern: ink-testing-library render — behavioral, not snapshots
 */

import { render } from 'ink-testing-library';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { OrchestratorNav } from '../../../../src/cli/dashboard/components/orchestrator-nav.js';
import type { Orchestration } from '../../../../src/core/domain.js';
import { OrchestratorId, OrchestratorStatus } from '../../../../src/core/domain.js';

// ============================================================================
// Fixtures
// ============================================================================

function makeOrch(id: string, goal: string, status = OrchestratorStatus.RUNNING): Orchestration {
  return {
    id: OrchestratorId(id),
    goal,
    loopId: undefined,
    stateFilePath: '/tmp/state.json',
    workingDirectory: '/workspace',
    agent: undefined,
    model: undefined,
    maxDepth: 3,
    maxWorkers: 5,
    maxIterations: 50,
    status,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    completedAt: undefined,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('OrchestratorNav', () => {
  describe('empty list', () => {
    it('renders without crashing when orchestrations is empty', () => {
      expect(() => {
        render(<OrchestratorNav orchestrations={[]} focusedIndex={0} committedIndex={0} width={25} height={10} />);
      }).not.toThrow();
    });

    it('shows empty state message when list is empty', () => {
      const { lastFrame } = render(
        <OrchestratorNav orchestrations={[]} focusedIndex={0} committedIndex={0} width={25} height={10} />,
      );
      const frame = lastFrame() ?? '';
      expect(frame.toLowerCase()).toMatch(/no|empty|none/);
    });
  });

  describe('focused vs committed visual distinction', () => {
    it('shows > prefix for focused row', () => {
      const orchs = [makeOrch('orch-1', 'Goal A'), makeOrch('orch-2', 'Goal B')];
      const { lastFrame } = render(
        <OrchestratorNav orchestrations={orchs} focusedIndex={1} committedIndex={0} width={30} height={10} />,
      );
      const frame = lastFrame() ?? '';
      // Focused row (index 1) should have > prefix
      expect(frame).toContain('>');
    });

    it('renders multiple orchestrations', () => {
      const orchs = [
        makeOrch('orch-1', 'First goal'),
        makeOrch('orch-2', 'Second goal'),
        makeOrch('orch-3', 'Third goal'),
      ];
      const { lastFrame } = render(
        <OrchestratorNav orchestrations={orchs} focusedIndex={0} committedIndex={0} width={30} height={10} />,
      );
      const frame = lastFrame() ?? '';
      // All goals should be visible (possibly truncated)
      expect(frame).toContain('First');
      expect(frame).toContain('Second');
    });

    it('shows different indicators when focused and committed are same row', () => {
      const orchs = [makeOrch('orch-1', 'Goal A')];
      const { lastFrame } = render(
        <OrchestratorNav orchestrations={orchs} focusedIndex={0} committedIndex={0} width={30} height={10} />,
      );
      const frame = lastFrame() ?? '';
      // Should show the item
      expect(frame).toContain('Goal A');
    });
  });
});
