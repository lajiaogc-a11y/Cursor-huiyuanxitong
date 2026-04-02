import { useState, useCallback, useRef, useEffect } from "react";
import { Gift, History, Trophy, Star, ChevronDown, Info, Sparkles } from "lucide-react";
import confetti from "canvas-confetti";
import MemberLayout from "@/components/member/MemberLayout";
import { CardGridSkeleton } from "@/components/member/MemberSkeleton";

/* ─── Audio helpers (Web Audio API, no files needed) ─── */
let audioCtx: AudioContext | null = null;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

function playTick(pitch = 800, duration = 0.04) {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = pitch;
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch { /* silent fail */ }
}

function playWinSound() {
  try {
    const ctx = getAudioCtx();
    [0, 0.1, 0.2, 0.35].forEach((t, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = [523, 659, 784, 1047][i];
      gain.gain.setValueAtTime(0.15, ctx.currentTime + t);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + 0.3);
    });
  } catch { /* silent fail */ }
}

function fireConfetti() {
  const defaults = { startVelocity: 30, spread: 360, ticks: 80, zIndex: 100 };
  confetti({ ...defaults, particleCount: 60, origin: { x: 0.3, y: 0.5 } });
  confetti({ ...defaults, particleCount: 60, origin: { x: 0.7, y: 0.5 } });
  setTimeout(() => {
    confetti({ ...defaults, particleCount: 40, origin: { x: 0.5, y: 0.35 } });
  }, 200);
}

/* ─── Mock Data ─── */
const prizes = [
  { id: 1, name: "iPhone 15 Pro", probability: "0.01%", tier: "legendary" },
  { id: 2, name: "$50 Gift Card", probability: "1%", tier: "epic" },
  { id: 3, name: "100 积分", probability: "15%", tier: "common" },
  { id: 4, name: "Netflix 1月", probability: "5%", tier: "rare" },
  { id: 5, name: "200 积分", probability: "10%", tier: "common" },
  { id: 6, name: "谢谢参与", probability: "40%", tier: "miss" },
  { id: 7, name: "$10 Gift Card", probability: "3%", tier: "rare" },
  { id: 8, name: "50 积分", probability: "25.99%", tier: "common" },
];

/* Grid order: the 8 outer cells in clockwise sequence (grid indices) */
// Grid layout:  0  1  2
//               7  C  3
//               6  5  4
// Clockwise order of prize indices: 0,1,2,3,4,5,6,7
const SPIN_ORDER = [0, 1, 2, 3, 4, 5, 6, 7];

const spinQuota = { remaining: 3, total: 5 };
const initialHistory = [
  { id: 1, prize: "100 积分", date: "2024-03-01 14:30", tier: "common" },
  { id: 2, prize: "谢谢参与", date: "2024-03-01 14:28", tier: "miss" },
  { id: 3, prize: "$10 Gift Card", date: "2024-02-28 20:15", tier: "rare" },
  { id: 4, prize: "50 积分", date: "2024-02-28 18:00", tier: "common" },
  { id: 5, prize: "Netflix 1月", date: "2024-02-27 10:30", tier: "rare" },
];

/* ─── Prize Cell ─── */
function PrizeCell({
  prize,
  isCenter,
  isHighlighted,
  isWinner,
  onSpin,
  spinning,
  remaining,
}: {
  prize?: typeof prizes[0];
  isCenter?: boolean;
  isHighlighted?: boolean;
  isWinner?: boolean;
  onSpin?: () => void;
  spinning?: boolean;
  remaining?: number;
}) {
  if (isCenter) {
    return (
      <button
        onClick={onSpin}
        disabled={spinning}
        className={`btn-spin relative w-full aspect-square flex flex-col items-center justify-center gap-1 ${
          spinning ? "opacity-80 cursor-not-allowed" : ""
        }`}
      >
        <span className="spin-ring" />
        <Sparkles className={`h-6 w-6 text-[hsl(0_0%_100%)] ${spinning ? "spin-icon" : ""}`} />
        <span className="text-sm font-extrabold text-[hsl(0_0%_100%)]">
          {spinning ? "抽奖中" : "抽奖"}
        </span>
        <span className="text-[10px] text-[hsl(0_0%_100%_/_0.8)] font-bold">
          剩余 {remaining} 次
        </span>
      </button>
    );
  }

  const tierStyles: Record<string, string> = {
    legendary: "border-rose/30 bg-rose/[0.08] shadow-[0_0_16px_hsl(12_85%_60%_/_0.1)]",
    epic: "border-gold/25 bg-gold/[0.06]",
    rare: "border-emerald/20 bg-emerald/[0.05]",
    common: "border-[hsl(var(--m-surface-border)_/_0.3)] bg-[hsl(var(--m-surface)_/_0.4)]",
    miss: "border-[hsl(var(--m-surface-border)_/_0.15)] bg-[hsl(var(--m-surface)_/_0.2)]",
  };

  return (
    <div
      className={`relative w-full aspect-square rounded-2xl border flex flex-col items-center justify-center gap-1 p-2 transition-all duration-150 ${
        tierStyles[prize?.tier || "common"]
      } ${
        isWinner
          ? "ring-2 ring-[hsl(var(--emerald))] scale-105 shadow-[0_0_24px_hsl(var(--emerald)/0.4)]"
          : isHighlighted
          ? "ring-2 ring-[hsl(var(--gold))] scale-[1.04] shadow-[0_0_20px_hsl(var(--gold)/0.35)] bg-[hsl(var(--gold)/0.12)]"
          : "hover:scale-[1.03]"
      }`}
    >
      {/* Highlight glow overlay */}
      {isHighlighted && (
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[hsl(var(--gold)/0.15)] to-transparent pointer-events-none" />
      )}
      {isWinner && (
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[hsl(var(--emerald)/0.15)] to-transparent pointer-events-none animate-pulse" />
      )}
      <div className="w-8 h-8 rounded-xl bg-[hsl(var(--m-surface)_/_0.5)] flex items-center justify-center mb-0.5 border border-[hsl(var(--m-surface-border)_/_0.2)] relative z-10">
        <Gift className="h-4 w-4 text-[hsl(var(--m-text-dim)_/_0.4)]" />
      </div>
      <span className="text-[11px] font-bold text-center leading-tight line-clamp-2 relative z-10">
        {prize?.name}
      </span>
      <span className="text-[9px] text-[hsl(var(--m-text-dim)_/_0.4)] font-mono font-bold relative z-10">
        {prize?.probability}
      </span>
    </div>
  );
}

/* ─── History Row ─── */
function HistoryRow({ item }: { item: typeof initialHistory[0] }) {
  const tierIcon: Record<string, string> = {
    legendary: "🏆", epic: "💎", rare: "⭐", common: "🎁", miss: "💨",
  };
  const tierColor: Record<string, string> = {
    legendary: "text-rose-soft", epic: "text-gold-soft", rare: "text-emerald-soft", common: "", miss: "text-[hsl(var(--m-text-dim))]",
  };
  return (
    <div className="flex items-center gap-3 py-3.5 border-b border-[hsl(var(--m-surface-border)_/_0.15)] last:border-0">
      <span className="text-lg">{tierIcon[item.tier] || "🎁"}</span>
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-bold truncate ${tierColor[item.tier] || ""}`}>{item.prize}</div>
        <div className="text-[11px] text-[hsl(var(--m-text-dim))] font-medium">{item.date}</div>
      </div>
    </div>
  );
}

/* ─── Main ─── */
export default function MemberSpin() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(t);
  }, []);

  const [spinning, setSpinning] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [winnerIndex, setWinnerIndex] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(spinQuota.remaining);
  const [showModal, setShowModal] = useState(false);
  const [wonPrize, setWonPrize] = useState<typeof prizes[0] | null>(null);
  const [history, setHistory] = useState(initialHistory);
  const nextIdRef = useRef(initialHistory.length + 1);
  const timerRef = useRef<number[]>([]);

  const startSpin = useCallback(() => {
    if (spinning || remaining <= 0) return;

    setSpinning(true);
    setWinnerIndex(null);
    setShowModal(false);

    // Pick a random winner
    const winIdx = Math.floor(Math.random() * 8);
    const totalSteps = SPIN_ORDER.length * 4 + winIdx + 2; // ~4 full loops + land on winner

    // Clear any old timers
    timerRef.current.forEach(clearTimeout);
    timerRef.current = [];

    let step = 0;
    const scheduleStep = () => {
      if (step >= totalSteps) {
        // Landed on winner
        setActiveIndex(null);
        setWinnerIndex(winIdx);
        setSpinning(false);
        setRemaining((r) => Math.max(0, r - 1));
        const won = prizes[winIdx];
        setWonPrize(won);

        // Insert into history
        const now = new Date();
        const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        setHistory((prev) => [
          { id: nextIdRef.current++, prize: won.name, date: dateStr, tier: won.tier },
          ...prev,
        ]);

        // Win effects
        if (prizes[winIdx].tier !== "miss") {
          playWinSound();
          fireConfetti();
        }

        const t = window.setTimeout(() => setShowModal(true), 600);
        timerRef.current.push(t);
        return;
      }

      const currentPos = step % SPIN_ORDER.length;
      setActiveIndex(SPIN_ORDER[currentPos]);

      // Tick sound — pitch rises as it slows down
      const progress = step / totalSteps;
      playTick(600 + progress * 600, 0.03 + progress * 0.04);

      // Easing: start fast, slow down near end
      const baseSpeed = 60;
      const maxSpeed = 320;
      const delay = baseSpeed + (maxSpeed - baseSpeed) * Math.pow(progress, 2.5);

      step++;
      const t = window.setTimeout(scheduleStep, delay);
      timerRef.current.push(t);
    };

    scheduleStep();
  }, [spinning, remaining]);

  // Map grid position to prize index
  // Grid: row0=[0,1,2] row1=[7,C,3] row2=[6,5,4]
  const gridPrizes = [
    prizes[0], prizes[1], prizes[2],
    prizes[7], null,       prizes[3],
    prizes[6], prizes[5], prizes[4],
  ];
  const gridIndices = [0, 1, 2, 7, -1, 3, 6, 5, 4];

  if (loading) return <MemberLayout><CardGridSkeleton /></MemberLayout>;

  return (
    <MemberLayout>
      <div className="m-page-bg pb-24">
        {/* Header */}
        <div className="px-5 pt-7 pb-4">
          <h1 className="text-xl font-extrabold flex items-center gap-2">
            <Star className="h-5 w-5 text-rose" />
            幸运抽奖
          </h1>
          <p className="text-xs text-[hsl(var(--m-text-dim))] mt-1.5 font-medium">试试手气，赢取丰厚奖品</p>
        </div>

        {/* Spin Quota */}
        <div className="px-5 mb-6">
          <div className="m-glass p-5 flex items-center justify-between relative overflow-hidden" style={{ borderColor: 'hsl(var(--m-glow-gold) / 0.15)' }}>
            <div className="absolute inset-0 bg-gradient-to-r from-gold/[0.05] to-rose/[0.04] pointer-events-none rounded-[inherit]" />
            <div className="relative">
              <div className="text-sm text-gold-soft/70 font-bold">今日抽奖次数</div>
              <div className="text-2xl font-extrabold text-[hsl(var(--m-text))] mt-0.5">
                {remaining} <span className="text-sm font-bold text-[hsl(var(--m-text-dim)_/_0.4)]">/ {spinQuota.total}</span>
              </div>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-gold/15 flex items-center justify-center ring-1 ring-inset ring-gold/20 relative">
              <Trophy className="h-6 w-6 text-gold" />
            </div>
          </div>
        </div>

        {/* 3x3 Grid */}
        <div className="px-5 mb-7">
          <div className="m-glass p-5 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-gold/[0.03] to-transparent pointer-events-none rounded-[inherit]" />
            <div className="grid grid-cols-3 gap-3 relative">
              {gridPrizes.map((prize, i) => {
                const prizeIdx = gridIndices[i];
                const isCenter = prizeIdx === -1;
                return (
                  <PrizeCell
                    key={i}
                    prize={prize || undefined}
                    isCenter={isCenter}
                    isHighlighted={!isCenter && activeIndex === prizeIdx}
                    isWinner={!isCenter && winnerIndex === prizeIdx}
                    onSpin={isCenter ? startSpin : undefined}
                    spinning={spinning}
                    remaining={remaining}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {/* Probability Disclosure */}
        <div className="px-5 mb-7">
          <button className="w-full flex items-center justify-between py-2 text-xs text-[hsl(var(--m-text-dim))] hover:text-[hsl(var(--m-text))] transition font-bold">
            <span className="flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5" />
              奖品概率公示
            </span>
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <div className="m-glass p-4 mt-1.5">
            <div className="space-y-2">
              {prizes.map((p) => (
                <div key={p.id} className="flex items-center justify-between text-xs">
                  <span className="text-[hsl(var(--m-text-dim))] font-medium">{p.name}</span>
                  <span className="text-[hsl(var(--m-text-dim)_/_0.4)] font-mono font-bold">{p.probability}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Spin History */}
        <div className="px-5 mb-7">
          <div className="flex items-center gap-2 mb-3">
            <History className="h-4 w-4 text-[hsl(var(--m-text-dim))]" />
            <h3 className="text-base font-extrabold">抽奖记录</h3>
          </div>
          <div className="m-glass px-4">
            {history.map((item) => (
              <HistoryRow key={item.id} item={item} />
            ))}
          </div>
        </div>

        {/* Win Modal */}
        {showModal && wonPrize && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in"
            style={{ background: "hsl(var(--m-bg-1) / 0.85)", backdropFilter: "blur(12px)" }}
            onClick={() => setShowModal(false)}
          >
            <div
              className="w-[85vw] max-w-sm m-glass p-7 text-center relative overflow-hidden animate-scale-in"
              style={{ borderColor: 'hsl(var(--m-glow-gold) / 0.25)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="absolute inset-0 bg-gradient-to-b from-gold/[0.08] to-transparent pointer-events-none rounded-[inherit]" />
              <div className="relative">
                <div className="text-4xl mb-3">
                  {wonPrize.tier === "miss" ? "😅" : "🎉"}
                </div>
                <h2 className="text-xl font-extrabold text-gold-soft mb-2">
                  {wonPrize.tier === "miss" ? "再接再厉！" : "恭喜中奖！"}
                </h2>
                <p className="text-[hsl(var(--m-text)_/_0.7)] font-medium mb-1">{wonPrize.name}</p>
                {wonPrize.tier !== "miss" && (
                  <p className="text-xs text-[hsl(var(--m-text-dim))] mb-7">
                    奖品将在 24 小时内发放到您的账户
                  </p>
                )}
                {wonPrize.tier === "miss" && (
                  <p className="text-xs text-[hsl(var(--m-text-dim))] mb-7">
                    别灰心，好运就在下一次！
                  </p>
                )}
                <div className="space-y-2.5">
                  {remaining > 0 && (
                    <button
                      className="w-full py-2.5 btn-glow text-sm rounded-xl"
                      onClick={() => {
                        setShowModal(false);
                        setTimeout(startSpin, 300);
                      }}
                    >
                      再抽一次 🎰
                    </button>
                  )}
                  <button
                    className="w-full py-2.5 rounded-xl bg-[hsl(var(--m-surface)_/_0.5)] border border-[hsl(var(--m-surface-border)_/_0.3)] text-sm font-bold text-[hsl(var(--m-text-dim))] hover:text-[hsl(var(--m-text))] transition"
                    onClick={() => setShowModal(false)}
                  >
                    关闭
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </MemberLayout>
  );
}