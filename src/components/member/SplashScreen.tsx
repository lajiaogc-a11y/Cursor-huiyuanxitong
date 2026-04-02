/**
 * SplashScreen — 会员启动页（对齐 UI：深蓝底、蓝方标 + 闪电、标语、进度条）
 * 支持：固定时长 / 等待门户就绪 + 最短展示 / holdUntilUnmount（登录预载）
 */
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useState, useEffect, useRef, useCallback, type CSSProperties } from "react";
import { Zap } from "lucide-react";
import { useMemberResolvableMedia } from "@/hooks/useMemberResolvableMedia";
import { useLanguage } from "@/contexts/LanguageContext";

const DEFAULT_ACCENT = "#4d8cff";

const splashRingShadow = (accentHex: string): CSSProperties => ({
  background: accentHex,
  boxShadow: `0 0 48px color-mix(in srgb, ${accentHex} 50%, transparent), 0 12px 40px color-mix(in srgb, ${accentHex} 28%, transparent)`,
});

/**
 * pendingBrand: 仍在拉取门户设置、尚不确定是否有后台 Logo 时不显示默认闪电标，仅显示主题色块，避免「系统默认图标 → 公司 Logo」闪烁。
 */
function SplashBrandMark({
  logoUrl,
  accentHex,
  pendingBrand,
}: {
  logoUrl?: string | null;
  brandName: string;
  accentHex: string;
  pendingBrand?: boolean;
}) {
  const raw = String(logoUrl ?? "").trim();
  const { resolvedSrc, usePlaceholder, onImageError } = useMemberResolvableMedia("splash-brand-mark", raw || undefined);
  const [imgShown, setImgShown] = useState(false);
  /** 后台配置了 logo_url 时永不回退到闪电：解析中/失败时仅保留主题色块，避免「闪电 → 公司图」闪烁 */
  const hasBrandLogoUrl = Boolean(raw);
  const imageFailed = Boolean(resolvedSrc && usePlaceholder);
  const showImage = Boolean(resolvedSrc) && !imageFailed;

  useEffect(() => {
    setImgShown(false);
    if (!raw || !resolvedSrc || imageFailed) return;
    const pre = new Image();
    pre.onload = () => setImgShown(true);
    pre.onerror = () => setImgShown(true);
    pre.src = resolvedSrc;
  }, [raw, resolvedSrc, imageFailed]);

  if (hasBrandLogoUrl) {
    return (
      <div
        className="member-splash-logo-ring flex h-[88px] w-[88px] items-center justify-center overflow-hidden rounded-[22px] p-0"
        style={splashRingShadow(accentHex) as CSSProperties}
      >
        {showImage ? (
          <img
            src={resolvedSrc}
            alt=""
            className="h-full w-full object-cover transition-opacity duration-200 motion-reduce:transition-none"
            style={{ opacity: imgShown ? 1 : 0 }}
            loading="eager"
            fetchPriority="high"
            onLoad={() => setImgShown(true)}
            onError={onImageError}
          />
        ) : null}
      </div>
    );
  }

  if (pendingBrand) {
    return (
      <div
        className="member-splash-logo-ring flex h-[88px] w-[88px] items-center justify-center rounded-[22px]"
        style={splashRingShadow(accentHex) as CSSProperties}
        aria-hidden
      />
    );
  }

  return (
    <div
      className="member-splash-logo-ring flex h-[88px] w-[88px] items-center justify-center rounded-[22px]"
      style={splashRingShadow(accentHex) as CSSProperties}
    >
      <Zap
        className="h-11 w-11"
        stroke="#0a0f18"
        fill="none"
        strokeWidth={2.35}
        aria-hidden
      />
    </div>
  );
}

interface SplashScreenProps {
  /** 兼容旧用法：未传 minDurationMs 时作唯一倒计时 */
  duration?: number;
  onComplete?: () => void;
  brandName?: string;
  /** 主题主色 hex，默认 FastGC 蓝 */
  accentColor?: string;
  logoUrl?: string | null;
  /** 为 true 时尚未确定租户是否有 Logo，不显示默认闪电，仅主题色占位 */
  pendingBrand?: boolean;
  holdUntilUnmount?: boolean;
  showSkip?: boolean;
  /** 最短展示时间（ms），与 dismissWhenReady 同时满足才关闭 */
  minDurationMs?: number;
  /** 超过后强制关闭（避免网络差时长期停在启动页），优先于「等就绪」 */
  maxDurationMs?: number;
  /** 为 true 且已过最短展示时间后关闭（如门户 settings 首屏拉取完成） */
  dismissWhenReady?: boolean;
}

export default function SplashScreen({
  duration = 1800,
  onComplete,
  brandName = "FastGC",
  accentColor,
  logoUrl,
  pendingBrand = false,
  holdUntilUnmount = false,
  showSkip,
  minDurationMs,
  maxDurationMs,
  dismissWhenReady,
}: SplashScreenProps) {
  const [visible, setVisible] = useState(true);
  const reduceMotion = useReducedMotion();
  const { t } = useLanguage();
  const visibleRef = useRef(true);
  /** 组件挂载时刻，不随 dismissWhenReady 依赖重跑而重置 */
  const splashStartedAtRef = useRef(Date.now());
  const accentHex = /^#[0-9A-Fa-f]{6}$/i.test(String(accentColor || "").trim())
    ? String(accentColor).trim()
    : DEFAULT_ACCENT;

  const dismiss = useCallback(() => {
    visibleRef.current = false;
    setVisible(false);
    onComplete?.();
  }, [onComplete]);

  const allowSkip = !holdUntilUnmount && showSkip === true;

  useEffect(() => {
    if (holdUntilUnmount) return undefined;
    const minMs = minDurationMs ?? duration;
    const useReady = dismissWhenReady !== undefined;

    const tick = () => {
      if (!visibleRef.current) return;
      const elapsed = Date.now() - splashStartedAtRef.current;
      if (maxDurationMs != null && elapsed >= maxDurationMs) {
        dismiss();
        return;
      }
      const minOk = elapsed >= minMs;
      const readyOk = useReady ? Boolean(dismissWhenReady) : true;
      if (minOk && readyOk) dismiss();
    };

    const id = window.setInterval(tick, 48);
    tick();
    return () => window.clearInterval(id);
  }, [holdUntilUnmount, dismissWhenReady, minDurationMs, maxDurationMs, duration, dismiss]);

  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  /** 有 maxDurationMs 时进度条与「最长等待」对齐，避免条已跑满却仍停在启动页 */
  const barMs = Math.max(
    400,
    (maxDurationMs ?? minDurationMs ?? duration) - 200,
  );

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="member-splash-screen fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden px-6"
          style={{
            background: "hsl(222 48% 5%)",
          }}
        >
          <motion.div
            initial={reduceMotion ? { scale: 1, opacity: 1 } : { scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-[1] flex flex-col items-center gap-5"
          >
            <SplashBrandMark logoUrl={logoUrl} brandName={brandName} accentHex={accentHex} pendingBrand={pendingBrand} />
            <div className="flex flex-col items-center gap-2 text-center">
              <h1
                id="splash-brand-title"
                className="m-0 text-[1.65rem] font-extrabold tracking-tight text-white"
                style={{ textShadow: "0 1px 24px rgba(0,0,0,0.35)" }}
              >
                {brandName}
              </h1>
              <p
                className="m-0 max-w-[280px] text-[13px] font-medium leading-snug"
                style={{ color: `color-mix(in srgb, ${accentHex} 82%, white)` }}
              >
                {t("您的奖励，更简单。", "Your Rewards, Simplified.")}
              </p>
            </div>
            <p className="sr-only">{t("正在加载会员中心", "Loading member portal")}</p>
            <div
              className="mt-2 h-1.5 w-[min(200px,72vw)] overflow-hidden rounded-full bg-white/[0.08]"
              aria-hidden
            >
              <motion.div
                initial={{ width: reduceMotion ? "100%" : "0%" }}
                animate={{ width: "100%" }}
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : { duration: barMs / 1000, ease: [0.4, 0, 0.2, 1] }
                }
                className="h-full rounded-full"
                style={{
                  background: `linear-gradient(90deg, ${accentHex}, color-mix(in srgb, ${accentHex} 75%, white))`,
                  boxShadow: `0 0 20px color-mix(in srgb, ${accentHex} 40%, transparent)`,
                }}
              />
            </div>
          </motion.div>
          {allowSkip ? (
            <div className="absolute bottom-[max(20px,env(safe-area-inset-bottom))] left-0 right-0 z-[2] flex justify-center px-6">
              <button
                type="button"
                onClick={dismiss}
                className="rounded-full border border-white/10 bg-white/[0.06] px-5 py-2 text-xs font-bold text-white/55 backdrop-blur-sm transition motion-reduce:transition-none hover:bg-white/[0.1] hover:text-white/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
              >
                {t("跳过", "Skip")}
              </button>
            </div>
          ) : null}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
