export type CleanupScope = "localStorage" | "indexedDB" | "cache" | "reactQuery" | "api";

export type CleanupRunStatus = "success" | "skipped" | "failed";

export type CleanupModuleResult = {
  moduleId: string;
  status: CleanupRunStatus;
  message?: string;
};

export type CleanupRunSummary = {
  success: CleanupModuleResult[];
  skipped: CleanupModuleResult[];
  failed: CleanupModuleResult[];
};

export type CleanupExecuteContext = {
  /** 预留：中止信号 */
  signal?: AbortSignal;
};

export type CleanupModuleDefinition = {
  id: string;
  /** 关联侧栏 navKey，用于占位与展示 */
  navKeys: string[];
  labelZh: string;
  labelEn: string;
  /** 是否出现在「一键全清」候选（数据管理页为 false） */
  participatesInFullClear: boolean;
  /** 是否允许用户勾选删除（受保护模块为 false） */
  allowDelete: boolean;
  /** 确认弹窗默认勾选 */
  defaultChecked: boolean;
  /** 保留数据 / 受保护说明 */
  isReservedData?: boolean;
  reservedReasonZh?: string;
  reservedReasonEn?: string;
  scopes: CleanupScope[];
  /** 是否仅为占位（尚未实现按模块拆分 API） */
  isPlaceholder?: boolean;
  execute?: (ctx: CleanupExecuteContext) => Promise<CleanupModuleResult>;
};
