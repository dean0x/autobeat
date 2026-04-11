/**
 * Dashboard App root component
 * ARCHITECTURE: Shell — composes data hook, keyboard hook, and view components
 * Pattern: State lives here; pure view components receive data as props
 */

import { Box, useApp } from 'ink';
import React, { useCallback, useEffect, useState } from 'react';
import type { ActivityEntry } from '../../core/domain.js';
import type { OutputRepository, ResourceMonitor } from '../../core/interfaces.js';
import type { ReadOnlyContext } from '../read-only-context.js';
import { Footer } from './components/footer.js';
import { Header } from './components/header.js';
import { computeMetricsLayout, computeWorkspaceLayout } from './layout.js';
import type { DashboardMutationContext, NavState, ViewState } from './types.js';
import { openDetail } from './types.js';
import { useDashboardData } from './use-dashboard-data.js';
import { useKeyboard } from './use-keyboard.js';
import { useResourceMetrics } from './use-resource-metrics.js';
import { useTaskOutputStream } from './use-task-output-stream.js';
import { useTerminalSize } from './use-terminal-size.js';
import { DetailView } from './views/detail-view.js';
import { MetricsView } from './views/metrics-view.js';
import { WorkspaceView } from './views/workspace-view.js';
import type { WorkspaceNavState } from './workspace-types.js';
import { createInitialWorkspaceNavState } from './workspace-types.js';

interface AppProps {
  readonly ctx: ReadOnlyContext;
  readonly version: string;
  /**
   * Optional mutation context. When provided, 'c' and 'd' keybindings are
   * enabled for cancel/delete operations. Omitted in read-only contexts.
   */
  readonly mutations?: DashboardMutationContext;
  /**
   * Optional resource monitor for the resources tile.
   * When provided, useResourceMetrics polls it every 2s.
   */
  readonly resourceMonitor?: ResourceMonitor;
  /**
   * Output repository for live streaming in workspace view.
   * Threaded from index.tsx alongside other repositories.
   */
  readonly outputRepository?: OutputRepository;
}

/** Initial navigation state — focus on loops panel, no selection, no filters */
const INITIAL_NAV: NavState = {
  focusedPanel: 'loops',
  selectedIndices: { loops: 0, tasks: 0, schedules: 0, orchestrations: 0 },
  filters: { loops: null, tasks: null, schedules: null, orchestrations: null },
  scrollOffsets: { loops: 0, tasks: 0, schedules: 0, orchestrations: 0 },
};

/**
 * Root dashboard component.
 * Renders to stderr via the render() call in index.tsx.
 */
export const App: React.FC<AppProps> = React.memo(({ ctx, version, mutations, resourceMonitor, outputRepository }) => {
  const { exit } = useApp();

  const [view, setView] = useState<ViewState>({ kind: 'main' });
  const [nav, setNav] = useState<NavState>(INITIAL_NAV);
  const [workspaceNav, setWorkspaceNav] = useState<WorkspaceNavState>(createInitialWorkspaceNavState());

  // Shared animation frame counter — single interval drives all StatusBadge animations
  const [animFrame, setAnimFrame] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setAnimFrame((prev) => prev + 1);
    }, 250);
    return () => clearInterval(timer);
  }, []);

  // Terminal size + layout for responsive rendering
  const terminalSize = useTerminalSize();
  const metricsLayout = computeMetricsLayout(terminalSize);

  // Resource metrics polling (2s interval)
  const { resources: resourceMetrics, error: resourceError } = useResourceMetrics(resourceMonitor);

  const { data, error, refreshedAt, refreshNow } = useDashboardData(ctx, view);

  // Workspace layout — computed from children count when in workspace view
  const childCount = data?.workspaceData?.children.length ?? 0;
  const workspaceLayout = computeWorkspaceLayout({
    columns: terminalSize.columns,
    rows: terminalSize.rows,
    childCount,
  });

  // Workspace task IDs and statuses for streaming
  const childTaskIds = data?.workspaceData?.childTaskIds ?? [];
  const childTaskStatuses = data?.workspaceData?.childTaskStatuses ?? new Map();

  // Live output streaming — only enabled when in workspace view and outputRepository is available
  const streamingEnabled = view.kind === 'workspace' && outputRepository !== undefined;
  const { streams } = useTaskOutputStream(
    outputRepository ?? ctx.outputRepository,
    childTaskIds,
    childTaskStatuses,
    streamingEnabled,
  );

  useKeyboard({
    view,
    nav,
    data,
    setView,
    setNav,
    refreshNow,
    exit,
    mutations,
    workspaceNav,
    setWorkspaceNav,
  });

  /**
   * Activity row selection — map ActivityEntry kind to detail entityType and open.
   * Phase E: wires the stub in MetricsView.ActivityPanel.onSelect.
   */
  const handleActivitySelect = useCallback(
    (entry: ActivityEntry) => {
      switch (entry.kind) {
        case 'task':
          setView(openDetail('tasks', entry.entityId as never, 'main'));
          break;
        case 'loop':
          setView(openDetail('loops', entry.entityId as never, 'main'));
          break;
        case 'orchestration':
          setView(openDetail('orchestrations', entry.entityId as never, 'main'));
          break;
        case 'schedule':
          setView(openDetail('schedules', entry.entityId as never, 'main'));
          break;
      }
    },
    [setView],
  );

  // View dispatcher
  const renderView = (): React.ReactNode => {
    if (view.kind === 'main') {
      return (
        <MetricsView
          layout={metricsLayout}
          data={data}
          nav={nav}
          resourceMetrics={resourceMetrics}
          resourceError={resourceError}
          onActivitySelect={handleActivitySelect}
        />
      );
    }

    if (view.kind === 'workspace') {
      if (!data) {
        return null;
      }
      return <WorkspaceView data={data} layout={workspaceLayout} nav={workspaceNav} streams={streams} />;
    }

    if (view.kind === 'detail') {
      return (
        <DetailView
          entityType={view.entityType}
          entityId={view.entityId}
          data={data}
          scrollOffset={nav.scrollOffsets[view.entityType]}
          animFrame={animFrame}
        />
      );
    }

    return null;
  };

  return (
    <Box flexDirection="column" width="100%">
      <Header version={version} data={data} refreshedAt={refreshedAt} error={error} viewKind={view.kind} />
      {renderView()}
      <Footer viewKind={view.kind} hasMutations={mutations !== undefined} />
    </Box>
  );
});

App.displayName = 'App';
