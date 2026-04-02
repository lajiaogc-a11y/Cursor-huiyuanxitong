import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 允许的国家代码列表
const ALLOWED_COUNTRIES = ['MY']; // Malaysia

// 开发/预览域名模式（这些域名跳过IP国家校验）
const DEV_DOMAIN_PATTERNS = [
  /localhost/,
  /127\.0\.0\.1/,
  /\.pages\.dev$/,
  /\.cloudflareaccess\.com$/,
];

// 检查是否为开发环境
function isDevEnvironment(req: Request): { isDev: boolean; source: string } {
  const referer = req.headers.get('referer') || '';
  const origin = req.headers.get('origin') || '';
  const source = referer || origin;
  
  if (!source) {
    return { isDev: false, source: '' };
  }
  
  try {
    const url = new URL(source);
    const hostname = url.hostname;
    
    const isDev = DEV_DOMAIN_PATTERNS.some(pattern => pattern.test(hostname));
    return { isDev, source: hostname };
  } catch {
    // URL 解析失败，检查原始字符串
    const isDev = DEV_DOMAIN_PATTERNS.some(pattern => pattern.test(source));
    return { isDev, source };
  }
}

// 获取客户端真实IP（考虑代理/CDN）
function getClientIp(req: Request): string {
  // Cloudflare
  const cfConnectingIp = req.headers.get('cf-connecting-ip');
  if (cfConnectingIp) return cfConnectingIp;
  
  // X-Real-IP (Nginx等代理)
  const xRealIp = req.headers.get('x-real-ip');
  if (xRealIp) return xRealIp;
  
  // X-Forwarded-For (标准代理头)
  const xForwardedFor = req.headers.get('x-forwarded-for');
  if (xForwardedFor) {
    // 取第一个IP（原始客户端）
    return xForwardedFor.split(',')[0].trim();
  }
  
  return 'unknown';
}

// 通过IP获取国家代码
async function getCountryFromIp(ip: string): Promise<{ country_code: string | null; country_name: string | null; city: string | null }> {
  if (!ip || ip === 'unknown' || ip === '127.0.0.1' || ip === 'localhost' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    // 本地/私有IP视为允许
    console.log('[validate-ip-country] Private/local IP detected, allowing:', ip);
    return { country_code: 'MY', country_name: 'Local Network', city: 'Local' };
  }

  try {
    // 使用 ip-api.com 免费服务
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,countryCode,country,city`);
    const data = await response.json();
    
    if (data.status === 'success') {
      console.log('[validate-ip-country] IP location:', { ip, countryCode: data.countryCode, country: data.country, city: data.city });
      return {
        country_code: data.countryCode || null,
        country_name: data.country || null,
        city: data.city || null,
      };
    }
    
    console.warn('[validate-ip-country] IP lookup failed:', data);
    return { country_code: null, country_name: null, city: null };
  } catch (error) {
    console.error('[validate-ip-country] Error fetching IP location:', error);
    return { country_code: null, country_name: null, city: null };
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 检查是否为开发环境
    const devCheck = isDevEnvironment(req);
    
    if (devCheck.isDev) {
      console.log('[validate-ip-country] Development environment detected, skipping validation:', devCheck.source);
      
      return new Response(
        JSON.stringify({
          valid: true,
          skipped: true,
          reason: 'Development environment detected',
          source: devCheck.source,
          message: '开发环境，跳过IP校验',
        }),
        { 
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // 获取客户端真实IP
    const clientIp = getClientIp(req);
    console.log('[validate-ip-country] Validating IP:', clientIp);
    
    // 获取IP的国家信息
    const locationInfo = await getCountryFromIp(clientIp);
    
    // 检查是否在允许的国家列表中
    const isAllowed = locationInfo.country_code && ALLOWED_COUNTRIES.includes(locationInfo.country_code);
    
    if (isAllowed) {
      return new Response(
        JSON.stringify({
          valid: true,
          ip: clientIp,
          country_code: locationInfo.country_code,
          country_name: locationInfo.country_name,
          city: locationInfo.city,
          message: 'IP验证通过',
        }),
        { 
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
    
    // IP不在允许的国家
    console.warn('[validate-ip-country] Access denied for IP:', clientIp, 'Country:', locationInfo.country_code);
    
    return new Response(
      JSON.stringify({
        valid: false,
        ip: clientIp,
        country_code: locationInfo.country_code,
        country_name: locationInfo.country_name,
        city: locationInfo.city,
        error: 'IP_COUNTRY_NOT_ALLOWED',
        message: `访问被拒绝：您的IP (${clientIp}) 来自 ${locationInfo.country_name || '未知地区'}，系统仅允许 Malaysia 地区访问。`,
      }),
      { 
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  } catch (error: unknown) {
    console.error('[validate-ip-country] Error:', error);
    
    // 发生错误时，出于安全考虑，拒绝访问
    return new Response(
      JSON.stringify({
        valid: false,
        error: 'VALIDATION_ERROR',
        message: 'IP验证服务暂时不可用',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
