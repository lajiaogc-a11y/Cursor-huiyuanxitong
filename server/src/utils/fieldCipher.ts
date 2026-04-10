/**
 * AES-256-GCM 字段级加密/解密
 *
 * 用于 initial_password 等需要可逆存储但不应明文落库的字段。
 * 密钥来源：FIELD_CIPHER_KEY 环境变量（64 位 hex = 32 字节）。
 * 开发环境无此变量时使用硬编码占位密钥（仅限非生产）。
 *
 * 存储格式：`enc:iv_hex:ciphertext_hex:tag_hex`（前缀 "enc:" 用于判断是否已加密）
 */
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

const ALGO = 'aes-256-gcm' as const;
const IV_LEN = 12;
const TAG_LEN = 16;
const PREFIX = 'enc:';

function resolveKey(): Buffer {
  const raw = (process.env.FIELD_CIPHER_KEY ?? '').trim();
  if (raw.length >= 64) {
    return Buffer.from(raw.slice(0, 64), 'hex');
  }
  const nodeEnv = (process.env.NODE_ENV ?? '').toLowerCase();
  if (nodeEnv === 'production') {
    throw new Error(
      '[fieldCipher] FATAL: NODE_ENV=production requires FIELD_CIPHER_KEY (64-char hex). ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }
  return createHash('sha256').update('__dev_field_cipher_placeholder__').digest();
}

let _key: Buffer | null = null;
function getKey(): Buffer {
  if (!_key) _key = resolveKey();
  return _key;
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}

export function encryptField(plaintext: string): string {
  if (!plaintext) return plaintext;
  const key = getKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv, { authTagLength: TAG_LEN });
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('hex')}:${enc.toString('hex')}:${tag.toString('hex')}`;
}

export function decryptField(stored: string): string {
  if (!stored || !isEncrypted(stored)) return stored;
  const body = stored.slice(PREFIX.length);
  const parts = body.split(':');
  if (parts.length !== 3) return '';
  const [ivHex, encHex, tagHex] = parts;
  try {
    const key = getKey();
    const decipher = createDecipheriv(ALGO, key, Buffer.from(ivHex, 'hex'), { authTagLength: TAG_LEN });
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const dec = Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]);
    return dec.toString('utf8');
  } catch {
    return '';
  }
}
