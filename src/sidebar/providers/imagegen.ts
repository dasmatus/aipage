import { performRequest } from './utils';

export type ImageGenProvider = 'vercel' | 'sdwebui';

export interface ImageGenOptions {
    provider: ImageGenProvider;
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    size?: string;
}

export interface ImageGenResult {
    dataUrl: string;
    revisedPrompt?: string;
}

export async function generateImage(prompt: string, options: ImageGenOptions): Promise<ImageGenResult> {
    if (options.provider === 'sdwebui') {
        return generateWithSDWebUI(prompt, options.baseUrl || 'http://localhost:7860');
    }
    return generateWithVercel(prompt, options.apiKey || '', options.baseUrl, options.model, options.size);
}

async function generateWithVercel(
    prompt: string,
    apiKey: string,
    baseUrl?: string,
    model?: string,
    size?: string
): Promise<ImageGenResult> {
    const base = (baseUrl || 'https://ai-gateway.vercel.sh/v1')
        .replace(/\/models$/, '')
        .replace(/\/chat\/completions$/, '')
        .replace(/\/$/, '');
    const url = `${base}/images/generations`;

    const data = await performRequest(url, 'POST', {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
    }, JSON.stringify({
        model: model || 'openai:dall-e-3',
        prompt,
        n: 1,
        size: size || '1024x1024',
        response_format: 'b64_json'
    }));

    const b64 = data.data?.[0]?.b64_json;
    if (!b64) throw new Error('No image data in response');

    return {
        dataUrl: `data:image/png;base64,${b64}`,
        revisedPrompt: data.data?.[0]?.revised_prompt
    };
}

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
