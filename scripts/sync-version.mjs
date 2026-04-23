// Propagates the version from the root package.json (the SSOT) into
// src-tauri/Cargo.toml, which Cargo cannot read from JSON natively.
// Everywhere else (Tauri config, Vite/React, Astro website) reads
// package.json directly, so no other files need touching here.
//
// Runs automatically via the `predev` and `prebuild` npm hooks.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const version = pkg.version;

const cargoPath = resolve(root, 'src-tauri', 'Cargo.toml');
const cargo = readFileSync(cargoPath, 'utf8');

// Match only the [package] table's version line (first occurrence after [package]).
const versionRe = /(\[package\][\s\S]*?\nversion\s*=\s*")[^"]+(")/;
if (!versionRe.test(cargo)) {
  console.error('[sync-version] Could not find version line in src-tauri/Cargo.toml');
  process.exit(1);
}

const updated = cargo.replace(versionRe, `$1${version}$2`);

if (updated !== cargo) {
  writeFileSync(cargoPath, updated);
  console.log(`[sync-version] src-tauri/Cargo.toml -> ${version}`);
} else {
  console.log(`[sync-version] src-tauri/Cargo.toml already at ${version}`);
}
