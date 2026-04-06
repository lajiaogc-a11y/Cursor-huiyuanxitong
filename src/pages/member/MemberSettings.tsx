import { useState, useEffect, useCallback, useRef, type CSSProperties } from "react";
import { useLocation, Navigate, Link } from "react-router-dom";
import { Camera, ChevronRight, LogOut, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMemberAuth } from "@/contexts/MemberAuthContext";
import { ROUTES } from "@/routes/constants";
import { useMemberLocalAvatar } from "@/hooks/useMemberLocalAvatar";
import { useLanguage } from "@/contexts/LanguageContext";
import { displayMemberLevelLabel } from "@/lib/memberLevelDisplay";
import { mapDbRowToMemberPortalOrderView, type MemberPortalOrderView } from "@/hooks/orders/utils";
import { notify } from "@/lib/notifyHub";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { MemberPageAmbientOrbs } from "@/components/member/MemberPageAmbientOrbs";
import { MemberPointsValueSkeleton } from "@/components/member/MemberPageLoadingShell";
import { useMemberPointsBreakdown } from "@/hooks/useMemberPointsBreakdown";
import { useMemberAnimatedCount } from "@/hooks/useMemberAnimatedCount";
import { useMemberSkeletonGate } from "@/hooks/useMemberSkeletonGate";
import { MemberSettingsAccountSection } from "@/pages/member/settings/MemberSettingsAccountSection";
import { MemberSettingsPointsLedgerSection } from "@/pages/member/settings/MemberSettingsPointsLedgerSection";
import { MemberSettingsOrdersSection } from "@/pages/member/settings/MemberSettingsOrdersSection";
import { scrollToMemberHashAnchor } from "@/lib/memberHashAnchorScroll";

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

  const lastHandledSettingsHashRef = useRef<string>("");
  useEffect(() => {
    const hash = String(location.hash || "").trim();
    if (!hash) {
      lastHandledSettingsHashRef.current = "";
      return;
    }
    if (hash === lastHandledSettingsHashRef.current) return;
    const cancel = scrollToMemberHashAnchor(hash, {
      behavior: "smooth",
      block: "start",
      maxFrames: 24,
      onFound: () => {
        if (hash === "#orders") setExpandedOrders(true);
      },
    });
    lastHandledSettingsHashRef.current = hash;
    return cancel;
  }, [location.hash]);

  const memberId = member?.id;
  const { data: memberOrders = [], isLoading: ordersLoading, isFetching: ordersFetching } = useQuery({
    queryKey: memberId ? memberQueryKeys.orders(memberId) : ["member", "orders", "__none"],
    queryFn: async (): Promise<MemberPortalOrderView[]> => {
      if (!memberId) return [];
      const rows = await memberGetOrdersRows(memberId);
      return rows.map((r) => mapDbRowToMemberPortalOrderView(r as Record<string, unknown>));
    },
    enabled: !!memberId,
    placeholderData: keepPreviousData,
    refetchInterval: expandedOrders && pageVisible ? 30_000 : false,
    refetchIntervalInBackground: false,
  });

  const LEDGER_PAGE = 50;
  /** 「加载更多」追加行；首屏数据必须以 React Query 的 data 为准，避免切回已缓存分类时不跑 queryFn、setState 未同步导致死数据 */
  const [ledgerExtraRows, setLedgerExtraRows] = useState<MemberPointsLedgerRow[]>([]);
  const [ledgerLoadingMore, setLedgerLoadingMore] = useState(false);

  const { isLoading: ledgerLoading, data: ledgerPack } = useQuery({
    queryKey: memberId ? memberQueryKeys.pointsLedger(memberId, ledgerCategory) : ["member", "pointsLedger", "__none"],
    queryFn: async () => {
      if (!memberId) return { success: false as const, rows: [] as MemberPointsLedgerRow[], total: 0 };
      return getMemberPointsLedgerRpc(memberId, ledgerCategory, LEDGER_PAGE, 0);
    },
    enabled: !!memberId && expandedPointsLedger,
    placeholderData: keepPreviousData,
    staleTime: 20_000,
    refetchInterval: expandedPointsLedger && pageVisible ? 30_000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    setLedgerExtraRows([]);
  }, [ledgerCategory]);

  const ledgerBaseRows = ledgerPack?.success ? ledgerPack.rows : [];
  const ledgerTotal = ledgerPack?.success ? ledgerPack.total : 0;
  const ledgerRows = [...ledgerBaseRows, ...ledgerExtraRows];
  const hasMoreLedger = ledgerRows.length < ledgerTotal;

  const loadMoreLedger = useCallback(async () => {
    if (!memberId || ledgerLoadingMore || ledgerRows.length >= ledgerTotal) return;
    setLedgerLoadingMore(true);
    try {
      const r = await getMemberPointsLedgerRpc(memberId, ledgerCategory, LEDGER_PAGE, ledgerRows.length);
      if (r.success) {
        setLedgerExtraRows((prev) => [...prev, ...r.rows]);
      }
    } finally {
      setLedgerLoadingMore(false);
    }
  }, [memberId, ledgerLoadingMore, ledgerRows.length, ledgerTotal, ledgerCategory]);

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
  /** 仅首屏无缓存时骨架；后台刷新 / 分类切换时 keepPreviousData 保留上一帧，不闪骨架 */
  const showLedgerSkeleton = useMemberSkeletonGate(ledgerLoading);
  const showOrdersSkeleton = useMemberSkeletonGate(ordersLoading);

  const queryClient = useQueryClient();

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
        notify.success(t("密码已更新", "Password updated"));
        setPwdOld("");
        setPwdNew("");
        setPwdConfirm("");
        setExpandedSection(null);
      }
      else notify.error(t("密码更新失败", "Failed to update password"));
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
                className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-lg border border-[hsl(var(--pu-m-surface-border)/0.5)] bg-[hsl(var(--pu-m-surface))] member-transition-surface member-motion-fast active:scale-95"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpandedSection(expandedSection === "avatar" ? null : "avatar");
                }}
                aria-expanded={expandedSection === "avatar"}
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
              className="mb-3 grid grid-cols-3 gap-1 rounded-xl border border-pu-gold/18 bg-gradient-to-b from-pu-gold/[0.07] to-[hsl(var(--pu-m-surface)/0.32)] p-3 text-[hsl(var(--pu-m-text))] shadow-sm outline-none ring-offset-[hsl(var(--pu-m-bg-1))] member-transition-surface member-motion-base hover:border-pu-gold/28 hover:from-pu-gold/[0.09] focus-visible:ring-2 focus-visible:ring-pu-gold/35"
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
          <MemberSettingsAccountSection
            t={t}
            themeColor={themeColor}
            settingsInputClass={settingsInputClass}
            expandedSection={expandedSection}
            setExpandedSection={setExpandedSection}
            settingsAvatarUrl={settingsAvatarUrl}
            setSettingsAvatarFromFile={setSettingsAvatarFromFile}
            clearSettingsAvatar={clearSettingsAvatar}
            displayName={displayName}
            member={member}
            nickname={nickname}
            setNickname={setNickname}
            savingNickname={savingNickname}
            onSaveNickname={handleSaveNickname}
            pwdOld={pwdOld}
            setPwdOld={setPwdOld}
            pwdNew={pwdNew}
            setPwdNew={setPwdNew}
            pwdConfirm={pwdConfirm}
            setPwdConfirm={setPwdConfirm}
            savingPwd={savingPwd}
            onChangePassword={handleChangePassword}
          />

          <div className="mb-5">
            <h3 className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-pu-gold-soft/90">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-pu-gold-soft/90" aria-hidden />
              {t("数据与记录", "Data & records")}
            </h3>
            <div className="space-y-2.5">
              <MemberSettingsPointsLedgerSection
                t={t}
                themeColor={themeColor}
                expandedPointsLedger={expandedPointsLedger}
                setExpandedPointsLedger={setExpandedPointsLedger}
                ledgerCategory={ledgerCategory}
                setLedgerCategory={setLedgerCategory}
                ledgerRows={ledgerRows}
                ledgerTotal={ledgerTotal}
                hasMoreLedger={hasMoreLedger}
                ledgerPackSuccess={ledgerPack?.success}
                ledgerLoadingMore={ledgerLoadingMore}
                onLoadMoreLedger={loadMoreLedger}
                showLedgerSkeleton={showLedgerSkeleton}
              />
              <MemberSettingsOrdersSection
                t={t}
                expandedOrders={expandedOrders}
                setExpandedOrders={setExpandedOrders}
                memberOrders={memberOrders}
                showOrdersSkeleton={showOrdersSkeleton}
                ordersFetching={ordersFetching}
              />
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
