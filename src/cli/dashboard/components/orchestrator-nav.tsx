/**
 * OrchestratorNav — left nav list showing orchestrations
 * ARCHITECTURE: Pure component — wraps ScrollableList with orchestration-specific rendering
 * Pattern: Visual distinction via > prefix (focused) + bold/inverse (committed)
 */

import { Box, Text } from 'ink';
import React from 'react';
import type { Orchestration } from '../../../core/domain.js';
import { truncateCell } from '../format.js';
import { ScrollableList } from './scrollable-list.js';

interface OrchestratorNavProps {
  readonly orchestrations: readonly Orchestration[];
  /** Keyboard cursor (uncommitted, shown with >) */
  readonly focusedIndex: number;
  /** Currently-displayed orchestrator (committed, shown bold/inverse) */
  readonly committedIndex: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Single item renderer — shows different cues for focused vs committed.
 * If same row is both, both cues are applied.
 */
function renderNavItem(
  orch: Orchestration,
  index: number,
  focusedIndex: number,
  committedIndex: number,
  width: number,
): React.ReactNode {
  const isFocused = index === focusedIndex;
  const isCommitted = index === committedIndex;

  const prefix = isFocused ? '>' : ' ';
  const innerWidth = Math.max(4, width - 3); // prefix (1) + space (1) + border margin (1)
  const shortId = orch.id.slice(-8);
  const label = truncateCell(`${shortId}: ${orch.goal}`, innerWidth);

  return (
    <Text bold={isCommitted} inverse={isCommitted} color={isFocused ? 'cyan' : undefined}>
      {`${prefix} ${label}`}
    </Text>
  );
}

export const OrchestratorNav: React.FC<OrchestratorNavProps> = React.memo(
  ({ orchestrations, focusedIndex, committedIndex, width, height }) => {
    if (orchestrations.length === 0) {
      return (
        <Box width={width} height={height} flexDirection="column" paddingX={1}>
          <Text dimColor>No orchestrations</Text>
        </Box>
      );
    }

    return (
      <Box width={width} height={height} flexDirection="column" paddingX={1}>
        <Text bold dimColor>
          Orchestrations
        </Text>
        <ScrollableList
          items={orchestrations}
          selectedIndex={focusedIndex}
          scrollOffset={Math.max(0, focusedIndex - Math.floor(height / 2))}
          viewportHeight={height - 1}
          renderItem={(orch, index) => renderNavItem(orch, index, focusedIndex, committedIndex, width)}
          keyExtractor={(orch) => orch.id}
        />
      </Box>
    );
  },
);

OrchestratorNav.displayName = 'OrchestratorNav';
