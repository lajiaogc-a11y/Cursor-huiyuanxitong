#!/usr/bin/env node
/**
 * Architecture Gate — 分层架构硬约束门禁
 *
 * 规则清单：
 *   Rule 1  (backend)  server tableProxy 引用收敛
 *   Rule 2  (backend)  security/accessScope 纯净性
 *   Rule 3  (backend)  routes.ts 禁止直接 DB 访问
 *   Rule 4  (backend)  controller*.ts 禁止直接 DB 访问
 *   Rule 5  (frontend) pages/ 禁止直接 import api/apiClient/fetch/axios
 *   Rule 6  (frontend) components/ 禁止直接 import api/apiClient
 *   Rule 7  (frontend) services/ 禁止反向依赖 pages/components
 *   Rule 8  (frontend) 新代码禁止新增 legacy proxy 调用（白名单外）
 *   Rule 9  (frontend) hooks/ 禁止直接 import @/api/*（白名单外）
 *   Rule 10 (backend)  service*.ts 禁止直接 import database（白名单外）
 *   Rule 11 (backend)  routes.ts 禁止跳过 controller 直调 service
 *   Rule 12 (frontend) services/ 禁止使用 UI API（notify/DOM/window.location）
 *   Rule 13 (frontend) 禁止引入已删除的 legacy proxy 模块
 *
 * 白名单机制：
 *   历史兼容代码通过 ALLOW_* 数组豁免，新文件绝对禁止。
 *   白名单文件变动需要 code review 审批。
 *
 * 用法：
 *   node scripts/architecture-gate.mjs           # 正常检查，违规 exit 1
 *   node scripts/architecture-gate.mjs --report  # 输出 JSON 报告
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const serverSrc = path.join(root, 'server', 'src');
const frontendSrc = path.join(root, 'src');
const reportMode = process.argv.includes('--report');

// ════════════════════════════════════════════════════════════════════════
//  Utilities
// ════════════════════════════════════════════════════════════════════════

function walk(dir, ext, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === 'dist' || ent.name === '__tests__') continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, ext, out);
    else if (ext.some((e) => ent.name.endsWith(e))) out.push(p);
  }
  return out;
}

function rel(filepath) {
  return path.relative(root, filepath).replace(/\\/g, '/');
}

function readFile(filepath) {
  return fs.readFileSync(filepath, 'utf8');
}

function matchesAny(filepath, patterns) {
  return patterns.some((re) => re.test(filepath));
}

const violations = [];

function addViolation(rule, file, line, detail, suggestion) {
  violations.push({ rule, file: rel(file), line, detail, suggestion });
}

// ════════════════════════════════════════════════════════════════════════
//  Rule 1: Backend — tableProxy 引用收敛
// ════════════════════════════════════════════════════════════════════════

const ALLOW_TABLE_PROXY_IMPORT = [
  /[/\\]modules[/\\]data[/\\]/,
  /[/\\]modules[/\\]backup[/\\]service\.ts$/,
];

const RE_IMPORT_TABLEPROXY = /from\s+['"][^'"]*tableProxy\.js['"]/;

for (const f of walk(serverSrc, ['.ts'])) {
  if (matchesAny(f, ALLOW_TABLE_PROXY_IMPORT)) continue;
  const c = readFile(f);
  if (RE_IMPORT_TABLEPROXY.test(c)) {
    addViolation('R1-tableProxy', f, 0,
      'modules/data 与 backup/service 之外直接 import tableProxy',
      '通过对应模块的 service 层间接访问');
  }
}

// ════════════════════════════════════════════════════════════════════════
//  Rule 2: Backend — security/accessScope 纯净性
// ════════════════════════════════════════════════════════════════════════

const scopeFile = path.join(serverSrc, 'security', 'accessScope.ts');
if (fs.existsSync(scopeFile)) {
  const sc = readFile(scopeFile);
  if (/from\s+['"]\.\.\/modules\//.test(sc) || /from\s+['"]\.\/modules\//.test(sc)) {
    addViolation('R2-accessScope', scopeFile, 0,
      'security/accessScope.ts 不得 import server modules/',
      '将依赖反转：modules 调 security，而非反向');
  }
}

// ════════════════════════════════════════════════════════════════════════
//  Rule 3: Backend — routes.ts 禁止直接 DB 访问
// ════════════════════════════════════════════════════════════════════════

const RE_DB_IMPORT = /(?:from|import\()\s*['"][^'"]*(?:database|\/db)['"]/;
const RE_SQL_FUNC = /\b(?:execute|queryOne|getConnection)\s*\(/;

const ALLOW_ROUTES_DB = [
  /[/\\]modules[/\\]data[/\\]routes\.ts$/, // 历史兼容：data 模块通知查询
];

for (const f of walk(serverSrc, ['.ts'])) {
  const base = path.basename(f);
  if (base !== 'routes.ts') continue;
  if (matchesAny(f, ALLOW_ROUTES_DB)) continue;
  const c = readFile(f);
  if (RE_DB_IMPORT.test(c) || RE_SQL_FUNC.test(c)) {
    addViolation('R3-routes-db', f, 0,
      'routes.ts 直接导入数据库模块或执行 SQL',
      '路由层只负责注册路由 → controller → service → repository → DB');
  }
}

// ════════════════════════════════════════════════════════════════════════
//  Rule 4: Backend — controller*.ts 禁止直接 DB 访问
// ════════════════════════════════════════════════════════════════════════

const ALLOW_CONTROLLER_DB = [
  /[/\\]modules[/\\]data[/\\]/,           // data 模块历史兼容
  /[/\\]modules[/\\]lottery[/\\]spinFakeFeedController\.ts$/,  // 历史兼容
];

for (const f of walk(serverSrc, ['.ts'])) {
  const base = path.basename(f);
  if (!base.includes('ontroller') || !base.endsWith('.ts')) continue;
  if (matchesAny(f, ALLOW_CONTROLLER_DB)) continue;
  const c = readFile(f);
  if (RE_DB_IMPORT.test(c)) {
    addViolation('R4-controller-db', f, 0,
      'controller 直接导入数据库模块',
      '控制器只负责收参/调 service/回参，DB 访问走 repository');
  }
}

// ════════════════════════════════════════════════════════════════════════
//  Rule 5: Frontend — pages/ 禁止直接 import api/apiClient/fetch/axios
// ════════════════════════════════════════════════════════════════════════

const RE_PAGES_API = /from\s+['"]@\/api\//;
const RE_PAGES_CLIENT = /from\s+['"]@\/lib\/apiClient['"]/;
const RE_RAW_FETCH = /\bfetch\s*\(/;
const RE_AXIOS = /\baxios\s*[\.(]/;

// Exclude: comments, strings that contain "fetch" as word in UI text
function hasRealFetch(content) {
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
    if (/\bfetch\s*\(/.test(trimmed) && !trimmed.includes('refetch') && !trimmed.includes('prefetch')) {
      return true;
    }
  }
  return false;
}

for (const f of walk(path.join(frontendSrc, 'pages'), ['.ts', '.tsx'])) {
  const c = readFile(f);
  if (RE_PAGES_API.test(c)) {
    addViolation('R5-pages-api', f, 0, 'pages/ 直接 import @/api/*', '通过 service/hook 层间接调用');
  }
  if (RE_PAGES_CLIENT.test(c)) {
    addViolation('R5-pages-client', f, 0, 'pages/ 直接 import @/lib/apiClient', '通过 service 层间接调用');
  }
  if (RE_AXIOS.test(c)) {
    addViolation('R5-pages-axios', f, 0, 'pages/ 直接使用 axios', '通过 service → api client 调用');
  }
}

// ════════════════════════════════════════════════════════════════════════
//  Rule 6: Frontend — components/ 禁止直接 import api/apiClient
// ════════════════════════════════════════════════════════════════════════

const RE_COMP_API = /from\s+['"]@\/api\//;
const RE_COMP_CLIENT = /from\s+['"]@\/lib\/apiClient['"]/;

for (const f of walk(path.join(frontendSrc, 'components'), ['.ts', '.tsx'])) {
  const c = readFile(f);
  if (RE_COMP_API.test(c)) {
    addViolation('R6-comp-api', f, 0, 'components/ 直接 import @/api/*', '通过 service/hook 层间接调用');
  }
  if (RE_COMP_CLIENT.test(c)) {
    addViolation('R6-comp-client', f, 0, 'components/ 直接 import @/lib/apiClient', '通过 service 层间接调用');
  }
}

// ════════════════════════════════════════════════════════════════════════
//  Rule 7: Frontend — services/ 禁止反向依赖 pages/components
// ════════════════════════════════════════════════════════════════════════

const RE_SVC_PAGES = /from\s+['"]@\/pages\//;
const RE_SVC_COMPS = /from\s+['"]@\/components\//;

const ALLOW_SVC_COMP = [
  /[/\\]appInitializer\.ts$/, // 历史兼容：启动初始化
];

for (const f of walk(path.join(frontendSrc, 'services'), ['.ts', '.tsx'])) {
  const c = readFile(f);
  if (RE_SVC_PAGES.test(c)) {
    addViolation('R7-svc-pages', f, 0, 'services/ 反向依赖 pages/', '重构为 pages 调用 services');
  }
  if (RE_SVC_COMPS.test(c) && !matchesAny(f, ALLOW_SVC_COMP)) {
    addViolation('R7-svc-comps', f, 0, 'services/ 反向依赖 components/', '重构为 components 通过 hooks 调用 services');
  }
}

// ════════════════════════════════════════════════════════════════════════
//  Rule 8: Frontend — 新代码禁止新增 legacy proxy 调用
//
//  白名单覆盖截至本次审计的所有历史文件。
//  新文件使用 dataTableApi/dataRpcApi/fetchTableSelectRaw 会被拦截。
// ════════════════════════════════════════════════════════════════════════

const RE_LEGACY_PROXY = /\b(?:dataTableApi|dataRpcApi|fetchTableSelectRaw)\b/;

const LEGACY_PROXY_WHITELIST = new Set([
  // data.ts, tableProxyRaw.ts, tableProxy.ts 已全部删除 — R8 基础设施层清零
]);

for (const f of walk(frontendSrc, ['.ts', '.tsx'])) {
  const relPath = rel(f);
  if (LEGACY_PROXY_WHITELIST.has(relPath)) continue;
  const c = readFile(f);
  if (RE_LEGACY_PROXY.test(c)) {
    addViolation('R8-legacy-proxy', f, 0,
      '非白名单文件使用 legacy proxy (dataTableApi/dataRpcApi/fetchTableSelectRaw)',
      '新代码必须通过领域 API Client 调用后端，禁止走通用表代理');
  }
}

// ════════════════════════════════════════════════════════════════════════
//  Rule 9: Frontend — hooks/ 禁止直接 import @/api/*（白名单外）
//
//  hooks 应通过 services 层间接调用 api，不应直接穿透。
//  白名单覆盖截至本次审计的历史文件。
// ════════════════════════════════════════════════════════════════════════

const RE_HOOKS_API = /from\s+['"]@\/api\//;

const HOOKS_API_WHITELIST = new Set([
  // 全部已迁移至 @/services/staff/staffDataService — 白名单清空
]);

for (const f of walk(path.join(frontendSrc, 'hooks'), ['.ts', '.tsx'])) {
  const relPath = rel(f);
  if (HOOKS_API_WHITELIST.has(relPath)) continue;
  const c = readFile(f);
  if (RE_HOOKS_API.test(c)) {
    addViolation('R9-hooks-api', f, 0,
      'hooks/ 直接 import @/api/*（非白名单）',
      'hooks 应通过 services 层间接调用，新代码禁止在 hooks 直接引用 api 层');
  }
}

// ════════════════════════════════════════════════════════════════════════
//  Rule 10: Backend — service*.ts 禁止直接 import database（白名单外）
//
//  service 层应通过 repository 访问数据库，不得直连。
//  白名单覆盖截至本次审计的历史文件。
// ════════════════════════════════════════════════════════════════════════

const SERVICE_DB_WHITELIST = new Set([
  // R10 白名单已全部清空 — 所有 service 均通过 repository 访问数据库
]);

for (const f of walk(serverSrc, ['.ts'])) {
  const base = path.basename(f);
  if (!base.includes('ervice') || !base.endsWith('.ts')) continue;
  const relPath = rel(f);
  if (SERVICE_DB_WHITELIST.has(relPath)) continue;
  if (/[/\\]modules[/\\]data[/\\]/.test(f)) continue; // data 模块整体豁免
  const c = readFile(f);
  if (RE_DB_IMPORT.test(c)) {
    addViolation('R10-service-db', f, 0,
      'service 直接导入数据库模块（非白名单）',
      'service 层应通过 repository 访问数据库，新 service 禁止直接 import database');
  }
}

// ════════════════════════════════════════════════════════════════════════
//  Rule 11: Backend — routes.ts 禁止跳过 controller 直调 service
//
//  routes 应通过 controller 分发，不直接调用 service。
//  白名单覆盖截至本次审计的历史文件。
// ════════════════════════════════════════════════════════════════════════

const RE_ROUTE_IMPORT_SERVICE = /from\s+['"][^'"]*(?:\.\/service|\.\/.*[Ss]ervice)(?:\.js)?['"]/;

const ROUTES_SKIP_CTRL_WHITELIST = new Set([
  // R11 白名单已全部清空 — 所有 routes 均通过 controller 分发
]);

for (const f of walk(serverSrc, ['.ts'])) {
  const base = path.basename(f);
  if (base !== 'routes.ts') continue;
  const relPath = rel(f);
  if (ROUTES_SKIP_CTRL_WHITELIST.has(relPath)) continue;
  const c = readFile(f);
  if (RE_ROUTE_IMPORT_SERVICE.test(c)) {
    addViolation('R11-routes-skip-ctrl', f, 0,
      'routes.ts 跳过 controller 直接导入 service',
      '路由层应只调用 controller，由 controller 分发至 service');
  }
}

// ════════════════════════════════════════════════════════════════════════
//  Rule 12: Frontend — services/ 禁止使用 UI API（白名单外）
//
//  service 层应是纯业务逻辑层，不应混入 toast/DOM/浏览器操作。
//  白名单覆盖截至本次审计的历史文件。
// ════════════════════════════════════════════════════════════════════════

const RE_SVC_NOTIFY = /from\s+['"]@\/lib\/notifyHub['"]/;
const RE_SVC_DOM = /\bdocument\.createElement\b/;

const SVC_UI_WHITELIST = new Set([
  // serviceErrorToast 已迁移至 src/lib/，白名单清空
]);

for (const f of walk(path.join(frontendSrc, 'services'), ['.ts', '.tsx'])) {
  const relPath = rel(f);
  if (SVC_UI_WHITELIST.has(relPath)) continue;
  const c = readFile(f);
  if (RE_SVC_NOTIFY.test(c)) {
    addViolation('R12-svc-ui', f, 0,
      'services/ 直接使用 notifyHub（UI 层 API）',
      'service 层应返回 result/error 对象，由调用方（hook/page）决定是否弹 toast');
  }
  if (RE_SVC_DOM.test(c)) {
    addViolation('R12-svc-dom', f, 0,
      'services/ 直接操作 DOM（document.createElement）',
      'service 层应返回数据，由 UI 层处理下载/DOM 操作');
  }
}

// ════════════════════════════════════════════════════════════════════════
//  Rule 13: Frontend — 禁止引入已删除的 legacy proxy 模块
//
//  data.ts、tableProxyRaw.ts、tableProxy.ts、tableProxyCount.ts
//  已全部删除。任何新文件不得重新引入这些模块或模式。
// ════════════════════════════════════════════════════════════════════════

const RE_DELETED_PROXY_IMPORT = /from\s+['"]@\/api\/(?:data|tableProxy|tableProxyRaw)['"]/;
const RE_DELETED_LIB_IMPORT = /from\s+['"]@\/lib\/tableProxyCount['"]/;
const RE_TBL_PROXY_FUNC = /\b(?:tblGet|tblPost|tblPatch|tblDel)\b/;

const R13_FUNC_WHITELIST = new Set([
  // 全部已消除 — R13 func 白名单清零
]);

for (const f of walk(frontendSrc, ['.ts', '.tsx'])) {
  const relPath = rel(f);
  const c = readFile(f);
  if (RE_DELETED_PROXY_IMPORT.test(c)) {
    addViolation('R13-deleted-proxy', f, 0,
      '引入已删除的 legacy proxy 模块（@/api/data, @/api/tableProxy, @/api/tableProxyRaw）',
      '这些模块已删除，使用 @/api/client 的 apiGet/apiPost 直接调用具体端点');
  }
  if (RE_DELETED_LIB_IMPORT.test(c)) {
    addViolation('R13-deleted-proxy', f, 0,
      '引入已删除的 tableProxyCount（@/lib/tableProxyCount）',
      '使用 @/api/adminStatsApi 的 fetchTableCounts 替代');
  }
  if (!R13_FUNC_WHITELIST.has(relPath) && RE_TBL_PROXY_FUNC.test(c)) {
    addViolation('R13-proxy-func', f, 0,
      '非白名单文件使用 tblGet/tblPost/tblPatch/tblDel 函数',
      '新代码应使用 apiGet/apiPost/apiPatch/apiDelete 直接调用具体端点');
  }
}

// ════════════════════════════════════════════════════════════════════════
//  Rule 14: Frontend — 限制 /api/data/table/ 通用表端点调用范围
//
//  /api/data/table/ 是通用表代理，仅允许白名单中的文件使用。
//  新功能应创建专用后端 REST 端点，不得新增通用表调用。
// ════════════════════════════════════════════════════════════════════════

const RE_TABLE_ENDPOINT_CALL = /['"`]\/api\/data\/table\//;

const R14_TABLE_ENDPOINT_WHITELIST = new Set([
  // API layer — existing *Data.ts table wrappers
  'src/api/apiKeyData.ts',
  'src/api/archiveData.ts',
  'src/api/auditLogData.ts',
  'src/api/backupData.ts',
  'src/api/currencyData.ts',
  'src/api/customerSourceData.ts',
  'src/api/employeeData.ts',
  'src/api/errorReportData.ts',
  'src/api/financeTableData.ts',
  'src/api/importData.ts',
  'src/api/invitationCodeData.ts',
  'src/api/notificationData.ts',
  'src/api/orders.ts',
  'src/api/pointsTableData.ts',
  'src/api/restoreOps.ts',
  'src/api/rolePermissionData.ts',
  'src/api/searchData.ts',
  'src/api/shiftHandoverData.ts',
  'src/api/systemHealthData.ts',
  'src/api/userDataStoreData.ts',
  'src/api/webhookData.ts',
  'src/api/staffData/permissionsAndSettings.ts',
  // Service layer — shared table helper + inlined calls
  'src/services/data/_tableHelpers.ts',
  'src/services/points/pointsCalculationService.ts',
  'src/services/points/pointsAccountService.ts',
  'src/services/members/nameResolver.ts',
  // Infrastructure — path check logic, not API calls
  'src/lib/apiClient.ts',
]);

for (const f of walk(frontendSrc, ['.ts', '.tsx'])) {
  const relPath = rel(f);
  const c = readFile(f);
  if (RE_TABLE_ENDPOINT_CALL.test(c) && !R14_TABLE_ENDPOINT_WHITELIST.has(relPath)) {
    addViolation('R14-table-endpoint', f, 0,
      '非白名单文件直接调用通用表端点 /api/data/table/',
      '新功能应创建专用后端 REST 端点，或将表调用封装到 src/api/*Data.ts');
  }
}

// ════════════════════════════════════════════════════════════════════════
//  Output
// ════════════════════════════════════════════════════════════════════════

if (reportMode) {
  console.log(JSON.stringify({ ok: violations.length === 0, violations }, null, 2));
} else {
  if (violations.length === 0) {
    console.log('[arch-gate] ✅ ALL RULES PASSED (14 rules checked)');
  } else {
    const grouped = {};
    for (const v of violations) {
      (grouped[v.rule] ??= []).push(v);
    }
    for (const [rule, items] of Object.entries(grouped)) {
      console.error(`\n[arch-gate] ❌ ${rule} (${items.length} violation${items.length > 1 ? 's' : ''}):`);
      for (const v of items) {
        console.error(`  - ${v.file}`);
        console.error(`    ${v.detail}`);
        console.error(`    💡 ${v.suggestion}`);
      }
    }
    console.error(`\n[arch-gate] FAILED — ${violations.length} violation(s) across ${Object.keys(grouped).length} rule(s)`);
    process.exit(1);
  }
}
