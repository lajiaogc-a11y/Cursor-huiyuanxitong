// Password security policy validation
// Requirements: min 8 chars, uppercase, lowercase, number

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

export function validatePassword(password: string): PasswordValidationResult {
  const errors: string[] = [];
  
  if (password.length < 8) {
    errors.push('密码至少需要8个字符 / Password must be at least 8 characters');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('密码需要包含大写字母 / Password must contain an uppercase letter');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('密码需要包含小写字母 / Password must contain a lowercase letter');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('密码需要包含数字 / Password must contain a number');
  }
  
  return { valid: errors.length === 0, errors };
}

export function getPasswordStrength(password: string): 'weak' | 'medium' | 'strong' {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  
  if (score <= 3) return 'weak';
  if (score <= 4) return 'medium';
  return 'strong';
}
