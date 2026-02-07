#!/bin/bash
# Build documentation for GitLab Pages using MDBook

set -e

echo "Building documentation..."

# Check if mdbook is installed
if ! command -v mdbook &> /dev/null; then
    echo "MDBook not found."
    echo ""
    echo "To install MDBook, choose one of:"
    echo "  1. cargo install mdbook  (if you have Rust/Cargo)"
    echo "  2. Download binary from: https://github.com/rust-lang/mdBook/releases"
    echo "  3. On macOS with Homebrew: brew install mdbook"
    echo ""
    echo "For quick install on macOS:"
    echo "  curl -sSL https://github.com/rust-lang/mdBook/releases/download/v0.4.40/mdbook-v0.4.40-x86_64-apple-darwin.tar.gz | tar -xz && chmod +x mdbook && mv mdbook /usr/local/bin/"
    echo ""
    exit 1
fi

# Clean previous build
rm -rf public
mkdir -p public

# Copy and process markdown files (remove emojis)
echo "Processing markdown files..."
sed 's/🤖 //g; s/🌐 //g; s/🎨 //g; s/💬 //g; s/🔒 //g; s/📱 //g; s/🛡️ //g; s/🧠 //g; s/✨ //g; s/📦 //g; s/🔧 //g; s/🚀 //g; s/📝 //g; s/🏗️ //g; s/👷 //g; s/✅ //g; s/⚡ //g; s/🐛 //g; s/♻️ //g; s/📚 //g; s/💎 //g' README.md > book/src/user-guide.md

sed 's/✨ //g; s/🐛 //g; s/⚡ //g; s/📚 //g; s/💎 //g; s/♻️ //g; s/✅ //g; s/🏗️ //g; s/👷 //g; s/🔧 //g' CHANGELOG.md > book/src/changelog.md

sed 's/🏗️ //g; s/📦 //g; s/🌐 //g; s/🔧 //g; s/🧪 //g; s/📚 //g; s/🤝 //g; s/📖 //g; s/📝 //g; s/🔄 //g; s/✅ //g; s/⚠️ //g; s/🚀 //g; s/💡 //g; s/🔍 //g' CONTRIBUTING.md > book/src/contributing.md

# Build the book
echo "Building MDBook..."
mdbook build

# Generate API documentation with TypeDoc
echo "Generating API documentation..."
npx typedoc || echo "TypeDoc generation failed, skipping API docs"

echo "Documentation built successfully in public/"
