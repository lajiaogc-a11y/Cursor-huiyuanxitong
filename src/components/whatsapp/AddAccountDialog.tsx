/**
 * 添加 WhatsApp 账号对话框（真实登录接入）
 *
 * 全部状态来自 accountLoginService 状态机，组件只负责渲染。
 * 不生成假二维码、不做演示模式。
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  QrCode, Loader2, CheckCircle2, AlertTriangle,
  RefreshCw, X, Wifi, WifiOff, Info, ChevronDown, ChevronUp,
  Smartphone, Download, Clock,
} from 'lucide-react';
import {
  createLoginController,
  type LoginSession,
  type LoginState,
} from '@/services/whatsapp/accountLoginService';
import { isRunningInElectron } from '@/api/localWhatsappBridge';

interface Props {
  open: boolean;
  onClose: () => void;
  onConnected: (sessionId: string) => void;
}

export function AddAccountDialog({ open, onClose, onConnected }: Props) {
  const [displayName, setDisplayName] = useState('');
  const [proxyUrl, setProxyUrl] = useState('');
  const [showProxy, setShowProxy] = useState(false);
  const [session, setSession] = useState<LoginSession>({
    state: 'idle',
    sessionId: null,
    qrDataUrl: null,
    errorMessage: null,
    elapsedSeconds: 0,
    companionOnline: null,
    phone: null,
    displayName: null,
  });

  const controllerRef = useRef<ReturnType<typeof createLoginController> | null>(null);

  // 创建/销毁控制器
  useEffect(() => {
    if (!open) return;
    const ctrl = createLoginController(setSession);
    controllerRef.current = ctrl;
    return () => { ctrl.destroy(); controllerRef.current = null; };
  }, [open]);

  const handleClose = useCallback(() => {
    controllerRef.current?.cancel();
    setDisplayName('');
    setProxyUrl('');
    setShowProxy(false);
    onClose();
  }, [onClose]);

  const handleStart = useCallback(() => {
    const name = displayName.trim() || '新账号';
    controllerRef.current?.start(name, proxyUrl.trim() || undefined);
  }, [displayName, proxyUrl]);

  const handleRetry = useCallback(() => {
    const name = displayName.trim() || '新账号';
    controllerRef.current?.retry(name, proxyUrl.trim() || undefined);
  }, [displayName, proxyUrl]);

  // 登录成功后自动回调
  useEffect(() => {
    if (session.state === 'connected' && session.sessionId) {
      const id = session.sessionId;
      const timer = setTimeout(() => {
        onConnected(id);
        handleClose();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [session.state, session.sessionId, onConnected, handleClose]);

  if (!open) return null;

  const { state, qrDataUrl, errorMessage, elapsedSeconds, companionOnline } = session;
  const remaining = Math.max(0, 90 - elapsedSeconds);
  const isActionable = state === 'idle' || state === 'companion_offline' || state === 'error' || state === 'expired';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-background rounded-2xl shadow-2xl w-[420px] max-w-[95vw] overflow-hidden">

        {/* 顶部标题 */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[#25D366]/15 flex items-center justify-center">
              <QrCode className="w-4 h-4 text-[#25D366]" />
            </div>
            <h2 className="text-base font-semibold">添加 WhatsApp 账号</h2>
          </div>
          <button onClick={handleClose} className="text-muted-foreground hover:text-foreground transition-colors rounded-md p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Companion 状态指示器 */}
        <CompanionStatusBar state={state} companionOnline={companionOnline} />

        <div className="px-5 pb-5">

          {/* ── 输入阶段 / 可操作状态 ── */}
          {isActionable && (
            <InputPanel
              state={state}
              displayName={displayName}
              onDisplayNameChange={setDisplayName}
              proxyUrl={proxyUrl}
              onProxyUrlChange={setProxyUrl}
              showProxy={showProxy}
              onToggleProxy={() => setShowProxy(v => !v)}
              errorMessage={errorMessage}
              companionOnline={companionOnline}
              onStart={handleStart}
              onRetry={handleRetry}
              onCancel={handleClose}
            />
          )}

          {/* ── 检测中 ── */}
          {state === 'checking_companion' && (
            <StatusDisplay icon={<Loader2 className="w-8 h-8 text-primary animate-spin" />} title="正在检测本地客户端..." />
          )}

          {/* ── 请求 QR 中 ── */}
          {state === 'requesting_qr' && (
            <StatusDisplay icon={<Loader2 className="w-8 h-8 text-[#25D366] animate-spin" />} title="正在请求二维码..." subtitle="请稍候，正在与 WhatsApp 服务器建立连接" />
          )}

          {/* ── QR 已就绪 ── */}
          {state === 'qr_ready' && (
            <QrPanel qrDataUrl={qrDataUrl} remaining={remaining} elapsedSeconds={elapsedSeconds} />
          )}

          {/* ── 已扫码等待确认 ── */}
          {state === 'scanned' && (
            <StatusDisplay
              icon={<Smartphone className="w-8 h-8 text-[#25D366]" />}
              title="已扫码，等待手机确认..."
              subtitle="请在手机 WhatsApp 上确认登录"
            />
          )}

          {/* ── 登录成功 ── */}
          {state === 'connected' && (
            <div className="flex flex-col items-center gap-3 py-10">
              <CheckCircle2 className="w-10 h-10 text-[#25D366]" />
              <p className="text-base font-semibold text-[#25D366]">账号登录成功！</p>
              {(session.phone || session.displayName) && (
                <div className="text-center space-y-0.5">
                  {session.phone && <p className="text-sm font-mono">{session.phone}</p>}
                  {session.displayName && <p className="text-xs text-muted-foreground">{session.displayName}</p>}
                </div>
              )}
              <p className="text-xs text-muted-foreground">正在加载会话数据...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────── */
/*  子组件                                                                */
/* ────────────────────────────────────────────────────────────────────── */

function CompanionStatusBar({ state, companionOnline }: { state: LoginState; companionOnline: boolean | null }) {
  if (companionOnline === null && state !== 'checking_companion') return null;

  if (companionOnline === true) {
    return (
      <div className="mx-5 mb-3 px-3 py-2 rounded-lg text-xs bg-green-50 text-green-700 border border-green-200">
        <div className="flex items-center gap-2">
          <Wifi className="w-3.5 h-3.5 flex-shrink-0" />
          <span>PC 客户端已连接</span>
        </div>
      </div>
    );
  }

  if (companionOnline === false) {
    return (
      <div className="mx-5 mb-3 px-3 py-2 rounded-lg text-xs bg-amber-50 text-amber-700 border border-amber-200">
        <div className="flex items-center gap-2">
          <WifiOff className="w-3.5 h-3.5 flex-shrink-0" />
          <span>PC 客户端未连接</span>
        </div>
      </div>
    );
  }

  return null;
}

function InputPanel({
  state,
  displayName,
  onDisplayNameChange,
  proxyUrl,
  onProxyUrlChange,
  showProxy,
  onToggleProxy,
  errorMessage,
  companionOnline,
  onStart,
  onRetry,
  onCancel,
}: {
  state: LoginState;
  displayName: string;
  onDisplayNameChange: (v: string) => void;
  proxyUrl: string;
  onProxyUrlChange: (v: string) => void;
  showProxy: boolean;
  onToggleProxy: () => void;
  errorMessage: string | null;
  companionOnline: boolean | null;
  onStart: () => void;
  onRetry: () => void;
  onCancel: () => void;
}) {
  const isError = state === 'error' || state === 'expired';
  const isCompanionOff = state === 'companion_offline';

  return (
    <div className="space-y-4">
      {/* 错误 / 过期 / companion 离线提示 */}
      {(isError || isCompanionOff) && (
        <div className={cn(
          'flex items-start gap-2.5 text-xs rounded-lg px-3 py-3 border',
          isCompanionOff
            ? 'text-amber-800 bg-amber-50 border-amber-200'
            : state === 'expired'
              ? 'text-orange-800 bg-orange-50 border-orange-200'
              : 'text-red-800 bg-red-50 border-red-200',
        )}>
          {isCompanionOff ? (
            <Download className="w-4 h-4 flex-shrink-0 mt-0.5" />
          ) : state === 'expired' ? (
            <Clock className="w-4 h-4 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          )}
          <div className="space-y-1.5">
            <p className="font-medium">
              {isCompanionOff ? '需要启动本地 PC 客户端' : state === 'expired' ? '二维码已过期' : '连接出错'}
            </p>
            {errorMessage && <p className="leading-relaxed">{errorMessage}</p>}
            {isCompanionOff && !isRunningInElectron() && (
              <div className="leading-relaxed space-y-0.5">
                <p>请确保以下条件：</p>
                <p>1. 已下载并安装 PC 客户端（右上角 <strong>↓</strong> 按钮）</p>
                <p>2. PC 客户端已启动运行</p>
                <p>3. 未被防火墙/杀毒软件拦截</p>
              </div>
            )}
            {isCompanionOff && isRunningInElectron() && (
              <div className="leading-relaxed">
                <p>Companion 服务异常，请尝试重启应用。</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 账号名输入 */}
      <div>
        <label className="text-sm font-medium mb-1.5 block">账号备注名</label>
        <input
          type="text"
          id="wa-login-display-name"
          name="displayName"
          value={displayName}
          onChange={e => onDisplayNameChange(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onStart()}
          placeholder="例如：客服主号、销售号..."
          className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
          autoFocus
        />
      </div>

      {/* 操作步骤 */}
      <div className="bg-muted/40 rounded-xl p-3.5 space-y-2.5">
        <p className="text-xs font-medium text-foreground/70 flex items-center gap-1.5">
          <Smartphone className="w-3.5 h-3.5" /> 操作步骤
        </p>
        <div className="space-y-1.5 text-xs text-muted-foreground">
          {[
            '确保 PC 客户端已启动运行',
            '点击下方按钮，等待二维码生成',
            '手机打开 WhatsApp → 右上角菜单 → 已链接的设备',
            '点击"链接设备" → 扫描屏幕上的二维码',
          ].map((text, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="w-4 h-4 rounded-full bg-primary/20 text-primary text-[10px] flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
              <span>{text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 代理配置 */}
      <div>
        <button
          type="button"
          onClick={onToggleProxy}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {showProxy ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          高级设置（代理/VPN）
        </button>
        {showProxy && (
          <div className="mt-2 space-y-1.5">
            <label className="text-xs font-medium block">HTTP 代理地址（国内访问 WhatsApp 必须填写）</label>
            <input
              type="text"
              id="wa-login-proxy"
              name="proxyUrl"
              value={proxyUrl}
              onChange={e => onProxyUrlChange(e.target.value)}
              placeholder="http://127.0.0.1:7890"
              className="w-full px-3 py-1.5 text-xs border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono"
            />
            <p className="text-[11px] text-muted-foreground flex items-start gap-1">
              <Info className="w-3 h-3 flex-shrink-0 mt-0.5" />
              填写后将通过代理连接 WhatsApp 服务器（Clash 默认端口 7890，V2Ray 默认 10808）
            </p>
          </div>
        )}
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-2">
        <button
          onClick={isError || isCompanionOff ? onRetry : onStart}
          className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors bg-[#25D366] text-white hover:bg-[#1ebe5d] flex items-center justify-center gap-2"
        >
          {isError || isCompanionOff ? (
            <><RefreshCw className="w-3.5 h-3.5" /> 重试</>
          ) : (
            '开始连接'
          )}
        </button>
        {(isError || isCompanionOff) && (
          <button
            onClick={onCancel}
            className="px-4 py-2.5 rounded-xl text-sm border hover:bg-muted transition-colors"
          >
            取消
          </button>
        )}
      </div>
    </div>
  );
}

function QrPanel({ qrDataUrl, remaining, elapsedSeconds }: { qrDataUrl: string | null; remaining: number; elapsedSeconds: number }) {
  return (
    <div className="flex flex-col items-center gap-3">
      {/* QR 图像容器（固定尺寸，防闪烁） */}
      <div className="border-2 border-[#25D366] rounded-xl p-3 bg-white w-[240px] h-[240px] flex items-center justify-center">
        {qrDataUrl ? (
          <img src={qrDataUrl} alt="WhatsApp QR Code" className="w-52 h-52 object-contain" />
        ) : (
          <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
        )}
      </div>

      <div className="text-center space-y-1">
        <p className="text-sm font-medium">请用手机 WhatsApp 扫描</p>
        <p className="text-xs text-muted-foreground">已链接的设备 → 链接设备 → 扫描二维码</p>
        <p className={cn(
          'text-xs tabular-nums',
          remaining < 30 ? 'text-orange-500' : 'text-muted-foreground',
        )}>
          有效时间 {remaining}s
        </p>
      </div>

      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="w-3 h-3 animate-spin" />
        等待扫码...
      </div>
    </div>
  );
}

function StatusDisplay({ icon, title, subtitle, className }: { icon: React.ReactNode; title: string; subtitle?: string; className?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10">
      {icon}
      <p className={cn('text-base font-semibold', className)}>{title}</p>
      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  );
}
