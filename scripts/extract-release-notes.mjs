#!/usr/bin/env node
import fs from "node:fs";

const tag = process.argv[2] ?? "";
const version = tag.replace(/^v/, "");

if (!version) {
  process.stdout.write(`Release ${tag || "unknown"}`);
  process.exit(0);
}

const changelogPath = "book/src/changelog.md";
if (!fs.existsSync(changelogPath)) {
  process.stdout.write(`Release ${tag}`);
  process.exit(0);
}

const content = fs.readFileSync(changelogPath, "utf8");
const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const header = new RegExp(`^## \\[v?${escaped}\\]`, "m");
const start = content.search(header);

if (start === -1) {
  process.stdout.write(`Release ${tag}`);
  process.exit(0);
}

const rest = content.slice(start);
const nextSection = rest.slice(1).search(/^## /m);
const notes = (nextSection === -1 ? rest : rest.slice(0, nextSection + 1)).trim();
process.stdout.write(notes || `Release ${tag}`);
