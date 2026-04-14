# Autobeat v1.4.0 — Evaluator Redesign & Reliability

New evaluation modes for loops, a two-phase judge evaluator, atomic PID file management, and a suite of internal reliability improvements targeting testability and correctness in the loop/schedule execution path.

---

## Highlights

- **Three evaluation modes**: `agent` (unchanged), `feedforward` (findings without a stop decision), and `judge` (two-phase eval+judge with TOCTOU-safe file decisions)
- **Atomic PID file locking**: Schedule executor uses O_EXCL file creation to prevent double-execution races
- **SpawnOptions refactor**: `AgentAdapter.spawn()` now accepts a named options object instead of 6 positional parameters
- **Extracted pure functions**: `refetchAfterAgentEval`, `handleStopDecision`, `buildEvalPromptBase`, `checkActiveSchedules`, `registerSignalHandlers`, `startIdleCheckLoop` — all fully unit-tested

---

## New Evaluation Modes

### Feedforward (`evalType: feedforward`)

Gathers agent findings on every iteration and injects them as context into the next iteration's prompt — without making a stop/continue decision. The loop always runs to `maxIterations`.

Use this when you want progressive feedback during iteration but don't need a quality gate.

```json
{
  "evalType": "feedforward",
  "evalPrompt": "Review the changes and note any issues for the next iteration.",
  "maxIterations": 10
}
```

### Judge (`evalType: judge`)

Two-phase evaluation:

1. **Eval agent** (phase 1): runs `evalPrompt` and produces narrative findings
2. **Judge agent** (phase 2): reads findings and writes a structured JSON decision to `.autobeat-judge-{judgeTaskId}` in the working directory

The unique per-task filename prevents TOCTOU races with the work agent. Claude's `--json-schema` is used as belt-and-suspenders when `judgeAgent: 'claude'`.

```json
{
  "evalType": "judge",
  "evalPrompt": "Review the test suite and identify any remaining failures.",
  "judgeAgent": "claude",
  "judgePrompt": "Based on the findings, should iteration continue? Stop when all tests pass."
}
```

Decision file format written by the judge agent:
```json
{"continue": true, "reasoning": "3 tests still failing — keep going."}
```
or
```json
{"continue": false, "reasoning": "All tests pass and code review is clean."}
```

---

## Reliability Improvements

### Atomic PID File Locking (#141)

The schedule executor now uses `O_EXCL` (create-or-fail) semantics when acquiring its PID file. Concurrent executor startups cannot both succeed — one receives `already-running` and exits cleanly. Stale PID files from crashed processes are detected via liveness check and cleaned up automatically.

```
acquirePidFile(pidPath, pid) → Result<'acquired' | 'already-running', Error>
```

### SpawnOptions Interface (#139)

`AgentAdapter.spawn()` now accepts a single `SpawnOptions` object:

```typescript
interface SpawnOptions {
  readonly prompt: string;
  readonly workingDirectory: string;
  readonly taskId?: string;
  readonly model?: string;
  readonly orchestratorId?: string;
  readonly jsonSchema?: string;
}
```

This is an internal refactor — no observable behaviour change. Existing functionality is identical.

---

## Architecture Notes

### New Modules

| Module | Purpose |
|--------|---------|
| `src/services/feedforward-evaluator.ts` | Feedforward exit condition evaluator |
| `src/services/judge-exit-condition-evaluator.ts` | Two-phase eval+judge evaluator |
| `src/services/eval-prompt-builder.ts` | Shared eval prompt context builder |
| `src/core/agents.ts` → `SpawnOptions` | Named spawn options interface |
| `tests/fixtures/eval-test-helpers.ts` | Shared eval test fixtures |

### Extracted Pure Functions

All extracted functions are DI-injectable and have dedicated unit tests:

- `refetchAfterAgentEval(loop, taskId)` — stale-state guard in `LoopHandler`
- `handleStopDecision(loop, iteration, evalResult, status)` — stop-path logic in `LoopHandler`
- `buildEvalPromptBase(loop, taskId, loopRepo)` — shared eval prompt context
- `acquirePidFile(pidPath, pid)` — atomic PID file locking
- `checkActiveSchedules(scheduleRepo)` — schedule liveness check
- `registerSignalHandlers(cleanup, proc?)` — SIGTERM/SIGINT registration
- `startIdleCheckLoop(scheduleRepo, intervalMs, onIdle, warn)` — idle exit timer

---

## Database

No new migrations in v1.4.0. All changes are in-process behaviour.

---

## What's Changed Since v1.3.0

- #136 — feat: feedforward and judge evaluator modes
- #137 — refactor(loop-handler): extract refetchAfterAgentEval helper
- #138 — refactor(loop-handler): extract handleStopDecision helper
- #139 — refactor(agents): SpawnOptions object replaces 6 positional spawn() params
- #140 — refactor(eval): extract buildEvalPromptBase shared utility
- #141 — fix(schedule-executor): atomic PID file locking with sentinel result
- #142 — refactor(schedule-executor): extract pure functions with DI for testability
- #143 — refactor(tests): extract shared eval test fixtures

---

## Migration Notes

- **`AgentAdapter.spawn()` signature change**: If you have custom `AgentAdapter` implementations (not using `BaseAgentAdapter`), update `spawn(prompt, workingDirectory, ...)` to `spawn({ prompt, workingDirectory, ... })`. The `ProcessSpawnerAdapter` compatibility shim is unaffected.
- No database migrations — no schema changes.
- No config changes — new `evalType`, `judgeAgent`, `judgePrompt` fields are optional with sensible defaults.

---

## Installation

```bash
npm install -g autobeat@1.4.0
```

MCP config (npx):
```json
{
  "mcpServers": {
    "autobeat": {
      "command": "npx",
      "args": ["-y", "autobeat@1.4.0", "mcp", "start"]
    }
  }
}
```

---

## Links

- [npm](https://www.npmjs.com/package/autobeat)
- [GitHub Issues](https://github.com/dean0x/autobeat/issues)
- [Changelog](../../CHANGELOG.md)
