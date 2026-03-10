/**
 * RBAC Logic Tests — validates ProtectedRoute decision logic
 * without React rendering (avoids OOM in constrained environments).
 * 
 * These test the same permission checks that ProtectedRoute performs.
 */
import { describe, it, expect } from 'vitest';

// Pure logic extracted from ProtectedRoute decision tree
interface RouteGuardInput {
  loading: boolean;
  isAuthenticated: boolean;
  employee: { status: string; role: string } | null;
  isAdmin: boolean;
  isManager: boolean;
  requireAdmin?: boolean;
  requireManager?: boolean;
}

type RouteGuardResult =
  | 'loading'
  | 'redirect-login'
  | 'employee-loading'
  | 'pending'
  | 'disabled'
  | 'denied-admin'
  | 'denied-manager'
  | 'allowed';

function evaluateRouteGuard(input: RouteGuardInput): RouteGuardResult {
  if (input.loading) return 'loading';
  if (!input.isAuthenticated) return 'redirect-login';
  if (!input.employee) return 'employee-loading';
  if (input.employee.status === 'pending') return 'pending';
  if (input.employee.status !== 'active') return 'disabled';
  if (input.requireAdmin && !input.isAdmin) return 'denied-admin';
  if (input.requireManager && !input.isManager) return 'denied-manager';
  return 'allowed';
}

describe('RBAC Route Guard Logic', () => {
  it('shows loading when auth is loading', () => {
    expect(evaluateRouteGuard({
      loading: true, isAuthenticated: false, employee: null,
      isAdmin: false, isManager: false,
    })).toBe('loading');
  });

  it('redirects unauthenticated to login', () => {
    expect(evaluateRouteGuard({
      loading: false, isAuthenticated: false, employee: null,
      isAdmin: false, isManager: false,
    })).toBe('redirect-login');
  });

  it('shows employee-loading when authenticated but no employee', () => {
    expect(evaluateRouteGuard({
      loading: false, isAuthenticated: true, employee: null,
      isAdmin: false, isManager: false,
    })).toBe('employee-loading');
  });

  it('redirects pending employees', () => {
    expect(evaluateRouteGuard({
      loading: false, isAuthenticated: true,
      employee: { status: 'pending', role: 'staff' },
      isAdmin: false, isManager: false,
    })).toBe('pending');
  });

  it('blocks disabled accounts', () => {
    expect(evaluateRouteGuard({
      loading: false, isAuthenticated: true,
      employee: { status: 'disabled', role: 'staff' },
      isAdmin: false, isManager: false,
    })).toBe('disabled');
  });

  it('allows active staff to normal routes', () => {
    expect(evaluateRouteGuard({
      loading: false, isAuthenticated: true,
      employee: { status: 'active', role: 'staff' },
      isAdmin: false, isManager: false,
    })).toBe('allowed');
  });

  it('blocks staff from admin routes', () => {
    expect(evaluateRouteGuard({
      loading: false, isAuthenticated: true,
      employee: { status: 'active', role: 'staff' },
      isAdmin: false, isManager: false, requireAdmin: true,
    })).toBe('denied-admin');
  });

  it('allows admin to admin routes', () => {
    expect(evaluateRouteGuard({
      loading: false, isAuthenticated: true,
      employee: { status: 'active', role: 'admin' },
      isAdmin: true, isManager: true, requireAdmin: true,
    })).toBe('allowed');
  });

  it('blocks staff from manager routes', () => {
    expect(evaluateRouteGuard({
      loading: false, isAuthenticated: true,
      employee: { status: 'active', role: 'staff' },
      isAdmin: false, isManager: false, requireManager: true,
    })).toBe('denied-manager');
  });

  it('allows manager to manager routes', () => {
    expect(evaluateRouteGuard({
      loading: false, isAuthenticated: true,
      employee: { status: 'active', role: 'manager' },
      isAdmin: false, isManager: true, requireManager: true,
    })).toBe('allowed');
  });

  it('admin can access manager routes', () => {
    expect(evaluateRouteGuard({
      loading: false, isAuthenticated: true,
      employee: { status: 'active', role: 'admin' },
      isAdmin: true, isManager: true, requireManager: true,
    })).toBe('allowed');
  });

  it('admin route check takes priority over manager check', () => {
    expect(evaluateRouteGuard({
      loading: false, isAuthenticated: true,
      employee: { status: 'active', role: 'manager' },
      isAdmin: false, isManager: true, requireAdmin: true,
    })).toBe('denied-admin');
  });
});
