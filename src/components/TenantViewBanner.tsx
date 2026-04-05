import { useCallback, useEffect, useRef, useState } from "react";
import { useTenantView } from "@/contexts/TenantViewContext";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Eye, LogOut, ChevronUp, ChevronDown, Building2, GripVertical } from "lucide-react";

const TENANT_FAB_POS_KEY = "tenantViewFabPos";

function clampFabPosition(
  x: number,
  y: number,
  width: number,
  height: number,
  pad = 8
) {
  const maxX = Math.max(pad, window.innerWidth - width - pad);
  const maxY = Math.max(pad, window.innerHeight - height - pad);
  return {
    x: Math.min(Math.max(pad, x), maxX),
    y: Math.min(Math.max(pad, y), maxY),
  };
}

export function TenantViewBanner() {
  const { viewingTenantId, viewingTenantName, viewingTenantCode, exitTenant, isViewingTenant } = useTenantView() || {};
  const { employee } = useAuth() || {};
  const { t } = useLanguage();

  // 仅平台总管理员可出现「租户查看模式」UI（与 session 记忆、跨账号误显隔离）
  if (!employee?.is_platform_super_admin) return null;
  if (!isViewingTenant || !viewingTenantId) return null;
  if (employee?.tenant_id === viewingTenantId) return null;

  return (
    <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 text-white px-4 py-2.5 shadow-md relative z-50">
      <div className="flex items-center justify-between gap-3 max-w-screen-2xl mx-auto">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center justify-center h-8 w-8 rounded-full bg-white/20 backdrop-blur-sm shrink-0">
            <Eye className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold tracking-wide">
                {t("租户查看模式", "Tenant View Mode")}
              </span>
              <span className="bg-white/25 text-white text-xs font-semibold px-2 py-0.5 rounded-full">
                {t("只读", "Read-only")}
              </span>
            </div>
            <div className="text-xs text-white/85 truncate">
              <Building2 className="inline h-3 w-3 mr-1 -mt-0.5" />
              {viewingTenantName || "-"}{viewingTenantCode ? ` (${viewingTenantCode})` : ""}
              {" — "}
              {t("当前显示的是该租户的数据", "Currently showing this tenant's data")}
            </div>
          </div>
        </div>
        <Button
          onClick={exitTenant}
          size="sm"
          className="shrink-0 bg-white/20 hover:bg-white/30 text-white border border-white/30 backdrop-blur-sm font-semibold gap-1.5"
        >
          <LogOut className="h-3.5 w-3.5" />
          {t("退出查看", "Exit View")}
        </Button>
      </div>
    </div>
  );
}

export function TenantViewFloatingIndicator() {
  const { viewingTenantId, viewingTenantName, viewingTenantCode, exitTenant, isViewingTenant } = useTenantView() || {};
  const { employee } = useAuth() || {};
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const didDragRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(TENANT_FAB_POS_KEY);
      if (raw) {
        const p = JSON.parse(raw) as { x?: number; y?: number };
        if (typeof p.x === "number" && typeof p.y === "number") {
          setPos({ x: p.x, y: p.y });
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  const persistPos = useCallback(() => {
    const p = lastPosRef.current;
    if (!p) return;
    try {
      localStorage.setItem(TENANT_FAB_POS_KEY, JSON.stringify(p));
    } catch {
      /* ignore */
    }
  }, []);

  const onDragStart = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      const el = wrapperRef.current;
      if (!el) return;
      const target = e.target as HTMLElement;
      if (target.closest("button[data-tenant-fab-interactive]")) return;

      e.currentTarget.setPointerCapture(e.pointerId);
      const r = el.getBoundingClientRect();
      const ox = pos?.x ?? r.left;
      const oy = pos?.y ?? r.top;
      dragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        origX: ox,
        origY: oy,
      };
      didDragRef.current = false;
    },
    [pos]
  );

  const onDragMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const el = wrapperRef.current;
    if (!el) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (Math.hypot(dx, dy) > 8) didDragRef.current = true;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const next = clampFabPosition(d.origX + dx, d.origY + dy, w, h);
    lastPosRef.current = next;
    setPos(next);
  }, []);

  const onDragEnd = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d || d.pointerId !== e.pointerId) return;
      dragRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      persistPos();
    },
    [persistPos]
  );

  if (!employee?.is_platform_super_admin) return null;
  if (!isViewingTenant || !viewingTenantId) return null;
  if (employee?.tenant_id === viewingTenantId) return null;

  const positionStyle: React.CSSProperties = pos
    ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto" }
    : { right: 16, bottom: 16, left: "auto", top: "auto" };

  return (
    <div
      ref={wrapperRef}
      className="fixed z-[9999] touch-none select-none max-w-[calc(100vw-16px)]"
      style={positionStyle}
      onPointerDown={onDragStart}
      onPointerMove={onDragMove}
      onPointerUp={onDragEnd}
      onPointerCancel={onDragEnd}
    >
      {expanded ? (
        <div className="bg-amber-600 text-white rounded-xl shadow-2xl border border-amber-400/50 p-3 w-72 animate-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center gap-1 mb-2">
            <span
              className="shrink-0 p-1 rounded-md text-white/80 cursor-grab active:cursor-grabbing touch-none"
              aria-hidden
            >
              <GripVertical className="h-4 w-4" />
            </span>
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Eye className="h-4 w-4 shrink-0" />
              <span className="font-bold text-sm truncate">{t("租户查看模式", "Tenant View Mode")}</span>
            </div>
            <button
              type="button"
              data-tenant-fab-interactive
              onClick={() => setExpanded(false)}
              aria-expanded={expanded}
              className="p-0.5 rounded hover:bg-white/20 transition-colors shrink-0"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
          <div className="text-xs text-white/90 mb-3 pl-7">
            <Building2 className="inline h-3 w-3 mr-1 -mt-0.5" />
            {viewingTenantName || "-"}{viewingTenantCode ? ` (${viewingTenantCode})` : ""}
          </div>
          <Button
            type="button"
            data-tenant-fab-interactive
            onClick={exitTenant}
            size="sm"
            className="w-full bg-white text-amber-700 hover:bg-white/90 font-semibold gap-1.5"
          >
            <LogOut className="h-3.5 w-3.5" />
            {t("退出租户查看", "Exit Tenant View")}
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            if (didDragRef.current) return;
            setExpanded(true);
          }}
          aria-expanded={expanded}
          className="bg-amber-600 hover:bg-amber-700 text-white rounded-full shadow-2xl border-2 border-amber-400/50 pl-2 pr-3 py-3 flex items-center gap-1.5 transition-all active:scale-[0.98] group max-w-[min(100vw-24px,320px)]"
          title={t(
            "按住拖动可移动位置；点击展开",
            "Drag to move; tap to expand"
          )}
        >
          <span className="shrink-0 p-0.5 rounded-md text-white/70 pointer-events-none" aria-hidden>
            <GripVertical className="h-4 w-4" />
          </span>
          <Eye className="h-5 w-5 shrink-0 pointer-events-none" />
          <span className="text-xs font-bold pr-0.5 min-w-0 truncate text-left">
            {viewingTenantName || t("租户查看中", "Viewing Tenant")}
          </span>
          <ChevronUp className="h-3.5 w-3.5 opacity-60 group-hover:opacity-100 transition-opacity shrink-0 pointer-events-none" />
        </button>
      )}
    </div>
  );
}
