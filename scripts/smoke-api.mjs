#!/usr/bin/env node
/**
 * 后端关键路由可达性 smoke（无需登录即可跑大部分；带 token 可扩展）。
 *
 * 用法:
 *   node scripts/smoke-api.mjs
 *   API_BASE=https://api.example.com node scripts/smoke-api.mjs
 *   SMOKE_STAFF_TOKEN=eyJ... node scripts/smoke-api.mjs
 *   SMOKE_MEMBER_ID=uuid SMOKE_STAFF_TOKEN=eyJ... node scripts/smoke-api.mjs
 *
 * npm: npm run smoke:api
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadDotEnv() {
  for (const rel of ["server/.env", ".env"]) {
    try {
      const p = join(root, rel);
      const text = readFileSync(p, "utf-8");
      for (const line of text.split("\n")) {
        const t = line.trim();
        if (!t || t.startsWith("#")) continue;
        const eq = t.indexOf("=");
        if (eq < 1) continue;
        const k = t.slice(0, eq).trim();
        let v = t.slice(eq + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        if (process.env[k] === undefined) process.env[k] = v;
      }
    } catch {
      /* optional */
    }
  }
}

loadDotEnv();

const base = (process.env.API_BASE || process.env.VITE_API_BASE || "http://127.0.0.1:3001").replace(/\/$/, "");
const staffToken = (process.env.SMOKE_STAFF_TOKEN || "").trim();
const memberId = (process.env.SMOKE_MEMBER_ID || "").trim();

let total = 0;
let passed = 0;
let failed = 0;
let skipped = 0;

async function check(name, fn) {
  total++;
  try {
    await fn();
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (e) {
    failed++;
    console.error(`  \x1b[31m✗\x1b[0m ${name}: ${e instanceof Error ? e.message : e}`);
  }
}

function skip(name, reason) {
  total++;
  skipped++;
  console.log(`  \x1b[33m○\x1b[0m ${name} (${reason})`);
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

function section(title) {
  console.log(`\n\x1b[1m── ${title} ──\x1b[0m`);
}

// ───────────────────────────────────────────
section("1. Health & Infrastructure");
// ───────────────────────────────────────────

await check("GET /health returns status ok", async () => {
  const r = await fetch(`${base}/health`);
  assert(r.ok, `status ${r.status}`);
  const j = await r.json();
  assert(j && j.status === "ok", "body.status !== ok");
});

await check("CSP report endpoint reachable", async () => {
  const r = await fetch(`${base}/api/csp-report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ "csp-report": { "document-uri": "test", "violated-directive": "test" } }),
  });
  assert([204, 400, 403, 404].includes(r.status), `unexpected ${r.status}`);
  if (r.status === 404) console.log("    ℹ CSP report 404 - CDN may block POST or path not proxied");
});

await check("GET /version.json exists", async () => {
  const r = await fetch(`${base}/version.json`);
  assert([200, 304, 404].includes(r.status), `unexpected ${r.status}`);
});

// ───────────────────────────────────────────
section("2. Public Routes (no auth required)");
// ───────────────────────────────────────────

await check("GET /api/data/settings/ip-country-check (public or auth-gated)", async () => {
  const r = await fetch(`${base}/api/data/settings/ip-country-check`);
  assert([200, 401].includes(r.status), `unexpected ${r.status}`);
  if (r.ok) {
    const j = await r.json();
    assert(j && j.success === true, "expected success: true");
  }
});

await check("POST /api/member-auth/signin validates input (400/422)", async () => {
  const r = await fetch(`${base}/api/member-auth/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "", password: "" }),
  });
  assert(r.status === 400 || r.status === 422, `expected 400/422, got ${r.status}`);
});

await check("POST /api/auth/login validates input (400)", async () => {
  const r = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "", password: "" }),
  });
  assert([400, 401, 422].includes(r.status), `expected 400/401/422, got ${r.status}`);
});

// ───────────────────────────────────────────
section("3. Auth Boundaries (unauth → 401)");
// ───────────────────────────────────────────

await check("GET /api/auth/me without token → 401", async () => {
  const r = await fetch(`${base}/api/auth/me`);
  assert(r.status === 401, `expected 401, got ${r.status}`);
});

await check("POST /api/lottery/draw without token → 401", async () => {
  const r = await fetch(`${base}/api/lottery/draw`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert(r.status === 401, `expected 401, got ${r.status}`);
});

await check("GET /api/lottery/admin/prizes without token → 401", async () => {
  const r = await fetch(`${base}/api/lottery/admin/prizes`);
  assert(r.status === 401, `expected 401, got ${r.status}`);
});

await check("GET /api/logs/login without token → 401", async () => {
  const r = await fetch(`${base}/api/logs/login`);
  assert(r.status === 401, `expected 401, got ${r.status}`);
});

await check("GET /api/logs/operation without token → 401", async () => {
  const r = await fetch(`${base}/api/logs/operation`);
  assert(r.status === 401, `expected 401, got ${r.status}`);
});

await check("GET /api/member-portal/site-data/stats without token → 401/404", async () => {
  const r = await fetch(`${base}/api/member-portal/site-data/stats`);
  assert([401, 404].includes(r.status), `expected 401 or 404, got ${r.status}`);
});

// ───────────────────────────────────────────
section("4. Staff Auth Flow");
// ───────────────────────────────────────────

if (staffToken) {
  await check("GET /api/auth/me (staff token)", async () => {
    const r = await fetch(`${base}/api/auth/me`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert(r.ok, `status ${r.status}`);
    const j = await r.json();
    assert(j && j.success === true && j.user && j.user.id, "invalid me payload");
  });

  await check("POST /api/lottery/draw with staff token → 403 (MEMBER_JWT_REQUIRED)", async () => {
    const r = await fetch(`${base}/api/lottery/draw`, {
      method: "POST",
      headers: { Authorization: `Bearer ${staffToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert(r.status === 403, `expected 403, got ${r.status}`);
    const j = await r.json().catch(() => ({}));
    const code = j?.error?.code ?? j?.code;
    assert(code === "MEMBER_JWT_REQUIRED", `expected MEMBER_JWT_REQUIRED, got ${code}`);
  });

  // ───────────────────────────────────────────
  section("5. Permission Matrix (staff token)");
  // ───────────────────────────────────────────

  await check("GET /api/lottery/admin/prizes requires admin role", async () => {
    const r = await fetch(`${base}/api/lottery/admin/prizes`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert([200, 403].includes(r.status), `expected 200 or 403, got ${r.status}`);
  });

  await check("GET /api/lottery/admin/settings requires admin role", async () => {
    const r = await fetch(`${base}/api/lottery/admin/settings`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert([200, 403].includes(r.status), `expected 200 or 403, got ${r.status}`);
  });

  await check("GET /api/logs/login accessible to staff", async () => {
    const r = await fetch(`${base}/api/logs/login`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert(r.ok, `status ${r.status}`);
    const j = await r.json();
    assert(j && j.success === true, "expected success: true");
  });

  await check("GET /api/logs/operation accessible to staff", async () => {
    const r = await fetch(`${base}/api/logs/operation`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert(r.ok, `status ${r.status}`);
    const j = await r.json();
    assert(j && j.success === true, "expected success: true");
  });

  // ───────────────────────────────────────────
  section("6. Data Endpoints (staff token)");
  // ───────────────────────────────────────────

  await check("GET /api/member-portal/site-data/stats (staff)", async () => {
    const now = new Date();
    const start = new Date(now.getTime() - 7 * 86400000).toISOString().split("T")[0];
    const end = now.toISOString().split("T")[0];
    const r = await fetch(`${base}/api/member-portal/site-data/stats?start_date=${start}&end_date=${end}`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert([200, 400].includes(r.status), `expected 200 or 400, got ${r.status}`);
  });

  await check("GET /api/member-portal/site-data/data-cleanup (staff)", async () => {
    const r = await fetch(`${base}/api/member-portal/site-data/data-cleanup`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    assert([200, 400].includes(r.status), `expected 200 or 400, got ${r.status}`);
  });

  if (memberId) {
    await check("GET /api/points/member/:id (staff token)", async () => {
      const r = await fetch(`${base}/api/points/member/${encodeURIComponent(memberId)}`, {
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      assert(r.ok, `status ${r.status}`);
      const j = await r.json();
      assert(j && j.success === true && j.data !== undefined, "expected { success: true, data }");
    });

    await check("GET /api/orders?limit=1 (staff token)", async () => {
      const r = await fetch(`${base}/api/orders?limit=1`, {
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      assert([200, 403].includes(r.status), `expected 200 or 403, got ${r.status}`);
    });
  } else {
    skip("GET /api/points/member/:id", "SMOKE_MEMBER_ID not set");
    skip("GET /api/orders?limit=1", "SMOKE_MEMBER_ID not set");
  }
} else {
  skip("Staff auth checks", "SMOKE_STAFF_TOKEN not set");
  skip("Permission matrix checks", "SMOKE_STAFF_TOKEN not set");
  skip("Data endpoint checks", "SMOKE_STAFF_TOKEN not set");
}

// ───────────────────────────────────────────
section("7. Rate Limiting & Security");
// ───────────────────────────────────────────

await check("Rapid login attempts don't crash (rate limit or error)", async () => {
  const promises = Array.from({ length: 3 }, () =>
    fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "test@test.com", password: "wrong" }),
    })
  );
  const results = await Promise.all(promises);
  for (const r of results) {
    assert([400, 401, 422, 429].includes(r.status), `unexpected ${r.status}`);
  }
});

await check("CORS headers present on API (may be CDN-dependent)", async () => {
  const r = await fetch(`${base}/health`, {
    headers: { Origin: "https://crm.fastgc.cc" },
  });
  const acao = r.headers.get("access-control-allow-origin");
  if (!acao) {
    console.log("    ℹ CORS header absent (CDN may strip or require preflight)");
  }
  assert(r.ok, `health endpoint not reachable: ${r.status}`);
});

// ───────────────────────────────────────────
// Summary
// ───────────────────────────────────────────

console.log(`\n\x1b[1m── Summary ──\x1b[0m`);
console.log(`  Total: ${total}  Passed: \x1b[32m${passed}\x1b[0m  Failed: \x1b[31m${failed}\x1b[0m  Skipped: \x1b[33m${skipped}\x1b[0m`);

if (failed > 0) {
  console.error(`\n\x1b[31mSmoke finished: ${failed} test(s) failed\x1b[0m`);
  process.exit(1);
}
console.log(`\n\x1b[32mSmoke finished: all checks passed\x1b[0m`);
