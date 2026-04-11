/**
 * MetricsBar — one-line compact strip for task-panel top bar
 * ARCHITECTURE: Pure component — all data from props, no state
 * Pattern: Truncation-aware — adapts to available width
 */

import { Text } from 'ink';
import React from 'react';
import type { AgentProvider } from '../../../core/agents.js';

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

function formatElapsedMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainMin = minutes % 60;
  return remainMin > 0 ? `${hours}h ${remainMin}m` : `${hours}h`;
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
    const elapsedPart = formatElapsedMs(elapsedMs);
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
