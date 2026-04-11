/**
 * 本地 HTTP API 服务（异步路由版）
 *
 * 在 127.0.0.1:3100 启动轻量 HTTP 服务器，供前端 localWhatsappBridge.ts 调用。
 * 使用 Node.js 内置 http 模块，不依赖 express / fastify。
 *
 * 安全控制：
 *   - CORS 白名单：只允许已知域名和本地开发地址
 *   - 可选 BRIDGE_TOKEN：设置后所有非 /health 请求需携带 X-Bridge-Token
 */

import * as http from 'node:http';
import { URL } from 'node:url';
import type { IWhatsAppAdapter } from '../session-manager/adapterInterface.js';
import { createRouteHandler } from './routes.js';

export const LOCAL_API_VERSION = '0.3.0';
export const DEFAULT_PORT = 3100;
export const DEFAULT_HOST = '127.0.0.1';

// ── CORS 白名单 ──

const ALLOWED_ORIGINS = new Set([
  'https://admin.crm.fastgc.cc',
  'https://crm.fastgc.cc',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:3000',
]);

function isOriginAllowed(origin: string): boolean {
  if (!origin) return true; // same-origin requests
  return ALLOWED_ORIGINS.has(origin);
}

function setCorsHeaders(req: http.IncomingMessage, res: http.ServerResponse): boolean {
  const origin = req.headers.origin ?? '';
  if (!isOriginAllowed(origin)) {
    return false;
  }
  res.setHeader('Access-Control-Allow-Origin', origin || DEFAULT_HOST);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Bridge-Token');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Vary', 'Origin');
  return true;
}

// ── JSON 工具 ──

function sendJson(res: http.ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function parseBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      if (chunks.length === 0) { resolve({}); return; }
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8'))); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

// ── 启动服务器 ──

export interface StartOptions {
  adapter: IWhatsAppAdapter;
  adapterMode?: string;
  port?: number;
  host?: string;
}

export async function startLocalApi(options: StartOptions): Promise<{
  port: number;
  close: () => Promise<void>;
}> {
  const port = options.port ?? DEFAULT_PORT;
  const host = options.host ?? DEFAULT_HOST;
  const bridgeToken = process.env.BRIDGE_TOKEN?.trim() || '';
  const routeHandler = createRouteHandler(options.adapter, options.adapterMode ?? 'unknown');

  if (bridgeToken) {
    console.log('[local-api] BRIDGE_TOKEN 已启用，非 /health 请求需携带 X-Bridge-Token 头');
  }

  const server = http.createServer(async (req, res) => {
    const corsOk = setCorsHeaders(req, res);
    if (!corsOk) {
      sendJson(res, { success: false, error: { code: 'CORS_DENIED', message: 'Origin not allowed' } }, 403);
      return;
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      const url = new URL(req.url ?? '/', `http://${host}:${port}`);

      if (bridgeToken && url.pathname !== '/health') {
        const reqToken = req.headers['x-bridge-token'];
        if (reqToken !== bridgeToken) {
          sendJson(res, { success: false, error: { code: 'AUTH_FAILED', message: 'Invalid or missing X-Bridge-Token' } }, 401);
          return;
        }
      }

      const method = (req.method ?? 'GET').toUpperCase();
      const needsBody = method === 'POST' || method === 'PUT' || method === 'PATCH';
      const body = needsBody ? await parseBody(req) : {};

      const result = await routeHandler(method, url.pathname, url.searchParams, body);
      sendJson(res, result.data, result.status);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      sendJson(res, { success: false, error: { code: 'INTERNAL_ERROR', message } }, 500);
    }
  });

  return new Promise((resolve, reject) => {
    server.on('error', (err) => {
      console.error(`[local-api] Server error: ${err.message}`);
      reject(err);
    });
    server.listen(port, host, () => {
      console.log(`[local-api] HTTP server LISTENING on http://${host}:${port}`);
      console.log(`[local-api] Health check: http://${host}:${port}/health`);
      resolve({
        port,
        close: () => new Promise<void>((res) => server.close(() => res())),
      });
    });
  });
}
