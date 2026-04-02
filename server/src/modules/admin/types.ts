/**
 * Admin 模块类型 - 数据管理/归档
 */
export interface BulkDeleteSelections {
  orders: boolean;
  recycleActivityDataOnOrderDelete?: boolean;
  reports?: { employee: boolean; card: boolean; vendor: boolean; daily: boolean };
  members?: {
    memberManagement: boolean;
    activityData: boolean;
    activityGift: boolean;
    pointsLedger: boolean;
  };
  shiftData?: { shiftHandovers: boolean; shiftReceivers: boolean };
  merchantSettlement?: { balanceChangeLogs: boolean; initialBalances: boolean };
  referralRelations?: boolean;
  auditRecords?: boolean;
  operationLogs?: boolean;
  loginLogs?: boolean;
  knowledgeData?: { categories: boolean; articles: boolean };
  preserveActivityData?: boolean;
}

export interface BulkDeleteRequest {
  password: string;
  retainMonths: number;
  deleteSelections: BulkDeleteSelections;
}

export interface BulkDeleteResult {
  success: boolean;
  deletedSummary: { table: string; count: number }[];
  totalCount: number;
  errors: string[];
  /** 非致命提示（如活动回滚部分失败） */
  warnings?: string[];
}
