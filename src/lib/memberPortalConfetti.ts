import confetti from "canvas-confetti";

function reducedMotion(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** 抽奖中奖（对齐 premium-ui-boost 撒花；谢谢参与不调用） */
export function fireMemberSpinWinConfetti(
  tier: "legendary" | "epic" | "rare" | "common",
): void {
  if (reducedMotion()) return;
  const defaults = { startVelocity: 28, spread: 360, ticks: 72, zIndex: 9999 };
  const n = tier === "legendary" ? 88 : tier === "epic" ? 72 : tier === "rare" ? 56 : 46;
  void confetti({ ...defaults, particleCount: n, origin: { x: 0.5, y: 0.42 } });
  window.setTimeout(() => {
    void confetti({ ...defaults, particleCount: Math.floor(n * 0.42), origin: { x: 0.28, y: 0.58 } });
    void confetti({ ...defaults, particleCount: Math.floor(n * 0.42), origin: { x: 0.72, y: 0.58 } });
  }, 180);
}

/** 邀请链接复制成功（轻量，不遮挡 Toast） */
export function fireMemberInviteCopyConfetti(): void {
  if (reducedMotion()) return;
  const colors = ["#d4a745", "#34d399", "#f5c842"];
  void confetti({
    particleCount: 52,
    spread: 58,
    origin: { y: 0.62, x: 0.5 },
    colors,
    gravity: 0.82,
    zIndex: 9999,
    ticks: 64,
  });
  window.setTimeout(() => {
    void confetti({
      particleCount: 32,
      spread: 72,
      origin: { y: 0.52, x: 0.32 },
      colors,
      gravity: 0.75,
      zIndex: 9999,
      ticks: 56,
    });
    void confetti({
      particleCount: 32,
      spread: 72,
      origin: { y: 0.52, x: 0.68 },
      colors,
      gravity: 0.75,
      zIndex: 9999,
      ticks: 56,
    });
  }, 160);
}
