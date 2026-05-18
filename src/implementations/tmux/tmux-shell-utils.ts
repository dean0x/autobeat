/**
 * Shell quoting utilities for the tmux abstraction layer.
 *
 * Two distinct operations are provided so callers express their intent clearly:
 *   - escapeForSingleQuotes(s) — escapes a string for embedding inside an
 *     already-open single-quoted shell context. Caller is responsible for
 *     the surrounding quotes.
 *   - singleQuoteToken(s) — escapes and wraps a string in single quotes,
 *     producing a complete, standalone shell token.
 *
 * The standard shell technique to embed a single quote inside a single-quoted
 * string is to end the quoted segment, insert an escaped single quote, then
 * re-open the quoted segment:
 *   original: it's
 *   escaped:  it'\''s
 *   as token: 'it'\''s'
 *
 * SECURITY: These utilities are the single source of truth for single-quote
 * escaping in generated shell scripts. Callers must not duplicate this logic.
 */

/**
 * Escapes a string for safe embedding inside an already-open bash
 * single-quoted string. Only single quotes need escaping — all other
 * characters are literal inside single quotes per POSIX shell rules.
 *
 * Use when the surrounding single quotes are supplied by the caller:
 *   `'${escapeForSingleQuotes(value)}'`
 */
export function escapeForSingleQuotes(s: string): string {
  return s.replace(/'/g, "'\\''");
}

/**
 * Escapes a string and wraps it in single quotes, producing a complete
 * shell token safe for use anywhere a shell word is expected.
 *
 * Use when you need a self-contained, fully quoted shell argument or value:
 *   `singleQuoteToken(arg)` → `'escaped-content'`
 */
export function singleQuoteToken(s: string): string {
  return `'${escapeForSingleQuotes(s)}'`;
}
