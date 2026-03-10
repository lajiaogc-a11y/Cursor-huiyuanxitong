import React, { Component, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, RotateCcw } from 'lucide-react';

interface ErrorMessages {
  title: string;
  description: string;
  viewDetails: string;
  retry: string;
  refresh: string;
  tip: string;
}

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  messages?: ErrorMessages;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

const DEFAULT_MESSAGES: ErrorMessages = {
  title: '页面加载出错',
  description: '抱歉，页面加载时遇到了问题。请尝试重试或刷新页面。',
  viewDetails: '查看错误详情',
  retry: '重试',
  refresh: '刷新页面',
  tip: '提示：如果多次重试仍无法解决，请尝试刷新页面',
};

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
    // Report error to database
    this.reportError(error, errorInfo);
  }

  private async reportError(error: Error, errorInfo: React.ErrorInfo) {
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      await supabase.from('error_reports' as any).insert({
        error_message: error.message?.substring(0, 2000) || 'Unknown error',
        error_stack: error.stack?.substring(0, 5000) || null,
        component_stack: errorInfo.componentStack?.substring(0, 5000) || null,
        url: window.location.href,
        user_agent: navigator.userAgent,
      });
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
    const messages = this.props.messages || DEFAULT_MESSAGES;
    
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8">
          <div className="flex flex-col items-center gap-4 max-w-md text-center">
            <div className="p-4 rounded-full bg-destructive/10">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
            <h2 className="text-xl font-semibold">{messages.title}</h2>
            <p className="text-muted-foreground text-sm">
              {messages.description}
            </p>
            {this.state.error && (
              <details className="text-xs text-muted-foreground bg-muted p-3 rounded-md w-full text-left" open>
                <summary className="cursor-pointer">{messages.viewDetails}</summary>
                <pre className="mt-2 whitespace-pre-wrap break-all">
                  {this.state.error.message}
                </pre>
              </details>
            )}
            <div className="flex gap-3 mt-4">
              <Button onClick={this.handleReset}>
                <RotateCcw className="h-4 w-4 mr-2" />
                {messages.retry}
              </Button>
              <Button variant="outline" onClick={this.handleReload}>
                <RefreshCw className="h-4 w-4 mr-2" />
                {messages.refresh}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {messages.tip}
            </p>
          </div>
        </div>
      );
    }

    return <React.Fragment key={this.state.retryKey}>{this.props.children}</React.Fragment>;
  }
}

// Localized wrapper component
import { useLanguage } from '@/contexts/LanguageContext';

export function LocalizedErrorBoundary({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  const { t } = useLanguage();
  
  const messages: ErrorMessages = {
    title: t('页面加载出错', 'Page Loading Error'),
    description: t(
      '抱歉，页面加载时遇到了问题。请尝试重试或刷新页面。',
      'Sorry, something went wrong loading this page. Please try again or refresh.'
    ),
    viewDetails: t('查看错误详情', 'View Error Details'),
    retry: t('重试', 'Retry'),
    refresh: t('刷新页面', 'Refresh Page'),
    tip: t(
      '提示：如果多次重试仍无法解决，请尝试刷新页面',
      'Tip: If retrying doesn\'t work, try refreshing the page'
    ),
  };
  
  return (
    <ErrorBoundary messages={messages} fallback={fallback}>
      {children}
    </ErrorBoundary>
  );
}

export default ErrorBoundary;
