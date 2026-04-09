export type ServiceErrorDomain = "COMMON" | "AUTH" | "TENANT" | "PHONE_POOL" | "TASK";

export type ServiceErrorCode =
  | "UNKNOWN"
  | "NOT_AUTHENTICATED"
  | "NO_PERMISSION"
  | "DUPLICATE_KEY"
  | "TENANT_REQUIRED"
  | "FORBIDDEN_TENANT_MISMATCH"
  | "FORBIDDEN_ADMIN_ONLY"
  | "MULTI_TENANT_NOT_READY"
  | "EMPTY_RESULT"
  | "DAILY_LIMIT_EXCEEDED"
  | "HAS_UNRETURNED_PHONES"
  | "PHONE_POOL_EXHAUSTED"
  | "TENANT_CODE_EXISTS"
  | "ADMIN_USERNAME_EXISTS"
  | "ADMIN_REAL_NAME_EXISTS"
  | "TENANT_NOT_FOUND"
  | "ADMIN_NOT_FOUND"
  | "TENANT_HAS_DATA"
  | "CANNOT_DELETE_PLATFORM"
  | "CREATE_FAILED"
  | "DELETE_FAILED"
  | "PASSWORD_REQUIRED"
  | "INVALID_PASSWORD"
  | "TASK_NOT_FOUND"
  | "TASK_ALREADY_CLOSED"
  | "POSTER_NOT_FOUND"
  | "FEATURE_DISABLED"
  | "QUOTA_EXCEEDED"
  | "MAINTENANCE_MODE"
  | "TARGET_NOT_FOUND"
  | "INVALID_FLAG_KEY"
  | "FLAG_FETCH_FAILED"
  | "SET_FLAG_FAILED"
  | "SET_2FA_FAILED"
  | "SET_MAINTENANCE_FAILED";

export interface ServiceError {
  code: ServiceErrorCode;
  message: string;
  domain: ServiceErrorDomain;
  retryable?: boolean;
  cause?: unknown;
}

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ServiceError };

export function ok<T>(data: T): ServiceResult<T> {
  return { ok: true, data };
}

export function fail<T = never>(
  code: ServiceErrorCode,
  message: string,
  domain: ServiceErrorDomain,
  cause?: unknown,
  retryable = false
): ServiceResult<T> {
  return { ok: false, error: { code, message, domain, cause, retryable } };
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "UNKNOWN";
}

