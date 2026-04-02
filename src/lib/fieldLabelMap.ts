// ============= 字段名中文/英文翻译映射 =============
// 将数据库字段名和 camelCase 字段名翻译为用户友好的双语标签

import {
  resolveVendorName,
  resolveCardName,
  resolveProviderName,
  getEmployeeNameById,
  getActivityTypeLabelByValue,
} from '@/services/members/nameResolver';
import { formatBeijingTime } from '@/lib/beijingTime';
import { repairUtf8MisdecodedAsLatin1 } from '@/lib/utf8MojibakeRepair';

// ======= 应在展示时隐藏的内部字段 =======
export const HIDDEN_LOG_FIELDS = new Set([
  'dbId',
  'password_hash',
  'member_code_snapshot',
  'memberCodeSnapshot',
  'data_version',
  'dataVersion',
  'history',           // 商家结算内部操作历史
  'previousState',     // 撤回操作的内部状态快照
]);

// ======= 状态值翻译映射 =======
export const STATUS_MAP: Record<string, { zh: string; en: string }> = {
  completed: { zh: '已完成', en: 'Completed' },
  cancelled: { zh: '已取消', en: 'Cancelled' },
  pending: { zh: '待处理', en: 'Pending' },
  active: { zh: '活跃', en: 'Active' },
  inactive: { zh: '停用', en: 'Inactive' },
  added: { zh: '已添加', en: 'Added' },
  deducted: { zh: '已扣除', en: 'Deducted' },
  issued: { zh: '已发放', en: 'Issued' },
  reversed: { zh: '已撤销', en: 'Reversed' },
  approved: { zh: '已通过', en: 'Approved' },
  rejected: { zh: '已拒绝', en: 'Rejected' },
  none: { zh: '无', en: 'None' },
  disabled: { zh: '已禁用', en: 'Disabled' },
  enabled: { zh: '已启用', en: 'Enabled' },
  consumption: { zh: '消费', en: 'Consumption' },
  referral: { zh: '推荐', en: 'Referral' },
  auto: { zh: '自动', en: 'Auto' },
  manual: { zh: '手动', en: 'Manual' },
  mode1: { zh: '模式1', en: 'Mode 1' },
  mode2: { zh: '模式2', en: 'Mode 2' },
  create: { zh: '创建', en: 'Create' },
  update: { zh: '更新', en: 'Update' },
  delete: { zh: '删除', en: 'Delete' },
  restore: { zh: '恢复', en: 'Restore' },
  login: { zh: '登录', en: 'Login' },
};

// ======= 角色翻译映射 =======
const ROLE_MAP: Record<string, { zh: string; en: string }> = {
  admin: { zh: '管理员', en: 'Admin' },
  manager: { zh: '经理', en: 'Manager' },
  staff: { zh: '员工', en: 'Staff' },
  unknown: { zh: '未知', en: 'Unknown' },
};

// ======= UUID 检测 =======
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ======= UUID 解析字段分组 =======
const VENDOR_FIELDS = new Set(['vendor', 'card_merchant_id', 'cardMerchantId', 'vendor_id', 'vendorId']);
const CARD_FIELDS = new Set(['cardType', 'card_type', 'orderType', 'order_type']);
const PROVIDER_FIELDS = new Set(['paymentProvider', 'payment_provider_id', 'paymentProviderId', 'payment_agent', 'paymentAgent']);
const EMPLOYEE_FIELDS = new Set([
  'sales_user_id', 'salesUserId', 'creator_id', 'creatorId',
  'recorder_id', 'recorderId', 'submitter_id', 'submitterId',
  'reviewer_id', 'reviewerId', 'restored_by', 'restoredBy',
  'operator_id', 'operatorId', 'handover_employee_id',
  'changed_by', 'created_by',
]);
const MEMBER_FIELDS = new Set(['member_id', 'memberId']);
const GIFT_TYPE_FIELDS = new Set(['gift_type', 'giftType']);

export const FIELD_LABEL_MAP: Record<string, { zh: string; en: string }> = {
  // ======= 通用字段 =======
  id: { zh: 'ID', en: 'ID' },
  created_at: { zh: '创建时间', en: 'Created At' },
  createdAt: { zh: '创建时间', en: 'Created At' },
  updated_at: { zh: '更新时间', en: 'Updated At' },
  updatedAt: { zh: '更新时间', en: 'Updated At' },
  deleted_at: { zh: '删除时间', en: 'Deleted At' },
  deletedAt: { zh: '删除时间', en: 'Deleted At' },
  is_deleted: { zh: '是否已删除', en: 'Deleted' },
  isDeleted: { zh: '是否已删除', en: 'Deleted' },
  status: { zh: '状态', en: 'Status' },
  remark: { zh: '备注', en: 'Remark' },
  sort_order: { zh: '排序', en: 'Sort Order' },
  sortOrder: { zh: '排序', en: 'Sort Order' },
  
  // ======= 会员相关 =======
  phone_number: { zh: '手机号', en: 'Phone Number' },
  phoneNumber: { zh: '手机号', en: 'Phone Number' },
  member_code: { zh: '会员编码', en: 'Member Code' },
  memberCode: { zh: '会员编码', en: 'Member Code' },
  member_level: { zh: '会员等级', en: 'Member Level' },
  memberLevel: { zh: '会员等级', en: 'Member Level' },
  level: { zh: '等级', en: 'Level' },
  bank_card: { zh: '银行卡号', en: 'Bank Card' },
  bankCard: { zh: '银行卡号', en: 'Bank Card' },
  customer_feature: { zh: '客户特征', en: 'Customer Feature' },
  customerFeature: { zh: '客户特征', en: 'Customer Feature' },
  tradeFeature: { zh: '交易特征', en: 'Trade Feature' },
  source_id: { zh: '来源', en: 'Source' },
  sourceId: { zh: '来源', en: 'Source' },
  source: { zh: '来源', en: 'Source' },
  common_cards: { zh: '常用卡片', en: 'Common Cards' },
  commonCards: { zh: '常用卡片', en: 'Common Cards' },
  currency_preferences: { zh: '货币偏好', en: 'Currency Preferences' },
  currencyPreferences: { zh: '货币偏好', en: 'Currency Preferences' },
  preferredCurrency: { zh: '偏好货币', en: 'Preferred Currency' },
  creator_id: { zh: '创建人', en: 'Creator' },
  creatorId: { zh: '创建人', en: 'Creator' },
  recorder_id: { zh: '录入人', en: 'Recorder' },
  recorderId: { zh: '录入人', en: 'Recorder' },
  member_id: { zh: '会员', en: 'Member' },
  memberId: { zh: '会员', en: 'Member' },
  
  // ======= 订单相关 =======
  order_number: { zh: '订单号', en: 'Order Number' },
  orderNumber: { zh: '订单号', en: 'Order Number' },
  order_type: { zh: '卡片类型', en: 'Card Type' },
  orderType: { zh: '卡片类型', en: 'Card Type' },
  amount: { zh: '金额', en: 'Amount' },
  currency: { zh: '货币', en: 'Currency' },
  demandCurrency: { zh: '需求货币', en: 'Demand Currency' },
  exchange_rate: { zh: '汇率', en: 'Exchange Rate' },
  exchangeRate: { zh: '汇率', en: 'Exchange Rate' },
  foreign_rate: { zh: '外币汇率', en: 'Foreign Rate' },
  foreignRate: { zh: '外币汇率', en: 'Foreign Rate' },
  fee: { zh: '手续费', en: 'Fee' },
  actual_payment: { zh: '实付金额', en: 'Actual Payment' },
  actualPayment: { zh: '实付金额', en: 'Actual Payment' },
  actualPaid: { zh: '实付金额', en: 'Actual Payment' },
  payment_value: { zh: '代付金额', en: 'Payment Value' },
  paymentValue: { zh: '代付金额', en: 'Payment Value' },
  card_value: { zh: '卡面值', en: 'Card Value' },
  cardValue: { zh: '卡面值', en: 'Card Value' },
  cardWorth: { zh: '卡面值', en: 'Card Value' },
  profit: { zh: '利润', en: 'Profit' },
  profit_usdt: { zh: 'USDT利润', en: 'USDT Profit' },
  profitUsdt: { zh: 'USDT利润', en: 'USDT Profit' },
  profit_ngn: { zh: 'NGN利润', en: 'NGN Profit' },
  profitNgn: { zh: 'NGN利润', en: 'NGN Profit' },
  profit_rate: { zh: '利润率', en: 'Profit Rate' },
  profitRate: { zh: '利润率', en: 'Profit Rate' },
  order_points: { zh: '订单积分', en: 'Order Points' },
  orderPoints: { zh: '订单积分', en: 'Order Points' },
  points_status: { zh: '积分状态', en: 'Points Status' },
  pointsStatus: { zh: '积分状态', en: 'Points Status' },
  completed_at: { zh: '完成时间', en: 'Completed At' },
  completedAt: { zh: '完成时间', en: 'Completed At' },
  vendor_id: { zh: '卡商', en: 'Vendor' },
  vendorId: { zh: '卡商', en: 'Vendor' },
  vendor: { zh: '卡商', en: 'Vendor' },
  card_merchant_id: { zh: '卡商', en: 'Card Merchant' },
  cardMerchantId: { zh: '卡商', en: 'Card Merchant' },
  cardType: { zh: '卡片类型', en: 'Card Type' },
  card_type: { zh: '卡片类型', en: 'Card Type' },
  cardRate: { zh: '卡汇率', en: 'Card Rate' },
  card_rate: { zh: '卡汇率', en: 'Card Rate' },
  sales_user_id: { zh: '业务员', en: 'Sales Person' },
  salesUserId: { zh: '业务员', en: 'Sales Person' },
  salesPerson: { zh: '业务员', en: 'Sales Person' },
  member_code_snapshot: { zh: '会员编码快照', en: 'Member Code Snapshot' },
  memberCodeSnapshot: { zh: '会员编码快照', en: 'Member Code Snapshot' },
  paymentProvider: { zh: '代付商家', en: 'Payment Provider' },
  payment_provider_id: { zh: '代付商家', en: 'Payment Provider' },
  
  // ======= 员工相关 =======
  username: { zh: '用户名', en: 'Username' },
  real_name: { zh: '真实姓名', en: 'Real Name' },
  realName: { zh: '真实姓名', en: 'Real Name' },
  role: { zh: '角色', en: 'Role' },
  password_hash: { zh: '密码', en: 'Password' },
  is_super_admin: { zh: '超级管理员', en: 'Super Admin' },
  isSuperAdmin: { zh: '超级管理员', en: 'Super Admin' },
  visible: { zh: '是否可见', en: 'Visible' },
  operator_id: { zh: '操作人', en: 'Operator' },
  operatorId: { zh: '操作人', en: 'Operator' },
  
  // ======= 活动赠送 =======
  gift_type: { zh: '赠送类型', en: 'Gift Type' },
  giftType: { zh: '赠送类型', en: 'Gift Type' },
  gift_value: { zh: '赠送金额', en: 'Gift Value' },
  giftValue: { zh: '赠送金额', en: 'Gift Value' },
  payment_agent: { zh: '代付商家', en: 'Payment Agent' },
  paymentAgent: { zh: '代付商家', en: 'Payment Agent' },
  rate: { zh: '汇率', en: 'Rate' },
  
  // ======= 推荐关系 =======
  referrer_phone: { zh: '推荐人手机', en: 'Referrer Phone' },
  referrerPhone: { zh: '推荐人手机', en: 'Referrer Phone' },
  referrer_member_code: { zh: '推荐人编码', en: 'Referrer Code' },
  referrerMemberCode: { zh: '推荐人编码', en: 'Referrer Code' },
  referee_phone: { zh: '被推荐人手机', en: 'Referee Phone' },
  refereePhone: { zh: '被推荐人手机', en: 'Referee Phone' },
  referee_member_code: { zh: '被推荐人编码', en: 'Referee Code' },
  refereeMemberCode: { zh: '被推荐人编码', en: 'Referee Code' },
  
  // ======= 积分相关 =======
  mode: { zh: '模式', en: 'Mode' },
  ghsToUsdRate: { zh: 'GHS转USD汇率', en: 'GHS to USD Rate' },
  ghs_to_usd_rate: { zh: 'GHS转USD汇率', en: 'GHS to USD Rate' },
  ngnToUsdRate: { zh: 'NGN转USD汇率', en: 'NGN to USD Rate' },
  ngn_to_usd_rate: { zh: 'NGN转USD汇率', en: 'NGN to USD Rate' },
  usdToPointsRate: { zh: 'USD转积分比例', en: 'USD to Points Rate' },
  usd_to_points_rate: { zh: 'USD转积分比例', en: 'USD to Points Rate' },
  usdtCoefficient: { zh: 'USDT系数', en: 'USDT Coefficient' },
  usdt_coefficient: { zh: 'USDT系数', en: 'USDT Coefficient' },
  ghsFormulaMultiplier: { zh: 'GHS公式倍数', en: 'GHS Formula Multiplier' },
  ghs_formula_multiplier: { zh: 'GHS公式倍数', en: 'GHS Formula Multiplier' },
  ngnFormulaMultiplier: { zh: 'NGN公式倍数', en: 'NGN Formula Multiplier' },
  ngn_formula_multiplier: { zh: 'NGN公式倍数', en: 'NGN Formula Multiplier' },
  referralMode: { zh: '推荐模式', en: 'Referral Mode' },
  referral_mode: { zh: '推荐模式', en: 'Referral Mode' },
  referralMode1Enabled: { zh: '推荐模式1启用', en: 'Referral Mode 1 Enabled' },
  referral_mode1_enabled: { zh: '推荐模式1启用', en: 'Referral Mode 1 Enabled' },
  referralMode2Enabled: { zh: '推荐模式2启用', en: 'Referral Mode 2 Enabled' },
  referral_mode2_enabled: { zh: '推荐模式2启用', en: 'Referral Mode 2 Enabled' },
  lastAutoUpdate: { zh: '最后自动更新', en: 'Last Auto Update' },
  last_auto_update: { zh: '最后自动更新', en: 'Last Auto Update' },
  lastManualUpdate: { zh: '最后手动更新', en: 'Last Manual Update' },
  last_manual_update: { zh: '最后手动更新', en: 'Last Manual Update' },
  lastFetchedGhsRate: { zh: '最后获取GHS汇率', en: 'Last Fetched GHS Rate' },
  last_fetched_ghs_rate: { zh: '最后获取GHS汇率', en: 'Last Fetched GHS Rate' },
  lastFetchedNgnRate: { zh: '最后获取NGN汇率', en: 'Last Fetched NGN Rate' },
  last_fetched_ngn_rate: { zh: '最后获取NGN汇率', en: 'Last Fetched NGN Rate' },
  points_earned: { zh: '获得积分', en: 'Points Earned' },
  pointsEarned: { zh: '获得积分', en: 'Points Earned' },
  points_multiplier: { zh: '积分倍数', en: 'Points Multiplier' },
  pointsMultiplier: { zh: '积分倍数', en: 'Points Multiplier' },
  usd_amount: { zh: 'USD金额', en: 'USD Amount' },
  usdAmount: { zh: 'USD金额', en: 'USD Amount' },
  transaction_type: { zh: '交易类型', en: 'Transaction Type' },
  transactionType: { zh: '交易类型', en: 'Transaction Type' },
  
  // ======= 商家结算 =======
  initial_balance: { zh: '初始余额', en: 'Initial Balance' },
  initialBalance: { zh: '初始余额', en: 'Initial Balance' },
  real_time_balance: { zh: '实时余额', en: 'Real-time Balance' },
  realTimeBalance: { zh: '实时余额', en: 'Real-time Balance' },
  order_total: { zh: '订单总额', en: 'Order Total' },
  orderTotal: { zh: '订单总额', en: 'Order Total' },
  withdrawal_total: { zh: '提款总额', en: 'Withdrawal Total' },
  withdrawalTotal: { zh: '提款总额', en: 'Withdrawal Total' },
  recharge_total: { zh: '充值总额', en: 'Recharge Total' },
  rechargeTotal: { zh: '充值总额', en: 'Recharge Total' },
  last_reset_time: { zh: '最后重置时间', en: 'Last Reset Time' },
  lastResetTime: { zh: '最后重置时间', en: 'Last Reset Time' },
  vendorName: { zh: '卡商名称', en: 'Vendor Name' },
  providerName: { zh: '代付商家名称', en: 'Provider Name' },
  withdrawals: { zh: '提款明细', en: 'Withdrawals' },
  recharges: { zh: '充值明细', en: 'Recharges' },
  withdrawalAmountUsdt: { zh: '提款金额(USDT)', en: 'Withdrawal Amount (USDT)' },
  rechargeAmountUsdt: { zh: '充值金额(USDT)', en: 'Recharge Amount (USDT)' },
  usdtRate: { zh: 'USDT汇率', en: 'USDT Rate' },
  settlementTotal: { zh: '结算总额', en: 'Settlement Total' },
  timestamp: { zh: '时间', en: 'Time' },
  action: { zh: '操作', en: 'Action' },
  previousBalance: { zh: '变更前余额', en: 'Previous Balance' },
  
  // ======= 卡片/商家 =======
  name: { zh: '名称', en: 'Name' },
  card_vendors: { zh: '卡商列表', en: 'Card Vendors' },
  cardVendors: { zh: '卡商列表', en: 'Card Vendors' },
  type: { zh: '类型', en: 'Type' },
  payment_providers: { zh: '代付商家', en: 'Payment Providers' },
  paymentProviders: { zh: '代付商家', en: 'Payment Providers' },
  
  // ======= 审核相关 =======
  action_type: { zh: '操作类型', en: 'Action Type' },
  actionType: { zh: '操作类型', en: 'Action Type' },
  target_table: { zh: '目标表', en: 'Target Table' },
  targetTable: { zh: '目标表', en: 'Target Table' },
  target_id: { zh: '目标ID', en: 'Target ID' },
  targetId: { zh: '目标ID', en: 'Target ID' },
  old_data: { zh: '旧数据', en: 'Old Data' },
  oldData: { zh: '旧数据', en: 'Old Data' },
  new_data: { zh: '新数据', en: 'New Data' },
  newData: { zh: '新数据', en: 'New Data' },
  submitter_id: { zh: '提交人', en: 'Submitter' },
  submitterId: { zh: '提交人', en: 'Submitter' },
  reviewer_id: { zh: '审核人', en: 'Reviewer' },
  reviewerId: { zh: '审核人', en: 'Reviewer' },
  review_time: { zh: '审核时间', en: 'Review Time' },
  reviewTime: { zh: '审核时间', en: 'Review Time' },
  review_comment: { zh: '审核评论', en: 'Review Comment' },
  reviewComment: { zh: '审核评论', en: 'Review Comment' },
  
  // ======= 知识库 =======
  title_zh: { zh: '中文标题', en: 'Chinese Title' },
  titleZh: { zh: '中文标题', en: 'Chinese Title' },
  title_en: { zh: '英文标题', en: 'English Title' },
  titleEn: { zh: '英文标题', en: 'English Title' },
  content: { zh: '内容', en: 'Content' },
  description: { zh: '描述', en: 'Description' },
  category_id: { zh: '分类', en: 'Category' },
  categoryId: { zh: '分类', en: 'Category' },
  is_published: { zh: '是否发布', en: 'Published' },
  isPublished: { zh: '是否发布', en: 'Published' },
  visibility: { zh: '可见性', en: 'Visibility' },
  image_url: { zh: '图片链接', en: 'Image URL' },
  imageUrl: { zh: '图片链接', en: 'Image URL' },
  
  // ======= 商家结算补充 =======
  operatorAccount: { zh: '操作人账号', en: 'Operator Account' },
  operatorRole: { zh: '操作人角色', en: 'Operator Role' },
  ip_address: { zh: 'IP地址', en: 'IP Address' },
  previousState: { zh: '变更前状态', en: 'Previous State' },
  settlementId: { zh: '结算ID', en: 'Settlement ID' },
  handoverTime: { zh: '交接时间', en: 'Handover Time' },
  handoverEmployeeName: { zh: '交接人', en: 'Handover Employee' },
  receiverName: { zh: '接收人', en: 'Receiver Name' },
  cardMerchantData: { zh: '卡商数据', en: 'Card Merchant Data' },
  paymentProviderData: { zh: '代付商家数据', en: 'Payment Provider Data' },
  
  // ======= 系统设置 =======
  is_active: { zh: '是否启用', en: 'Active' },
  isActive: { zh: '是否启用', en: 'Active' },
  code: { zh: '代码', en: 'Code' },
  name_zh: { zh: '中文名称', en: 'Chinese Name' },
  nameZh: { zh: '中文名称', en: 'Chinese Name' },
  name_en: { zh: '英文名称', en: 'English Name' },
  nameEn: { zh: '英文名称', en: 'English Name' },
  symbol: { zh: '符号', en: 'Symbol' },
  badge_color: { zh: '徽章颜色', en: 'Badge Color' },
  badgeColor: { zh: '徽章颜色', en: 'Badge Color' },
  label: { zh: '标签', en: 'Label' },
  value: { zh: '值', en: 'Value' },
  
  // ======= 权限相关 =======
  can_view: { zh: '可查看', en: 'Can View' },
  canView: { zh: '可查看', en: 'Can View' },
  can_edit: { zh: '可编辑', en: 'Can Edit' },
  canEdit: { zh: '可编辑', en: 'Can Edit' },
  can_delete: { zh: '可删除', en: 'Can Delete' },
  canDelete: { zh: '可删除', en: 'Can Delete' },
  permission_key: { zh: '权限键', en: 'Permission Key' },
  permissionKey: { zh: '权限键', en: 'Permission Key' },
  module_name: { zh: '模块名称', en: 'Module Name' },
  moduleName: { zh: '模块名称', en: 'Module Name' },
  field_name: { zh: '字段名称', en: 'Field Name' },
  fieldName: { zh: '字段名称', en: 'Field Name' },

  // ======= 订单补充 =======
  order_id: { zh: '订单ID', en: 'Order ID' },
  orderId: { zh: '订单ID', en: 'Order ID' },
  
  // ======= 活动赠送补充 =======
  giftNumber: { zh: '赠送编号', en: 'Gift Number' },
  gift_number: { zh: '赠送编号', en: 'Gift Number' },
  creatorName: { zh: '创建人', en: 'Creator' },
  creator_name: { zh: '创建人', en: 'Creator' },
  giftTypeLabel: { zh: '赠送类型', en: 'Gift Type' },
  gift_type_label: { zh: '赠送类型', en: 'Gift Type' },
  
  // ======= 积分设置补充 =======
  autoUpdateIntervalMs: { zh: '自动更新间隔', en: 'Auto Update Interval' },
  auto_update_interval_ms: { zh: '自动更新间隔', en: 'Auto Update Interval' },
  usdtFormulaMultiplier: { zh: 'USDT公式倍数', en: 'USDT Formula Multiplier' },
  usdt_formula_multiplier: { zh: 'USDT公式倍数', en: 'USDT Formula Multiplier' },
  referralActivityEnabled: { zh: '推荐活动启用', en: 'Referral Activity Enabled' },
  referral_activity_enabled: { zh: '推荐活动启用', en: 'Referral Activity Enabled' },
  referralMode2Percentage: { zh: '推荐模式2比例', en: 'Referral Mode 2 Percentage' },
  referral_mode2_percentage: { zh: '推荐模式2比例', en: 'Referral Mode 2 Percentage' },
  referralPointsPerAction: { zh: '推荐积分/次', en: 'Referral Points/Action' },
  referral_points_per_action: { zh: '推荐积分/次', en: 'Referral Points/Action' },
  consumptionPointsPerAction: { zh: '消费积分/次', en: 'Consumption Points/Action' },
  consumption_points_per_action: { zh: '消费积分/次', en: 'Consumption Points/Action' },
  
  // ======= 租户/商家补充 =======
  tenant_id: { zh: '租户', en: 'Tenant' },
  tenantId: { zh: '租户', en: 'Tenant' },
  tenant_code: { zh: '租户代码', en: 'Tenant Code' },
  tenantCode: { zh: '租户代码', en: 'Tenant Code' },
  
  // ======= 登录/审计补充 =======
  ipAddress: { zh: 'IP地址', en: 'IP Address' },
  user_agent: { zh: '浏览器', en: 'Browser' },
  userAgent: { zh: '浏览器', en: 'Browser' },
  login_time: { zh: '登录时间', en: 'Login Time' },
  loginTime: { zh: '登录时间', en: 'Login Time' },
  success: { zh: '是否成功', en: 'Success' },
  failure_reason: { zh: '失败原因', en: 'Failure Reason' },
  failureReason: { zh: '失败原因', en: 'Failure Reason' },
  
  // ======= 通用补充 =======
  enabled: { zh: '启用', en: 'Enabled' },
  is_enabled: { zh: '是否启用', en: 'Enabled' },
  isEnabled: { zh: '是否启用', en: 'Enabled' },
  email: { zh: '邮箱', en: 'Email' },
  phone: { zh: '电话', en: 'Phone' },
  note: { zh: '备注', en: 'Note' },
  notes: { zh: '备注', en: 'Notes' },
  reason: { zh: '原因', en: 'Reason' },
  count: { zh: '数量', en: 'Count' },
  total: { zh: '总计', en: 'Total' },
  balance: { zh: '余额', en: 'Balance' },
  postResetAdjustment: { zh: '重置后调整', en: 'Post-Reset Adjustment' },
  post_reset_adjustment: { zh: '重置后调整', en: 'Post-Reset Adjustment' },
  
  /** 操作日志：JSON 非对象时的解析占位 */
  snapshot_array: { zh: '快照（列表）', en: 'Snapshot (list)' },
  snapshot_value: { zh: '快照（标量）', en: 'Snapshot (scalar)' },
};

/**
 * 将字段名翻译为本地化标签
 */
export function translateFieldName(fieldName: string, lang: 'zh' | 'en' = 'zh'): string {
  const label = FIELD_LABEL_MAP[fieldName];
  if (label) {
    return label[lang];
  }
  if (lang === 'zh') {
    return fieldName
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      .toLowerCase()
      .replace(/_/g, ' ')
      .replace(/\bid\b/g, 'ID')
      .replace(/\bip\b/g, 'IP')
      .trim();
  }
  return fieldName;
}

/**
 * 格式化值为用户友好格式
 */
export function formatDisplayValue(value: any, lang: 'zh' | 'en' = 'zh'): string {
  if (value === null || value === undefined) {
    return '-';
  }
  if (typeof value === 'boolean') {
    return value 
      ? (lang === 'zh' ? '是' : 'Yes') 
      : (lang === 'zh' ? '否' : 'No');
  }
  if (typeof value === 'string') {
    const text = repairUtf8MisdecodedAsLatin1(value);
    // 检查是否为 ISO 日期格式
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(text)) {
      try {
        return formatBeijingTime(text);
      } catch {
        return text;
      }
    }
    return text;
  }
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

/**
 * 智能格式化日志字段值 — 根据字段名解析 UUID、翻译状态枚举等
 */
export function formatLogFieldValue(
  fieldKey: string,
  value: any,
  lang: 'zh' | 'en' = 'zh'
): string {
  if (value === null || value === undefined) return '-';

  const strVal = repairUtf8MisdecodedAsLatin1(typeof value === 'string' ? value : String(value));

  // UUID 解析：卡商
  if (VENDOR_FIELDS.has(fieldKey) && UUID_REGEX.test(strVal)) {
    return resolveVendorName(strVal) || strVal.substring(0, 8) + '...';
  }

  // UUID 解析：卡片类型
  if (CARD_FIELDS.has(fieldKey) && UUID_REGEX.test(strVal)) {
    return resolveCardName(strVal) || strVal.substring(0, 8) + '...';
  }

  // UUID 解析：代付商家
  if (PROVIDER_FIELDS.has(fieldKey) && UUID_REGEX.test(strVal)) {
    return resolveProviderName(strVal) || strVal.substring(0, 8) + '...';
  }

  // UUID 解析：员工
  if (EMPLOYEE_FIELDS.has(fieldKey) && UUID_REGEX.test(strVal)) {
    const name = getEmployeeNameById(strVal);
    return (name && name !== '-') ? name : strVal.substring(0, 8) + '...';
  }

  // UUID 解析：会员
  if (MEMBER_FIELDS.has(fieldKey) && UUID_REGEX.test(strVal)) {
    // 会员 UUID 直接截断显示（无法同步解析手机号）
    return strVal.substring(0, 8) + '...';
  }

  // 活动类型解析
  if (GIFT_TYPE_FIELDS.has(fieldKey)) {
    const label = getActivityTypeLabelByValue(strVal);
    return label || strVal;
  }

  // 状态翻译
  if (fieldKey === 'status' || fieldKey === 'points_status' || fieldKey === 'pointsStatus') {
    const mapped = STATUS_MAP[strVal];
    if (mapped) return mapped[lang];
  }

  // 角色翻译
  if (fieldKey === 'role' || fieldKey === 'operatorRole' || fieldKey === 'operator_role') {
    const mapped = ROLE_MAP[strVal];
    if (mapped) return mapped[lang];
  }

  // 交易类型/模式/推荐模式等枚举翻译
  const enumFields = new Set([
    'transaction_type', 'transactionType', 'mode',
    'referralMode', 'referral_mode', 'action', 'action_type', 'actionType',
  ]);
  if (enumFields.has(fieldKey)) {
    const mapped = STATUS_MAP[strVal];
    if (mapped) return mapped[lang];
  }

  // 布尔型字段
  if (typeof value === 'boolean' || strVal === 'true' || strVal === 'false') {
    const boolVal = value === true || strVal === 'true';
    return boolVal
      ? (lang === 'zh' ? '是' : 'Yes')
      : (lang === 'zh' ? '否' : 'No');
  }

  // 通用 UUID 字段：截断显示
  if ((fieldKey === 'id' || fieldKey.endsWith('_id') || fieldKey.endsWith('Id')) && UUID_REGEX.test(strVal)) {
    return strVal.substring(0, 8) + '...';
  }

  // 毫秒值：转为友好格式
  if (fieldKey.toLowerCase().includes('interval') && typeof value === 'number' && value > 60000) {
    const hours = Math.floor(value / 3600000);
    const mins = Math.floor((value % 3600000) / 60000);
    if (hours > 0) return lang === 'zh' ? `${hours}小时${mins > 0 ? mins + '分钟' : ''}` : `${hours}h${mins > 0 ? mins + 'm' : ''}`;
    return lang === 'zh' ? `${mins}分钟` : `${mins}m`;
  }

  // 默认格式化
  return formatDisplayValue(value, lang);
}

/**
 * 从操作日志中提取可读的对象标识（替代原始 UUID）
 */
export function getReadableObjectId(log: {
  objectId: string;
  objectDescription?: string | null;
  beforeData?: any;
  afterData?: any;
}): string {
  const data = log.beforeData || log.afterData;

  if (log.objectDescription) {
    const cleaned = cleanDescription(log.objectDescription);
    if (cleaned && cleaned !== '-' && cleaned.length > 1) return cleaned.substring(0, 40);
  }

  // 优先从数据中提取非 UUID 的 id（如订单号）
  if (data?.id && !UUID_REGEX.test(String(data.id))) return String(data.id);
  if (data?.order_number) return data.order_number;
  if (data?.orderNumber) return data.orderNumber;
  if (data?.name) return data.name;
  if (data?.phone_number) return data.phone_number;
  if (data?.phoneNumber) return data.phoneNumber;
  if (data?.member_code) return data.member_code;
  if (data?.memberCode) return data.memberCode;

  // 商家结算相关：提取商家名称
  if (data?.vendorName) return data.vendorName;
  if (data?.providerName) return data.providerName;
  if (data?.merchant_name) return data.merchant_name;

  // 对 WD_/RC_/PSETTLE_ 前缀的 ID，从 data 中提取可读名称
  if (log.objectId) {
    if (/^WD_/.test(log.objectId) && data?.vendorName) return `${data.vendorName}`;
    if (/^RC_/.test(log.objectId) && data?.providerName) return `${data.providerName}`;
    if (/^PSETTLE_/.test(log.objectId) && (data?.providerName || data?.vendorName)) {
      return data.providerName || data.vendorName;
    }
  }

  // 如果 objectId 不是 UUID 且不是内部前缀格式，直接显示
  if (log.objectId && !UUID_REGEX.test(log.objectId) && !/^(WD_|RC_|PSETTLE_)/.test(log.objectId)) {
    return log.objectId;
  }

  // 最后截断显示
  return log.objectId ? log.objectId.substring(0, 8) + '...' : '-';
}

/**
 * 翻译账本备注 — 将已存储的中文备注按模式匹配翻译为英文
 * 用于 LedgerTransactionContent 的表格显示和 CSV 导出
 */
const LEDGER_NOTE_PATTERNS: Array<{ zh: RegExp; prefix: string }> = [
  { zh: /^操作日志恢复提款/, prefix: 'Log Restore Withdrawal' },
  { zh: /^操作日志恢复充值/, prefix: 'Log Restore Recharge' },
  { zh: /^恢复订单收入/, prefix: 'Restore Order Income' },
  { zh: /^恢复订单支出/, prefix: 'Restore Order Expense' },
  { zh: /^恢复赠送/, prefix: 'Restore Gift' },
  { zh: /^恢复充值/, prefix: 'Restore Recharge' },
  { zh: /^恢复提款/, prefix: 'Restore Withdrawal' },
  { zh: /^撤回订单收入\(含调整\)/, prefix: 'Reverse Order Income (w/ adj)' },
  { zh: /^撤回订单支出\(含调整\)/, prefix: 'Reverse Order Expense (w/ adj)' },
  { zh: /^赠送回收\(含调整\)/, prefix: 'Reverse Gift (w/ adj)' },
  { zh: /^设置初始余额/, prefix: 'Set Initial Balance' },
  { zh: /^对账修正/, prefix: 'Reconciliation' },
  { zh: /^订单收入/, prefix: 'Order Income' },
  { zh: /^订单支出/, prefix: 'Order Expense' },
  { zh: /^订单调整\(商家变更撤回\)/, prefix: 'Order Adj (vendor change revoke)' },
  { zh: /^订单调整\(商家变更新增\)/, prefix: 'Order Adj (vendor change new)' },
  { zh: /^订单调整/, prefix: 'Order Adjustment' },
  { zh: /^赠送调整/, prefix: 'Gift Adjustment' },
  { zh: /^活动赠送/, prefix: 'Activity Gift' },
  { zh: /^积分兑换/, prefix: 'Points Redemption' },
  { zh: /^录入提款/, prefix: 'Record Withdrawal' },
  { zh: /^录入充值/, prefix: 'Record Recharge' },
  { zh: /^提款/, prefix: 'Withdrawal' },
  { zh: /^充值/, prefix: 'Recharge' },
  { zh: /^修改提款/, prefix: 'Edit Withdrawal' },
  { zh: /^修改充值/, prefix: 'Edit Recharge' },
  { zh: /^删除提款记录/, prefix: 'Delete Withdrawal' },
  { zh: /^删除充值记录/, prefix: 'Delete Recharge' },
  { zh: /^删除提款记录\(fallback\)/, prefix: 'Delete Withdrawal (fallback)' },
  { zh: /^删除充值记录\(fallback\)/, prefix: 'Delete Recharge (fallback)' },
];

/**
 * 清理备注中的 UUID，替换为更友好的显示
 */
function cleanNoteUUIDs(note: string): string {
  return note.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    ''
  ).replace(/:\s*$/, '').replace(/\s{2,}/g, ' ').trim();
}

export function formatLedgerNote(note: string | null | undefined, lang: 'zh' | 'en'): string {
  if (!note) return '-';
  
  // 先清理 UUID
  const cleaned = cleanNoteUUIDs(note);
  if (!cleaned) return '-';
  
  if (lang === 'zh') return cleaned;

  for (const pattern of LEDGER_NOTE_PATTERNS) {
    const match = cleaned.match(pattern.zh);
    if (match) {
      const suffix = cleaned.substring(match[0].length);
      return pattern.prefix + suffix;
    }
  }

  return cleaned;
}

/**
 * 清理操作描述中的 UUID
 */
export function cleanDescription(description: string | null | undefined): string {
  if (!description) return '-';
  const desc = repairUtf8MisdecodedAsLatin1(description);
  return desc
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '')
    .replace(/\s*-\s*-\s*/g, ' - ')
    .replace(/\s{2,}/g, ' ')
    .replace(/:\s*$/, '')
    .trim() || description;
}

export function formatIpAddress(ip: string | null | undefined, lang: 'zh' | 'en' = 'zh'): string {
  if (!ip) return '-';
  const trimmed = ip.trim();
  if (!trimmed || trimmed === 'unknown') return '-';
  const normalized = trimmed.startsWith('::ffff:') ? trimmed.slice(7) : trimmed;
  if (normalized === '127.0.0.1' || normalized === '::1' || normalized === 'localhost') {
    return lang === 'zh' ? '本机' : 'Local';
  }
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(normalized)) {
    return lang === 'zh' ? `内网(${normalized})` : `LAN (${normalized})`;
  }
  if (normalized.includes(':') && normalized.length > 20) {
    const parts = normalized.split(':');
    return parts.slice(0, 3).join(':') + ':…' + parts.slice(-1).join(':');
  }
  return normalized;
}
