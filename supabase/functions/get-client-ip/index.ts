import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get the client IP from various headers
    // Cloudflare / most proxies use these headers
    const cfConnectingIp = req.headers.get('cf-connecting-ip');
    const xForwardedFor = req.headers.get('x-forwarded-for');
    const xRealIp = req.headers.get('x-real-ip');
    
    // Parse x-forwarded-for (can contain multiple IPs separated by comma)
    let clientIp = cfConnectingIp || xRealIp;
    
    if (!clientIp && xForwardedFor) {
      // Take the first IP in the chain (original client)
      clientIp = xForwardedFor.split(',')[0].trim();
    }
    
    // Fallback to direct connection info if available
    if (!clientIp) {
      clientIp = 'unknown';
    }

    console.log('[get-client-ip] Detected IP:', clientIp, {
      cfConnectingIp,
      xForwardedFor,
      xRealIp,
    });

    return new Response(
      JSON.stringify({ 
        ip: clientIp,
        timestamp: new Date().toISOString(),
      }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );
  } catch (error: unknown) {
    console.error('[get-client-ip] Error:', error);
    return new Response(
      JSON.stringify({ 
        ip: 'unknown', 
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        status: 200,  // Return 200 even on error to not block login
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );
  }
});
