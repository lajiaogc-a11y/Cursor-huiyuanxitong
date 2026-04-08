#!/usr/bin/env node
/**
 * 抽奖逻辑自检：对「与 draw() 相同的加权随机」运行 N 次（默认 100），统计命中分布；
 * 若提供租户 ID 且数据库可用，则读取真实启用奖品（前 8 项，与 draw 一致），并可选对比 simulateLotteryDrawForTenant。
 *
 * 用法：
 *   npx tsx src/cli/diagnoseLotteryDraw.ts
 *   npx tsx src/cli/diagnoseLotteryDraw.ts --tenant=<uuid>
 *   npx tsx src/cli/diagnoseLotteryDraw.ts --rounds=500 --tenant=<uuid>
 *
 * 说明：真实会员 draw() 另含次数余额、3 秒行为幂等、风控、库存/日限、预算感知等；本脚本不替代集成测试。
 */
import 'dotenv/config';
if (!process.env.TZ?.trim()) {
  process.env.TZ = (process.env.APP_TIMEZONE || 'Asia/Shanghai').trim();
}

import { pickLotteryPrizeByConfiguredProbability } from '../modules/lottery/prizePick.js';
import { listEnabledPrizes } from '../modules/lottery/repository.js';
import { simulateLotteryDrawForTenant } from '../modules/lottery/service.js';
import { query, closePool } from '../database/index.js';

const DEFAULT_ROUNDS = 100;

type PrizeLite = { id: string; name: string; probability: number; type: string };

function parseArg(name: string): string | undefined {
  const pref = `${name}=`;
  const hit = process.argv.find((a) => a.startsWith(pref));
  return hit ? hit.slice(pref.length) : undefined;
}

function parseRounds(): number {
  const raw = parseArg('--rounds');
  const n = raw != null ? Number(raw) : DEFAULT_ROUNDS;
  return Number.isFinite(n) && n >= 10 && n <= 100_000 ? Math.floor(n) : DEFAULT_ROUNDS;
}

/** 与会员端 draw 前 8 项池子一致时的离线对照池（概率和为 100） */
const MOCK_PRIZES: PrizeLite[] = [
  { id: 'm1', name: '一等奖', probability: 1, type: 'points' },
  { id: 'm2', name: '二等奖', probability: 4, type: 'points' },
  { id: 'm3', name: '三等奖', probability: 10, type: 'points' },
  { id: 'm4', name: '四等奖', probability: 15, type: 'points' },
  { id: 'm5', name: '五等奖', probability: 20, type: 'points' },
  { id: 'm6', name: '谢谢参与', probability: 50, type: 'none' },
];

function runMonteCarlo(prizes: PrizeLite[], rounds: number): Map<string, number> {
  const counts = new Map<string, number>();
  for (const p of prizes) counts.set(p.id, 0);
  for (let i = 0; i < rounds; i++) {
    const hit = pickLotteryPrizeByConfiguredProbability(prizes);
    counts.set(hit.id, (counts.get(hit.id) ?? 0) + 1);
  }
  return counts;
}

function printReport(prizes: PrizeLite[], rounds: number, counts: Map<string, number>): void {
  const totalProb = prizes.reduce((s, p) => s + Number(p.probability), 0);
  console.log('\n=== 奖品池（与 draw 使用的前 8 项、sort_order 顺序一致）===');
  console.log(`概率配置合计: ${totalProb}（将按比例归一化到 100%）\n`);
  console.log('id\tname\t\tprob%\t期望次数\t实际次数\t偏差');
  for (const p of prizes) {
    const exp = (rounds * Number(p.probability)) / totalProb;
    const act = counts.get(p.id) ?? 0;
    const delta = act - exp;
    console.log(`${p.id}\t${p.name}\t\t${p.probability}\t${exp.toFixed(1)}\t\t${act}\t\t${delta >= 0 ? '+' : ''}${delta.toFixed(1)}`);
  }
  console.log(`\n总抽奖次数: ${rounds}（加权随机: pickLotteryPrizeByConfiguredProbability）`);
}

async function main(): Promise<void> {
  const rounds = parseRounds();
  const tenantArg = parseArg('--tenant')?.trim() || process.env.LOTTERY_DIAGNOSE_TENANT_ID?.trim();

  let prizes: PrizeLite[] = MOCK_PRIZES;
  let source = '内置 MOCK（概率和=100）';

  if (tenantArg) {
    try {
      const rows = await listEnabledPrizes(tenantArg);
      const top8 = rows.slice(0, 8);
      if (top8.length === 0) {
        console.warn(`[diagnose] 租户 ${tenantArg} 无启用奖品，改用 MOCK`);
      } else {
        prizes = top8.map((r) => ({
          id: r.id,
          name: r.name,
          probability: Number(r.probability),
          type: r.type,
        }));
        source = `数据库 tenant_id=${tenantArg}（启用奖品前 8 项）`;
      }
    } catch (e) {
      console.warn('[diagnose] 读库失败，改用 MOCK:', (e as Error).message);
    }
  }

  console.log(`\n[抽奖诊断] 数据源: ${source}`);
  console.log(`模拟次数: ${rounds}`);

  const counts = runMonteCarlo(prizes, rounds);
  printReport(prizes, rounds, counts);

  if (tenantArg && prizes[0] && !prizes[0].id.startsWith('m')) {
    console.log('\n--- simulateLotteryDrawForTenant 对照（同租户，不写库）---');
    let simOk = 0;
    const simById = new Map<string, number>();
    for (const p of prizes) simById.set(p.id, 0);
    let simErr = 0;
    for (let i = 0; i < rounds; i++) {
      const r = await simulateLotteryDrawForTenant(tenantArg);
      if (r.ok && r.prize) {
        simOk++;
        simById.set(r.prize.id, (simById.get(r.prize.id) ?? 0) + 1);
      } else {
        simErr++;
      }
    }
    console.log(`成功 ${simOk} / 失败 ${simErr}（如 LOTTERY_DISABLED / PROBABILITY_SUM_ZERO 等会计入失败）`);
    if (simErr === 0) {
      let mismatch = false;
      for (const p of prizes) {
        const a = counts.get(p.id) ?? 0;
        const b = simById.get(p.id) ?? 0;
        if (a !== b) mismatch = true;
      }
      console.log(
        mismatch
          ? '与上方 Monte Carlo 计数不完全相同（正常：两次独立各 N 次随机）。分布应相近。'
          : '与上方 Monte Carlo 计数完全一致（偶然相同或样本可复现时可能发生）。',
      );
      console.log('simulate 按 id 分布:', Object.fromEntries(simById));
    }
  }

  console.log('\n=== 真实 draw(memberId) 额外规则（本脚本未逐条模拟）===');
  console.log([
    '- 抽奖次数：member_activity.lottery_spin_balance > 0',
    '- 全局开关：lottery_settings.enabled',
    '- 行为幂等：3 秒内同一会员已有 lottery_logs 则返回上次结果（success: true, idempotent_replay）',
    '- 内存防抖：无 requestId 时 2s 内 DUPLICATE_REQUEST',
    '- 硬限流：checkHardBehavioralLimit → RATE_LIMITED',
    '- 风控：evaluateDrawRisk 可能 block / downgrade（降级强制谢谢参与）',
    '- 预算：若存在 prize_cost>0 且配置了日预算/RTP，则 budgetAwarePrizePick；全 0 cost 则与纯概率一致',
    '- 总库存 / 日库存：可能改判为 none',
    '- request_id 幂等：重复 requestId 重放历史结果',
  ].join('\n'));

  await closePool().catch(() => {});
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
