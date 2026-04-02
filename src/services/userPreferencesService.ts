// ============= User Preferences Service =============
// 用户个人偏好（数据库持久化，无 localStorage）

import { createSyncedStorage, SYNC_KEYS } from "@/services/userDataSyncService";

export interface UserPreferences {
  merchantSettlement?: {
    vendorPageSize?: number;
    providerPageSize?: number;
  };
  columnVisibility?: Record<string, string[]>;
}

const storage = createSyncedStorage<UserPreferences>(SYNC_KEYS.USER_PREFERENCES, {});

let loaded = false;
let loadPromise: Promise<UserPreferences> | null = null;

export async function ensureUserPreferencesLoaded(): Promise<UserPreferences> {
  if (loaded) return storage.get();
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    await storage.syncFromDb();
    loaded = true;
    const prefs = storage.get();
    loadPromise = null;
    return prefs;
  })();

  return loadPromise;
}

export function getUserPreferencesSync(): UserPreferences {
  return storage.get();
}

export function getMerchantSettlementPageSizes(defaults?: {
  vendorPageSize: number;
  providerPageSize: number;
}): { vendorPageSize: number; providerPageSize: number } {
  const d = defaults ?? { vendorPageSize: 10, providerPageSize: 10 };
  const prefs = storage.get();
  return {
    vendorPageSize: prefs.merchantSettlement?.vendorPageSize ?? d.vendorPageSize,
    providerPageSize: prefs.merchantSettlement?.providerPageSize ?? d.providerPageSize,
  };
}

export async function setMerchantSettlementPageSizes(patch: Partial<{
  vendorPageSize: number;
  providerPageSize: number;
}>): Promise<void> {
  await ensureUserPreferencesLoaded();
  const current = storage.get();
  const next: UserPreferences = {
    ...current,
    merchantSettlement: {
      ...current.merchantSettlement,
      ...patch,
    },
  };
  await storage.set(next);
}

export function getColumnVisibilitySync(storageKey: string): string[] | undefined {
  return storage.get().columnVisibility?.[storageKey];
}

export async function setColumnVisibility(storageKey: string, columns: string[]): Promise<void> {
  await ensureUserPreferencesLoaded();
  const current = storage.get();
  const next: UserPreferences = {
    ...current,
    columnVisibility: {
      ...current.columnVisibility,
      [storageKey]: columns,
    },
  };
  await storage.set(next);
}
