// Re-export bridge — canonical source is @/services/customerSources/customerSourceService
export {
  type CustomerSource,
  CUSTOMER_SOURCES_QUERY_KEY,
  useCustomerSources,
  initializeCustomerSourceCache,
  getCustomerSources,
  getActiveCustomerSources,
  saveCustomerSources,
  addCustomerSource,
  updateCustomerSource,
  deleteCustomerSource,
  reorderCustomerSources,
} from '@/services/customerSources/customerSourceService';
