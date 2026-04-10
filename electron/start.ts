/**
 * WhatsApp Companion 入口
 *
 * 启动策略：
 *   1. 优先尝试加载 whatsapp-web.js 真实适配器（支持扫码登录）
 *   2. 若 whatsapp-web.js 未安装或 Chrome 不可用，自动 fallback 到 DemoAdapter
 *
 * 用法：
 *   cd electron
 *   npm install
 *   npm start    # 或 npx tsx start.ts
 *
 * 安装真实 WhatsApp 适配器依赖：
 *   npm install whatsapp-web.js qrcode
 */

import { startLocalApi, DEFAULT_PORT, DEFAULT_HOST } from './local-api/index.js';
import type { IWhatsAppAdapter } from './session-manager/adapterInterface.js';

async function createAdapter(): Promise<{ adapter: IWhatsAppAdapter; mode: string }> {
  // 通过环境变量 USE_REAL_WHATSAPP=1 启用真实 WhatsApp 适配器
  // 注意：真实适配器需要能访问 WhatsApp 服务器的网络环境
  if (process.env.USE_REAL_WHATSAPP === '1') {
    try {
      const { WhatsAppAdapter } = await import('./session-manager/whatsappAdapter.js');
      const adapter = await WhatsAppAdapter.create('./.wwebjs_data');
      console.log('[Companion] Using real WhatsApp adapter (USE_REAL_WHATSAPP=1)');
      return { adapter, mode: 'WhatsApp (real)' };
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(`[Companion] Real adapter failed (${reason.slice(0, 120)}), falling back to Demo`);
    }
  }

  // Demo 适配器：生成真实 QR 码图片，30 秒后自动模拟"连接成功"
  // 适合功能演示、UI 测试、不能访问 WhatsApp 服务器的环境
  const { createDemoAdapter } = await import('./session-manager/demoAdapter.js');
  return { adapter: createDemoAdapter(), mode: 'Demo (mock QR)' };
}

async function main() {
  const { adapter, mode } = await createAdapter();
  const { port, close } = await startLocalApi({ adapter });

  const isDemo = mode.includes('Demo');
  console.log('');
  console.log('┌─────────────────────────────────────────────────────────────┐');
  console.log(`│  WhatsApp Companion  [${mode.padEnd(22)}]  http://${DEFAULT_HOST}:${port}  │`);
  console.log('│                                                             │');
  if (isDemo) {
    console.log('│  ⚠️  演示模式 — 生成示例 QR 码，不连接真实 WhatsApp           │');
    console.log('│  如需真实登录，请配置代理后执行：                             │');
    console.log('│    USE_REAL_WHATSAPP=1 npx tsx start.ts                     │');
  } else {
    console.log('│  ✅ 真实模式 — 使用 Baileys 连接 WhatsApp 服务器              │');
  }
  console.log('│                                                             │');
  console.log('│  端点：POST /sessions/add  {"displayName","proxyUrl?"}      │');
  console.log('│         GET  /sessions/:id/qr  — 轮询 QR 码状态             │');
  console.log('│         DELETE /sessions/:id  — 移除账号                    │');
  console.log('│                                                             │');
  console.log('│  Press Ctrl+C to stop                                       │');
  console.log('└─────────────────────────────────────────────────────────────┘');
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
