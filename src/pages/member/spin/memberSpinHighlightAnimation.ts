import { playMemberSpinTick } from "./memberSpinAudio";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * 九宫格高亮跑马灯动画；返回 cancel 用于组件卸载或新一轮抽奖前中止。
 *
 * 动画结束后高亮会停留在目标格子上 SETTLE_MS 毫秒，让用户清晰看到
 * 落点再弹出结果。
 */
const SETTLE_MS = 600;

export function runMemberSpinHighlightAnimation(
  targetIdx: number,
  prizeCount: number,
  setActiveIndex: (idx: number) => void,
  onDone: () => void,
): () => void {
  if (prefersReducedMotion()) {
    setActiveIndex(targetIdx);
    const id = window.setTimeout(() => onDone(), SETTLE_MS) as unknown as number;
    return () => window.clearTimeout(id);
  }

  const count = prizeCount || 8;
  const fullLoops = 3;
  const totalSteps = count * fullLoops + targetIdx;
  let step = 0;
  let delay = 55;
  let timeoutId: number | null = null;

  const cancel = () => {
    if (timeoutId != null) {
      window.clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  const tick = () => {
    const idx = step % count;
    setActiveIndex(idx);
    playMemberSpinTick(1 + (step / totalSteps) * 0.5);
    step++;

    if (step > totalSteps) {
      // setActiveIndex(targetIdx) 已在本 tick 开头执行（idx = totalSteps % count = targetIdx）。
      // 延迟 SETTLE_MS 后再回调，让 React 先渲染"高亮停在目标格"，用户能清晰看到落点。
      timeoutId = window.setTimeout(() => {
        timeoutId = null;
        onDone();
      }, SETTLE_MS) as unknown as number;
      return;
    }

    const progress = step / totalSteps;
    if (progress < 0.5) {
      delay = Math.max(40, 55 - progress * 30);
    } else {
      delay = 55 + (progress - 0.5) * 500;
    }

    timeoutId = window.setTimeout(tick, delay) as unknown as number;
  };

  tick();
  return cancel;
}
