/**
 * Server configuration, read once from the environment.
 *
 * Every knob has a safe default: loopback only, no token, and Claude Code
 * limited to the read-only web tools (`WebSearch`, `WebFetch`) with every
 * other tool call denied (`permissionMode: "dontAsk"`).
 */

import type { PermissionMode } from "@anthropic-ai/claude-agent-sdk";

export interface ServerConfig {
  /** Interface to bind; loopback by default so only this machine can call it. */
  host: string;
  port: number;
  /** Optional shared secret; when set every `/v1/*` request needs `Authorization: Bearer <token>`. */
  token: string | null;
  /** Model used when a request names none. */
  defaultModel: string;
  /** Models advertised on `GET /v1/models` (the sidebar's model picker). */
  models: string[];
  /** Built-in Claude Code tools the agent may use; each is also pre-approved. */
  tools: string[];
  permissionMode: PermissionMode;
  maxTurns: number;
  /**
   * Abort a run after this long (the extension proxy is one-shot, so a hung
   * run would hang the chat). At most 250 s: Bun drops a connection idle for
   * more than 255 s.
   */
  timeoutMs: number;
  /** Working directory of the Claude Code process. */
  cwd: string;
  /** Claude Code executable to run instead of the binary bundled with the SDK (e.g. an installed `claude`). */
  claudePath: string | null;
  /** Extra web origins allowed to call the server besides browser-extension origins. */
  allowedOrigins: string[];
}

export const DEFAULT_MODELS = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"];
export const DEFAULT_TOOLS = ["WebSearch", "WebFetch"];
export const MAX_TIMEOUT_MS = 250_000;

const PERMISSION_MODES: readonly PermissionMode[] = [
  "default",
  "acceptEdits",
  "bypassPermissions",
  "plan",
  "dontAsk",
  "auto",
];

/** Split a comma-separated list, dropping blanks. */
export function parseList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function parsePositiveInt(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${name} must be a positive integer, got "${raw}"`);
  return n;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  const permissionMode = (env.AIPAGE_AGENT_PERMISSION_MODE ?? "dontAsk") as PermissionMode;
  if (!PERMISSION_MODES.includes(permissionMode)) {
    throw new Error(`AIPAGE_AGENT_PERMISSION_MODE must be one of ${PERMISSION_MODES.join(", ")}`);
  }
  if (permissionMode === "bypassPermissions") {
    throw new Error("AIPAGE_AGENT_PERMISSION_MODE=bypassPermissions is not supported: list the tools you want in AIPAGE_AGENT_TOOLS instead");
  }
  const models = parseList(env.AIPAGE_AGENT_MODELS);
  const defaultModel = env.AIPAGE_AGENT_MODEL?.trim() || models[0] || DEFAULT_MODELS[0];
  const tools = env.AIPAGE_AGENT_TOOLS === undefined ? DEFAULT_TOOLS : parseList(env.AIPAGE_AGENT_TOOLS);
  return {
    host: env.HOST?.trim() || "127.0.0.1",
    port: parsePositiveInt(env.PORT, 8787, "PORT"),
    token: env.AIPAGE_AGENT_TOKEN?.trim() || null,
    defaultModel,
    models: models.length > 0 ? models : DEFAULT_MODELS,
    tools,
    permissionMode,
    maxTurns: parsePositiveInt(env.AIPAGE_AGENT_MAX_TURNS, 8, "AIPAGE_AGENT_MAX_TURNS"),
    timeoutMs: Math.min(MAX_TIMEOUT_MS, parsePositiveInt(env.AIPAGE_AGENT_TIMEOUT_MS, 180_000, "AIPAGE_AGENT_TIMEOUT_MS")),
    cwd: env.AIPAGE_AGENT_CWD?.trim() || process.cwd(),
    claudePath: env.AIPAGE_AGENT_CLAUDE_PATH?.trim() || null,
    allowedOrigins: parseList(env.AIPAGE_AGENT_ALLOWED_ORIGINS),
  };
}
