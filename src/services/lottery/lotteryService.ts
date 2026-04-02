/**
 * 抽奖系统前端 API 服务
 */
import { apiGet, apiPost, apiGetAsStaff, apiPostAsStaff } from '@/api/client';
import { safeCall, safeActionCall } from '@/lib/serviceErrorHandler';
import { MEMBER_LOTTERY_PATHS } from '@/services/memberPortal/routes';

/* ──── 类型 ──── */

export type LotteryPrizeType = 'points' | 'custom' | 'none';

export interface LotteryPrize {
  id?: string;
  name: string;
  type: LotteryPrizeType;
  value: number;
  description: string | null;
  probability: number;
  /** 会员端公示用；不参与抽奖；空则展示真实 probability */
  display_probability?: number | null;
  image_url: string | null;
  sort_order: number;
  enabled?: boolean;
}

export interface LotteryLog {
  id: string;
  member_id: string;
  prize_name: string;
  prize_type: string;
  prize_value: number;
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
}

export interface QuotaResult {
  success: boolean;
  remaining: number;
  daily_free: number;
  credits: number;
  used_today: number;
}

export interface LotterySettings {
  daily_free_spins: number;
  enabled: boolean;
  /** 会员端「概率说明」弹窗文案，与奖品配置同在幸运抽奖后台维护 */
  probability_notice?: string | null;
  /** 每有一笔订单标记为完成时，为会员增加抽奖次数（与 staff 订单状态一致） */
  order_completed_spin_enabled?: boolean;
  order_completed_spin_amount?: number;
}

/* ──── 会员端 API ──── */

export async function lotteryDraw(memberId: string): Promise<DrawResult> {
  return safeActionCall(
    () => apiPost<DrawResult>(MEMBER_LOTTERY_PATHS.DRAW, { member_id: memberId }),
    "lotteryDraw",
  );
}

export async function getLotteryQuota(memberId: string): Promise<QuotaResult> {
  return safeCall(
    () => apiGet<QuotaResult>(MEMBER_LOTTERY_PATHS.quota(memberId)),
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
      const r = await apiGet<{ success: boolean; logs: LotteryLog[]; total?: number }>(
        MEMBER_LOTTERY_PATHS.logs(memberId, limit, offset),
      );
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
      const r = await apiGet<{ success?: boolean; items?: SpinSimFeedItem[] }>(MEMBER_LOTTERY_PATHS.SIM_FEED);
      return Array.isArray(r?.items) ? r.items : [];
    },
    [],
    "getSpinSimFeed",
  );
}

export async function getMemberLotteryPrizes(memberId: string): Promise<{
  prizes: LotteryPrize[];
  probability_notice: string | null;
  order_completed_spin_enabled: boolean;
  order_completed_spin_amount: number;
}> {
  return safeCall(
    async () => {
      const r = await apiGet<{
        success: boolean;
        prizes: LotteryPrize[];
        probability_notice?: string | null;
        order_completed_spin_enabled?: boolean;
        order_completed_spin_amount?: number;
      }>(MEMBER_LOTTERY_PATHS.prizes(memberId), { cache: "no-store" });
      return {
        prizes: r?.prizes ?? [],
        probability_notice: r?.probability_notice ?? null,
        order_completed_spin_enabled: r?.order_completed_spin_enabled === true,
        order_completed_spin_amount: Math.max(0, Math.floor(Number(r?.order_completed_spin_amount) || 0)),
      };
    },
    {
      prizes: [],
      probability_notice: null,
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
      const r = await apiGetAsStaff<{ success: boolean; prizes: LotteryPrize[] }>('/api/lottery/admin/prizes');
      return r?.prizes ?? [];
    },
    [],
    "adminGetLotteryPrizes",
  );
}

export async function adminSaveLotteryPrizes(prizes: LotteryPrize[]): Promise<void> {
  await apiPostAsStaff('/api/lottery/admin/prizes', { prizes });
}

export async function adminGetLotteryLogs(options?: {
  limit?: number;
  offset?: number;
  /** 与活动数据一致：平台管理员查看某租户时必须传入 */
  tenantId?: string | null;
}): Promise<{ logs: LotteryLog[]; total: number }> {
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;
  const tid = options?.tenantId?.trim();
  const qs = new URLSearchParams();
  qs.set("limit", String(limit));
  qs.set("offset", String(offset));
  if (tid) qs.set("tenant_id", tid);
  return safeCall(
    async () => {
      const r = await apiGetAsStaff<{ success: boolean; logs: LotteryLog[]; total?: number }>(
        `/api/lottery/admin/logs?${qs.toString()}`,
      );
      return { logs: r?.logs ?? [], total: r?.total ?? r?.logs?.length ?? 0 };
    },
    { logs: [], total: 0 },
    "adminGetLotteryLogs",
  );
}

export async function adminGetLotterySettings(): Promise<LotterySettings> {
  return safeCall(
    async () => {
      const r = await apiGetAsStaff<{
        success: boolean;
        daily_free_spins: number;
        enabled: boolean;
        probability_notice?: string | null;
        order_completed_spin_enabled?: boolean;
        order_completed_spin_amount?: number;
      }>('/api/lottery/admin/settings');
      return {
        daily_free_spins: r?.daily_free_spins ?? 1,
        enabled: r?.enabled !== false,
        probability_notice: r?.probability_notice ?? null,
        order_completed_spin_enabled: r?.order_completed_spin_enabled === true,
        order_completed_spin_amount: Math.max(0, Math.floor(Number(r?.order_completed_spin_amount) || 0)),
      };
    },
    {
      daily_free_spins: 1,
      enabled: false,
      probability_notice: null,
      order_completed_spin_enabled: false,
      order_completed_spin_amount: 1,
    },
    "adminGetLotterySettings",
  );
}

export async function adminSaveLotterySettings(settings: LotterySettings): Promise<void> {
  await apiPostAsStaff('/api/lottery/admin/settings', settings);
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
  const q = encodeURIComponent(tenantId);
  return safeCall(
    async () => {
      const r = await apiGetAsStaff<{
        success?: boolean;
        nicknames_raw?: string;
        pool_count?: number;
        nickname_tokens_count?: number;
        source?: SimFakeSettingsSource;
        updated_at?: string | null;
      }>(`/api/lottery/admin/sim-fake-settings?tenant_id=${q}`);
      return {
        nicknames_raw: r?.nicknames_raw ?? '',
        pool_count: typeof r?.pool_count === 'number' ? r.pool_count : 100,
        nickname_tokens_count: typeof r?.nickname_tokens_count === 'number' ? r.nickname_tokens_count : undefined,
        source: r?.source === 'custom' ? 'custom' : 'builtin',
        updated_at: r?.updated_at ?? null,
      };
    },
    { nicknames_raw: '', pool_count: 100, source: 'builtin' as const, updated_at: null },
    'adminGetSimFakeSettings',
  );
}

export async function adminSaveSimFakeSettings(
  tenantId: string,
  nicknames_raw: string,
): Promise<{ source: SimFakeSettingsSource; pool_count: number }> {
  const q = encodeURIComponent(tenantId);
  const r = await apiPostAsStaff<{
    success?: boolean;
    source?: SimFakeSettingsSource;
    pool_count?: number;
  }>(`/api/lottery/admin/sim-fake-settings?tenant_id=${q}`, { nicknames_raw });
  return {
    source: r?.source === 'builtin' ? 'builtin' : 'custom',
    pool_count: typeof r?.pool_count === 'number' ? r.pool_count : 100,
  };
}

export interface AdminSimulationSettings {
  retention_days: number;
  /** 每小时假用户模拟抽奖次数（≤100，0 表示本小时不跑假抽奖） */
  cron_fake_draws_per_hour: number;
  /** 进入会员端滚动喜讯的名次区间（按奖品排序 1=最高） */
  sim_feed_rank_min: number;
  sim_feed_rank_max: number;
  enable_cron_fake_feed: boolean;
  /** 模拟执行锚点（ISO）；存在时表示按该时刻起每小时一轮，而非上海整点 */
  cron_fake_anchor_at?: string | null;
}

export async function adminGetSimulationSettings(tenantId: string): Promise<AdminSimulationSettings> {
  const q = encodeURIComponent(tenantId);
  return safeCall(
    async () => {
      const r = await apiGetAsStaff<AdminSimulationSettings & { success?: boolean }>(
        `/api/lottery/admin/simulation-settings?tenant_id=${q}`,
      );
      return {
        retention_days: Math.max(1, Number(r?.retention_days ?? 3)),
        cron_fake_draws_per_hour: Math.max(0, Math.min(100, Number(r?.cron_fake_draws_per_hour ?? 20))),
        sim_feed_rank_min: Math.max(1, Math.min(8, Number(r?.sim_feed_rank_min ?? 1))),
        sim_feed_rank_max: Math.max(1, Math.min(8, Number(r?.sim_feed_rank_max ?? 8))),
        enable_cron_fake_feed: !!r?.enable_cron_fake_feed,
        cron_fake_anchor_at: r?.cron_fake_anchor_at ?? null,
      };
    },
    {
      retention_days: 3,
      cron_fake_draws_per_hour: 20,
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
  const q = encodeURIComponent(tenantId);
  const r = await apiPostAsStaff<AdminSimulationSettings & { success?: boolean }>(
    `/api/lottery/admin/simulation-settings?tenant_id=${q}`,
    body,
  );
  return {
    retention_days: Math.max(1, Number(r?.retention_days ?? 3)),
    cron_fake_draws_per_hour: Math.max(0, Math.min(100, Number(r?.cron_fake_draws_per_hour ?? 20))),
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
  const q = encodeURIComponent(tenantId);
  return safeCall(
    async () => {
      const r = await apiGetAsStaff<{ success?: boolean; rows?: AdminSimulationFeedRow[] }>(
        `/api/lottery/admin/simulation-feed?tenant_id=${q}&limit=${limit}`,
      );
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
  const q = encodeURIComponent(tenantId);
  return safeCall(
    async () => {
      const r = await apiGetAsStaff<{ success?: boolean; rows?: AdminSimulationHourRunRow[] }>(
        `/api/lottery/admin/simulation-hour-runs?tenant_id=${q}&limit=${limit}`,
      );
      return Array.isArray(r?.rows) ? r.rows : [];
    },
    [],
    "adminListSimulationHourRuns",
  );
}

export async function adminStartSimulationCron(tenantId: string): Promise<{ cron_fake_anchor_at: string | null }> {
  const q = encodeURIComponent(tenantId);
  const r = await apiPostAsStaff<{ success?: boolean; cron_fake_anchor_at?: string | null }>(
    `/api/lottery/admin/simulation-cron-start?tenant_id=${q}`,
    {},
  );
  return { cron_fake_anchor_at: r?.cron_fake_anchor_at ?? null };
}
