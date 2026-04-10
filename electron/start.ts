/**
 * WhatsApp Companion 入口
 *
 * 启动策略：
 *   1. 默认尝试加载真实 WhatsApp 适配器（@whiskeysockets/baileys）
 *   2. 若 baileys 未安装，自动 fallback 到 DemoAdapter
 *   3. 设置 USE_DEMO=1 可强制使用 DemoAdapter
 *
 * 用法：
 *   cd electron
 *   npm install
 *   npx tsx start.ts              # 自动检测模式
 *   USE_DEMO=1 npx tsx start.ts   # 强制演示模式
 */

import { startLocalApi, DEFAULT_PORT, DEFAULT_HOST } from './local-api/index.js';
import type { IWhatsAppAdapter } from './session-manager/adapterInterface.js';

async function createAdapter(): Promise<{ adapter: IWhatsAppAdapter; mode: string }> {
  // 强制演示模式
  if (process.env.USE_DEMO === '1') {
    const { createDemoAdapter } = await import('./session-manager/demoAdapter.js');
    return { adapter: createDemoAdapter(), mode: 'Demo (mock)' };
  }

  // 默认尝试真实模式
  try {
    const { WhatsAppAdapter } = await import('./session-manager/whatsappAdapter.js');
    const adapter = await WhatsAppAdapter.create('./.wa_sessions');
    return { adapter, mode: 'Baileys (real)' };
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(`[Companion] Real adapter unavailable: ${reason.slice(0, 120)}`);
    console.warn('[Companion] Falling back to Demo mode. Install baileys: npm install @whiskeysockets/baileys qrcode');
  }

  const { createDemoAdapter } = await import('./session-manager/demoAdapter.js');
  return { adapter: createDemoAdapter(), mode: 'Demo (fallback)' };
}

async function main() {
  const { adapter, mode } = await createAdapter();
  const { port, close } = await startLocalApi({ adapter });

  const isReal = mode.startsWith('Baileys');
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log(`║  WhatsApp Companion  [${mode.padEnd(22)}]  http://${DEFAULT_HOST}:${port}  ║`);
  console.log('╠═══════════════════════════════════════════════════════════════╣');
  if (isReal) {
    console.log('║  ✅ 真实模式 — Baileys 已就绪，等待前端扫码请求               ║');
  } else {
    console.log('║  ⚠️  演示模式 — QR 非真实，30秒后自动模拟连接                 ║');
    console.log('║  安装真实依赖：npm install @whiskeysockets/baileys qrcode    ║');
  }
  console.log('║                                                             ║');
  console.log('║  接口：                                                      ║');
  console.log('║    POST /sessions/add       — 创建登录会话                   ║');
  console.log('║    GET  /sessions/:id/qr    — QR 码 + 状态（轮询）           ║');
  console.log('║    GET  /sessions/:id/status — 登录状态详情                   ║');
  console.log('║    DELETE /sessions/:id      — 取消/移除会话                  ║');
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
  console.error('[Companion] Failed to start:', err);
  process.exit(1);
});
