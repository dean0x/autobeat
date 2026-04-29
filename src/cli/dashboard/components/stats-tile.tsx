/**
 * StatsTile — combined cost + throughput highlight card
 * ARCHITECTURE: Pure component — all state from props
 * Pattern: Functional core — formats numbers, renders compact stats
 */

import { Box, Text } from 'ink';
import React from 'react';
import type { OrchestratorId, TaskUsage } from '../../../core/domain.js';
import { shortId } from '../format.js';

interface TopEntry {
  readonly orchestrationId: OrchestratorId;
  readonly totalCost: number;
}

interface ThroughputStats {
  readonly tasksPerHour: number;
  readonly loopsPerHour: number;
  readonly successRate: number;
  readonly avgDurationMs: number;
}

interface StatsTileProps {
  readonly costRollup24h: TaskUsage;
  readonly top: readonly TopEntry[];
  readonly stats: ThroughputStats;
}

function formatCost(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatDurationMs(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

export const StatsTile: React.FC<StatsTileProps> = React.memo(({ costRollup24h, top, stats }) => {
  const { totalCostUsd, inputTokens, outputTokens, cacheCreationInputTokens, cacheReadInputTokens } = costRollup24h;
  const cacheSavings = cacheReadInputTokens;
  const { tasksPerHour, loopsPerHour, successRate, avgDurationMs } = stats;
  const successPercent = Math.round(successRate * 100);

  return (
    <Box flexDirection="column" flexGrow={1} borderStyle="round" borderColor="gray" paddingX={1}>
      <Text bold>Stats</Text>
      <Text>
        <Text bold>{formatCost(totalCostUsd)}</Text> In {formatTokens(inputTokens)} Out {formatTokens(outputTokens)}
      </Text>
      {cacheCreationInputTokens > 0 && <Text dimColor>Cache create {formatTokens(cacheCreationInputTokens)}</Text>}
      {cacheSavings > 0 && <Text dimColor>Cache read {formatTokens(cacheSavings)}</Text>}
      <Text>
        {tasksPerHour} tasks/hr {loopsPerHour} loops/hr
      </Text>
      <Text>
        Success {successPercent}% Avg {formatDurationMs(avgDurationMs)}
      </Text>
      {top.length > 0 && (
        <Box flexDirection="column">
          <Text dimColor>Top:</Text>
          {top.slice(0, 3).map((entry) => (
            <Text key={entry.orchestrationId}>
              {' '}
              {shortId(entry.orchestrationId)} {formatCost(entry.totalCost)}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
});

StatsTile.displayName = 'StatsTile';
