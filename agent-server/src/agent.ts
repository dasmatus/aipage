/**
 * The HTTP-independent core: validate an `/v1/agent` request, turn it into
 * Claude Agent SDK `query()` options, drain the message stream and reduce it
 * to the one-shot JSON reply the extension's CORS proxy expects (it has no
 * streaming, see CLAUDE.md "No streaming").
 *
 * `query` is injected so the tests can run without the Claude Code binary.
 */

import type { Options, SDKMessage, SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";

import type { ServerConfig } from "./config";

export const SERVER_VERSION = "0.1.0";

/** System prompt for the sidebar: Claude Code's own prompt is about software engineering. */
export const SYSTEM_PROMPT = [
  "You are AIPage, an AI assistant embedded as a sidebar in the EduPage school portal, running on Claude Code through the Claude Agent SDK.",
  "Students and teachers ask you questions about their school work and about the EduPage page they are looking at; when the message contains page content, base your answer on it.",
  "Answer in the language the user writes in, concisely, using Markdown.",
  "Use your web tools when a question needs current or external information, and cite the pages you used.",
].join(" ");

/** Body of `POST /v1/agent`. */
export interface AgentRequest {
  prompt: string;
  model?: string;
  /** Continue an earlier run (`session_id` from a previous reply). */
  session_id?: string;
}

/** Reply of `POST /v1/agent`. */
export interface AgentReply {
  text: string;
  session_id: string | null;
  is_error: boolean;
  num_turns: number;
  cost_usd: number;
  model: string;
}

export type QueryFn = (params: { prompt: string; options?: Options }) => AsyncIterable<SDKMessage>;

export class RequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const MAX_PROMPT_CHARS = 200_000;
const SESSION_ID_RE = /^[0-9a-fA-F-]{8,64}$/;
const MODEL_RE = /^[A-Za-z0-9._:\-[\]/]{1,128}$/;

/** Validate an untrusted JSON body. */
export function parseAgentRequest(body: unknown): AgentRequest {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new RequestError(400, "body must be a JSON object");
  }
  const { prompt, model, session_id } = body as Record<string, unknown>;
  if (typeof prompt !== "string" || prompt.trim() === "") {
    throw new RequestError(400, "`prompt` must be a non-empty string");
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    throw new RequestError(413, `\`prompt\` is longer than ${MAX_PROMPT_CHARS} characters`);
  }
  const req: AgentRequest = { prompt };
  if (model !== undefined && model !== null && model !== "") {
    if (typeof model !== "string" || !MODEL_RE.test(model)) throw new RequestError(400, "`model` is not a valid model id");
    req.model = model;
  }
  if (session_id !== undefined && session_id !== null && session_id !== "") {
    if (typeof session_id !== "string" || !SESSION_ID_RE.test(session_id)) {
      throw new RequestError(400, "`session_id` is not a valid session id");
    }
    req.session_id = session_id;
  }
  return req;
}

/** The SDK options for one run: only the configured tools exist, and only they are approved. */
export function buildOptions(req: AgentRequest, config: ServerConfig, abortController: AbortController): Options {
  return {
    model: req.model ?? config.defaultModel,
    resume: req.session_id,
    systemPrompt: SYSTEM_PROMPT,
    tools: config.tools,
    allowedTools: config.tools,
    permissionMode: config.permissionMode,
    maxTurns: config.maxTurns,
    cwd: config.cwd,
    // Isolation mode: ignore ~/.claude and project settings, hooks and CLAUDE.md on the host.
    settingSources: [],
    abortController,
    ...(config.claudePath ? { pathToClaudeCodeExecutable: config.claudePath } : {}),
    env: { ...process.env, CLAUDE_AGENT_SDK_CLIENT_APP: `aipage-agent-server/${SERVER_VERSION}` },
  };
}

/** Reduce the run's final `result` message to the reply. */
export function replyFromResult(result: SDKResultMessage | null, model: string): AgentReply {
  if (result === null) {
    return { text: "Claude Code finished without a result.", session_id: null, is_error: true, num_turns: 0, cost_usd: 0, model };
  }
  const base = {
    session_id: result.session_id ?? null,
    num_turns: result.num_turns,
    cost_usd: result.total_cost_usd,
    model,
  };
  if (result.subtype === "success") {
    return { ...base, text: result.result, is_error: result.is_error };
  }
  const detail = result.errors?.filter((e) => e.trim() !== "").join("\n");
  return { ...base, text: detail || `Claude Code stopped early (${result.subtype}).`, is_error: true };
}

/** Run one agent turn to completion. */
export async function runAgent(req: AgentRequest, config: ServerConfig, query: QueryFn): Promise<AgentReply> {
  const abortController = new AbortController();
  const timer = setTimeout(() => abortController.abort(), config.timeoutMs);
  const options = buildOptions(req, config, abortController);
  let result: SDKResultMessage | null = null;
  try {
    for await (const message of query({ prompt: req.prompt, options })) {
      if (message.type === "result") result = message;
    }
  } catch (e) {
    if (abortController.signal.aborted) {
      throw new RequestError(504, `Claude Code did not finish within ${config.timeoutMs} ms`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
  return replyFromResult(result, options.model ?? config.defaultModel);
}
