#!/usr/bin/env node
/**
 * 方案 E：最小架构门禁 — 旁路 tableProxy 引用收敛（可逐步加规则）。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const serverSrc = path.join(root, 'server', 'src');

const ALLOW_TABLE_PROXY_IMPORT = [
  /[/\\]modules[/\\]data[/\\]/,
  /[/\\]modules[/\\]backup[/\\]service\.ts$/,
];

const RE_IMPORT_TABLEPROXY = /from\s+['"][^'"]*tableProxy\.js['"]/;

function walkTs(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    if (name.name === 'node_modules' || name.name === 'dist') continue;
    const p = path.join(dir, name.name);
    if (name.isDirectory()) walkTs(p, out);
    else if (name.name.endsWith('.ts')) out.push(p);
  }
  return out;
}

let failed = false;

const tpViolations = [];
for (const f of walkTs(serverSrc)) {
  if (ALLOW_TABLE_PROXY_IMPORT.some((re) => re.test(f))) continue;
  const c = fs.readFileSync(f, 'utf8');
  if (RE_IMPORT_TABLEPROXY.test(c)) tpViolations.push(path.relative(root, f));
}
if (tpViolations.length) {
  failed = true;
  console.error('[arch-gate] 禁止在 modules/data 与 backup/service 之外直接 import tableProxy：');
  for (const v of tpViolations) console.error('  -', v.replace(/\\/g, '/'));
}

const scopeFile = path.join(serverSrc, 'security', 'accessScope.ts');
if (fs.existsSync(scopeFile)) {
  const sc = fs.readFileSync(scopeFile, 'utf8');
  if (/from\s+['"]\.\.\/modules\//.test(sc) || /from\s+['"]\.\/modules\//.test(sc)) {
    failed = true;
    console.error('[arch-gate] security/accessScope.ts 不得 import server modules/');
  }
}

if (failed) {
  console.error('\n[arch-gate] FAILED');
  process.exit(1);
}
console.log('[arch-gate] OK (tableProxy boundary + accessScope purity)');
