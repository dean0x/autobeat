/**
 * Unit tests for TmuxValidator
 * Tests validation logic with injected exec function — no real tmux required.
 */

import { describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '../../../../src/core/errors.js';
import { TmuxValidator } from '../../../../src/implementations/tmux/tmux-validator.js';
import type { ExecFn, ExecResult } from '../../../../src/implementations/tmux/types.js';

function makeExec(stdout: string, status = 0, jqPath = '/usr/bin/jq', tmuxPath = '/usr/bin/tmux'): ExecFn {
  return vi.fn().mockImplementation((cmd: string) => {
    if (cmd.includes('jq')) {
      return { stdout: jqPath, stderr: '', status: 0 } satisfies ExecResult;
    }
    if (cmd === 'command -v tmux') {
      return { stdout: tmuxPath, stderr: '', status: 0 } satisfies ExecResult;
    }
    return { stdout, stderr: '', status } satisfies ExecResult;
  });
}

function makeFailingExec(status = 127): ExecFn {
  return vi.fn().mockReturnValue({
    stdout: '',
    stderr: 'tmux: command not found',
    status,
  } satisfies ExecResult);
}

function makeExecWithJqMissing(tmuxStdout: string): ExecFn {
  return vi.fn().mockImplementation((cmd: string) => {
    if (cmd.includes('jq')) {
      return { stdout: '', stderr: '', status: 1 } satisfies ExecResult;
    }
    return { stdout: tmuxStdout, stderr: '', status: 0 } satisfies ExecResult;
  });
}

describe('TmuxValidator', () => {
  it('returns TMUX_VALIDATION_FAILED when tmux is not installed (status 127)', () => {
    const validator = new TmuxValidator({ exec: makeFailingExec(127) });
    const result = validator.validate();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(ErrorCode.TMUX_VALIDATION_FAILED);
  });

  it('returns TMUX_VALIDATION_FAILED when version is too old ("tmux 2.9")', () => {
    const validator = new TmuxValidator({ exec: makeExec('tmux 2.9') });
    const result = validator.validate();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(ErrorCode.TMUX_VALIDATION_FAILED);
    expect(result.error.context?.found).toBe('2.9');
    expect(result.error.context?.required).toBe('3.0');
  });

  it('returns TMUX_VALIDATION_FAILED when version output is unparseable', () => {
    const validator = new TmuxValidator({ exec: makeExec('something completely unexpected') });
    const result = validator.validate();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(ErrorCode.TMUX_VALIDATION_FAILED);
  });

  it('returns ok for valid tmux 3.4 with jqPath', () => {
    const validator = new TmuxValidator({ exec: makeExec('tmux 3.4') });
    const result = validator.validate();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.version).toBe('3.4');
    expect(result.value.path).toBe('/usr/bin/tmux');
    expect(result.value.jqPath).toBe('/usr/bin/jq');
  });

  it('strips version suffix — "tmux 3.4a" → version "3.4"', () => {
    const validator = new TmuxValidator({ exec: makeExec('tmux 3.4a') });
    const result = validator.validate();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.version).toBe('3.4');
  });

  it('handles pre-release format "tmux next-3.5" → version "3.5"', () => {
    const validator = new TmuxValidator({ exec: makeExec('tmux next-3.5') });
    const result = validator.validate();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.version).toBe('3.5');
  });

  it('accepts the exact minimum version "tmux 3.0"', () => {
    const validator = new TmuxValidator({ exec: makeExec('tmux 3.0') });
    const result = validator.validate();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.version).toBe('3.0');
  });

  it('correctly handles multi-digit minor — "tmux 3.10" is greater than "tmux 3.9"', () => {
    const v310 = new TmuxValidator({ exec: makeExec('tmux 3.10') });
    const v39 = new TmuxValidator({ exec: makeExec('tmux 3.9') });

    const r310 = v310.validate();
    const r39 = v39.validate();

    // Both should succeed (> 3.0)
    expect(r310.ok).toBe(true);
    expect(r39.ok).toBe(true);

    if (!r310.ok || !r39.ok) return;
    // Version 3.10 should parse as 3.10, not 3.1
    expect(r310.value.version).toBe('3.10');
    expect(r39.value.version).toBe('3.9');
  });

  it('caches validation result — exec is called only 3 times (tmux -V + command -v jq + command -v tmux) across multiple validate() calls', () => {
    const exec = makeExec('tmux 3.4');
    const validator = new TmuxValidator({ exec });

    validator.validate();
    validator.validate();
    validator.validate();

    expect(exec).toHaveBeenCalledTimes(3);
  });

  // ─── jq validation ──────────────────────────────────────────────────────────

  it('returns TMUX_VALIDATION_FAILED when jq is not installed', () => {
    const validator = new TmuxValidator({ exec: makeExecWithJqMissing('tmux 3.4') });
    const result = validator.validate();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(ErrorCode.TMUX_VALIDATION_FAILED);
    expect(result.error.message).toContain('jq');
  });

  it('returns ok with jqPath when both tmux and jq are present', () => {
    const validator = new TmuxValidator({ exec: makeExec('tmux 3.4', 0, '/opt/homebrew/bin/jq') });
    const result = validator.validate();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.jqPath).toBe('/opt/homebrew/bin/jq');
  });

  it('tmux failure short-circuits — jq check never runs', () => {
    const exec = makeFailingExec(127);
    const validator = new TmuxValidator({ exec });
    validator.validate();
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it('caches jq result along with tmux — all 3 checks run only on first validate()', () => {
    const exec = makeExec('tmux 3.4');
    const validator = new TmuxValidator({ exec });

    validator.validate();
    validator.validate();
    validator.validate();

    expect(exec).toHaveBeenCalledTimes(3);
  });

  it('error message for missing jq includes install guidance', () => {
    const validator = new TmuxValidator({ exec: makeExecWithJqMissing('tmux 3.4') });
    const result = validator.validate();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('jq');
    expect(result.error.message).toContain('install');
  });

  // DESIGN DECISION: only success results are cached; failures are returned immediately
  // so a transient error (e.g. PATH not yet set) does not permanently poison the validator.
  it('failure result is NOT cached — a second validate() re-runs exec even after the first fails', () => {
    // First call: tmux not found (status 127). Second call: tmux present (status 0).
    const exec = vi
      .fn()
      .mockImplementationOnce((_cmd: string) => ({
        stdout: '',
        stderr: 'tmux: command not found',
        status: 127,
      }))
      .mockImplementation((cmd: string) => {
        if (cmd.includes('jq')) return { stdout: '/usr/bin/jq', stderr: '', status: 0 };
        if (cmd === 'command -v tmux') return { stdout: '/usr/bin/tmux', stderr: '', status: 0 };
        return { stdout: 'tmux 3.4', stderr: '', status: 0 };
      }) as ExecFn;

    const validator = new TmuxValidator({ exec });

    const first = validator.validate();
    expect(first.ok).toBe(false);

    // If failures were cached, exec would still have been called only once.
    // The failure is NOT cached, so exec runs again on the second call.
    const second = validator.validate();
    expect(second.ok).toBe(true);

    // exec was called at least twice — once for the first (failed) validate(),
    // and at least once more for the second (successful) validate().
    expect(exec).toHaveBeenCalledTimes(
      // first call: 1 exec (tmux -V fails, short-circuits before jq)
      // second call: 3 execs (tmux -V + command -v jq + command -v tmux)
      4,
    );
  });
});
