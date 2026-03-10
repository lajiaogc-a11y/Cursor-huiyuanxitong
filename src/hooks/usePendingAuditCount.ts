// ============= Pending Audit Count Hook =============
// Provides real-time count of pending audit items for sidebar badge
// Uses Supabase Realtime for automatic updates

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function usePendingAuditCount() {
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const { employee } = useAuth();

  const fetchPendingCount = async () => {
    try {
      const { count, error } = await supabase
        .from('audit_records')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

      if (error) {
        console.error('Error fetching pending audit count:', error);
        return;
      }

      setPendingCount(count || 0);
    } catch (err) {
      console.error('Error in fetchPendingCount:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!employee) return;

    fetchPendingCount();

    // Subscribe to real-time changes on audit_records table
    const channel = supabase
      .channel('pending-audit-count')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'audit_records' },
        () => {
          fetchPendingCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [employee]);

  return { pendingCount, loading, refetch: fetchPendingCount };
}
