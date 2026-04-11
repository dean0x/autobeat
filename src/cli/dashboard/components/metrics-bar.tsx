/**
 * MetricsBar — one-line compact strip for task-panel top bar
 * ARCHITECTURE: Pure component — all data from props, no state
 * Pattern: Truncation-aware — adapts to available width
 */

import { Text } from 'ink';
import React from 'react';
import type { AgentProvider } from '../../../core/agents.js';
import { formatMs } from '../format.js';

interface MetricsBarProps {
  readonly kind: string;
  readonly status: string;
  readonly elapsedMs: number;
  readonly agent: AgentProvider | undefined;
  readonly bytes: number;
  readonly cost: number | null;
  readonly width: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / 1024 / 1024).toFixed(1)}M`;
}

function statusColor(status: string): string {
  switch (status) {
    case 'running':
      return 'cyan';
    case 'completed':
      return 'green';
    case 'failed':
    case 'cancelled':
      return 'red';
    case 'queued':
    case 'pending':
      return 'gray';
    default:
      return 'white';
  }
}

export const MetricsBar: React.FC<MetricsBarProps> = React.memo(
  ({ kind, status, elapsedMs, agent, bytes, cost, width }) => {
    const kindPart = kind.toUpperCase().slice(0, 5);
    const statusPart = status;
    const elapsedPart = formatMs(elapsedMs);
    const bytesPart = formatBytes(bytes);
    const costPart = cost !== null ? `$${cost.toFixed(3)}` : '';
    const agentPart = agent ?? '';

    // Build the bar, truncating progressively as width shrinks
    const sep = ' · ';

    // Full version: kind · status · elapsed · agent · bytes · cost
    const parts: string[] = [kindPart, statusPart];
    if (width > 40) parts.push(elapsedPart);
    if (width > 55 && agentPart) parts.push(agentPart);
    if (width > 65) parts.push(bytesPart);
    if (width > 75 && costPart) parts.push(costPart);

    const barText = parts.join(sep);

    return (
      <Text color={statusColor(status)} wrap="truncate">
        {barText}
      </Text>
    );
  },
);

MetricsBar.displayName = 'MetricsBar';
