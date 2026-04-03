/**
 * Elite UI primitives — use inside existing pages without changing routes or APIs.
 * Import from `@/design-system/elite`.
 */
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { AlertCircle, ChevronRight, LucideIcon, Search } from "lucide-react";
import { DrawerDetail } from "@/components/shell/DrawerDetail";
import { cn } from "@/lib/utils";

export function EliteCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-[var(--elite-staff-border,#e2e8f0)] bg-[var(--elite-staff-card,#ffffff)] shadow-[0_1px_2px_rgba(15,23,42,0.05)] dark:shadow-[0_2px_12px_rgba(0,0,0,0.45)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function EliteMemberCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-[var(--elite-member-border,#1f2937)] bg-[var(--elite-member-card,#111827)] shadow-[0_1px_3px_rgba(0,0,0,0.35)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function EliteSectionCard({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  const hasHeader = !!(title || description || action);
  return (
    <EliteCard className="p-5">
      {hasHeader && (
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            {title && <h3 className="text-base font-semibold text-foreground">{title}</h3>}
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </EliteCard>
  );
}

export function EliteMemberSectionCard({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <EliteMemberCard className="p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-white">{title}</h3>
          {description && <p className="mt-1 text-sm text-slate-300">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </EliteMemberCard>
  );
}

export function EliteBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "gold";
}) {
  const tones = {
    neutral:
      "bg-[var(--elite-staff-secondary,#f1f5f9)] text-[var(--elite-staff-text,#0f172a)] border-[var(--elite-staff-border,#e2e8f0)]",
    success:
      "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/55 dark:text-emerald-300 dark:border-emerald-800",
    warning:
      "bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:border-amber-800",
    danger:
      "bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800",
    gold: "bg-[#2a2312] text-[#f4d28a] border-[#d4a853]/22",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium", tones[tone])}>
      {children}
    </span>
  );
}

export function EliteButton({
  children,
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "gold" }) {
  const styles = {
    primary: "bg-[var(--elite-staff-primary,#2563eb)] text-white hover:brightness-95 shadow-none",
    secondary:
      "bg-[var(--elite-staff-secondary,#f1f5f9)] text-[var(--elite-staff-text,#0f172a)] hover:opacity-90 border border-[var(--elite-staff-border,#e2e8f0)]",
    ghost: "bg-transparent text-muted-foreground hover:bg-muted",
    gold: "bg-[#d4a853] text-[#0f172a] hover:bg-[#c9a050] border border-[#b8903e]/35 shadow-none",
  };
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition",
        styles[variant],
        className,
      )}
      {...props}
    />
  );
}

export function EliteInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "h-12 w-full rounded-xl border border-input bg-background px-4 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        props.className || "",
      )}
    />
  );
}

export function EliteMemberInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "h-12 w-full rounded-xl border border-[#1f2937] bg-[#0a0e1a] px-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-[#d4a853]",
        props.className || "",
      )}
    />
  );
}

export function EliteTextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "min-h-28 w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        props.className || "",
      )}
    />
  );
}

export function ElitePageSubHeader({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mb-4 text-sm text-muted-foreground", className)}>{children}</div>;
}

export function EliteMemberPageSubHeader({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mb-4 text-sm text-slate-400", className)}>{children}</div>;
}

export function ElitePageHeader({
  title,
  description,
  actions,
  showTitle = false,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  /** 员工后台顶栏已显示页面标题；默认不在正文重复大标题，仅保留说明与操作区 */
  showTitle?: boolean;
}) {
  const showHeading = Boolean(showTitle && title?.trim());
  const hasLeft =
    showHeading || Boolean(description?.trim());
  return (
    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
      {hasLeft ? (
        <div>
          {showHeading ? (
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--elite-staff-text,#0f172a)]">{title}</h1>
          ) : null}
          {description ? (
            <p
              className={cn(
                "max-w-3xl text-sm leading-6 text-[var(--elite-staff-muted,#64748b)]",
                showHeading ? "mt-2" : "",
              )}
            >
              {description}
            </p>
          ) : null}
        </div>
      ) : null}
      {actions}
    </div>
  );
}

export function EliteMemberPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--elite-member-text,#f8fafc)]">{title}</h1>
        {description && (
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--elite-member-muted,#cbd5e1)]">{description}</p>
        )}
      </div>
      {actions}
    </div>
  );
}

export function EliteSettingsPanel({
  title,
  description,
  children,
  footer,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <EliteSectionCard title={title} description={description}>
      <div className={cn("space-y-4", className)}>{children}</div>
      {footer ? <div className="mt-6 border-t border-border pt-4">{footer}</div> : null}
    </EliteSectionCard>
  );
}

export function EliteMemberSettingsPanel({
  title,
  description,
  children,
  footer,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <EliteMemberSectionCard title={title} description={description}>
      <div className={cn("space-y-4", className)}>{children}</div>
      {footer ? <div className="mt-6 border-t border-white/10 pt-4">{footer}</div> : null}
    </EliteMemberSectionCard>
  );
}

export function ElitePageActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

export function EliteKPIGrid({
  items,
}: {
  items: { label: string; value: string; change?: string; tone?: "positive" | "warning" | "neutral" }[];
}) {
  const colsClass = items.length >= 5
    ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
    : "grid gap-4 sm:grid-cols-2 xl:grid-cols-4";
  return (
    <div className={colsClass}>
      {items.map((item) => (
        <EliteCard key={item.label} className="p-5">
          <p className="text-sm text-muted-foreground">{item.label}</p>
          <div className="mt-3 flex items-end justify-between gap-3">
            <div className="text-2xl font-semibold tracking-tight text-foreground">{item.value}</div>
            {item.change && (
              <span
                className={cn(
                  "text-sm font-medium",
                  item.tone === "warning"
                    ? "text-amber-600 dark:text-amber-400"
                    : item.tone === "neutral"
                      ? "text-muted-foreground"
                      : "text-emerald-600 dark:text-emerald-400",
                )}
              >
                {item.change}
              </span>
            )}
          </div>
        </EliteCard>
      ))}
    </div>
  );
}

export function EliteMemberKPIGrid({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <EliteMemberCard key={item.label} className="p-5">
          <p className="text-sm text-slate-400">{item.label}</p>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-white">{item.value}</div>
        </EliteMemberCard>
      ))}
    </div>
  );
}

export function EliteFilterBar({ children }: { children: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-[var(--elite-staff-border,#e2e8f0)] bg-[var(--elite-staff-card,#ffffff)] p-4 shadow-[0_1px_2px_rgba(15,23,42,0.05)] dark:shadow-[0_2px_12px_rgba(0,0,0,0.4)] lg:flex-row lg:items-center lg:justify-between">
      {children}
    </div>
  );
}

export function EliteMemberFilterBar({ children }: { children: ReactNode }) {
  return <div className="mb-5 flex flex-col gap-3 rounded-3xl border border-[#1f2937] bg-[#111827] p-4">{children}</div>;
}

export function EliteDataTableCard({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <EliteCard className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-muted/80 text-muted-foreground">
            <tr>
              {headers.map((h) => (
                <th key={h} className="px-5 py-4 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row, idx) => (
              <tr key={idx} className="hover:bg-muted/40">
                {row.map((cell, cellIdx) => (
                  <td key={cellIdx} className="px-5 py-4 text-foreground">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </EliteCard>
  );
}

export function EliteMemberDataTableCard({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <EliteMemberCard className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-white/5 text-slate-300">
            <tr>
              {headers.map((h) => (
                <th key={h} className="px-5 py-4 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {rows.map((row, idx) => (
              <tr key={idx} className="hover:bg-white/5">
                {row.map((cell, cellIdx) => (
                  <td key={cellIdx} className="px-5 py-4 text-slate-200">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </EliteMemberCard>
  );
}

/** 与业务侧 `DrawerDetail` 一致：桌面右侧抽屉、移动底部 Sheet（避免自绘 fixed z-50 与窄屏溢出）。 */
export function EliteDrawerDetail({
  open,
  title,
  description,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <DrawerDetail
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={title}
      description={description}
      variant="staff"
      sheetMaxWidth="xl"
    >
      {children}
    </DrawerDetail>
  );
}

export function EliteMemberDrawerDetail({
  open,
  title,
  description,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <DrawerDetail
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={title}
      description={description}
      variant="member"
      sheetMaxWidth="xl"
    >
      {children}
    </DrawerDetail>
  );
}

function statusTone(value: string): "neutral" | "success" | "warning" | "danger" {
  if (/active|paid|ok|success/i.test(value)) return "success";
  if (/warn|review|pending/i.test(value)) return "warning";
  if (/frozen|abnormal|reject|error/i.test(value)) return "danger";
  return "neutral";
}

export function EliteStatusBadge({ value }: { value: string }) {
  return <EliteBadge tone={statusTone(value)}>{value}</EliteBadge>;
}

export function EliteEmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card p-8 text-center">
      <p className="text-base font-medium text-foreground">{title}</p>
      {description && <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}

export function EliteMemberEmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center rounded-3xl border border-dashed border-[#1f2937] bg-[#111827] p-8 text-center">
      <p className="text-base font-medium text-white">{title}</p>
      {description && <p className="mt-2 max-w-md text-sm text-slate-300">{description}</p>}
    </div>
  );
}

export function EliteErrorState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 dark:border-rose-900/80 dark:bg-rose-950/40">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 text-rose-600 dark:text-rose-400" />
        <div>
          <p className="font-semibold text-rose-900 dark:text-rose-100">{title}</p>
          {description && <p className="mt-1 text-sm text-rose-700 dark:text-rose-300">{description}</p>}
        </div>
      </div>
    </div>
  );
}

export function EliteLoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
      <div className="h-[420px] animate-pulse rounded-2xl bg-muted" />
    </div>
  );
}

export function EliteMemberLoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-3xl bg-white/10" />
        ))}
      </div>
      <div className="h-[420px] animate-pulse rounded-3xl bg-white/10" />
    </div>
  );
}

export function EliteMobileCardList({
  items,
}: {
  items: { title: string; subtitle?: string; meta?: string; badge?: ReactNode }[];
}) {
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <EliteCard key={item.title} className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-medium text-foreground">{item.title}</div>
              {item.subtitle && <div className="mt-1 text-sm text-muted-foreground">{item.subtitle}</div>}
            </div>
            {item.badge}
          </div>
          {item.meta && <div className="mt-3 text-sm text-muted-foreground">{item.meta}</div>}
        </EliteCard>
      ))}
    </div>
  );
}

export function EliteMemberMobileCardList({
  items,
}: {
  items: { title: string; subtitle?: string; meta?: string; badge?: ReactNode }[];
}) {
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <EliteMemberCard key={item.title} className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-medium text-white">{item.title}</div>
              {item.subtitle && <div className="mt-1 text-sm text-slate-300">{item.subtitle}</div>}
            </div>
            {item.badge}
          </div>
          {item.meta && <div className="mt-3 text-sm text-slate-300">{item.meta}</div>}
        </EliteMemberCard>
      ))}
    </div>
  );
}

export function EliteStickyActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 mt-6 border-t border-border bg-card/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur supports-[backdrop-filter]:bg-card/80">
      {children}
    </div>
  );
}

export function EliteMemberStickyActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 mt-6 border-t border-[#1f2937] bg-[#0a0e1a]/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">{children}</div>
  );
}

export function EliteTabHeader({
  tabs,
  active,
  onChange,
}: {
  tabs: string[];
  active: string;
  onChange: (tab: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 rounded-2xl border border-border bg-card p-2">
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => onChange(tab)}
          className={cn(
            "rounded-xl px-4 py-2 text-sm font-medium transition",
            active === tab
              ? "bg-[var(--elite-staff-primary,#2563eb)] text-white"
              : "text-muted-foreground hover:bg-muted",
          )}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

export function EliteMemberTabHeader({
  tabs,
  active,
  onChange,
}: {
  tabs: string[];
  active: string;
  onChange: (tab: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 rounded-3xl border border-[#1f2937] bg-[#111827] p-2">
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => onChange(tab)}
          className={cn(
            "rounded-xl px-4 py-2 text-sm font-medium transition",
            active === tab ? "bg-[#d4a853] text-black" : "text-slate-300 hover:bg-white/5",
          )}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

export function EliteSearchField({ placeholder = "Search..." }: { placeholder?: string }) {
  return (
    <div className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <EliteInput placeholder={placeholder} className="pl-11" />
    </div>
  );
}

export function EliteMemberSearchField({ placeholder = "Search..." }: { placeholder?: string }) {
  return (
    <div className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
      <EliteMemberInput placeholder={placeholder} className="pl-11" />
    </div>
  );
}

export function EliteSectionDivider({ label }: { label: string }) {
  return (
    <div className="my-4 flex items-center gap-3">
      <div className="h-px flex-1 bg-border" />
      <span className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">{label}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

export function EliteMemberSectionDivider({ label }: { label: string }) {
  return (
    <div className="my-4 flex items-center gap-3">
      <div className="h-px flex-1 bg-white/10" />
      <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">{label}</span>
      <div className="h-px flex-1 bg-white/10" />
    </div>
  );
}

export function EliteQuickStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-muted/50 px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}

export function EliteMemberQuickStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-[#1f2937] bg-[#0a0e1a] px-4 py-3">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}

export function EliteIconBadge({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-muted/50 px-4 py-3">
      <div className="rounded-xl bg-card p-2 shadow-sm ring-1 ring-border/60">
        <Icon className="h-4 w-4 text-foreground" />
      </div>
      <span className="text-sm font-medium text-foreground">{label}</span>
    </div>
  );
}

export function EliteMemberIconBadge({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-3xl border border-[#1f2937] bg-[#111827] px-4 py-3">
      <div className="rounded-xl bg-[#0a0e1a] p-2">
        <Icon className="h-4 w-4 text-[#d4a853]" />
      </div>
      <span className="text-sm font-medium text-white">{label}</span>
    </div>
  );
}

/** Row action link styled like the reference kit */
export function EliteRowChevronAction({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-border bg-card/30 px-4 py-3">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </div>
  );
}
