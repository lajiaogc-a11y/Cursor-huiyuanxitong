#!/usr/bin/env node
/**
 * 独立迁移 CLI：部署流水线应先执行本命令成功后再启动 API。
 *   npm run migrate:all
 */
import 'dotenv/config';
if (!process.env.TZ?.trim()) {
  process.env.TZ = (process.env.APP_TIMEZONE || 'Asia/Shanghai').trim();
}
import { runAllMigrations } from '../startup/runAllMigrations.js';

void (async () => {
  try {
    console.log('[migrate:all] starting…');
    await runAllMigrations();
    console.log('[migrate:all] done.');
    process.exit(0);
  } catch (e) {
    console.error('[migrate:all] failed:', e);
    process.exit(1);
  }
})();
