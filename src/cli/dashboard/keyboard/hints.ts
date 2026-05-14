/**
 * Context-sensitive key hint strings for the footer help bar.
 * ARCHITECTURE: Pure functions — no side effects, all inputs explicit
 *
 * Centralises hint text here so the Footer component stays a leaf node and
 * any keyboard refactor only needs to update this one file.
 */

/**
 * Return the footer hint string for the main panel view.
 * Includes panel-jump hint (1-5) and optionally c/d/p mutation hints.
 */
export function mainHints(hasMutations: boolean): string {
  const base = 'Tab: panel · ↑↓: select · Enter: detail · 1-5: panel · f: filter · r refresh · q quit';
  if (hasMutations) {
    return `${base} · c cancel · d delete (terminal) · p pause/resume`;
  }
  return base;
}

/**
 * Return the footer hint string for the detail view.
 * Output controls (o/[/]/g/G) apply to task and orchestration detail only.
 * Pause/resume hint is conditional on entity type and status.
 */
export function detailHints(entityType?: string, entityStatus?: string): string {
  const base = 'Esc back · ↑↓ select · Enter detail · o output · [/] scroll · G tail · r refresh · q quit';
  if (entityType === 'schedules' || entityType === 'loops') {
    const lower = entityStatus?.toLowerCase();
    if (lower === 'active' || lower === 'running') {
      return `${base} · p pause`;
    }
    if (lower === 'paused') {
      return `${base} · p resume`;
    }
  }
  return base;
}

/**
 * Return the appropriate hint string for the current view kind.
 */
export function getHints(
  viewKind: 'main' | 'detail',
  hasMutations: boolean,
  entityType?: string,
  entityStatus?: string,
): string {
  switch (viewKind) {
    case 'main':
      return mainHints(hasMutations);
    case 'detail':
      return detailHints(entityType, entityStatus);
  }
}
