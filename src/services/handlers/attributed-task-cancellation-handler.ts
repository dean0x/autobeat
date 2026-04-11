/**
 * Attributed task cancellation handler
 *
 * ARCHITECTURE: Event-driven cancel cascade for v1.3.0.
 * Subscribes to OrchestrationCancelled and cancels all active tasks attributed
 * to the orchestration via orchestrator_id. Extracted from OrchestrationManagerService
 * so the cancel cascade follows the hybrid event-driven contract: commands emit events,
 * handlers react.
 *
 * DECISION (2026-04-11): Optional handler — only created when both taskRepository and
 * taskManager are available. Missing either dep degrades gracefully (cascade skipped).
 * This matches the existing optional-handler pattern used by OrchestrationHandler and
 * UsageCaptureHandler in handler-setup.ts.
 *
 * BEHAVIOR: Best-effort — individual task cancel failures are logged as warnings and
 * never block the orchestration cancel. Task cancellations run concurrently via
 * Promise.all (no ordering requirement for cancel operations).
 *
 * Pattern: Factory pattern for async initialization (matches CheckpointHandler, UsageCaptureHandler).
 */

import { AutobeatError, ErrorCode } from '../../core/errors.js';
import type { EventBus } from '../../core/events/event-bus.js';
import type { OrchestrationCancelledEvent } from '../../core/events/events.js';
import { BaseEventHandler } from '../../core/events/handlers.js';
import type { Logger, TaskManager, TaskRepository } from '../../core/interfaces.js';
import { err, ok, type Result } from '../../core/result.js';

export interface AttributedTaskCancellationHandlerDeps {
  readonly taskRepository: TaskRepository;
  readonly taskManager: TaskManager;
  readonly eventBus: EventBus;
  readonly logger: Logger;
}

export class AttributedTaskCancellationHandler extends BaseEventHandler {
  private readonly taskRepository: TaskRepository;
  private readonly taskManager: TaskManager;
  private readonly eventBus: EventBus;

  /**
   * Private constructor — use AttributedTaskCancellationHandler.create() instead.
   * ARCHITECTURE: Factory pattern ensures handler is fully initialized before use.
   */
  private constructor(deps: AttributedTaskCancellationHandlerDeps) {
    super(deps.logger, 'AttributedTaskCancellationHandler');
    this.taskRepository = deps.taskRepository;
    this.taskManager = deps.taskManager;
    this.eventBus = deps.eventBus;
  }

  /**
   * Factory method — creates and subscribes the handler.
   * ARCHITECTURE: Guarantees handler is ready to use — no uninitialized state possible.
   */
  static async create(
    deps: AttributedTaskCancellationHandlerDeps,
  ): Promise<Result<AttributedTaskCancellationHandler, AutobeatError>> {
    const handlerLogger = deps.logger.child
      ? deps.logger.child({ module: 'AttributedTaskCancellationHandler' })
      : deps.logger;
    const handler = new AttributedTaskCancellationHandler({ ...deps, logger: handlerLogger });

    const subscribeResult = handler.subscribeToEvents();
    if (!subscribeResult.ok) {
      return subscribeResult;
    }

    handlerLogger.info('AttributedTaskCancellationHandler initialized');
    return ok(handler);
  }

  private subscribeToEvents(): Result<void, AutobeatError> {
    const result = this.eventBus.subscribe<OrchestrationCancelledEvent>(
      'OrchestrationCancelled',
      this.handleOrchestrationCancelled.bind(this),
    );
    if (!result.ok) {
      return err(
        new AutobeatError(
          ErrorCode.SYSTEM_ERROR,
          `Failed to subscribe to OrchestrationCancelled: ${result.error.message}`,
          { error: result.error },
        ),
      );
    }
    return ok(undefined);
  }

  private async handleOrchestrationCancelled(event: OrchestrationCancelledEvent): Promise<void> {
    await this.handleEvent(event, async (e) => {
      return this.cancelAttributedTasks(e.orchestratorId, e.reason);
    });
  }

  /**
   * Cancel all active tasks directly attributed to the cancelled orchestration.
   * Runs concurrently — task cancel ordering is not significant.
   * Errors are logged as warnings and never propagated.
   */
  private async cancelAttributedTasks(orchestratorId: string, reason?: string): Promise<Result<void>> {
    const findResult = await this.taskRepository.findByOrchestratorId(orchestratorId as never, {
      statuses: ['queued', 'running'],
    });

    if (!findResult.ok) {
      this.logger.warn('AttributedTaskCancellationHandler: failed to find attributed tasks', {
        orchestratorId,
        error: findResult.error.message,
      });
      return ok(undefined); // best-effort — don't propagate
    }

    const tasks = findResult.value;
    if (tasks.length === 0) return ok(undefined);

    this.logger.info('AttributedTaskCancellationHandler: cancelling attributed tasks', {
      orchestratorId,
      taskCount: tasks.length,
    });

    const cancelReason = reason ?? 'Orchestration cancelled';

    // Concurrent cancellation — ordering is not required for cancel operations
    await Promise.all(
      tasks.map(async (task) => {
        const cancelResult = await this.taskManager.cancel(task.id, cancelReason);
        if (!cancelResult.ok) {
          this.logger.warn('AttributedTaskCancellationHandler: failed to cancel attributed task', {
            orchestratorId,
            taskId: task.id,
            error: cancelResult.error.message,
          });
        }
      }),
    );

    return ok(undefined);
  }
}
