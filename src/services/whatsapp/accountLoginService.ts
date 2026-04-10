/**
 * WhatsApp 账号登录状态机 Service
 *
 * 职责：
 *   - 管理单个账号的扫码登录全生命周期
 *   - 页面组件只消费本 service 输出，不自行处理状态流转
 *   - 通过 API Client（localWhatsappBridge）与 companion 交互
 *
 * 状态机：
 *   idle → requesting_qr → qr_ready → scanned → connected
 *                       ↘ companion_offline
 *                       ↘ error
 *   qr_ready → expired → idle (可重试)
 *   qr_ready → error   → idle (可重试)
 */

import { localWhatsappBridge, resetDetection } from '@/api/localWhatsappBridge';

export type LoginState =
  | 'idle'                  // 初始状态，等待用户操作
  | 'checking_companion'    // 正在检测 companion 是否在线
  | 'companion_offline'     // companion 未运行，需要用户启动
  | 'requesting_qr'         // 已向 companion 发起登录请求，等待 QR 码
  | 'qr_ready'              // QR 码已就绪，等待用户扫码
  | 'scanned'               // 用户已扫码，等待手机端确认
  | 'connected'             // 登录成功
  | 'expired'               // QR 码已过期
  | 'error';                // 出错

export interface LoginSession {
  state: LoginState;
  sessionId: string | null;
  qrDataUrl: string | null;
  errorMessage: string | null;
  elapsedSeconds: number;
  companionOnline: boolean | null;
}

const QR_TIMEOUT_MS = 90_000;
const POLL_INTERVAL_MS = 2000;

/**
 * 创建一个登录会话控制器
 * 页面层通过 onStateChange 回调接收状态变化
 */
export function createLoginController(onStateChange: (session: LoginSession) => void) {
  let state: LoginState = 'idle';
  let sessionId: string | null = null;
  let qrDataUrl: string | null = null;
  let errorMessage: string | null = null;
  let companionOnline: boolean | null = null;
  let startTime = 0;
  let elapsedSeconds = 0;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let elapsedTimer: ReturnType<typeof setInterval> | null = null;
  let destroyed = false;

  function emit() {
    if (destroyed) return;
    onStateChange({
      state,
      sessionId,
      qrDataUrl,
      errorMessage,
      elapsedSeconds,
      companionOnline,
    });
  }

  function setState(s: LoginState, msg?: string) {
    state = s;
    if (msg !== undefined) errorMessage = msg;
    emit();
  }

  function stopTimers() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null; }
  }

  function startElapsedTimer() {
    startTime = Date.now();
    elapsedSeconds = 0;
    elapsedTimer = setInterval(() => {
      elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
      emit();
    }, 1000);
  }

  async function pollQrStatus() {
    if (!sessionId || destroyed) return;

    if (Date.now() - startTime > QR_TIMEOUT_MS) {
      stopTimers();
      setState('expired', '二维码已过期，请重新生成');
      return;
    }

    try {
      const result = await localWhatsappBridge.getSessionQr(sessionId);
      if (!result.success || destroyed) return;

      const { state: remoteState, qrDataUrl: remoteQr } = result.data;

      switch (remoteState) {
        case 'qr_pending':
          if (remoteQr) qrDataUrl = remoteQr;
          if (state !== 'qr_ready') setState('qr_ready');
          else emit();
          break;
        case 'scanned':
        case 'authenticated':
          setState('scanned');
          break;
        case 'connected':
          stopTimers();
          setState('connected');
          break;
        case 'disconnected':
        case 'error':
          stopTimers();
          setState('error', '连接失败，请重试');
          break;
      }
    } catch {
      // 单次轮询失败不中断，等下次
    }
  }

  return {
    /** 检查 companion 并创建登录会话 */
    async start(displayName: string, proxyUrl?: string) {
      stopTimers();
      sessionId = null;
      qrDataUrl = null;
      errorMessage = null;

      // 1. 检测 companion
      setState('checking_companion');
      resetDetection();
      const online = await localWhatsappBridge.checkHealth();
      companionOnline = online;

      if (!online) {
        setState('companion_offline', '未检测到本地 PC 客户端（WhatsApp Companion）');
        return;
      }

      // 2. 请求创建登录会话
      setState('requesting_qr');
      const result = await localWhatsappBridge.addSession(displayName, proxyUrl);
      if (!result.success) {
        setState('error', result.error.message || '创建登录会话失败');
        return;
      }

      sessionId = result.data.sessionId;

      // 3. 启动轮询
      startElapsedTimer();
      pollTimer = setInterval(pollQrStatus, POLL_INTERVAL_MS);
      // 立即首次轮询
      await pollQrStatus();
    },

    /** 重试（从 error/expired/companion_offline 恢复） */
    async retry(displayName: string, proxyUrl?: string) {
      return this.start(displayName, proxyUrl);
    },

    /** 取消并清理 */
    cancel() {
      stopTimers();
      if (sessionId && companionOnline) {
        localWhatsappBridge.deleteSession(sessionId).catch(() => {});
      }
      sessionId = null;
      qrDataUrl = null;
      errorMessage = null;
      setState('idle');
    },

    /** 销毁控制器 */
    destroy() {
      stopTimers();
      destroyed = true;
    },

    getState(): LoginSession {
      return { state, sessionId, qrDataUrl, errorMessage, elapsedSeconds, companionOnline };
    },
  };
}
