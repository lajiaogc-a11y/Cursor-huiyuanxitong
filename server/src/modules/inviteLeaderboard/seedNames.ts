/**
 * 邀请榜冷启动假用户：尼日利亚常见「教名/英文名 + 本地姓」习惯（Yoruba / Igbo / Hausa 等常见姓氏）。
 * 初始化接口仅写入前 50 条（见 repository.seedFiftyFakeUsers）。
 */

const FIRST_NAMES = [
  'David',
  'Michael',
  'John',
  'Samuel',
  'Daniel',
  'Emmanuel',
  'Victor',
  'Joseph',
  'Peter',
  'Paul',
  'James',
  'Andrew',
  'Stephen',
  'Patrick',
  'Anthony',
  'Joshua',
  'Gabriel',
  'Simon',
  'Philip',
  'Matthew',
  'Mark',
  'Luke',
  'Thomas',
  'Benjamin',
  'Jonathan',
  'Isaac',
  'Jacob',
  'Aaron',
  'Caleb',
  'Nathan',
  'Timothy',
  'Kenneth',
  'Richard',
  'Charles',
  'George',
  'Henry',
  'William',
  'Robert',
  'Edward',
  'Frank',
  'Blessing',
  'Grace',
  'Mercy',
  'Faith',
  'Hope',
  'Joy',
  'Patience',
  'Chioma',
  'Ngozi',
  'Amaka',
  'Funmi',
  'Folake',
  'Yetunde',
  'Temitope',
  'Amina',
  'Fatima',
  'Hauwa',
  'Zainab',
  'Maryam',
  'Ruth',
  'Esther',
  'Deborah',
  'Rebecca',
  'Sarah',
  'Elizabeth',
  'Mary',
  'Chidi',
  'Ifeanyi',
  'Obinna',
  'Kelechi',
  'Olumide',
  'Tunde',
  'Segun',
  'Yusuf',
  'Usman',
] as const;

/** 常见尼日利亚姓氏（去重）；与教名组合为「First Last」网名风格 */
const SURNAMES = [
  'Adeyemi',
  'Okafor',
  'Bello',
  'Ibrahim',
  'Adebayo',
  'Musa',
  'Lawal',
  'Okeke',
  'Sani',
  'Abdullahi',
  'Okonkwo',
  'Eze',
  'Nwosu',
  'Obi',
  'Adeleke',
  'Ogunleye',
  'Bakare',
  'Adesanya',
  'Fashola',
  'Oyinlola',
  'Chukwu',
  'Emenike',
  'Nnamdi',
  'Onwudiwe',
  'Ezenwa',
  'Okoye',
  'Azikiwe',
  'Adebisi',
  'Olaniyan',
  'Oyelaran',
  'Afolabi',
  'Oluwole',
  'Ibe',
  'Anozie',
  'Maduka',
  'Anyanwu',
  'Hassan',
  'Yakubu',
  'Garba',
  'Danjuma',
  'Abubakar',
  'Suleiman',
  'Mohammed',
  'Aliyu',
  'Shehu',
  'Idris',
  'Adamu',
  'Okoro',
  'Njoku',
  'Udeze',
] as const;

function seededShuffle<T>(arr: readonly T[], seed: number): T[] {
  const a = [...arr];
  let s = seed >>> 0;
  for (let i = a.length - 1; i > 0; i--) {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** 名×姓全组合后洗牌，取前 55 条备用（接口写入 50 条） */
function buildNigerianStyleSeedNames(): string[] {
  const pairs: string[] = [];
  for (const f of FIRST_NAMES) {
    for (const l of SURNAMES) {
      pairs.push(`${f} ${l}`);
    }
  }
  return seededShuffle(pairs, 0x7f4a7c15).slice(0, 55);
}

export const INVITE_LEADERBOARD_SEED_NAMES: string[] = buildNigerianStyleSeedNames();
