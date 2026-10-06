//! Build orchestrator for the AIPage WASM extension.
//!
//! Usage:
//!   cargo xtask build [--target chrome|firefox|safari|web]   (default: chrome)
//!   cargo xtask build-all                                     (the 3 browsers)
//!
//! Both commands accept:
//!   --version-stamp <version>   write `<version>` as the manifest `version`
//!                               (1–4 dot-separated integers, e.g. 1.7.0.20261006)
//!   --version-name <text>       also write a free-form `version_name` (Chrome
//!                               only; Firefox/Safari ignore the key)
//!
//! Pipeline: compile the three wasm crates → run `wasm-bindgen` → `wasm-opt`
//! (if present) → build CSS via Tailwind/Sass (if present) → copy the static
//! assets and the target manifest into `dist-<target>/`.
//!
//! The `web` target builds only the sidebar as a static site for Vercel
//! (`dist-web/`): js/wasm/css get content-hashed filenames (safe to cache
//! immutably), `sidebar.html` references them, and `assets/vercel.json`
//! supplies the HTTP headers. It also writes `aipage-web.json`, the hash
//! manifest the extension's self-updating sidebar verifies release assets
//! against (see [`write_web_manifest`]).

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::process::Command;

use sha2::{Digest, Sha256};

const TARGETS: &[&str] = &["chrome", "firefox", "safari"];
const WEB_TARGET: &str = "web";

/// wasm features `wasm-opt` may assume: the default feature set of rustc's
/// `wasm32-unknown-unknown` target (see the wasm-opt step in [`build`]).
const WASM_OPT_FEATURES: &[&str] = &[
    "--enable-bulk-memory",
    "--enable-multivalue",
    "--enable-mutable-globals",
    "--enable-nontrapping-float-to-int",
    "--enable-reference-types",
    "--enable-sign-ext",
];

/// Manifest overrides applied when copying `assets/manifest.<target>.json`.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
struct Stamp {
    /// Replacement for the manifest `version` (already validated).
    version: Option<String>,
    /// Chrome-only display string written as `version_name`.
    version_name: Option<String>,
}

impl Stamp {
    fn from_args(args: &[String]) -> Self {
        let version = parse_flag(args, "--version-stamp").map(|v| {
            if let Err(e) = validate_manifest_version(&v) {
                eprintln!("xtask: invalid --version-stamp `{v}`: {e}");
                std::process::exit(1);
            }
            v
        });
        let version_name = parse_flag(args, "--version-name");
        if version_name.is_some() && version.is_none() {
            eprintln!("xtask: --version-name requires --version-stamp");
            std::process::exit(1);
        }
        Self { version, version_name }
    }

    fn is_empty(&self) -> bool {
        self.version.is_none() && self.version_name.is_none()
    }
}

/// Validate an extension manifest `version` against the rules shared by
/// Chrome, Firefox (addons-linter) and Safari: one to four dot-separated
/// integers, no leading zeros, at most nine digits per component (the
/// addons-linter limit; Chromium itself accepts larger components for
/// unpacked loads, the Chrome Web Store caps them at 65535).
fn validate_manifest_version(v: &str) -> Result<(), String> {
    let parts: Vec<&str> = v.split('.').collect();
    if parts.is_empty() || parts.len() > 4 {
        return Err("expected 1 to 4 dot-separated integers".into());
    }
    for p in &parts {
        if p.is_empty() || !p.bytes().all(|b| b.is_ascii_digit()) {
            return Err(format!("component `{p}` is not an unsigned integer"));
        }
        if p.len() > 1 && p.starts_with('0') {
            return Err(format!("component `{p}` has a leading zero"));
        }
        if p.len() > 9 {
            return Err(format!("component `{p}` is longer than 9 digits"));
        }
    }
    Ok(())
}

/// Apply the stamp to a manifest JSON document, preserving key order.
fn stamp_manifest(manifest: &str, stamp: &Stamp) -> Result<String, String> {
    let mut doc: serde_json::Value =
        serde_json::from_str(manifest).map_err(|e| format!("manifest is not valid JSON: {e}"))?;
    let obj = doc.as_object_mut().ok_or("manifest root is not an object")?;
    if let Some(v) = &stamp.version {
        obj.insert("version".into(), serde_json::Value::String(v.clone()));
    }
    if let Some(n) = &stamp.version_name {
        // Keep `version_name` right after `version` for readability.
        let mut rebuilt = serde_json::Map::new();
        for (k, val) in obj.iter() {
            if k == "version_name" {
                continue;
            }
            rebuilt.insert(k.clone(), val.clone());
            if k == "version" {
                rebuilt.insert("version_name".into(), serde_json::Value::String(n.clone()));
            }
        }
        if !rebuilt.contains_key("version_name") {
            rebuilt.insert("version_name".into(), serde_json::Value::String(n.clone()));
        }
        *obj = rebuilt;
    }
    let mut out = serde_json::to_string_pretty(&doc).map_err(|e| e.to_string())?;
    out.push('\n');
    Ok(out)
}

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
    let stamp = Stamp::from_args(&args);
    match cmd {
        "build" => {
            let target = parse_flag(&args, "--target").unwrap_or_else(|| "chrome".into());
            build(&target, &stamp);
        }
        "build-all" => TARGETS.iter().for_each(|t| build(t, &stamp)),
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

fn build(target: &str, stamp: &Stamp) {
    if target == WEB_TARGET {
        build_web(stamp);
        return;
    }
    if !TARGETS.contains(&target) {
        eprintln!("xtask: invalid target `{target}` (chrome | firefox | safari | web)");
        std::process::exit(1);
    }
    let root = root();
    let dist = root.join(format!("dist-{target}"));
    println!("🔨 Building AIPage (Rust/WASM) for {}", target.to_uppercase());
    if let Some(v) = &stamp.version {
        println!("   ↳ stamping manifest version {v}");
    }

    // Clean the dist dir so stale artifacts don't linger.
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
            // Enable exactly the features rustc enables by default for
            // `wasm32-unknown-unknown` (`rustc --print cfg --target
            // wasm32-unknown-unknown | grep target_feature`) so validation of
            // the wasm-bindgen output passes. Do NOT use `-all`: binaryen ≥ 1xx
            // then also enables post-MVP proposals (shared-everything, custom
            // descriptors, …) and writes encodings that shipping engines reject
            // ("WebAssembly.instantiateStreaming(): unknown import kind 0x7f"
            // on Chromium 141 / Node 22 with binaryen 132).
            run_optional(
                Command::new(tool("wasm-opt")).args(WASM_OPT_FEATURES).args([
                    "-Oz",
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
    write_manifest(&assets.join(format!("manifest.{target}.json")), &dist.join("manifest.json"), target, stamp);

    println!("✅ Build complete for {target} in dist-{target}/");
}

/// Copy the target manifest into the dist dir, applying the version stamp
/// (if any). `version_name` is a Chrome-only key, so it is dropped for the
/// other targets to keep addons-linter / Safari converters quiet.
fn write_manifest(from: &Path, to: &Path, target: &str, stamp: &Stamp) {
    if stamp.is_empty() {
        copy(from, to);
        return;
    }
    let effective = Stamp {
        version: stamp.version.clone(),
        version_name: if target == "chrome" { stamp.version_name.clone() } else { None },
    };
    let src = std::fs::read_to_string(from).unwrap_or_else(|e| {
        eprintln!("xtask: cannot read {}: {e}", from.display());
        std::process::exit(1);
    });
    let out = stamp_manifest(&src, &effective).unwrap_or_else(|e| {
        eprintln!("xtask: cannot stamp {}: {e}", from.display());
        std::process::exit(1);
    });
    std::fs::write(to, out).unwrap_or_else(|e| {
        eprintln!("xtask: cannot write {}: {e}", to.display());
        std::process::exit(1);
    });
}

/// Build the hosted sidebar (`dist-web/`): sidebar crate only, hashed assets,
/// plus the `aipage-web.json` hash manifest (stamped with `--version-stamp`
/// when given, else the committed manifest version).
fn build_web(stamp: &Stamp) {
    let root = root();
    let dist = root.join("dist-web");
    println!("🔨 Building AIPage hosted sidebar (web)");
    if let Some(v) = &stamp.version {
        println!("   ↳ stamping aipage-web.json version {v}");
    }

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
            Command::new(tool("wasm-opt")).args(WASM_OPT_FEATURES).args([
                "-Oz",
                bg_wasm.to_str().unwrap(),
                "-o",
                bg_wasm.to_str().unwrap(),
            ]),
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
    write_web_manifest(&root, &dist, stamp);
    println!("✅ Build complete for web in dist-web/");
}

/// Name of the hash manifest written next to the web assets.
const WEB_MANIFEST: &str = "aipage-web.json";

/// Write `dist-web/aipage-web.json`:
///
/// ```json
/// { "version": "1.7.0.20261006", "sha": "<git sha>", "built_at": "2026-10-06T03:20:00Z",
///   "files": { "sidebar.html": { "sha256": "…", "size": 903 }, "sidebar.<hash>.js": { … }, … } }
/// ```
///
/// `files` lists every published file (sorted by name) except `vercel.json`
/// (deployment config, never served) and the manifest itself. The sha comes
/// from `AIPAGE_GIT_SHA`, else `GITHUB_SHA`, else `git rev-parse HEAD`;
/// `built_at` honours `SOURCE_DATE_EPOCH` for reproducible builds. Hashing
/// is plain SHA-256 of the file bytes, so the manifest is deterministic for
/// a given set of files.
fn write_web_manifest(root: &Path, dist: &Path, stamp: &Stamp) {
    let version = stamp.version.clone().unwrap_or_else(|| committed_manifest_version(root));
    let sha = git_sha(root);
    let built_at = iso8601_utc(build_timestamp());
    let mut files: BTreeMap<String, (String, u64)> = BTreeMap::new();
    let entries = std::fs::read_dir(dist).unwrap_or_else(|e| {
        eprintln!("xtask: cannot list {}: {e}", dist.display());
        std::process::exit(1);
    });
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if !entry.path().is_file() || name == "vercel.json" || name == WEB_MANIFEST {
            continue;
        }
        let bytes = std::fs::read(entry.path()).unwrap_or_else(|e| {
            eprintln!("xtask: cannot read {}: {e}", entry.path().display());
            std::process::exit(1);
        });
        files.insert(name, (sha256_hex(&bytes), bytes.len() as u64));
    }
    let json = web_manifest_json(&version, &sha, &built_at, &files);
    std::fs::write(dist.join(WEB_MANIFEST), json).expect("write aipage-web.json");
    println!("   ↳ wrote {WEB_MANIFEST} ({} files, version {version}, sha {})", files.len(), if sha.is_empty() { "unknown" } else { &sha });
}

/// Render the manifest document (pretty, trailing newline, sorted files).
fn web_manifest_json(version: &str, sha: &str, built_at: &str, files: &BTreeMap<String, (String, u64)>) -> String {
    let mut files_obj = serde_json::Map::new();
    for (name, (sha256, size)) in files {
        files_obj.insert(name.clone(), serde_json::json!({ "sha256": sha256, "size": size }));
    }
    let doc = serde_json::json!({
        "version": version,
        "sha": sha,
        "built_at": built_at,
        "files": files_obj,
    });
    let mut out = serde_json::to_string_pretty(&doc).expect("serialize aipage-web.json");
    out.push('\n');
    out
}

/// `version` of `assets/manifest.chrome.json` (the committed base version).
fn committed_manifest_version(root: &Path) -> String {
    let path = root.join("assets/manifest.chrome.json");
    let text = std::fs::read_to_string(&path).unwrap_or_default();
    serde_json::from_str::<serde_json::Value>(&text)
        .ok()
        .and_then(|v| v.get("version")?.as_str().map(str::to_string))
        .unwrap_or_else(|| {
            eprintln!("xtask: cannot read the version from {}", path.display());
            std::process::exit(1);
        })
}

/// The commit being built: `AIPAGE_GIT_SHA`, `GITHUB_SHA`, else `git rev-parse HEAD`
/// (empty when none is available, e.g. a source tarball).
fn git_sha(root: &Path) -> String {
    for var in ["AIPAGE_GIT_SHA", "GITHUB_SHA"] {
        if let Ok(v) = std::env::var(var) {
            let v = v.trim().to_string();
            if !v.is_empty() {
                return v;
            }
        }
    }
    Command::new("git")
        .current_dir(root)
        .args(["rev-parse", "HEAD"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_default()
}

/// Seconds since the Unix epoch for `built_at`: `SOURCE_DATE_EPOCH` or now.
fn build_timestamp() -> u64 {
    std::env::var("SOURCE_DATE_EPOCH")
        .ok()
        .and_then(|s| s.trim().parse().ok())
        .unwrap_or_else(|| {
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0)
        })
}

/// `YYYY-MM-DDTHH:MM:SSZ` for a Unix timestamp (proleptic Gregorian, no
/// leap seconds), dependency-free.
fn iso8601_utc(secs: u64) -> String {
    let days = (secs / 86_400) as i64;
    let rem = secs % 86_400;
    let (h, m, s) = (rem / 3600, (rem % 3600) / 60, rem % 60);
    // Howard Hinnant's civil_from_days.
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let mo = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if mo <= 2 { y + 1 } else { y };
    format!("{y:04}-{mo:02}-{d:02}T{h:02}:{m:02}:{s:02}Z")
}

/// Lower-case hex SHA-256 of `bytes`.
fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes).iter().map(|b| format!("{b:02x}")).collect()
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_valid_versions() {
        for v in ["1", "1.7", "1.7.0", "1.7.0.20261006", "0.0.0.0", "1.7.0.999999999"] {
            assert!(validate_manifest_version(v).is_ok(), "{v} should be valid");
        }
    }

    #[test]
    fn rejects_invalid_versions() {
        for v in ["", "1.7.0.", ".1", "1.7.0.1.2", "1.07", "1.7.0.01", "1.7.0-beta", "1.7.0.1234567890", "a.b"] {
            assert!(validate_manifest_version(v).is_err(), "{v} should be invalid");
        }
    }

    #[test]
    fn stamps_version_and_version_name_after_it() {
        let manifest = r#"{"manifest_version":2,"name":"AIPage","version":"1.7.0","description":"d"}"#;
        let stamp = Stamp {
            version: Some("1.7.0.20261006".into()),
            version_name: Some("1.7.0-nightly.20261006+abc1234".into()),
        };
        let out = stamp_manifest(manifest, &stamp).unwrap();
        let doc: serde_json::Value = serde_json::from_str(&out).unwrap();
        let keys: Vec<&str> = doc.as_object().unwrap().keys().map(String::as_str).collect();
        assert_eq!(keys, ["manifest_version", "name", "version", "version_name", "description"]);
        assert_eq!(doc["version"], "1.7.0.20261006");
        assert_eq!(doc["version_name"], "1.7.0-nightly.20261006+abc1234");
        assert!(out.ends_with('\n'));
    }

    #[test]
    fn stamp_without_name_leaves_other_keys_untouched() {
        let manifest = r#"{"name":"AIPage","version":"1.7.0","version_name":"old"}"#;
        let stamp = Stamp { version: Some("2.0.0".into()), version_name: None };
        let out: serde_json::Value = serde_json::from_str(&stamp_manifest(manifest, &stamp).unwrap()).unwrap();
        assert_eq!(out["version"], "2.0.0");
        assert_eq!(out["version_name"], "old");
    }

    #[test]
    fn formats_iso8601_utc() {
        assert_eq!(iso8601_utc(0), "1970-01-01T00:00:00Z");
        assert_eq!(iso8601_utc(951_782_400), "2000-02-29T00:00:00Z");
        assert_eq!(iso8601_utc(1_791_250_800), "2026-10-06T01:40:00Z");
        assert_eq!(iso8601_utc(4_102_444_799), "2099-12-31T23:59:59Z");
    }

    #[test]
    fn sha256_hex_known_vector() {
        assert_eq!(sha256_hex(b"abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    }

    #[test]
    fn web_manifest_is_sorted_and_stable() {
        let mut files = BTreeMap::new();
        files.insert("tailwind.f2170e90e154.css".to_string(), (sha256_hex(b"css"), 3));
        files.insert("sidebar.html".to_string(), (sha256_hex(b"html"), 4));
        files.insert("sidebar_bg.3050fca62328.wasm".to_string(), (sha256_hex(b"wasm"), 4));
        let a = web_manifest_json("1.7.0.20261006", "abc1234", "2026-10-06T03:20:00Z", &files);
        let b = web_manifest_json("1.7.0.20261006", "abc1234", "2026-10-06T03:20:00Z", &files);
        assert_eq!(a, b);
        assert!(a.ends_with('\n'));
        let doc: serde_json::Value = serde_json::from_str(&a).unwrap();
        assert_eq!(doc["version"], "1.7.0.20261006");
        assert_eq!(doc["sha"], "abc1234");
        assert_eq!(doc["built_at"], "2026-10-06T03:20:00Z");
        let keys: Vec<&str> = doc["files"].as_object().unwrap().keys().map(String::as_str).collect();
        assert_eq!(keys, ["sidebar.html", "sidebar_bg.3050fca62328.wasm", "tailwind.f2170e90e154.css"]);
        assert_eq!(doc["files"]["sidebar.html"]["size"], 4);
        assert_eq!(doc["files"]["sidebar.html"]["sha256"], sha256_hex(b"html"));
    }

    #[test]
    fn stamp_from_args_parses_flags() {
        let args: Vec<String> = ["build-all", "--version-stamp", "1.7.0.20261006", "--version-name", "nightly"]
            .map(String::from)
            .to_vec();
        let stamp = Stamp::from_args(&args);
        assert_eq!(stamp.version.as_deref(), Some("1.7.0.20261006"));
        assert_eq!(stamp.version_name.as_deref(), Some("nightly"));
        assert!(Stamp::from_args(&["build".to_string()]).is_empty());
    }
}
