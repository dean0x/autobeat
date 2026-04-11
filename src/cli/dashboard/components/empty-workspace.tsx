/**
 * EmptyWorkspace — friendly empty state for workspace view
 * ARCHITECTURE: Pure component — no state, renders appropriate message by kind
 * Pattern: Discriminated prop for type-safe message selection
 */

import { Box, Text } from 'ink';
import React from 'react';
import type { WorkspaceLayout } from '../layout.js';

interface EmptyWorkspaceProps {
  readonly kind: 'no-orchestrators' | 'no-children';
  readonly layout: WorkspaceLayout;
}

export const EmptyWorkspace: React.FC<EmptyWorkspaceProps> = React.memo(({ kind }) => {
  if (kind === 'no-orchestrators') {
    return (
      <Box flexGrow={1} alignItems="center" justifyContent="center" flexDirection="column">
        <Text dimColor>No orchestrators running.</Text>
        <Text dimColor>
          Run <Text color="cyan">`beat orchestrate`</Text> to create one.
        </Text>
      </Box>
    );
  }

  return (
    <Box flexGrow={1} alignItems="center" justifyContent="center" flexDirection="column">
      <Text dimColor>This orchestration has no active children yet.</Text>
      <Text dimColor>Waiting for first iteration...</Text>
    </Box>
  );
});

EmptyWorkspace.displayName = 'EmptyWorkspace';
