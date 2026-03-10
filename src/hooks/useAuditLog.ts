import { useCallback } from 'react';
import { 
  logOperation, 
  ModuleType, 
  OperationType,
  AuditLogEntry 
} from '@/stores/auditLogStore';

// Hook for easy audit logging in components
export function useAuditLog(module: ModuleType) {
  const log = useCallback((
    operationType: OperationType,
    objectId: string,
    beforeData: any,
    afterData: any,
    objectDescription?: string
  ): AuditLogEntry => {
    return logOperation(module, operationType, objectId, beforeData, afterData, objectDescription);
  }, [module]);

  const logCreate = useCallback((
    objectId: string,
    afterData: any,
    objectDescription?: string
  ) => {
    return log('create', objectId, null, afterData, objectDescription);
  }, [log]);

  const logUpdate = useCallback((
    objectId: string,
    beforeData: any,
    afterData: any,
    objectDescription?: string
  ) => {
    return log('update', objectId, beforeData, afterData, objectDescription);
  }, [log]);

  const logDelete = useCallback((
    objectId: string,
    beforeData: any,
    objectDescription?: string
  ) => {
    return log('delete', objectId, beforeData, null, objectDescription);
  }, [log]);

  const logCancel = useCallback((
    objectId: string,
    beforeData: any,
    afterData: any,
    objectDescription?: string
  ) => {
    return log('cancel', objectId, beforeData, afterData, objectDescription);
  }, [log]);

  const logRestore = useCallback((
    objectId: string,
    beforeData: any,
    afterData: any,
    objectDescription?: string
  ) => {
    return log('restore', objectId, beforeData, afterData, objectDescription);
  }, [log]);

  const logAudit = useCallback((
    objectId: string,
    beforeData: any,
    afterData: any,
    objectDescription?: string
  ) => {
    return log('audit', objectId, beforeData, afterData, objectDescription);
  }, [log]);

  const logStatusChange = useCallback((
    objectId: string,
    beforeData: any,
    afterData: any,
    objectDescription?: string
  ) => {
    return log('status_change', objectId, beforeData, afterData, objectDescription);
  }, [log]);

  return {
    log,
    logCreate,
    logUpdate,
    logDelete,
    logCancel,
    logRestore,
    logAudit,
    logStatusChange,
  };
}

// Standalone utility functions for use outside of React components
export { logOperation } from '@/stores/auditLogStore';
