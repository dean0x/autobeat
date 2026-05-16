/**
 * tmux abstraction layer — public API
 *
 * Provides foundational tmux session management, wrapper script generation,
 * and push-based completion detection for the v1.6.0 worker migration.
 */

export type { SpawnCallbacks, TmuxConnectorDeps } from './tmux-connector.js';
export { TmuxConnector } from './tmux-connector.js';
export type { TmuxHooksDeps } from './tmux-hooks.js';
export { TmuxHooks } from './tmux-hooks.js';
export { TmuxSessionManager } from './tmux-session-manager.js';
// Implementations
export { TmuxValidator } from './tmux-validator.js';
// Types (type-only re-exports to avoid unnecessary runtime imports)
export type {
  CommunicationMode,
  ExecFn,
  ExecResult,
  OutputMessage,
  StalenessConfig,
  TmuxHandle,
  TmuxInfo,
  TmuxSessionConfig,
  TmuxSessionInfo,
  TmuxSpawnConfig,
  WrapperConfig,
  WrapperManifest,
} from './types.js';
// Constants
export {
  DEFAULT_STALENESS_CONFIG,
  MAX_CONCURRENT_SESSIONS,
  SENTINEL_DONE,
  SENTINEL_EXIT,
  SESSION_NAME_PREFIX,
  SESSION_NAME_REGEX,
} from './types.js';
