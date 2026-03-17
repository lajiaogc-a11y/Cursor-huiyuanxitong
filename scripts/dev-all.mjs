#!/usr/bin/env node
/**
 * 同时启动后端 API 和前端开发服务器
 * 用法: npm run dev:all
 */
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const isWin = process.platform === 'win32';

function run(cmd, args, cwd, label) {
  const proc = spawn(cmd, args, {
    cwd,
    stdio: 'inherit',
    shell: isWin,
  });
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
const api = run(isWin ? 'npm.cmd' : 'npm', ['run', 'dev'], join(root, 'server'), 'API');

console.log('启动前端 (端口 8080)...');
const web = run(isWin ? 'npm.cmd' : 'npm', ['run', 'dev'], root, 'Web');

process.on('SIGINT', () => {
  api.kill();
  web.kill();
  process.exit(0);
});
