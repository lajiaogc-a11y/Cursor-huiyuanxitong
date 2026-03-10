import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// 创建 Supabase 客户端（使用 service role 进行数据查询）
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Sanitize search input to prevent PostgREST filter injection
function sanitizeSearch(input: string): string {
  // Remove characters that could manipulate PostgREST filter syntax
  return input.replace(/[%_\\(),.*]/g, '').trim().substring(0, 100);
}

// Sanitize phone number input: only allow digits
function sanitizePhone(input: string): string {
  return input.replace(/[^0-9]/g, '').substring(0, 20);
}

// SHA-256 哈希函数
async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// 获取客户端 IP
function getClientIp(req: Request): string {
  return req.headers.get('cf-connecting-ip') ||
         req.headers.get('x-real-ip') ||
         req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
         'unknown';
}

// 记录 API 请求日志
async function logApiRequest(
  apiKeyId: string | null,
  keyPrefix: string | null,
  endpoint: string,
  method: string,
  ipAddress: string,
  userAgent: string | null,
  requestParams: Record<string, unknown> | null,
  responseStatus: number,
  responseTimeMs: number,
  errorMessage: string | null
) {
  try {
    await supabase.from('api_request_logs').insert({
      api_key_id: apiKeyId,
      key_prefix: keyPrefix,
      endpoint,
      method,
      ip_address: ipAddress,
      user_agent: userAgent,
      request_params: requestParams,
      response_status: responseStatus,
      response_time_ms: responseTimeMs,
      error_message: errorMessage,
    });
  } catch (e) {
    console.error('[API Log Error]', e);
  }
}

// 验证 API Key
async function validateApiKey(apiKey: string, ipAddress: string, endpoint: string): Promise<{
  valid: boolean;
  keyId: string | null;
  keyPrefix: string | null;
  permissions: string[];
  error: string | null;
  rateRemaining: number;
}> {
  if (!apiKey || !apiKey.startsWith('fast_')) {
    return { valid: false, keyId: null, keyPrefix: null, permissions: [], error: 'INVALID_KEY_FORMAT', rateRemaining: 0 };
  }

  const keyHash = await hashApiKey(apiKey);
  const keyPrefix = apiKey.substring(0, 12) + '...';

  const { data, error } = await supabase.rpc('validate_api_key', {
    p_key_hash: keyHash,
    p_ip_address: ipAddress,
    p_endpoint: endpoint,
  });

  if (error || !data || data.length === 0) {
    console.error('[Validate API Key Error]', error);
    return { valid: false, keyId: null, keyPrefix, permissions: [], error: 'VALIDATION_ERROR', rateRemaining: 0 };
  }

  const result = data[0];
  return {
    valid: result.is_valid,
    keyId: result.api_key_id,
    keyPrefix,
    permissions: result.permissions || [],
    error: result.error_code,
    rateRemaining: result.rate_remaining || 0,
  };
}

// 检查权限
function hasPermission(permissions: string[], endpoint: string): boolean {
  // 权限格式: ["members", "activity_data", "orders", "merchants", "all"]
  if (permissions.includes('all')) return true;
  
  const endpointMap: Record<string, string[]> = {
    '/members': ['members', 'member_management'],
    '/members/list': ['members', 'member_management'],
    '/members/detail': ['members', 'member_management'],
    '/activity': ['activity_data', 'activity'],
    '/activity/summary': ['activity_data', 'activity'],
    '/activity/gifts': ['activity_data', 'activity'],
    '/activity/points': ['activity_data', 'activity'],
    '/activity/list': ['activity_data', 'activity'],
    '/orders': ['orders', 'order_management'],
    '/orders/list': ['orders', 'order_management'],
    '/orders/detail': ['orders', 'order_management'],
    '/orders/stats': ['orders', 'order_management'],
    '/merchants': ['merchants', 'merchant_management'],
    '/merchants/vendors': ['merchants', 'merchant_management'],
    '/merchants/providers': ['merchants', 'merchant_management'],
    '/referrals': ['referrals', 'referral_management'],
    '/referrals/list': ['referrals', 'referral_management'],
  };

  const requiredPerms = endpointMap[endpoint] || [];
  return requiredPerms.some(p => permissions.includes(p));
}

// ============================================
// API 端点处理器
// ============================================

// 获取会员列表
async function getMembersList(params: URLSearchParams) {
  const page = parseInt(params.get('page') || '1');
  const limit = Math.min(parseInt(params.get('limit') || '50'), 100);
  const offset = (page - 1) * limit;
  const search = params.get('search') || '';

  let query = supabase
    .from('members')
    .select(`
      id,
      member_code,
      phone_number,
      member_level,
      currency_preferences,
      common_cards,
      bank_card,
      customer_feature,
      remark,
      created_at,
      updated_at
    `, { count: 'exact' });

  if (search) {
    const safe = sanitizeSearch(search);
    if (safe) {
      query = query.or(`member_code.ilike.%${safe}%,phone_number.ilike.%${safe}%`);
    }
  }

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;

  return {
    data,
    pagination: {
      page,
      limit,
      total: count || 0,
      total_pages: Math.ceil((count || 0) / limit),
    },
  };
}

// 获取会员详情
async function getMemberDetail(params: URLSearchParams) {
  const memberId = params.get('member_id');
  const memberCode = params.get('member_code');
  const phone = params.get('phone');

  if (!memberId && !memberCode && !phone) {
    throw new Error('MISSING_IDENTIFIER');
  }

  let query = supabase
    .from('members')
    .select(`
      id,
      member_code,
      phone_number,
      member_level,
      currency_preferences,
      common_cards,
      bank_card,
      customer_feature,
      remark,
      created_at,
      updated_at
    `);

  if (memberId) {
    query = query.eq('id', memberId);
  } else if (memberCode) {
    query = query.eq('member_code', memberCode);
  } else if (phone) {
    query = query.eq('phone_number', sanitizePhone(phone));
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('MEMBER_NOT_FOUND');

  // 获取活动数据
  const { data: activityData } = await supabase
    .from('member_activity')
    .select('*')
    .eq('member_id', data.id)
    .maybeSingle();

  // 获取积分账户
  const { data: pointsAccount } = await supabase
    .from('points_accounts')
    .select('*')
    .eq('member_code', data.member_code)
    .maybeSingle();

  return {
    member: data,
    activity: activityData || null,
    points_account: pointsAccount || null,
  };
}

// 获取活动数据汇总
async function getActivitySummary(params: URLSearchParams) {
  const startDate = params.get('start_date');
  const endDate = params.get('end_date');

  // 获取会员活动统计
  let activityQuery = supabase
    .from('member_activity')
    .select('*');

  const { data: activities, error: actError } = await activityQuery;
  if (actError) throw actError;

  // 计算汇总数据
  const summary = {
    total_members: activities?.length || 0,
    total_accumulated_ngn: 0,
    total_accumulated_ghs: 0,
    total_accumulated_usdt: 0,
    total_gift_ngn: 0,
    total_gift_ghs: 0,
    total_gift_usdt: 0,
    total_accumulated_profit: 0,
    total_referral_count: 0,
  };

  activities?.forEach(a => {
    summary.total_accumulated_ngn += Number(a.total_accumulated_ngn) || 0;
    summary.total_accumulated_ghs += Number(a.total_accumulated_ghs) || 0;
    summary.total_accumulated_usdt += Number(a.total_accumulated_usdt) || 0;
    summary.total_gift_ngn += Number(a.total_gift_ngn) || 0;
    summary.total_gift_ghs += Number(a.total_gift_ghs) || 0;
    summary.total_gift_usdt += Number(a.total_gift_usdt) || 0;
    summary.total_accumulated_profit += Number(a.accumulated_profit) || 0;
    summary.total_referral_count += Number(a.referral_count) || 0;
  });

  // 获取活动赠送记录
  let giftsQuery = supabase
    .from('activity_gifts')
    .select('*', { count: 'exact' });

  if (startDate) {
    giftsQuery = giftsQuery.gte('created_at', startDate);
  }
  if (endDate) {
    giftsQuery = giftsQuery.lte('created_at', endDate + 'T23:59:59');
  }

  const { count: giftsCount } = await giftsQuery;

  return {
    member_activity_summary: summary,
    total_gift_records: giftsCount || 0,
    query_period: { start_date: startDate, end_date: endDate },
  };
}

// 获取活动数据列表
async function getActivityList(params: URLSearchParams) {
  const page = parseInt(params.get('page') || '1');
  const limit = Math.min(parseInt(params.get('limit') || '50'), 100);
  const offset = (page - 1) * limit;
  const search = params.get('search') || '';

  let query = supabase
    .from('member_activity')
    .select(`
      id,
      member_id,
      phone_number,
      accumulated_points,
      remaining_points,
      referral_count,
      referral_points,
      accumulated_profit,
      total_accumulated_ngn,
      total_accumulated_ghs,
      total_accumulated_usdt,
      total_gift_ngn,
      total_gift_ghs,
      total_gift_usdt,
      last_reset_time,
      created_at,
      updated_at
    `, { count: 'exact' });

  if (search) {
    const safe = sanitizeSearch(search);
    if (safe) {
      query = query.ilike('phone_number', `%${safe}%`);
    }
  }

  const { data, error, count } = await query
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;

  return {
    data,
    pagination: {
      page,
      limit,
      total: count || 0,
      total_pages: Math.ceil((count || 0) / limit),
    },
  };
}

// 获取活动赠送记录
async function getActivityGifts(params: URLSearchParams) {
  const page = parseInt(params.get('page') || '1');
  const limit = Math.min(parseInt(params.get('limit') || '50'), 100);
  const offset = (page - 1) * limit;
  const startDate = params.get('start_date');
  const endDate = params.get('end_date');
  const phone = params.get('phone');

  let query = supabase
    .from('activity_gifts')
    .select(`
      id,
      phone_number,
      currency,
      amount,
      rate,
      fee,
      gift_value,
      gift_type,
      payment_agent,
      remark,
      created_at
    `, { count: 'exact' });

  if (startDate) {
    query = query.gte('created_at', startDate);
  }
  if (endDate) {
    query = query.lte('created_at', endDate + 'T23:59:59');
  }
  if (phone) {
    query = query.eq('phone_number', sanitizePhone(phone));
  }

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;

  return {
    data,
    pagination: {
      page,
      limit,
      total: count || 0,
      total_pages: Math.ceil((count || 0) / limit),
    },
  };
}

// 获取积分明细
async function getPointsLedger(params: URLSearchParams) {
  const page = parseInt(params.get('page') || '1');
  const limit = Math.min(parseInt(params.get('limit') || '50'), 100);
  const offset = (page - 1) * limit;
  const memberCode = params.get('member_code');
  const phone = params.get('phone');

  let query = supabase
    .from('points_ledger')
    .select(`
      id,
      member_code,
      phone_number,
      points_earned,
      transaction_type,
      status,
      currency,
      usd_amount,
      exchange_rate,
      actual_payment,
      created_at
    `, { count: 'exact' });

  if (memberCode) {
    query = query.eq('member_code', memberCode);
  }
  if (phone) {
    query = query.eq('phone_number', sanitizePhone(phone));
  }

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;

  return {
    data,
    pagination: {
      page,
      limit,
      total: count || 0,
      total_pages: Math.ceil((count || 0) / limit),
    },
  };
}

// ============================================
// 新增 API 端点 - 订单、商家、推荐
// ============================================

// 获取订单列表
async function getOrdersList(params: URLSearchParams) {
  const page = parseInt(params.get('page') || '1');
  const limit = Math.min(parseInt(params.get('limit') || '50'), 100);
  const offset = (page - 1) * limit;
  const status = params.get('status');
  const startDate = params.get('start_date');
  const endDate = params.get('end_date');
  const phone = params.get('phone');

  let query = supabase
    .from('orders')
    .select(`
      id,
      order_number,
      order_type,
      phone_number,
      currency,
      card_value,
      exchange_rate,
      amount,
      payment_value,
      fee,
      actual_payment,
      profit_usdt,
      profit_ngn,
      status,
      is_deleted,
      created_at,
      completed_at
    `, { count: 'exact' })
    .eq('is_deleted', false);

  if (status) {
    query = query.eq('status', status);
  }
  if (startDate) {
    query = query.gte('created_at', startDate);
  }
  if (endDate) {
    query = query.lte('created_at', endDate + 'T23:59:59');
  }
  if (phone) {
    query = query.eq('phone_number', sanitizePhone(phone));
  }

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;

  return {
    data,
    pagination: {
      page,
      limit,
      total: count || 0,
      total_pages: Math.ceil((count || 0) / limit),
    },
  };
}

// 获取订单详情
async function getOrderDetail(params: URLSearchParams) {
  const orderId = params.get('order_id');
  const orderNumber = params.get('order_number');

  if (!orderId && !orderNumber) {
    throw new Error('MISSING_ORDER_IDENTIFIER');
  }

  let query = supabase
    .from('orders')
    .select(`
      id,
      order_number,
      order_type,
      phone_number,
      currency,
      card_value,
      exchange_rate,
      amount,
      payment_value,
      fee,
      actual_payment,
      profit_usdt,
      profit_ngn,
      status,
      is_deleted,
      remark,
      created_at,
      completed_at,
      updated_at
    `);

  if (orderId) {
    query = query.eq('id', orderId);
  } else if (orderNumber) {
    query = query.eq('order_number', orderNumber);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('ORDER_NOT_FOUND');

  return { order: data };
}

// 获取订单统计
async function getOrderStats(params: URLSearchParams) {
  const startDate = params.get('start_date');
  const endDate = params.get('end_date');

  let query = supabase
    .from('orders')
    .select('*')
    .eq('is_deleted', false);

  if (startDate) {
    query = query.gte('created_at', startDate);
  }
  if (endDate) {
    query = query.lte('created_at', endDate + 'T23:59:59');
  }

  const { data: orders, error } = await query;
  if (error) throw error;

  const stats = {
    total_orders: orders?.length || 0,
    completed_orders: 0,
    pending_orders: 0,
    cancelled_orders: 0,
    total_amount: 0,
    total_profit_usdt: 0,
    total_profit_ngn: 0,
    by_currency: {} as Record<string, { count: number; amount: number }>,
  };

  orders?.forEach(order => {
    if (order.status === 'completed') stats.completed_orders++;
    else if (order.status === 'pending') stats.pending_orders++;
    else if (order.status === 'cancelled') stats.cancelled_orders++;

    if (order.status === 'completed') {
      stats.total_amount += Number(order.amount) || 0;
      stats.total_profit_usdt += Number(order.profit_usdt) || 0;
      stats.total_profit_ngn += Number(order.profit_ngn) || 0;

      const currency = order.currency || 'UNKNOWN';
      if (!stats.by_currency[currency]) {
        stats.by_currency[currency] = { count: 0, amount: 0 };
      }
      stats.by_currency[currency].count++;
      stats.by_currency[currency].amount += Number(order.amount) || 0;
    }
  });

  return {
    stats,
    query_period: { start_date: startDate, end_date: endDate },
  };
}

// 获取卡商列表
async function getVendorsList(params: URLSearchParams) {
  const status = params.get('status');

  let query = supabase
    .from('vendors')
    .select(`
      id,
      name,
      status,
      payment_providers,
      remark,
      sort_order,
      created_at,
      updated_at
    `);

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query.order('sort_order', { ascending: true });
  if (error) throw error;

  return { data };
}

// 获取代付商家列表
async function getProvidersList(params: URLSearchParams) {
  const status = params.get('status');

  let query = supabase
    .from('payment_providers')
    .select(`
      id,
      name,
      status,
      remark,
      sort_order,
      created_at,
      updated_at
    `);

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query.order('sort_order', { ascending: true });
  if (error) throw error;

  return { data };
}

// 获取推荐关系列表
async function getReferralsList(params: URLSearchParams) {
  const page = parseInt(params.get('page') || '1');
  const limit = Math.min(parseInt(params.get('limit') || '50'), 100);
  const offset = (page - 1) * limit;
  const referrerPhone = params.get('referrer_phone');
  const refereePhone = params.get('referee_phone');

  let query = supabase
    .from('referral_relations')
    .select(`
      id,
      referrer_phone,
      referrer_member_code,
      referee_phone,
      referee_member_code,
      source,
      created_at
    `, { count: 'exact' });

  if (referrerPhone) {
    query = query.eq('referrer_phone', referrerPhone);
  }
  if (refereePhone) {
    query = query.eq('referee_phone', refereePhone);
  }

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;

  return {
    data,
    pagination: {
      page,
      limit,
      total: count || 0,
      total_pages: Math.ceil((count || 0) / limit),
    },
  };
}

// ============================================
// 主处理器
// ============================================

serve(async (req) => {
  const startTime = Date.now();

  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  
  // 移除函数名前缀，获取实际端点
  // URL: /external-api/members -> endpoint: /members
  const endpoint = '/' + pathParts.slice(1).join('/');
  const params = url.searchParams;
  const ipAddress = getClientIp(req);
  const userAgent = req.headers.get('user-agent');

  // 获取 API Key
  const apiKey = req.headers.get('x-api-key') || params.get('api_key') || '';

  let keyId: string | null = null;
  let keyPrefix: string | null = null;

  try {
    // 验证 API Key
    const validation = await validateApiKey(apiKey, ipAddress, endpoint);
    keyId = validation.keyId;
    keyPrefix = validation.keyPrefix;

    if (!validation.valid) {
      const errorMessages: Record<string, string> = {
        'INVALID_KEY_FORMAT': 'Invalid API key format. Key must start with "fast_"',
        'INVALID_KEY': 'Invalid API key',
        'KEY_DISABLED': 'API key has been disabled',
        'KEY_EXPIRED': 'API key has expired',
        'IP_NOT_ALLOWED': 'Your IP address is not in the whitelist',
        'RATE_LIMIT_EXCEEDED': 'Rate limit exceeded. Please try again later',
        'VALIDATION_ERROR': 'Error validating API key',
      };

      const statusCodes: Record<string, number> = {
        'RATE_LIMIT_EXCEEDED': 429,
        'IP_NOT_ALLOWED': 403,
        'KEY_DISABLED': 403,
        'KEY_EXPIRED': 403,
      };

      const status = statusCodes[validation.error || ''] || 401;
      const message = errorMessages[validation.error || ''] || 'Authentication failed';

      await logApiRequest(keyId, keyPrefix, endpoint, req.method, ipAddress, userAgent, null, status, Date.now() - startTime, validation.error);

      return new Response(
        JSON.stringify({ success: false, error: validation.error, message }),
        { 
          status, 
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json',
            'X-RateLimit-Remaining': String(validation.rateRemaining),
          } 
        }
      );
    }

    // 检查权限
    if (!hasPermission(validation.permissions, endpoint)) {
      await logApiRequest(keyId, keyPrefix, endpoint, req.method, ipAddress, userAgent, null, 403, Date.now() - startTime, 'PERMISSION_DENIED');
      
      return new Response(
        JSON.stringify({ success: false, error: 'PERMISSION_DENIED', message: 'You do not have permission to access this endpoint' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 路由处理
    let result: unknown;

    switch (endpoint) {
      case '/members':
      case '/members/list':
        result = await getMembersList(params);
        break;
      case '/members/detail':
        result = await getMemberDetail(params);
        break;
      case '/activity':
      case '/activity/summary':
        result = await getActivitySummary(params);
        break;
      case '/activity/list':
        result = await getActivityList(params);
        break;
      case '/activity/gifts':
        result = await getActivityGifts(params);
        break;
      case '/activity/points':
        result = await getPointsLedger(params);
        break;
      case '/orders':
      case '/orders/list':
        result = await getOrdersList(params);
        break;
      case '/orders/detail':
        result = await getOrderDetail(params);
        break;
      case '/orders/stats':
        result = await getOrderStats(params);
        break;
      case '/merchants/vendors':
        result = await getVendorsList(params);
        break;
      case '/merchants/providers':
        result = await getProvidersList(params);
        break;
      case '/referrals':
      case '/referrals/list':
        result = await getReferralsList(params);
        break;
      default:
        await logApiRequest(keyId, keyPrefix, endpoint, req.method, ipAddress, userAgent, null, 404, Date.now() - startTime, 'ENDPOINT_NOT_FOUND');
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'ENDPOINT_NOT_FOUND', 
            message: 'Endpoint not found',
            available_endpoints: [
              '/members - Get member list',
              '/members/detail - Get member detail',
              '/activity/summary - Get activity summary',
              '/activity/list - Get activity data list',
              '/activity/gifts - Get gift records',
              '/activity/points - Get points ledger',
              '/orders - Get orders list',
              '/orders/detail - Get order detail',
              '/orders/stats - Get order statistics',
              '/merchants/vendors - Get card vendors list',
              '/merchants/providers - Get payment providers list',
              '/referrals - Get referral relations list',
            ]
          }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    const responseTime = Date.now() - startTime;
    await logApiRequest(keyId, keyPrefix, endpoint, req.method, ipAddress, userAgent, Object.fromEntries(params), 200, responseTime, null);

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { 
        status: 200, 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'X-Response-Time': `${responseTime}ms`,
          'X-RateLimit-Remaining': String(validation.rateRemaining),
        } 
      }
    );

  } catch (error: unknown) {
    const responseTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error('[API Error]', errorMessage);
    // Log generic error to request logs (accessible via client) to prevent info leakage
    const isKnownError = errorMessage in { 'MISSING_IDENTIFIER': 1, 'MEMBER_NOT_FOUND': 1, 'MISSING_ORDER_IDENTIFIER': 1, 'ORDER_NOT_FOUND': 1 };
    await logApiRequest(keyId, keyPrefix, endpoint, req.method, ipAddress, userAgent, null, 500, responseTime, isKnownError ? errorMessage : 'INTERNAL_ERROR');

    const knownErrors: Record<string, { status: number; message: string }> = {
      'MISSING_IDENTIFIER': { status: 400, message: 'Missing required identifier (member_id, member_code, or phone)' },
      'MEMBER_NOT_FOUND': { status: 404, message: 'Member not found' },
    };

    const known = knownErrors[errorMessage];
    if (known) {
      return new Response(
        JSON.stringify({ success: false, error: errorMessage, message: known.message }),
        { status: known.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: 'INTERNAL_ERROR', message: 'An internal error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
