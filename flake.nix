{
  description = "AIPage — AI sidebar for EduPage (Rust/WASM extension).";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    rust-overlay.url = "github:oxalica/rust-overlay";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
      rust-overlay,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        overlays = [ (import rust-overlay) ];
        pkgs = import nixpkgs { inherit system overlays; };

        # ── Toolchain ────────────────────────────────────────────────────────
        # Rust with the wasm32 target and clippy, sourced from rust-overlay so
        # the version is pinned by the flake input rather than the host.
        rustToolchain = pkgs.rust-bin.stable.latest.default.override {
          extensions = [
            "rust-src"
            "clippy"
          ];
          targets = [ "wasm32-unknown-unknown" ];
        };

        # `wasm-bindgen-cli`'s version MUST exactly match the `wasm-bindgen`
        # crate pinned in Cargo.lock (the CLI refuses to process a .wasm built
        # with a different crate version). nixpkgs ships 0.2.121; the workspace
        # pins 0.2.125, so build the matched CLI from source.
        wasmBindgenVersion = "0.2.125";
        wasm-bindgen-cli = pkgs.rustPlatform.buildRustPackage {
          pname = "wasm-bindgen-cli";
          version = wasmBindgenVersion;
          src = pkgs.fetchCrate {
            pname = "wasm-bindgen-cli";
            version = wasmBindgenVersion;
            hash = "sha256-zRawtjxMOdTMX+mZaiNR3YYfTiZJhf9qj7kXSSeMxrc=";
          };
          cargoHash = "sha256-aZCfgR23Qb0Pn4Mm4ToMtuuRQqSJjXCR9li/VvP5CTM=";
          doCheck = false;
          nativeBuildInputs = [ pkgs.gcc ];
        };

        # Everything the xtask build (`cargo run -p xtask -- build`) shells out
        # to: cargo + rustc (rustToolchain), wasm-bindgen, wasm-opt (binaryen),
        # bun (sass/postcss/tailwind via bunx) and zip for packaging.
        buildInputs = [
          rustToolchain
          wasm-bindgen-cli
          pkgs.binaryen # provides `wasm-opt`
          pkgs.bun
          pkgs.dart-sass # `sass` CLI (used by xtask via `bunx sass`)
          pkgs.web-ext # Firefox packaging/lint
          pkgs.zip
          pkgs.cacert
        ];
      in
      {
        devShells.default = pkgs.mkShell {
          packages =
            buildInputs
            ++ [
              pkgs.rust-analyzer
              pkgs.cargo-watch
            ];

          RUST_SRC_PATH = "${rustToolchain}/lib/rustlib/src/rust/library";
          RUST_LOG = "info";

          # Make the JS tooling (postcss/tailwind/playwright) available inside
          # the shell without forcing a manual `bun install`.
          shellHook = ''
            if [ ! -d node_modules ]; then
              echo "[aipage] installing JS deps (bun install)…"
              bun install
            fi
          '';
        };

        # `nix fmt`
        formatter = pkgs.nixfmt-rfc-style;

        # A convenience wrapper so `nix run .#build -- chrome` builds the dist
        # using the flake-pinned toolchain (with network available, since the
        # JS CSS pipeline fetches npm deps via `bun install`).
        apps.build = {
          type = "app";
          program = pkgs.writeShellApplication {
            name = "aipage-build";
            runtimeInputs = buildInputs;
            text = ''
              target="''${1:-chrome}"
              if [ ! -d node_modules ]; then bun install; fi
              cargo run -p xtask -- build --target "$target"
            '';
          } + "/bin/aipage-build";
        };
      }
    );
}