#!/usr/bin/env bash
# Wrap the built Safari web extension (dist-safari) in the native macOS app
# Safari requires, optionally build it and zip the result. macOS + Xcode only.
#
#   scripts/setup-safari.sh [--build] [--package <zip>] [--dist <dir>] [--out <dir>]
#                           [--app-name <name>] [--bundle-id <id>] [--open]
#
#   (default)        generate <out>/<app-name>/<app-name>.xcodeproj from <dist>
#   --build          also run xcodebuild (Release, unsigned) → <out>/build
#   --package <zip>  also zip the built <app-name>.app into <zip> (implies --build)
#   --open           open the generated project in Xcode (default: do not)
#
# Defaults: --dist dist-safari, --out safari, --app-name AIPage,
#           --bundle-id dev.hesburger.edupage-ai-sidebar.
#
# Apple ships the generator as `safari-web-extension-packager` (Xcode 26+)
# and as `safari-web-extension-converter` before that; both take the same
# options. The macOS-only project is generated with --copy-resources so the
# app bundle embeds its own copy of the extension and --no-prompt so the
# "unsupported manifest keys" warning (e.g. `downloads`) is printed instead
# of asked about. The unsigned build (CODE_SIGNING_ALLOWED=NO) runs locally
# once Safari's "Allow unsigned extensions" developer setting is on; signed
# distribution needs an Apple Developer account and is out of scope here.
#
# CI (.github/workflows/build.yml, macos job) runs:
#   scripts/setup-safari.sh --package aipage-safari-macos.zip
set -euo pipefail

dist="dist-safari"
out="safari"
app_name="AIPage"
bundle_id="dev.hesburger.edupage-ai-sidebar"
do_build=0
do_open=0
package=""

while [ $# -gt 0 ]; do
  case "$1" in
    --build) do_build=1 ;;
    --open) do_open=1 ;;
    --package) package="${2:?--package needs a path}"; do_build=1; shift ;;
    --dist) dist="${2:?--dist needs a path}"; shift ;;
    --out) out="${2:?--out needs a path}"; shift ;;
    --app-name) app_name="${2:?--app-name needs a value}"; shift ;;
    --bundle-id) bundle_id="${2:?--bundle-id needs a value}"; shift ;;
    -h|--help) sed -n '2,24p' "$0"; exit 0 ;;
    *) echo "setup-safari: unknown argument $1" >&2; exit 2 ;;
  esac
  shift
done

if [[ "$OSTYPE" != darwin* ]]; then
  echo "setup-safari: Safari extension packaging requires macOS (got $OSTYPE)" >&2
  exit 1
fi
if ! command -v xcrun >/dev/null 2>&1; then
  echo "setup-safari: xcrun not found; install Xcode (xcode-select --install is not enough for xcodebuild)" >&2
  exit 1
fi
if [ ! -f "$dist/manifest.json" ]; then
  echo "setup-safari: $dist/manifest.json not found; build it first: cargo run -p xtask -- build --target safari" >&2
  exit 1
fi

# Resolve the generator: packager (new name) or converter (old name).
tool=""
for candidate in safari-web-extension-packager safari-web-extension-converter; do
  if xcrun --find "$candidate" >/dev/null 2>&1; then
    tool="$candidate"
    break
  fi
done
if [ -z "$tool" ]; then
  echo "setup-safari: neither safari-web-extension-packager nor safari-web-extension-converter found via xcrun" >&2
  exit 1
fi
echo "setup-safari: using xcrun $tool ($(xcodebuild -version | head -n 1))"

args=(
  "$dist"
  --project-location "$out"
  --app-name "$app_name"
  --bundle-identifier "$bundle_id"
  --macos-only
  --copy-resources
  --no-prompt
  --force
)
if [ "$do_open" -eq 0 ]; then
  args+=(--no-open)
fi

mkdir -p "$out"
echo "setup-safari: generating $out/$app_name/$app_name.xcodeproj from $dist"
# The generator exits 0 after printing warnings about manifest keys Safari
# does not support; a non-zero status is a real failure.
xcrun "$tool" "${args[@]}"

project="$(find "$out" -maxdepth 2 -name '*.xcodeproj' -print -quit)"
if [ -z "$project" ]; then
  echo "setup-safari: no .xcodeproj found under $out after conversion" >&2
  find "$out" -maxdepth 2 -print >&2 || true
  exit 1
fi
echo "setup-safari: Xcode project: $project"

# Pin the bundle identifiers to <bundle-id> (app) and <bundle-id>.Extension.
# The Xcode 26 packager derives the app's id from the --bundle-identifier
# prefix plus the app name (dev.hesburger.AIPage) while the extension keeps
# <bundle-id>.Extension, so ValidateEmbeddedBinary rejects the build ("not
# prefixed with the parent app's bundle identifier"). Rewrite every generated
# id (pbxproj, plists, the Swift that names the extension); extension ids
# first so an app id that prefixes one cannot clobber it.
pbxproj="$project/project.pbxproj"
generated_ids="$(perl -ne 'print "$1\n" while /PRODUCT_BUNDLE_IDENTIFIER = "?([^";\s]+)"?;/g' "$pbxproj" | sort -u)"
for pass in extension app; do
  while IFS= read -r old_id; do
    [ -n "$old_id" ] || continue
    case "$old_id" in
      *.Extension) [ "$pass" = extension ] || continue; new_id="$bundle_id.Extension" ;;
      *) [ "$pass" = app ] || continue; new_id="$bundle_id" ;;
    esac
    [ "$old_id" != "$new_id" ] || continue
    echo "setup-safari: bundle id $old_id -> $new_id"
    grep -rlF --exclude-dir=build "$old_id" "$out" | while IFS= read -r file; do
      OLD="$old_id" NEW="$new_id" perl -pi -e 's/\Q$ENV{OLD}\E(?![\w.-])/$ENV{NEW}/g' "$file"
    done
  done <<<"$generated_ids"
done
echo "setup-safari: bundle ids: $(perl -ne 'print "$1 " while /PRODUCT_BUNDLE_IDENTIFIER = "?([^";\s]+)"?;/g' "$pbxproj" | tr ' ' '\n' | sort -u | tr '\n' ' ')"

if [ "$do_build" -eq 0 ]; then
  cat <<EOF

Next steps:
  1. open "$project"
  2. Product > Run (Safari then lists the extension under Settings > Extensions)
  3. or build it unsigned here: scripts/setup-safari.sh --build
EOF
  exit 0
fi

# Pick the app scheme. A --macos-only project generated by Apple's tool
# carries "<app-name> (macOS)" (multi-platform naming) or plain "<app-name>"
# depending on the Xcode version; take whichever exists, else the first one.
schemes="$(xcodebuild -list -json -project "$project" | jq -r '.project.schemes[]')"
scheme=""
for want in "$app_name (macOS)" "$app_name"; do
  if grep -qxF "$want" <<<"$schemes"; then
    scheme="$want"
    break
  fi
done
if [ -z "$scheme" ]; then
  scheme="$(head -n 1 <<<"$schemes")"
fi
if [ -z "$scheme" ]; then
  echo "setup-safari: the project lists no schemes" >&2
  exit 1
fi
echo "setup-safari: schemes: $(tr '\n' ',' <<<"$schemes" | sed 's/,$//'); building \"$scheme\""

derived="$out/build"
rm -rf "$derived"
# Unsigned Release build: no identity, signing neither required nor allowed,
# so the runner needs no certificate or provisioning profile.
xcodebuild \
  -project "$project" \
  -scheme "$scheme" \
  -configuration Release \
  -derivedDataPath "$derived" \
  -destination 'platform=macOS' \
  CODE_SIGN_IDENTITY="" \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGNING_ALLOWED=NO \
  build

app="$(find "$derived/Build/Products" -maxdepth 2 -name "$app_name.app" -print -quit)"
if [ -z "$app" ]; then
  echo "setup-safari: $app_name.app not found under $derived/Build/Products" >&2
  find "$derived/Build/Products" -maxdepth 3 -print >&2 || true
  exit 1
fi
appex="$(find "$app" -name '*.appex' -print -quit)"
if [ -z "$appex" ]; then
  echo "setup-safari: $app contains no .appex (the Safari extension target did not get embedded)" >&2
  exit 1
fi
if [ ! -f "$appex/Contents/Resources/manifest.json" ]; then
  echo "setup-safari: $appex has no Contents/Resources/manifest.json (extension resources missing)" >&2
  exit 1
fi
echo "setup-safari: built $app (extension: $appex)"

if [ -n "$package" ]; then
  rm -f "$package"
  # ditto keeps the bundle's resource forks and permissions, unlike zip.
  ditto -c -k --sequesterRsrc --keepParent "$app" "$package"
  echo "setup-safari: packaged $package ($(du -h "$package" | cut -f1))"
fi
