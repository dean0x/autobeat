# Autobeat v1.5.0 — Cross-Platform Agents & Interactive Orchestration

Three new features, a dashboard overhaul, and docs alignment. API translation proxy enables Claude on OpenAI-compatible backends. Ollama runtime wraps agent spawns for local LLM execution. Interactive orchestrator mode brings foreground TTY orchestration with SIGINT coordination.

---

## Highlights

- **API translation proxy**: HTTP proxy translating Anthropic Messages API to OpenAI Chat Completions — run Claude-targeting agents on any OpenAI-compatible backend
- **Ollama runtime integration**: Wrap agent spawns with `ollama launch` for local LLM execution; mutually exclusive with proxy
- **Interactive orchestrator mode**: `beat orchestrate --interactive/-i` — foreground TTY with SIGINT coordination and PID tracking
- **Dashboard layout overhaul**: Responsive 3-tile top row, full-width entity browser, full entity names, degraded modes
- **Skills/docs alignment**: Skill content updated to cover v1.2.0–v1.4.0 features

---

## API Translation Proxy

HTTP proxy that translates Anthropic Messages API requests to OpenAI Chat Completions format. Enables Claude-targeting agents to run on any OpenAI-compatible backend (OpenRouter, Together, local vLLM, etc.).

### Architecture

- **Codecs** (`src/translation/codecs/`): Bidirectional request/response translation between Anthropic and OpenAI formats
- **Middleware** (`src/translation/middleware/`): Streaming adapter, error mapping, header normalization
- **Proxy** (`src/translation/proxy/`): HTTP server with codec + middleware pipeline
- **IR** (`src/translation/ir.ts`): Intermediate representation for format-agnostic message passing

### Configuration

```bash
# Enable proxy for an agent
beat agents config set claude proxy openai

# Remove proxy
beat agents config set claude proxy none
```

### MCP

```json
{
  "tool": "ConfigureAgent",
  "arguments": {
    "agent": "claude",
    "proxy": "openai"
  }
}
```

---

## Ollama Runtime Integration

Wraps agent spawns with `ollama launch` for local LLM execution. The runtime manages the Ollama process lifecycle alongside the agent.

### Configuration

```bash
# Enable Ollama runtime for an agent
beat agents config set gemini runtime ollama

# Remove runtime
beat agents config set gemini runtime none
```

Proxy and runtime are mutually exclusive — setting one clears the other.

### Model Names

Model schema relaxed to accept `/`, `:`, `@` separators for Ollama-style identifiers (e.g., `llama3:8b`, `mistral@latest`).

---

## Interactive Orchestrator Mode

Foreground TTY orchestration with SIGINT coordination and PID tracking. The orchestrator runs in the current terminal session rather than as a background process.

### CLI

```bash
# Start interactive orchestration
beat orchestrate --interactive "Build auth system"
beat orchestrate -i "Build auth system"
```

### Behavior

- Runs in foreground — terminal attached to orchestrator output
- SIGINT (Ctrl+C) gracefully stops the orchestration and all child tasks
- PID tracked in `orchestrations.pid` column for process management
- Mode stored in `orchestrations.mode` column (`standard` or `interactive`)

---

## Dashboard Layout Overhaul

Responsive layout with 3-tile top row, full-width entity browser, and full entity names.

- **3-tile top row**: Tasks, Workers, and Orchestrations summary tiles
- **Full-width entity browser**: Expanded view with full entity names (no truncation)
- **Degraded modes**: Graceful fallback for narrow terminals
- **Pipeline management MCP tools**: `PipelineStatus`, `ListPipelines`, `CancelPipeline`

---

## Database

- **Migration v24**: `pipelines` table — first-class pipeline entities with steps, status, foreign keys, and indexes
- **Migration v25**: `orchestrations.mode` (CHECK: standard/interactive) and `orchestrations.pid` columns for interactive orchestrator mode

---

## What's Changed Since v1.4.0

- API translation proxy — Anthropic Messages API to OpenAI Chat Completions (#152)
- Dashboard layout overhaul — 3-tile responsive, full-width entity browser (#153)
- Ollama runtime integration + translate → proxy rename (#157)
- Skills/docs alignment with v1.2.0–v1.4.0 features (#158)
- Interactive orchestrator mode — `--interactive/-i` flag (#159)

---

## Migration Notes

- **Migrations v24 and v25** are auto-applied on first startup — no user action required
- The `translate` command has been renamed to `proxy` in agent configuration — existing configs will continue to work but the new name is preferred
- No breaking changes to CLI, MCP tools, or configuration

---

## Installation

```bash
npm install -g autobeat@1.5.0
```

Or via npx in your MCP config:

```json
{
  "mcpServers": {
    "autobeat": {
      "command": "npx",
      "args": ["-y", "autobeat@1.5.0", "mcp", "start"]
    }
  }
}
```

---

## Links

- [npm](https://www.npmjs.com/package/autobeat)
- [Documentation](https://github.com/dean0x/autobeat)
- [Issues](https://github.com/dean0x/autobeat/issues)
