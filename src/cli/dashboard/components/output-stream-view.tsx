/**
 * OutputStreamView — viewport-clipped output stream with auto-tail and indicators
 * ARCHITECTURE: Pure component — all state passed as props, no internal state
 * Pattern: Functional core — viewport math from props, no side effects
 *
 * Indicators:
 *  - ↑ more: at top when not at beginning (paused mode only)
 *  - ↓ N more: at bottom when not at end (paused mode only)
 *  - [paused]: top-right when autoTail disabled
 *  - (N dropped): footer if droppedLines > 0
 */

import { Box, Text } from 'ink';
import React from 'react';
import type { OutputStreamState } from '../use-task-output-stream.js';

interface OutputStreamViewProps {
  readonly stream: OutputStreamState;
  readonly viewportHeight: number;
  readonly scrollOffset: number;
  readonly autoTail: boolean;
}

export const OutputStreamView: React.FC<OutputStreamViewProps> = React.memo(
  ({ stream, viewportHeight, scrollOffset, autoTail }) => {
    // Show error state
    if (stream.error !== null) {
      return (
        <Box flexDirection="column" height={viewportHeight}>
          <Text color="red">{stream.error}</Text>
        </Box>
      );
    }

    const lines = stream.lines;
    const totalLines = lines.length;
    const hasDropped = stream.droppedLines > 0;

    if (autoTail) {
      // Auto-tail: show the last viewportHeight lines, minus footer if dropped
      const footerHeight = hasDropped ? 1 : 0;
      const contentHeight = Math.max(1, viewportHeight - footerHeight);
      const sliceStart = Math.max(0, totalLines - contentHeight);
      const visibleLines = lines.slice(sliceStart);

      return (
        <Box flexDirection="column" height={viewportHeight}>
          {visibleLines.map((line, idx) => (
            <Text key={`${sliceStart + idx}`} wrap="truncate">
              {line}
            </Text>
          ))}
          {hasDropped && (
            <Text dimColor color="yellow">
              {`(${stream.droppedLines} dropped)`}
            </Text>
          )}
        </Box>
      );
    }

    // Paused mode — [paused] header always shown, scroll indicators conditional
    // Reserve rows: 1 for paused header, 1 for scroll-up (if applicable),
    // 1 for scroll-down (if applicable), 1 for dropped (if applicable)
    const clampedOffset = Math.min(scrollOffset, Math.max(0, totalLines - 1));
    const hasScrollUp = clampedOffset > 0;

    // Reserve rows for indicators
    // Always 1 for [paused], then up/down/dropped
    const pausedRow = 1;
    const upRow = hasScrollUp ? 1 : 0;
    const droppedRow = hasDropped ? 1 : 0;

    // We'll determine if scroll-down is needed after computing content height
    // First pass: compute content height without down indicator
    const contentHeightNoDown = Math.max(1, viewportHeight - pausedRow - upRow - droppedRow);
    const visibleEnd = clampedOffset + contentHeightNoDown;
    const hasScrollDown = visibleEnd < totalLines;
    const downRow = hasScrollDown ? 1 : 0;

    // Adjust for down indicator
    const contentHeight = Math.max(1, viewportHeight - pausedRow - upRow - downRow - droppedRow);
    const belowCount = totalLines - (clampedOffset + contentHeight);
    const visibleLines = lines.slice(clampedOffset, clampedOffset + contentHeight);

    return (
      <Box flexDirection="column" height={viewportHeight}>
        {/* Paused header row: optional ↑ and [paused] on same row or separate */}
        {hasScrollUp ? (
          <Box flexDirection="row" justifyContent="space-between">
            <Text dimColor>↑ more</Text>
            <Text dimColor>[paused]</Text>
          </Box>
        ) : (
          <Box justifyContent="flex-end">
            <Text dimColor>[paused]</Text>
          </Box>
        )}

        {/* Output lines */}
        {visibleLines.map((line, idx) => (
          <Text key={`${clampedOffset + idx}`} wrap="truncate">
            {line}
          </Text>
        ))}

        {/* Bottom scroll indicator */}
        {hasScrollDown && belowCount > 0 && <Text dimColor>{`↓ ${belowCount} more`}</Text>}

        {/* Dropped lines footer */}
        {hasDropped && (
          <Text dimColor color="yellow">
            {`(${stream.droppedLines} dropped)`}
          </Text>
        )}
      </Box>
    );
  },
);

OutputStreamView.displayName = 'OutputStreamView';
