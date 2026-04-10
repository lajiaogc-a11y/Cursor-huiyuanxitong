/**
 * 本地 HTTP API 服务（异步路由版）
 *
 * 在 127.0.0.1:3100 启动轻量 HTTP 服务器，供前端 localWhatsappBridge.ts 调用。
 * 使用 Node.js 内置 http 模块，不依赖 express / fastify。
 */

import * as http from 'node:http';
import { URL } from 'node:url';
import type { IWhatsAppAdapter } from '../session-manager/adapterInterface.js';
import { createRouteHandler } from './routes.js';

export const LOCAL_API_VERSION = '0.2.0';
export const DEFAULT_PORT = 3100;
export const DEFAULT_HOST = '127.0.0.1';

// ── CORS 处理 ──

function setCorsHeaders(req: http.IncomingMessage, res: http.ServerResponse) {
  const origin = req.headers.origin ?? '';
  if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Bridge-Token');
  res.setHeader('Access-Control-Max-Age', '86400');
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
  port?: number;
  host?: string;
}

export async function startLocalApi(options: StartOptions): Promise<{
  port: number;
  close: () => Promise<void>;
}> {
  const port = options.port ?? DEFAULT_PORT;
  const host = options.host ?? DEFAULT_HOST;
  const routeHandler = createRouteHandler(options.adapter);

  const server = http.createServer(async (req, res) => {
    setCorsHeaders(req, res);

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      const url = new URL(req.url ?? '/', `http://${host}:${port}`);
      const method = (req.method ?? 'GET').toUpperCase();
      const needsBody = method === 'POST' || method === 'PUT' || method === 'PATCH';
      const body = needsBody ? await parseBody(req) : {};

      // 路由处理器现在是异步的
      const result = await routeHandler(method, url.pathname, url.searchParams, body);
      sendJson(res, result.data, result.status);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      sendJson(res, { success: false, error: { code: 'INTERNAL_ERROR', message } }, 500);
    }
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, host, () => {
      resolve({
        port,
        close: () => new Promise<void>((res) => server.close(() => res())),
      });
    });
  });
}
