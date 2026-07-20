// Static file server for Playwright UI tests. Serves a built dist directory
// (default dist-chrome) with correct MIME types for ES modules and WASM.
//
//   bun scripts/serve-dist.ts            # serves dist-chrome on :4173
//   DIST=dist-firefox PORT=5000 bun scripts/serve-dist.ts
import { existsSync, readFileSync } from 'fs';
import { join, extname } from 'path';

const dist = process.env.DIST ?? 'dist-chrome';
const port = Number(process.env.PORT ?? 4173);

const MIME: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.wasm': 'application/wasm',
    '.json': 'application/json; charset=utf-8',
};

// Apply the built extension's own Content-Security-Policy to HTML responses so
// the test harness matches the real extension page context. Without this, the
// dev server serves pages with no CSP and inline scripts run freely — masking
// CSP violations (e.g. an inline bootstrap script) that silently break the
// real extension. Read from the built manifest so it never drifts.
function manifestCsp(): string | undefined {
    const manifestPath = join(process.cwd(), dist, 'manifest.json');
    if (!existsSync(manifestPath)) return undefined;
    try {
        return JSON.parse(readFileSync(manifestPath, 'utf8')).content_security_policy;
    } catch {
        return undefined;
    }
}

const csp = manifestCsp();

Bun.serve({
    port,
    async fetch(req) {
        const url = new URL(req.url);
        let path = decodeURIComponent(url.pathname);
        if (path === '/') path = '/sidebar.html';
        const filePath = join(process.cwd(), dist, path);
        if (!existsSync(filePath)) {
            return new Response('Not found', { status: 404 });
        }
        const file = Bun.file(filePath);
        const type = MIME[extname(filePath)] ?? 'application/octet-stream';
        const headers: Record<string, string> = { 'content-type': type };
        if (csp && type.startsWith('text/html')) {
            headers['content-security-policy'] = csp;
        }
        return new Response(file, { headers });
    },
});

console.log(`serving ${dist} on http://localhost:${port}`);
