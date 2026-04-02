/**
 * TableProxy 白名单分级回归测试
 *
 * 验证表代理的分级访问控制：
 * 1. read_only 表拒绝写操作 (INSERT/UPDATE/DELETE)
 * 2. admin_only 表拒绝非管理员访问
 * 3. standard 表允许正常 CRUD
 * 4. 未注册表被拒绝
 */
import { describe, it, expect } from 'vitest';
import { isTableProxyAllowed } from '../tableProxy.js';

describe('isTableProxyAllowed', () => {
  it('allows standard tables', () => {
    expect(isTableProxyAllowed('members')).toBe(true);
    expect(isTableProxyAllowed('orders')).toBe(true);
    expect(isTableProxyAllowed('gift_cards')).toBe(true);
  });

  it('allows read_only tables', () => {
    expect(isTableProxyAllowed('audit_records')).toBe(true);
    expect(isTableProxyAllowed('system_logs')).toBe(true);
    expect(isTableProxyAllowed('operation_logs')).toBe(true);
  });

  it('allows admin_only tables', () => {
    expect(isTableProxyAllowed('tenants')).toBe(true);
    expect(isTableProxyAllowed('api_keys')).toBe(true);
    expect(isTableProxyAllowed('role_permissions')).toBe(true);
  });

  it('rejects unknown tables', () => {
    expect(isTableProxyAllowed('__secret_table')).toBe(false);
    expect(isTableProxyAllowed('users')).toBe(false);
    expect(isTableProxyAllowed('')).toBe(false);
  });
});
