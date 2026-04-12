/**
 * WorkspaceView — workspace view for a single orchestration with per-child output panels
 * ARCHITECTURE: Stateless view component — all data from props
 * Pattern: Branches on layout.mode (nav+grid / grid-only / too-small)
 *
 * Empty states:
 *  - no orchestrations → EmptyWorkspace kind="no-orchestrators"
 *  - no children → EmptyWorkspace kind="no-children"
 * Grid: pagination via nav.gridPage, uses layout.visibleSlots per page
 * Fullscreen: when nav.fullscreenPanelIndex !== null, renders single TaskPanel
 */

import { Box, Text } from 'ink';
import React from 'react';
import type { OrchestratorChild, TaskId, TaskUsage } from '../../../core/domain.js';
import { EmptyWorkspace } from '../components/empty-workspace.js';
import { OrchestratorNav } from '../components/orchestrator-nav.js';
import { TaskPanel } from '../components/task-panel.js';
import { truncateCell } from '../format.js';
import type { WorkspaceLayout } from '../layout.js';
import type { DashboardData } from '../types.js';
import type { OutputStreamState } from '../use-task-output-stream.js';
import type { WorkspaceNavState } from '../workspace-types.js';

// ============================================================================
// Props
// ============================================================================

interface WorkspaceViewProps {
  readonly data: DashboardData;
  readonly layout: WorkspaceLayout;
  readonly nav: WorkspaceNavState;
  readonly streams: ReadonlyMap<TaskId, OutputStreamState>;
}

// ============================================================================
// Helper: get per-child data
// ============================================================================

function getPanelAutoTail(nav: WorkspaceNavState, taskId: TaskId): boolean {
  return nav.autoTailEnabled[taskId] !== false; // default true
}

function getPanelScrollOffset(nav: WorkspaceNavState, taskId: TaskId): number {
  return nav.panelScrollOffsets[taskId] ?? 0;
}

// ============================================================================
// Grid renderer
// ============================================================================

interface GridProps {
  readonly children: readonly OrchestratorChild[];
  readonly layout: WorkspaceLayout;
  readonly nav: WorkspaceNavState;
  readonly streams: ReadonlyMap<TaskId, OutputStreamState>;
  readonly costsByTask: ReadonlyMap<TaskId, TaskUsage | null>;
}

function renderGrid({ children, layout, nav, streams, costsByTask }: GridProps): React.ReactNode {
  const { gridPage } = nav;
  const { visibleSlots, gridCols } = layout;

  const pageStart = gridPage * visibleSlots;
  const pageEnd = pageStart + visibleSlots;
  const visibleChildren = children.slice(pageStart, pageEnd);
  const totalPages = Math.ceil(children.length / visibleSlots);

  // Fullscreen mode: render a single panel
  const fullscreenIdx = nav.fullscreenPanelIndex;
  if (fullscreenIdx !== null) {
    const globalIdx = pageStart + fullscreenIdx;
    const child = children[globalIdx];
    if (child) {
      return (
        <Box flexGrow={1} flexDirection="column">
          <TaskPanel
            child={child}
            stream={streams.get(child.taskId)}
            cost={costsByTask.get(child.taskId) ?? null}
            layout={layout}
            focused={true}
            scrollOffset={getPanelScrollOffset(nav, child.taskId)}
            autoTail={getPanelAutoTail(nav, child.taskId)}
          />
        </Box>
      );
    }
  }

  // Normal grid: rows of panels
  const rows: React.ReactNode[] = [];
  for (let row = 0; row < layout.displayedGridRows; row++) {
    const rowCells: React.ReactNode[] = [];
    for (let col = 0; col < gridCols; col++) {
      const slotIdx = row * gridCols + col;
      const child = visibleChildren[slotIdx];
      const globalSlotIdx = pageStart + slotIdx;
      const isFocused = nav.focusArea === 'grid' && globalSlotIdx === pageStart + nav.focusedPanelIndex;

      if (!child) {
        // Empty slot
        rowCells.push(<Box key={`empty-${col}`} width={layout.panelWidth} height={layout.panelHeight} />);
        continue;
      }

      rowCells.push(
        <TaskPanel
          key={child.taskId}
          child={child}
          stream={streams.get(child.taskId)}
          cost={costsByTask.get(child.taskId) ?? null}
          layout={layout}
          focused={isFocused}
          scrollOffset={getPanelScrollOffset(nav, child.taskId)}
          autoTail={getPanelAutoTail(nav, child.taskId)}
        />,
      );
    }
    rows.push(
      <Box key={`row-${row}`} flexDirection="row">
        {rowCells}
      </Box>,
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      {rows}
      {totalPages > 1 && (
        <Box>
          <Text dimColor>{`Page ${gridPage + 1}/${totalPages} — PgUp/PgDn to paginate`}</Text>
        </Box>
      )}
    </Box>
  );
}

// ============================================================================
// WorkspaceView
// ============================================================================

export const WorkspaceView: React.FC<WorkspaceViewProps> = React.memo(({ data, layout, nav, streams }) => {
  // Too-small fallback
  if (layout.mode === 'too-small') {
    return (
      <Box flexGrow={1} alignItems="center" justifyContent="center">
        <Text color="yellow">Resize terminal to view workspace (need ≥50 cols × 15 rows)</Text>
      </Box>
    );
  }

  const { orchestrations } = data;

  // No orchestrations
  if (orchestrations.length === 0) {
    return <EmptyWorkspace kind="no-orchestrators" layout={layout} />;
  }

  // Resolve workspace data
  const workspaceData = data.workspaceData;

  // Determine focused orchestration from nav.committedOrchestratorIndex
  const committedOrch = orchestrations[nav.committedOrchestratorIndex] ?? orchestrations[0];

  const focusedOrchestration = workspaceData?.focusedOrchestration ?? committedOrch;
  const children = workspaceData?.children ?? [];
  const costAggregate = workspaceData?.costAggregate;

  // Build cost map (aggregate split by child is not available yet — use null)
  const costsByTask = new Map<TaskId, TaskUsage | null>(children.map((c) => [c.taskId, null] as [TaskId, null]));

  // Header line: orchestration summary
  const orchGoalShort = truncateCell(focusedOrchestration.goal, 40);
  const costText = costAggregate ? ` · $${costAggregate.totalCostUsd.toFixed(3)}` : '';
  const headerText = `${focusedOrchestration.id.slice(-8)} · "${orchGoalShort}" · ${focusedOrchestration.status}${costText}`;

  // No children
  const hasNoChildren = children.length === 0;

  if (layout.mode === 'grid-only') {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Box>
          <Text dimColor>{headerText}</Text>
        </Box>
        {hasNoChildren ? (
          <EmptyWorkspace kind="no-children" layout={layout} />
        ) : (
          renderGrid({ children, layout, nav, streams, costsByTask })
        )}
      </Box>
    );
  }

  // nav+grid mode
  return (
    <Box flexDirection="row" flexGrow={1}>
      {/* Left nav */}
      <Box width={layout.navWidth} flexDirection="column">
        <OrchestratorNav
          orchestrations={orchestrations}
          focusedIndex={nav.selectedOrchestratorIndex}
          committedIndex={nav.committedOrchestratorIndex}
          width={layout.navWidth}
          height={24} // reasonable default; actual height from terminal
        />
      </Box>

      {/* Main content */}
      <Box flexDirection="column" flexGrow={1}>
        <Box>
          <Text dimColor>{headerText}</Text>
        </Box>
        {hasNoChildren ? (
          <EmptyWorkspace kind="no-children" layout={layout} />
        ) : (
          renderGrid({ children, layout, nav, streams, costsByTask })
        )}
      </Box>
    </Box>
  );
});

WorkspaceView.displayName = 'WorkspaceView';
