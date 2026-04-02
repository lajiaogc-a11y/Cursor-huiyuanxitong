// ============= Pending Audit Count Hook =============
// Provides real-time count of pending audit items for sidebar badge

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getPendingAuditCountApi } from '@/services/staff/dataApi';

export function usePendingAuditCount() {
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const { employee } = useAuth();

  const tenantId = employee?.is_platform_super_admin ? null : (employee?.tenant_id ?? null);

  const fetchPendingCount = useCallback(async () => {
    try {
      const count = await getPendingAuditCountApi(tenantId);
      setPendingCount(count || 0);
    } catch (err) {
      console.error('Error in fetchPendingCount:', err);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    if (!employee) return;

    fetchPendingCount();

    const timer = setInterval(() => {
      fetchPendingCount();
    }, 30000);

    return () => {
      clearInterval(timer);
    };
  }, [employee, fetchPendingCount]);

  return { pendingCount, loading, refetch: fetchPendingCount };
}
