/**
 * 远程核对 level_name_zh 列（与生产 API 同目录 .env）：
 * scp scripts/remote-show-member-level-zh-column.mjs user@host:/var/www/gc-app/server/_tmp.mjs
 * ssh user@host "cd /var/www/gc-app/server && node _tmp.mjs && rm -f _tmp.mjs"
 */
import "dotenv/config";
import mysql from "mysql2/promise";

function connectionOptions() {
  const raw = (process.env.DATABASE_URL || "").trim();
  if (/^mysql/i.test(raw)) {
    const normalized = raw.replace(/^mysql2:/i, "mysql:");
    const u = new URL(normalized);
    const database = decodeURIComponent((u.pathname || "/").replace(/^\//, "").split("/")[0] || "gc_member_system");
    return {
      host: u.hostname,
      port: Number(u.port || 3306),
      user: decodeURIComponent(u.username || ""),
      password: decodeURIComponent(u.password || ""),
      database,
    };
  }
  return {
    host: process.env.MYSQL_HOST || "localhost",
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE || "gc_member_system",
  };
}

const conn = await mysql.createConnection(connectionOptions());
const [rows] = await conn.query("SHOW COLUMNS FROM member_level_rules LIKE 'level_name_zh'");
await conn.end();
console.log(JSON.stringify({ cwd: process.cwd(), column: rows }, null, 2));
