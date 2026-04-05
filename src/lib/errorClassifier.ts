export type ErrorSeverity = 'critical' | 'warning' | 'info';

export interface ErrorClassification {
  category: { zh: string; en: string };
  severity: ErrorSeverity;
  summary: { zh: string; en: string };
  suggestion: { zh: string; en: string };
}

interface ErrorPattern {
  test: RegExp;
  classification: ErrorClassification;
}

const patterns: ErrorPattern[] = [
  // Network errors
  {
    test: /failed to fetch|networkerror|net::err|econnrefused|econnreset|enotfound|dns/i,
    classification: {
      category: { zh: '网络错误', en: 'Network Error' },
      severity: 'critical',
      summary: { zh: '网络连接失败，无法加载数据', en: 'Network connection failed, unable to load data' },
      suggestion: {
        zh: '请检查网络连接后刷新页面重试。如果使用 VPN，请尝试切换网络节点。',
        en: 'Check your network connection and refresh the page. If using a VPN, try switching nodes.',
      },
    },
  },
  // Timeout
  {
    test: /timeout|timed?\s*out|aborted/i,
    classification: {
      category: { zh: '超时', en: 'Timeout' },
      severity: 'warning',
      summary: { zh: '请求超时，服务器响应过慢', en: 'Request timed out, server responding slowly' },
      suggestion: {
        zh: '请稍后重试。如果问题持续出现，请联系管理员检查服务器状态。',
        en: 'Please retry later. If the issue persists, contact admin to check server status.',
      },
    },
  },
  // Auth / Permission
  {
    test: /401|403|unauthorized|forbidden|permission|rls|row.level.security|not.allowed|access.denied/i,
    classification: {
      category: { zh: '权限错误', en: 'Permission Error' },
      severity: 'critical',
      summary: { zh: '无权限访问该资源', en: 'No permission to access this resource' },
      suggestion: {
        zh: '请确认登录状态是否有效，并检查账户权限设置。如需更高权限请联系管理员。',
        en: 'Verify your login session is valid and check account permissions. Contact admin for elevated access.',
      },
    },
  },
  // Chunk / lazy-load
  {
    test: /chunkloaderror|loading chunk|loading css chunk|dynamically imported module/i,
    classification: {
      category: { zh: '加载错误', en: 'Load Error' },
      severity: 'warning',
      summary: { zh: '页面资源加载失败', en: 'Page resources failed to load' },
      suggestion: {
        zh: '请清除浏览器缓存后刷新页面（Ctrl+Shift+R）。如果问题仍然存在，可能是版本更新导致，请重新登录。',
        en: 'Clear browser cache and hard-refresh (Ctrl+Shift+R). If the issue persists, re-login as a new version may have been deployed.',
      },
    },
  },
  // TypeError: Cannot read properties of undefined/null
  {
    test: /cannot read propert(y|ies) of (undefined|null)|is not a function|is not defined|reference.?error/i,
    classification: {
      category: { zh: '数据错误', en: 'Data Error' },
      severity: 'critical',
      summary: { zh: '页面数据加载异常', en: 'Page data loading error' },
      suggestion: {
        zh: '请刷新页面重试。如果问题持续出现，请将此错误信息截图发送给管理员。',
        en: 'Refresh the page and retry. If the issue persists, screenshot this error and send it to the admin.',
      },
    },
  },
  // JSON parse
  {
    test: /unexpected token|json\.parse|json.at.position|invalid json|syntax.?error.*json/i,
    classification: {
      category: { zh: '数据格式错误', en: 'Data Format Error' },
      severity: 'warning',
      summary: { zh: '服务器返回了异常数据格式', en: 'Server returned unexpected data format' },
      suggestion: {
        zh: '请稍后重试。如果反复出现，可能是服务器配置问题，请联系技术支持。',
        en: 'Please retry later. If recurring, it may be a server configuration issue—contact support.',
      },
    },
  },
  // Storage quota
  {
    test: /quotaexceedederror|storage.*quota|localstorage|sessionstorage.*full/i,
    classification: {
      category: { zh: '存储错误', en: 'Storage Error' },
      severity: 'warning',
      summary: { zh: '浏览器存储空间不足', en: 'Browser storage space is full' },
      suggestion: {
        zh: '请清除浏览器缓存和网站数据，或在浏览器设置中增加存储配额。',
        en: 'Clear browser cache and site data, or increase storage quota in browser settings.',
      },
    },
  },
  // CORS
  {
    test: /cors|cross.origin|access-control-allow|blocked by cors/i,
    classification: {
      category: { zh: '跨域错误', en: 'CORS Error' },
      severity: 'critical',
      summary: { zh: '跨域请求被阻止', en: 'Cross-origin request blocked' },
      suggestion: {
        zh: '这是服务器配置问题，请联系管理员检查 API 跨域设置。',
        en: 'This is a server configuration issue. Contact admin to check API CORS settings.',
      },
    },
  },
  // Rate limit / 429
  {
    test: /429|too many requests|rate.limit/i,
    classification: {
      category: { zh: '频率限制', en: 'Rate Limit' },
      severity: 'warning',
      summary: { zh: '请求过于频繁', en: 'Too many requests sent' },
      suggestion: {
        zh: '请等待几分钟后再操作。避免短时间内重复提交相同请求。',
        en: 'Wait a few minutes before retrying. Avoid repeating the same request rapidly.',
      },
    },
  },
  // 500 / server error
  {
    test: /500|502|503|504|internal server error|bad gateway|service unavailable/i,
    classification: {
      category: { zh: '服务器错误', en: 'Server Error' },
      severity: 'critical',
      summary: { zh: '服务器内部错误', en: 'Internal server error' },
      suggestion: {
        zh: '服务器暂时不可用，请稍后重试。如果持续出错，请联系管理员。',
        en: 'Server temporarily unavailable. Retry later. If persistent, contact admin.',
      },
    },
  },
  // ResizeObserver
  {
    test: /resizeobserver/i,
    classification: {
      category: { zh: '布局警告', en: 'Layout Warning' },
      severity: 'info',
      summary: { zh: '页面布局自动调整（无影响）', en: 'Page layout auto-adjusted (no impact)' },
      suggestion: {
        zh: '这是浏览器自动处理的布局事件，无需任何操作，可安全忽略。',
        en: 'This is a browser-handled layout event. No action needed—safe to ignore.',
      },
    },
  },
  // Render / React
  {
    test: /maximum update depth|too many re-renders|render error|hydration|minified react error/i,
    classification: {
      category: { zh: '渲染错误', en: 'Render Error' },
      severity: 'critical',
      summary: { zh: '页面渲染循环异常', en: 'Page rendering loop error' },
      suggestion: {
        zh: '请刷新页面。如果问题持续，请清除浏览器缓存后重新访问。',
        en: 'Refresh the page. If persistent, clear browser cache and revisit.',
      },
    },
  },
  // PostgREST / SQL-style DB errors
  {
    test: /pgrst|postgrest|relation.*does not exist|column.*does not exist|duplicate key/i,
    classification: {
      category: { zh: '数据库错误', en: 'Database Error' },
      severity: 'critical',
      summary: { zh: '数据库操作异常', en: 'Database operation error' },
      suggestion: {
        zh: '数据库结构可能需要更新，请联系管理员检查数据库状态。',
        en: 'Database schema may need updating. Contact admin to check database status.',
      },
    },
  },
  // Memory
  {
    test: /out of memory|memory.*exceeded|allocation.*failed|heap/i,
    classification: {
      category: { zh: '内存错误', en: 'Memory Error' },
      severity: 'critical',
      summary: { zh: '浏览器内存不足', en: 'Browser out of memory' },
      suggestion: {
        zh: '请关闭不需要的浏览器标签页，然后刷新当前页面。',
        en: 'Close unnecessary browser tabs, then refresh the current page.',
      },
    },
  },
  // Script / eval
  {
    test: /script error|eval|securityerror|content security policy/i,
    classification: {
      category: { zh: '安全错误', en: 'Security Error' },
      severity: 'warning',
      summary: { zh: '脚本执行被安全策略阻止', en: 'Script blocked by security policy' },
      suggestion: {
        zh: '请检查浏览器扩展是否干扰了页面运行，或尝试使用无痕模式访问。',
        en: 'Check if browser extensions are interfering. Try visiting in incognito mode.',
      },
    },
  },
];

const fallback: ErrorClassification = {
  category: { zh: '未知错误', en: 'Unknown Error' },
  severity: 'warning',
  summary: { zh: '发生未知异常', en: 'An unknown error occurred' },
  suggestion: {
    zh: '请记录此错误信息并联系技术支持人员协助排查。',
    en: 'Please record this error information and contact technical support for assistance.',
  },
};

export function classifyError(errorMessage: string | null | undefined): ErrorClassification {
  const text =
    errorMessage == null
      ? ""
      : typeof errorMessage === "string"
        ? errorMessage
        : (() => {
            try {
              return JSON.stringify(errorMessage);
            } catch {
              return String(errorMessage);
            }
          })();
  for (const p of patterns) {
    if (p.test.test(text)) {
      return p.classification;
    }
  }
  return fallback;
}

export function getSeverityColor(severity: ErrorSeverity) {
  switch (severity) {
    case 'critical': return { bg: 'bg-destructive/10', text: 'text-destructive', border: 'border-destructive/30', dot: '🔴' };
    case 'warning': return { bg: 'bg-warning/10', text: 'text-warning', border: 'border-warning/30', dot: '🟡' };
    case 'info': return { bg: 'bg-primary/10', text: 'text-primary', border: 'border-primary/30', dot: '🔵' };
    default: return { bg: 'bg-muted/50', text: 'text-muted-foreground', border: 'border-border', dot: '⚪' };
  }
}
