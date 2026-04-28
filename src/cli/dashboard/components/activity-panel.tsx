/**
 * ActivityPanel — time-sorted activity feed across all entity kinds
 * ARCHITECTURE: Pure component — all state from props
 * Pattern: Uses ScrollableList primitive for consistent scroll behavior
 */

import { Box, Text } from 'ink';
import React from 'react';
import type { ActivityEntry } from '../../../core/domain.js';
import { formatActivityTime, shortId, truncateCell } from '../format.js';
import { ScrollableList } from './scrollable-list.js';

const VIEWPORT_HEIGHT = 10;

interface ActivityPanelProps {
  readonly activityFeed: readonly ActivityEntry[];
  readonly selectedIndex: number;
  readonly scrollOffset: number;
  readonly focused: boolean;
  /** Called when the user presses Enter on a selected entry */
  readonly onSelect: (entry: ActivityEntry) => void;
}

/**
 * Fixed column widths for activity feed alignment.
 * All rows use Box-based columns so Ink measures them correctly.
 * Matches entity-browser-panel column conventions.
 */
const COL_TIME_W = 5; // 'HH:MM'
const COL_KIND_W = 14; // 'orchestration '|'schedule      '|'pipeline      '
const COL_ID_W = 13; // shortId output (12 chars + 1 gap)
const COL_STATUS_W = 11; // 'completed  '|'running    '|'failed     '

function renderActivityRow(entry: ActivityEntry, _index: number, isSelected: boolean): React.ReactNode {
  const timeStr = formatActivityTime(entry.timestamp);
  const id = shortId(entry.entityId);
  const status = truncateCell(entry.status, COL_STATUS_W);
  const action = entry.action;

  return (
    <Box key={entry.entityId}>
      <Box width={COL_TIME_W}>
        <Text bold={isSelected} inverse={isSelected}>
          {timeStr}
        </Text>
      </Box>
      <Box width={COL_KIND_W}>
        <Text bold={isSelected} inverse={isSelected}>
          {entry.kind}
        </Text>
      </Box>
      <Box width={COL_ID_W}>
        <Text bold={isSelected} inverse={isSelected}>
          {id}
        </Text>
      </Box>
      <Box width={COL_STATUS_W}>
        <Text bold={isSelected} inverse={isSelected}>
          {status}
        </Text>
      </Box>
      <Text bold={isSelected} inverse={isSelected}>
        {action}
      </Text>
    </Box>
  );
}

export const ActivityPanel: React.FC<ActivityPanelProps> = React.memo(
  ({ activityFeed, selectedIndex, scrollOffset, focused, onSelect }) => {
    const borderColor = focused ? 'cyan' : undefined;

    if (activityFeed.length === 0) {
      return (
        <Box flexDirection="column" flexGrow={1} borderStyle="round" borderColor={borderColor} paddingX={1}>
          <Text bold={focused} color={focused ? 'cyan' : undefined}>
            Activity
          </Text>
          <Text dimColor>No recent activity</Text>
        </Box>
      );
    }

    return (
      <Box flexDirection="column" flexGrow={1} borderStyle="round" borderColor={borderColor} paddingX={1}>
        <Text bold={focused} color={focused ? 'cyan' : undefined}>
          Activity
        </Text>
        <ScrollableList
          items={activityFeed as ActivityEntry[]}
          selectedIndex={selectedIndex}
          scrollOffset={scrollOffset}
          viewportHeight={VIEWPORT_HEIGHT}
          renderItem={renderActivityRow}
          keyExtractor={(item) => item.entityId}
        />
      </Box>
    );
  },
);

ActivityPanel.displayName = 'ActivityPanel';
