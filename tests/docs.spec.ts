import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const DOCS_DIR = path.join(__dirname, '../public');
const checkedLinks = new Set<string>();

test.describe('Documentation Link Checker', () => {
    // Increase timeout for link checking (5 minutes)
    test.setTimeout(300000);

    test.beforeAll(async () => {
        if (!fs.existsSync(DOCS_DIR)) {
            console.log('Building documentation...');
            // Fallback: build docs if missing
            // This assumes bun is available
            // await exec('bun run docs:build'); 
            // For now, just fail if missing to rely on existing build
            throw new Error(`Docs directory not found at ${DOCS_DIR}. Please run 'bun run docs:build' first.`);
        }
    });

    test('should have reachable links', async ({ page, request }) => {
        // 1. Find all HTML files recursively
        const htmlFiles: string[] = [];
        
        function scanDir(dir: string) {
            const files = fs.readdirSync(dir);
            for (const file of files) {
                const fullPath = path.join(dir, file);
                const stat = fs.statSync(fullPath);
                if (stat.isDirectory()) {
                    scanDir(fullPath);
                } else if (file.endsWith('.html')) {
                    htmlFiles.push(fullPath);
                }
            }
        }
        
        scanDir(DOCS_DIR);
        console.log(`Found ${htmlFiles.length} HTML files to check.`);

        const errors: string[] = [];
        const externalLinksToCheck = new Set<{ url: string, source: string }>();

        // 2. Iterate through each file to collect links
        for (const file of htmlFiles) {
            const relativePath = path.relative(DOCS_DIR, file);
            
            // Load file via file:// protocol
            await page.goto(`file://${file}`);
            
            // Extract all hrefs
            const links = await page.evaluate(() => {
                return Array.from(document.querySelectorAll('a'))
                    .map(a => a.getAttribute('href'))
                    .filter(href => href !== null) as string[];
            });

            for (const href of links) {
                // Ignore internal absolute links (GitLab resolved)
                if (href.startsWith('/')) continue;
                
                // Ignore hash-only, mailto, etc.
                if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) continue;

                // Handle external links -> Collect for parallel check
                if (href.startsWith('http://') || href.startsWith('https://')) {
                    // Ignore GitLab edit links and specific generic repo links that might 403
                    if (href.includes('/-/edit/') || href.includes('gitlab.com/TenTypekMatus/')) continue;
                    
                    if (!checkedLinks.has(href)) {
                        checkedLinks.add(href);
                        externalLinksToCheck.add({ url: href, source: relativePath });
                    }
                    continue;
                }

                // Handle relative internal links -> Check immediately
                const cleanHref = href.split('#')[0].split('?')[0];
                if (!cleanHref) continue; 

                const fileDir = path.dirname(file);
                const targetPath = path.resolve(fileDir, cleanHref);

                if (!fs.existsSync(targetPath)) {
                    errors.push(`[Internal] ${relativePath}: Broken relative link ${href} (Resolved to ${targetPath})`);
                }
            }
        }

        // 3. Check external links in parallel
        console.log(`Checking ${externalLinksToCheck.size} unique external links...`);
        const externalLinksArray = Array.from(externalLinksToCheck);
        const BATCH_SIZE = 10;
        
        for (let i = 0; i < externalLinksArray.length; i += BATCH_SIZE) {
            const batch = externalLinksArray.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(async ({ url, source }) => {
                try {
                    const response = await request.fetch(url, { method: 'HEAD', timeout: 5000 });
                    if (response.status() === 404 || response.status() >= 500) {
                         const getResponse = await request.fetch(url, { timeout: 10000 });
                         if (!getResponse.ok()) {
                             errors.push(`[External] ${source}: Broken link ${url} (Status: ${getResponse.status()})`);
                         }
                    } else if (!response.ok()) {
                         const getResponse = await request.fetch(url, { timeout: 10000 });
                         if (!getResponse.ok()) {
                             errors.push(`[External] ${source}: Broken link ${url} (Status: ${getResponse.status()})`);
                         }
                    }
                } catch (e: any) {
                    // Try GET if HEAD fails or timeout
                    try {
                        const getResponse = await request.fetch(url, { timeout: 10000 });
                        if (!getResponse.ok()) {
                            errors.push(`[External] ${source}: Broken link ${url} (Status: ${getResponse.status()}) - Error: ${e.message}`);
                        }
                    } catch (e2: any) {
                         errors.push(`[External] ${source}: Failed to fetch ${url} (${e2.message})`);
                    }
                }
            }));
        }

        if (errors.length > 0) {
            console.error('Link Check Errors:');
            errors.forEach(e => console.error(e));
            throw new Error(`Found ${errors.length} broken links.\n` + errors.slice(0, 20).join('\n') + (errors.length > 20 ? '\n...and more' : ''));
        }
    });
});
