/**
 * Footer component — context-sensitive keyboard help bar
 * ARCHITECTURE: Pure leaf component, no side effects
 * Pattern: Delegates hint string construction to keyboard/hints.ts so Footer
 * stays a leaf node and hint updates require changes only in one place.
 */

import { Box, Text } from 'ink';
import React from 'react';
import { getHints } from '../keyboard/hints.js';

interface FooterProps {
  readonly viewKind: 'main' | 'detail';
  /** When true, adds c: cancel · d: delete · p: pause/resume mutation hints */
  readonly hasMutations?: boolean;
  /** Entity type in detail view — drives conditional pause/resume hint */
  readonly entityType?: string;
  /** Entity status in detail view — drives pause vs resume hint text */
  readonly entityStatus?: string;
}

export const Footer: React.FC<FooterProps> = React.memo(({ viewKind, hasMutations, entityType, entityStatus }) => {
  const helpText = getHints(viewKind, hasMutations ?? false, entityType, entityStatus);

  return (
    <Box borderStyle="single" borderTop borderBottom={false} borderLeft={false} borderRight={false} paddingX={1}>
      <Text dimColor>{helpText}</Text>
    </Box>
  );
});

Footer.displayName = 'Footer';
