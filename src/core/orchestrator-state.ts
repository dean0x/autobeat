/**
 * Orchestrator state file management
 * ARCHITECTURE: Atomic file I/O for orchestrator state persistence
 * Pattern: Follows configuration.ts file I/O conventions (mkdirSync, writeFileSync, renameSync)
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { err, ok, type Result } from './result.js';

/**
 * Orchestrator state file schema
 * Written and read by the orchestrator agent loop to track progress
 */
export interface OrchestratorStateFile {
  readonly version: 1;
  readonly goal: string;
  readonly status: 'planning' | 'executing' | 'validating' | 'complete' | 'failed';
  readonly plan: readonly OrchestratorPlanStep[];
  readonly context: Record<string, unknown>;
  readonly iterationCount: number;
}

/**
 * Individual plan step within the orchestrator state
 */
export interface OrchestratorPlanStep {
  readonly id: string;
  readonly description: string;
  readonly status: 'pending' | 'in_progress' | 'completed' | 'failed';
  readonly taskId?: string;
  readonly dependsOn?: readonly string[];
  readonly failureCount?: number;
  readonly lastError?: string;
}

/**
 * Get the orchestrator state directory path
 */
export function getStateDir(): string {
  return path.join(os.homedir(), '.autobeat', 'orchestrator-state');
}

/**
 * Create the initial state file content for a new orchestration
 */
export function createInitialState(goal: string): OrchestratorStateFile {
  return {
    version: 1,
    goal,
    status: 'planning',
    plan: [],
    context: {},
    iterationCount: 0,
  };
}

/**
 * Write state file atomically (temp file + rename)
 * ARCHITECTURE: Atomic write prevents corruption on crash
 * Pattern: Follows configuration.ts writeConfigFile() conventions
 */
export function writeStateFile(filePath: string, state: OrchestratorStateFile): void {
  const dir = path.dirname(filePath);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmpPath = `${filePath}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(state, null, 2), { encoding: 'utf-8', mode: 0o600 });
  renameSync(tmpPath, filePath);
}

/**
 * Read state file with graceful error handling
 * Returns ok(state) on success, err on missing file or malformed JSON
 */
export function readStateFile(filePath: string): Result<OrchestratorStateFile> {
  try {
    const raw = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || parsed.version !== 1) {
      return err(new Error(`Invalid state file format at ${filePath}`));
    }
    return ok(parsed as OrchestratorStateFile);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return err(new Error(`Failed to read state file at ${filePath}: ${message}`));
  }
}

/**
 * Write the exit condition checker script for the orchestrator loop
 * Returns the absolute path to the script
 */
export function writeExitConditionScript(dir: string, stateFilePath: string): string {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const scriptPath = path.join(dir, 'check-complete.js');
  const script = `try {
  const s = JSON.parse(require('fs').readFileSync(process.argv[2] || ${JSON.stringify(stateFilePath)}, 'utf8'));
  process.exit(s.status === 'complete' ? 0 : 1);
} catch { process.exit(1); }
`;
  writeFileSync(scriptPath, script, { encoding: 'utf-8', mode: 0o700 });
  return scriptPath;
}
