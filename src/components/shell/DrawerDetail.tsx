import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { useCallback } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export type DrawerDetailVariant = "staff" | "member";

type SheetContentProps = ComponentPropsWithoutRef<typeof SheetContent>;

/**
 * 详情：桌面端右侧 Drawer，移动端底部 Sheet（避免全屏 Dialog）。
 * 业务与路由不变，仅统一交互壳层。
 */
export function DrawerDetail({
  open,
  onOpenChange,
  title,
  description,
  children,
  variant = "staff",
  /** 宽表单 / 详情；默认 xl */
  sheetMaxWidth = "xl",
  /** 标题与说明对齐；居中时为右上角关闭钮预留右侧内边距 */
  headerAlign = "left",
  /** 透传 SheetContent（如 onPointerDownOutside 阻止点击遮罩关闭） */
  sheetContentProps,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: string;
  children: ReactNode;
  variant?: DrawerDetailVariant;
  sheetMaxWidth?: "xl" | "2xl" | "3xl" | "4xl";
  headerAlign?: "left" | "center";
  sheetContentProps?: ComponentPropsWithoutRef<typeof SheetContent>;
}) {
  const isMobile = useIsMobile();
  const {
    className: sheetContentClassName,
    onOpenAutoFocus: sheetOnOpenAutoFocus,
    ...restSheetContentProps
  } = sheetContentProps ?? {};

  /**
   * 会员端移动端：避免打开抽屉时自动聚焦数量输入框而弹出键盘；
   * 不可只 preventDefault 而不移焦点——否则焦点留在遮罩下层，会触发「aria-hidden 子树含焦点」告警。
   */
  const suppressMobileMemberKeyboard = useCallback<
    NonNullable<SheetContentProps["onOpenAutoFocus"]>
  >(
    (e) => {
      e.preventDefault();
      const root = e.currentTarget as HTMLElement | null;
      window.requestAnimationFrame(() => {
        const closeBtn = root?.querySelector<HTMLElement>(".sheet-close-btn");
        closeBtn?.focus({ preventScroll: true });
      });
      sheetOnOpenAutoFocus?.(e);
    },
    [sheetOnOpenAutoFocus],
  );

  const staffPanel =
    "flex flex-col flex-1 min-h-0 overflow-hidden bg-[var(--elite-staff-bg,#f8fafc)] text-[var(--elite-staff-text,#0f172a)] sm:bg-[var(--elite-staff-card,#ffffff)]";
  const memberPanel =
    "flex flex-col flex-1 min-h-0 overflow-hidden bg-transparent text-[hsl(var(--pu-m-text))]";

  const maxW =
    sheetMaxWidth === "4xl"
      ? "sm:max-w-4xl"
      : sheetMaxWidth === "3xl"
        ? "sm:max-w-3xl"
        : sheetMaxWidth === "2xl"
          ? "sm:max-w-2xl"
          : "sm:max-w-xl";

  const overlayClassName =
    variant === "member"
      ? "bg-[#070B14]/78 backdrop-blur-md backdrop-saturate-150"
      : "bg-slate-950/40 backdrop-blur-[1px]";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        overlayClassName={overlayClassName}
        className={cn(
          "p-0 gap-0 border-[var(--elite-staff-border,#e2e8f0)] w-full overflow-hidden flex flex-col min-h-0",
          maxW,
          isMobile &&
            /* ~80% 视口：常见底部抽屉高度，保留顶沿背景便于理解「可关闭/非全屏」；dvh+svh 双 cap 兼容移动浏览器 UI */
            "max-h-[min(80dvh,calc(100svh-28px))] rounded-t-2xl pb-[env(safe-area-inset-bottom,0px)]",
          variant === "staff" && "elite-staff-surface",
          variant === "member" &&
            "member-drawer-detail border-[hsl(var(--pu-m-surface-border)/0.38)] bg-gradient-to-b from-[hsl(var(--pu-m-bg-2)/0.98)] to-[hsl(var(--pu-m-bg-1)/0.99)] backdrop-blur-xl",
          sheetContentClassName,
        )}
        {...restSheetContentProps}
        onOpenAutoFocus={isMobile && variant === "member" ? suppressMobileMemberKeyboard : sheetOnOpenAutoFocus}
      >
        <div className={cn(variant === "member" ? memberPanel : staffPanel)}>
          <SheetHeader
            className={cn(
              "space-y-1 border-b shrink-0",
              variant === "member" ? "px-5 pt-5 pb-3" : "p-6 pb-4",
              headerAlign === "center"
                ? "text-center sm:text-center pr-14"
                : "text-left sm:text-left",
              variant === "member"
                ? "border-[hsl(var(--pu-m-surface-border)/0.35)]"
                : "border-[var(--elite-staff-border,#e2e8f0)]",
            )}
          >
            <SheetTitle
              className={cn(
                variant === "member"
                  ? "!text-[hsl(var(--pu-m-text))]"
                  : "text-[var(--elite-staff-text,#0f172a)]",
                headerAlign === "center" && "mx-auto max-w-full",
              )}
            >
              {title}
            </SheetTitle>
            {description ? (
              <SheetDescription
                className={cn(
                  variant === "member" ? "!text-[hsl(var(--pu-m-text-dim))]" : undefined,
                  headerAlign === "center" && "mx-auto max-w-full",
                )}
              >
                {description}
              </SheetDescription>
            ) : null}
          </SheetHeader>
          <div
            className={cn(
              "flex-1 min-h-0 overflow-y-auto overflow-x-hidden elite-soft-scroll overscroll-contain",
              variant === "member"
                ? "px-5 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] pt-4 text-[hsl(var(--pu-m-text))]"
                : "p-6 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))]",
            )}
          >
            {children}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
