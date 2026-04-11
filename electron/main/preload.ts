/**
 * Electron Preload 脚本
 *
 * 通过 contextBridge 向 renderer 暴露有限 API。
 * 前端通过 window.electronAPI.isElectron 判断是否在桌面客户端内运行。
 */

import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  version: process.env.npm_package_version ?? '1.0.0',
});
