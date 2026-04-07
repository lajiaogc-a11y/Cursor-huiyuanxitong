/**
 * 浏览器端图片压缩：限制长边、**优先输出 WebP**（`canvas.toBlob('image/webp')`，不支持时回退 JPEG）。
 * 员工端 `POST /api/upload/image` 由服务端 **Sharp 强制转 WebP** 入库（S3/MySQL 仅存 WebP）；GET 默认再规范为 WebP 输出。
 */

export interface CompressImageOptions {
  /** 长边最大像素 */
  maxDimension: number;
  /** WebP/JPEG 质量 0–1 */
  quality?: number;
  /** 输出文件名（不含路径） */
  outputName?: string;
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to decode image"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, b64] = dataUrl.split(",");
  const mime = /data:([^;]+);/.exec(header)?.[1] || "image/png";
  const binary = atob(b64 || "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/**
 * 将用户选择的图片压成适合上传的 File（优先 image/webp，不支持则 JPEG）。
 */
export async function compressImageToUploadableFile(
  file: File,
  options: CompressImageOptions
): Promise<File> {
  const { maxDimension, quality = 0.82, outputName = "image" } = options;
  const img = await loadImageFromFile(file);
  let w = img.width;
  let h = img.height;
  if (w <= 0 || h <= 0) throw new Error("Invalid image dimensions");

  if (w > maxDimension || h > maxDimension) {
    const ratio = Math.min(maxDimension / w, maxDimension / h);
    w = Math.round(w * ratio);
    h = Math.round(h * ratio);
  }

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(img, 0, 0, w, h);

  const q = quality;
  const safeBase = outputName.replace(/[^a-zA-Z0-9-_]/g, "").slice(0, 40) || "upload";

  const webpBlob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), "image/webp", q);
  });
  if (webpBlob && webpBlob.size > 0) {
    return new File([webpBlob], `${safeBase}.webp`, { type: "image/webp" });
  }

  const dataUrlJpeg = canvas.toDataURL("image/jpeg", q);
  const blob = dataUrlToBlob(dataUrlJpeg);
  return new File([blob], `${safeBase}.jpg`, { type: "image/jpeg" });
}

/** 轮播 Banner / 会员登录页顶部大图：长边不超过 1600，兼顾清晰度与体积（登录轮播展示区为 2:1，见 MemberLogin） */
export const BANNER_MAX_DIMENSION = 1600;

/** 小图标 / Logo：长边不超过 512 */
export const LOGO_MAX_DIMENSION = 512;

/** 客服头像等：与会员端设置页一致偏小图 */
export const AVATAR_MAX_DIMENSION = 200;

/** 积分商城商品图：与轮播类似 */
export const MALL_IMAGE_MAX_DIMENSION = 1200;

/**
 * 压缩后转为 data URL（用于直接写入 JSON 的头像等）
 */
export async function compressImageToDataUrl(
  file: File,
  maxDimension: number,
  quality = 0.85
): Promise<string> {
  const out = await compressImageToUploadableFile(file, { maxDimension, quality });
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("read failed"));
    r.readAsDataURL(out);
  });
}
