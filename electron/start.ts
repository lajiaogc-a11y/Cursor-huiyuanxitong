/**
 * WhatsApp Companion 入口
 *
 * 模式选择（P0 — 明确模式，禁止隐式 fallback）：
 *
 *   USE_DEMO=1  → 强制 DemoAdapter（仅开发/测试用）
 *   其他情况    → 加载 WhatsAppAdapter（真实 Baileys）
 *                 失败时**直接报错退出**，不回退 DemoAdapter
 *
 * 用法：
 *   cd electron
 *   npm install
 *   npx tsx start.ts              # 真实模式（baileys 必须已安装）
 *   USE_DEMO=1 npx tsx start.ts   # 强制演示模式
 */

import { startLocalApi, DEFAULT_PORT, DEFAULT_HOST } from './local-api/index.js';
import type { IWhatsAppAdapter } from './session-manager/adapterInterface.js';

async function createAdapter(): Promise<{ adapter: IWhatsAppAdapter; mode: string }> {
  // ── 仅当显式设置 USE_DEMO=1 时才加载 DemoAdapter ──
  if (process.env.USE_DEMO === '1') {
    console.warn('[Companion] ⚠ USE_DEMO=1 — 强制演示模式，数据非真实');
    const { createDemoAdapter } = await import('./session-manager/demoAdapter.js');
    return { adapter: createDemoAdapter(), mode: 'Demo (explicit)' };
  }

  // ── 真实模式 — 不允许 fallback ──
  const { WhatsAppAdapter } = await import('./session-manager/whatsappAdapter.js');
  const adapter = await WhatsAppAdapter.create('./.wa_sessions');
  return { adapter, mode: 'Baileys (real)' };
}

async function main() {
  let adapter: IWhatsAppAdapter;
  let mode: string;

  try {
    ({ adapter, mode } = await createAdapter());
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error('');
    console.error('╔═══════════════════════════════════════════════════════════════╗');
    console.error('║  ❌  WhatsApp Companion 启动失败                              ║');
    console.error('╠═══════════════════════════════════════════════════════════════╣');
    console.error(`║  原因: ${reason.slice(0, 55).padEnd(55)}║`);
    console.error('║                                                             ║');
    console.error('║  解决方案：                                                   ║');
    console.error('║    cd electron && npm install                                ║');
    console.error('║    确保 @whiskeysockets/baileys 和 qrcode 已安装              ║');
    console.error('║                                                             ║');
    console.error('║  如需开发/测试，可用演示模式：                                 ║');
    console.error('║    USE_DEMO=1 npx tsx start.ts                               ║');
    console.error('╚═══════════════════════════════════════════════════════════════╝');
    console.error('');
    process.exit(1);
  }

  const { port, close } = await startLocalApi({ adapter, adapterMode: mode });

  const isDemo = mode.includes('Demo');
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log(`║  WhatsApp Companion  [${mode.padEnd(22)}]  http://${DEFAULT_HOST}:${port}  ║`);
  console.log('╠═══════════════════════════════════════════════════════════════╣');
  if (isDemo) {
    console.log('║  ⚠ 演示模式 — USE_DEMO=1，数据非真实                         ║');
  } else {
    console.log('║  ✅ 真实模式 — Baileys 已就绪，等待前端扫码请求               ║');
  }
  console.log('║                                                             ║');
  console.log('║  接口：                                                      ║');
  console.log('║    POST /sessions/add       — 创建登录会话                   ║');
  console.log('║    GET  /sessions/:id/qr    — QR 码 + 状态（轮询）           ║');
  console.log('║    GET  /sessions/:id/status — 登录状态详情                   ║');
  console.log('║    DELETE /sessions/:id      — 取消/移除会话                  ║');
  console.log('║    GET  /conversations       — 会话列表                      ║');
  console.log('║    GET  /messages            — 消息列表                      ║');
  console.log('║    POST /send                — 发送消息                      ║');
  console.log('║    GET  /health              — 健康检查                      ║');
  console.log('║                                                             ║');
  console.log('║  状态: 运行中 ● | 请保持此窗口打开                           ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log('');

  const shutdown = async () => {
    console.log('\n[Companion] Shutting down...');
    try { await adapter.destroy(); } catch { /* ignore */ }
    await close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(err => {
  console.error('[Companion] Fatal:', err);
  process.exit(1);
});
