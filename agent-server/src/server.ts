/**
 * HTTP routes, written against the web-standard `Request`/`Response` so the
 * handler runs under `Bun.serve` and in tests alike.
 *
 *   GET  /health     → { ok, name, version }                     (no auth)
 *   GET  /v1/models  → { data: [{ id }] }                        (OpenAI-shaped)
 *   POST /v1/agent   → AgentReply for { prompt, model?, session_id? }
 *
 * The extension reaches the server through its background CORS proxy, so the
 * calls carry a browser-extension `Origin` (or none, from curl). Any other
 * origin is refused: the server listens on loopback, and an ordinary web page
 * must not be able to drive the agent from the user's browser.
 */

import { type QueryFn, RequestError, runAgent, parseAgentRequest, SERVER_VERSION } from "./agent";
import type { ServerConfig } from "./config";

const EXTENSION_ORIGIN_RE = /^(chrome-extension|moz-extension|safari-web-extension):\/\/[^/]+$/;

export function isAllowedOrigin(origin: string | null, config: ServerConfig): boolean {
  if (origin === null) return true;
  return EXTENSION_ORIGIN_RE.test(origin) || config.allowedOrigins.includes(origin);
}

/** Constant-time-ish comparison so the token is not leaked through timing. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function isAuthorized(header: string | null, config: ServerConfig): boolean {
  if (config.token === null) return true;
  const match = /^Bearer\s+(.+)$/i.exec(header ?? "");
  return match !== null && safeEqual(match[1].trim(), config.token);
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function error(status: number, message: string): Response {
  return json(status, { error: { message } });
}

export function createHandler(config: ServerConfig, query: QueryFn): (req: Request) => Promise<Response> {
  return async (req) => {
    const url = new URL(req.url);

    if (url.pathname === "/health" && req.method === "GET") {
      return json(200, { ok: true, name: "aipage-agent-server", version: SERVER_VERSION });
    }

    if (!url.pathname.startsWith("/v1/")) return error(404, "not found");
    if (!isAllowedOrigin(req.headers.get("Origin"), config)) return error(403, "origin not allowed");
    if (!isAuthorized(req.headers.get("Authorization"), config)) return error(401, "missing or invalid token");

    if (url.pathname === "/v1/models") {
      if (req.method !== "GET") return error(405, "method not allowed");
      return json(200, { object: "list", data: config.models.map((id) => ({ id, object: "model" })) });
    }

    if (url.pathname === "/v1/agent") {
      if (req.method !== "POST") return error(405, "method not allowed");
      // A JSON content type forces a CORS preflight from web pages, which this server never answers.
      if (!(req.headers.get("Content-Type") ?? "").toLowerCase().startsWith("application/json")) {
        return error(415, "Content-Type must be application/json");
      }
      try {
        let body: unknown;
        try {
          body = await req.json();
        } catch {
          throw new RequestError(400, "body is not valid JSON");
        }
        const reply = await runAgent(parseAgentRequest(body), config, query);
        return json(200, reply);
      } catch (e) {
        if (e instanceof RequestError) return error(e.status, e.message);
        console.error("[aipage-agent-server] run failed:", e instanceof Error ? e.message : e);
        return error(502, e instanceof Error ? e.message : String(e));
      }
    }

    return error(404, "not found");
  };
}
