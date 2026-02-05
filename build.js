const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

async function build() {
    // Ensure dist directory exists
    if (!fs.existsSync('dist')) {
        fs.mkdirSync('dist');
    }

    // Build Content Script
    await esbuild.build({
        entryPoints: ['src/content.ts'],
        bundle: true,
        outfile: 'dist/content.js',
        platform: 'browser',
        target: ['chrome100'],
    });

    // Build Background Script
    await esbuild.build({
        entryPoints: ['src/background.ts'],
        bundle: true,
        outfile: 'dist/background.js',
        platform: 'browser',
        target: ['chrome100'],
    });

    // Build Sidebar Script
    await esbuild.build({
        entryPoints: ['src/sidebar/sidebar.ts'],
        bundle: true,
        outfile: 'dist/sidebar.js',
        platform: 'browser',
        target: ['chrome100'],
    });

    // Copy static files
    fs.copyFileSync('src/sidebar/sidebar.html', 'dist/sidebar.html');
    fs.copyFileSync('src/sidebar/sidebar.css', 'dist/sidebar.css');
    fs.copyFileSync('src/manifest.json', 'dist/manifest.json');

    console.log('Build complete');
}

build().catch(() => process.exit(1));
