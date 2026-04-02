/**
 * 冒烟：GET /api/member-portal-settings/by-invite-token/:code
 *      POST /api/member/register-init → POST /api/member/register（邀请注册安全链路）
 * 前提：API 已启动；库表已迁移（含 invite_register_tokens）；在 server 目录执行。
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';

const PORT = parseInt(process.env.PORT || '3001', 10);
const BASE = `http://127.0.0.1:${PORT}`;

function tryParseMysqlUrl(raw) {
  const t = (raw || '').trim();
  if (!t.startsWith('mysql://') && !t.startsWith('mysql2://')) return null;
  try {
    const normalized = t.replace(/^mysql2:/, 'mysql:');
    const u = new URL(normalized);
    if (u.protocol !== 'mysql:') return null;
    const database = (u.pathname || '/').replace(/^\//, '').split('/')[0] || '';
    return {
      host: u.hostname,
      port: u.port ? parseInt(u.port, 10) : 3306,
      user: decodeURIComponent(u.username || ''),
      password: decodeURIComponent(u.password || ''),
      database: database || process.env.MYSQL_DATABASE || 'gc_member_system',
    };
  } catch {
    return null;
  }
}

async function main() {
  const fromUrl = tryParseMysqlUrl(process.env.DATABASE_URL);
  const opt = fromUrl || {
    host: process.env.MYSQL_HOST ?? 'localhost',
    port: parseInt(process.env.MYSQL_PORT ?? '3306', 10),
    user: process.env.MYSQL_USER ?? 'root',
    password: process.env.MYSQL_PASSWORD ?? '',
    database: process.env.MYSQL_DATABASE ?? 'gc_member_system',
  };

  const conn = await mysql.createConnection({
    host: opt.host,
    port: opt.port,
    user: opt.user,
    password: opt.password,
    database: opt.database,
    charset: 'utf8mb4',
  });

  const [cols] = await conn.query(
    `SELECT COLUMN_NAME, IS_NULLABLE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'members' AND COLUMN_NAME IN ('referrer_id','referral_code','referrer_bound_at','referral_source')`,
    [opt.database],
  );
  console.log('[smoke] members 推广相关列:', cols);

  const [rows] = await conn.query(
    `SELECT id, tenant_id,
            COALESCE(NULLIF(TRIM(referral_code), ''), NULLIF(TRIM(invite_token), '')) AS code
     FROM members
     WHERE tenant_id IS NOT NULL
       AND (referral_code IS NOT NULL AND TRIM(referral_code) <> ''
            OR invite_token IS NOT NULL AND TRIM(invite_token) <> '')
     LIMIT 1`,
  );
  await conn.end();

  if (!rows.length || !rows[0].code) {
    console.warn('[smoke] 未找到带 invite_token/referral_code 的会员，跳过 RPC 注册测试（仅可手动测 GET）。');
    const r = await fetch(`${BASE}/api/member-portal-settings/by-invite-token/smoke_dummy_code`);
    const t = await r.text();
    console.log('[smoke] GET by-invite-token(smoke_dummy) status=', r.status, t.slice(0, 200));
    return;
  }

  const { tenant_id: tenantId, code } = rows[0];
  console.log('[smoke] 使用邀请码租户:', tenantId, 'code:', code);

  const urlInvite = `${BASE}/api/member-portal-settings/by-invite-token/${encodeURIComponent(code)}`;
  const g1 = await fetch(urlInvite);
  const j1 = await g1.json().catch(() => ({}));
  console.log('[smoke] ① GET /invite/:code 同源 API by-invite-token →', g1.status, JSON.stringify(j1).slice(0, 300));

  const urlRef = `${BASE}/api/member-portal-settings/by-invite-token/${encodeURIComponent(code)}?ref=same`;
  const g2 = await fetch(urlRef);
  const j2 = await g2.json().catch(() => ({}));
  console.log('[smoke] ② GET（含无用 query，模拟 register?ref= 解析前仍先拉 settings）→', g2.status, JSON.stringify(j2).slice(0, 300));

  const init = await fetch(`${BASE}/api/member/register-init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: String(code).trim() }),
  });
  const ji = await init.json().catch(() => ({}));
  console.log('[smoke] ③ POST /api/member/register-init →', init.status, JSON.stringify(ji).slice(0, 200));
  const regTok = ji?.registerToken;
  if (!init.ok || !regTok) {
    console.error('[smoke] register-init 失败:', ji);
    process.exitCode = 1;
    return;
  }

  const phone = `139${String(Date.now()).slice(-8)}`;
  const reg = await fetch(`${BASE}/api/member/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      registerToken: regTok,
      phone,
      password: 'SmokeTest#1',
    }),
  });
  const jr = await reg.json().catch(() => ({}));
  console.log('[smoke] ④ POST /api/member/register →', reg.status, JSON.stringify(jr));
  if (!reg.ok || !jr?.success) {
    console.error('[smoke] 注册链路未成功:', jr?.error || jr);
    process.exitCode = 1;
  } else {
    console.log('[smoke] 注册成功 memberId=', jr.memberId, 'member_code=', jr.member_code, '(tenant=', tenantId, ')');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
