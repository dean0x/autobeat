/**
 * Shared helpers for tmux integration tests.
 * Both session-lifecycle.test.ts and sentinel-detection.test.ts import from here
 * to avoid implementation divergence.
 */

import { spawnSync } from 'child_process';
import type { ExecResult } from '../../../src/implementations/tmux/types.js';

export function realExec(cmd: string): ExecResult {
  const result = spawnSync('sh', ['-c', cmd], { encoding: 'utf8' });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status ?? 1,
  };
}

export function isTmuxAvailable(): boolean {
  // Check binary exists and is >= 3.0
  const versionCheck = realExec('which tmux && tmux -V');
  if (versionCheck.status !== 0) return false;
  const match = /(\d+)\.(\d+)/.exec(versionCheck.stdout);
  if (!match) return false;
  const [, major, minor] = match;
  const versionOk = (parseInt(major!, 10) === 3 && parseInt(minor!, 10) >= 0) || parseInt(major!, 10) > 3;
  if (!versionOk) return false;

  // Verify the tmux server is functional — not just that the binary exists.
  // CI environments may have the binary installed but no server/socket support.
  // Attempt to create and immediately destroy a probe session.
  const probeSession = 'beat-ci-probe';
  const probe = realExec(`tmux new-session -d -s ${probeSession} 'exit' && tmux kill-session -t ${probeSession}`);
  return probe.status === 0;
}
