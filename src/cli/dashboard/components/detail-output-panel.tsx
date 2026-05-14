/**
 * DetailOutputPanel — shared output-stream panel for task and orchestration detail views
 * ARCHITECTURE: Pure component — all data passed as props, no side effects
 * Pattern: Extracts duplicated output rendering logic from task-detail and orchestration-detail
 *
 * Exports:
 *  - DetailOutputConfig: grouped output-related props (visible, autoTail, scrollOffset, terminalRows)
 *  - useElementHeight: Ink-specific ref-based height measurement hook
 *  - DetailOutputPanel: separator + empty states + tooSmall guard + OutputStreamView
 */

import type { DOMElement } from 'ink';
import { Box, measureElement, Text } from 'ink';
import React, { useEffect, useRef, useState } from 'react';
import { computeDetailOutputLayout } from '../layout.js';
import type { OutputStreamState } from '../use-task-output-stream.js';
import { OutputStreamView } from './output-stream-view.js';

// ============================================================================
// DetailOutputConfig — grouped output prop interface
// ============================================================================

/**
 * Grouped output-related configuration props for detail views.
 * Applied to TaskDetailProps, OrchestrationDetailProps, and DetailViewProps
 * to eliminate scattered individual output props.
 */
export interface DetailOutputConfig {
  /** Whether the output panel is visible */
  readonly visible: boolean;
  /** Whether the output auto-tails (follows latest output) */
  readonly autoTail: boolean;
  /** Scroll offset when in paused (non-auto-tail) mode */
  readonly scrollOffset: number;
  /** Terminal row count for layout computation */
  readonly terminalRows: number;
}

// ============================================================================
// useElementHeight — Ink-specific layout measurement hook
// ============================================================================

/**
 * Measures the rendered height of an Ink DOM element after every Yoga layout pass.
 *
 * DECISION: No dependency array is intentional. Ink has no useLayoutEffect equivalent;
 * measureElement() must run after every render so it captures layout changes caused
 * by polling-driven prop updates (new fields appearing, text reflow). Adding a
 * dependency array would cause stale heights after data refreshes, breaking the
 * adaptive output viewport calculation in computeDetailOutputLayout().
 */
export function useElementHeight(): [React.RefObject<DOMElement | null>, number] {
  const ref = useRef<DOMElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (ref.current) {
      const measured = measureElement(ref.current);
      if (measured.height !== height) {
        setHeight(measured.height);
      }
    }
  });

  return [ref, height];
}

// ============================================================================
// DetailOutputPanel — shared output section
// ============================================================================

interface DetailOutputPanelProps {
  /** The output stream to render */
  readonly stream: OutputStreamState;
  /** Whether this stream belongs to a queued or running task */
  readonly isActive: boolean;
  /** Terminal rows available (used in tooSmall guard) */
  readonly terminalRows: number;
  /** Height of the metadata section above this panel (measured via useElementHeight) */
  readonly metadataHeight: number;
  /** Scroll offset for paused output mode */
  readonly scrollOffset: number;
  /** Whether to auto-tail (follow latest output) */
  readonly autoTail: boolean;
  /**
   * Optional label for the separator line.
   * - Omit (or pass undefined) for plain ruler: "────────────────────"
   * - Provide for labelled ruler: "─── Output: <label> ────────"
   */
  readonly separatorLabel?: string;
}

export const DetailOutputPanel: React.FC<DetailOutputPanelProps> = React.memo(
  ({ stream, isActive, terminalRows, metadataHeight, scrollOffset, autoTail, separatorLabel }) => {
    const outputLayout = computeDetailOutputLayout({ rows: terminalRows, metadataHeight });

    if (outputLayout.tooSmall) {
      return (
        <Box marginTop={0}>
          <Text dimColor>(terminal too small for output)</Text>
        </Box>
      );
    }

    const separator = separatorLabel !== undefined ? `─── Output: ${separatorLabel} ${'─'.repeat(8)}` : '─'.repeat(20);

    return (
      <Box flexDirection="column" marginTop={0}>
        <Text dimColor>{separator}</Text>
        {stream.lines.length === 0 ? (
          <Box height={Math.min(3, outputLayout.outputViewportHeight)}>
            <Text dimColor>
              {isActive
                ? 'Waiting for output...'
                : stream.totalBytes === 0
                  ? 'No output captured'
                  : 'Loading output...'}
            </Text>
          </Box>
        ) : (
          <OutputStreamView
            stream={stream}
            viewportHeight={outputLayout.outputViewportHeight}
            scrollOffset={scrollOffset}
            autoTail={autoTail}
          />
        )}
      </Box>
    );
  },
);

DetailOutputPanel.displayName = 'DetailOutputPanel';
