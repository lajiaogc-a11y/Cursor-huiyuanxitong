/**
 * 编译 electron/ 目录下的 TypeScript 文件为 ESM JavaScript
 *
 * 使用 esbuild 逐文件转译（非 bundle），保留目录结构。
 * 输出到 electron/dist/，供 electron-builder 打包。
 */

import { build } from 'esbuild';
import { readdirSync, statSync, rmSync, existsSync } from 'fs';
import { join, relative } from 'path';

const ELECTRON_DIR = 'electron';
const OUT_DIR = join(ELECTRON_DIR, 'dist');

function collectTsFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (['node_modules', 'dist', '.wwebjs_auth', '.wa_sessions'].includes(entry)) continue;
      results.push(...collectTsFiles(full));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
      results.push(full);
    }
  }
  return results;
}

if (existsSync(OUT_DIR)) {
  rmSync(OUT_DIR, { recursive: true, force: true });
}

const entryPoints = collectTsFiles(ELECTRON_DIR);

console.log(`[build-electron] Compiling ${entryPoints.length} TypeScript files...`);

await build({
  entryPoints,
  outdir: OUT_DIR,
  outbase: ELECTRON_DIR,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  sourcemap: false,
  logLevel: 'warning',
});

console.log(`[build-electron] ✓ Output: ${OUT_DIR}/`);
for (const f of entryPoints) {
  const rel = relative(ELECTRON_DIR, f).replace(/\.ts$/, '.js');
  console.log(`  ${rel}`);
}
