/**
 * 抽奖氛围假用户 — 内置 100 人（无 DB 配置时的默认池）
 */
export interface SpinFakeUser {
  id: string;
  name: string;
  avatar: string | null;
  region: string | null;
  is_fake?: boolean;
}

const GIVEN = [
  '小晨', '阿杰', '乐乐', '沐沐', '琪琪', '浩然', '思雨', '子轩', '欣怡', '宇航',
  '梦瑶', '俊熙', '诗涵', '博文', '雨桐', '梓豪', '若曦', '泽宇', '佳琪', '明辉',
  '雪莹', '志强', '婉清', '建华', '丽华', '国强', '秀兰', '海燕', '红梅', '桂花',
  '云帆', '听澜', '疏影', '青禾', '南星', '北野', '西洲', '东篱', '知秋', '半夏',
  '晚风', '晨曦', '星河', '月白', '流光', '浅夏', '深冬', '微光', '长风', '静水',
  '书瑶', '景行', '怀瑾', '若瑜', '以宁', '安然', '清欢', '如故', '拾光', '归远',
  '鹿鸣', '鹤归', '鲸落', '萤火', '松风', '竹露', '梅影', '兰心', '菊韵', '桃夭',
  '千寻', '半夏', '初一', '十五', '廿七', '元七', '九思', '一诺', '无双', '长安',
  '故里', '南风', '西窗', '东君', '北辰', '南乔', '西子', '东篱', '中宵', '上元',
];

const REGIONS = [
  '上海', '北京', '深圳', '广州', '杭州', '成都', '武汉', '西安', '南京', '苏州',
  '重庆', '天津', '长沙', '郑州', '合肥', '青岛', '厦门', '福州', '济南', '昆明',
  null, '香港', '台北', null, '新加坡', null,
];

function buildBuiltinPool(): SpinFakeUser[] {
  const out: SpinFakeUser[] = [];
  for (let i = 0; i < 100; i++) {
    const id = `spin_fake_u_${String(i + 1).padStart(3, '0')}`;
    const base = GIVEN[i % GIVEN.length];
    const name = i < GIVEN.length ? base : `${base}·${i % 97}`;
    out.push({
      id,
      name,
      avatar: null,
      region: REGIONS[i % REGIONS.length],
      is_fake: true,
    });
  }
  return out;
}

/** 无「模拟设置」或清空配置时使用 */
export const SPIN_FAKE_USER_POOL_BUILTIN: SpinFakeUser[] = buildBuiltinPool();

/** @deprecated 使用 getResolvedSpinFakeUsersForTenant；保留别名避免外部引用断裂 */
export const SPIN_FAKE_USER_POOL = SPIN_FAKE_USER_POOL_BUILTIN;
