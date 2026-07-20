//! Build orchestrator for the AIPage WASM extension. Replaces `build.ts`.
//!
//! Usage:
//!   cargo xtask build [--target chrome|firefox|safari]   (default: chrome)
//!   cargo xtask build-all
//!
//! Pipeline: compile the three wasm crates → run `wasm-bindgen` → `wasm-opt`
//! (if present) → build CSS via Tailwind/Sass (if present) → copy the static
//! assets and the target manifest into `dist-<target>/`.

use std::path::{Path, PathBuf};
use std::process::Command;

const TARGETS: &[&str] = &["chrome", "firefox", "safari"];

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
    if !TARGETS.contains(&target) {
        eprintln!("xtask: invalid target `{target}` (chrome | firefox | safari)");
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
