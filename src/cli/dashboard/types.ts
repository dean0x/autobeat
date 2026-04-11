/**
 * Dashboard type definitions
 * ARCHITECTURE: Shared types for the terminal dashboard (Phase 1)
 * All types are immutable (readonly)
 */

import type {
  ActivityEntry,
  Loop,
  LoopId,
  LoopIteration,
  Orchestration,
  OrchestratorChild,
  OrchestratorId,
  Schedule,
  ScheduleId,
  Task,
  TaskId,
  TaskUsage,
} from '../../core/domain.js';
import type {
  LoopRepository,
  LoopService,
  OrchestrationRepository,
  OrchestrationService,
  ScheduleExecution,
  ScheduleRepository,
  ScheduleService,
  TaskManager,
  TaskRepository,
} from '../../core/interfaces.js';
import type { Liveness } from '../../services/orchestration-liveness.js';

/**
 * Mutation services passed to the dashboard for cancel/delete operations.
 * DECISION (2026-04-10): The dashboard uses full bootstrap (withServices) because
 * manual cancel/delete keybindings need mutation access. Adds ~200-500ms to
 * dashboard startup but acceptable for interactive launch.
 */
export interface DashboardMutationContext {
  readonly orchestrationService: OrchestrationService;
  readonly loopService: LoopService;
  readonly scheduleService: ScheduleService;
  readonly taskManager: TaskManager;
  readonly orchestrationRepo: OrchestrationRepository;
  readonly loopRepo: LoopRepository;
  readonly taskRepo: TaskRepository;
  readonly scheduleRepo: ScheduleRepository;
}

export type PanelId = 'loops' | 'tasks' | 'schedules' | 'orchestrations';

/**
 * Top-level view state — main overview, workspace, or entity detail drill-down.
 * Each detail variant carries the branded ID for its entity type, making
 * illegal cross-type ID usage unrepresentable at compile time.
 *
 * returnTo field on detail: Esc returns to the correct view.
 * Defaults to 'main' for callers that don't pass it (backward compat).
 */
export type ViewState =
  | { readonly kind: 'main' }
  | { readonly kind: 'workspace'; readonly orchestrationId?: OrchestratorId }
  | {
      readonly kind: 'detail';
      readonly entityType: 'loops';
      readonly entityId: LoopId;
      readonly returnTo: 'main' | 'workspace';
    }
  | {
      readonly kind: 'detail';
      readonly entityType: 'tasks';
      readonly entityId: TaskId;
      readonly returnTo: 'main' | 'workspace';
    }
  | {
      readonly kind: 'detail';
      readonly entityType: 'schedules';
      readonly entityId: ScheduleId;
      readonly returnTo: 'main' | 'workspace';
    }
  | {
      readonly kind: 'detail';
      readonly entityType: 'orchestrations';
      readonly entityId: OrchestratorId;
      readonly returnTo: 'main' | 'workspace';
    };

/**
 * Helper to open a detail view with an explicit returnTo destination.
 * Defaults to 'main' so callers that don't have a workspace context still work.
 */
export function openDetail(entityType: 'loops', entityId: LoopId, returnTo?: 'main' | 'workspace'): ViewState;
export function openDetail(entityType: 'tasks', entityId: TaskId, returnTo?: 'main' | 'workspace'): ViewState;
export function openDetail(entityType: 'schedules', entityId: ScheduleId, returnTo?: 'main' | 'workspace'): ViewState;
export function openDetail(
  entityType: 'orchestrations',
  entityId: OrchestratorId,
  returnTo?: 'main' | 'workspace',
): ViewState;
export function openDetail(
  entityType: 'loops' | 'tasks' | 'schedules' | 'orchestrations',
  entityId: LoopId | TaskId | ScheduleId | OrchestratorId,
  returnTo: 'main' | 'workspace' = 'main',
): ViewState {
  return {
    kind: 'detail',
    entityType,
    entityId,
    returnTo,
  } as ViewState;
}

/**
 * Navigation state for the main panel grid
 *
 * v1.3.0 (Phase F): activityFocused and activitySelectedIndex added so the
 * activity feed in MetricsView participates in keyboard navigation.
 * Tab cycles: panel grid → activity → panel grid (wraps at 'orchestrations').
 * When activityFocused is true, ↑/↓ move activitySelectedIndex and Enter opens
 * the selected entry's detail view; Esc returns to panel focus.
 */
export interface NavState {
  readonly focusedPanel: PanelId;
  readonly selectedIndices: Record<PanelId, number>;
  readonly filters: Record<PanelId, string | null>;
  readonly scrollOffsets: Record<PanelId, number>;
  /** Whether the Activity panel in MetricsView currently has keyboard focus */
  readonly activityFocused: boolean;
  /** Which row in the activity feed is currently selected (0-based) */
  readonly activitySelectedIndex: number;
}

/**
 * Count of entities by status string
 */
export type StatusCounts = Record<string, number>;

/**
 * Entity counts for a single panel
 */
export interface EntityCounts {
  readonly total: number;
  readonly byStatus: StatusCounts;
}

/**
 * Full dashboard data snapshot — refreshed on every polling interval.
 * When in detail view, may include extras fetched by fetchDetailExtra():
 * - iterations: LoopIteration[] when viewing a loop detail
 * - executions: ScheduleExecution[] when viewing a schedule detail
 * - orchestrationLiveness: liveness badges for RUNNING orchestrations
 *
 * Metrics view extras (Phase C — v1.3.0):
 * - costRollup24h: aggregated cost/token usage over the last 24 hours
 * - topOrchestrationsByCost: top-N orchestrations by total cost in 24h window
 * - throughputStats: task/loop throughput over a 1-hour window
 * - activityFeed: merged time-sorted activity across all entity kinds
 */
export interface DashboardData {
  readonly tasks: readonly Task[];
  readonly loops: readonly Loop[];
  readonly schedules: readonly Schedule[];
  readonly orchestrations: readonly Orchestration[];
  readonly taskCounts: EntityCounts;
  readonly loopCounts: EntityCounts;
  readonly scheduleCounts: EntityCounts;
  readonly orchestrationCounts: EntityCounts;
  readonly iterations?: readonly LoopIteration[];
  readonly executions?: readonly ScheduleExecution[];
  /** Liveness state per orchestration ID — only populated for RUNNING orchestrations */
  readonly orchestrationLiveness?: Readonly<Record<string, Liveness>>;
  /** Children tasks attributed to the viewed orchestration (Phase E — only in orchestration detail view) */
  readonly orchestrationChildren?: readonly OrchestratorChild[];
  /** Aggregated cost/token usage for the viewed orchestration (Phase E — only in orchestration detail view) */
  readonly orchestrationCostAggregate?: TaskUsage;

  // Metrics view extras (v1.3.0)
  readonly costRollup24h?: TaskUsage;
  readonly topOrchestrationsByCost?: readonly {
    readonly orchestrationId: OrchestratorId;
    readonly totalCost: number;
  }[];
  readonly throughputStats?: {
    readonly tasksPerHour: number;
    readonly loopsPerHour: number;
    readonly successRate: number;
    readonly avgDurationMs: number;
  };
  readonly activityFeed?: readonly ActivityEntry[];

  // Workspace view data (v1.3.0 Phase D)
  readonly workspaceData?: {
    readonly focusedOrchestration: Orchestration;
    readonly children: readonly OrchestratorChild[];
    readonly childTaskIds: readonly TaskId[];
    readonly childTaskStatuses: ReadonlyMap<TaskId, string>;
    readonly costAggregate: TaskUsage;
  };
}

/**
 * Optional detail-view extras — fetched when in detail mode
 * Phase E adds orchestration-specific extras: children list + cost aggregate.
 */
export interface DetailExtra {
  readonly iterations?: readonly LoopIteration[];
  readonly executions?: readonly ScheduleExecution[];
  /** Children tasks attributed to the viewed orchestration (Phase E) */
  readonly orchestrationChildren?: readonly OrchestratorChild[];
  /** Aggregated cost/token usage for the viewed orchestration (Phase E) */
  readonly orchestrationCostAggregate?: TaskUsage;
}
