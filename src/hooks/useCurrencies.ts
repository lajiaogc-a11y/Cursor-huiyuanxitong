/**
 * 币种设置 Hook - react-query 缓存，切换秒开
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Currency {
  id: string;
  code: string;
  name_zh: string;
  badge_color: string;
  sort_order: number;
  is_active: boolean;
}

const STALE_TIME = 5 * 60 * 1000;

async function fetchCurrencies(): Promise<Currency[]> {
  const { data, error } = await supabase
    .from('currencies')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

export function useCurrencies() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['currencies'],
    queryFn: fetchCurrencies,
    staleTime: STALE_TIME,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ['currencies'] });

  return {
    currencies: query.data ?? [],
    loading: query.isLoading,
    refetch,
  };
}
