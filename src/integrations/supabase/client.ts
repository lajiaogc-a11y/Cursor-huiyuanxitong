/**
 * Supabase Client 代理层 — MySQL 迁移兼容
 *
 * 原项目 67+ 个文件通过 `supabase.from()` / `supabase.rpc()` / `supabase.channel()` 直接访问 Supabase。
 * 迁移到 MySQL 后，这里把 supabase 对象替换为一个代理，将所有调用转发到后端 API（/api/data/*）。
 * 这样前端代码几乎不用改，只需要后端 /api/data 路由支持对应的表和 RPC。
 */

import { resolveBearerTokenForPath } from '@/lib/apiClient';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

function getAuthHeadersForPath(path: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = resolveBearerTokenForPath(path);
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

async function apiFetch(path: string, options?: RequestInit) {
  const url = `${API_BASE}${path}`.replace(/([^:])\/\/+/g, '$1/');
  const res = await fetch(url, {
    ...options,
    headers: { ...getAuthHeadersForPath(path), ...options?.headers },
  });
  return res;
}

// ============ Query Builder（模拟 supabase.from('table').select/insert/update/delete 链式调用）============

type FilterOp = { col: string; op: string; val: any };

class SupabaseQueryBuilder {
  private _table: string;
  private _method: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private _selectCols = '*';
  private _filters: FilterOp[] = [];
  private _orFilters: string[] = [];
  private _orderBy: { col: string; asc: boolean }[] = [];
  private _limitVal?: number;
  private _offsetVal?: number;
  private _single = false;
  private _maybeSingle = false;
  private _count: 'exact' | null = null;
  private _body: any = null;
  private _onConflict?: string;
  private _textSearch: { col: string; query: string } | null = null;
  private _containsFilters: { col: string; val: any }[] = [];
  private _inFilters: { col: string; vals: any[] }[] = [];
  private _isFilters: { col: string; val: any }[] = [];
  private _neqFilters: { col: string; val: any }[] = [];
  private _gteFilters: { col: string; val: any }[] = [];
  private _lteFilters: { col: string; val: any }[] = [];
  private _gtFilters: { col: string; val: any }[] = [];
  private _ltFilters: { col: string; val: any }[] = [];
  private _likeFilters: { col: string; val: string }[] = [];
  private _ilikeFilters: { col: string; val: string }[] = [];
  private _notFilters: { col: string; op: string; val: any }[] = [];

  constructor(table: string) {
    this._table = table;
  }

  select(cols?: string, opts?: { count?: 'exact'; head?: boolean }) {
    // .select() after .insert()/.upsert()/.update() means "return inserted/updated row"
    // — do NOT override _method in that case
    if (this._method === 'select' || (this._method !== 'insert' && this._method !== 'upsert' && this._method !== 'update')) {
      this._method = 'select';
    }
    this._selectCols = cols || '*';
    if (opts?.count) this._count = opts.count;
    return this;
  }

  insert(data: any, opts?: { onConflict?: string }) {
    this._method = 'insert';
    this._body = data;
    if (opts?.onConflict) this._onConflict = opts.onConflict;
    return this;
  }

  upsert(data: any, opts?: { onConflict?: string }) {
    this._method = 'upsert';
    this._body = data;
    if (opts?.onConflict) this._onConflict = opts.onConflict;
    return this;
  }

  update(data: any) {
    this._method = 'update';
    this._body = data;
    return this;
  }

  delete() {
    this._method = 'delete';
    return this;
  }

  eq(col: string, val: any) { this._filters.push({ col, op: 'eq', val }); return this; }
  neq(col: string, val: any) { this._neqFilters.push({ col, val }); return this; }
  gt(col: string, val: any) { this._gtFilters.push({ col, val }); return this; }
  gte(col: string, val: any) { this._gteFilters.push({ col, val }); return this; }
  lt(col: string, val: any) { this._ltFilters.push({ col, val }); return this; }
  lte(col: string, val: any) { this._lteFilters.push({ col, val }); return this; }
  like(col: string, val: string) { this._likeFilters.push({ col, val }); return this; }
  ilike(col: string, val: string) { this._ilikeFilters.push({ col, val }); return this; }
  in(col: string, vals: any[]) { this._inFilters.push({ col, vals }); return this; }
  is(col: string, val: any) { this._isFilters.push({ col, val }); return this; }
  not(col: string, op: string, val: any) { this._notFilters.push({ col, op, val }); return this; }
  contains(col: string, val: any) { this._containsFilters.push({ col, val }); return this; }
  textSearch(col: string, query: string) { this._textSearch = { col, query }; return this; }
  or(filter: string) { this._orFilters.push(filter); return this; }

  order(col: string, opts?: { ascending?: boolean }) {
    this._orderBy.push({ col, asc: opts?.ascending ?? true });
    return this;
  }

  limit(n: number) { this._limitVal = n; return this; }
  range(from: number, to: number) { this._offsetVal = from; this._limitVal = to - from + 1; return this; }
  single() { this._single = true; return this; }
  maybeSingle() { this._maybeSingle = true; return this; }

  // 构建查询参数
  private buildParams(): URLSearchParams {
    const p = new URLSearchParams();
    if (this._selectCols !== '*') p.set('select', this._selectCols);
    for (const f of this._filters) p.append(`${f.col}`, `eq.${f.val}`);
    for (const f of this._neqFilters) p.append(`${f.col}`, `neq.${f.val}`);
    for (const f of this._gtFilters) p.append(`${f.col}`, `gt.${f.val}`);
    for (const f of this._gteFilters) p.append(`${f.col}`, `gte.${f.val}`);
    for (const f of this._ltFilters) p.append(`${f.col}`, `lt.${f.val}`);
    for (const f of this._lteFilters) p.append(`${f.col}`, `lte.${f.val}`);
    for (const f of this._likeFilters) p.append(`${f.col}`, `like.${f.val}`);
    for (const f of this._ilikeFilters) p.append(`${f.col}`, `ilike.${f.val}`);
    for (const f of this._inFilters) p.append(`${f.col}`, `in.(${f.vals.join(',')})`);
    for (const f of this._isFilters) p.append(`${f.col}`, `is.${f.val}`);
    for (const f of this._notFilters) p.append(`${f.col}`, `not.${f.op}.${f.val}`);
    for (const f of this._containsFilters) p.append(`${f.col}`, `cs.${JSON.stringify(f.val)}`);
    if (this._textSearch) p.set('textsearch', `${this._textSearch.col}.${this._textSearch.query}`);
    for (const o of this._orFilters) p.append('or', o);
    if (this._orderBy.length) p.set('order', this._orderBy.map(o => `${o.col}.${o.asc ? 'asc' : 'desc'}`).join(','));
    if (this._limitVal != null) p.set('limit', String(this._limitVal));
    if (this._offsetVal != null) p.set('offset', String(this._offsetVal));
    if (this._count) p.set('count', this._count);
    if (this._single || this._maybeSingle) p.set('single', 'true');
    return p;
  }

  // then() 使其可 await
  async then(resolve: (val: any) => void, reject?: (err: any) => void) {
    try {
      const result = await this._execute();
      resolve(result);
    } catch (e) {
      if (reject) reject(e);
      else resolve({ data: null, error: { message: (e as Error).message }, count: null });
    }
  }

  private async _execute(): Promise<{ data: any; error: any; count: number | null }> {
    const params = this.buildParams();
    const qs = params.toString();
    const base = `/api/data/table/${this._table}`;

    try {
      let res: Response;

      switch (this._method) {
        case 'select': {
          res = await apiFetch(`${base}?${qs}`);
          break;
        }
        case 'insert':
        case 'upsert': {
          res = await apiFetch(base, {
            method: 'POST',
            body: JSON.stringify({
              data: this._body,
              upsert: this._method === 'upsert',
              onConflict: this._onConflict,
            }),
          });
          break;
        }
        case 'update': {
          res = await apiFetch(`${base}?${qs}`, {
            method: 'PATCH',
            body: JSON.stringify({ data: this._body }),
          });
          break;
        }
        case 'delete': {
          res = await apiFetch(`${base}?${qs}`, { method: 'DELETE' });
          break;
        }
        default:
          return { data: null, error: { message: `Unknown method: ${this._method}` }, count: null };
      }

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        return { data: null, error: { message: errBody.message || `HTTP ${res.status}` }, count: null };
      }

      const json = await res.json().catch(() => null);
      // 后端返回 { success, data, count } 或直接返回数组
      let data = json?.data ?? json;
      const count = json?.count ?? null;

      if (this._single) {
        data = Array.isArray(data) ? data[0] ?? null : data;
        if (data === null || data === undefined) {
          return { data: null, error: { message: 'Row not found', code: 'PGRST116' }, count: null };
        }
      }
      if (this._maybeSingle) {
        data = Array.isArray(data) ? data[0] ?? null : data;
      }

      return { data, error: null, count };
    } catch (e) {
      return { data: null, error: { message: (e as Error).message }, count: null };
    }
  }
}

// ============ RPC 代理 ============

async function rpcProxy(fnName: string, params?: Record<string, any>) {
  try {
    const res = await apiFetch(`/api/data/rpc/${fnName}`, {
      method: 'POST',
      body: JSON.stringify(params ?? {}),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return { data: null, error: { message: errBody.message || `HTTP ${res.status}` } };
    }
    const json = await res.json().catch(() => null);
    return { data: json?.data ?? json, error: null };
  } catch (e) {
    return { data: null, error: { message: (e as Error).message } };
  }
}

// ============ Channel 代理（stub，MySQL 无实时推送）============

function channelProxy(_name: string) {
  const noop = () => channelObj;
  const channelObj = {
    on: noop,
    subscribe: (_cb?: any) => channelObj,
    unsubscribe: () => {},
  };
  return channelObj;
}

// ============ Auth 代理（stub，认证已完全走后端 JWT）============

const authProxy = {
  getSession: async () => ({ data: { session: null }, error: null }),
  getUser: async () => ({ data: { user: null }, error: null }),
  onAuthStateChange: (_cb: any) => ({ data: { subscription: { unsubscribe: () => {} } } }),
  setSession: async () => ({ data: { session: null }, error: null }),
  signOut: async () => ({ error: null }),
};

// ============ Storage 代理（stub）============

const storageProxy = {
  from: (_bucket: string) => ({
    upload: async () => ({ data: null, error: { message: 'Storage not available (MySQL mode)' } }),
    getPublicUrl: (path: string) => ({ data: { publicUrl: path } }),
    download: async () => ({ data: null, error: { message: 'Storage not available (MySQL mode)' } }),
    remove: async () => ({ data: null, error: null }),
    list: async () => ({ data: [], error: null }),
  }),
};

// ============ Functions 代理（stub）============

const functionsProxy = {
  invoke: async (fnName: string, opts?: any) => {
    console.warn(`[Supabase Proxy] functions.invoke('${fnName}') — not available in MySQL mode`);
    return { data: null, error: { message: 'Edge functions not available (MySQL mode)' } };
  },
};

// ============ 导出 ============

export const supabase = {
  from: (table: string) => new SupabaseQueryBuilder(table),
  rpc: rpcProxy,
  channel: channelProxy,
  removeChannel: () => {},
  auth: authProxy,
  storage: storageProxy,
  functions: functionsProxy,
} as any;

export const isSupabaseConfigured = true;
