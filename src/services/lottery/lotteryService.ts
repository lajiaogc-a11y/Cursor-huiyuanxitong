/**
 * 抽奖系统前端 API 服务
 */
import { lotteryApi } from '@/api/lottery';
import { safeCall, safeActionCall } from '@/lib/serviceErrorHandler';

/* ──── 类型 ──── */

export type LotteryPrizeType = 'points' | 'custom' | 'none';

export interface LotteryPrize {
  id?: string;
  name: string;
  type: LotteryPrizeType;
  value: number;
  description: string | null;
  /** 权重值（非负数）；运行时自动归一化，不再强制总和=100 */
  probability: number;
  /** 会员端公示用；不参与抽奖；空则展示真实 probability */
  display_probability?: number | null;
  image_url: string | null;
  sort_order: number;
  enabled?: boolean;
  /** 发奖成本（积分或点数），用于预算/RTP 计算 */
  prize_cost?: number;
  /** 是否启用库存控制 */
  stock_enabled?: boolean;
  /** 总库存（-1=不限） */
  stock_total?: number;
  /** 已用库存（只读，来自数据库） */
  stock_used?: number;
  /** 每日库存上限（-1=不限） */
  daily_stock_limit?: number;
}

export type RewardType = 'auto' | 'manual' | 'none';

export interface LotteryLog {
  id: string;
  member_id: string;
  prize_name: string;
  prize_type: string;
  prize_value: number;
  /** 实际到账积分（以此为准） */
  reward_points?: number;
  /** Phase 4: 奖品成本（快照） */
  prize_cost?: number;
  /** Phase 4: 奖励发放状态 */
  reward_status?: 'pending' | 'done' | 'failed';
  /** Phase 4: 奖励类型 auto=自动 manual=人工 none=无需 */
  reward_type?: RewardType;
  /** Phase 4: 重试次数 */
  retry_count?: number;
  /** Phase 4: 失败原因 */
  fail_reason?: string | null;
  created_at: string;
  nickname?: string | null;
  phone_number?: string | null;
  member_code?: string | null;
}

export interface DrawResult {
  success: boolean;
  prize?: {
    id: string;
    name: string;
    type: string;
    value: number;
    description: string | null;
  };
  remaining?: number;
  error?: string;
  reward_status?: 'pending' | 'done' | 'failed';
  fail_reason?: string;
  /** 实际到账积分（以此为准，不要用 prize.value） */
  reward_points?: number;
  /** 发放后余额快照 */
  balance_after?: number | null;
  budget_warning?: 'BUDGET_EXCEEDED' | 'BUDGET_LOW' | 'RTP_LIMIT_REACHED';
  /** Phase 3: 风控降级（结果被强制保底） */
  risk_downgraded?: boolean;
}

export interface QuotaResult {
  success: boolean;
  remaining: number;
  daily_free: number;
  credits: number;
  used_today: number;
}

export type BudgetPolicy = 'deny' | 'downgrade' | 'fallback';

export interface LotterySettings {
  daily_free_spins: number;
  enabled: boolean;
  /** 会员端「概率说明」弹窗文案，与奖品配置同在幸运抽奖后台维护 */
  probability_notice?: string | null;
  /** 每有一笔订单标记为完成时，为会员增加抽奖次数（与 staff 订单状态一致） */
  order_completed_spin_enabled?: boolean;
  order_completed_spin_amount?: number;
  /** Phase 2: 每日发奖预算（0=不限） */
  daily_reward_budget?: number;
  /** Phase 2: 今日已消耗预算（只读） */
  daily_reward_used?: number;
  /** Phase 2: 目标返奖率(%，0=不限，在预算基础上再收紧有效上限） */
  target_rtp?: number;
  /** Phase 2: 预算策略 deny=耗尽拒抽 downgrade=压权降级 fallback=仅保底 */
  budget_policy?: BudgetPolicy;
  /** Phase 3: 是否启用风控 */
  risk_control_enabled?: boolean;
  /** Phase 3: 单账号每日抽奖上限（0=不限） */
  risk_account_daily_limit?: number;
  /** Phase 3: 单账号 60s 内抽奖上限（0=不限） */
  risk_account_burst_limit?: number;
  /** Phase 3: 同 IP 每日抽奖上限（0=不限） */
  risk_ip_daily_limit?: number;
  /** Phase 3: 同 IP 60s 内抽奖上限（0=不限） */
  risk_ip_burst_limit?: number;
  /** Phase 3: 风险分阈值（>=此值强制保底，0=不启用） */
  risk_high_score_threshold?: number;
}

/* ──── 会员端 API ──── */

export async function lotteryDraw(memberId: string): Promise<DrawResult> {
  const request_id = crypto.randomUUID();
  return safeActionCall(
    async () => (await lotteryApi.draw({ member_id: memberId, request_id })) as unknown as DrawResult,
    "lotteryDraw",
  );
}

export async function getLotteryQuota(memberId: string): Promise<QuotaResult> {
  return safeCall(
    () => lotteryApi.getQuota(memberId) as Promise<QuotaResult>,
    { success: false, remaining: 0, daily_free: 0, credits: 0, used_today: 0 },
    "getLotteryQuota",
  );
}

export async function getMyLotteryLogs(
  memberId: string,
  limit = 50,
  offset = 0,
): Promise<{ logs: LotteryLog[]; total: number }> {
  return safeCall(
    async () => {
      const r = (await lotteryApi.getMyLogs(memberId, { limit, offset })) as {
        success?: boolean;
        logs?: LotteryLog[];
        total?: number;
      };
      return { logs: r?.logs ?? [], total: r?.total ?? r?.logs?.length ?? 0 };
    },
    { logs: [], total: 0 },
    "getMyLotteryLogs",
  );
}

export interface SpinSimFeedItem {
  id: string;
  text: string;
  at: number;
}

/** 抽奖页模拟中奖滚动（服务端按租户隔离） */
export async function getSpinSimFeed(): Promise<SpinSimFeedItem[]> {
  return safeCall(
    async () => {
      const r = (await lotteryApi.getSimFeed()) as { success?: boolean; items?: SpinSimFeedItem[] };
      return Array.isArray(r?.items) ? r.items : [];
    },
    [],
    "getSpinSimFeed",
  );
}

export async function getMemberLotteryPrizes(memberId: string): Promise<{
  prizes: LotteryPrize[];
  probability_notice: string | null;
  enabled: boolean;
  order_completed_spin_enabled: boolean;
  order_completed_spin_amount: number;
}> {
  return safeCall(
    async () => {
      const r = (await lotteryApi.getMemberPrizes(memberId, { cache: "no-store" })) as {
        success?: boolean;
        prizes?: LotteryPrize[];
        probability_notice?: string | null;
        enabled?: boolean;
        order_completed_spin_enabled?: boolean;
        order_completed_spin_amount?: number;
      };
      return {
        prizes: r?.prizes ?? [],
        probability_notice: r?.probability_notice ?? null,
        enabled: r?.enabled !== false,
        order_completed_spin_enabled: r?.order_completed_spin_enabled === true,
        order_completed_spin_amount: Math.max(0, Math.floor(Number(r?.order_completed_spin_amount) || 0)),
      };
    },
    {
      prizes: [],
      probability_notice: null,
      enabled: true,
      order_completed_spin_enabled: false,
      order_completed_spin_amount: 0,
    },
    "getMemberLotteryPrizes",
  );
}

/* ──── 管理端 API ──── */

export async function adminGetLotteryPrizes(): Promise<LotteryPrize[]> {
  return safeCall(
    async () => {
      const r = (await lotteryApi.admin.listPrizes()) as { success?: boolean; prizes?: LotteryPrize[] };
      return r?.prizes ?? [];
    },
    [],
    "adminGetLotteryPrizes",
  );
}

export async function adminSaveLotteryPrizes(prizes: LotteryPrize[]): Promise<void> {
  await lotteryApi.admin.savePrizes({ prizes });
}

export async function adminGetLotteryLogs(options?: {
  limit?: number;
  offset?: number;
  /** 与活动数据一致：平台管理员查看某租户时必须传入 */
  tenantId?: string | null;
  phone?: string;
  memberCode?: string;
}): Promise<{ logs: LotteryLog[]; total: number }> {
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;
  const tid = options?.tenantId?.trim();
  const params: Record<string, string> = {
    limit: String(limit),
    offset: String(offset),
  };
  if (tid) params.tenant_id = tid;
  if (options?.phone?.trim()) params.phone = options.phone.trim();
  if (options?.memberCode?.trim()) params.member_code = options.memberCode.trim();
  return safeCall(
    async () => {
      const r = (await lotteryApi.admin.listLogs(params)) as {
        success?: boolean;
        logs?: LotteryLog[];
        total?: number;
      };
      return { logs: r?.logs ?? [], total: r?.total ?? r?.logs?.length ?? 0 };
    },
    { logs: [], total: 0 },
    "adminGetLotteryLogs",
  );
}

export async function adminGetLotterySettings(): Promise<LotterySettings> {
  return safeCall(
    async () => {
      const r = (await lotteryApi.admin.getSettings()) as {
        success?: boolean;
        daily_free_spins?: number;
        enabled?: boolean;
        probability_notice?: string | null;
        order_completed_spin_enabled?: boolean;
        order_completed_spin_amount?: number;
        daily_reward_budget?: number;
        daily_reward_used?: number;
        target_rtp?: number;
        budget_policy?: string;
        risk_control_enabled?: boolean;
        risk_account_daily_limit?: number;
        risk_account_burst_limit?: number;
        risk_ip_daily_limit?: number;
        risk_ip_burst_limit?: number;
        risk_high_score_threshold?: number;
      };
      const bp = String(r?.budget_policy ?? 'downgrade').toLowerCase();
      return {
        daily_free_spins: r?.daily_free_spins ?? 0,
        enabled: r?.enabled !== false,
        probability_notice: r?.probability_notice ?? null,
        order_completed_spin_enabled: r?.order_completed_spin_enabled === true,
        order_completed_spin_amount: Math.max(0, Math.floor(Number(r?.order_completed_spin_amount) || 0)),
        daily_reward_budget: Math.max(0, Number(r?.daily_reward_budget) || 0),
        daily_reward_used: Math.max(0, Number(r?.daily_reward_used) || 0),
        target_rtp: Math.max(0, Math.min(100, Number(r?.target_rtp) || 0)),
        budget_policy: (bp === 'deny' || bp === 'fallback' ? bp : 'downgrade') as BudgetPolicy,
        risk_control_enabled: r?.risk_control_enabled === true,
        risk_account_daily_limit: Math.max(0, Number(r?.risk_account_daily_limit) || 0),
        risk_account_burst_limit: Math.max(0, Number(r?.risk_account_burst_limit) || 0),
        risk_ip_daily_limit: Math.max(0, Number(r?.risk_ip_daily_limit) || 0),
        risk_ip_burst_limit: Math.max(0, Number(r?.risk_ip_burst_limit) || 0),
        risk_high_score_threshold: Math.max(0, Number(r?.risk_high_score_threshold) || 0),
      };
    },
    {
      daily_free_spins: 0,
      enabled: false,
      probability_notice: null,
      order_completed_spin_enabled: false,
      order_completed_spin_amount: 1,
      daily_reward_budget: 0,
      daily_reward_used: 0,
      target_rtp: 0,
      budget_policy: 'downgrade' as BudgetPolicy,
      risk_control_enabled: false,
      risk_account_daily_limit: 0,
      risk_account_burst_limit: 0,
      risk_ip_daily_limit: 0,
      risk_ip_burst_limit: 0,
      risk_high_score_threshold: 0,
    },
    "adminGetLotterySettings",
  );
}

export async function adminSaveLotterySettings(settings: LotterySettings): Promise<void> {
  await lotteryApi.admin.saveSettings(settings);
}

/** 活动数据「模拟设置」：假昵称批量配置（需 tenant_id，与活动数据列表一致） */
export type SimFakeSettingsSource = 'builtin' | 'custom';

export interface AdminSimFakeSettings {
  nicknames_raw: string;
  /** 实际用于抽奖假人的池大小（自定义且解析成功为 100；内置为 100） */
  pool_count: number;
  /** 从原文解析出的昵称条数（未扩成 100 之前） */
  nickname_tokens_count?: number;
  source: SimFakeSettingsSource;
  updated_at: string | null;
}

export async function adminGetSimFakeSettings(tenantId: string): Promise<AdminSimFakeSettings> {
  return safeCall(
    async () => {
      const r = (await lotteryApi.admin.getSimFakeSettings({ tenant_id: tenantId })) as {
        success?: boolean;
        nicknames_raw?: string;
        pool_count?: number;
        nickname_tokens_count?: number;
        source?: SimFakeSettingsSource;
        updated_at?: string | null;
      };
      return {
        nicknames_raw: r?.nicknames_raw ?? '',
        pool_count: typeof r?.pool_count === 'number' ? r.pool_count : 100,
        nickname_tokens_count: typeof r?.nickname_tokens_count === 'number' ? r.nickname_tokens_count : undefined,
        source: r?.source === 'custom' ? 'custom' : 'builtin',
        updated_at: r?.updated_at ?? null,
      };
    },
    {
      nicknames_raw: '',
      pool_count: 100,
      nickname_tokens_count: undefined,
      source: 'builtin' as const,
      updated_at: null,
    },
    'adminGetSimFakeSettings',
  );
}

export async function adminSaveSimFakeSettings(
  tenantId: string,
  nicknames_raw: string,
): Promise<{ source: SimFakeSettingsSource; pool_count: number }> {
  const nickname_tokens_count = nicknames_raw.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
  const r = (await lotteryApi.admin.saveSimFakeSettings(
    { nicknames_raw, nickname_tokens_count },
    { tenant_id: tenantId },
  )) as {
    success?: boolean;
    source?: SimFakeSettingsSource;
    pool_count?: number;
  };
  return {
    source: r?.source === 'builtin' ? 'builtin' : 'custom',
    pool_count: typeof r?.pool_count === 'number' ? r.pool_count : 100,
  };
}

/** 与后端 MAX_CRON_FAKE_DRAWS_PER_FAKE_PER_HOUR 一致：每个假人每小时次数上限 */
export const ADMIN_SIM_CRON_FAKE_DRAWS_PER_FAKE_MAX = 20;

export interface AdminSimulationSettings {
  retention_days: number;
  /** 每个假用户每小时模拟抽奖次数（总调度 = 假人数 × 本值；0 表示本小时不跑） */
  cron_fake_draws_per_hour: number;
  /** 进入会员端滚动喜讯的名次区间（按奖品排序 1=最高） */
  sim_feed_rank_min: number;
  sim_feed_rank_max: number;
  enable_cron_fake_feed: boolean;
  /** 模拟执行锚点（ISO）；存在时表示按该时刻起每小时一轮，而非上海整点 */
  cron_fake_anchor_at?: string | null;
}

export async function adminGetSimulationSettings(tenantId: string): Promise<AdminSimulationSettings> {
  return safeCall(
    async () => {
      const r = (await lotteryApi.admin.getSimulationSettings({ tenant_id: tenantId })) as AdminSimulationSettings & {
        success?: boolean;
      };
      return {
        retention_days: Math.max(1, Number(r?.retention_days ?? 3)),
        cron_fake_draws_per_hour: Math.max(
          0,
          Math.min(ADMIN_SIM_CRON_FAKE_DRAWS_PER_FAKE_MAX, Number(r?.cron_fake_draws_per_hour ?? 3)),
        ),
        sim_feed_rank_min: Math.max(1, Math.min(8, Number(r?.sim_feed_rank_min ?? 1))),
        sim_feed_rank_max: Math.max(1, Math.min(8, Number(r?.sim_feed_rank_max ?? 8))),
        enable_cron_fake_feed: !!r?.enable_cron_fake_feed,
        cron_fake_anchor_at: r?.cron_fake_anchor_at ?? null,
      };
    },
    {
      retention_days: 3,
      cron_fake_draws_per_hour: 3,
      sim_feed_rank_min: 1,
      sim_feed_rank_max: 8,
      enable_cron_fake_feed: false,
      cron_fake_anchor_at: null,
    },
    "adminGetSimulationSettings",
  );
}

export async function adminSaveSimulationSettings(
  tenantId: string,
  body: Partial<AdminSimulationSettings>,
): Promise<AdminSimulationSettings> {
  const r = (await lotteryApi.admin.saveSimulationSettings(body, { tenant_id: tenantId })) as AdminSimulationSettings & {
    success?: boolean;
  };
  return {
    retention_days: Math.max(1, Number(r?.retention_days ?? 3)),
    cron_fake_draws_per_hour: Math.max(
      0,
      Math.min(ADMIN_SIM_CRON_FAKE_DRAWS_PER_FAKE_MAX, Number(r?.cron_fake_draws_per_hour ?? 3)),
    ),
    sim_feed_rank_min: Math.max(1, Math.min(8, Number(r?.sim_feed_rank_min ?? 1))),
    sim_feed_rank_max: Math.max(1, Math.min(8, Number(r?.sim_feed_rank_max ?? 8))),
    enable_cron_fake_feed: !!r?.enable_cron_fake_feed,
    cron_fake_anchor_at: r?.cron_fake_anchor_at ?? null,
  };
}

export interface AdminSimulationFeedRow {
  id: string;
  source: string;
  feed_text: string;
  member_id: string | null;
  created_at: string;
}

export async function adminListSimulationFeed(
  tenantId: string,
  limit = 80,
): Promise<AdminSimulationFeedRow[]> {
  return safeCall(
    async () => {
      const r = (await lotteryApi.admin.listSimulationFeed({ tenant_id: tenantId, limit })) as {
        success?: boolean;
        rows?: AdminSimulationFeedRow[];
      };
      return Array.isArray(r?.rows) ? r.rows : [];
    },
    [],
    "adminListSimulationFeed",
  );
}

export interface AdminSimulationHourRunRow {
  hour_key: string;
  created_at: string;
}

export async function adminListSimulationHourRuns(
  tenantId: string,
  limit = 80,
): Promise<AdminSimulationHourRunRow[]> {
  return safeCall(
    async () => {
      const r = (await lotteryApi.admin.listSpinFakeHourRuns({ tenant_id: tenantId, limit })) as {
        success?: boolean;
        rows?: AdminSimulationHourRunRow[];
      };
      return Array.isArray(r?.rows) ? r.rows : [];
    },
    [],
    "adminListSimulationHourRuns",
  );
}

export async function adminStartSimulationCron(tenantId: string): Promise<{ cron_fake_anchor_at: string | null }> {
  const r = (await lotteryApi.admin.startSpinFakeCron({ tenant_id: tenantId })) as {
    success?: boolean;
    cron_fake_anchor_at?: string | null;
  };
  return { cron_fake_anchor_at: r?.cron_fake_anchor_at ?? null };
}

/* ──── Phase 4: 奖励补偿管理 API ──── */

export interface PendingRewardRow {
  id: string;
  member_id: string;
  tenant_id: string | null;
  prize_name: string;
  prize_type: string;
  prize_value: number;
  prize_cost: number;
  reward_status: string;
  reward_type: RewardType;
  retry_count: number;
  fail_reason: string | null;
  created_at: string;
}

export async function adminListPendingRewards(opts?: {
  status?: 'failed' | 'pending';
  limit?: number;
  offset?: number;
}): Promise<{ rows: PendingRewardRow[]; total: number }> {
  const params: Record<string, string> = {};
  if (opts?.status) params.status = opts.status;
  if (opts?.limit) params.limit = String(opts.limit);
  if (opts?.offset) params.offset = String(opts.offset);
  return safeCall(
    async () => {
      const r = (await lotteryApi.admin.getPendingRewards(params)) as {
        success?: boolean;
        rows?: PendingRewardRow[];
        total?: number;
      };
      return { rows: r?.rows ?? [], total: r?.total ?? 0 };
    },
    { rows: [], total: 0 },
    'adminListPendingRewards',
  );
}

export interface RetryBatchResult {
  attempted: number;
  succeeded: number;
  stillFailed: number;
  skipped: number;
}

export async function adminRetryFailedRewards(batchSize = 20): Promise<RetryBatchResult> {
  return safeActionCall(
    () => lotteryApi.admin.retryFailedRewards({ batch_size: batchSize }) as Promise<RetryBatchResult & { success: boolean }>,
    'adminRetryFailedRewards',
  ) as Promise<RetryBatchResult>;
}

export async function adminConfirmReward(
  logId: string,
  action: 'done' | 'failed',
  reason?: string,
): Promise<void> {
  await lotteryApi.admin.confirmReward({ log_id: logId, action, reason });
}

export async function adminManualRetryReward(logId: string): Promise<{ new_status?: string }> {
  const r = (await lotteryApi.admin.manualRetryReward({ log_id: logId })) as {
    success?: boolean;
    new_status?: string;
  };
  return { new_status: r?.new_status };
}

/* ──── Phase 5: 模拟抽奖与运营预览 API ──── */

export interface SimPrizeResult {
  id: string;
  name: string;
  type: string;
  probability: number;
  prize_cost: number;
  hits: number;
  hit_rate: number;
  total_cost: number;
  avg_cost_per_draw: number;
  stock_total: number;
  stock_used_before: number;
  stock_depleted_at_round?: number;
}

export interface SimulationResult {
  rounds: number;
  prizes: SimPrizeResult[];
  total_cost: number;
  avg_cost_per_round: number;
  estimated_rtp: number;
  budget_exhausted_at_round: number | null;
  budget_remaining: number;
  warnings: string[];
}

export interface TenantSnapshot {
  prizes: Array<{
    id: string;
    name: string;
    type: string;
    probability: number;
    prize_cost: number;
    stock_total: number;
    stock_used: number;
    stock_enabled: number;
  }>;
  daily_reward_budget: number;
  daily_reward_used: number;
  budget_remaining: number;
  target_rtp: number;
  budget_policy: BudgetPolicy;
  effective_budget_cap: number;
}

export interface SimulateCurrentResult extends SimulationResult {
  snapshot: TenantSnapshot;
}

/** 用当前 DB 配置跑 Monte Carlo 模拟（默认 10,000 轮） */
export async function adminSimulateCurrent(rounds = 10_000): Promise<SimulateCurrentResult | null> {
  return safeCall(
    async () => {
      const r = (await lotteryApi.admin.simulateCurrent({ rounds })) as SimulateCurrentResult & { success: boolean };
      return r?.success ? r : null;
    },
    null,
    'adminSimulateCurrent',
  );
}

export interface SimulatePreviewInput {
  prizes: Array<{
    id?: string;
    name: string;
    type: string;
    value: number;
    probability: number;
    prize_cost?: number;
    stock_enabled?: number;
    stock_total?: number;
    stock_used?: number;
  }>;
  daily_reward_budget?: number;
  daily_reward_used?: number;
  target_rtp?: number;
  budget_policy?: string;
  rounds?: number;
}

/** 保存前预览：用前端传入的候选配置跑模拟 */
export async function adminSimulatePreview(input: SimulatePreviewInput): Promise<SimulationResult | null> {
  return safeCall(
    async () => {
      const r = (await lotteryApi.admin.simulatePreview(input)) as SimulationResult & { success: boolean };
      return r?.success ? r : null;
    },
    null,
    'adminSimulatePreview',
  );
}

/** 获取租户当前抽奖状态快照（概率分布 / 库存 / 预算余额） */
export async function adminGetSnapshot(): Promise<TenantSnapshot | null> {
  return safeCall(
    async () => {
      const r = (await lotteryApi.admin.getSnapshot()) as TenantSnapshot & { success: boolean };
      return r?.success ? r : null;
    },
    null,
    'adminGetSnapshot',
  );
}

/* ──── Phase 6: 恢复与补偿任务 API ──── */

export type ReconcileTaskType = 'reward_retry' | 'stock_reconcile' | 'budget_reconcile' | 'idempotency_repair';

export interface StockDrift {
  prize_id: string;
  prize_name: string;
  stock_used_in_prize: number;
  actual_wins: number;
  drift: number;
  auto_fixed: boolean;
}

export interface StockReconcileResult {
  checked: number;
  drifts: StockDrift[];
  fixed: number;
  skipped: number;
}

export interface BudgetDrift {
  tenant_id: string | null;
  daily_reward_used_in_settings: number;
  actual_cost_today: number;
  drift: number;
  auto_fixed: boolean;
}

export interface BudgetReconcileResult {
  tenant_id: string | null;
  date: string;
  drift: BudgetDrift | null;
  ok: boolean;
}

export interface IdempotencyRepairResult {
  backfilled: number;
  duplicates_found: number;
  duplicates_marked: number;
}

export interface ReconcileAllResult {
  stock: StockReconcileResult;
  budget: BudgetReconcileResult;
  idempotency: IdempotencyRepairResult;
  reward_retry: RetryBatchResult | null;
  timestamp: string;
  warnings: string[];
}

export interface TaskRunRecord {
  id: string;
  type: ReconcileTaskType;
  tenant_id: string | null;
  started_at: string;
  finished_at: string;
  duration_ms: number;
  success: boolean;
  summary: string;
  detail: unknown;
}

/** 一键执行全部校正 */
export async function adminReconcileAll(opts?: {
  auto_fix?: boolean;
  include_reward_retry?: boolean;
}): Promise<ReconcileAllResult | null> {
  return safeCall(
    async () => {
      const r = (await lotteryApi.admin.reconcileAll({
        auto_fix: opts?.auto_fix ?? true,
        include_reward_retry: opts?.include_reward_retry ?? true,
      })) as ReconcileAllResult & { success: boolean };
      return r?.success ? r : null;
    },
    null,
    'adminReconcileAll',
  );
}

/** 单独触发某个校正任务 */
export async function adminRunTask(
  task: ReconcileTaskType,
  autoFix = true,
): Promise<TaskRunRecord | null> {
  return safeCall(
    async () => {
      const r = (await lotteryApi.admin.runTask({ task, auto_fix: autoFix })) as {
        success: boolean;
        record: TaskRunRecord;
      };
      return r?.success ? r.record : null;
    },
    null,
    'adminRunTask',
  );
}

/** 查询任务运行历史 */
export async function adminGetTaskHistory(opts?: {
  type?: ReconcileTaskType;
  limit?: number;
}): Promise<{ history: TaskRunRecord[]; last_runs: Record<string, TaskRunRecord | null> }> {
  const params: Record<string, string> = {};
  if (opts?.type) params.type = opts.type;
  if (opts?.limit) params.limit = String(opts.limit);
  return safeCall(
    async () => {
      const r = (await lotteryApi.admin.getTaskHistory(params)) as {
        success?: boolean;
        history?: TaskRunRecord[];
        last_runs?: Record<string, TaskRunRecord | null>;
      };
      return { history: r?.history ?? [], last_runs: r?.last_runs ?? {} };
    },
    { history: [], last_runs: {} },
    'adminGetTaskHistory',
  );
}

/** 调度器控制（启动 / 停止 / 状态查询） */
export async function adminSchedulerControl(
  action?: 'start' | 'stop',
): Promise<{ running: boolean }> {
  return safeCall(
    async () => {
      const r = (await lotteryApi.admin.setScheduler(action ? { action } : {})) as {
        success?: boolean;
        running?: boolean;
      };
      return { running: r?.running ?? false };
    },
    { running: false },
    'adminSchedulerControl',
  );
}

/* ──── Phase 7: 运营仪表盘 API ──── */

export interface OperationalStatsStockItem {
  id: string;
  name: string;
  type: string;
  stock_enabled: boolean;
  stock_total: number;
  stock_used: number;
  stock_remaining: number;
}

export interface OperationalCostBreakdownRow {
  id: string;
  prize_name: string;
  prize_type: string;
  reward_status: string;
  reward_points: number | null;
  prize_value: number;
  prize_cost: number;
  line_composite_cost: number;
  line_points_cost: number;
  created_at: string;
}

export interface OperationalStats {
  date: string;
  budget: {
    daily_budget: number;
    daily_used: number;
    daily_remaining: number;
    effective_cap: number;
    target_rtp: number;
    today_order_points?: number;
    actual_rtp: number;
    budget_policy: BudgetPolicy;
  };
  today: {
    draws: number;
    /** 今日成本（积分口径）= points_cost，不含 composite_prize_cost */
    cost: number;
    points_cost: number;
    composite_prize_cost: number;
    winners: number;
    points_awarded: number;
    avg_points_cost_per_draw: number;
    avg_composite_cost_per_draw: number;
    /** @deprecated 使用 avg_points_cost_per_draw */
    avg_cost_per_draw: number;
  };
  /** 当日最多 120 条：核对综合成本构成 */
  cost_breakdown: OperationalCostBreakdownRow[];
  stock: OperationalStatsStockItem[];
  risk: {
    enabled: boolean;
    blocked_today: number;
    failed_rewards: number;
    pending_rewards: number;
  };
}

/** 获取运营仪表盘统计数据 */
export async function adminGetOperationalStats(): Promise<OperationalStats | null> {
  return safeCall(
    async () => {
      const r = (await lotteryApi.admin.getOperationalStats()) as unknown as OperationalStats & {
        success?: boolean;
      };
      return r?.success ? (r as unknown as OperationalStats) : null;
    },
    null,
    'adminGetOperationalStats',
  );
}
