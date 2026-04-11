/**
 * WhatsApp Companion CLI 入口
 *
 * 用法：
 *   cd electron
 *   npx tsx start.ts              # 真实模式
 *   USE_DEMO=1 npx tsx start.ts   # 演示模式
 *
 * 此文件仅供独立运行。Electron 桌面应用通过 main/index.ts 启动。
 */

import { startCompanionServer, DEFAULT_HOST } from './companionLauncher.js';

async function main() {
  let result;
  try {
    result = await startCompanionServer();
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : String(err);

    if (reason.includes('PORT_CONFLICT')) {
      console.error('');
      console.error('╔═══════════════════════════════════════════════════════════════╗');
      console.error('║  ⚠  端口 3100 被其他程序占用                                 ║');
      console.error('╠═══════════════════════════════════════════════════════════════╣');
      console.error('║  端口被非 Companion 进程占用。                                ║');
      console.error('║                                                             ║');
      console.error('║  解决方案：                                                   ║');
      console.error('║    1. 关闭占用端口 3100 的程序                                ║');
      console.error('║    2. 重新运行本命令                                          ║');
      console.error('╚═══════════════════════════════════════════════════════════════╝');
      console.error('');
    } else {
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
    }
    process.exit(1);
  }

  const { mode, port, close, adapter, reused } = result;
  const isDemo = mode.includes('Demo');

  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  if (reused) {
    console.log(`║  WhatsApp Companion  [已复用现有实例  ]  http://${DEFAULT_HOST}:${port}  ║`);
    console.log('╠═══════════════════════════════════════════════════════════════╣');
    console.log('║  ✅ 检测到已运行的 Companion，已自动复用                      ║');
    console.log('║     无需再次启动，前端可直接使用。                             ║');
  } else {
    console.log(`║  WhatsApp Companion  [${mode.padEnd(22)}]  http://${DEFAULT_HOST}:${port}  ║`);
    console.log('╠═══════════════════════════════════════════════════════════════╣');
    if (isDemo) {
      console.log('║  ⚠ 演示模式 — USE_DEMO=1，数据非真实                         ║');
    } else {
      console.log('║  ✅ 真实模式 — Baileys 已就绪，等待前端扫码请求               ║');
    }
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
  console.log(`║  状态: ${reused ? '复用中' : '运行中'} ● | ${reused ? '已有实例处理中' : '请保持此窗口打开'}                           ║`);
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log('');

  if (reused) {
    console.log('[Companion] 已有实例在运行，本进程无需保持。按 Ctrl+C 退出。');
    return;
  }

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
