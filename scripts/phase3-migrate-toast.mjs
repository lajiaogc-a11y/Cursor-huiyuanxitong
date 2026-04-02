/**
 * Phase 3: replace direct sonner toast imports with notifyHub (one-off migration).
 * Run: node scripts/phase3-migrate-toast.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", "src");

const SKIP_FILES = new Set([
  "lib\\notifyHub.tsx",
  "components\\ui\\sonner.tsx",
  "components\\ui\\notify.ts",
]);

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(name)) out.push(p);
  }
  return out;
}

function rel(p) {
  return path.relative(path.join(__dirname, ".."), p).replace(/\//g, "\\");
}

let changed = 0;
for (const file of walk(root)) {
  const r = rel(file);
  if (SKIP_FILES.has(r)) continue;

  let s = fs.readFileSync(file, "utf8");
  if (!s.includes("sonner")) continue;

  const orig = s;

  s = s.replace(/import \{ toast as sonnerToast \} from ['"]sonner['"];?\r?\n?/g, `import { notify } from "@/lib/notifyHub";\n`);
  s = s.replace(/import \{ toast \} from ['"]sonner['"];?\r?\n?/g, `import { notify } from "@/lib/notifyHub";\n`);
  s = s.replace(/\bsonnerToast\./g, "notify.");
  s = s.replace(/\btoast\./g, "notify.");

  if (s !== orig) {
    fs.writeFileSync(file, s);
    changed++;
    console.log("updated:", r);
  }
}

console.log("done, files changed:", changed);
