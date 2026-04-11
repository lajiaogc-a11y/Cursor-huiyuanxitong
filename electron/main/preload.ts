/**
 * Electron Preload 脚本
 *
 * 通过 contextBridge 向 renderer 暴露有限 API。
 * 前端通过 window.electronAPI.isElectron 判断是否在桌面客户端内运行。
 */

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  /** 获取 app 版本（打包后从 app.getVersion() 读取，比 process.env 可靠） */
  getVersion: () => ipcRenderer.invoke('get-app-version') as Promise<string>,
  /** 手动触发检测更新 */
  checkForUpdate: () => ipcRenderer.send('check-for-update'),
  /** 安装已下载的更新并重启 */
  installUpdate: () => ipcRenderer.send('install-update'),
  /** 监听更新状态推送 */
  onUpdateStatus: (cb: (status: unknown) => void) => {
    const handler = (_event: unknown, status: unknown) => cb(status);
    ipcRenderer.on('update-status', handler);
    return () => { ipcRenderer.removeListener('update-status', handler); };
  },
});
