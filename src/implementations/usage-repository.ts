/**
 * SQLite-based usage repository implementation
 * Handles persistence and aggregation of task token/cost usage.
 *
 * ARCHITECTURE: Follows SQLiteOutputRepository pattern — prepared statements,
 * Result-wrapped, operationErrorHandler, no exceptions in business logic.
 * Pattern: Repository pattern with UPSERT for idempotency.
 * Rationale: Usage capture is best-effort at task completion; may be replayed
 * on retry, so idempotency is critical.
 */

import SQLite from 'better-sqlite3';
import { LoopId, OrchestratorId, TaskId, TaskUsage } from '../core/domain.js';
import { operationErrorHandler } from '../core/errors.js';
import { UsageRepository } from '../core/interfaces.js';
import { ok, Result, tryCatchAsync } from '../core/result.js';
import { Database } from './database.js';

/**
 * Zero-value aggregate returned when no usage rows match a query.
 * Avoids null in aggregate methods — callers can always read numeric fields.
 */
const ZERO_USAGE = (taskId: TaskId = TaskId(''), capturedAt = 0): TaskUsage => ({
  taskId,
  inputTokens: 0,
  outputTokens: 0,
  cacheCreationInputTokens: 0,
  cacheReadInputTokens: 0,
  totalCostUsd: 0,
  capturedAt,
});

export class SQLiteUsageRepository implements UsageRepository {
  private readonly db: SQLite.Database;
  private readonly saveStmt: SQLite.Statement;
  private readonly getStmt: SQLite.Statement;

  constructor(database: Database) {
    this.db = database.getDatabase();

    // UPSERT: idempotent save — on conflict update all columns except task_id (PK)
    this.saveStmt = this.db.prepare(`
      INSERT INTO task_usage (
        task_id, input_tokens, output_tokens,
        cache_creation_input_tokens, cache_read_input_tokens,
        total_cost_usd, model, captured_at
      ) VALUES (
        @taskId, @inputTokens, @outputTokens,
        @cacheCreationInputTokens, @cacheReadInputTokens,
        @totalCostUsd, @model, @capturedAt
      )
      ON CONFLICT(task_id) DO UPDATE SET
        input_tokens                = excluded.input_tokens,
        output_tokens               = excluded.output_tokens,
        cache_creation_input_tokens = excluded.cache_creation_input_tokens,
        cache_read_input_tokens     = excluded.cache_read_input_tokens,
        total_cost_usd              = excluded.total_cost_usd,
        model                       = excluded.model,
        captured_at                 = excluded.captured_at
    `);

    this.getStmt = this.db.prepare(`
      SELECT * FROM task_usage WHERE task_id = ?
    `);
  }

  async save(usage: TaskUsage): Promise<Result<void>> {
    return tryCatchAsync(
      async () => {
        this.saveStmt.run({
          taskId: usage.taskId,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cacheCreationInputTokens: usage.cacheCreationInputTokens,
          cacheReadInputTokens: usage.cacheReadInputTokens,
          totalCostUsd: usage.totalCostUsd,
          model: usage.model ?? null,
          capturedAt: usage.capturedAt,
        });
      },
      operationErrorHandler('save task usage', { taskId: usage.taskId }),
    );
  }

  async get(taskId: TaskId): Promise<Result<TaskUsage | null>> {
    return tryCatchAsync(
      async () => {
        const row = this.getStmt.get(taskId) as Record<string, unknown> | undefined;
        if (!row) return null;
        return this.rowToUsage(row);
      },
      operationErrorHandler('get task usage', { taskId }),
    );
  }

  /**
   * Sum tokens/cost for all tasks attributed to an orchestration.
   * Follows retry_of chains so retries roll up into the root task cost.
   *
   * ARCHITECTURE: Uses a recursive CTE to walk the retry chain so that
   * each task is counted once, regardless of how many retries it has.
   */
  async sumByOrchestrationId(orchId: OrchestratorId): Promise<Result<TaskUsage>> {
    return tryCatchAsync(
      async () => {
        const stmt = this.db.prepare(`
          WITH RECURSIVE task_tree(root_id, task_id) AS (
            -- Base: tasks directly attributed OR via loop iterations
            SELECT id AS root_id, id AS task_id
              FROM tasks
              WHERE orchestrator_id = ?
                 OR id IN (
                   SELECT task_id FROM loop_iterations
                     WHERE loop_id = (SELECT loop_id FROM orchestrations WHERE id = ?)
                       AND task_id IS NOT NULL
                 )
            UNION
            -- Recurse: retries of tasks already in the tree
            SELECT tt.root_id, t.id
              FROM tasks t
              INNER JOIN task_tree tt ON t.retry_of = tt.task_id
          )
          SELECT
            COALESCE(SUM(u.input_tokens), 0)                 AS input_tokens,
            COALESCE(SUM(u.output_tokens), 0)                AS output_tokens,
            COALESCE(SUM(u.cache_creation_input_tokens), 0)  AS cache_creation_input_tokens,
            COALESCE(SUM(u.cache_read_input_tokens), 0)      AS cache_read_input_tokens,
            COALESCE(SUM(u.total_cost_usd), 0)               AS total_cost_usd
          FROM task_tree tt
          LEFT JOIN task_usage u ON u.task_id = tt.task_id
        `);
        const row = stmt.get(orchId, orchId) as Record<string, unknown>;
        return this.aggregateRowToUsage(row);
      },
      operationErrorHandler('sum usage by orchestration', { orchestratorId: orchId }),
    );
  }

  async sumByLoopId(loopId: LoopId): Promise<Result<TaskUsage>> {
    return tryCatchAsync(
      async () => {
        const stmt = this.db.prepare(`
          SELECT
            COALESCE(SUM(u.input_tokens), 0)                 AS input_tokens,
            COALESCE(SUM(u.output_tokens), 0)                AS output_tokens,
            COALESCE(SUM(u.cache_creation_input_tokens), 0)  AS cache_creation_input_tokens,
            COALESCE(SUM(u.cache_read_input_tokens), 0)      AS cache_read_input_tokens,
            COALESCE(SUM(u.total_cost_usd), 0)               AS total_cost_usd
          FROM loop_iterations li
          LEFT JOIN task_usage u ON u.task_id = li.task_id
          WHERE li.loop_id = ?
        `);
        const row = stmt.get(loopId) as Record<string, unknown>;
        return this.aggregateRowToUsage(row);
      },
      operationErrorHandler('sum usage by loop', { loopId }),
    );
  }

  async sumGlobal(sinceMs?: number): Promise<Result<TaskUsage>> {
    return tryCatchAsync(async () => {
      const stmt =
        sinceMs !== undefined
          ? this.db.prepare(`
                SELECT
                  COALESCE(SUM(input_tokens), 0)                 AS input_tokens,
                  COALESCE(SUM(output_tokens), 0)                AS output_tokens,
                  COALESCE(SUM(cache_creation_input_tokens), 0)  AS cache_creation_input_tokens,
                  COALESCE(SUM(cache_read_input_tokens), 0)      AS cache_read_input_tokens,
                  COALESCE(SUM(total_cost_usd), 0)               AS total_cost_usd
                FROM task_usage
                WHERE captured_at >= ?
              `)
          : this.db.prepare(`
                SELECT
                  COALESCE(SUM(input_tokens), 0)                 AS input_tokens,
                  COALESCE(SUM(output_tokens), 0)                AS output_tokens,
                  COALESCE(SUM(cache_creation_input_tokens), 0)  AS cache_creation_input_tokens,
                  COALESCE(SUM(cache_read_input_tokens), 0)      AS cache_read_input_tokens,
                  COALESCE(SUM(total_cost_usd), 0)               AS total_cost_usd
                FROM task_usage
              `);

      const row =
        sinceMs !== undefined
          ? (stmt.get(sinceMs) as Record<string, unknown>)
          : (stmt.get() as Record<string, unknown>);
      return this.aggregateRowToUsage(row);
    }, operationErrorHandler('sum global usage'));
  }

  async topOrchestrationsByCost(
    sinceMs: number,
    limit: number,
  ): Promise<Result<readonly { orchestrationId: OrchestratorId; totalCost: number }[]>> {
    return tryCatchAsync(async () => {
      const stmt = this.db.prepare(`
          SELECT
            t.orchestrator_id AS orchestration_id,
            COALESCE(SUM(u.total_cost_usd), 0) AS total_cost
          FROM task_usage u
          JOIN tasks t ON t.id = u.task_id
          WHERE u.captured_at >= ?
            AND t.orchestrator_id IS NOT NULL
          GROUP BY t.orchestrator_id
          ORDER BY total_cost DESC
          LIMIT ?
        `);
      const rows = stmt.all(sinceMs, limit) as Array<{ orchestration_id: string; total_cost: number }>;
      return rows.map((r) => ({
        orchestrationId: r.orchestration_id as OrchestratorId,
        totalCost: r.total_cost,
      }));
    }, operationErrorHandler('top orchestrations by cost'));
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  private rowToUsage(row: Record<string, unknown>): TaskUsage {
    return {
      taskId: row.task_id as TaskId,
      inputTokens: (row.input_tokens as number) ?? 0,
      outputTokens: (row.output_tokens as number) ?? 0,
      cacheCreationInputTokens: (row.cache_creation_input_tokens as number) ?? 0,
      cacheReadInputTokens: (row.cache_read_input_tokens as number) ?? 0,
      totalCostUsd: (row.total_cost_usd as number) ?? 0,
      model: (row.model as string | null) ?? undefined,
      capturedAt: row.captured_at as number,
    };
  }

  private aggregateRowToUsage(row: Record<string, unknown> | null | undefined): TaskUsage {
    if (!row) return ZERO_USAGE();
    return {
      taskId: TaskId(''),
      inputTokens: (row.input_tokens as number) ?? 0,
      outputTokens: (row.output_tokens as number) ?? 0,
      cacheCreationInputTokens: (row.cache_creation_input_tokens as number) ?? 0,
      cacheReadInputTokens: (row.cache_read_input_tokens as number) ?? 0,
      totalCostUsd: (row.total_cost_usd as number) ?? 0,
      capturedAt: 0,
    };
  }
}
