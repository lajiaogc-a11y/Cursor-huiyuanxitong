/**
 * 命令行执行抽奖相关 MySQL 迁移（含 lottery_settings.probability_notice）
 * cd server && npm run migrate:lottery
 */
import 'dotenv/config';
import { migrateLotteryTables } from './migrate.js';
import { closePool } from '../../database/index.js';

(async () => {
  let code = 0;
  try {
    await migrateLotteryTables();
    console.log('[lottery] CLI migration finished OK');
  } catch (e) {
    console.error('[lottery] CLI migration failed:', e);
    code = 1;
  } finally {
    try {
      await closePool();
    } catch {
      /* ignore */
    }
  }
  process.exit(code);
})();
