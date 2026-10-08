# AIPage agent server (Claude Code via the Claude Agent SDK)

A small local HTTP server that runs **Claude Code** through the
[Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk-typescript)
for the AIPage sidebar. Pick **Claude Code (Agent SDK)** as the engine in the
sidebar settings and every chat message becomes one Claude Code run on your
computer.

The Agent SDK spawns the Claude Code process and only runs under Node or Bun,
so it cannot be part of the WebAssembly extension. The extension reaches this
server through its background proxy, exactly like a local Ollama.

## Run it

```bash
cd agent-server
bun install
ANTHROPIC_API_KEY=sk-ant-... bun run start
# [aipage-agent-server] listening on http://127.0.0.1:8787 (model claude-opus-5-5, tools: WebSearch, WebFetch, token off)
```

Claude Code authenticates the way the `claude` CLI does: `ANTHROPIC_API_KEY`
in the environment, or the login of an installed CLI (`claude login`). The key
never reaches the browser.

Then in the sidebar: *Settings → Provider Engine → Claude Code (Agent SDK)*,
keep the base URL `http://localhost:8787`, click refresh next to *Model*, pick a
model and save.

## Configuration

All settings are environment variables; the defaults are the safe ones.

| Variable | Default | Meaning |
| --- | --- | --- |
| `HOST` / `PORT` | `127.0.0.1` / `8787` | Where to listen. Keep the loopback unless you put a TLS proxy and a token in front. |
| `AIPAGE_AGENT_TOKEN` | unset | Shared secret. When set, every `/v1/*` call needs `Authorization: Bearer <token>`; enter it in the sidebar's *Claude Code Access Token* field. |
| `AIPAGE_AGENT_MODEL` | first of the models | Model used when the sidebar sends none. |
| `AIPAGE_AGENT_MODELS` | `claude-opus-5-5,claude-sonnet-5-5,claude-haiku-5-5` | Models offered to the sidebar's model picker. |
| `AIPAGE_AGENT_TOOLS` | `WebSearch,WebFetch` | Built-in Claude Code tools the agent may use; each is pre-approved, every other tool is unavailable. Empty = no tools. |
| `AIPAGE_AGENT_PERMISSION_MODE` | `dontAsk` | Claude Code permission mode. `dontAsk` denies anything not in the tool list; `bypassPermissions` is refused. |
| `AIPAGE_AGENT_MAX_TURNS` | `8` | Cap on model round-trips per message. |
| `AIPAGE_AGENT_TIMEOUT_MS` | `180000` | Abort a run after this long (at most 250000). |
| `AIPAGE_AGENT_CWD` | current directory | Working directory of the Claude Code process. Point it at an empty folder if you enable file tools. |
| `AIPAGE_AGENT_CLAUDE_PATH` | bundled binary | Run an installed `claude` executable instead of the one shipped with the SDK. |
| `AIPAGE_AGENT_ALLOWED_ORIGINS` | none | Extra web origins allowed to call the server (browser-extension origins and origin-less clients such as curl are always allowed). |

Claude Code runs with `settingSources: []`, so your `~/.claude` settings,
hooks and `CLAUDE.md` files are not loaded into the sidebar's runs.

Giving the agent `Bash`, `Edit` or `Write` lets anything typed into the
sidebar (including page content you scan into the chat) run commands or change
files on your computer. Only add them deliberately, with a dedicated
`AIPAGE_AGENT_CWD`.

## API

| Route | Auth | Reply |
| --- | --- | --- |
| `GET /health` | none | `{ "ok": true, "name": "aipage-agent-server", "version": "0.1.0" }` |
| `GET /v1/models` | token | `{ "object": "list", "data": [{ "id": "claude-opus-5-5", "object": "model" }, …] }` |
| `POST /v1/agent` | token | `{ "text", "session_id", "is_error", "num_turns", "cost_usd", "model" }` |

`POST /v1/agent` takes `{ "prompt": string, "model"?: string, "session_id"?: string }`
with `Content-Type: application/json`; `session_id` from an earlier reply
resumes that Claude Code session. A run is one request and one JSON reply
(the extension proxy does not stream). Errors are `{ "error": { "message" } }`
with 400/401/403/413/415 for bad requests, 502 when Claude Code fails to run (the cause is in the server log) and
504 on timeout; a run that Claude Code itself ends in an error is a 200 with
`is_error: true`.

Requests whose `Origin` is a web page are refused (403) and `/v1/agent`
requires a JSON content type, so a website you visit cannot drive the agent
from your browser.

## Develop

```bash
bun install
bun test           # unit + HTTP tests with a fake SDK query (no Claude Code binary needed)
bun run typecheck  # tsc --noEmit
```

CI runs both (`agent-server` job in `.github/workflows/ci.yml`), installing
with `--omit=optional` so it skips the platform Claude Code binaries.
