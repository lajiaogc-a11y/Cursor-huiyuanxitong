/**
 * Admin 模块类型 - 数据管理/归档
 */
export interface BulkDeleteSelections {
  orders: boolean;
  recycleActivityDataOnOrderDelete?: boolean;
  reports?: { employee: boolean; card: boolean; vendor: boolean; daily: boolean };
  members?: {
    memberManagement: boolean;
    /** @deprecated 兼容旧前端；为 true 时等同勾选下列全部活动项 */
    activityData?: boolean;
    /** 抽奖流水 lottery_logs +（未整表删积分时）抽奖类 points_ledger */
    activityLotteryLogs?: boolean;
    /** 签到流水 check_ins + source=check_in 的 spin_credits */
    activityCheckIns?: boolean;
    activitySpinOrder?: boolean;
    activitySpinShare?: boolean;
    activitySpinInvite?: boolean;
    /** 其余 source 的 spin_credits */
    activitySpinOther?: boolean;
    /** member_activity / 原「活动数据」整表清空（与 preserveActivityData 配合） */
    activityMemberSummary?: boolean;
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
