/**
 * 将仓库 public/ 下的 PNG 图标转为 WebP（部署前执行一次即可）。
 * 用法：cd server && npm run assets:public-webp
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '../../public');

const tasks = [
  ['favicon.png', 'favicon.webp', { quality: 92 }],
  ['pwa-192x192.png', 'pwa-192x192.webp', { quality: 90 }],
  ['pwa-512x512.png', 'pwa-512x512.webp', { quality: 90 }],
];

async function main() {
  if (!fs.existsSync(publicDir)) {
    console.error('public dir not found:', publicDir);
    process.exit(1);
  }
  for (const [src, dest, opts] of tasks) {
    const inPath = path.join(publicDir, src);
    const outPath = path.join(publicDir, dest);
    if (!fs.existsSync(inPath)) {
      console.warn('[skip] missing', src);
      continue;
    }
    await sharp(inPath).webp(opts).toFile(outPath);
    console.log('[ok]', dest);
  }
  const svgPath = path.join(publicDir, 'placeholder.svg');
  if (fs.existsSync(svgPath)) {
    await sharp(svgPath, { density: 144 })
      .resize(800, 600, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toFile(path.join(publicDir, 'placeholder.webp'));
    console.log('[ok] placeholder.webp (from svg)');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
