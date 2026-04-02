/**
 * 租户隔离回归测试集 — resolveAccessScope + resolveEffectiveTenantId
 *
 * 验证所有角色/模式组合下的租户边界行为，确保：
 * 1. 普通员工只能访问本租户
 * 2. 会员只能访问本租户
 * 3. 平台超管可委托或查看全部
 * 4. 匿名请求被正确标记
 * 5. 跨租户访问被拒绝
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../config/index.js', () => ({
  config: { platformTenantId: 'platform-tenant-000' },
}));

const MOCK_PLATFORM_TENANT_ID = 'platform-tenant-000';

import {
  resolveAccessScope,
  resolveEffectiveTenantId,
  type AccessScope,
  type TenantResolutionMode,
} from '../accessScope.js';

// ─── helpers ────────────────────────────────────────────────────────────

function fakeReq(user?: Record<string, unknown>) {
  return { user } as any;
}

function makeScope(overrides: Partial<AccessScope>): AccessScope {
  return {
    tenantId: null,
    employeeId: null,
    memberId: null,
    principalType: 'anonymous',
    isPlatformSuperAdmin: false,
    isTenantSuperAdmin: false,
    ...overrides,
  };
}

// ═════════════════════════════════════════════════════════════════════════
// resolveAccessScope
// ═════════════════════════════════════════════════════════════════════════

describe('resolveAccessScope', () => {
  it('returns anonymous when no user', () => {
    const scope = resolveAccessScope(fakeReq());
    expect(scope.principalType).toBe('anonymous');
    expect(scope.tenantId).toBeNull();
    expect(scope.isPlatformSuperAdmin).toBe(false);
  });

  it('returns anonymous when user has no id', () => {
    const scope = resolveAccessScope(fakeReq({ tenant_id: 't1' }));
    expect(scope.principalType).toBe('anonymous');
  });

  it('returns member scope correctly', () => {
    const scope = resolveAccessScope(
      fakeReq({ id: 'm1', type: 'member', tenant_id: 'tenant-A' }),
    );
    expect(scope.principalType).toBe('member');
    expect(scope.tenantId).toBe('tenant-A');
    expect(scope.memberId).toBe('m1');
    expect(scope.employeeId).toBeNull();
    expect(scope.isPlatformSuperAdmin).toBe(false);
    expect(scope.isTenantSuperAdmin).toBe(false);
  });

  it('member without tenant_id gets null tenantId', () => {
    const scope = resolveAccessScope(fakeReq({ id: 'm2', type: 'member' }));
    expect(scope.tenantId).toBeNull();
    expect(scope.principalType).toBe('member');
  });

  it('returns employee scope correctly', () => {
    const scope = resolveAccessScope(
      fakeReq({
        id: 'e1',
        tenant_id: 'tenant-B',
        is_super_admin: true,
        is_platform_super_admin: false,
      }),
    );
    expect(scope.principalType).toBe('employee');
    expect(scope.tenantId).toBe('tenant-B');
    expect(scope.employeeId).toBe('e1');
    expect(scope.memberId).toBeNull();
    expect(scope.isTenantSuperAdmin).toBe(true);
    expect(scope.isPlatformSuperAdmin).toBe(false);
  });

  it('platform super admin scope', () => {
    const scope = resolveAccessScope(
      fakeReq({
        id: 'e-platform',
        tenant_id: 'platform-tid',
        is_platform_super_admin: true,
        is_super_admin: true,
      }),
    );
    expect(scope.isPlatformSuperAdmin).toBe(true);
    expect(scope.isTenantSuperAdmin).toBe(true);
    expect(scope.principalType).toBe('employee');
  });
});

// ═════════════════════════════════════════════════════════════════════════
// resolveEffectiveTenantId
// ═════════════════════════════════════════════════════════════════════════

describe('resolveEffectiveTenantId', () => {
  // ─── 普通员工（非平台超管）────────────────────────────────────
  describe('regular employee (non-platform admin)', () => {
    const scope = makeScope({
      tenantId: 'tenant-A',
      employeeId: 'e1',
      principalType: 'employee',
    });

    it.each<TenantResolutionMode>(['own_only', 'admin_delegate', 'admin_all'])(
      '[%s] returns own tenant when no requested id',
      (mode) => {
        const r = resolveEffectiveTenantId(scope, null, mode);
        expect(r).toEqual({ tenantId: 'tenant-A', delegated: false });
      },
    );

    it.each<TenantResolutionMode>(['own_only', 'admin_delegate', 'admin_all'])(
      '[%s] returns own tenant when requested same tenant',
      (mode) => {
        const r = resolveEffectiveTenantId(scope, 'tenant-A', mode);
        expect(r).toEqual({ tenantId: 'tenant-A', delegated: false });
      },
    );

    it.each<TenantResolutionMode>(['own_only', 'admin_delegate', 'admin_all'])(
      '[%s] FORBIDS cross-tenant access',
      (mode) => {
        const r = resolveEffectiveTenantId(scope, 'tenant-B', mode);
        expect(r).toHaveProperty('forbidden', true);
        expect((r as any).message).toBe('NO_PERMISSION');
      },
    );

    it('forbids when tenant_id is missing (scope.tenantId = null)', () => {
      const noTenantScope = makeScope({
        tenantId: null,
        employeeId: 'e2',
        principalType: 'employee',
      });
      const r = resolveEffectiveTenantId(noTenantScope, null, 'admin_delegate');
      expect(r).toHaveProperty('forbidden', true);
      expect((r as any).message).toBe('TENANT_REQUIRED');
    });
  });

  // ─── 会员 ───────────────────────────────────────────────────────
  describe('member', () => {
    const scope = makeScope({
      tenantId: 'tenant-C',
      memberId: 'mem1',
      principalType: 'member',
    });

    it('own_only: returns own tenant', () => {
      const r = resolveEffectiveTenantId(scope, null, 'own_only');
      expect(r).toEqual({ tenantId: 'tenant-C', delegated: false });
    });

    it('forbids cross-tenant for member', () => {
      const r = resolveEffectiveTenantId(scope, 'tenant-D', 'own_only');
      expect(r).toHaveProperty('forbidden', true);
    });
  });

  // ─── 平台超管 ──────────────────────────────────────────────────
  describe('platform super admin', () => {
    const scope = makeScope({
      tenantId: 'platform-tid',
      employeeId: 'e-plat',
      principalType: 'employee',
      isPlatformSuperAdmin: true,
    });

    describe('own_only mode', () => {
      it('returns own tenant when no requested id', () => {
        const r = resolveEffectiveTenantId(scope, null, 'own_only');
        expect(r).toEqual({ tenantId: 'platform-tid', delegated: false });
      });

      it('allows delegation even in own_only (platform privilege)', () => {
        const r = resolveEffectiveTenantId(scope, 'tenant-X', 'own_only');
        expect(r).toEqual({ tenantId: 'tenant-X', delegated: true });
      });
    });

    describe('admin_delegate mode', () => {
      it('delegates to requested tenant', () => {
        const r = resolveEffectiveTenantId(scope, 'tenant-Y', 'admin_delegate');
        expect(r).toEqual({ tenantId: 'tenant-Y', delegated: true });
      });

      it('falls back to own tenant when no requested id', () => {
        const r = resolveEffectiveTenantId(scope, null, 'admin_delegate');
        expect(r).toEqual({ tenantId: 'platform-tid', delegated: false });
      });

      it('falls back to config.platformTenantId when scope.tenantId is null', () => {
        const noTenantScope = makeScope({
          tenantId: null,
          employeeId: 'e-plat2',
          principalType: 'employee',
          isPlatformSuperAdmin: true,
        });
        const r = resolveEffectiveTenantId(noTenantScope, null, 'admin_delegate');
        expect(r).toEqual({ tenantId: MOCK_PLATFORM_TENANT_ID, delegated: false });
      });
    });

    describe('admin_all mode', () => {
      it('returns null (all tenants) when no requested id', () => {
        const r = resolveEffectiveTenantId(scope, null, 'admin_all');
        expect(r).toEqual({ tenantId: null, delegated: false });
      });

      it('returns specific tenant when requested', () => {
        const r = resolveEffectiveTenantId(scope, 'tenant-Z', 'admin_all');
        expect(r).toEqual({ tenantId: 'tenant-Z', delegated: true });
      });
    });
  });

  // ─── 匿名 ─────────────────────────────────────────────────────
  describe('anonymous', () => {
    const scope = makeScope({ principalType: 'anonymous' });

    it('forbids with TENANT_REQUIRED', () => {
      const r = resolveEffectiveTenantId(scope, null, 'admin_delegate');
      expect(r).toHaveProperty('forbidden', true);
      expect((r as any).message).toBe('TENANT_REQUIRED');
    });

    it('forbids even with requested tenant_id', () => {
      const r = resolveEffectiveTenantId(scope, 'tenant-X', 'admin_delegate');
      expect(r).toHaveProperty('forbidden', true);
    });
  });

  // ─── 边界情况 ──────────────────────────────────────────────────
  describe('edge cases', () => {
    it('empty string requestedTenantId treated as null', () => {
      const scope = makeScope({
        tenantId: 'tenant-A',
        employeeId: 'e1',
        principalType: 'employee',
      });
      const r = resolveEffectiveTenantId(scope, '  ', 'admin_delegate');
      expect(r).toEqual({ tenantId: 'tenant-A', delegated: false });
    });

    it('undefined requestedTenantId treated as null', () => {
      const scope = makeScope({
        tenantId: 'tenant-A',
        employeeId: 'e1',
        principalType: 'employee',
      });
      const r = resolveEffectiveTenantId(scope, undefined, 'admin_delegate');
      expect(r).toEqual({ tenantId: 'tenant-A', delegated: false });
    });

    it('requestedTenantId with whitespace is trimmed', () => {
      const scope = makeScope({
        tenantId: null,
        employeeId: 'e-plat',
        principalType: 'employee',
        isPlatformSuperAdmin: true,
      });
      const r = resolveEffectiveTenantId(scope, '  tenant-X  ', 'admin_delegate');
      expect(r).toEqual({ tenantId: 'tenant-X', delegated: true });
    });

    it('default mode is admin_delegate', () => {
      const scope = makeScope({
        tenantId: 'tenant-A',
        employeeId: 'e1',
        principalType: 'employee',
      });
      const r = resolveEffectiveTenantId(scope, null);
      expect(r).toEqual({ tenantId: 'tenant-A', delegated: false });
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════
// 综合回归场景：模拟 API 请求的完整链路
// ═════════════════════════════════════════════════════════════════════════

describe('tenant isolation regression scenarios', () => {
  it('tenant-A employee cannot access tenant-B reports', () => {
    const req = fakeReq({ id: 'e1', tenant_id: 'tenant-A' });
    const scope = resolveAccessScope(req);
    const result = resolveEffectiveTenantId(scope, 'tenant-B', 'admin_all');
    expect(result).toHaveProperty('forbidden', true);
  });

  it('tenant-A member cannot access tenant-B data', () => {
    const req = fakeReq({ id: 'm1', type: 'member', tenant_id: 'tenant-A' });
    const scope = resolveAccessScope(req);
    const result = resolveEffectiveTenantId(scope, 'tenant-B', 'own_only');
    expect(result).toHaveProperty('forbidden', true);
  });

  it('platform admin can view all tenants (admin_all, no tenant_id)', () => {
    const req = fakeReq({
      id: 'e-root',
      tenant_id: 'platform-tid',
      is_platform_super_admin: true,
    });
    const scope = resolveAccessScope(req);
    const result = resolveEffectiveTenantId(scope, null, 'admin_all');
    expect(result).toEqual({ tenantId: null, delegated: false });
  });

  it('platform admin can delegate to specific tenant (admin_delegate)', () => {
    const req = fakeReq({
      id: 'e-root',
      tenant_id: 'platform-tid',
      is_platform_super_admin: true,
    });
    const scope = resolveAccessScope(req);
    const result = resolveEffectiveTenantId(scope, 'tenant-B', 'admin_delegate');
    expect(result).toEqual({ tenantId: 'tenant-B', delegated: true });
  });

  it('unauthenticated request is forbidden', () => {
    const req = fakeReq();
    const scope = resolveAccessScope(req);
    const result = resolveEffectiveTenantId(scope, 'tenant-A', 'admin_delegate');
    expect(result).toHaveProperty('forbidden', true);
  });

  it('employee can access own tenant even with explicit own tenant_id', () => {
    const req = fakeReq({ id: 'e1', tenant_id: 'tenant-A' });
    const scope = resolveAccessScope(req);
    const result = resolveEffectiveTenantId(scope, 'tenant-A', 'admin_delegate');
    expect(result).toEqual({ tenantId: 'tenant-A', delegated: false });
  });

  it('employee without tenant_id is forbidden (TENANT_REQUIRED)', () => {
    const req = fakeReq({ id: 'e-lost' });
    const scope = resolveAccessScope(req);
    const result = resolveEffectiveTenantId(scope, null, 'admin_delegate');
    expect(result).toHaveProperty('forbidden', true);
    expect((result as any).message).toBe('TENANT_REQUIRED');
  });
});
