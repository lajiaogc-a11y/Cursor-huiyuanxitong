/**
 * 币种设置 Hook - react-query 缓存，切换秒开
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getCurrenciesApi } from '@/services/staff/dataApi';

export interface Currency {
  id: string;
  code: string;
  name_zh: string;
  badge_color: string;
  sort_order: number;
  is_active: boolean;
}

const STALE_TIME = 5 * 60 * 1000;

const DEFAULT_CURRENCIES: Currency[] = [
  { id: 'default-ngn', code: 'NGN', name_zh: '奈拉', badge_color: 'bg-orange-100 text-orange-700 border-orange-200', sort_order: 1, is_active: true },
  { id: 'default-ghs', code: 'GHS', name_zh: '赛地', badge_color: 'bg-green-100 text-green-700 border-green-200', sort_order: 2, is_active: true },
  { id: 'default-usdt', code: 'USDT', name_zh: 'USDT', badge_color: 'bg-blue-100 text-blue-700 border-blue-200', sort_order: 3, is_active: true },
];

async function fetchCurrencies(): Promise<Currency[]> {
  try {
    const data = await getCurrenciesApi();
    if (Array.isArray(data) && data.length > 0) return data as Currency[];
  } catch (error) {
    console.error('[useCurrencies] API fetch failed:', error);
  }
  return DEFAULT_CURRENCIES;
}

export function useCurrencies() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['currencies'],
    queryFn: fetchCurrencies,
    staleTime: STALE_TIME,
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ['currencies'] });

  return {
    currencies: query.data ?? [],
    loading: query.isLoading,
    refetch,
  };
}
