/**
 * OrchestrationDetail — full-screen orchestration detail view
 * ARCHITECTURE: Pure view component — all data passed as props
 * Pattern: Functional core, no side effects
 *
 * Phase E additions:
 *  - Children list: up to 50 tasks attributed to this orchestration
 *  - Cost aggregate: total cost/tokens; hidden when all zero (fresh orch)
 */

import { Box, Text } from 'ink';
import React from 'react';
import type { Orchestration, OrchestratorChild, TaskUsage } from '../../../core/domain.js';
import { Field, LongField, StatusField } from '../components/field.js';
import { StatusBadge } from '../components/status-badge.js';
import { relativeTime, truncateCell } from '../format.js';

interface OrchestrationDetailProps {
  readonly orchestration: Orchestration;
  readonly animFrame?: number;
  /** Children tasks attributed to this orchestration (empty list = no children section). Default: [] */
  readonly children?: readonly OrchestratorChild[];
  /** Aggregated cost/token usage; undefined or all-zero = hidden */
  readonly costAggregate?: TaskUsage;
}

/**
 * Render a single child row: short ID · kind · status · agent · prompt preview.
 */
function renderChildRow(child: OrchestratorChild): React.ReactNode {
  const shortId = child.taskId.slice(0, 12);
  const kind = child.kind === 'direct' ? 'direct' : 'iter  ';
  const status = child.status.toString().slice(0, 10).padEnd(10);
  const agent = (child.agent ?? '—').slice(0, 8).padEnd(8);
  const promptPreview = child.prompt.slice(0, 40).replace(/\n/g, ' ');

  return (
    <Box key={child.taskId} flexDirection="row">
      <Text dimColor>
        {shortId}
        {'  '}
        {kind}
        {'  '}
        {status}
        {'  '}
        {agent}
        {'  '}
        {promptPreview}
      </Text>
    </Box>
  );
}

/**
 * Cost section — hidden when totalCostUsd === 0 and inputTokens === 0.
 */
function CostSection({ costAggregate }: { readonly costAggregate: TaskUsage | undefined }): React.ReactElement | null {
  if (!costAggregate) return null;
  if (costAggregate.totalCostUsd === 0 && costAggregate.inputTokens === 0) return null;

  const costStr = `$${costAggregate.totalCostUsd.toFixed(2)}`;
  const cacheTokens = (costAggregate.cacheCreationInputTokens ?? 0) + (costAggregate.cacheReadInputTokens ?? 0);

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold dimColor>
        Cost
      </Text>
      <Field label="Total">{costStr}</Field>
      <Field label="Tokens in">{String(costAggregate.inputTokens)}</Field>
      <Field label="Tokens out">{String(costAggregate.outputTokens)}</Field>
      {cacheTokens > 0 && <Field label="Cache">{`${cacheTokens} tokens`}</Field>}
    </Box>
  );
}

export const OrchestrationDetail: React.FC<OrchestrationDetailProps> = React.memo(
  ({ orchestration, animFrame = 0, children = [], costAggregate }) => {
    return (
      <Box flexDirection="column" paddingLeft={1} paddingRight={1}>
        {/* Header */}
        <Box marginBottom={1}>
          <Text bold>Orchestration Detail</Text>
        </Box>

        <Field label="ID">{truncateCell(orchestration.id, 60)}</Field>
        <StatusField>
          <StatusBadge status={orchestration.status} animFrame={animFrame} />
        </StatusField>

        {/* Goal (full, wrapped) */}
        <LongField label="Goal" value={orchestration.goal} />

        {orchestration.agent ? <Field label="Agent">{orchestration.agent}</Field> : null}
        {orchestration.model ? <Field label="Model">{orchestration.model}</Field> : null}
        {orchestration.loopId ? <Field label="Loop ID">{truncateCell(orchestration.loopId, 50)}</Field> : null}
        <Field label="Max Depth">{String(orchestration.maxDepth)}</Field>
        <Field label="Max Workers">{String(orchestration.maxWorkers)}</Field>
        <Field label="Max Iterations">{String(orchestration.maxIterations)}</Field>
        <Field label="Working Directory">{truncateCell(orchestration.workingDirectory, 50)}</Field>
        <Field label="State File">{truncateCell(orchestration.stateFilePath, 50)}</Field>
        <Field label="Created">{relativeTime(orchestration.createdAt)}</Field>
        <Field label="Updated">{relativeTime(orchestration.updatedAt)}</Field>
        {orchestration.completedAt !== undefined ? (
          <Field label="Completed">{relativeTime(orchestration.completedAt)}</Field>
        ) : null}

        {/* Cost aggregate — only shown when there is actual usage data */}
        <CostSection costAggregate={costAggregate} />

        {/* Children section — only shown when the orchestration has attributed tasks */}
        {children.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text bold dimColor>
              {`Children (${children.length})`}
            </Text>
            {children.map((child) => renderChildRow(child))}
          </Box>
        )}
      </Box>
    );
  },
);

OrchestrationDetail.displayName = 'OrchestrationDetail';
