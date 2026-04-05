import { Router, type Request, type Response } from 'express';
import { authMiddleware, type AuthenticatedRequest } from '../../middlewares/auth.js';
import { config } from '../../config/index.js';
import {
  type UploadedImageRow,
  selectUploadedImageById,
  insertUploadedImageS3Row,
  insertUploadedImageMysqlRow,
} from './repository.js';
import { ensureWebpForReadResponse, transcodeToWebp } from '../../lib/uploadImageWebp.js';
import {
  buildS3ObjectKey,
  getPresignedGetUrl,
  getWebpImageBuffer,
  putWebpImage,
} from '../../services/s3ImageStorage.js';

const router = Router();

function toWebpFileName(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.trim().replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 120) : '';
  const base = s && !s.endsWith('.') ? s.replace(/\.(webp|jpg|jpeg|png|gif|bmp|svg)$/i, '') : 'image';
  return `${base || 'image'}.webp`;
}

async function loadImagePayload(row: UploadedImageRow): Promise<{ buffer: Buffer; contentType: string }> {
  const backend = (row.storage_backend || 'mysql').toLowerCase();
  if (backend === 's3' && row.s3_key) {
    if (!config.s3.enabled) {
      const err = new Error('S3 object referenced but S3 is not configured on this server');
      (err as Error & { statusCode?: number }).statusCode = 503;
      throw err;
    }
    return getWebpImageBuffer(row.s3_key);
  }
  if (row.data && row.data.length > 0) {
    return { buffer: row.data, contentType: row.content_type || 'image/webp' };
  }
  const err = new Error('Image payload empty');
  (err as Error & { statusCode?: number }).statusCode = 404;
  throw err;
}

function isPrivateVisibility(row: UploadedImageRow): boolean {
  return (row.visibility || 'public').toLowerCase() === 'private';
}

async function ensurePrivateAccess(req: Request, res: Response, row: UploadedImageRow): Promise<boolean> {
  const authReq = req as AuthenticatedRequest;
  let settled = false;
  const authDone = await new Promise<boolean>((resolve) => {
    const once = (v: boolean) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
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

  const allowed =
    user.is_platform_super_admin ||
    (!row.tenant_id && row.created_by === user.id);

  if (!allowed) {
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this image' } });
    return false;
  }

  console.info(
    JSON.stringify({
      audit: 'upload_image_read_private',
      userId: user.id,
      userType: user.type ?? 'employee',
      tenantId: user.tenant_id ?? null,
      imageTenantId: row.tenant_id,
      ts: new Date().toISOString(),
    }),
  );
  return true;
}

/**
 * 短期签名 URL（仅 S3 私有对象有意义）。员工端拿到 URL 后可嵌入 &lt;img&gt;（在过期前）。
 * 公开图仍返回同源 API 路径，避免暴露固定 S3 直链。
 */
router.get('/image/:id/presign', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!id || id.length > 40) {
    res.status(400).json({ error: 'BAD_REQUEST' });
    return;
  }

  const row = await selectUploadedImageById(id);
  if (!row) {
    res.status(404).json({ error: 'NOT_FOUND' });
    return;
  }

  if (!isPrivateVisibility(row)) {
    res.json({
      success: true,
      url: `/api/upload/image/${id}`,
      expiresIn: null,
      mode: 'public',
    });
    return;
  }

  const user = (req as AuthenticatedRequest).user;
  if (!user?.id) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing token' } });
    return;
  }
  const allowed =
    user.is_platform_super_admin || (!row.tenant_id && row.created_by === user.id);
  if (!allowed) {
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access' } });
    return;
  }

  const backend = (row.storage_backend || 'mysql').toLowerCase();
  if (backend === 's3' && row.s3_key && config.s3.enabled) {
    try {
      const url = await getPresignedGetUrl(row.s3_key, config.s3.presignExpiresSec);
      res.json({
        success: true,
        url,
        expiresIn: config.s3.presignExpiresSec,
        mode: 'presigned',
      });
    } catch (e) {
      console.warn('[upload/presign]', e);
      res.status(502).json({ error: 'PRESIGN_FAILED' });
    }
    return;
  }

  res.json({
    success: true,
    url: `/api/upload/image/${id}`,
    expiresIn: null,
    mode: 'proxied',
    hint: 'Use Authorization: Bearer when fetching this URL (e.g. fetch + blob URL).',
  });
});

router.post('/image', authMiddleware, async (req: Request, res: Response) => {
  const user = (req as AuthenticatedRequest).user;
  if (!user?.id) {
    res.status(401).json({ error: 'UNAUTHORIZED' });
    return;
  }

  const { data, file_name, tenant_id } = req.body || {};
  if (!data || typeof data !== 'string') {
    res.status(400).json({ error: 'MISSING_DATA', message: 'base64 image data required' });
    return;
  }

  const base64 = data.replace(/^data:[^;]+;base64,/, '');
  const buf = Buffer.from(base64, 'base64');
  if (!buf.length) {
    res.status(400).json({ error: 'MISSING_DATA', message: 'empty image buffer' });
    return;
  }
  const maxIn = config.upload.maxInputBytes;
  if (buf.length > maxIn) {
    res.status(400).json({ error: 'FILE_TOO_LARGE', message: `Decoded image exceeds ${maxIn} bytes` });
    return;
  }

  const isAdmin = user.role === 'admin' || user.is_super_admin;
  const tid = isAdmin && tenant_id ? String(tenant_id) : user.tenant_id ?? null;
  /** 无 tenant_id 的员工素材一律私有；租户级门户/商城图为公开（经 API 匿名可读，桶仍私有） */
  const visibility: 'public' | 'private' = tid ? 'public' : 'private';

  let webpBuf: Buffer;
  try {
    webpBuf = await transcodeToWebp(buf);
  } catch (e) {
    const code = (e as Error & { code?: string }).code;
    if (code === 'FILE_TOO_LARGE') {
      res.status(400).json({ error: 'FILE_TOO_LARGE', message: (e as Error).message });
      return;
    }
    console.warn('[upload/image] sharp convert failed', e);
    res.status(400).json({ error: 'INVALID_IMAGE', message: 'Could not decode or convert to WebP' });
    return;
  }

  const { randomUUID } = await import('crypto');
  const id = randomUUID();
  const outName = toWebpFileName(file_name);

  if (config.s3.enabled) {
    const s3Key = buildS3ObjectKey(id, visibility);
    try {
      await putWebpImage({ key: s3Key, body: webpBuf });
    } catch (e) {
      console.error('[upload/image] S3 put failed', e);
      res.status(502).json({ error: 'S3_UPLOAD_FAILED', message: 'Could not store image in S3' });
      return;
    }
    await insertUploadedImageS3Row({
      id,
      tenantId: tid,
      fileName: outName,
      sizeBytes: webpBuf.length,
      createdBy: user.id,
      s3Key,
      visibility,
    });
  } else {
    await insertUploadedImageMysqlRow({
      id,
      tenantId: tid,
      webpBuf,
      fileName: outName,
      sizeBytes: webpBuf.length,
      createdBy: user.id,
      visibility,
    });
  }

  const url = `/api/upload/image/${id}`;
  res.json({ success: true, id, url, visibility, storage: config.s3.enabled ? 's3' : 'mysql' });
});

router.get('/image/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!id || id.length > 40) {
    res.status(400).end();
    return;
  }

  const row = await selectUploadedImageById(id);
  if (!row) {
    res.status(404).json({ error: 'NOT_FOUND' });
    return;
  }

  const tenantScoped = row.tenant_id != null && String(row.tenant_id).trim() !== '';
  const visibilityPublic = !isPrivateVisibility(row);

  /**
   * 私有图：必须鉴权（与 UPLOAD_IMAGE_AUTH 无关）。
   * 公开图：UPLOAD_IMAGE_AUTH=required 时，沿用「仅租户级可匿名」的兼容策略，避免会员端坏图。
   */
  if (!visibilityPublic) {
    if (!(await ensurePrivateAccess(req, res, row))) return;
    try {
      const loaded = await loadImagePayload(row);
      const { buffer, contentType } = await ensureWebpForReadResponse(loaded.buffer, loaded.contentType);
      res.set('Content-Type', contentType);
      res.set('Cache-Control', 'private, no-store');
      res.send(buffer);
    } catch (e) {
      const code = (e as Error & { statusCode?: number }).statusCode;
      if (code === 503) res.status(503).json({ error: 'STORAGE_MISCONFIG' });
      else if (code === 404) res.status(404).json({ error: 'NOT_FOUND' });
      else {
        console.warn('[upload/image GET private]', e);
        res.status(502).json({ error: 'READ_FAILED' });
      }
    }
    return;
  }

  if (config.upload.imageAuth === 'required' && !tenantScoped) {
    if (!(await ensurePrivateAccess(req, res, row))) return;
  }

  try {
    const loaded = await loadImagePayload(row);
    const { buffer, contentType } = await ensureWebpForReadResponse(loaded.buffer, loaded.contentType);
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(buffer);
  } catch (e) {
    const code = (e as Error & { statusCode?: number }).statusCode;
    if (code === 503) res.status(503).json({ error: 'STORAGE_MISCONFIG' });
    else if (code === 404) res.status(404).json({ error: 'NOT_FOUND' });
    else {
      console.warn('[upload/image GET public]', e);
      res.status(502).json({ error: 'READ_FAILED' });
    }
  }
});

export default router;
