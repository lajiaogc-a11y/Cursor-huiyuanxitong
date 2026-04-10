/**
 * 添加 WhatsApp 账号对话框
 *
 * 支持两种模式：
 *  - 演示模式：生成示例二维码，用于测试 UI 流程（无需真实 WhatsApp 连接）
 *  - 真实模式：通过本地 Companion + Baileys 生成真实二维码，需要：
 *      1. 启动 Electron Companion（localhost:3100）
 *      2. 网络可访问 WhatsApp 服务器（国内需配置代理/VPN）
 *      3. 手机安装 WhatsApp，扫码完成登录
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  QrCode, Loader2, CheckCircle2, XCircle,
  RefreshCw, X, Wifi, WifiOff, Info, ChevronDown, ChevronUp,
  Smartphone,
} from 'lucide-react';
import { addSession, getSessionQr, checkCompanionOnline } from '@/services/whatsapp/localSessionBridgeService';

interface Props {
  open: boolean;
  onClose: () => void;
  onConnected: (sessionId: string) => void;
}

type Stage =
  | 'checking'     // 检测 Companion 状态
  | 'input'        // 输入账号名
  | 'initializing' // 等待 QR
  | 'qr_pending'   // 显示 QR
  | 'connected'    // 已连接
  | 'error';

const POLL_INTERVAL_MS = 2000;
const QR_TIMEOUT_MS = 90_000;

export function AddAccountDialog({ open, onClose, onConnected }: Props) {
  const [stage, setStage] = useState<Stage>('checking');
  const [displayName, setDisplayName] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [companionOnline, setCompanionOnline] = useState<boolean | null>(null);
  const [isDemoQr, setIsDemoQr] = useState(false);
  const [proxyUrl, setProxyUrl] = useState('');
  const [showProxy, setShowProxy] = useState(false);

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  /* ── 停止轮询 ── */
  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  /* ── 关闭并重置 ── */
  const handleClose = useCallback(() => {
    stopPolling();
    setStage('checking');
    setDisplayName('');
    setSessionId(null);
    setQrDataUrl(null);
    setErrorMsg('');
    setElapsed(0);
    setIsDemoQr(false);
    onClose();
  }, [stopPolling, onClose]);

  /* ── 轮询 QR 状态 ── */
  const startPolling = useCallback((sid: string) => {
    startTimeRef.current = Date.now();

    pollTimerRef.current = setInterval(async () => {
      const elapsedMs = Date.now() - startTimeRef.current;
      setElapsed(Math.floor(elapsedMs / 1000));

      if (elapsedMs > QR_TIMEOUT_MS) {
        stopPolling();
        setStage('error');
        setErrorMsg('二维码已超时（90秒），请重试');
        return;
      }

      const qrStatus = await getSessionQr(sid);
      if (!qrStatus) return;

      if (qrStatus.state === 'connected') {
        stopPolling();
        setStage('connected');
        setTimeout(() => {
          onConnected(sid);
          handleClose();
        }, 1500);
        return;
      }

      if (qrStatus.state === 'qr_pending' && qrStatus.qrDataUrl) {
        setQrDataUrl(qrStatus.qrDataUrl);
        // 演示 QR 的 data 里包含 DEMO- 前缀
        setIsDemoQr(qrStatus.qrDataUrl.length < 200);
        setStage('qr_pending');
      } else if (qrStatus.state === 'disconnected') {
        stopPolling();
        setStage('error');
        setErrorMsg('连接断开，请重试');
      }
    }, POLL_INTERVAL_MS);
  }, [stopPolling, onConnected, handleClose]);

  /* ── 点击"开始"添加账号 ── */
  const handleStart = useCallback(async () => {
    const name = displayName.trim() || '新账号';
    setStage('initializing');
    setErrorMsg('');

    const result = await addSession(name, proxyUrl.trim() || undefined);
    if (!result) {
      setStage('error');
      setErrorMsg(
        '无法连接到 WhatsApp Companion（localhost:3100）。\n\n' +
        '请先启动本地 Companion：\n  cd electron && npx tsx start.ts',
      );
      return;
    }

    setSessionId(result.sessionId);
    startPolling(result.sessionId);
  }, [displayName, proxyUrl, startPolling]);

  /* ── 打开时先检测 Companion ── */
  useEffect(() => {
    if (!open) return;
    setStage('checking');
    setCompanionOnline(null);
    checkCompanionOnline().then(online => {
      setCompanionOnline(online);
      setStage('input');
    });
  }, [open]);

  /* ── 清理轮询 ── */
  useEffect(() => {
    if (!open) stopPolling();
    return () => stopPolling();
  }, [open, stopPolling]);

  if (!open) return null;

  /* ── 当前 Companion 处于演示模式（未设置 USE_REAL_WHATSAPP=1）── */
  const isDemo = companionOnline && !proxyUrl;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-background rounded-2xl shadow-2xl w-[420px] max-w-[95vw] overflow-hidden">

        {/* 顶部标题栏 */}
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

        {/* Companion 状态条 */}
        {companionOnline !== null && (
          <div className={cn(
            'mx-5 mb-3 px-3 py-2 rounded-lg text-xs',
            companionOnline
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-amber-50 text-amber-700 border border-amber-200',
          )}>
            {companionOnline
              ? (
                <div className="flex items-center gap-2">
                  <Wifi className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>Companion 已连接（localhost:3100）{isDemo ? ' — 演示模式' : ' — 真实模式'}</span>
                </div>
              )
              : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <WifiOff className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="font-medium">PC 客户端未启动</span>
                  </div>
                  <div className="text-[11px] leading-relaxed space-y-1 pl-5">
                    <p>需要先下载并安装 <strong>FastGC WhatsApp Companion</strong> 桌面客户端：</p>
                    <p>1. 点击右上角 <strong>↓ 下载按钮</strong> 获取安装包</p>
                    <p>2. 安装并启动客户端</p>
                    <p>3. 返回此页面即可扫码登录</p>
                  </div>
                </div>
              )
            }
          </div>
        )}

        <div className="px-5 pb-5">

          {/* ── 检测中 ── */}
          {stage === 'checking' && (
            <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              检测 Companion 状态...
            </div>
          )}

          {/* ── 输入账号名 ── */}
          {stage === 'input' && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">账号备注名</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && companionOnline && handleStart()}
                  placeholder="例如：客服主号、销售号..."
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                  autoFocus
                />
              </div>

              {/* 操作步骤说明 */}
              <div className="bg-muted/40 rounded-xl p-3.5 space-y-2.5">
                <p className="text-xs font-medium text-foreground/70 flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5" /> 操作步骤
                </p>
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  <div className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-primary/20 text-primary text-[10px] flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
                    <span>点击"生成二维码"按钮</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-primary/20 text-primary text-[10px] flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
                    <span>手机打开 WhatsApp → 右上角菜单 → <strong>已链接的设备</strong></span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-primary/20 text-primary text-[10px] flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
                    <span>点击"<strong>链接设备</strong>" → 扫描屏幕上的二维码</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-primary/20 text-primary text-[10px] flex items-center justify-center flex-shrink-0 mt-0.5">4</span>
                    <span>等待自动连接成功</span>
                  </div>
                </div>
              </div>

              {/* 代理配置（折叠） */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowProxy(v => !v)}
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
                      value={proxyUrl}
                      onChange={e => setProxyUrl(e.target.value)}
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

              {/* 提示：演示模式说明 */}
              {companionOnline && !proxyUrl && (
                <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                  <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <span>
                    当前为<strong>演示模式</strong>（无代理）—— 生成的是示例二维码，手机扫描后无法真实登录。
                    需要真实登录请填写上方代理地址，或确认网络可直连 WhatsApp。
                  </span>
                </div>
              )}

              {/* 不在线时的提示 */}
              {!companionOnline && (
                <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-3 space-y-2">
                  <div className="flex items-center gap-2 font-medium">
                    <XCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    PC 客户端未检测到
                  </div>
                  <p className="pl-5 leading-relaxed">
                    请先在右上角 <strong>↓ 下载按钮</strong> 下载并安装 PC 客户端，
                    安装后启动即可自动连接。
                  </p>
                </div>
              )}

              <button
                onClick={handleStart}
                disabled={!companionOnline}
                className={cn(
                  'w-full py-2.5 rounded-xl text-sm font-medium transition-colors',
                  companionOnline
                    ? 'bg-[#25D366] text-white hover:bg-[#1ebe5d]'
                    : 'bg-muted text-muted-foreground cursor-not-allowed',
                )}
              >
                {companionOnline ? '生成二维码' : '请先安装并启动 PC 客户端'}
              </button>
            </div>
          )}

          {/* ── 初始化中 ── */}
          {stage === 'initializing' && (
            <div className="flex flex-col items-center gap-4 py-10">
              <Loader2 className="w-10 h-10 text-[#25D366] animate-spin" />
              <p className="text-sm text-muted-foreground">正在生成二维码，请稍候...</p>
            </div>
          )}

          {/* ── 显示 QR ── */}
          {stage === 'qr_pending' && qrDataUrl && (
            <div className="flex flex-col items-center gap-3">

              {/* 演示模式警告横幅 */}
              {isDemoQr && (
                <div className="w-full flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <Info className="w-3.5 h-3.5 flex-shrink-0" />
                  演示二维码 — 用于测试界面流程，扫描后不会真实连接 WhatsApp
                </div>
              )}

              {/* QR 图像 */}
              <div className={cn(
                'border-2 rounded-xl p-3 bg-white',
                isDemoQr ? 'border-amber-300 border-dashed' : 'border-[#25D366]',
              )}>
                <img
                  src={qrDataUrl}
                  alt="WhatsApp QR Code"
                  className="w-52 h-52 object-contain"
                />
              </div>

              <div className="text-center space-y-1">
                <p className="text-sm font-medium">
                  {isDemoQr ? '演示二维码（测试用）' : '请用手机 WhatsApp 扫描'}
                </p>
                {!isDemoQr && (
                  <p className="text-xs text-muted-foreground">
                    已链接的设备 → 链接设备 → 扫描二维码
                  </p>
                )}
                <p className={cn(
                  'text-xs tabular-nums',
                  elapsed > 60 ? 'text-orange-500' : 'text-muted-foreground',
                )}>
                  有效时间 {90 - elapsed}s
                </p>
              </div>

              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" />
                {isDemoQr ? '模拟等待中（约30秒后自动连接）...' : '等待扫码...'}
              </div>
            </div>
          )}

          {/* ── 已连接 ── */}
          {stage === 'connected' && (
            <div className="flex flex-col items-center gap-3 py-10">
              <div className="w-16 h-16 rounded-full bg-[#25D366]/10 flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10 text-[#25D366]" />
              </div>
              <p className="text-base font-semibold text-[#25D366]">账号登录成功！</p>
              <p className="text-xs text-muted-foreground">正在加载会话...</p>
            </div>
          )}

          {/* ── 出错 ── */}
          {stage === 'error' && (
            <div className="flex flex-col items-center gap-4 py-6">
              <XCircle className="w-10 h-10 text-destructive" />
              <p className="text-sm text-center whitespace-pre-line text-destructive">{errorMsg}</p>
              <div className="flex gap-2 w-full">
                <button
                  onClick={() => {
                    setStage('input');
                    setSessionId(null);
                    setQrDataUrl(null);
                    setElapsed(0);
                  }}
                  className="flex-1 py-2 rounded-xl border text-sm flex items-center justify-center gap-1.5 hover:bg-muted transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> 重试
                </button>
                <button
                  onClick={handleClose}
                  className="flex-1 py-2 rounded-xl bg-muted text-sm hover:bg-muted/80 transition-colors"
                >
                  关闭
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
