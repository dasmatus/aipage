import Anthropic from '@anthropic-ai/sdk';
import { initializeImageMagick, ImageMagick, MagickFormat } from '@imagemagick/magick-wasm';
import browser from '../../polyfills/browser-polyfill';
import { proxyFetch, performRequest } from './utils';

/**
 * Image generation providers.
 * - `claude-svg`: Claude generates an SVG illustration, rasterized to PNG in-browser
 *   via WebAssembly ImageMagick.
 * - `sdwebui`: local Stable Diffusion WebUI (unchanged).
 */
export type ImageGenProvider = 'claude-svg' | 'sdwebui';

export interface ImageGenOptions {
    provider: ImageGenProvider;
    apiKey?: string;
    baseUrl?: string;   // sdwebui only
    model?: string;     // Claude model for claude-svg
    size?: string;      // output raster size, e.g. "1024x1024"
}

export interface ImageGenResult {
    dataUrl: string;
    revisedPrompt?: string;
}

export async function generateImage(prompt: string, options: ImageGenOptions): Promise<ImageGenResult> {
    if (options.provider === 'sdwebui') {
        return generateWithSDWebUI(prompt, options.baseUrl || 'http://localhost:7860');
    }
    return generateWithClaudeSVG(prompt, options.apiKey || '', options.model, options.size);
}

// ─── Claude SVG → raster (WASM ImageMagick) ──────────────────────────────────

const SVG_SYSTEM_PROMPT = `You are an SVG illustration generator. Given a description, respond with ONE complete, self-contained SVG document and nothing else.
Rules:
- Output ONLY the <svg>...</svg> markup. No markdown fences, no commentary, no explanation.
- Include an explicit viewBox plus width and height attributes.
- Use only inline shapes, paths, gradients, and style attributes. No external images, fonts, scripts, or network references.`;

async function generateWithClaudeSVG(
    prompt: string,
    apiKey: string,
    model?: string,
    size?: string
): Promise<ImageGenResult> {
    if (!apiKey) throw new Error('Anthropic API key required for image generation');

    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, fetch: proxyFetch });
    const response = await client.messages.create({
        model: model || 'claude-opus-4-8',
        max_tokens: 16000,
        system: SVG_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `Create an SVG illustration of: ${prompt}` }]
    });

    const text = response.content
        .map((block: any) => (block.type === 'text' ? block.text : ''))
        .join('');

    const svg = extractSvg(text);
    if (!svg) throw new Error('The model did not return a valid SVG document');

    const [width, height] = parseSize(size);
    const dataUrl = await svgToPng(svg, width, height);
    return { dataUrl };
}

/** Pull the first <svg>…</svg> block out of the model response, tolerating code fences. */
function extractSvg(text: string): string | null {
    const cleaned = text.replace(/```(?:svg|xml|html)?/gi, '').replace(/```/g, '');
    const match = cleaned.match(/<svg[\s\S]*?<\/svg>/i);
    return match ? match[0] : null;
}

function parseSize(size?: string): [number, number] {
    const m = (size || '1024x1024').match(/(\d+)\s*[x×]\s*(\d+)/i);
    if (!m) return [1024, 1024];
    return [parseInt(m[1], 10), parseInt(m[2], 10)];
}

// Lazily initialize the WASM module once and cache the promise.
let magickReady: Promise<void> | null = null;
function ensureMagick(): Promise<void> {
    if (!magickReady) {
        magickReady = (async () => {
            const wasmUrl = browser.runtime.getURL('magick.wasm');
            const bytes = await fetch(wasmUrl).then(r => r.arrayBuffer());
            await initializeImageMagick(new Uint8Array(bytes));
        })();
    }
    return magickReady;
}

async function svgToPng(svg: string, width: number, height: number): Promise<string> {
    await ensureMagick();
    const svgBytes = new TextEncoder().encode(svg);
    return ImageMagick.read(svgBytes, MagickFormat.Svg, (img) => {
        img.resize(width, height);
        return img.write(MagickFormat.Png, (data) => `data:image/png;base64,${base64FromBytes(data)}`);
    });
}

/** Chunked base64 encode (avoids call-stack overflow on large buffers). */
function base64FromBytes(bytes: Uint8Array): string {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
}

// ─── Local Stable Diffusion WebUI (unchanged) ────────────────────────────────

async function generateWithSDWebUI(prompt: string, baseUrl: string): Promise<ImageGenResult> {
    const url = `${baseUrl.replace(/\/$/, '')}/sdapi/v1/txt2img`;

    const data = await performRequest(url, 'POST', {
        'Content-Type': 'application/json'
    }, JSON.stringify({
        prompt,
        width: 512,
        height: 512,
        steps: 20,
        cfg_scale: 7
    }));

    const b64 = data.images?.[0];
    if (!b64) throw new Error('No image data from SD WebUI');

    return { dataUrl: `data:image/png;base64,${b64}` };
}
