/**
 * useAuthGuard — 共享的认证守卫逻辑（超时检测 / 自动重试 / 自愈跳转）
 * 供 ProtectedRoute 和 AdminProtectedRoute 共用，消除重复代码。
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

const DEFAULT_TIMEOUT_MS = 15_000;

export function useAuthGuard(timeoutMs = DEFAULT_TIMEOUT_MS) {
  const { session, loading, employee, refreshEmployee, signOut } = useAuth();
  const navigate = useNavigate();
  const [employeeLoadTimeout, setEmployeeLoadTimeout] = useState(false);
  const [authLoadTimeout, setAuthLoadTimeout] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [autoRecovering, setAutoRecovering] = useState(false);
  const [autoRecoveredOnce, setAutoRecoveredOnce] = useState(false);

  // 员工信息加载超时检测
  useEffect(() => {
    if (!loading && !!session && !employee) {
      const timer = setTimeout(() => setEmployeeLoadTimeout(true), timeoutMs);
      return () => clearTimeout(timer);
    }
    setEmployeeLoadTimeout(false);
  }, [loading, session, employee, timeoutMs]);

  // 认证 loading 超时兜底
  useEffect(() => {
    if (loading) {
      const timer = setTimeout(() => setAuthLoadTimeout(true), timeoutMs);
      return () => clearTimeout(timer);
    }
    setAuthLoadTimeout(false);
  }, [loading, timeoutMs]);

  // 自动自愈：有 session 但 employee 长时间为空时，先自动重试一次；失败则自动回登录
  useEffect(() => {
    if (!employeeLoadTimeout || !session || employee || autoRecovering) return;
    let active = true;
    setAutoRecovering(true);
    (async () => {
      if (!autoRecoveredOnce) {
        try {
          await refreshEmployee();
          setAutoRecoveredOnce(true);
          return;
        } catch {
          // ignore
        }
      }
      if (active) {
        await signOut();
        navigate('/staff/login', { replace: true });
      }
    })().finally(() => {
      if (active) setAutoRecovering(false);
    });
    return () => { active = false; };
  }, [employeeLoadTimeout, session, employee, autoRecovering, autoRecoveredOnce, refreshEmployee, signOut, navigate]);

  const handleRetry = async () => {
    setIsRetrying(true);
    setEmployeeLoadTimeout(false);
    try {
      await refreshEmployee();
    } finally {
      setIsRetrying(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/staff/login', { replace: true });
  };

  return { employeeLoadTimeout, authLoadTimeout, isRetrying, handleRetry, handleLogout };
}
