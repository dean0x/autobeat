/**
 * TmuxValidator — validates tmux installation and version
 *
 * DESIGN DECISION: Caches the validation result for the process lifetime to
 * avoid repeated exec() calls on every spawn. The tmux binary does not change
 * while a process is running.
 */

import { AutobeatError, tmuxValidationFailed } from '../../core/errors.js';
import { err, ok, Result } from '../../core/result.js';
import { ExecFn, TmuxInfo } from './types.js';

/** Minimum required tmux version */
const MIN_MAJOR = 3;
const MIN_MINOR = 0;

/**
 * Parses a tmux version string and returns [major, minor] as numbers.
 *
 * Handles formats:
 *   "tmux 3.4"      → [3, 4]
 *   "tmux 3.4a"     → [3, 4]
 *   "tmux next-3.5" → [3, 5]
 *   "tmux 3.10"     → [3, 10]   (numeric, not lexicographic)
 */
function parseVersion(output: string): [number, number] | null {
  // Strip prefix words like "tmux" and "next-", then find the first M.N pattern
  const match = /(\d+)\.(\d+)/.exec(output);
  if (!match) return null;
  return [parseInt(match[1]!, 10), parseInt(match[2]!, 10)];
}

function isVersionSufficient(major: number, minor: number): boolean {
  if (major > MIN_MAJOR) return true;
  if (major === MIN_MAJOR && minor >= MIN_MINOR) return true;
  return false;
}

export class TmuxValidator {
  private cached: Result<TmuxInfo, AutobeatError> | null = null;

  constructor(private readonly deps: { exec: ExecFn }) {}

  /**
   * Validates that tmux is installed and meets the minimum version requirement.
   * Result is cached for the process lifetime.
   */
  validate(): Result<TmuxInfo, AutobeatError> {
    if (this.cached !== null) {
      return this.cached;
    }

    const result = this.runValidation();
    this.cached = result;
    return result;
  }

  private runValidation(): Result<TmuxInfo, AutobeatError> {
    const execResult = this.deps.exec('tmux -V');

    if (execResult.status !== 0) {
      return err(
        tmuxValidationFailed('tmux is not installed or not found in PATH', {
          exitStatus: execResult.status,
          stderr: execResult.stderr,
        }),
      );
    }

    const raw = execResult.stdout.trim();
    const parsed = parseVersion(raw);

    if (!parsed) {
      return err(tmuxValidationFailed(`Cannot parse version from output: "${raw}"`, { output: raw }));
    }

    const [major, minor] = parsed;

    if (!isVersionSufficient(major, minor)) {
      return err(
        tmuxValidationFailed(`tmux version ${major}.${minor} is below minimum required ${MIN_MAJOR}.${MIN_MINOR}`, {
          found: `${major}.${minor}`,
          required: `${MIN_MAJOR}.${MIN_MINOR}`,
        }),
      );
    }

    return ok({
      version: `${major}.${minor}`,
      path: 'tmux',
    });
  }
}
