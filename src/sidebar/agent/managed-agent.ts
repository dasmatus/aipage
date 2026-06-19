import Anthropic from '@anthropic-ai/sdk';
import browser from '../../polyfills/browser-polyfill';
import { proxyFetch } from '../providers/utils';

/**
 * Managed Agents orchestrator.
 *
 * Anthropic runs the agent loop on its orchestration layer; we host the
 * *custom* tools in the browser. Because the sidebar's only network path is the
 * one-shot background CORS proxy (no SSE), we drive the session by **polling**
 * `sessions.events.list` rather than streaming, and answer the agent's
 * client-side tool calls (page scrape / exam fill) via content-script messaging.
 *
 * Page-interaction tools (get_page_content, get_exam_question, fill_exam_answer)
 * run here in the browser via the custom-tool round-trip; web_search runs
 * server-side in the session container.
 */

const DEFAULT_MODEL = 'claude-opus-4-8';

const AGENT_SYSTEM_PROMPT = `You are AIPage, an agentic study assistant embedded in a sidebar on the EduPage school platform. You help the student understand and answer what is on their screen. Reply in Slovak unless the student writes in another language.

Tools available to you:
- get_page_content: read the visible text of the EduPage page the student is viewing. Call it whenever your answer depends on what is on their screen.
- get_exam_question: read the current exam question and its answer options.
- fill_exam_answer: type an answer into the exam field. Only call this when the student explicitly asks you to fill or submit an answer.
- web_search: search the web for current or factual information.

Decide which tools to use on your own and chain them as needed, then give a clear, step-by-step answer. Don't ask permission for read-only actions (reading the page, searching). Ask before filling an answer unless the student already told you to.`;

// Persisted (cached) managed-agent resources. Bump SCHEMA_VERSION to force the
// agent + environment to be recreated after changing the config above.
const STORE = { agentId: 'ma_agent_id', envId: 'ma_env_id', schema: 'ma_schema' } as const;
const SCHEMA_VERSION = 1;

const CUSTOM_TOOLS = [
    {
        type: 'custom',
        name: 'get_page_content',
        description: 'Read the visible text content of the EduPage page the student is currently viewing. Call this whenever answering depends on what is on the page.',
        input_schema: { type: 'object', properties: {} }
    },
    {
        type: 'custom',
        name: 'get_exam_question',
        description: 'Read the current exam question and its answer options from the page.',
        input_schema: { type: 'object', properties: {} }
    },
    {
        type: 'custom',
        name: 'fill_exam_answer',
        description: 'Fill an answer into the current exam field on the page. Call only when the student explicitly asks to fill or submit an answer.',
        input_schema: {
            type: 'object',
            properties: {
                value: { type: 'string', description: 'The answer text or option value to fill in.' },
                inputType: { type: 'string', description: 'Optional input type, e.g. "choice" or "text".' }
            },
            required: ['value']
        }
    }
];

export interface AgentTurnHandlers {
    /** Called with the accumulated agent answer text as it grows. */
    onText: (text: string) => void;
    /** Optional: called with short status notes (e.g. tool being used). */
    onStatus?: (text: string) => void;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function makeClient(apiKey: string): Anthropic {
    return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, fetch: proxyFetch });
}

/** Get cached agent + environment IDs, creating them once on first use. */
async function ensureResources(client: Anthropic): Promise<{ agentId: string; envId: string }> {
    const stored = await browser.storage.local.get([STORE.agentId, STORE.envId, STORE.schema]) as Record<string, any>;
    if (stored[STORE.agentId] && stored[STORE.envId] && stored[STORE.schema] === SCHEMA_VERSION) {
        return { agentId: stored[STORE.agentId], envId: stored[STORE.envId] };
    }

    const beta = client.beta as any;

    // Cloud environment with full egress so web_search and outbound calls work.
    const env = await beta.environments.create({
        name: `aipage-${Date.now()}`,
        config: { type: 'cloud', networking: { type: 'unrestricted' } }
    });

    // Agent: server-side web_search + our browser-side custom tools.
    const agent = await beta.agents.create({
        name: 'AIPage Study Agent',
        model: DEFAULT_MODEL,
        system: AGENT_SYSTEM_PROMPT,
        tools: [
            { type: 'agent_toolset_20260401', default_config: { enabled: false }, configs: [{ name: 'web_search', enabled: true }] },
            ...CUSTOM_TOOLS
        ]
    });

    await browser.storage.local.set({
        [STORE.agentId]: agent.id,
        [STORE.envId]: env.id,
        [STORE.schema]: SCHEMA_VERSION
    });
    return { agentId: agent.id, envId: env.id };
}

/** Execute a custom (browser-side) tool by messaging the active EduPage tab. */
async function executeTool(name: string, input: any): Promise<{ content: string; isError: boolean }> {
    try {
        const tabs = await browser.tabs.query({ active: true, lastFocusedWindow: true });
        const tabId = tabs[0]?.id;
        if (!tabId) return { content: 'No active EduPage tab is open.', isError: true };

        if (name === 'get_page_content') {
            const r: any = await browser.tabs.sendMessage(tabId, { action: 'get_page_content' });
            return r?.content
                ? { content: r.content, isError: false }
                : { content: 'Could not read the page content.', isError: true };
        }
        if (name === 'get_exam_question') {
            const r: any = await browser.tabs.sendMessage(tabId, { action: 'get_exam_question' });
            return r?.ok
                ? { content: JSON.stringify(r), isError: false }
                : { content: 'No exam question found on this page.', isError: true };
        }
        if (name === 'fill_exam_answer') {
            const r: any = await browser.tabs.sendMessage(tabId, {
                action: 'fill_answer',
                payload: { inputType: input?.inputType, value: input?.value }
            });
            return r?.ok
                ? { content: `Filled answer: ${input?.value}`, isError: false }
                : { content: `Could not fill answer: ${r?.error || 'unknown error'}`, isError: true };
        }
        return { content: `Unknown tool: ${name}`, isError: true };
    } catch (e) {
        return { content: `Tool error: ${(e as Error).message}`, isError: true };
    }
}

/**
 * Run one agentic turn. Creates a session on first use (reused across the
 * conversation), sends the user message, then polls for events — rendering
 * agent text and resolving client-side tool calls — until the session goes
 * idle (terminal) or terminates. Returns the session id for reuse.
 */
export async function runAgentTurn(
    apiKey: string,
    userText: string,
    sessionId: string | null,
    handlers: AgentTurnHandlers
): Promise<string> {
    const client = makeClient(apiKey);
    const beta = client.beta as any;
    const { agentId, envId } = await ensureResources(client);

    let sid = sessionId;
    if (!sid) {
        const session = await beta.sessions.create({ agent: agentId, environment_id: envId });
        sid = session.id as string;
    }

    await beta.sessions.events.send(sid, {
        events: [{ type: 'user.message', content: [{ type: 'text', text: userText }] }]
    });

    const seen = new Set<string>();
    const answeredTools = new Set<string>();
    let answer = '';
    const MAX_POLLS = 160; // ~4 min at 1.5s

    for (let poll = 0; poll < MAX_POLLS; poll++) {
        let events: any[] = [];
        try {
            const page = await beta.sessions.events.list(sid);
            events = page?.data ?? [];
        } catch {
            await sleep(1500);
            continue;
        }

        const pendingTools: any[] = [];
        let terminal = false;

        for (const ev of events) {
            const isNew = ev.id && !seen.has(ev.id);
            if (ev.id) seen.add(ev.id);

            if (ev.type === 'agent.message') {
                if (isNew && Array.isArray(ev.content)) {
                    const txt = ev.content.map((b: any) => (b.type === 'text' ? b.text : '')).join('');
                    if (txt) {
                        answer += (answer ? '\n\n' : '') + txt;
                        handlers.onText(answer);
                    }
                }
            } else if (ev.type === 'agent.custom_tool_use') {
                if (ev.id && !answeredTools.has(ev.id)) pendingTools.push(ev);
            } else if (ev.type === 'session.status_terminated') {
                terminal = true;
            } else if (ev.type === 'session.status_idle') {
                const reason = ev.stop_reason?.type;
                if (reason && reason !== 'requires_action') terminal = true;
            }
        }

        // Answer any client-side tool calls, then keep polling.
        if (pendingTools.length > 0) {
            for (const ev of pendingTools) {
                handlers.onStatus?.(ev.name);
                const result = await executeTool(ev.name, ev.input);
                answeredTools.add(ev.id);
                await beta.sessions.events.send(sid, {
                    events: [{
                        type: 'user.custom_tool_result',
                        custom_tool_use_id: ev.id,
                        content: [{ type: 'text', text: result.content }],
                        is_error: result.isError
                    }]
                });
            }
            await sleep(800);
            continue;
        }

        if (terminal) break;
        await sleep(1500);
    }

    if (!answer) handlers.onText('(Agent finished without a textual answer.)');
    return sid as string;
}

/** Forget the cached agent/environment so they are recreated on next use. */
export async function resetManagedAgent(): Promise<void> {
    await browser.storage.local.remove([STORE.agentId, STORE.envId, STORE.schema]);
}
