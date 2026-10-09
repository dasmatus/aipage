# AI Providers

The extension supports multiple AI providers. Choose your preferred provider and configure the corresponding API key.

## Supported Providers

- **Ollama Cloud** — chat, agentic tools, native web search, and SVG image generation
- **OpenRouter** — the same feature set over any OpenRouter model (`vendor/model` ids)
- **ChatGPT / OpenAI** — the same feature set over the public OpenAI API (`gpt-*` models, API key)
- **Claude (Anthropic)** — chat, agentic tools, native web search (Claude's built-in search tool) and SVG image generation over the Anthropic Messages API
- **Claude Code (Agent SDK)** — Claude Code itself, run on your computer by the bundled `agent-server` through the Claude Agent SDK; it searches and reads the web with its own tools
- **LM Studio** (Local)
- **Ollama** (Local)

## Step 1: Choose Your Provider

1. Navigate to any EduPage site (e.g., `https://yourschool.edupage.org`)
2. Click the **AI button** (star icon with the AI text) in the EduPage navbar
3. The sidebar will open showing the settings view
4. Select your preferred AI provider from the dropdown

## Step 2: Configure Your Provider

### Claude (Anthropic)

Talks directly to Claude through the official Anthropic Messages API (`https://api.anthropic.com`), billed to your Anthropic account.

1. Go to **[the Anthropic Console](https://console.anthropic.com)** and sign in (or create an account).
2. Open **Settings → API Keys** (direct link: `https://console.anthropic.com/settings/keys`).
3. Click **Create Key**, give it a name, and copy it — the key starts with `sk-ant-`.
4. In the AIPage settings pick **Claude (Anthropic)** as the engine, leave the **Base URL** at `https://api.anthropic.com` (only change it for a gateway that speaks the Messages API) and paste the key.
5. Click the refresh button next to **Model** to list your available models and pick one; the default is `claude-opus-5-5`.

> The key is stored locally in your browser and is only ever sent to `api.anthropic.com` (through the extension's background proxy). Claude runs the **agentic chat** tools (read the page, read / fill the exam question) and powers **web search** with its built-in server-side search tool, so no extra search key is needed. **Image generation** asks Claude for an SVG that the extension rasterizes to a PNG in-browser. If you used the Claude provider in an older AIPage release, your saved key and model are picked up again.

### Claude Code (Agent SDK)

Embeds **Claude Code** in the sidebar. The [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk-typescript) runs the Claude Code process and needs Node or Bun, so it runs in a small local server from this repository, [`agent-server/`](https://github.com/dasmatus/aipage/tree/main/agent-server), and the extension talks to it like it talks to a local Ollama.

1. Install [Bun](https://bun.sh), clone the repository and start the server:
   ```bash
   cd agent-server
   bun install
   ANTHROPIC_API_KEY=sk-ant-... bun run start
   ```
   Instead of `ANTHROPIC_API_KEY` you can rely on the login of an installed `claude` CLI. The server listens on `http://127.0.0.1:8787`.
2. In the AIPage settings pick **Claude Code (Agent SDK)** as the engine and keep the **Base URL** at `http://localhost:8787`.
3. Click the refresh button next to **Model** and pick one of the models the server offers (default `claude-opus-5-5`).
4. Leave **Claude Code Access Token** empty, unless you started the server with `AIPAGE_AGENT_TOKEN`; then enter that token.

> Every message is one Claude Code run: Claude Code reads the message (including page content you scanned into the chat), uses its tools and answers once it is done, so expect a few seconds more than a plain chat reply. By default it may only use `WebSearch` and `WebFetch`, and every other tool is denied; your `~/.claude` settings are not loaded. The tools, models, token, timeout and working directory are environment variables, listed in the [`agent-server` README](https://github.com/dasmatus/aipage/blob/main/agent-server/README.md). Your Anthropic credentials stay in the server and never reach the browser. **Image generation** asks Claude Code for the SVG, as with the other providers.

### OpenRouter

OpenRouter exposes hundreds of models (OpenAI, Anthropic, Google, Meta, Mistral, ...) behind one OpenAI-compatible API, billed per request to your OpenRouter account.

1. Go to **[openrouter.ai](https://openrouter.ai)** and sign in (or create an account).
2. Open **[Keys](https://openrouter.ai/keys)**, click **Create Key** and copy it — the key starts with `sk-or-v1-`.
3. In the AIPage settings pick **OpenRouter** as the engine, leave the **Base URL** at `https://openrouter.ai/api` (entering `https://openrouter.ai/api/v1` works too) and paste the key.
4. Click the refresh button next to **Model** to list the available models and pick one, e.g. `openai/gpt-4.1-mini` (the default). Models that support function calling also power the agentic chat, native web search and SVG image generation.

> The key is stored locally in your browser and is only ever sent to `openrouter.ai` (through the extension's background proxy). Requests carry the optional `HTTP-Referer`/`X-Title` attribution headers so OpenRouter can show AIPage on its app rankings.

### ChatGPT / OpenAI

The public OpenAI platform API (the models behind ChatGPT), billed per request to your OpenAI account. This uses an ordinary API key only — there is no "sign in with ChatGPT" flow.

1. Go to **[platform.openai.com](https://platform.openai.com)** and sign in (or create an account and add billing).
2. Open **[API keys](https://platform.openai.com/api-keys)**, click **Create new secret key** and copy it — the key starts with `sk-`.
3. In the AIPage settings pick **ChatGPT / OpenAI** as the engine, leave the **Base URL** at `https://api.openai.com` (entering `https://api.openai.com/v1` works too) and paste the key.
4. Click the refresh button next to **Model** to list your available chat models and pick one, e.g. `gpt-4.1-mini` (the default). The list is filtered to chat-capable families (`gpt-*`, `o*`, `chatgpt-*`); embedding, audio, realtime, image and moderation models are hidden. Function-calling models power the agentic chat, native web search and SVG image generation.

> The key is stored locally in your browser and is only ever sent to `api.openai.com` (through the extension's background proxy).

### LM Studio (Local)

1. Open LM Studio and start the **Local Inference Server**.
2. Keep the default Port `1234` or update the **Base URL** in the extension settings.
3. Ensure a model is loaded in LM Studio.
4. Enter the **Model Name** if you want to target a specific one.

### Ollama (Local)

1. Install Ollama and run it (`ollama serve`).
2. Download a model (e.g., `ollama pull llama3`).
3. Enter the **Base URL** (default: `http://localhost:11434`).
4. Enter the **Model Name** (e.g., `llama3`).

## Step 3: Save Settings

1. Paste your API key into the **"API Key"** field
2. Click **"Save Key"**

Your API key is stored locally in your browser and is never sent anywhere except to your selected provider's API when you send messages.

## Step 4: Start Chatting

Once your API key is saved:

- The sidebar will automatically switch to the chat view
- Type your question in the input field at the bottom
- Press Enter or click the send button
- The AI will respond to your queries

## Switching Providers

You can switch between providers at any time:

1. Click the settings icon (gear) in the sidebar header
2. Select a different provider from the dropdown
3. Enter the API key for that provider (if not already saved)
4. Click "Save Key"

Each provider's API key is stored separately, so you can switch between them without re-entering keys.

## Usage

- **Open/Close Sidebar**: Click the AI button (star icon) in the EduPage navbar
- **Change Settings**: Click the settings icon (gear) in the sidebar header
- **Send Messages**: Type in the input field and press Enter or click send
