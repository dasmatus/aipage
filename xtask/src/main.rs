//! Build orchestrator for the AIPage WASM extension. Replaces `build.ts`.
//!
//! Usage:
//!   cargo xtask build [--target chrome|firefox|safari|web]   (default: chrome)
//!   cargo xtask build-all                                     (the 3 browsers)
//!
//! Pipeline: compile the three wasm crates → run `wasm-bindgen` → `wasm-opt`
//! (if present) → build CSS via Tailwind/Sass (if present) → copy the static
//! assets and the target manifest into `dist-<target>/`.
//!
//! The `web` target builds only the sidebar as a static site for Vercel
//! (`dist-web/`): js/wasm/css get content-hashed filenames (safe to cache
//! immutably), `sidebar.html` references them, and `assets/vercel.json`
//! supplies the HTTP headers.

use std::path::{Path, PathBuf};
use std::process::Command;

const TARGETS: &[&str] = &["chrome", "firefox", "safari"];
const WEB_TARGET: &str = "web";

struct Crate {
    /// cargo package name
    pkg: &'static str,
    /// produced artifact stem (aipage_sidebar.wasm etc.)
    artifact: &'static str,
    /// wasm-bindgen output name (sidebar / background / content)
    out_name: &'static str,
    /// wasm-bindgen target: "web" (ES module) or "no-modules" (classic script)
    bindgen_target: &'static str,
}

const CRATES: &[Crate] = &[
    Crate { pkg: "aipage-sidebar", artifact: "aipage_sidebar", out_name: "sidebar", bindgen_target: "web" },
    Crate { pkg: "aipage-background", artifact: "aipage_background", out_name: "background", bindgen_target: "no-modules" },
    Crate { pkg: "aipage-content", artifact: "aipage_content", out_name: "content", bindgen_target: "no-modules" },
];

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let cmd = args.first().map(String::as_str).unwrap_or("build");
    match cmd {
        "build" => {
            let target = parse_flag(&args, "--target").unwrap_or_else(|| "chrome".into());
            build(&target);
        }
        "build-all" => TARGETS.iter().for_each(|t| build(t)),
        other => {
            eprintln!("xtask: unknown command `{other}` (expected build | build-all)");
            std::process::exit(1);
        }
    }
}

fn parse_flag(args: &[String], flag: &str) -> Option<String> {
    args.iter().position(|a| a == flag).and_then(|i| args.get(i + 1)).cloned()
}

fn root() -> PathBuf {
    // xtask/Cargo.toml lives one level under the workspace root.
    Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap().to_path_buf()
}

/// Resolve a cargo-installed tool (e.g. `wasm-bindgen`) which may live in
/// `~/.cargo/bin` even when that directory is not on `PATH`.
fn tool(name: &str) -> String {
    let cargo_bin = std::env::var("CARGO_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            PathBuf::from(std::env::var("HOME").unwrap_or_default()).join(".cargo")
        })
        .join("bin")
        .join(name);
    if cargo_bin.exists() {
        cargo_bin.to_string_lossy().into_owned()
    } else {
        name.to_string()
    }
}

fn build(target: &str) {
    if target == WEB_TARGET {
        build_web();
        return;
    }
    if !TARGETS.contains(&target) {
        eprintln!("xtask: invalid target `{target}` (chrome | firefox | safari | web)");
        std::process::exit(1);
    }
    let root = root();
    let dist = root.join(format!("dist-{target}"));
    println!("🔨 Building AIPage (Rust/WASM) for {}", target.to_uppercase());

    // Clean the dist dir so stale artifacts (e.g. an old magick.wasm) don't linger.
    let _ = std::fs::remove_dir_all(&dist);
    std::fs::create_dir_all(&dist).expect("create dist dir");

    // 1. Compile the wasm crates.
    run(
        Command::new("cargo")
            .current_dir(&root)
            .args(["build", "--release", "--target", "wasm32-unknown-unknown"])
            .args(CRATES.iter().flat_map(|c| ["-p", c.pkg])),
        "cargo build (wasm)",
    );

    // 2. wasm-bindgen each artifact.
    let wasm_dir = root.join("target/wasm32-unknown-unknown/release");
    for c in CRATES {
        let wasm = wasm_dir.join(format!("{}.wasm", c.artifact));
        run(
            Command::new(tool("wasm-bindgen")).args([
                wasm.to_str().unwrap(),
                "--out-dir", dist.to_str().unwrap(),
                "--out-name", c.out_name,
                "--target", c.bindgen_target,
                "--no-typescript",
            ]),
            &format!("wasm-bindgen {}", c.out_name),
        );

        // 3. wasm-opt -Oz (optional).
        let bg_wasm = dist.join(format!("{}_bg.wasm", c.out_name));
        if has_tool(&tool("wasm-opt")) {
            // `-all` enables the wasm features wasm-bindgen emits (reference
            // types, bulk memory, multivalue, …) so validation passes.
            run_optional(
                Command::new(tool("wasm-opt")).args([
                    "-Oz",
                    "-all",
                    bg_wasm.to_str().unwrap(),
                    "-o",
                    bg_wasm.to_str().unwrap(),
                ]),
                &format!("wasm-opt {}", c.out_name),
            );
        } else {
            println!("   ↳ wasm-opt not found; skipping size optimisation for {}", c.out_name);
        }
    }

    // 4. CSS (Tailwind + Sass) via bunx, if available.
    build_css(&root, &dist);

    // 5. Static assets + manifest.
    let assets = root.join("assets");
    for f in ["sidebar.html", "sidebar_loader.js", "background_loader.js", "content_loader.js", "anti_cheat.js"] {
        copy(&assets.join(f), &dist.join(f));
    }
    copy(&assets.join(format!("manifest.{target}.json")), &dist.join("manifest.json"));

    println!("✅ Build complete for {target} in dist-{target}/");
}

/// Build the hosted sidebar (`dist-web/`): sidebar crate only, hashed assets.
fn build_web() {
    let root = root();
    let dist = root.join("dist-web");
    println!("🔨 Building AIPage hosted sidebar (web)");

    let _ = std::fs::remove_dir_all(&dist);
    std::fs::create_dir_all(&dist).expect("create dist dir");

    let sidebar = &CRATES[0];
    assert_eq!(sidebar.pkg, "aipage-sidebar");

    run(
        Command::new("cargo")
            .current_dir(&root)
            .args(["build", "--release", "--target", "wasm32-unknown-unknown", "-p", sidebar.pkg]),
        "cargo build (wasm, sidebar)",
    );

    let wasm = root.join("target/wasm32-unknown-unknown/release").join(format!("{}.wasm", sidebar.artifact));
    run(
        Command::new(tool("wasm-bindgen")).args([
            wasm.to_str().unwrap(),
            "--out-dir", dist.to_str().unwrap(),
            "--out-name", sidebar.out_name,
            "--target", sidebar.bindgen_target,
            "--no-typescript",
        ]),
        "wasm-bindgen sidebar",
    );
    let bg_wasm = dist.join("sidebar_bg.wasm");
    if has_tool(&tool("wasm-opt")) {
        run_optional(
            Command::new(tool("wasm-opt")).args(["-Oz", "-all", bg_wasm.to_str().unwrap(), "-o", bg_wasm.to_str().unwrap()]),
            "wasm-opt sidebar",
        );
    } else {
        println!("   ↳ wasm-opt not found; skipping size optimisation");
    }

    build_css(&root, &dist);

    let assets = root.join("assets");
    for f in ["sidebar.html", "sidebar_loader.js"] {
        copy(&assets.join(f), &dist.join(f));
    }

    fingerprint_web_assets(&dist);

    copy(&assets.join("vercel.json"), &dist.join("vercel.json"));
    println!("✅ Build complete for web in dist-web/");
}

/// Rename the sidebar's js/wasm/css to `<stem>.<hash>.<ext>` and rewrite the
/// references between them (html → css/loader, loader → js, js → wasm).
/// Hashing goes leaf-first so every hash covers the final file content.
fn fingerprint_web_assets(dist: &Path) {
    // 1. wasm (leaf)
    let wasm_name = hash_rename(dist, "sidebar_bg.wasm");
    // 2. glue js references the wasm by name (`new URL('sidebar_bg.wasm', import.meta.url)`)
    rewrite(dist, "sidebar.js", &[("sidebar_bg.wasm", &wasm_name)]);
    let js_name = hash_rename(dist, "sidebar.js");
    // 3. loader imports the glue
    rewrite(dist, "sidebar_loader.js", &[("./sidebar.js", &format!("./{js_name}"))]);
    let loader_name = hash_rename(dist, "sidebar_loader.js");
    // 4. css (may be absent when bun is missing)
    let mut html_subs: Vec<(String, String)> = vec![("./sidebar_loader.js".into(), format!("./{loader_name}"))];
    for css in ["sidebar.css", "tailwind.css"] {
        if dist.join(css).exists() {
            let hashed = hash_rename(dist, css);
            html_subs.push((format!("href=\"{css}\""), format!("href=\"{hashed}\"")));
        }
    }
    let subs: Vec<(&str, &str)> = html_subs.iter().map(|(a, b)| (a.as_str(), b.as_str())).collect();
    rewrite(dist, "sidebar.html", &subs);
    println!("   ↳ fingerprinted: {wasm_name}, {js_name}, {loader_name}");
}

/// Rename `dist/<name>` to `dist/<stem>.<hash>.<ext>` and return the new name.
fn hash_rename(dist: &Path, name: &str) -> String {
    let path = dist.join(name);
    let bytes = std::fs::read(&path).unwrap_or_else(|e| {
        eprintln!("xtask: cannot read {}: {e}", path.display());
        std::process::exit(1);
    });
    let hash = content_hash(&bytes);
    let (stem, ext) = name.rsplit_once('.').unwrap_or((name, ""));
    let new_name = if ext.is_empty() { format!("{stem}.{hash}") } else { format!("{stem}.{hash}.{ext}") };
    std::fs::rename(&path, dist.join(&new_name)).expect("rename hashed asset");
    new_name
}

/// Replace every occurrence of each `(from, to)` pair in `dist/<name>`.
fn rewrite(dist: &Path, name: &str, subs: &[(&str, &str)]) {
    let path = dist.join(name);
    let Ok(mut text) = std::fs::read_to_string(&path) else { return };
    for (from, to) in subs {
        if !text.contains(from) {
            eprintln!("xtask: expected `{from}` in {name} (wasm-bindgen output changed?)");
            std::process::exit(1);
        }
        text = text.replace(from, to);
    }
    std::fs::write(&path, text).expect("write rewritten asset");
}

/// 64-bit FNV-1a, rendered as 12 hex chars. Dependency-free; only needs to
/// change whenever the content changes (cache busting, not security).
fn content_hash(bytes: &[u8]) -> String {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in bytes {
        h ^= u64::from(*b);
        h = h.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("{h:016x}")[..12].to_string()
}

fn build_css(root: &Path, dist: &Path) {
    if !has_tool("bunx") && !has_tool("bun") {
        println!("   ↳ bun not found; skipping CSS build (Tailwind/Sass)");
        return;
    }
    // Sass: assets/sidebar.scss → sidebar.css
    run(
        Command::new("bunx").current_dir(root).args([
            "sass",
            "assets/sidebar.scss",
            dist.join("sidebar.css").to_str().unwrap(),
            "--style=compressed",
            "--no-source-map",
        ]),
        "sass",
    );
    // Tailwind/PostCSS: assets/tailwind.css → tailwind.css
    run(
        Command::new("bunx").current_dir(root).args([
            "postcss",
            "assets/tailwind.css",
            "-o",
            dist.join("tailwind.css").to_str().unwrap(),
        ]),
        "postcss/tailwind",
    );
}

fn has_tool(name: &str) -> bool {
    Command::new(name).arg("--version").output().map(|o| o.status.success()).unwrap_or(false)
}

fn copy(from: &Path, to: &Path) {
    match std::fs::copy(from, to) {
        Ok(_) => {}
        Err(e) => println!("   ↳ skip copy {} ({e})", from.display()),
    }
}

fn run(cmd: &mut Command, label: &str) {
    let status = cmd.status().unwrap_or_else(|e| {
        eprintln!("xtask: failed to spawn `{label}`: {e}");
        std::process::exit(1);
    });
    if !status.success() {
        eprintln!("xtask: `{label}` failed ({status})");
        std::process::exit(1);
    }
}

/// Like [`run`], but a failure is a warning, not a hard error (used for the
/// optional size-optimisation pass).
fn run_optional(cmd: &mut Command, label: &str) {
    match cmd.status() {
        Ok(s) if s.success() => {}
        Ok(s) => println!("   ↳ {label} failed ({s}); using unoptimised wasm"),
        Err(e) => println!("   ↳ {label} could not run ({e}); using unoptimised wasm"),
    }
}
