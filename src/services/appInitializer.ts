// ============= App Initializer Service =============
// 应用启动时的初始化服务 - 预加载关键配置到缓存
// 确保所有业务逻辑使用的配置在启动时已就绪
// 
// ============= 冷启动保障 =============
// 此服务确保系统在以下场景下正常运行：
// 1. 全新账号 / 空数据库 - 自动生成所有必要的系统配置
// 2. 新部署 / 新环境 - 不依赖人工创建数据
// 3. 0业务数据 - 所有页面和功能正常运行，统计返回0
//
// 初始化链：
// ensureDefaultSharedData() → 确保 shared_data_store 有默认配置
// initializePointsSettings() → 确保积分设置已加载
// initializeCacheManager() → 启动 Realtime 缓存订阅
//
// 所有配置的默认值定义在 sharedDataService.ts 的 DEFAULT_SHARED_DATA

import { initializePointsSettings } from '@/stores/pointsSettingsStore';
import { initializeCacheManager } from '@/services/cacheManager';
import { ensureDefaultSharedData, loadSharedData } from '@/services/sharedDataService';
import { initializeCopySettings } from '@/components/CopySettingsTab';

let initialized = false;
let initPromise: Promise<void> | null = null;

/**
 * 初始化应用
 * 确保只执行一次，多次调用返回同一个 Promise
 * 
 * 冷启动保障：
 * - ensureDefaultSharedData: 检测并插入缺失的系统配置
 * - initializePointsSettings: 加载积分规则（带默认值回退）
 * - initializeCacheManager: 启动实时同步
 */
export async function initializeApp(): Promise<void> {
  if (initialized) return;
  if (initPromise) return initPromise;
  
  initPromise = performInitialization();
  await initPromise;
  initialized = true;
}

async function performInitialization(): Promise<void> {
  console.log('[AppInitializer] Starting application initialization...');
  const startTime = Date.now();
  
  try {
    // 并行初始化所有关键服务
    await Promise.all([
      // 1. 确保默认共享数据存在（冷启动支持）
      // 这会检查 shared_data_store 表，自动插入缺失的配置
      ensureDefaultSharedData(),
      
      // 2. 预加载积分设置到缓存
      // 如果数据库没有配置，使用 DEFAULT_SETTINGS
      initializePointsSettings(),
      
      // 3. 预加载复制设置到缓存
      // 确保订单提交时能获取正确的模板设置
      initializeCopySettings(),
      
      // 4. 预加载BTC价格设置到缓存
      // 避免汇率计算页面加载时显示硬编码默认值
      loadSharedData('btcPriceSettings'),
    ]);
    
    // 3. 初始化缓存管理器（设置 Realtime 订阅）
    // 监听核心表变更，自动失效缓存
    initializeCacheManager();
    
    const duration = Date.now() - startTime;
    console.log(`[AppInitializer] Initialization complete in ${duration}ms`);
  } catch (error) {
    console.error('[AppInitializer] Initialization failed:', error);
    // 不抛出错误，允许应用继续运行（使用默认值）
    // 这确保即使数据库连接失败，应用也不会崩溃
  }
}

/**
 * 检查应用是否已初始化
 */
export function isAppInitialized(): boolean {
  return initialized;
}

/**
 * 等待应用初始化完成
 */
export async function waitForInitialization(): Promise<void> {
  if (initialized) return;
  if (initPromise) {
    await initPromise;
  } else {
    await initializeApp();
  }
}
