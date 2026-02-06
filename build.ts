import { copyFileSync, existsSync, mkdirSync } from 'fs';

async function build() {
    // Ensure dist directory exists
    if (!existsSync('dist')) {
        mkdirSync('dist');
    }

    console.log('🔨 Building with Bun...');

    // Build Content Script
    await Bun.build({
        entrypoints: ['src/content.ts'],
        outdir: 'dist',
        naming: 'content.js',
        target: 'browser',
        minify: true,
    });

    // Build Background Script
    await Bun.build({
        entrypoints: ['src/background.ts'],
        outdir: 'dist',
        naming: 'background.js',
        target: 'browser',
        minify: true,
    });

    // Build Sidebar Script
    await Bun.build({
        entrypoints: ['src/sidebar/index.tsx'],
        outdir: 'dist',
        naming: 'sidebar.js',
        target: 'browser',
        minify: true,
    });

    // Compile Sass to CSS using sass CLI  
    const sassProcess = Bun.spawn(['npx', 'sass', 'src/sidebar/sidebar.scss', 'dist/sidebar.css', '--style=compressed', '--no-source-map']);
    await sassProcess.exited;

    // Copy static files
    copyFileSync('src/sidebar/sidebar.html', 'dist/sidebar.html');
    copyFileSync('src/manifest.json', 'dist/manifest.json');

    console.log('✅ Build complete');
}

build().catch((err) => {
    console.error('❌ Build failed:', err);
    process.exit(1);
});
