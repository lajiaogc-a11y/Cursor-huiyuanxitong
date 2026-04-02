import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 使用免费的 IP 地理位置 API
async function getIpLocation(ip: string, lang?: string): Promise<{ city: string; country: string; region: string } | null> {
  if (!ip || ip === 'unknown' || ip === '127.0.0.1' || ip === 'localhost') {
    return null;
  }

  try {
    // 使用 ip-api.com 免费服务（每分钟限制45次请求）
    const apiLang = lang || 'en';
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,regionName,city&lang=${apiLang}`);
    const data = await response.json();
    
    if (data.status === 'success') {
      return {
        city: data.city || '',
        country: data.country || '',
        region: data.regionName || '',
      };
    }
    
    console.log('[get-ip-location] API returned non-success:', data);
    return null;
  } catch (error: unknown) {
    console.error('[get-ip-location] Error fetching location:', error);
    return null;
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const ip = url.searchParams.get('ip');
    const lang = url.searchParams.get('lang') || undefined;

    if (!ip) {
      return new Response(
        JSON.stringify({ error: 'Missing ip parameter' }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('[get-ip-location] Looking up IP:', ip, 'lang:', lang);
    
    const location = await getIpLocation(ip, lang);
    
    if (location) {
      // 组合城市和国家信息
      let locationStr = '';
      if (location.city) {
        locationStr = location.city;
        if (location.region && location.region !== location.city) {
          locationStr += `, ${location.region}`;
        }
        if (location.country) {
          locationStr += `, ${location.country}`;
        }
      } else if (location.country) {
        locationStr = location.country;
      }

      return new Response(
        JSON.stringify({ 
          ip,
          location: locationStr || 'Unknown',
          details: location,
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    return new Response(
      JSON.stringify({ 
        ip,
        location: 'Unknown',
        details: null,
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  } catch (error: unknown) {
    console.error('[get-ip-location] Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        location: 'Unknown'
      }),
      { 
        status: 200, // Return 200 to not break the UI
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
