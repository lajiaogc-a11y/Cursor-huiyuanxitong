type MemberHashAnchorScrollOptions = {
  behavior?: ScrollBehavior;
  block?: ScrollLogicalPosition;
  maxFrames?: number;
  onFound?: () => void;
};

/**
 * Resolve a hash anchor with rAF retries so we don't rely on arbitrary setTimeout delays.
 * Returns a cleanup function to cancel pending frames.
 */
export function scrollToMemberHashAnchor(
  hash: string,
  {
    behavior = "smooth",
    block = "start",
    maxFrames = 18,
    onFound,
  }: MemberHashAnchorScrollOptions = {},
): () => void {
  const id = String(hash || "").replace(/^#/, "").trim();
  if (!id) return () => {};

  let frame = 0;
  let rafId = 0;
  let cancelled = false;

  const tick = () => {
    if (cancelled) return;
    const el = document.getElementById(id);
    if (el) {
      onFound?.();
      el.scrollIntoView({ behavior, block });
      return;
    }
    frame += 1;
    if (frame >= maxFrames) return;
    rafId = window.requestAnimationFrame(tick);
  };

  rafId = window.requestAnimationFrame(tick);

  return () => {
    cancelled = true;
    if (rafId) window.cancelAnimationFrame(rafId);
  };
}
