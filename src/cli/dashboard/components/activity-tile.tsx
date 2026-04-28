/**
 * ActivityTile — compact non-interactive activity feed tile for the top row
 * ARCHITECTURE: Pure component — all state from props
 * Pattern: Functional core — formats timestamps, renders recent activity rows
 *
 * Mirrors the tile pattern (ResourcesTile/CostTile/ThroughputTile): no interactive
 * focus state, no scroll, just a bounded snapshot of recent activity.
 */

import { Box, Text } from 'ink';
import React from 'react';
import type { ActivityEntry } from '../../../core/domain.js';
import { truncateCell } from '../format.js';

interface ActivityTileProps {
  readonly activityFeed: readonly ActivityEntry[];
  readonly maxEntries?: number;
}

/**
 * Column widths for compact tile layout.
 * time(6) = 'HH:MM ' | kind(14) = 'orchestration ' | status(flex remainder)
 */
const COL_TIME_W = 6;
const COL_KIND_W = 14;

function formatTime(epochMs: number): string {
  const d = new Date(epochMs);
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

function kindLabel(kind: ActivityEntry['kind']): string {
  switch (kind) {
    case 'task':
      return 'task';
    case 'loop':
      return 'loop';
    case 'orchestration':
      return 'orchestration';
    case 'schedule':
      return 'schedule';
    case 'pipeline':
      return 'pipeline';
  }
}

export const ActivityTile: React.FC<ActivityTileProps> = React.memo(({ activityFeed, maxEntries = 5 }) => {
  const entries = activityFeed.slice(-maxEntries).reverse();

  if (entries.length === 0) {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
        <Text bold>Activity</Text>
        <Text dimColor>No recent activity</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
      <Text bold>Activity</Text>
      {entries.map((entry) => {
        const timeStr = formatTime(entry.timestamp);
        const kind = kindLabel(entry.kind);
        const statusText = truncateCell(entry.status, 12);

        return (
          <Box key={`${entry.entityId}-${entry.timestamp}`} flexDirection="row">
            <Box width={COL_TIME_W}>
              <Text dimColor>{timeStr}</Text>
            </Box>
            <Box width={COL_KIND_W}>
              <Text dimColor>{kind}</Text>
            </Box>
            <Text dimColor>{statusText}</Text>
          </Box>
        );
      })}
    </Box>
  );
});

ActivityTile.displayName = 'ActivityTile';
