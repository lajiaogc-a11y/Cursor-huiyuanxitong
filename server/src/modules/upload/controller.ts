/**
 * Upload Controller — HTTP 参数收集 / 鉴权 / 错误映射
 */
import type { Request, Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import { authMiddleware } from '../../middlewares/auth.js';
import { config } from '../../config/index.js';
import {
  getImageRowService,
  getPresignUrlService,
  uploadImageService,
  readImagePayloadService,
  isPrivateVisibility,
} from './service.js';

async function ensurePrivateAccess(req: Request, res: Response, row: Awaited<ReturnType<typeof getImageRowService>> & object): Promise<boolean> {
  const authReq = req as AuthenticatedRequest;
  let settled = false;
  const authDone = await new Promise<boolean>((resolve) => {
    const once = (v: boolean) => {
      if (!settled) { settled = true; resolve(v); }
    };
    res.once('finish', () => once(false));
    authMiddleware(authReq, res, () => once(true)).catch(() => once(false));
  });
  if (!authDone || res.headersSent) return false;

  const user = authReq.user;
  if (!user?.id) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing token' } });
    return false;
  }
  const allowed = user.is_platform_super_admin || (!row.tenant_id && row.created_by === user.id);
  if (!allowed) {
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this image' } });
    return false;
  }
  console.info(JSON.stringify({
    audit: 'upload_image_read_private',
    userId: user.id,
    userType: user.type ?? 'employee',
    tenantId: user.tenant_id ?? null,
    imageTenantId: row.tenant_id,
    ts: new Date().toISOString(),
  }));
  return true;
}

export async function getPresignController(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  if (!id || id.length > 40) { res.status(400).json({ error: 'BAD_REQUEST' }); return; }

  const row = await getImageRowService(id);
  if (!row) { res.status(404).json({ error: 'NOT_FOUND' }); return; }

  if (!isPrivateVisibility(row)) {
    res.json({ success: true, url: `/api/upload/image/${id}`, expiresIn: null, mode: 'public' });
    return;
  }

  const user = (req as AuthenticatedRequest).user;
  if (!user?.id) { res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing token' } }); return; }
  const allowed = user.is_platform_super_admin || (!row.tenant_id && row.created_by === user.id);
  if (!allowed) { res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access' } }); return; }

  try {
    const url = await getPresignUrlService(row);
    if (url) {
      res.json({ success: true, url, expiresIn: config.s3.presignExpiresSec, mode: 'presigned' });
    } else {
      res.json({ success: true, url: `/api/upload/image/${id}`, expiresIn: null, mode: 'proxied', hint: 'Use Authorization: Bearer when fetching this URL.' });
    }
  } catch (e) {
    console.warn('[upload/presign]', e);
    res.status(502).json({ error: 'PRESIGN_FAILED' });
  }
}

export async function uploadImageController(req: Request, res: Response): Promise<void> {
  const user = (req as AuthenticatedRequest).user;
  if (!user?.id) { res.status(401).json({ error: 'UNAUTHORIZED' }); return; }

  const { data, file_name, tenant_id } = req.body || {};
  if (!data || typeof data !== 'string') {
    res.status(400).json({ error: 'MISSING_DATA', message: 'base64 image data required' });
    return;
  }

  const isAdmin = user.role === 'admin' || !!user.is_super_admin;
  const tid = isAdmin && tenant_id ? String(tenant_id) : user.tenant_id ?? null;

  try {
    const result = await uploadImageService({ base64Data: data, fileName: file_name, tenantId: tid, createdBy: user.id, isAdmin });
    res.json({ success: true, id: result.id, url: `/api/upload/image/${result.id}`, visibility: result.visibility, storage: result.storage, mime: 'image/webp' });
  } catch (e) {
    const code = (e as Error & { code?: string }).code;
    if (code === 'FILE_TOO_LARGE') { res.status(400).json({ error: 'FILE_TOO_LARGE', message: (e as Error).message }); return; }
    if (code === 'MISSING_DATA') { res.status(400).json({ error: 'MISSING_DATA', message: (e as Error).message }); return; }
    console.warn('[upload/image] failed', e);
    res.status(400).json({ error: 'INVALID_IMAGE', message: 'Could not decode or convert to WebP' });
  }
}

export async function getImageController(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  if (!id || id.length > 40) { res.status(400).end(); return; }

  const row = await getImageRowService(id);
  if (!row) { res.status(404).json({ error: 'NOT_FOUND' }); return; }

  const tenantScoped = row.tenant_id != null && String(row.tenant_id).trim() !== '';
  const visibilityPublic = !isPrivateVisibility(row);

  if (!visibilityPublic) {
    if (!(await ensurePrivateAccess(req, res, row))) return;
  } else if (config.upload.imageAuth === 'required' && !tenantScoped) {
    if (!(await ensurePrivateAccess(req, res, row))) return;
  }

  try {
    const { buffer, contentType } = await readImagePayloadService(row);
    res.set('Content-Type', contentType);
    res.set('Cache-Control', visibilityPublic ? 'public, max-age=31536000, immutable' : 'private, no-store');
    res.send(buffer);
  } catch (e) {
    const code = (e as Error & { statusCode?: number }).statusCode;
    if (code === 503) res.status(503).json({ error: 'STORAGE_MISCONFIG' });
    else if (code === 404) res.status(404).json({ error: 'NOT_FOUND' });
    else { console.warn('[upload/image GET]', e); res.status(502).json({ error: 'READ_FAILED' }); }
  }
}
