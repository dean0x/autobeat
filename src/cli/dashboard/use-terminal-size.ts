/**
 * useTerminalSize — reads terminal dimensions from stderr (the dashboard render target)
 * ARCHITECTURE: Pure hook, no side effects beyond event listener registration
 *
 * CRITICAL (Risk #22): The dashboard renders to stderr (see index.tsx:50-55).
 * This hook MUST read from process.stderr, not process.stdout.
 * Fallback chain: stderr → stdout → hardcoded defaults.
 *
 * Debounces resize events via 50ms setTimeout to avoid thrash during drag-resize.
 */

import { useEffect, useState } from 'react';

const DEFAULT_COLUMNS = 80;
const DEFAULT_ROWS = 24;
const DEBOUNCE_MS = 50;

function readCurrentSize(): { columns: number; rows: number } {
  return {
    columns: process.stderr.columns ?? process.stdout.columns ?? DEFAULT_COLUMNS,
    rows: process.stderr.rows ?? process.stdout.rows ?? DEFAULT_ROWS,
  };
}

export function useTerminalSize(): { columns: number; rows: number } {
  const [size, setSize] = useState<{ columns: number; rows: number }>(readCurrentSize);

  useEffect(() => {
    // Pending debounce timeout handle
    let debounceHandle: ReturnType<typeof setTimeout> | undefined;

    const onResize = (): void => {
      if (debounceHandle !== undefined) {
        clearTimeout(debounceHandle);
      }
      debounceHandle = setTimeout(() => {
        debounceHandle = undefined;
        setSize(readCurrentSize());
      }, DEBOUNCE_MS);
    };

    process.stderr.on('resize', onResize);

    return () => {
      process.stderr.off('resize', onResize);
      if (debounceHandle !== undefined) {
        clearTimeout(debounceHandle);
      }
    };
  }, []);

  return size;
}
