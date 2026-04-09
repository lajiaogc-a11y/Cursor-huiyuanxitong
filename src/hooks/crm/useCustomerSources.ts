import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CUSTOMER_SOURCES_QUERY_KEY,
  type CustomerSource,
  fetchCustomerSources,
  getCustomerSources,
  getActiveCustomerSources,
  initializeCustomerSourceCache,
  saveCustomerSources,
  addCustomerSource,
  updateCustomerSource,
  deleteCustomerSource,
  reorderCustomerSources,
} from '@/services/customerSources/customerSourceService';

export {
  CUSTOMER_SOURCES_QUERY_KEY,
  type CustomerSource,
  getCustomerSources,
  getActiveCustomerSources,
  initializeCustomerSourceCache,
  saveCustomerSources,
  addCustomerSource,
  updateCustomerSource,
  deleteCustomerSource,
  reorderCustomerSources,
};

export function useCustomerSources() {
  const queryClient = useQueryClient();

  const { data: sources = [], isLoading: loading } = useQuery({
    queryKey: CUSTOMER_SOURCES_QUERY_KEY,
    queryFn: fetchCustomerSources,
  });

  const activeSources = useMemo(
    () => sources.filter(s => s.isActive).sort((a, b) => a.sortOrder - b.sortOrder),
    [sources],
  );

  const refetch = () => queryClient.invalidateQueries({ queryKey: CUSTOMER_SOURCES_QUERY_KEY });

  return {
    sources,
    activeSources,
    loading,
    refetch,
  };
}
