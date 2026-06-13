#!/usr/bin/env node
/** Copy .githooks/* into .git/hooks/ (no git config changes). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gitHooksDir = path.join(root, ".git", "hooks");
const srcDir = path.join(root, ".githooks");

if (!fs.existsSync(gitHooksDir)) {
  console.log("install-git-hooks: skip (not a git checkout)");
  process.exit(0);
}
if (!fs.existsSync(srcDir)) {
  console.log("install-git-hooks: skip (.githooks missing)");
  process.exit(0);
}

for (const name of fs.readdirSync(srcDir)) {
  const src = path.join(srcDir, name);
  if (!fs.statSync(src).isFile()) continue;
  const dest = path.join(gitHooksDir, name);
  fs.copyFileSync(src, dest);
  try {
    fs.chmodSync(dest, 0o755);
  } catch {
    /* Windows may ignore mode */
  }
  console.log(`install-git-hooks: installed ${name}`);
}
