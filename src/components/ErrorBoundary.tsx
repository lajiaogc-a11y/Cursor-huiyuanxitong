import React, { Component, ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, RotateCcw } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { showMemberPortal } from "@/routes/siteMode";
import { submitErrorReport } from '@/services/observability/errorReportService';
import { shouldSuppressGlobalErrorReport } from '@/lib/errorReportFilters';
import { isoUtcTimestampDigits14 } from '@/lib/isoTimestampDigits';
import { getCurrentUserApi } from '@/services/auth/authApiService';
import { pickBilingual } from '@/lib/appLocale';

interface ErrorMessages {
  title: string;
  description: string;
  viewDetails: string;
  retry: string;
  refresh: string;
  tip: string;
}

type ErrorSurface = "default" | "member";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  messages?: ErrorMessages;
  /** 会员路径下使用深海金点缀壳层，与会员门户一致 */
  surface?: ErrorSurface;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

function defaultErrorMessages(): ErrorMessages {
  return {
    title: pickBilingual("页面加载出错", "Page Load Error"),
    description: pickBilingual(
      "抱歉，页面加载时遇到了问题。请尝试重试或刷新页面。",
      "Sorry, an error occurred while loading this page. Please try again or refresh.",
    ),
    viewDetails: pickBilingual("查看错误详情", "View Error Details"),
    retry: pickBilingual("重试", "Retry"),
    refresh: pickBilingual("刷新页面", "Refresh Page"),
    tip: pickBilingual(
      "提示：如果多次重试仍无法解决，请尝试刷新页面",
      "Tip: If retrying doesn't work, try refreshing the page",
    ),
  };
}

interface ErrorBoundaryState extends State {
  retryKey: number;
}

export class ErrorBoundary extends Component<Props, ErrorBoundaryState> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, retryKey: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    // ChunkLoadError → 部署新版本后旧 chunk 已失效，自动刷新一次
    const msg = error.message || '';
    const name = error.name || '';
    const isChunk =
      name === 'ChunkLoadError' ||
      msg.includes('Loading chunk') ||
      msg.includes('Failed to fetch dynamically imported module') ||
      msg.includes('Importing a module script failed');
    if (isChunk && !sessionStorage.getItem('__eb_chunk_reload__')) {
      sessionStorage.setItem('__eb_chunk_reload__', '1');
      window.location.reload();
      return;
    }
    sessionStorage.removeItem('__eb_chunk_reload__');

    // Report error to database
    this.reportError(error, errorInfo);
  }

  private createErrorId() {
    const stamp = isoUtcTimestampDigits14();
    const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `ERR-${stamp}-${rand}`;
  }

  private async reportError(error: Error, errorInfo: React.ErrorInfo) {
    try {
      if (
        shouldSuppressGlobalErrorReport({
          message: error.message || '',
          source: 'ErrorBoundary',
        })
      ) {
        return;
      }
      const errorId = this.createErrorId();
      let employeeId: string | null = null;

      try {
        const authUser = await getCurrentUserApi();
        employeeId = authUser?.id ?? null;
      } catch {
        // ignore fetch failure
      }

      await submitErrorReport({
        error_id: errorId,
        error_message: error.message?.substring(0, 2000) || 'Unknown error',
        error_stack: error.stack?.substring(0, 5000) || null,
        component_stack: errorInfo.componentStack?.substring(0, 5000) || null,
        url: window.location.href,
        user_agent: navigator.userAgent,
        employee_id: employeeId,
        metadata: {
          source: 'ErrorBoundary',
          pathname: window.location.pathname,
        },
      });
      console.warn('[ErrorBoundary] Reported error id:', errorId);
    } catch (e) {
      // Silently fail - don't cause more errors
      console.warn('Failed to report error:', e);
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    // 增加 retryKey 强制子组件完全重新挂载，有助于恢复 ChunkLoadError 等临时错误
    this.setState((prev) => ({ hasError: false, error: null, retryKey: prev.retryKey + 1 }));
  };

  render() {
    const messages = this.props.messages || defaultErrorMessages();
    
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const surface = this.props.surface ?? "default";
      const member = surface === "member";

      if (member) {
        return (
          <div className="flex min-h-[min(520px,85dvh)] flex-col items-stretch justify-center bg-[#070B14] px-3 py-6 sm:items-center sm:p-6">
            <div className="w-full max-w-[min(100%,36rem)] rounded-2xl border border-white/[0.08] bg-[linear-gradient(168deg,rgba(17,24,39,0.95)_0%,rgba(7,11,20,0.98)_100%)] px-5 py-8 text-center shadow-[0_24px_64px_rgba(0,0,0,0.45),inset_0_1px_0_hsl(var(--pu-gold)/0.07)] sm:px-6">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#F87171]/30 bg-[#F87171]/[0.1]">
                <AlertTriangle className="h-8 w-8 text-[#FCA5A5]" strokeWidth={1.75} />
              </div>
              <h2 className="text-lg font-bold tracking-tight text-[#F8FAFC]">{messages.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-[#94A3B8]">{messages.description}</p>
              {this.state.error ? (
                <details className="mt-4 w-full rounded-lg border border-white/[0.08] bg-black/20 p-3 text-left text-xs text-[#94A3B8]">
                  <summary className="cursor-pointer text-[#CBD5E1]">{messages.viewDetails}</summary>
                  <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all text-[11px] text-[#64748B]">
                    {this.state.error.message}
                  </pre>
                </details>
              ) : null}
              <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
                <Button
                  type="button"
                  onClick={this.handleReset}
                  className="h-11 rounded-xl border-0 bg-[linear-gradient(to_bottom_right,hsl(var(--pu-gold-soft)),hsl(var(--pu-gold)),hsl(var(--pu-gold-deep)))] font-semibold text-[hsl(var(--pu-primary-foreground))] shadow-[0_8px_24px_hsl(var(--pu-gold)/0.28)] hover:opacity-95"
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  {messages.retry}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={this.handleReload}
                  className="h-11 rounded-xl border-white/15 bg-white/[0.05] text-[#F8FAFC] hover:bg-white/[0.09]"
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {messages.refresh}
                </Button>
              </div>
              <p className="mt-4 text-[11px] text-[#64748B]">{messages.tip}</p>
              {this.state.error?.message?.includes("Content Security Policy") ? (
                <p className="mt-3 max-w-md text-left text-xs text-[hsl(var(--pu-gold-soft)/0.9)]">
                  {_t(
                    "疑似 CSP 拦截：请在 index.html 的 connect-src 中加入你的 API 域名，或查看 docs/CSP与白屏排查.md。",
                    "Likely CSP block: add your API origin to connect-src in index.html, or see docs/CSP与白屏排查.md.",
                  )}
                </p>
              ) : null}
            </div>
          </div>
        );
      }

      return (
        <div className="flex min-h-[400px] flex-col items-center justify-center p-8">
          <div className="flex max-w-md flex-col items-center gap-4 text-center">
            <div className="rounded-full bg-destructive/10 p-4">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
            <h2 className="text-xl font-semibold">{messages.title}</h2>
            <p className="text-sm text-muted-foreground">{messages.description}</p>
            {this.state.error ? (
              <details className="w-full rounded-md bg-muted p-3 text-left text-xs text-muted-foreground">
                <summary className="cursor-pointer">{messages.viewDetails}</summary>
                <pre className="mt-2 whitespace-pre-wrap break-all">{this.state.error.message}</pre>
              </details>
            ) : null}
            <div className="mt-4 flex gap-3">
              <Button onClick={this.handleReset}>
                <RotateCcw className="mr-2 h-4 w-4" />
                {messages.retry}
              </Button>
              <Button variant="outline" onClick={this.handleReload}>
                <RefreshCw className="mr-2 h-4 w-4" />
                {messages.refresh}
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{messages.tip}</p>
            {this.state.error?.message?.includes("Content Security Policy") ? (
              <p className="mt-2 max-w-md text-left text-xs text-amber-700 dark:text-amber-400">
                {pickBilingual(
                  "疑似 CSP 拦截：请在 index.html 的 connect-src 中加入你的 API 域名，或查看 docs/CSP与白屏排查.md。",
                  "Likely CSP block: add your API origin to connect-src in index.html, or see docs/CSP与白屏排查.md.",
                )}
              </p>
            ) : null}
          </div>
        </div>
      );
    }

    return <React.Fragment key={this.state.retryKey}>{this.props.children}</React.Fragment>;
  }
}

function memberErrorSurfacePath(pathname: string, showMemberPortal: boolean) {
  if (pathname.startsWith("/member") || pathname.startsWith("/invite")) return true;
  if (pathname === "/" && showMemberPortal) return true;
  return false;
}

// Localized wrapper component
export function LocalizedErrorBoundary({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  const { t } = useLanguage();
  const { pathname } = useLocation();

  const messages: ErrorMessages = {
    title: t("页面加载出错", "Page Loading Error"),
    description: t(
      "抱歉，页面加载时遇到了问题。请尝试重试或刷新页面。",
      "Sorry, something went wrong loading this page. Please try again or refresh.",
    ),
    viewDetails: t("查看错误详情", "View Error Details"),
    retry: t("重试", "Retry"),
    refresh: t("刷新页面", "Refresh Page"),
    tip: t("提示：如果多次重试仍无法解决，请尝试刷新页面", "Tip: If retrying doesn't work, try refreshing the page"),
  };

  const surface: ErrorSurface = memberErrorSurfacePath(pathname, showMemberPortal) ? "member" : "default";

  return (
    <ErrorBoundary messages={messages} fallback={fallback} surface={surface}>
      {children}
    </ErrorBoundary>
  );
}

export default ErrorBoundary;
