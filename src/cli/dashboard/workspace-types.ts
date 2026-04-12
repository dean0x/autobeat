/**
 * Workspace view navigation state
 * ARCHITECTURE: Separate from NavState to keep MetricsView state independent
 * Pattern: Immutable state with factory function for initialization
 */

import type { TaskId } from '../../core/domain.js';

export interface WorkspaceNavState {
  /** Keyboard cursor position in left nav (uncommitted — use Enter to commit) */
  readonly selectedOrchestratorIndex: number;
  /** Currently-displayed orchestrator row (committed on Enter) */
  readonly committedOrchestratorIndex: number;
  /** Focused grid panel index */
  readonly focusedPanelIndex: number;
  /** Per-task scroll offsets for output stream viewport */
  readonly panelScrollOffsets: Readonly<Record<string, number>>;
  /** When set, renders single panel fullscreen; cleared on orchestrator switch */
  readonly fullscreenPanelIndex: number | null;
  /** Current grid page (0-based) */
  readonly gridPage: number;
  /** Per-task auto-tail enabled flag — defaults to true for new tasks */
  readonly autoTailEnabled: Readonly<Record<string, boolean>>;
  /** Which area has keyboard focus: nav list or grid */
  readonly focusArea: 'nav' | 'grid';
}

/**
 * Create the initial WorkspaceNavState with sensible defaults.
 * All tasks start with auto-tail enabled.
 */
export function createInitialWorkspaceNavState(): WorkspaceNavState {
  return {
    selectedOrchestratorIndex: 0,
    committedOrchestratorIndex: 0,
    focusedPanelIndex: 0,
    panelScrollOffsets: {},
    fullscreenPanelIndex: null,
    gridPage: 0,
    autoTailEnabled: {},
    focusArea: 'nav',
  };
}
