/**
 * Feature components barrel — organized by business domain.
 *
 * Usage:
 *   import { LedgerTransactionContent } from '@/components/features/finance';
 *   import { SystemSettingsTab } from '@/components/features/admin';
 *
 * These are re-exports from original locations.
 * Files will be physically moved into these directories incrementally.
 */
export * from './finance';
export * from './points';
export * from './exchange-rate';
export * from './admin';
export * from './tenants';
export * from './tasks';
export * from './activity';
