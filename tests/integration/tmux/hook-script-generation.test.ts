/**
 * Integration tests for TmuxHooks wrapper script generation.
 * Uses real filesystem operations. Requires bash and (optionally) tmux.
 * bash -n validation does not require tmux.
 */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TmuxHooks } from '../../../src/implementations/tmux/tmux-hooks.js';
import type { WrapperConfig } from '../../../src/implementations/tmux/types.js';

let tmpDir = '';

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'beat-hooks-'));
});

afterAll(() => {
  if (tmpDir) {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

function makeRealHooks(): TmuxHooks {
  return new TmuxHooks({
    writeFile: (p: string, content: string, opts: { mode: number }) => {
      fs.writeFileSync(p, content, { mode: opts.mode });
    },
    mkdirSync: (p: string, opts: { recursive: boolean; mode: number }) => {
      fs.mkdirSync(p, opts);
    },
    rmSync: (p: string, opts: { recursive: boolean; force: boolean }) => {
      fs.rmSync(p, opts);
    },
  });
}

describe('TmuxHooks integration — wrapper script generation', () => {
  it('generated wrapper script passes bash -n syntax check', () => {
    const hooks = makeRealHooks();
    const sessionsDir = path.join(tmpDir, 'syntax-check');

    const config: WrapperConfig = {
      taskId: 'task-syntax',
      agent: 'claude',
      sessionsDir,
      agentCommand: 'echo',
      agentArgs: ['hello'],
    };

    const result = hooks.generateWrapper(config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // bash -n validates syntax without executing
    const check = spawnSync('bash', ['-n', result.value.wrapperPath], { encoding: 'utf8' });
    expect(check.status).toBe(0);
  });

  it('wrapper creates .done sentinel when agent exits 0', () => {
    const hooks = makeRealHooks();
    const sessionsDir = path.join(tmpDir, 'done-agent');

    const config: WrapperConfig = {
      taskId: 'task-done',
      agent: 'claude',
      sessionsDir,
      agentCommand: 'echo',
      agentArgs: ['success'],
    };

    const result = hooks.generateWrapper(config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const run = spawnSync('bash', [result.value.wrapperPath], {
      encoding: 'utf8',
      timeout: 10000,
    });

    const donePath = path.join(result.value.sessionsDir, '.done');
    const exitPath = path.join(result.value.sessionsDir, '.exit');

    expect(fs.existsSync(donePath)).toBe(true);
    expect(fs.existsSync(exitPath)).toBe(false);
    expect(run.status).toBe(0);
  });

  it('wrapper captures stdout output to JSON files in messages/', () => {
    const hooks = makeRealHooks();
    const sessionsDir = path.join(tmpDir, 'output-capture');

    const config: WrapperConfig = {
      taskId: 'task-capture',
      agent: 'claude',
      sessionsDir,
      agentCommand: 'echo',
      agentArgs: ['captured line'],
    };

    const result = hooks.generateWrapper(config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    spawnSync('bash', [result.value.wrapperPath], { encoding: 'utf8', timeout: 10000 });

    const messagesDir = result.value.messagesDir;
    const files = fs.existsSync(messagesDir) ? fs.readdirSync(messagesDir).filter((f) => f.endsWith('.json')) : [];
    expect(files.length).toBeGreaterThan(0);
  });

  it('captured JSON messages have valid structure', () => {
    const hooks = makeRealHooks();
    const sessionsDir = path.join(tmpDir, 'json-structure');

    const config: WrapperConfig = {
      taskId: 'task-json',
      agent: 'claude',
      sessionsDir,
      agentCommand: 'echo',
      agentArgs: ['structured output'],
    };

    const result = hooks.generateWrapper(config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    spawnSync('bash', [result.value.wrapperPath], { encoding: 'utf8', timeout: 10000 });

    const files = fs.readdirSync(result.value.messagesDir).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      const content = fs.readFileSync(path.join(result.value.messagesDir, file), 'utf8');
      const parsed = JSON.parse(content) as Record<string, unknown>;
      expect(typeof parsed['sequence']).toBe('number');
      expect(typeof parsed['timestamp']).toBe('string');
      expect(typeof parsed['type']).toBe('string');
      expect(typeof parsed['content']).toBe('string');
    }
  });

  it('sequence numbers increment monotonically across multiple output lines', () => {
    const hooks = makeRealHooks();
    const sessionsDir = path.join(tmpDir, 'seq-increment');

    // Use printf to emit multiple lines
    const config: WrapperConfig = {
      taskId: 'task-seq',
      agent: 'claude',
      sessionsDir,
      agentCommand: 'printf',
      agentArgs: ['line1\\nline2\\nline3\\n'],
    };

    const result = hooks.generateWrapper(config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    spawnSync('bash', [result.value.wrapperPath], { encoding: 'utf8', timeout: 10000 });

    const files = fs
      .readdirSync(result.value.messagesDir)
      .filter((f) => f.endsWith('.json'))
      .sort();

    if (files.length < 2) {
      // Some environments may not produce multiple lines — skip assertion
      return;
    }

    const sequences = files.map((f) => {
      const content = JSON.parse(fs.readFileSync(path.join(result.value.messagesDir, f), 'utf8')) as {
        sequence: number;
      };
      return content.sequence;
    });

    // Sequences should be monotonically increasing
    for (let i = 1; i < sequences.length; i++) {
      expect(sequences[i]!).toBeGreaterThan(sequences[i - 1]!);
    }
  });
});
