/**
 * 查看 shared_data_store 中 copySettings 的 JSON 摘要（不含全文，避免泄露长文案）
 * 用法：在 server 目录执行  node scripts/inspectCopySettings.cjs
 */
require("dotenv").config();
const mysql = require("mysql2/promise");

const cfg = {
  host: process.env.MYSQL_HOST || "localhost",
  port: parseInt(process.env.MYSQL_PORT || "3306", 10),
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DATABASE || "gc_member_system",
};

(async () => {
  const pool = mysql.createPool(cfg);
  const [rows] = await pool.query(
    "SELECT tenant_id, store_value FROM shared_data_store WHERE store_key = ? ORDER BY tenant_id",
    ["copySettings"]
  );
  if (!rows.length) {
    console.log(JSON.stringify({ ok: true, rows: 0, message: "未找到 store_key=copySettings" }, null, 2));
    await pool.end();
    return;
  }
  const out = [];
  for (const r of rows) {
    let v = r.store_value;
    if (typeof v === "string") {
      try {
        v = JSON.parse(v);
      } catch {
        v = null;
      }
    }
    const cn = v && typeof v.customNote === "string" ? v.customNote : "";
    const en = v && typeof v.customNoteEnglish === "string" ? v.customNoteEnglish : "";
    const tpl = v && typeof v.template === "string" ? v.template : "";
    const keys = v && typeof v === "object" && !Array.isArray(v) ? Object.keys(v).sort() : [];
    let hint;
    if (tpl.length > 0 && cn.trim().length === 0) {
      hint = "RESTORE_ZH: 新版前端加载会把 template 回填为中文说明";
    } else if (cn.trim().length > 0) {
      hint = "OK_ZH: customNote 已有内容";
    } else if (tpl.length === 0 && en.trim().length === 0) {
      hint = "EMPTY: 中英文与 template 均无内容，只能后台重新填写";
    } else {
      hint = "CHECK: 见各字段长度";
    }
    out.push({
      tenant_id: r.tenant_id,
      keys,
      enabled: v && v.enabled,
      customNote_chars: cn.length,
      customNoteEnglish_chars: en.length,
      template_chars: tpl.length,
      includeRate: v && v.includeRate,
      includeTime: v && v.includeTime,
      hint,
    });
  }
  console.log(JSON.stringify({ ok: true, count: out.length, tenants: out }, null, 2));
  await pool.end();
})().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: e.message }, null, 2));
  process.exit(1);
});
