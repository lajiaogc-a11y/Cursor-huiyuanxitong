#!/usr/bin/env node
/**
 * ESLint 仅针对 Git 变更范围内的 .ts/.tsx（增量门禁）。
 *   --staged          已暂存文件（与 pre-commit / lint-staged 一致）
 *   --base <ref>      与当前 HEAD 对比的三点 diff： <ref>...HEAD （PR / 本地对比 main）
 *
 * 无匹配文件时退出 0。
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function parseArgs() {
  const argv = process.argv.slice(2);
  let staged = false;
  let base = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--staged") staged = true;
    else if (argv[i] === "--base" && argv[i + 1]) {
      base = argv[++i];
    }
  }
  return { staged, base };
}

function collectNames(staged, base) {
  if (staged) {
    return git(["diff", "--cached", "--name-only", "--diff-filter=ACM"]);
  }
  if (!base) {
    throw new Error("Provide --staged or --base <ref>");
  }
  if (base === "HEAD~1") {
    try {
      execFileSync("git", ["rev-parse", "--verify", "HEAD~1"], { cwd: root, stdio: "ignore" });
    } catch {
      return "";
    }
  }
  return git(["diff", "--name-only", `${base}...HEAD`]);
}

function filterLintable(namesRaw) {
  if (!namesRaw) return [];
  return namesRaw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((f) => /\.(tsx?|mts|cts)$/.test(f))
    .filter((f) => existsSync(join(root, f)));
}

function main() {
  const { staged, base } = parseArgs();
  if (!staged && !base) {
    console.error("Usage: node scripts/lint-incremental.mjs --staged");
    console.error("       node scripts/lint-incremental.mjs --base <git-ref>");
    process.exit(1);
  }

  let namesRaw;
  try {
    namesRaw = collectNames(staged, base);
  } catch (e) {
    console.error("[lint-incremental] git failed:", e?.message ?? e);
    process.exit(1);
  }

  const files = filterLintable(namesRaw);
  if (files.length === 0) {
    console.log("[lint-incremental] No matching .ts/.tsx files; skip.");
    process.exit(0);
  }

  console.log(`[lint-incremental] ${files.length} file(s)`);

  const eslintBin = join(root, "node_modules", "eslint", "bin", "eslint.js");
  const useNode = existsSync(eslintBin);
  const cmd = useNode ? process.execPath : "npx";
  const args = useNode ? [eslintBin, ...files] : ["eslint", ...files];

  const run = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    shell: !useNode && process.platform === "win32",
    env: process.env,
  });

  process.exit(run.status ?? 1);
}

main();
