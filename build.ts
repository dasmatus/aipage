import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';

// Parse command line arguments
const args = process.argv.slice(2);
const targetArg = args.find(arg => arg.startsWith('--target='));
const target = targetArg ? targetArg.split('=')[1] : 'chrome';

// Validate target
if (!['chrome', 'firefox', 'safari'].includes(target)) {
    console.error(`❌ Invalid target: ${target}. Must be one of: chrome, firefox, safari`);
    process.exit(1);
}

const distDir = `dist-${target}`;
console.log(`🔨 Building for ${target.toUpperCase()}...`);

async function build() {
    // Ensure dist directory exists
    if (!existsSync(distDir)) {
        mkdirSync(distDir);
    }

    // Build Content Script
    await Bun.build({
        entrypoints: ['src/content.ts'],
        outdir: distDir,
        naming: 'content.js',
        target: 'browser',
        minify: true,
    });

    // Build Background Script
    await Bun.build({
        entrypoints: ['src/background.ts'],
        outdir: distDir,
        naming: 'background.js',
        target: 'browser',
        minify: true,
    });

    // Build Sidebar Script
    await Bun.build({
        entrypoints: ['src/sidebar/index.tsx'],
        outdir: distDir,
        naming: 'sidebar.js',
        target: 'browser',
        minify: true,
    });

    // Compile Sass to CSS using sass CLI  
    const sassProcess = Bun.spawn(['npx', 'sass', 'src/sidebar/sidebar.scss', `${distDir}/sidebar.css`, '--style=compressed', '--no-source-map']);
    await sassProcess.exited;

    // Copy static files
    copyFileSync('src/sidebar/sidebar.html', `${distDir}/sidebar.html`);
    
    // Copy appropriate manifest based on target
    const manifestSource = target === 'chrome' 
        ? 'src/manifest.json' 
        : `src/manifest.${target}.json`;
    
    copyFileSync(manifestSource, `${distDir}/manifest.json`);

    console.log(`✅ Build complete for ${target} in ${distDir}/`);
    
    // Browser-specific post-build steps
    if (target === 'firefox') {
        console.log('🦊 Firefox build ready. Run `npx web-ext lint -s ${distDir}` to validate.');
    } else if (target === 'safari') {
        console.log('🧭 Safari build ready. Run setup script to create Xcode project.');
    }
}

build().catch((err) => {
    console.error('❌ Build failed:', err);
    process.exit(1);
});
