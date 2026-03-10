// System Settings Store - 系统设置管理
// 所有数据存储在线上数据库，不使用本地存储

import { loadSharedData, saveSharedData, saveSharedDataSync, getSharedDataSync } from '@/services/sharedDataService';
import { CurrencyCode } from "@/config/currencies";

// ============= Gift Distribution Settings =============

export interface GiftDistributionSettings {
  distributionRatio: number;  // 0-100
  enabled: boolean;
}

const DEFAULT_GIFT_DISTRIBUTION: GiftDistributionSettings = {
  distributionRatio: 100,
  enabled: false,
};

// 内存缓存
let giftDistributionCache: GiftDistributionSettings | null = null;

// 同步获取（优先使用缓存）
export function getGiftDistributionSettings(): GiftDistributionSettings {
  if (giftDistributionCache) {
    loadSharedData<GiftDistributionSettings>('giftDistributionSettings')
      .then(data => { if (data) giftDistributionCache = data; })
      .catch(console.error);
    return giftDistributionCache;
  }
  
  loadSharedData<GiftDistributionSettings>('giftDistributionSettings')
    .then(data => { if (data) giftDistributionCache = data; })
    .catch(console.error);
  
  return DEFAULT_GIFT_DISTRIBUTION;
}

// 保存设置
export function saveGiftDistributionSettings(settings: GiftDistributionSettings): void {
  giftDistributionCache = settings;
  saveSharedDataSync('giftDistributionSettings', settings);
}

// 异步版本
export async function getGiftDistributionSettingsAsync(): Promise<GiftDistributionSettings> {
  const data = await loadSharedData<GiftDistributionSettings>('giftDistributionSettings');
  if (data) {
    giftDistributionCache = data;
    return data;
  }
  return DEFAULT_GIFT_DISTRIBUTION;
}

export async function saveGiftDistributionSettingsAsync(
  settings: GiftDistributionSettings
): Promise<boolean> {
  giftDistributionCache = settings;
  return await saveSharedData('giftDistributionSettings', settings);
}

// ============= Employee Manual Gift Ratios =============

export interface EmployeeManualGiftRatios {
  [employeeId: string]: number;  // 0-100 的百分比值
}

let manualGiftRatiosCache: EmployeeManualGiftRatios | null = null;

// 同步获取（优先使用缓存）
export function getEmployeeManualGiftRatios(): EmployeeManualGiftRatios {
  if (manualGiftRatiosCache) {
    loadSharedData<EmployeeManualGiftRatios>('employeeManualGiftRatios')
      .then(data => { if (data) manualGiftRatiosCache = data; })
      .catch(console.error);
    return manualGiftRatiosCache;
  }
  
  loadSharedData<EmployeeManualGiftRatios>('employeeManualGiftRatios')
    .then(data => { if (data) manualGiftRatiosCache = data; })
    .catch(console.error);
  
  return {};
}

// 异步获取
export async function getEmployeeManualGiftRatiosAsync(): Promise<EmployeeManualGiftRatios> {
  const data = await loadSharedData<EmployeeManualGiftRatios>('employeeManualGiftRatios');
  if (data) {
    manualGiftRatiosCache = data;
    return data;
  }
  return {};
}

// 保存设置
export async function saveEmployeeManualGiftRatiosAsync(
  ratios: EmployeeManualGiftRatios
): Promise<boolean> {
  manualGiftRatiosCache = ratios;
  return await saveSharedData('employeeManualGiftRatios', ratios);
}

// 更新单个员工的手动占比
export async function updateEmployeeManualGiftRatio(
  employeeId: string, 
  ratio: number
): Promise<boolean> {
  const current = await getEmployeeManualGiftRatiosAsync();
  const updated = { ...current, [employeeId]: ratio };
  return await saveEmployeeManualGiftRatiosAsync(updated);
}

// ============= Fee Settings =============

export interface FeeSettings {
  nairaThreshold: number;
  nairaFeeAbove: number;
  nairaFeeBelow: number;
  cediThreshold: number;
  cediFeeAbove: number;
  cediFeeBelow: number;
  usdtExchangeRate?: number; // USDT汇率，用于每日报表计算（非手续费）
}

export interface TrxSettings {
  trxRate: number;
  trxQuantity: number;
  lastUpdated: string;
}

const DEFAULT_FEE_SETTINGS: FeeSettings = {
  nairaThreshold: 30000,
  nairaFeeAbove: 0,
  nairaFeeBelow: 3,
  cediThreshold: 500,
  cediFeeAbove: 0,
  cediFeeBelow: 3,
  usdtExchangeRate: 7.2, // 默认USDT汇率
};

const DEFAULT_TRX_SETTINGS: TrxSettings = {
  trxRate: 0.14,
  trxQuantity: 0,
  lastUpdated: new Date().toISOString(),
};

// ============= Normalization Helpers =============

const numOr = (value: unknown, fallback: number) => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const normalizeFeeSettings = (input?: Partial<FeeSettings> | null): FeeSettings => ({
  nairaThreshold: numOr(input?.nairaThreshold, DEFAULT_FEE_SETTINGS.nairaThreshold),
  nairaFeeAbove: numOr(input?.nairaFeeAbove, DEFAULT_FEE_SETTINGS.nairaFeeAbove),
  nairaFeeBelow: numOr(input?.nairaFeeBelow, DEFAULT_FEE_SETTINGS.nairaFeeBelow),
  cediThreshold: numOr(input?.cediThreshold, DEFAULT_FEE_SETTINGS.cediThreshold),
  cediFeeAbove: numOr(input?.cediFeeAbove, DEFAULT_FEE_SETTINGS.cediFeeAbove),
  cediFeeBelow: numOr(input?.cediFeeBelow, DEFAULT_FEE_SETTINGS.cediFeeBelow),
  usdtExchangeRate: numOr(input?.usdtExchangeRate, DEFAULT_FEE_SETTINGS.usdtExchangeRate ?? 0),
});

const normalizeTrxSettings = (input?: Partial<TrxSettings> | null): TrxSettings => ({
  trxRate: numOr(input?.trxRate, DEFAULT_TRX_SETTINGS.trxRate),
  trxQuantity: numOr(input?.trxQuantity, DEFAULT_TRX_SETTINGS.trxQuantity),
  lastUpdated: input?.lastUpdated || DEFAULT_TRX_SETTINGS.lastUpdated,
});

// 内存缓存
let feeSettingsCache: FeeSettings | null = null;
let trxSettingsCache: TrxSettings | null = null;
let usdtFeeCache: number | null = null;
let workMemosCache: WorkMemo[] | null = null;
let countriesCache: Country[] | null = null;
let rateSettingEntriesCache: RateSettingEntry[] | null = null;

// 获取费用设置（同步版本，使用缓存）
export function getFeeSettings(): FeeSettings {
  if (feeSettingsCache) {
    // 异步刷新缓存（合并默认值，保证字段完整）
    loadSharedData<FeeSettings>('feeSettings')
      .then((data) => {
        if (data) feeSettingsCache = normalizeFeeSettings(data);
      })
      .catch(console.error);

    return normalizeFeeSettings(feeSettingsCache);
  }

  // 初次加载使用默认值，同时异步加载
  loadSharedData<FeeSettings>('feeSettings')
    .then((data) => {
      if (data) feeSettingsCache = normalizeFeeSettings(data);
    })
    .catch(console.error);

  return DEFAULT_FEE_SETTINGS;
}

// 保存费用设置
export function saveFeeSettings(settings: FeeSettings): void {
  const normalized = normalizeFeeSettings(settings);
  feeSettingsCache = normalized;
  saveSharedDataSync('feeSettings', normalized);
}

// 获取 USDT 费用
export function getUsdtFee(): number {
  if (usdtFeeCache !== null) {
    loadSharedData<number>('systemSettings_usdtFee').then(data => {
      if (data !== null) usdtFeeCache = data;
    }).catch(console.error);
    return usdtFeeCache;
  }
  
  loadSharedData<number>('systemSettings_usdtFee').then(data => {
    if (data !== null) usdtFeeCache = data;
  }).catch(console.error);
  
  return 0;
}

// 保存 USDT 费用
export function saveUsdtFee(fee: number): void {
  usdtFeeCache = fee;
  saveSharedDataSync('systemSettings_usdtFee', fee);
}

// 获取 TRX 设置
export function getTrxSettings(): TrxSettings {
  if (trxSettingsCache) {
    loadSharedData<TrxSettings>('trxSettings')
      .then((data) => {
        if (data) trxSettingsCache = normalizeTrxSettings(data);
      })
      .catch(console.error);

    return normalizeTrxSettings(trxSettingsCache);
  }

  loadSharedData<TrxSettings>('trxSettings')
    .then((data) => {
      if (data) trxSettingsCache = normalizeTrxSettings(data);
    })
    .catch(console.error);

  return DEFAULT_TRX_SETTINGS;
}

// 保存 TRX 设置
export function saveTrxSettings(settings: TrxSettings): void {
  const normalized = normalizeTrxSettings(settings);
  trxSettingsCache = normalized;
  saveSharedDataSync('trxSettings', normalized);
}

// ============= Work Memos =============

export interface WorkMemo {
  id: string;
  phoneNumber: string;
  remark1: string;
  remark2: string;
  createdAt: string;
  reminderTime: string;
  reminderOffset: number;
  isRead: boolean;
  isTriggered: boolean;
  readAt?: string; // 标记已读的时间戳
}

// ============= Memo Settings =============

export interface MemoSettings {
  autoDeleteEnabled: boolean;
  autoDeleteHours: number; // 已读后多少小时自动删除
}

const DEFAULT_MEMO_SETTINGS: MemoSettings = {
  autoDeleteEnabled: true,
  autoDeleteHours: 72, // 默认72小时后自动删除已读备忘
};

let memoSettingsCache: MemoSettings | null = null;

export function getMemoSettings(): MemoSettings {
  if (memoSettingsCache) {
    loadSharedData<MemoSettings>('memoSettings').then(data => {
      if (data) memoSettingsCache = data;
    }).catch(console.error);
    return memoSettingsCache;
  }
  
  loadSharedData<MemoSettings>('memoSettings').then(data => {
    if (data) memoSettingsCache = data;
  }).catch(console.error);
  
  return DEFAULT_MEMO_SETTINGS;
}

export function saveMemoSettings(settings: MemoSettings): void {
  memoSettingsCache = settings;
  saveSharedDataSync('memoSettings', settings);
}

export async function getMemoSettingsAsync(): Promise<MemoSettings> {
  const data = await loadSharedData<MemoSettings>('memoSettings');
  if (data) {
    memoSettingsCache = data;
    return data;
  }
  return DEFAULT_MEMO_SETTINGS;
}

export async function saveMemoSettingsAsync(settings: MemoSettings): Promise<boolean> {
  memoSettingsCache = settings;
  return await saveSharedData('memoSettings', settings);
}

// ============= Work Memo Functions =============

export function getWorkMemos(): WorkMemo[] {
  if (workMemosCache) {
    loadSharedData<WorkMemo[]>('workMemos').then(data => {
      if (data) workMemosCache = data;
    }).catch(console.error);
    return workMemosCache;
  }
  
  loadSharedData<WorkMemo[]>('workMemos').then(data => {
    if (data) workMemosCache = data;
  }).catch(console.error);
  
  return [];
}

export function saveWorkMemos(memos: WorkMemo[]): void {
  workMemosCache = memos;
  saveSharedDataSync('workMemos', memos);
}

export function addWorkMemo(memo: Omit<WorkMemo, 'id' | 'createdAt' | 'isRead' | 'isTriggered' | 'readAt'>): WorkMemo {
  const memos = getWorkMemos();
  const newMemo: WorkMemo = {
    ...memo,
    id: generateId(),
    createdAt: new Date().toISOString(),
    isRead: false,
    isTriggered: false,
  };
  memos.push(newMemo);
  saveWorkMemos(memos);
  return newMemo;
}

export function updateWorkMemo(memoId: string, updates: Partial<WorkMemo>): WorkMemo | null {
  const memos = getWorkMemos();
  const index = memos.findIndex(m => m.id === memoId);
  if (index !== -1) {
    memos[index] = { ...memos[index], ...updates };
    saveWorkMemos(memos);
    return memos[index];
  }
  return null;
}

export function markMemoAsRead(memoId: string): void {
  const memos = getWorkMemos();
  const memo = memos.find(m => m.id === memoId);
  if (memo) {
    memo.isRead = true;
    memo.readAt = new Date().toISOString(); // 记录已读时间
    saveWorkMemos(memos);
  }
}

export function deleteMemo(memoId: string): void {
  const memos = getWorkMemos().filter(m => m.id !== memoId);
  saveWorkMemos(memos);
}

export function getUnreadMemoCount(): number {
  const memos = getWorkMemos();
  const now = new Date();
  return memos.filter(memo => {
    if (memo.isRead) return false;
    const reminderTime = new Date(memo.reminderTime);
    return reminderTime <= now;
  }).length;
}

/**
 * 清理已读且超过保留时间的备忘录
 * @returns 被删除的备忘数量
 */
export function cleanupExpiredMemos(): number {
  const settings = getMemoSettings();
  if (!settings.autoDeleteEnabled) return 0;
  
  const memos = getWorkMemos();
  const now = new Date();
  const cutoffMs = settings.autoDeleteHours * 60 * 60 * 1000;
  
  const remainingMemos = memos.filter(memo => {
    // 未读的备忘不删除
    if (!memo.isRead) return true;
    
    // 没有 readAt 的已读备忘，使用兼容逻辑（不删除或使用 createdAt）
    if (!memo.readAt) return true;
    
    const readTime = new Date(memo.readAt);
    const elapsed = now.getTime() - readTime.getTime();
    
    // 如果已读时间超过设定的保留时间，则删除
    return elapsed < cutoffMs;
  });
  
  const deletedCount = memos.length - remainingMemos.length;
  
  if (deletedCount > 0) {
    saveWorkMemos(remainingMemos);
    console.log(`[MemoCleanup] Deleted ${deletedCount} expired read memos`);
  }
  
  return deletedCount;
}

// ============= Member Code Generation =============

export function generateMemberId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 7; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// ============= Helper Functions =============

function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}


// ============= Country Management =============

export interface Country {
  id: string;
  name: string;
  remark?: string;
}

export function getCountries(): Country[] {
  if (countriesCache) {
    loadSharedData<Country[]>('countries').then(data => {
      if (data) countriesCache = data;
    }).catch(console.error);
    return countriesCache;
  }
  
  loadSharedData<Country[]>('countries').then(data => {
    if (data) countriesCache = data;
  }).catch(console.error);
  
  return [];
}

export function saveCountries(countries: Country[]): void {
  countriesCache = countries;
  saveSharedDataSync('countries', countries);
}

export function addCountry(name: string, remark?: string): Country {
  const countries = getCountries();
  const newCountry: Country = {
    id: generateId(),
    name,
    remark: remark || '',
  };
  countries.push(newCountry);
  saveCountries(countries);
  return newCountry;
}

export function updateCountry(id: string, name: string, remark?: string): void {
  const countries = getCountries();
  const country = countries.find(c => c.id === id);
  if (country) {
    country.name = name;
    if (remark !== undefined) {
      country.remark = remark;
    }
    saveCountries(countries);
  }
}

export function deleteCountry(id: string): void {
  const countries = getCountries().filter(c => c.id !== id);
  saveCountries(countries);
}

// ============= Country Management Async (Save-First Pattern) =============
// ⚠️ 推荐使用这些异步版本，确保先保存到数据库再更新UI

/**
 * 异步保存国家列表，返回是否成功
 * 使用 save-first 模式：先写数据库，成功后再更新缓存
 */
export async function saveCountriesAsync(countries: Country[]): Promise<boolean> {
  const success = await saveSharedData('countries', countries);
  if (success) {
    countriesCache = countries;
  }
  return success;
}

/**
 * 异步添加国家，返回新国家对象或null（失败时）
 */
export async function addCountryAsync(name: string, remark?: string): Promise<Country | null> {
  // 先从数据库获取最新数据，避免覆盖其他用户的修改
  const freshData = await loadSharedData<Country[]>('countries');
  const countries = freshData || [];
  
  const newCountry: Country = {
    id: generateId(),
    name,
    remark: remark || '',
  };
  countries.push(newCountry);
  
  const success = await saveCountriesAsync(countries);
  return success ? newCountry : null;
}

/**
 * 异步更新国家，返回是否成功
 */
export async function updateCountryAsync(id: string, name: string, remark?: string): Promise<boolean> {
  // 先从数据库获取最新数据
  const freshData = await loadSharedData<Country[]>('countries');
  const countries = freshData || [];
  
  const country = countries.find(c => c.id === id);
  if (!country) return false;
  
  country.name = name;
  if (remark !== undefined) {
    country.remark = remark;
  }
  
  return await saveCountriesAsync(countries);
}

/**
 * 异步删除国家，返回是否成功
 */
export async function deleteCountryAsync(id: string): Promise<boolean> {
  // 先从数据库获取最新数据
  const freshData = await loadSharedData<Country[]>('countries');
  const countries = (freshData || []).filter(c => c.id !== id);
  
  return await saveCountriesAsync(countries);
}

// ============= Rate Setting Entries =============

export interface RateSettingEntry {
  id: string;
  country: string;
  card: string;
  faceValue: number;
  currency: CurrencyCode;
  exchangeAmount: number;
  percentageRate: number;
  rate: number;
  profitRate: number;
}

export function getRateSettingEntries(): RateSettingEntry[] {
  if (rateSettingEntriesCache && Array.isArray(rateSettingEntriesCache)) {
    loadSharedData<RateSettingEntry[]>('rateSettingEntries').then(data => {
      if (data && Array.isArray(data)) rateSettingEntriesCache = data;
    }).catch(console.error);
    return rateSettingEntriesCache;
  }
  
  loadSharedData<RateSettingEntry[]>('rateSettingEntries').then(data => {
    if (data && Array.isArray(data)) rateSettingEntriesCache = data;
  }).catch(console.error);
  
  return [];
}

/** 从服务器加载汇率配置（租户内所有人可见，跨浏览器同步） */
export async function loadRateSettingEntriesAsync(): Promise<RateSettingEntry[]> {
  const data = await loadSharedData<RateSettingEntry[]>('rateSettingEntries');
  const entries = data && Array.isArray(data) ? data : [];
  rateSettingEntriesCache = entries;
  return entries;
}

/** 保存到服务器（必须等待完成，确保跨浏览器持久化） */
export async function saveRateSettingEntriesAsync(entries: RateSettingEntry[]): Promise<boolean> {
  rateSettingEntriesCache = entries;
  return await saveSharedData('rateSettingEntries', entries);
}

export function saveRateSettingEntries(entries: RateSettingEntry[]): void {
  rateSettingEntriesCache = entries;
  saveSharedDataSync('rateSettingEntries', entries);
}

/** 添加汇率配置并保存到服务器 */
export async function addRateSettingEntryAsync(entry: Omit<RateSettingEntry, 'id'>): Promise<RateSettingEntry> {
  const entries = getRateSettingEntries();
  const newEntry: RateSettingEntry = {
    ...entry,
    id: generateId(),
  };
  const next = [...entries, newEntry];
  const ok = await saveRateSettingEntriesAsync(next);
  if (!ok) throw new Error('保存失败');
  return newEntry;
}

export function addRateSettingEntry(entry: Omit<RateSettingEntry, 'id'>): RateSettingEntry {
  const entries = getRateSettingEntries();
  const newEntry: RateSettingEntry = {
    ...entry,
    id: generateId(),
  };
  entries.push(newEntry);
  saveRateSettingEntries(entries);
  return newEntry;
}

/** 更新汇率配置并保存到服务器 */
export async function updateRateSettingEntryAsync(id: string, updates: Partial<RateSettingEntry>): Promise<boolean> {
  const entries = getRateSettingEntries();
  const entry = entries.find(e => e.id === id);
  if (!entry) return false;
  Object.assign(entry, updates);
  return await saveRateSettingEntriesAsync(entries);
}

export function updateRateSettingEntry(id: string, updates: Partial<RateSettingEntry>): void {
  const entries = getRateSettingEntries();
  const entry = entries.find(e => e.id === id);
  if (entry) {
    Object.assign(entry, updates);
    saveRateSettingEntries(entries);
  }
}

/** 删除汇率配置并保存到服务器 */
export async function deleteRateSettingEntryAsync(id: string): Promise<boolean> {
  const entries = getRateSettingEntries().filter(e => e.id !== id);
  return await saveRateSettingEntriesAsync(entries);
}

export function deleteRateSettingEntry(id: string): void {
  const entries = getRateSettingEntries().filter(e => e.id !== id);
  saveRateSettingEntries(entries);
}

// ============= 海报表格列配置（与海报设置页表格一致）=============

export const POSTER_COLUMN_KEYS = [
  "country",
  "card",
  "faceValue",
  "exchangeAmount",
  "currency",
  "percentageRate",
  "rate",
  "profitRate",
] as const;

export type PosterColumnKey = (typeof POSTER_COLUMN_KEYS)[number];

const DEFAULT_POSTER_TABLE_COLUMNS: PosterColumnKey[] = [...POSTER_COLUMN_KEYS];
const POSTER_COLUMNS_STORAGE_KEY = "posterTableColumns";

let posterTableColumnsCache: PosterColumnKey[] | null = null;

function isValidPosterColumns(arr: unknown): arr is PosterColumnKey[] {
  return Array.isArray(arr) && arr.length > 0 && arr.every((k) => POSTER_COLUMN_KEYS.includes(k as PosterColumnKey));
}

export function getPosterTableColumns(): PosterColumnKey[] {
  if (posterTableColumnsCache && posterTableColumnsCache.length > 0) {
    loadSharedData<PosterColumnKey[]>("posterTableColumns")
      .then((data) => {
        if (data && isValidPosterColumns(data)) posterTableColumnsCache = data;
      })
      .catch(console.error);
    return posterTableColumnsCache;
  }
  // 优先从 localStorage 读取，避免刷新后默认全选
  try {
    const raw = localStorage.getItem(POSTER_COLUMNS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (isValidPosterColumns(parsed)) {
        posterTableColumnsCache = parsed;
        return parsed;
      }
    }
  } catch {
    /* ignore */
  }
  // 其次尝试共享数据缓存（同步）
  const fromShared = getSharedDataSync<PosterColumnKey[] | null>("posterTableColumns", null);
  if (fromShared && isValidPosterColumns(fromShared)) {
    posterTableColumnsCache = fromShared;
    return fromShared;
  }
  loadSharedData<PosterColumnKey[]>("posterTableColumns")
    .then((data) => {
      if (data && isValidPosterColumns(data)) posterTableColumnsCache = data;
      else posterTableColumnsCache = [...DEFAULT_POSTER_TABLE_COLUMNS];
    })
    .catch(console.error);
  return posterTableColumnsCache && posterTableColumnsCache.length > 0
    ? posterTableColumnsCache
    : [...DEFAULT_POSTER_TABLE_COLUMNS];
}

export function savePosterTableColumns(columns: PosterColumnKey[]): void {
  posterTableColumnsCache = columns.length > 0 ? columns : [...DEFAULT_POSTER_TABLE_COLUMNS];
  try {
    localStorage.setItem(POSTER_COLUMNS_STORAGE_KEY, JSON.stringify(posterTableColumnsCache));
  } catch {
    /* ignore */
  }
  saveSharedDataSync("posterTableColumns", posterTableColumnsCache);
}

// ============= 异步版本（推荐使用）=============

export async function getFeeSettingsAsync(): Promise<FeeSettings> {
  const data = await loadSharedData<FeeSettings>('feeSettings');
  if (data) {
    const normalized = normalizeFeeSettings(data);
    feeSettingsCache = normalized;
    return normalized;
  }
  return DEFAULT_FEE_SETTINGS;
}

export async function saveFeeSettingsAsync(settings: FeeSettings): Promise<boolean> {
  const normalized = normalizeFeeSettings(settings);
  feeSettingsCache = normalized;
  return await saveSharedData('feeSettings', normalized);
}

export async function getTrxSettingsAsync(): Promise<TrxSettings> {
  const data = await loadSharedData<TrxSettings>('trxSettings');
  if (data) {
    const normalized = normalizeTrxSettings(data);
    trxSettingsCache = normalized;
    return normalized;
  }
  return DEFAULT_TRX_SETTINGS;
}

export async function saveTrxSettingsAsync(settings: TrxSettings): Promise<boolean> {
  const normalized = normalizeTrxSettings(settings);
  trxSettingsCache = normalized;
  return await saveSharedData('trxSettings', normalized);
}

export async function getCountriesAsync(): Promise<Country[]> {
  const data = await loadSharedData<Country[]>('countries');
  if (data) {
    countriesCache = data;
    return data;
  }
  return [];
}

export async function getWorkMemosAsync(): Promise<WorkMemo[]> {
  const data = await loadSharedData<WorkMemo[]>('workMemos');
  if (data) {
    workMemosCache = data;
    return data;
  }
  return [];
}

// ============= 初始化函数 =============

// 预加载所有共享配置到缓存
export async function initializeSystemSettings(): Promise<void> {
  try {
    const [feeSettings, trxSettings, usdtFee, workMemos, countries, rateEntries, posterCols] = await Promise.all([
      loadSharedData<FeeSettings>('feeSettings'),
      loadSharedData<TrxSettings>('trxSettings'),
      loadSharedData<number>('systemSettings_usdtFee'),
      loadSharedData<WorkMemo[]>('workMemos'),
      loadSharedData<Country[]>('countries'),
      loadSharedData<RateSettingEntry[]>('rateSettingEntries'),
      loadSharedData<PosterColumnKey[]>('posterTableColumns'),
    ]);

    if (feeSettings) feeSettingsCache = normalizeFeeSettings(feeSettings);
    if (trxSettings) trxSettingsCache = normalizeTrxSettings(trxSettings);
    if (usdtFee !== null) usdtFeeCache = usdtFee;
    if (workMemos) workMemosCache = workMemos;
    if (countries) countriesCache = countries;
    if (rateEntries) rateSettingEntriesCache = rateEntries;
    if (posterCols && posterCols.length > 0) posterTableColumnsCache = posterCols;

    console.log('[SystemSettings] Initialized from database');
  } catch (error) {
    console.error('[SystemSettings] Failed to initialize:', error);
  }
}
