import jwt from 'jsonwebtoken';
import type { Request, Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import { config } from '../../config/index.js';
import {
  getWhitelistConfig,
  updateWhitelistConfig,
  listDevicesAdmin,
  deleteDevice,
  adminAddDevice,
  bindCurrentDevice,
  listDevicesSelf,
} from './service.js';
import { normalizeStaffDeviceId } from './deviceId.js';
import { DEFAULT_ADMIN_DEVICE_WHITELIST } from './settings.js';

export async function getDeviceWhitelistConfigController(_req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const cfg = await getWhitelistConfig();
    res.json({ success: true, data: cfg });
  } catch (e) {
    console.error('[DeviceWhitelist] getDeviceWhitelistConfigController:', e);
    res.json({ success: true, data: { ...DEFAULT_ADMIN_DEVICE_WHITELIST }, degraded: true });
  }
}

export async function putDeviceWhitelistConfigController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const body = req.body as { enabled?: boolean; max_devices_per_employee?: number };
    const cfg = await updateWhitelistConfig({
      enabled: body.enabled,
      max_devices_per_employee: body.max_devices_per_employee,
    });
    res.json({ success: true, data: cfg });
  } catch (e) {
    console.error('[DeviceWhitelist] putDeviceWhitelistConfigController:', e);
    res.status(503).json({
      success: false,
      error: {
        code: 'DEVICE_WHITELIST_UNAVAILABLE',
        message: 'Device whitelist settings cannot be saved right now. Ensure database migrations have run (employee_devices / data_settings), then try again.',
      },
    });
  }
}

export async function listDevicesAdminController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '100'), 10) || 100));
  const offset = Math.max(0, parseInt(String(req.query.offset || '0'), 10) || 0);
  try {
    const rows = await listDevicesAdmin(limit, offset);
    res.json({ success: true, data: rows });
  } catch (e) {
    console.error('[DeviceWhitelist] listDevicesAdminController:', e);
    res.json({ success: true, data: [], degraded: true });
  }
}

export async function postDeviceAdminController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const body = req.body as { username?: string; device_id?: string; device_name?: string };
  const username = String(body.username || '').trim();
  const device_id = body.device_id;
  if (!username || !device_id) {
    res.status(400).json({ success: false, error: 'username and device_id are required' });
    return;
  }
  const r = await adminAddDevice({
    username,
    deviceId: String(device_id),
    deviceName: body.device_name,
  });
  if (!r.ok) {
    res.status(400).json({ success: false, error: r.error });
    return;
  }
  res.json({ success: true, data: { id: r.id } });
}

export async function deleteDeviceAdminController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const id = String(req.params.id || '').trim();
  if (!id) {
    res.status(400).json({ success: false, error: 'id is required' });
    return;
  }
  const ok = await deleteDevice(id);
  if (!ok) {
    res.status(404).json({ success: false, error: 'Record not found' });
    return;
  }
  res.json({ success: true });
}

export async function getDeviceWhitelistPublicController(_req: Request, res: Response): Promise<void> {
  try {
    const cfg = await getWhitelistConfig();
    res.json({
      success: true,
      data: {
        enabled: cfg.enabled,
        max_devices_per_employee: cfg.max_devices_per_employee,
      },
    });
  } catch (e) {
    console.warn('[DeviceWhitelist] public status DB error, using defaults:', (e as Error).message);
    res.json({
      success: true,
      data: {
        enabled: DEFAULT_ADMIN_DEVICE_WHITELIST.enabled,
        max_devices_per_employee: DEFAULT_ADMIN_DEVICE_WHITELIST.max_devices_per_employee,
        degraded: true,
      },
    });
  }
}

export async function postBindDeviceController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const u = req.user;
  if (!u?.id || u.type !== 'employee') {
    res.status(401).json({ success: false, error: 'Not signed in' });
    return;
  }
  const body = req.body as { device_id?: string; device_name?: string };
  const r = await bindCurrentDevice({
    employeeId: u.id,
    deviceId: String(body.device_id || ''),
    deviceName: body.device_name,
  });
  if (!r.ok) {
    res.status(400).json({ success: false, error: r.error });
    return;
  }
  const cfg = await getWhitelistConfig();
  let token: string | null = null;
  if (cfg.enabled && u.is_platform_super_admin !== true) {
    const did = normalizeStaffDeviceId(String(body.device_id || ''));
    if (did) {
      token = jwt.sign(
        {
          sub: u.id,
          email: u.email ?? `${u.username ?? 'user'}@system.local`,
          tenant_id: u.tenant_id,
          role: u.role,
          username: u.username,
          real_name: u.real_name,
          status: u.status,
          is_super_admin: u.is_super_admin,
          is_platform_super_admin: u.is_platform_super_admin,
          device_id: did,
        },
        config.jwt.secret,
        { expiresIn: '7d' },
      );
    }
  }
  res.json({ success: true, data: { id: r.id, token } });
}

export async function listMyDevicesController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const u = req.user;
  if (!u?.id || u.type !== 'employee') {
    res.status(401).json({ success: false, error: 'Not signed in' });
    return;
  }
  const rows = await listDevicesSelf(u.id);
  res.json({ success: true, data: rows });
}
