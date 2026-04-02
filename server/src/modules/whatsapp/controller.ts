/**
 * WhatsApp Controller - 预留
 */
import type { Response } from 'express';
import { listChatsService } from './service.js';

export async function listChatsController(_req: unknown, res: Response): Promise<void> {
  const data = await listChatsService();
  res.json({ success: true, data });
}
