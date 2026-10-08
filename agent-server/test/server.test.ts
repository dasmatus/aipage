import { describe, expect, test } from "bun:test";
import type { Options, SDKMessage } from "@anthropic-ai/claude-agent-sdk";

import { buildOptions, parseAgentRequest, replyFromResult, RequestError, SYSTEM_PROMPT, type QueryFn } from "../src/agent";
import { DEFAULT_MODELS, DEFAULT_TOOLS, loadConfig, MAX_TIMEOUT_MS, parseList, type ServerConfig } from "../src/config";
import { createHandler, isAllowedOrigin, isAuthorized } from "../src/server";

const EXT_ORIGIN = "chrome-extension://abcdefghijklmnop";

function config(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return { ...loadConfig({}), cwd: "/tmp", ...overrides };
}

/** A fake SDK result message; only the fields the server reads matter. */
function success(text: string, extra: Record<string, unknown> = {}): SDKMessage {
  return {
    type: "result",
    subtype: "success",
    result: text,
    is_error: false,
    num_turns: 2,
    total_cost_usd: 0.0123,
    session_id: "0f9e8d7c-1111-2222-3333-444455556666",
    ...extra,
  } as unknown as SDKMessage;
}

/** A `query` stand-in that records its call and yields the given messages. */
function fakeQuery(messages: SDKMessage[], calls: { prompt: string; options?: Options }[] = []): QueryFn {
  return (params) => {
    calls.push(params);
    return (async function* () {
      yield { type: "system", subtype: "init" } as unknown as SDKMessage;
      for (const m of messages) yield m;
    })();
  };
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://127.0.0.1:8787/v1/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: EXT_ORIGIN, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("config", () => {
  test("defaults are loopback, read-only web tools, dontAsk", () => {
    const c = loadConfig({});
    expect(c.host).toBe("127.0.0.1");
    expect(c.port).toBe(8787);
    expect(c.token).toBeNull();
    expect(c.tools).toEqual(DEFAULT_TOOLS);
    expect(c.permissionMode).toBe("dontAsk");
    expect(c.models).toEqual(DEFAULT_MODELS);
    expect(c.defaultModel).toBe(DEFAULT_MODELS[0]);
  });

  test("env overrides", () => {
    const c = loadConfig({
      PORT: "9000",
      AIPAGE_AGENT_TOKEN: " secret ",
      AIPAGE_AGENT_MODELS: "claude-sonnet-5-5, claude-haiku-5-5",
      AIPAGE_AGENT_TOOLS: "",
      AIPAGE_AGENT_TIMEOUT_MS: "999999",
    });
    expect(c.port).toBe(9000);
    expect(c.token).toBe("secret");
    expect(c.models).toEqual(["claude-sonnet-5-5", "claude-haiku-5-5"]);
    expect(c.defaultModel).toBe("claude-sonnet-5-5");
    expect(c.tools).toEqual([]);
    expect(c.timeoutMs).toBe(MAX_TIMEOUT_MS);
  });

  test("rejects bad values", () => {
    expect(() => loadConfig({ PORT: "abc" })).toThrow();
    expect(() => loadConfig({ AIPAGE_AGENT_PERMISSION_MODE: "yolo" })).toThrow();
    expect(() => loadConfig({ AIPAGE_AGENT_PERMISSION_MODE: "bypassPermissions" })).toThrow();
  });

  test("parseList trims and drops blanks", () => {
    expect(parseList(" a, ,b ")).toEqual(["a", "b"]);
    expect(parseList(undefined)).toEqual([]);
  });
});

describe("request validation", () => {
  test("accepts prompt, model and session id", () => {
    expect(parseAgentRequest({ prompt: "hi" })).toEqual({ prompt: "hi" });
    expect(parseAgentRequest({ prompt: "hi", model: "claude-opus-5-5[1m]", session_id: "0f9e8d7c-1111-2222-3333-444455556666" })).toEqual({
      prompt: "hi",
      model: "claude-opus-5-5[1m]",
      session_id: "0f9e8d7c-1111-2222-3333-444455556666",
    });
    // empty optional fields are ignored (the sidebar sends "" for "no model picked")
    expect(parseAgentRequest({ prompt: "hi", model: "", session_id: null })).toEqual({ prompt: "hi" });
  });

  test("rejects malformed bodies", () => {
    for (const bad of [null, [], "x", {}, { prompt: "  " }, { prompt: 1 }, { prompt: "hi", model: "a b" }, { prompt: "hi", session_id: "../x" }]) {
      expect(() => parseAgentRequest(bad)).toThrow(RequestError);
    }
  });
});

describe("SDK options", () => {
  test("only the configured tools exist and are approved; host settings are ignored", () => {
    const ac = new AbortController();
    const o = buildOptions({ prompt: "hi" }, config(), ac);
    expect(o.model).toBe(DEFAULT_MODELS[0]);
    expect(o.tools).toEqual(DEFAULT_TOOLS);
    expect(o.allowedTools).toEqual(DEFAULT_TOOLS);
    expect(o.permissionMode).toBe("dontAsk");
    expect(o.settingSources).toEqual([]);
    expect(o.systemPrompt).toBe(SYSTEM_PROMPT);
    expect(o.resume).toBeUndefined();
    expect(o.abortController).toBe(ac);
    expect(o.env?.CLAUDE_AGENT_SDK_CLIENT_APP).toStartWith("aipage-agent-server/");
  });

  test("request model and session id win", () => {
    const o = buildOptions({ prompt: "hi", model: "claude-haiku-5-5", session_id: "abcdef01" }, config(), new AbortController());
    expect(o.model).toBe("claude-haiku-5-5");
    expect(o.resume).toBe("abcdef01");
    expect(o.pathToClaudeCodeExecutable).toBeUndefined();
  });

  test("an installed claude CLI can replace the bundled binary", () => {
    const c = loadConfig({ AIPAGE_AGENT_CLAUDE_PATH: "/usr/local/bin/claude" });
    expect(buildOptions({ prompt: "hi" }, c, new AbortController()).pathToClaudeCodeExecutable).toBe("/usr/local/bin/claude");
  });
});

describe("result reduction", () => {
  test("success carries the final text", () => {
    const r = replyFromResult(success("Ahoj!") as never, "m");
    expect(r).toEqual({ text: "Ahoj!", session_id: "0f9e8d7c-1111-2222-3333-444455556666", is_error: false, num_turns: 2, cost_usd: 0.0123, model: "m" });
  });

  test("error subtypes surface their errors", () => {
    const r = replyFromResult(success("", { subtype: "error_max_turns", errors: [] }) as never, "m");
    expect(r.is_error).toBe(true);
    expect(r.text).toContain("error_max_turns");
    const r2 = replyFromResult(success("", { subtype: "error_during_execution", errors: ["boom"] }) as never, "m");
    expect(r2.text).toBe("boom");
  });

  test("no result is an error", () => {
    expect(replyFromResult(null, "m").is_error).toBe(true);
  });
});

describe("origin and auth", () => {
  test("extension origins and no origin are allowed, web pages are not", () => {
    const c = config({ allowedOrigins: ["https://aipage-sooty.vercel.app"] });
    expect(isAllowedOrigin(null, c)).toBe(true);
    expect(isAllowedOrigin(EXT_ORIGIN, c)).toBe(true);
    expect(isAllowedOrigin("moz-extension://1234-abcd", c)).toBe(true);
    expect(isAllowedOrigin("safari-web-extension://ABCD", c)).toBe(true);
    expect(isAllowedOrigin("https://aipage-sooty.vercel.app", c)).toBe(true);
    expect(isAllowedOrigin("https://evil.example", c)).toBe(false);
    expect(isAllowedOrigin("null", c)).toBe(false);
  });

  test("token is optional, and checked when set", () => {
    expect(isAuthorized(null, config())).toBe(true);
    const c = config({ token: "s3cret" });
    expect(isAuthorized(null, c)).toBe(false);
    expect(isAuthorized("Bearer nope", c)).toBe(false);
    expect(isAuthorized("Bearer s3cret", c)).toBe(true);
    expect(isAuthorized("bearer  s3cret ", c)).toBe(true);
  });
});

describe("HTTP handler", () => {
  test("GET /health needs nothing", async () => {
    const res = await createHandler(config({ token: "t" }), fakeQuery([]))(new Request("http://x/health"));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { ok: boolean }).ok).toBe(true);
  });

  test("GET /v1/models lists the configured models OpenAI-style", async () => {
    const res = await createHandler(config(), fakeQuery([]))(new Request("http://x/v1/models"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { id: string }[] };
    expect(body.data.map((m) => m.id)).toEqual(DEFAULT_MODELS);
  });

  test("POST /v1/agent runs the query and returns the reply", async () => {
    const calls: { prompt: string; options?: Options }[] = [];
    const handler = createHandler(config(), fakeQuery([success("Výsledok")], calls));
    const res = await handler(post({ prompt: "Čo je fotosyntéza?", model: "claude-sonnet-5-5" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { text: string; model: string };
    expect(body.text).toBe("Výsledok");
    expect(body.model).toBe("claude-sonnet-5-5");
    expect(calls).toHaveLength(1);
    expect(calls[0].prompt).toBe("Čo je fotosyntéza?");
    expect(calls[0].options?.permissionMode).toBe("dontAsk");
  });

  test("refuses web origins, missing tokens, wrong content types and bad JSON", async () => {
    const handler = createHandler(config({ token: "t" }), fakeQuery([success("x")]));
    const auth = { Authorization: "Bearer t" };
    expect((await handler(post({ prompt: "hi" }, { Origin: "https://evil.example", ...auth }))).status).toBe(403);
    expect((await handler(post({ prompt: "hi" }))).status).toBe(401);
    expect((await handler(post({ prompt: "hi" }, { "Content-Type": "text/plain", ...auth }))).status).toBe(415);
    expect((await handler(post("{nope", auth))).status).toBe(400);
    expect((await handler(post({ prompt: "" }, auth))).status).toBe(400);
    expect((await handler(post({ prompt: "hi" }, auth))).status).toBe(200);
    expect((await handler(new Request("http://x/v1/agent", { headers: { Origin: EXT_ORIGIN, ...auth } }))).status).toBe(405);
    expect((await handler(new Request("http://x/nope"))).status).toBe(404);
  });

  test("a failing run becomes a 502 with the message", async () => {
    const failing: QueryFn = () =>
      (async function* () {
        throw new Error("Claude Code executable not found");
      })();
    const res = await createHandler(config(), failing)(post({ prompt: "hi" }));
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: { message: string } }).error.message).toContain("not found");
  });

  test("a run past the timeout is aborted with a 504", async () => {
    const hanging: QueryFn = ({ options }) =>
      (async function* () {
        await new Promise((_, reject) => options?.abortController?.signal.addEventListener("abort", () => reject(new Error("aborted"))));
      })();
    const res = await createHandler(config({ timeoutMs: 20 }), hanging)(post({ prompt: "hi" }));
    expect(res.status).toBe(504);
  });
});
