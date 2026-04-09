import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(__dirname, '..', 'supabase', 'migrations', '20260309160000_fix_trading_users_phone_fallback.sql'), 'utf8');
const b64 = Buffer.from(sql, 'utf8').toString('base64');
const html = `<!DOCTYPE html><html><head><meta charset=utf-8><title>迁移</title></head><body>
<h2>交易用户修复迁移</h2>
<p><a href="https://supabase.com/dashboard/project/dhlwefrcowefvbxutsmc/sql/new" target="_blank">打开 SQL Editor</a></p>
<button onclick="navigator.clipboard.writeText(atob(document.getElementById('b64').textContent));alert('已复制')">复制 SQL</button>
<pre id="b64" style="display:none">${b64}</pre>
<textarea id="sql" style="width:100%;height:400px;font:12px monospace" readonly></textarea>
<script>document.getElementById('sql').value=atob(document.getElementById('b64').textContent);</script>
</body></html>`;
writeFileSync(join(__dirname, 'run-trading-users-migration.html'), html);
console.log('Generated');
