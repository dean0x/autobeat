/**
 * Keyboard navigation constants shared across all handler modules.
 */

import { LoopStatus, OrchestratorStatus, ScheduleStatus, TaskStatus } from '../../../core/domain.js';
import type { PanelId } from '../types.js';

/** Ordered panel cycle for Tab navigation */
export const PANEL_ORDER: readonly PanelId[] = ['loops', 'tasks', 'schedules', 'orchestrations'];

/** Per-panel filter cycles — each panel only includes its valid statuses */
export const FILTER_CYCLES: Record<PanelId, readonly (string | null)[]> = {
  loops: [null, 'running', 'paused', 'completed', 'failed', 'cancelled'],
  tasks: [null, 'queued', 'running', 'completed', 'failed', 'cancelled'],
  schedules: [null, 'active', 'paused', 'completed', 'cancelled', 'expired'],
  orchestrations: [null, 'planning', 'running', 'completed', 'failed', 'cancelled'],
};

/** Map of digit keys 1–4 to their corresponding panel IDs */
export const PANEL_JUMP_KEYS: Record<string, PanelId> = {
  '1': 'loops',
  '2': 'tasks',
  '3': 'schedules',
  '4': 'orchestrations',
};

/** Terminal statuses per panel — used by both 'c' (cancel guard) and 'd' (delete gate) handlers */
export const TERMINAL_STATUSES: {
  orchestrations: OrchestratorStatus[];
  loops: LoopStatus[];
  tasks: TaskStatus[];
  schedules: ScheduleStatus[];
} = {
  orchestrations: [OrchestratorStatus.COMPLETED, OrchestratorStatus.FAILED, OrchestratorStatus.CANCELLED],
  loops: [LoopStatus.COMPLETED, LoopStatus.FAILED, LoopStatus.CANCELLED],
  tasks: [TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED],
  schedules: [ScheduleStatus.COMPLETED, ScheduleStatus.CANCELLED, ScheduleStatus.EXPIRED],
};

/** Conservative upper bound for detail scroll when caller does not provide content length */
export const DETAIL_SCROLL_MAX_DEFAULT = 200;
