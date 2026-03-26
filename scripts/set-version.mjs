#!/usr/bin/env node
/**
 * set-version.mjs
 * Updates all package/config version fields to the given version.
 *
 * Usage:
 *   node scripts/set-version.mjs 1.2.3
 *   node scripts/set-version.mjs v1.2.3   (leading 'v' is stripped automatically)
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const root  = resolve(__dir, '..');

// ── Version argument ────────────────────────────────────────────────────────
const raw = process.argv[2];
if (!raw) {
  console.error('Usage: node scripts/set-version.mjs <version>');
  process.exit(1);
}
const version = raw.replace(/^v/, '');
console.log(`Setting version → ${version}`);

// ── Helpers ─────────────────────────────────────────────────────────────────
function updateJson(relPath) {
  const abs  = resolve(root, relPath);
  const json = JSON.parse(readFileSync(abs, 'utf8'));
  json.version = version;
  writeFileSync(abs, JSON.stringify(json, null, 2) + '\n');
  console.log(`  ✓  ${relPath}`);
}

function updateToml(relPath) {
  const abs     = resolve(root, relPath);
  const content = readFileSync(abs, 'utf8');
  // Replace the first top-level `version = "…"` line
  const updated = content.replace(/^version\s*=\s*"[^"]*"/m, `version = "${version}"`);
  writeFileSync(abs, updated);
  console.log(`  ✓  ${relPath}`);
}

// ── JSON files ───────────────────────────────────────────────────────────────
updateJson('apps/desktop-mobile/package.json');
updateJson('apps/desktop-mobile/src-tauri/tauri.conf.json');
updateJson('packages/config/package.json');
updateJson('packages/grq-core/package.json');
updateJson('packages/grq-api-bindings/package.json');
updateJson('packages/grq-ui/package.json');

// ── TOML files ───────────────────────────────────────────────────────────────
updateToml('apps/desktop-mobile/src-tauri/Cargo.toml');
updateToml('crates/grq-engine/Cargo.toml');

console.log('\nDone.');
