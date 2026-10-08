/**
 * Entry point: `bun run start` (or `bun src/main.ts`).
 *
 * Claude Code authenticates the way the CLI does: `ANTHROPIC_API_KEY` in the
 * environment, or the login of an installed `claude` CLI.
 */

import { query } from "@anthropic-ai/claude-agent-sdk";

import { loadConfig } from "./config";
import { createHandler } from "./server";

const config = loadConfig();
const handler = createHandler(config, query);

const server = Bun.serve({
  hostname: config.host,
  port: config.port,
  // Bun closes idle connections after 10 s by default; an agent run is one
  // long request, so keep it open for the whole run (Bun caps this at 255 s).
  idleTimeout: Math.min(255, Math.ceil(config.timeoutMs / 1000) + 5),
  fetch: handler,
});

console.log(
  `[aipage-agent-server] listening on http://${server.hostname}:${server.port} ` +
    `(model ${config.defaultModel}, tools: ${config.tools.join(", ") || "none"}, ` +
    `token ${config.token ? "required" : "off"})`,
);
