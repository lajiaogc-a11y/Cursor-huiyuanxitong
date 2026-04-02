/**
 * 上传图统一转 WebP：POST 入库与 GET 输出共用 Sharp 参数（见 config.upload）。
 */
import sharp from 'sharp';
import { config } from '../config/index.js';

const SHARP_LIMIT_INPUT_PIXELS = 268_402_689;

export function isLikelyWebpBuffer(buf: Buffer): boolean {
  if (!buf || buf.length < 12) return false;
  return buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP';
}

/**
 * 将任意可解码栅格图转为 WebP（含 EXIF 旋转、超限缩放）。
 * @throws 带 `code: 'FILE_TOO_LARGE' | 'INVALID_IMAGE'`
 */
export async function transcodeToWebp(buf: Buffer): Promise<Buffer> {
  const u = config.upload;
  try {
    const meta = await sharp(buf, { failOnError: false, limitInputPixels: SHARP_LIMIT_INPUT_PIXELS }).metadata();
    let pipeline = sharp(buf, { failOnError: false, limitInputPixels: SHARP_LIMIT_INPUT_PIXELS }).rotate();
    if (meta.width && meta.height && (meta.width > u.maxPixelSide || meta.height > u.maxPixelSide)) {
      pipeline = pipeline.resize(u.maxPixelSide, u.maxPixelSide, {
        fit: 'inside',
        withoutEnlargement: true,
      });
    }
    let webpBuf = await pipeline.webp({ quality: u.webpQuality, effort: 4 }).toBuffer();
    if (webpBuf.length > u.maxOutputBytes) {
      webpBuf = await sharp(buf, { failOnError: false, limitInputPixels: SHARP_LIMIT_INPUT_PIXELS })
        .rotate()
        .resize(u.maxPixelSide, u.maxPixelSide, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: u.webpQualityFallback, effort: 5 })
        .toBuffer();
    }
    if (webpBuf.length > u.maxOutputBytes) {
      const err = new Error(`WebP output exceeds ${u.maxOutputBytes} bytes — use a smaller source image`);
      (err as Error & { code?: string }).code = 'FILE_TOO_LARGE';
      throw err;
    }
    return webpBuf;
  } catch (e) {
    if ((e as Error & { code?: string }).code === 'FILE_TOO_LARGE') throw e;
    const err = new Error((e as Error).message || 'Could not decode or convert to WebP');
    (err as Error & { code?: string }).code = 'INVALID_IMAGE';
    throw err;
  }
}

/**
 * GET 响应：在开启 normalizeToWebpOnRead 时，把历史非 WebP 字节流转为 WebP，保证会员端始终收到 image/webp。
 */
export async function ensureWebpForReadResponse(
  buffer: Buffer,
  declaredContentType: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  const u = config.upload;
  if (!u.normalizeToWebpOnRead) {
    return {
      buffer,
      contentType: (declaredContentType || '').trim() || 'application/octet-stream',
    };
  }
  const ct = (declaredContentType || '').toLowerCase();
  if (ct.includes('webp') && isLikelyWebpBuffer(buffer)) {
    return { buffer, contentType: 'image/webp' };
  }
  try {
    const out = await transcodeToWebp(buffer);
    return { buffer: out, contentType: 'image/webp' };
  } catch (e) {
    console.warn('[uploadImageWebp] on-read transcode failed, sending original bytes', e);
    return {
      buffer,
      contentType: (declaredContentType || '').trim() || 'application/octet-stream',
    };
  }
}
