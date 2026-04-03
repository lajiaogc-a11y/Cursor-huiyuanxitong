import { useState, useEffect, useCallback, type CSSProperties } from "react";
import { useLocation, Navigate, Link } from "react-router-dom";
import {
  User,
  Lock,
  Camera,
  ChevronRight,
  ChevronDown,
  LogOut,
  ShoppingCart,
  ShieldCheck,
  Coins,
  Loader2,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMemberAuth } from "@/contexts/MemberAuthContext";
import { ROUTES } from "@/routes/constants";
import { useMemberLocalAvatar } from "@/hooks/useMemberLocalAvatar";
import { MemberPointsAccountSettings } from "@/components/member/MemberPointsAccountSettings";
import { useLanguage } from "@/contexts/LanguageContext";
import { displayMemberLevelLabel } from "@/lib/memberLevelDisplay";
import { mapDbRowToMemberPortalOrderView, type MemberPortalOrderView } from "@/hooks/orders/utils";
import { resolveCardName, tryRecoverMisdecodedUtf8 } from "@/services/members/nameResolver";
import { notify } from "@/lib/notifyHub";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { memberQueryKeys } from "@/lib/memberQueryKeys";
import { useMemberPortalSettings } from "@/hooks/useMemberPortalSettings";
import { memberGetOrdersRows, memberUpdateNickname } from "@/services/memberPortal/memberActivityService";
import {
  getMemberPointsLedgerRpc,
  type MemberLedgerCategory,
  type MemberPointsLedgerRow,
} from "@/services/points/memberPointsRpcService";
import { formatMemberLocalTime } from "@/lib/memberLocalTime";
import { formatMemberLedgerRowOrderDisplay } from "@/lib/memberLedgerIdDisplay";
import { ledgerActivityTypeLabel } from "@/lib/memberLedgerTypeLabel";
import { useMemberResolvableMedia } from "@/hooks/useMemberResolvableMedia";
import { broadcastMembersListStale, notifyDataMutation } from "@/services/system/dataRefreshManager";
import "@/styles/member-portal.css";
import { DrawerDetail } from "@/components/shell/DrawerDetail";
import { cn } from "@/lib/utils";
import { MemberPageAmbientOrbs } from "@/components/member/MemberPageAmbientOrbs";
import { MemberPointsValueSkeleton, MemberStackedRowSkeleton } from "@/components/member/MemberPageLoadingShell";
import { MemberEmptyStateCta } from "@/components/member/MemberEmptyStateCta";
import { useMemberPointsBreakdown } from "@/hooks/useMemberPointsBreakdown";
import { useMemberAnimatedCount } from "@/hooks/useMemberAnimatedCount";
import { useMemberSkeletonGate } from "@/hooks/useMemberSkeletonGate";
import { useMemberPullRefreshSignal } from "@/hooks/useMemberPullRefreshSignal";

function MemberSettingsSupportAgentAvatar({
  agent,
  idx,
}: {
  agent: { name: string; link: string; avatar_url?: string | null };
  idx: number;
}) {
  const raw = String(agent.avatar_url ?? "").trim();
  const { resolvedSrc, usePlaceholder, onImageError } = useMemberResolvableMedia(
    `settings-cs-${idx}-${agent.link}`,
    raw || undefined,
  );
  const showImg = raw && !usePlaceholder;
  if (showImg) {
    return (
      <img
        src={resolvedSrc}
        alt={agent.name}
        loading="lazy"
        decoding="async"
        onError={onImageError}
        className="h-9 w-9 shrink-0 rounded-full border border-[hsl(var(--pu-m-surface-border)/0.35)] object-cover ring-1 ring-inset ring-pu-gold/10"
      />
    );
  }
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#25D366] to-[#128C7E] text-sm font-bold text-[hsl(var(--pu-m-bg-1))] shadow-sm ring-1 ring-inset ring-[hsl(var(--pu-m-bg-1)/0.2)]">
      {String(agent.name).charAt(0).toUpperCase()}
    </div>
  );
}

function formatMemberSettingsPhone(raw: string | null | undefined): string {
  const s = String(raw ?? "").trim();
  return s;
}

function fmtSettingsLedgerPts(n: number) {
  return Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function MemberSettingsLedgerCard({
  row,
  ledgerCategory,
  themeColor,
  t,
}: {
  row: MemberPointsLedgerRow;
  ledgerCategory: MemberLedgerCategory;
  themeColor: string;
  t: (zh: string, en: string) => string;
}) {
  const isAll = ledgerCategory === "all";
  const pts = Number(row.points);
  const isNeg = pts < 0;
  const bb = Number(row.balance_before);
  const ba = Number(row.balance_after);
  const dur = 520;
  const animPts = useMemberAnimatedCount(pts, { enabled: true, durationMs: dur });
  const animBb = useMemberAnimatedCount(bb, { enabled: true, durationMs: dur + 70 });
  const animBa = useMemberAnimatedCount(ba, { enabled: true, durationMs: dur + 140 });
  const orderFmt = formatMemberLedgerRowOrderDisplay(row);
  const orderDisplay = orderFmt.display;
  const orderTitle = row.order_number ? undefined : orderFmt.fullTitle;
  const idLabel =
    isAll && !row.order_id && !row.reference_id && row.description
      ? t("类型", "Type")
      : t("订单号", "Order ID");
  const idDisplay =
    isAll && !row.order_id && !row.reference_id && row.description
      ? row.description
      : orderDisplay;
  const typeLabel = ledgerActivityTypeLabel(row.type, t);

  return (
    <div className="member-ledger-card">
      <div className="member-ledger-card__row">
        <div className="flex items-center gap-1.5">
          <span className="member-ledger-card__label">{idLabel}</span>
          {isAll && (
            <span
              className={cn(
                "rounded-md px-1.5 py-px text-[9px] font-semibold",
                isNeg ? "bg-pu-rose/12 text-rose-300" : "bg-pu-emerald/12 text-emerald-300",
              )}
            >
              {typeLabel}
            </span>
          )}
        </div>
        <span
          className={cn("shrink-0 text-[15px] font-extrabold tabular-nums", isNeg ? "text-rose-300" : "")}
          style={!isNeg ? { color: themeColor } : undefined}
        >
          {isNeg ? "" : "+"}
          {fmtSettingsLedgerPts(animPts)}
        </span>
      </div>
      <div className="member-ledger-card__id" title={orderTitle}>
        {idDisplay}
      </div>
      <div className="mt-1.5 flex items-center justify-between">
        <span className="member-ledger-card__time m-0">{formatMemberLocalTime(row.earned_at)}</span>
        <span className="tabular-nums text-[10px] text-[hsl(var(--pu-m-text-dim)/0.45)]">
          {fmtSettingsLedgerPts(animBb)} → {fmtSettingsLedgerPts(animBa)}
        </span>
      </div>
    </div>
  );
}

export default function MemberSettings() {
  const location = useLocation();
  const { t, language } = useLanguage();
  const { member, setPassword, refreshMember, signOut } = useMemberAuth();
  const { avatarUrl: settingsAvatarUrl, setFromFile: setSettingsAvatarFromFile, clear: clearSettingsAvatar } =
    useMemberLocalAvatar(member?.id, member?.avatar_url, () => {
      void refreshMember();
    });
  const [nickname, setNickname] = useState(member?.nickname || "");
  const [pwdOld, setPwdOld] = useState("");
  const [pwdNew, setPwdNew] = useState("");
  const [pwdConfirm, setPwdConfirm] = useState("");
  const [expandedSection, setExpandedSection] = useState<"avatar" | "nickname" | "password" | null>(null);
  const { settings: portalSettings } = useMemberPortalSettings(member?.id);
  const themeColor = (() => {
    const c = String(portalSettings.theme_primary_color || "").trim();
    return /^#[0-9A-Fa-f]{6}$/i.test(c) ? c : "#4d8cff";
  })();

  const settingsInputClass =
    "h-12 rounded-xl border-[hsl(var(--pu-m-surface-border)/0.35)] bg-[hsl(var(--pu-m-surface)/0.35)] pl-10 text-[hsl(var(--pu-m-text))] placeholder:text-[hsl(var(--pu-m-text-dim)/0.45)] focus-visible:border-[color:var(--pu-settings-theme)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--pu-settings-theme),transparent_80%)]";

  useEffect(() => { setNickname(member?.nickname || ""); }, [member?.nickname]);

  const settingsHeaderMediaId = String(member?.id ?? "settings");
  const {
    resolvedSrc: settingsHeaderResolvedSrc,
    usePlaceholder: settingsHeaderUsePlaceholder,
    onImageError: settingsHeaderImgError,
  } = useMemberResolvableMedia(settingsHeaderMediaId, settingsAvatarUrl || undefined);

  const [savingNickname, setSavingNickname] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);
  const [expandedOrders, setExpandedOrders] = useState(false);
  const [expandedPointsLedger, setExpandedPointsLedger] = useState(false);
  const [ledgerCategory, setLedgerCategory] = useState<MemberLedgerCategory>("all");
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [pageVisible, setPageVisible] = useState(
    () => typeof document !== "undefined" && document.visibilityState === "visible",
  );

  useEffect(() => {
    const onVis = () => setPageVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    if (location.hash !== "#member-contact-support") return;
    const id = window.setTimeout(() => {
      document.getElementById("member-contact-support")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
    return () => window.clearTimeout(id);
  }, [location.pathname, location.hash]);

  useEffect(() => {
    if (location.hash !== "#orders") return;
    setExpandedOrders(true);
    const id = window.setTimeout(() => {
      document.getElementById("orders")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
    return () => window.clearTimeout(id);
  }, [location.pathname, location.hash]);

  const memberId = member?.id;
  const { data: memberOrders = [], isLoading: ordersLoading, isFetching: ordersFetching } = useQuery({
    queryKey: memberId ? memberQueryKeys.orders(memberId) : ["member", "orders", "__none"],
    queryFn: async (): Promise<MemberPortalOrderView[]> => {
      if (!memberId) return [];
      const rows = await memberGetOrdersRows(memberId);
      return rows.map((r) => mapDbRowToMemberPortalOrderView(r as Record<string, unknown>));
    },
    enabled: !!memberId,
    refetchInterval: expandedOrders && pageVisible ? 30_000 : false,
    refetchIntervalInBackground: false,
  });

  const LEDGER_PAGE = 50;
  const [ledgerAllRows, setLedgerAllRows] = useState<MemberPointsLedgerRow[]>([]);
  const [ledgerTotalCount, setLedgerTotalCount] = useState(0);
  const [ledgerLoadingMore, setLedgerLoadingMore] = useState(false);

  const { isLoading: ledgerLoading, isFetching: ledgerFetching } = useQuery({
    queryKey: memberId ? memberQueryKeys.pointsLedger(memberId, ledgerCategory) : ["member", "pointsLedger", "__none"],
    queryFn: async () => {
      if (!memberId) return { success: false as const, rows: [] as MemberPointsLedgerRow[], total: 0 };
      const r = await getMemberPointsLedgerRpc(memberId, ledgerCategory, LEDGER_PAGE, 0);
      if (r.success) {
        setLedgerAllRows(r.rows);
        setLedgerTotalCount(r.total);
      }
      return r;
    },
    enabled: !!memberId && expandedPointsLedger,
    staleTime: 20_000,
    refetchInterval: expandedPointsLedger && pageVisible ? 30_000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  const loadMoreLedger = useCallback(async () => {
    if (!memberId || ledgerLoadingMore || ledgerAllRows.length >= ledgerTotalCount) return;
    setLedgerLoadingMore(true);
    try {
      const r = await getMemberPointsLedgerRpc(memberId, ledgerCategory, LEDGER_PAGE, ledgerAllRows.length);
      if (r.success) {
        setLedgerAllRows((prev) => [...prev, ...r.rows]);
        setLedgerTotalCount(r.total);
      }
    } finally {
      setLedgerLoadingMore(false);
    }
  }, [memberId, ledgerLoadingMore, ledgerAllRows.length, ledgerTotalCount, ledgerCategory]);

  const ledgerRows = ledgerAllRows;
  const ledgerTotal = ledgerTotalCount;
  const hasMoreLedger = ledgerAllRows.length < ledgerTotalCount;

  const {
    breakdown: settingsPtsBreakdown,
    loading: settingsPtsLoading,
    error: settingsPtsError,
  } = useMemberPointsBreakdown(memberId);
  const settingsTotalRemaining = settingsPtsBreakdown.balance;
  const settingsPendingMall = settingsPtsBreakdown.pending_mall_points;
  const settingsAvailablePoints = Math.max(
    0,
    Math.round((settingsTotalRemaining - settingsPendingMall) * 100) / 100,
  );
  const settingsPtsAnimOn = Boolean(memberId) && !settingsPtsLoading && !settingsPtsError;
  const animSettingsTotal = useMemberAnimatedCount(settingsTotalRemaining, {
    enabled: settingsPtsAnimOn,
    durationMs: 780,
  });
  const animSettingsAvail = useMemberAnimatedCount(settingsAvailablePoints, {
    enabled: settingsPtsAnimOn,
    durationMs: 880,
  });
  const animSettingsFrozen = useMemberAnimatedCount(settingsPendingMall, {
    enabled: settingsPtsAnimOn,
    durationMs: 980,
  });

  const showSettingsPtsSkeleton = useMemberSkeletonGate(settingsPtsLoading);
  const showLedgerSkeleton = useMemberSkeletonGate(ledgerLoading || ledgerFetching);
  const showOrdersSkeleton = useMemberSkeletonGate(ordersLoading);

  const queryClient = useQueryClient();
  useMemberPullRefreshSignal(() => {
    if (!member?.id) return;
    const mid = member.id;
    void queryClient.invalidateQueries({ queryKey: memberQueryKeys.orders(mid) });
    void queryClient.invalidateQueries({ queryKey: ["member", "pointsLedger", mid] });
    void queryClient.invalidateQueries({ queryKey: memberQueryKeys.pointsBreakdown(mid) });
    void refreshMember();
  });

  const handleSaveNickname = async () => {
    if (!member) return;
    setSavingNickname(true);
    try {
      const r = await memberUpdateNickname(member.id, nickname);
      if (!r?.success) throw new Error(r?.error || t("失败", "Failed"));
      await refreshMember();
      broadcastMembersListStale();
      void queryClient.invalidateQueries({ queryKey: memberQueryKeys.profile(member.id) });
      void notifyDataMutation({ table: "members", operation: "UPDATE", source: "mutation" });
      notify.success(t("昵称已更新", "Nickname updated"));
      setExpandedSection(null);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : t("操作失败", "Failed"));
    }
    finally { setSavingNickname(false); }
  };

  const handleChangePassword = async (values: { oldPwd: string; newPwd: string; confirmPwd: string }) => {
    if (values.newPwd.length < 6) { notify.error(t("新密码至少 6 位", "Min 6 characters")); return; }
    if (values.newPwd !== values.confirmPwd) { notify.error(t("两次新密码不一致", "Passwords don't match")); return; }
    setSavingPwd(true);
    try {
      const result = await setPassword(values.oldPwd, values.newPwd);
      if (result.success) {
        notify.success(result.message);
        setPwdOld("");
        setPwdNew("");
        setPwdConfirm("");
        setExpandedSection(null);
      }
      else notify.error(result.message);
    } finally { setSavingPwd(false); }
  };

  if (!member) return <Navigate to={ROUTES.MEMBER.ROOT} replace />;
  const displayName = member.nickname || member.member_code || member.phone_number;
  /** 与员工端/库中 member_level 一致，随后台配置变化 */
  const tierLabel =
    displayMemberLevelLabel(member.member_level, member.member_level_zh, language) ||
    t("VIP 会员", "VIP Member");
  const phoneDisplay = formatMemberSettingsPhone(member.phone_number);
  const codeDisplay = String(member.member_code ?? "").trim();
  const avatarLetter = String(displayName || "?").trim().charAt(0).toUpperCase() || "?";
  const fmtSettingsPts = (n: number) =>
    Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  return (
    <div
      className="member-page-enter m-page-bg relative flex min-h-full flex-col pb-24 lg:mx-auto lg:w-full lg:max-w-[960px] lg:px-6 lg:py-6"
      style={{ ["--pu-settings-theme" as string]: themeColor } as CSSProperties}
    >
      <div className="relative overflow-hidden">
        <MemberPageAmbientOrbs />
        <div className="relative z-[1] px-5 pb-2 pt-6">
          <div className="mb-6 flex items-start gap-4 rounded-xl">
            <div className="relative shrink-0">
              <div
                className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl text-2xl font-extrabold text-[hsl(var(--pu-primary-foreground))] shadow-pu-glow-gold"
                style={
                  settingsAvatarUrl
                    ? { background: "rgba(0,0,0,0.2)", boxShadow: "none" }
                    : {
                        background:
                          "linear-gradient(135deg, hsl(var(--pu-gold)), hsl(var(--pu-gold-soft)))",
                      }
                }
              >
                {settingsAvatarUrl && !settingsHeaderUsePlaceholder ? (
                  <img
                    src={settingsHeaderResolvedSrc}
                    alt=""
                    className="h-full w-full object-cover"
                    onError={settingsHeaderImgError}
                  />
                ) : (
                  <span className="tabular-nums">{avatarLetter}</span>
                )}
              </div>
              <button
                type="button"
                className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-lg border border-[hsl(var(--pu-m-surface-border)/0.5)] bg-[hsl(var(--pu-m-surface))] transition active:scale-95"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpandedSection(expandedSection === "avatar" ? null : "avatar");
                }}
                aria-label={t("账户设置", "Account settings")}
              >
                <Camera className="h-3 w-3 text-[hsl(var(--pu-m-text-dim))]" aria-hidden />
              </button>
            </div>
            <div className="min-w-0 flex-1 pt-1">
              <h2 className="truncate text-lg font-extrabold text-[hsl(var(--pu-m-text))]" title={displayName}>
                {displayName}
              </h2>
              <div className="mt-1 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-pu-emerald" />
                <span className="text-xs font-semibold text-pu-emerald-soft">{t("正常", "Active")}</span>
              </div>
            </div>
            <div className="max-w-[120px] shrink-0 pt-1.5">
              <div
                className="flex items-center gap-1.5 rounded-xl border border-pu-gold/25 px-3 py-1.5"
                style={{
                  background: "linear-gradient(135deg, hsl(var(--pu-gold) / 0.14), hsl(var(--pu-gold-soft) / 0.08))",
                  boxShadow: "0 2px 12px -4px hsl(var(--pu-gold) / 0.28)",
                }}
                title={tierLabel}
              >
                <span className="shrink-0 text-[10px] font-bold text-[hsl(var(--pu-m-text-dim))]">LV</span>
                <span className="truncate text-sm font-extrabold text-pu-gold-soft">{tierLabel}</span>
              </div>
            </div>
          </div>

          {showSettingsPtsSkeleton ? (
            <div
              className="mb-3 grid grid-cols-3 gap-1 rounded-xl border border-pu-gold/14 bg-[hsl(var(--pu-m-surface)/0.22)] p-3"
              role="status"
              aria-busy="true"
              aria-label={t("加载积分…", "Loading points…")}
            >
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="min-w-0 text-center">
                  <div
                    className="mx-auto mb-1 h-2 w-10 animate-pulse rounded bg-[hsl(var(--pu-m-surface)/0.38)] motion-reduce:animate-none"
                    aria-hidden
                  />
                  <MemberPointsValueSkeleton className="mx-auto h-6 w-[4.25rem] max-w-[92%]" />
                </div>
              ))}
            </div>
          ) : settingsPtsError ? (
            <p className="mb-3 rounded-xl border border-rose-500/25 bg-rose-500/[0.06] px-4 py-3 text-center text-[12px] text-rose-300">
              {t("积分加载失败", "Could not load points")}
            </p>
          ) : (
            <Link
              to={ROUTES.MEMBER.POINTS}
              className="mb-3 grid grid-cols-3 gap-1 rounded-xl border border-pu-gold/18 bg-gradient-to-b from-pu-gold/[0.07] to-[hsl(var(--pu-m-surface)/0.32)] p-3 text-[hsl(var(--pu-m-text))] shadow-sm outline-none ring-offset-[hsl(var(--pu-m-bg-1))] transition hover:border-pu-gold/28 hover:from-pu-gold/[0.09] focus-visible:ring-2 focus-visible:ring-pu-gold/35"
            >
              <div className="min-w-0 text-center">
                <div className="mb-1 text-[8px] font-bold uppercase tracking-wider text-[hsl(var(--pu-m-text-dim)/0.75)]">
                  {t("总积分", "Total points")}
                </div>
                <div
                  className="truncate text-[13px] font-extrabold tabular-nums"
                  style={{ color: themeColor }}
                  title={fmtSettingsPts(animSettingsTotal)}
                >
                  {fmtSettingsPts(animSettingsTotal)}
                </div>
              </div>
              <div className="min-w-0 text-center border-x border-pu-gold/[0.15]">
                <div className="mb-1 text-[8px] font-bold uppercase tracking-wider text-[hsl(var(--pu-m-text-dim)/0.75)]">
                  {t("可用积分", "Available points")}
                </div>
                <div
                  className="truncate text-[13px] font-extrabold tabular-nums text-pu-emerald-soft"
                  title={fmtSettingsPts(animSettingsAvail)}
                >
                  {fmtSettingsPts(animSettingsAvail)}
                </div>
              </div>
              <div className="min-w-0 text-center">
                <div className="mb-1 text-[8px] font-bold uppercase tracking-wider text-[hsl(var(--pu-m-text-dim)/0.75)]">
                  {t("冻结积分", "Frozen points")}
                </div>
                <div
                  className="truncate text-[13px] font-extrabold tabular-nums text-[hsl(var(--pu-m-text-dim)/0.88)]"
                  title={fmtSettingsPts(animSettingsFrozen)}
                >
                  {fmtSettingsPts(animSettingsFrozen)}
                </div>
              </div>
            </Link>
          )}

          <div className="mb-2 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-pu-gold/18 bg-gradient-to-b from-pu-gold/[0.06] to-[hsl(var(--pu-m-surface)/0.38)] px-4 py-3.5 text-center shadow-sm">
              <div className="mb-1.5 text-[9px] font-bold uppercase tracking-widest text-[hsl(var(--pu-m-text-dim))]">
                {t("手机号", "Phone")}
              </div>
              <div className="truncate font-mono text-sm font-extrabold tracking-wide text-[hsl(var(--pu-m-text))]" title={phoneDisplay || undefined}>
                {phoneDisplay || "—"}
              </div>
            </div>
            <div className="rounded-xl border border-pu-gold/18 bg-gradient-to-b from-pu-gold/[0.06] to-[hsl(var(--pu-m-surface)/0.38)] px-4 py-3.5 text-center shadow-sm">
              <div className="mb-1.5 text-[9px] font-bold uppercase tracking-widest text-[hsl(var(--pu-m-text-dim))]">
                {t("会员码", "Member code")}
              </div>
              <div
                className={`truncate font-mono text-sm font-extrabold tracking-wide ${codeDisplay ? "text-[hsl(var(--pu-m-text))]" : "text-[hsl(var(--pu-m-text-dim))]"}`}
                title={codeDisplay || undefined}
              >
                {codeDisplay || t("未分配", "Not assigned")}
              </div>
            </div>
          </div>
        </div>
      </div>

        {/* ── Content ── */}
        <div className="member-page-body flex flex-1 flex-col">
          <div className="mb-5">
            <h3 className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-pu-gold-soft/90">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-pu-gold-soft/90" aria-hidden />
              {t("账号管理", "ACCOUNT")}
            </h3>
            <div className="m-glass overflow-hidden rounded-2xl border border-pu-gold/12">
            <div className="member-settings-row">
              <button
                type="button"
                className="member-settings-trigger"
                onClick={() => setExpandedSection(expandedSection === "avatar" ? null : "avatar")}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ring-[hsl(var(--pu-m-surface-border)/0.32)]"
                    style={{ background: `color-mix(in srgb, ${themeColor} 14%, transparent)` }}
                  >
                    <Camera size={15} color={themeColor} />
                  </div>
                  <div className="min-w-0 text-left">
                    <p className="m-0 text-sm font-semibold text-[hsl(var(--pu-m-text))]">
                      {t("账户设置", "Account settings")}
                    </p>
                    <p className="m-0 text-xs text-[hsl(var(--pu-m-text-dim)/0.55)]">
                      {t("头像与资料照片", "Profile photo")}
                    </p>
                  </div>
                </div>
                <ChevronRight
                  size={12}
                  className={cn(
                    "shrink-0 text-[hsl(var(--pu-m-text-dim)/0.35)] transition-transform duration-200",
                    expandedSection === "avatar" && "rotate-90",
                  )}
                />
              </button>
              {expandedSection === "avatar" && (
                <div className="member-settings-expand">
                  <MemberPointsAccountSettings
                    variant="inline"
                    avatarUrl={settingsAvatarUrl}
                    displayInitial={displayName}
                    onPickAvatar={setSettingsAvatarFromFile}
                    onClearAvatar={clearSettingsAvatar}
                    t={t}
                  />
                </div>
              )}
            </div>

            <div className="member-settings-row">
              <button type="button" className="member-settings-trigger" onClick={() => setExpandedSection(expandedSection === "nickname" ? null : "nickname")}>
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]"
                    style={{ background: `color-mix(in srgb, ${themeColor} 14%, transparent)` }}
                  >
                    <User size={15} color={themeColor} />
                  </div>
                  <div className="min-w-0 text-left">
                    <p className="m-0 text-sm font-semibold text-[hsl(var(--pu-m-text))]">
                      {t("修改昵称", "Change nickname")}
                    </p>
                    <p className="m-0 text-xs text-[hsl(var(--pu-m-text-dim)/0.55)]">
                      {member.nickname || t("未设置", "Not set")}
                    </p>
                  </div>
                </div>
                <ChevronRight
                  size={12}
                  className={cn(
                    "shrink-0 text-[hsl(var(--pu-m-text-dim)/0.35)] transition-transform duration-200",
                    expandedSection === "nickname" && "rotate-90",
                  )}
                />
              </button>
              {expandedSection === "nickname" && (
                <div className="member-settings-expand">
                  <div className="flex flex-wrap gap-2">
                    <div className="relative min-w-0 flex-[1_1_160px]">
                      <User
                        size={16}
                        color={themeColor}
                        className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2"
                        aria-hidden
                      />
                      <Input
                        value={nickname}
                        onChange={(e) => setNickname(e.target.value)}
                        placeholder={t("输入新昵称", "Enter new nickname")}
                        className={settingsInputClass}
                      />
                    </div>
                    <Button
                      type="button"
                      size="lg"
                      disabled={savingNickname}
                      className="h-12 shrink-0 rounded-xl border-0 px-5 font-bold text-[hsl(var(--pu-primary-foreground))] hover:opacity-95"
                      style={{
                        background:
                          "linear-gradient(135deg, hsl(var(--pu-gold)), hsl(var(--pu-gold-soft)))",
                      }}
                      onClick={() => void handleSaveNickname()}
                    >
                      {savingNickname ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
                      {t("保存", "Save")}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="member-settings-row">
              <button
                type="button"
                className="member-settings-trigger"
                onClick={() => notify.info(t("维护中", "Under maintenance"))}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ring-[hsl(var(--pu-m-surface-border)/0.32)]"
                    style={{ background: `color-mix(in srgb, ${themeColor} 14%, transparent)` }}
                  >
                    <Mail size={15} color={themeColor} aria-hidden />
                  </div>
                  <div className="min-w-0 text-left">
                    <p className="m-0 text-sm font-semibold text-[hsl(var(--pu-m-text))]">
                      {t("绑定邮箱", "Bind email")}
                    </p>
                    <p className="m-0 text-xs text-[hsl(var(--pu-m-text-dim)/0.55)]">
                      {t("暂未绑定", "Not bound")}
                    </p>
                  </div>
                </div>
                <ChevronRight size={12} className="shrink-0 text-[hsl(var(--pu-m-text-dim)/0.35)]" aria-hidden />
              </button>
            </div>

            <div className="member-settings-row">
              <button type="button" className="member-settings-trigger" onClick={() => setExpandedSection(expandedSection === "password" ? null : "password")}>
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ring-[hsl(var(--pu-m-surface-border)/0.32)]"
                    style={{ background: `color-mix(in srgb, ${themeColor} 14%, transparent)` }}
                  >
                    <Lock size={15} color={themeColor} />
                  </div>
                  <div className="min-w-0 text-left">
                    <p className="m-0 text-sm font-semibold text-[hsl(var(--pu-m-text))]">
                      {t("修改密码", "Change password")}
                    </p>
                    <p className="m-0 text-xs text-[hsl(var(--pu-m-text-dim)/0.55)]">
                      {t("定期更新更安全", "Update regularly for security")}
                    </p>
                  </div>
                </div>
                <ChevronRight
                  size={12}
                  className={cn(
                    "shrink-0 text-[hsl(var(--pu-m-text-dim)/0.35)] transition-transform duration-200",
                    expandedSection === "password" && "rotate-90",
                  )}
                />
              </button>
              {expandedSection === "password" && (
                <div className="member-settings-expand">
                  <form
                    className="flex flex-col gap-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!pwdOld.trim()) {
                        notify.error(t("请填写当前密码", "Current password is required"));
                        return;
                      }
                      if (!pwdNew.trim()) {
                        notify.error(t("请填写新密码", "New password is required"));
                        return;
                      }
                      if (pwdNew.length < 6) {
                        notify.error(t("新密码至少 6 位", "Min 6 characters"));
                        return;
                      }
                      if (pwdNew !== pwdConfirm) {
                        notify.error(t("两次新密码不一致", "Passwords don't match"));
                        return;
                      }
                      void handleChangePassword({ oldPwd: pwdOld, newPwd: pwdNew, confirmPwd: pwdConfirm });
                    }}
                  >
                    <div className="space-y-1.5">
                      <Label className="text-[13px] text-[hsl(var(--pu-m-text-dim)/0.78)]">{t("当前密码", "Current password")}</Label>
                      <div className="relative">
                        <Lock
                          size={16}
                          color={themeColor}
                          className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2"
                          aria-hidden
                        />
                        <Input
                          type="password"
                          autoComplete="current-password"
                          value={pwdOld}
                          onChange={(e) => setPwdOld(e.target.value)}
                          placeholder={t("当前密码", "Current password")}
                          className={settingsInputClass}
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[13px] text-[hsl(var(--pu-m-text-dim)/0.78)]">{t("新密码（至少 6 位）", "New password (min 6 chars)")}</Label>
                      <div className="relative">
                        <Lock
                          size={16}
                          color={themeColor}
                          className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2"
                          aria-hidden
                        />
                        <Input
                          type="password"
                          autoComplete="new-password"
                          value={pwdNew}
                          onChange={(e) => setPwdNew(e.target.value)}
                          placeholder={t("新密码", "New password")}
                          className={settingsInputClass}
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[13px] text-[hsl(var(--pu-m-text-dim)/0.78)]">{t("确认新密码", "Confirm password")}</Label>
                      <div className="relative">
                        <Lock
                          size={16}
                          color={themeColor}
                          className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2"
                          aria-hidden
                        />
                        <Input
                          type="password"
                          autoComplete="new-password"
                          value={pwdConfirm}
                          onChange={(e) => setPwdConfirm(e.target.value)}
                          placeholder={t("再次输入新密码", "Confirm password")}
                          className={settingsInputClass}
                        />
                      </div>
                    </div>
                    <Button
                      type="submit"
                      disabled={savingPwd}
                      className="mt-1 h-12 w-full rounded-xl border-0 font-bold text-[hsl(var(--pu-primary-foreground))] hover:opacity-95"
                      style={{
                        background:
                          "linear-gradient(135deg, hsl(var(--pu-gold)), hsl(var(--pu-gold-soft)))",
                      }}
                    >
                      {savingPwd ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
                      {t("更新密码", "Update password")}
                    </Button>
                  </form>
                </div>
              )}
            </div>
            </div>
          </div>

          <div className="mb-5">
            <h3 className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-pu-gold-soft/90">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-pu-gold-soft/90" aria-hidden />
              {t("数据与记录", "Data & records")}
            </h3>
              <div className="space-y-2.5">
              <div className="m-glass overflow-hidden rounded-2xl border border-pu-gold/12">
            <div className="member-settings-row">
              <button
                type="button"
                className="member-settings-trigger"
                onClick={() => setExpandedPointsLedger(!expandedPointsLedger)}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-pu-gold/12 ring-1 ring-inset ring-pu-gold/15">
                    <Coins className="h-4 w-4 text-pu-gold-soft" strokeWidth={2} aria-hidden />
                  </div>
                  <div className="min-w-0 text-left">
                    <p className="m-0 text-sm font-semibold text-[hsl(var(--pu-m-text))]">
                      {t("积分明细", "Points ledger")}
                    </p>
                    <p className="m-0 text-xs text-[hsl(var(--pu-m-text-dim)/0.55)]">
                      {t("消费、推荐与抽奖等积分记录", "Consumption, referral & lottery entries")}
                    </p>
                  </div>
                </div>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-[hsl(var(--pu-m-text-dim)/0.4)] transition-transform duration-300",
                    expandedPointsLedger && "rotate-180",
                  )}
                  strokeWidth={2}
                  aria-hidden
                />
              </button>
              {expandedPointsLedger && (
                <div className="member-settings-expand">
                  <div className="mb-3 flex flex-wrap gap-2">
                    {(
                      [
                        { key: "all" as const, zh: "全部", en: "All" },
                        { key: "consumption" as const, zh: "消费", en: "Consumption" },
                        { key: "referral" as const, zh: "推荐", en: "Referral" },
                        { key: "lottery" as const, zh: "抽奖", en: "Lottery" },
                      ] as const
                    ).map(({ key, zh, en }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setLedgerCategory(key)}
                        className={cn(
                          "cursor-pointer rounded-full px-3 py-1.5 text-xs transition-colors",
                          ledgerCategory === key
                            ? "border-[1.5px] font-bold shadow-sm"
                            : "border border-[hsl(var(--pu-m-surface-border)/0.28)] font-medium text-[hsl(var(--pu-m-text-dim)/0.72)] hover:border-[hsl(var(--pu-m-surface-border)/0.42)] hover:text-[hsl(var(--pu-m-text-dim)/0.88)]",
                        )}
                        style={
                          ledgerCategory === key
                            ? {
                                borderColor: themeColor,
                                background: `color-mix(in srgb, ${themeColor} 16%, transparent)`,
                                color: themeColor,
                              }
                            : undefined
                        }
                      >
                        {t(zh, en)}
                      </button>
                    ))}
                  </div>
                  {showLedgerSkeleton ? (
                    <MemberStackedRowSkeleton rows={4} />
                  ) : !ledgerPack?.success ? (
                    <p className="m-0 text-[13px] text-rose-400">
                      {t("加载失败，请稍后重试", "Failed to load. Try again later.")}
                    </p>
                  ) : ledgerRows.length === 0 ? (
                    <div className="relative overflow-hidden rounded-2xl border border-dashed border-pu-gold/22 bg-gradient-to-b from-pu-gold/[0.08] via-[hsl(var(--pu-m-surface)/0.18)] to-[hsl(var(--pu-m-surface)/0.22)] px-4 py-8 text-center">
                      <div className="relative">
                        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-pu-gold/12 text-[hsl(var(--pu-m-text-dim)/0.4)]">
                          <Coins className="h-6 w-6" strokeWidth={1.75} aria-hidden />
                        </div>
                        <p className="m-0 text-sm font-semibold text-[hsl(var(--pu-m-text))]">{t("暂无记录", "No records")}</p>
                        <p className="mt-1.5 text-[11px] leading-relaxed text-[hsl(var(--pu-m-text-dim)/0.65)]">
                          {t("切换上方分类或稍后再试", "Try another category or check back later")}
                        </p>
                        <MemberEmptyStateCta
                          primary={{ to: ROUTES.MEMBER.POINTS, label: t("去积分商城", "Go to points mall") }}
                          secondary={{ to: ROUTES.MEMBER.DASHBOARD, label: t("回首页", "Home") }}
                        />
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="member-ledger-stack">
                        {ledgerRows.map((row) => (
                          <MemberSettingsLedgerCard
                            key={row.id}
                            row={row}
                            ledgerCategory={ledgerCategory}
                            themeColor={themeColor}
                            t={t}
                          />
                        ))}
                      </div>
                      {hasMoreLedger ? (
                        <button
                          type="button"
                          className="mx-auto mt-3 flex items-center gap-1.5 rounded-full bg-[hsl(var(--pu-m-surface)/0.35)] px-4 py-1.5 text-[11px] font-medium text-[hsl(var(--pu-m-text-dim))] transition-colors active:bg-[hsl(var(--pu-m-surface)/0.55)]"
                          disabled={ledgerLoadingMore}
                          onClick={() => void loadMoreLedger()}
                        >
                          {ledgerLoadingMore
                            ? t("加载中…", "Loading…")
                            : t(`加载更多（${ledgerRows.length}/${ledgerTotal}）`, `Load more (${ledgerRows.length}/${ledgerTotal})`)}
                        </button>
                      ) : ledgerTotal > 0 ? (
                        <p className="mb-0 mt-2.5 text-[11px] text-[hsl(var(--pu-m-text-dim)/0.5)]">
                          {t(`共 ${ledgerTotal} 条`, `${ledgerTotal} total`)}
                        </p>
                      ) : null}
                    </>
                  )}
                </div>
              )}
            </div>
              </div>

              <div id="orders" className="m-glass overflow-hidden rounded-2xl border border-pu-emerald/12">
            <div className="member-settings-row">
              <button type="button" className="member-settings-trigger" onClick={() => setExpandedOrders(!expandedOrders)}>
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-pu-emerald/12 ring-1 ring-inset ring-[hsl(var(--pu-m-surface-border)/0.28)]">
                    <ShoppingCart className="h-4 w-4 text-pu-emerald-soft" strokeWidth={2} aria-hidden />
                  </div>
                  <div className="min-w-0 text-left">
                    <p className="m-0 text-sm font-semibold text-[hsl(var(--pu-m-text))]">
                      {t("我的订单", "My orders")}
                    </p>
                    <p className="m-0 flex items-center gap-2 text-xs text-[hsl(var(--pu-m-text-dim)/0.55)]">
                      {showOrdersSkeleton ? (
                        <span
                          className="inline-flex items-center gap-2"
                          role="status"
                          aria-label={t("加载中…", "Loading…")}
                        >
                          <span
                            className="h-2 w-14 animate-pulse rounded-full bg-[hsl(var(--pu-m-surface)/0.42)] motion-reduce:animate-none"
                            aria-hidden
                          />
                          <span className="sr-only">{t("加载中…", "Loading…")}</span>
                        </span>
                      ) : (
                        <>
                          <span>{t(`${memberOrders.length} 条记录`, `${memberOrders.length} records`)}</span>
                          {ordersFetching ? (
                            <span
                              className="inline-flex shrink-0 items-center"
                              role="status"
                              aria-label={t("同步中…", "Syncing…")}
                            >
                              <span
                                className="h-2 w-9 animate-pulse rounded-full bg-[hsl(var(--pu-m-surface)/0.42)] motion-reduce:animate-none"
                                aria-hidden
                              />
                            </span>
                          ) : null}
                        </>
                      )}
                    </p>
                  </div>
                </div>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-[hsl(var(--pu-m-text-dim)/0.4)] transition-transform duration-300",
                    expandedOrders && "rotate-180",
                  )}
                  strokeWidth={2}
                  aria-hidden
                />
              </button>
              {expandedOrders && (
                <div className="member-settings-expand">
                  {showOrdersSkeleton ? (
                    <MemberStackedRowSkeleton rows={4} />
                  ) : memberOrders.length === 0 ? (
                    <div className="relative overflow-hidden rounded-2xl border border-dashed border-pu-gold/22 bg-gradient-to-b from-pu-gold/[0.08] via-[hsl(var(--pu-m-surface)/0.18)] to-[hsl(var(--pu-m-surface)/0.22)] px-4 py-8 text-center">
                      <div className="relative">
                        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-pu-gold/12 text-[hsl(var(--pu-m-text-dim)/0.4)]">
                          <ShoppingCart className="h-6 w-6" strokeWidth={1.75} aria-hidden />
                        </div>
                        <p className="m-0 text-sm font-semibold text-[hsl(var(--pu-m-text))]">{t("暂无订单", "No orders")}</p>
                        <p className="mt-1.5 text-[11px] leading-relaxed text-[hsl(var(--pu-m-text-dim)/0.65)]">
                          {t("下单成功后将显示在此", "Paid orders will appear here")}
                        </p>
                        <MemberEmptyStateCta
                          primary={{ to: ROUTES.MEMBER.DASHBOARD, label: t("去首页逛逛", "Go to Home") }}
                          secondary={{ to: ROUTES.MEMBER.TRADE_CONTACT, label: t("联系客服下单", "Contact to order") }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="member-order-list">
                      {memberOrders.map((order) => {
                        const cardLabel = tryRecoverMisdecodedUtf8(
                          (order.cardDisplayName && order.cardDisplayName.trim()) ||
                            resolveCardName(order.cardTypeId) ||
                            order.cardTypeId ||
                            "-",
                        );
                        const paidLabel = order.isUsdt
                          ? `${Number(order.actualPaid || 0).toLocaleString()} USDT`
                          : `${Number(order.actualPaid || 0).toLocaleString()} ${order.currency || ""}`.trim();
                        return (
                          <div key={order.dbId} className="member-order-card">
                            <div className="mb-2 flex items-center justify-between">
                              <span className="text-[11px] text-[hsl(var(--pu-m-text-dim)/0.45)]">{order.createdAt}</span>
                              <span
                                className="font-mono text-[11px] text-[hsl(var(--pu-m-text-dim)/0.45)]"
                                title={order.dbId ? t(`订单引用: ${order.dbId}`, `Order ref: ${order.dbId}`) : undefined}
                              >
                                #{order.orderNumber}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="m-0 truncate text-sm font-semibold text-[hsl(var(--pu-m-text))]" title={cardLabel}>
                                  {cardLabel}
                                </p>
                                <p className="mt-0.5 text-xs text-[hsl(var(--pu-m-text-dim)/0.6)]">
                                  {t("面值", "Face value")}: {Number(order.faceValue || 0).toLocaleString()}
                                </p>
                              </div>
                              <div className="shrink-0 text-right">
                                <p className="m-0 text-base font-bold tabular-nums text-[hsl(var(--pu-m-text))]">
                                  {paidLabel}
                                </p>
                                <p className="mt-0.5 text-[11px] text-[hsl(var(--pu-m-text-dim)/0.45)]">
                                  {order.status === "cancelled"
                                    ? t("已取消", "Cancelled")
                                    : order.status === "active"
                                      ? t("处理中", "In progress")
                                      : t("已支付", "Paid")}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
              </div>
            </div>
          </div>

          {/* Customer Service */}
          {(() => {
            const agents = (portalSettings.customer_service_agents || []).filter(
              (a: { name?: string; link?: string }) =>
                Boolean(a.name && String(a.name).trim()) && Boolean(a.link && String(a.link).trim()),
            );
            const sectionTitle =
              (portalSettings.customer_service_label && String(portalSettings.customer_service_label).trim()) ||
              t("联系客服", "Contact support");
            if (agents.length === 0) return null;
            return (
              <div id="member-contact-support" className="mb-5">
                <h3 className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-pu-gold-soft/90">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-pu-gold-soft/90" aria-hidden />
                  {t("帮助与支持", "Help & support")}
                </h3>
                <p className="mb-2 text-xs font-semibold text-[hsl(var(--pu-m-text))]">{sectionTitle}</p>
                <div className="m-glass overflow-hidden rounded-2xl border border-pu-gold/12">
                  {agents.map((agent: { name: string; link: string; avatar_url?: string | null }, idx: number) => (
                    <div key={`${agent.link}-${idx}`} className="member-settings-row">
                      <a
                        href={agent.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="member-settings-trigger no-underline"
                      >
                        <div className="flex items-center gap-3">
                          <MemberSettingsSupportAgentAvatar agent={agent} idx={idx} />
                          <div className="min-w-0 text-left">
                            <p className="m-0 text-sm font-semibold text-[hsl(var(--pu-m-text))]">{agent.name}</p>
                            <p className="m-0 text-xs text-[hsl(var(--pu-m-text-dim)/0.55)]">
                              {t("点击打开 WhatsApp / 在线客服", "Tap to open WhatsApp or chat")}
                            </p>
                          </div>
                        </div>
                        <ChevronRight size={12} className="shrink-0 text-[hsl(var(--pu-m-text-dim)/0.35)]" />
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          <div className="mb-5 flex items-center justify-center gap-1.5 py-3">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-pu-emerald/45" aria-hidden />
            <span className="text-[10px] font-medium text-[hsl(var(--pu-m-text-dim)/0.55)]">
              {t("账号数据已加密 · 安全保护中", "Your account data is encrypted and protected")}
            </span>
          </div>

          <div className="member-danger-zone mb-8">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-[50px] w-full rounded-xl border-[hsl(var(--pu-rose)/0.22)] bg-[hsl(var(--pu-m-surface))] text-[15px] font-semibold text-[hsl(var(--pu-rose))] shadow-none hover:border-[hsl(var(--pu-rose)/0.38)] hover:bg-[hsl(var(--pu-rose)/0.07)] hover:text-[hsl(var(--pu-rose-soft))] dark:border-[hsl(var(--pu-rose-soft)/0.35)] dark:bg-[hsl(var(--pu-m-surface)/0.45)] dark:text-[hsl(var(--pu-rose-soft))] dark:hover:bg-[hsl(var(--pu-rose)/0.14)]"
              onClick={() => setSignOutOpen(true)}
            >
              <LogOut className="h-4 w-4" aria-hidden />
              {t("退出登录", "Sign out")}
            </Button>
          </div>
        </div>

      <DrawerDetail
        open={signOutOpen}
        onOpenChange={setSignOutOpen}
        variant="member"
        headerAlign="center"
        title={t("退出登录", "Sign out")}
        description={t("确定要退出当前账号吗？", "Are you sure you want to sign out?")}
        sheetMaxWidth="xl"
      >
        <div className="flex w-full flex-wrap items-center justify-center gap-2 border-t border-[hsl(var(--pu-m-surface-border)/0.35)] pt-4">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="rounded-xl border-[hsl(var(--pu-m-surface-border)/0.4)] bg-[hsl(var(--pu-m-surface)/0.2)] text-[hsl(var(--pu-m-text))] hover:bg-[hsl(var(--pu-m-surface)/0.45)]"
            onClick={() => setSignOutOpen(false)}
          >
            {t("取消", "Cancel")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="lg"
            className="rounded-xl font-semibold"
            onClick={() => {
              setSignOutOpen(false);
              void signOut();
            }}
          >
            {t("确认退出", "Sign out")}
          </Button>
        </div>
      </DrawerDetail>
    </div>
  );
}
