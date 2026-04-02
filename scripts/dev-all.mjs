#!/usr/bin/env node
/**
 * 同时启动后端 API 和前端开发服务器
 * 用法: npm run dev:all
 */
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { setTimeout as delay } from 'timers/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const isWin = process.platform === 'win32';

/** Windows 上 shell:true + npm.cmd 曾导致重复拉起子进程、3001 端口冲突；用 cmd /c + cwd 更稳 */
function runNpmDev(cwd, label) {
  const proc = isWin
    ? spawn('cmd.exe', ['/c', 'npm', 'run', 'dev'], { cwd, stdio: 'inherit' })
    : spawn('npm', ['run', 'dev'], { cwd, stdio: 'inherit' });
  proc.on('error', (err) => {
    console.error(`[${label}] 启动失败:`, err.message);
  });
  proc.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`[${label}] 退出码: ${code}`);
    }
  });
  return proc;
}

console.log('启动后端 API (端口 3001)...');
const api = runNpmDev(join(root, 'server'), 'API');

// 错开启动，避免与 API 同时竞争端口（部分环境下会出现 3001 瞬时双绑）
await delay(2500);

console.log('启动前端 (默认端口 8081，可用 VITE_DEV_PORT 覆盖)...');
const web = runNpmDev(root, 'Web');

process.on('SIGINT', () => {
  api.kill();
  web.kill();
  process.exit(0);
});
