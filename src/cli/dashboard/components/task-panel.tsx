/**
 * TaskPanel — single grid cell showing a child task's output and metadata
 * ARCHITECTURE: Pure component — all state passed as props
 * Pattern: Degraded compact mode when layout.compactPanel is true
 */

import { Box, Text } from 'ink';
import React from 'react';
import type { OrchestratorChild, TaskUsage } from '../../../core/domain.js';
import type { WorkspaceLayout } from '../layout.js';
import type { OutputStreamState } from '../use-task-output-stream.js';
import { MetricsBar } from './metrics-bar.js';
import { OutputStreamView } from './output-stream-view.js';

interface TaskPanelProps {
  readonly child: OrchestratorChild;
  readonly stream: OutputStreamState | undefined;
  readonly cost: TaskUsage | null;
  readonly layout: WorkspaceLayout;
  readonly focused: boolean;
  readonly scrollOffset: number;
  readonly autoTail: boolean;
}

const EMPTY_STREAM: OutputStreamState = {
  lines: [],
  totalBytes: 0,
  lastFetchedAt: null,
  error: null,
  droppedLines: 0,
  taskStatus: 'pending',
};

export const TaskPanel: React.FC<TaskPanelProps> = React.memo(
  ({ child, stream, cost, layout, focused, scrollOffset, autoTail }) => {
    const activeStream = stream ?? EMPTY_STREAM;
    const borderStyle = focused ? 'double' : 'round';
    const borderColor = focused ? 'cyan' : undefined;

    const elapsedMs = Date.now() - child.createdAt;
    const costUsd = cost?.totalCostUsd ?? null;
    const bytes = activeStream.totalBytes;

    if (layout.compactPanel) {
      // Compact mode: only render the top bar
      return (
        <Box width={layout.panelWidth} borderStyle={borderStyle} borderColor={borderColor} paddingX={1}>
          <MetricsBar
            kind={child.kind}
            status={child.status}
            elapsedMs={elapsedMs}
            agent={child.agent}
            bytes={bytes}
            cost={costUsd}
            width={layout.panelWidth - 4}
          />
        </Box>
      );
    }

    return (
      <Box
        flexDirection="column"
        width={layout.panelWidth}
        height={layout.panelHeight}
        borderStyle={borderStyle}
        borderColor={borderColor}
        paddingX={1}
      >
        {/* Top bar: metrics */}
        <MetricsBar
          kind={child.kind}
          status={child.status}
          elapsedMs={elapsedMs}
          agent={child.agent}
          bytes={bytes}
          cost={costUsd}
          width={layout.panelWidth - 4}
        />

        {/* Output stream body */}
        <OutputStreamView
          stream={activeStream}
          viewportHeight={layout.outputViewportHeight}
          scrollOffset={scrollOffset}
          autoTail={autoTail}
        />
      </Box>
    );
  },
);

TaskPanel.displayName = 'TaskPanel';
