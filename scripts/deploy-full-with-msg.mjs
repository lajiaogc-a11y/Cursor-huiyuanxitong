/**
 * 调用 scripts/deploy-full.ps1（Git + server tsc + Vite + Cloudflare Pages）。
 * 用法: node scripts/deploy-full-with-msg.mjs 你的提交说明
 * 或: npm run deploy:full:msg -- 你的提交说明
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const msg =
  process.argv.slice(2).join(" ").trim() ||
  `Update: ${new Date().toISOString().slice(0, 19).replace("T", " ")}`;

const ps1 = path.join(root, "scripts", "deploy-full.ps1");
const r = spawnSync(
  "powershell",
  ["-ExecutionPolicy", "Bypass", "-File", ps1, msg],
  { cwd: root, stdio: "inherit", shell: false },
);
process.exit(r.status ?? 1);
