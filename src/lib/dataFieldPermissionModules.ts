/**
 * 后台「数据级」权限：查看/编辑/删除（在审核中心 → 审核设置 → 数据编辑权限，仅总管理员；写入 role_permissions）
 * 左侧菜单可见性在系统设置 → 权限设置（与本文无关）
 */
export type FieldMeta = { label_zh: string; label_en: string; readonly?: boolean; isAction?: boolean };

export const DATA_FIELD_MODULES: Record<
  string,
  { label_zh: string; label_en: string; fields: Record<string, FieldMeta> }
> = {
  orders: {
    label_zh: '订单管理',
    label_en: 'Order Management',
    fields: {
      card_type: { label_zh: '卡片类型', label_en: 'Card Type' },
      card_value: { label_zh: '卡片面值', label_en: 'Card Value' },
      card_rate: { label_zh: '卡片汇率', label_en: 'Card Rate' },
      actual_payment: { label_zh: '实付外币', label_en: 'Actual Payment' },
      exchange_rate: { label_zh: '外币汇率', label_en: 'Exchange Rate' },
      fee: { label_zh: '手续费', label_en: 'Fee' },
      currency: { label_zh: '需求币种', label_en: 'Currency' },
      phone_number: { label_zh: '电话号码', label_en: 'Phone Number' },
      payment_provider: { label_zh: '代付商家', label_en: 'Payment Provider' },
      vendor: { label_zh: '卡商', label_en: 'Vendor' },
      remark: { label_zh: '备注', label_en: 'Remark' },
      member_code: { label_zh: '会员编号', label_en: 'Member Code', readonly: true },
      sales_person: { label_zh: '销售员', label_en: 'Sales Person', readonly: true },
      cancel_button: { label_zh: '取消订单', label_en: 'Cancel Order', isAction: true },
      delete_button: { label_zh: '删除订单', label_en: 'Delete Order', isAction: true },
    },
  },
  members: {
    label_zh: '会员管理',
    label_en: 'Member Management',
    fields: {
      phone_number: { label_zh: '手机号', label_en: 'Phone Number' },
      member_level: { label_zh: '等级', label_en: 'Level' },
      common_cards: { label_zh: '常交易卡', label_en: 'Common Cards' },
      bank_card: { label_zh: '银行卡', label_en: 'Bank Card' },
      currency_preferences: { label_zh: '币种偏好', label_en: 'Currency Preferences' },
      customer_feature: { label_zh: '客户特点', label_en: 'Customer Feature' },
      source: { label_zh: '来源', label_en: 'Source' },
      remark: { label_zh: '备注', label_en: 'Remark' },
      referrer: { label_zh: '推荐人', label_en: 'Referrer' },
      recorder: { label_zh: '录入人', label_en: 'Recorder' },
      member_code: { label_zh: '会员编号', label_en: 'Member Code', readonly: true },
      points: { label_zh: '修改积分', label_en: 'Modify Points' },
      delete_button: { label_zh: '删除会员', label_en: 'Delete Member', isAction: true },
    },
  },
  activity: {
    label_zh: '活动赠送',
    label_en: 'Activity Gifts',
    fields: {
      currency: { label_zh: '赠送币种', label_en: 'Gift Currency' },
      amount: { label_zh: '赠送金额', label_en: 'Gift Amount' },
      rate: { label_zh: '汇率', label_en: 'Rate' },
      phone_number: { label_zh: '电话号码', label_en: 'Phone Number' },
      payment_agent: { label_zh: '代付商家', label_en: 'Payment Agent' },
      gift_type: { label_zh: '类型', label_en: 'Type' },
      remark: { label_zh: '备注', label_en: 'Remark' },
      delete_button: { label_zh: '删除活动', label_en: 'Delete Activity', isAction: true },
    },
  },
  audit: {
    label_zh: '审核中心',
    label_en: 'Audit Center',
    fields: {
      can_approve: { label_zh: '审核权限', label_en: 'Approve Permission' },
      require_approval: { label_zh: '修改需审核', label_en: 'Require Approval' },
    },
  },
  login_logs: {
    label_zh: '登录日志',
    label_en: 'Login Logs',
    fields: {
      view_all_logs: { label_zh: '查看所有日志', label_en: 'View All Logs' },
      export_logs: { label_zh: '导出日志', label_en: 'Export Logs' },
    },
  },
  activity_reports: {
    label_zh: '活动报表',
    label_en: 'Activity Reports',
    fields: {
      view_member_data: { label_zh: '查看会员数据', label_en: 'View Member Data' },
      view_activity_data: { label_zh: '查看活动数据', label_en: 'View Activity Data' },
      view_points_details: { label_zh: '查看积分明细', label_en: 'View Points Details' },
      adjust_points: { label_zh: '调整积分', label_en: 'Adjust Points' },
      redeem_points: { label_zh: '积分兑换', label_en: 'Redeem Points' },
    },
  },
  referral: {
    label_zh: '推荐管理',
    label_en: 'Referral Management',
    fields: {
      view_referrals: { label_zh: '查看推荐关系', label_en: 'View Referrals' },
      edit_referrals: { label_zh: '编辑推荐', label_en: 'Edit Referrals' },
      delete_button: { label_zh: '删除推荐', label_en: 'Delete Referral', isAction: true },
    },
  },
  shift_handover: {
    label_zh: '交班对账',
    label_en: 'Shift Handover',
    fields: {
      view_handover: { label_zh: '查看交班记录', label_en: 'View Handover' },
      create_handover: { label_zh: '创建交班', label_en: 'Create Handover' },
      confirm_handover: { label_zh: '确认交班', label_en: 'Confirm Handover' },
      delete_button: { label_zh: '删除交班', label_en: 'Delete Handover', isAction: true },
    },
  },
  data_management: {
    label_zh: '数据管理',
    label_en: 'Data Management',
    fields: {
      import_data: { label_zh: '导入数据', label_en: 'Import Data' },
      export_data: { label_zh: '导出数据', label_en: 'Export Data' },
      batch_delete: { label_zh: '批量删除', label_en: 'Batch Delete', isAction: true },
    },
  },
  merchant_settlement: {
    label_zh: '商家结算',
    label_en: 'Merchant Settlement',
    fields: {
      view_card_settlement: { label_zh: '查看卡商结算', label_en: 'View Card Settlement' },
      view_provider_settlement: { label_zh: '查看代付结算', label_en: 'View Provider Settlement' },
      view_shift_data: { label_zh: '查看交班数据', label_en: 'View Shift Data' },
      edit_balance: { label_zh: '编辑余额', label_en: 'Edit Balance' },
      export_data: { label_zh: '导出数据', label_en: 'Export Data' },
    },
  },
  merchant_management: {
    label_zh: '商家管理',
    label_en: 'Merchant Management',
    fields: {
      view_cards: { label_zh: '查看卡片', label_en: 'View Cards' },
      edit_cards: { label_zh: '编辑卡片', label_en: 'Edit Cards' },
      delete_cards: { label_zh: '删除卡片', label_en: 'Delete Cards', isAction: true },
      view_vendors: { label_zh: '查看卡商', label_en: 'View Vendors' },
      edit_vendors: { label_zh: '编辑卡商', label_en: 'Edit Vendors' },
      delete_vendors: { label_zh: '删除卡商', label_en: 'Delete Vendors', isAction: true },
      view_providers: { label_zh: '查看代付商家', label_en: 'View Providers' },
      edit_providers: { label_zh: '编辑代付商家', label_en: 'Edit Providers' },
      delete_providers: { label_zh: '删除代付商家', label_en: 'Delete Providers', isAction: true },
    },
  },
  knowledge_base: {
    label_zh: '公司文档',
    label_en: 'Company Docs',
    fields: {
      view_articles: { label_zh: '查看文章', label_en: 'View Articles' },
      create_articles: { label_zh: '创建文章', label_en: 'Create Articles' },
      edit_articles: { label_zh: '编辑文章', label_en: 'Edit Articles' },
      delete_articles: { label_zh: '删除文章', label_en: 'Delete Articles', isAction: true },
      manage_categories: { label_zh: '管理分类', label_en: 'Manage Categories' },
      create_public_categories: { label_zh: '创建公开分类', label_en: 'Create Public Categories' },
    },
  },
};
