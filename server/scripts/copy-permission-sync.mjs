import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const src = path.join(root, 'src/permissions/permissionSyncKeys.json');
const destDir = path.join(root, 'dist/permissions');
const dest = path.join(destDir, 'permissionSyncKeys.json');
fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
