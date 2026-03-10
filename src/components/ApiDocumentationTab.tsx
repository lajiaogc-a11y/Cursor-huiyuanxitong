// ============= API Documentation Tab =============
// 提供外部 API 文档，供第三方开发者参考

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Copy, Check, ExternalLink, Shield, Zap, Webhook } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useIsMobile, useIsTablet } from "@/hooks/use-mobile";

interface CodeBlockProps {
  code: string;
  language?: string;
}

function CodeBlock({ code, language = "json" }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative">
      <pre className="bg-muted rounded-lg p-4 overflow-x-auto text-sm">
        <code className={`language-${language}`}>{code}</code>
      </pre>
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 h-8 w-8"
        onClick={handleCopy}
      >
        {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );
}

interface EndpointCardProps {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  description: string;
  params?: { name: string; type: string; required: boolean; description: string }[];
  response: string;
}

function EndpointCard({ method, path, description, params, response }: EndpointCardProps) {
  const methodColors = {
    GET: "bg-primary/10 text-primary border-primary/20",
    POST: "bg-accent text-accent-foreground border-accent",
    PUT: "bg-secondary text-secondary-foreground border-secondary",
    DELETE: "bg-destructive/10 text-destructive border-destructive/20",
  };

  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-3">
          <Badge className={methodColors[method]}>{method}</Badge>
          <code className="text-sm font-mono bg-muted px-2 py-1 rounded">{path}</code>
        </div>
        <CardDescription className="mt-2">{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {params && params.length > 0 && (
          <div className="mb-4">
            <h4 className="text-sm font-semibold mb-2">参数</h4>
            <div className="border rounded-lg overflow-hidden hidden md:block">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-2">参数名</th>
                    <th className="text-left p-2">类型</th>
                    <th className="text-left p-2">必填</th>
                    <th className="text-left p-2">说明</th>
                  </tr>
                </thead>
                <tbody>
                  {params.map((param, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="p-2 font-mono text-xs">{param.name}</td>
                      <td className="p-2">{param.type}</td>
                      <td className="p-2">
                        <Badge variant={param.required ? "default" : "secondary"}>
                          {param.required ? "是" : "否"}
                        </Badge>
                      </td>
                      <td className="p-2 text-muted-foreground">{param.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Mobile: stacked params */}
            <div className="space-y-2 md:hidden">
              {params.map((param, idx) => (
                <div key={idx} className="border rounded-lg p-2.5 space-y-1">
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{param.name}</code>
                    <span className="text-xs text-muted-foreground">{param.type}</span>
                    <Badge variant={param.required ? "default" : "secondary"} className="text-[10px]">
                      {param.required ? "必填" : "可选"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{param.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}
        <div>
          <h4 className="text-sm font-semibold mb-2">响应示例</h4>
          <CodeBlock code={response} />
        </div>
      </CardContent>
    </Card>
  );
}

export function ApiDocumentationTab() {
  const { t } = useLanguage();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const useCompactLayout = isMobile || isTablet;
  const [activeSection, setActiveSection] = useState("auth");

  const baseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/external-api`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{t("API 开发者文档", "API Developer Documentation")}</h2>
          <p className="text-muted-foreground mt-1">
            {t("第三方系统集成指南", "Integration guide for third-party systems")}
          </p>
        </div>
        <Badge variant="outline" className="gap-2">
          <span className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
          API v1.0
        </Badge>
      </div>

      <Tabs value={activeSection} onValueChange={setActiveSection}>
        {useCompactLayout ? (
          <Select value={activeSection} onValueChange={setActiveSection}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auth">{t("认证", "Auth")}</SelectItem>
              <SelectItem value="endpoints">{t("端点", "Endpoints")}</SelectItem>
              <SelectItem value="webhooks">{t("Webhook", "Webhooks")}</SelectItem>
              <SelectItem value="errors">{t("错误码", "Errors")}</SelectItem>
              <SelectItem value="examples">{t("示例", "Examples")}</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="auth" className="gap-2">
              <Shield className="h-4 w-4" />
              {t("认证", "Auth")}
            </TabsTrigger>
            <TabsTrigger value="endpoints" className="gap-2">
              <Zap className="h-4 w-4" />
              {t("端点", "Endpoints")}
            </TabsTrigger>
            <TabsTrigger value="webhooks" className="gap-2">
              <Webhook className="h-4 w-4" />
              {t("Webhook", "Webhooks")}
            </TabsTrigger>
            <TabsTrigger value="errors">{t("错误码", "Errors")}</TabsTrigger>
            <TabsTrigger value="examples">{t("示例", "Examples")}</TabsTrigger>
          </TabsList>
        )}

        <TabsContent value="auth" className="mt-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t("认证方式", "Authentication")}</CardTitle>
                <CardDescription>
                  {t("所有 API 请求必须携带有效的 API Key", "All API requests require a valid API Key")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-semibold mb-2">{t("请求头格式", "Header Format")}</h4>
                  <CodeBlock code={`X-API-Key: fgc_xxxxxxxxxxxxxxxx`} language="text" />
                </div>
                <div>
                  <h4 className="font-semibold mb-2">{t("获取 API Key", "Get API Key")}</h4>
                  <p className="text-sm text-muted-foreground">
                    {t(
                      "请在系统设置 → API 管理中创建和管理 API Key。每个 Key 可配置独立的权限和频率限制。",
                      "Create and manage API Keys in System Settings → API Management. Each key can have independent permissions and rate limits."
                    )}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("频率限制", "Rate Limiting")}</CardTitle>
                <CardDescription>
                  {t("默认限制：60 次/分钟", "Default limit: 60 requests per minute")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-semibold mb-2">{t("响应头", "Response Headers")}</h4>
                  <CodeBlock
                    code={`X-RateLimit-Remaining: 58
X-RateLimit-Reset: 2024-01-27T10:00:00Z`}
                    language="text"
                  />
                </div>
                <div>
                  <h4 className="font-semibold mb-2">{t("超出限制", "Exceeded Limit")}</h4>
                  <p className="text-sm text-muted-foreground">
                    {t(
                      "超出频率限制将返回 429 Too Many Requests 错误。",
                      "Exceeding the rate limit will return a 429 Too Many Requests error."
                    )}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>{t("Base URL", "Base URL")}</CardTitle>
              </CardHeader>
              <CardContent>
                <CodeBlock code={baseUrl} language="text" />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="endpoints" className="mt-6">
          <ScrollArea className="h-[600px] pr-4">
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Badge>会员</Badge> {t("会员数据接口", "Member Endpoints")}
                </h3>
                <EndpointCard
                  method="GET"
                  path="/members"
                  description="获取会员列表，支持分页和搜索"
                  params={[
                    { name: "page", type: "number", required: false, description: "页码，默认 1" },
                    { name: "limit", type: "number", required: false, description: "每页数量，默认 20，最大 100" },
                    { name: "phone", type: "string", required: false, description: "按电话号码搜索" },
                    { name: "code", type: "string", required: false, description: "按会员编号搜索" },
                  ]}
                  response={`{
  "success": true,
  "data": {
    "members": [
      {
        "id": "uuid",
        "phone_number": "08012345678",
        "member_code": "ABC1234",
        "member_level": "普通会员",
        "created_at": "2024-01-27T10:00:00Z"
      }
    ],
    "total": 100,
    "page": 1,
    "limit": 20
  }
}`}
                />
                <EndpointCard
                  method="GET"
                  path="/members/detail"
                  description="获取单个会员详情"
                  params={[
                    { name: "phone", type: "string", required: true, description: "会员电话号码" },
                  ]}
                  response={`{
  "success": true,
  "data": {
    "id": "uuid",
    "phone_number": "08012345678",
    "member_code": "ABC1234",
    "member_level": "普通会员",
    "currency_preferences": ["NGN", "GHS"],
    "common_cards": ["card_id_1"],
    "remark": "VIP客户",
    "created_at": "2024-01-27T10:00:00Z"
  }
}`}
                />
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Badge>活动</Badge> {t("活动数据接口", "Activity Endpoints")}
                </h3>
                <EndpointCard
                  method="GET"
                  path="/activity/summary"
                  description="获取会员活动数据汇总"
                  params={[
                    { name: "phone", type: "string", required: true, description: "会员电话号码" },
                  ]}
                  response={`{
  "success": true,
  "data": {
    "remaining_points": 150,
    "accumulated_points": 500,
    "referral_points": 50,
    "total_gift_ngn": 10000,
    "total_gift_ghs": 500,
    "total_gift_usdt": 100
  }
}`}
                />
                <EndpointCard
                  method="GET"
                  path="/activity/gifts"
                  description="获取活动赠送记录"
                  params={[
                    { name: "phone", type: "string", required: false, description: "按电话号码筛选" },
                    { name: "page", type: "number", required: false, description: "页码，默认 1" },
                    { name: "limit", type: "number", required: false, description: "每页数量，默认 20" },
                  ]}
                  response={`{
  "success": true,
  "data": {
    "gifts": [
      {
        "id": "uuid",
        "phone_number": "08012345678",
        "currency": "NGN",
        "amount": 5000,
        "gift_value": 50,
        "gift_type": "activity_1",
        "created_at": "2024-01-27T10:00:00Z"
      }
    ],
    "total": 10
  }
}`}
                />
                <EndpointCard
                  method="GET"
                  path="/activity/points"
                  description="获取积分明细"
                  params={[
                    { name: "phone", type: "string", required: false, description: "按电话号码筛选" },
                    { name: "code", type: "string", required: false, description: "按会员编号筛选" },
                    { name: "type", type: "string", required: false, description: "积分类型: consumption, referral_1, referral_2" },
                    { name: "page", type: "number", required: false, description: "页码" },
                    { name: "limit", type: "number", required: false, description: "每页数量" },
                  ]}
                  response={`{
  "success": true,
  "data": {
    "points": [
      {
        "id": "uuid",
        "member_code": "ABC1234",
        "phone_number": "08012345678",
        "transaction_type": "consumption",
        "points_earned": 10,
        "status": "issued",
        "created_at": "2024-01-27T10:00:00Z"
      }
    ],
    "total": 50
  }
}`}
                />
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Badge>订单</Badge> {t("订单数据接口", "Order Endpoints")}
                </h3>
                <EndpointCard
                  method="GET"
                  path="/orders"
                  description="获取订单列表"
                  params={[
                    { name: "phone", type: "string", required: false, description: "按电话号码筛选" },
                    { name: "currency", type: "string", required: false, description: "按币种筛选: NGN, GHS, USDT" },
                    { name: "status", type: "string", required: false, description: "订单状态: completed, cancelled" },
                    { name: "start_date", type: "string", required: false, description: "开始日期 (ISO 格式)" },
                    { name: "end_date", type: "string", required: false, description: "结束日期 (ISO 格式)" },
                    { name: "page", type: "number", required: false, description: "页码" },
                    { name: "limit", type: "number", required: false, description: "每页数量" },
                  ]}
                  response={`{
  "success": true,
  "data": {
    "orders": [
      {
        "id": "uuid",
        "order_number": "ABC123456789",
        "phone_number": "08012345678",
        "currency": "NGN",
        "amount": 50000,
        "actual_payment": 48000,
        "status": "completed",
        "created_at": "2024-01-27T10:00:00Z"
      }
    ],
    "total": 200
  }
}`}
                />
                <EndpointCard
                  method="GET"
                  path="/orders/stats"
                  description="获取订单统计数据"
                  params={[
                    { name: "start_date", type: "string", required: false, description: "开始日期" },
                    { name: "end_date", type: "string", required: false, description: "结束日期" },
                    { name: "currency", type: "string", required: false, description: "按币种筛选" },
                  ]}
                  response={`{
  "success": true,
  "data": {
    "total_orders": 500,
    "total_amount": 25000000,
    "total_profit": 500000,
    "by_currency": {
      "NGN": { "count": 300, "amount": 15000000 },
      "GHS": { "count": 150, "amount": 8000000 },
      "USDT": { "count": 50, "amount": 2000000 }
    }
  }
}`}
                />
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Badge>商家</Badge> {t("商家数据接口", "Merchant Endpoints")}
                </h3>
                <EndpointCard
                  method="GET"
                  path="/merchants/vendors"
                  description="获取卡商列表"
                  params={[]}
                  response={`{
  "success": true,
  "data": {
    "vendors": [
      {
        "id": "uuid",
        "name": "卡商A",
        "status": "active"
      }
    ]
  }
}`}
                />
                <EndpointCard
                  method="GET"
                  path="/merchants/providers"
                  description="获取代付商家列表"
                  params={[]}
                  response={`{
  "success": true,
  "data": {
    "providers": [
      {
        "id": "uuid",
        "name": "代付商A",
        "status": "active"
      }
    ]
  }
}`}
                />
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Badge>推荐</Badge> {t("推荐关系接口", "Referral Endpoints")}
                </h3>
                <EndpointCard
                  method="GET"
                  path="/referrals"
                  description="获取推荐关系列表"
                  params={[
                    { name: "referrer_phone", type: "string", required: false, description: "推荐人电话" },
                    { name: "referee_phone", type: "string", required: false, description: "被推荐人电话" },
                    { name: "page", type: "number", required: false, description: "页码" },
                    { name: "limit", type: "number", required: false, description: "每页数量" },
                  ]}
                  response={`{
  "success": true,
  "data": {
    "referrals": [
      {
        "id": "uuid",
        "referrer_phone": "08012345678",
        "referrer_member_code": "ABC1234",
        "referee_phone": "08087654321",
        "referee_member_code": "XYZ9876",
        "created_at": "2024-01-27T10:00:00Z"
      }
    ],
    "total": 30
  }
}`}
                />
              </div>
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="webhooks" className="mt-6">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{t("Webhook 概述", "Webhook Overview")}</CardTitle>
                <CardDescription>
                  {t(
                    "Webhook 用于在业务事件发生时主动推送通知到您的服务器",
                    "Webhooks push notifications to your server when business events occur"
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-semibold mb-2">{t("签名验证", "Signature Verification")}</h4>
                  <p className="text-sm text-muted-foreground mb-2">
                    {t(
                      "每个 Webhook 请求都包含 HMAC-SHA256 签名，用于验证请求来源。",
                      "Each webhook request includes an HMAC-SHA256 signature to verify the source."
                    )}
                  </p>
                  <CodeBlock
                    code={`// 请求头
X-Webhook-Signature: sha256=xxxxx

// 验证方式 (Node.js 示例)
const crypto = require('crypto');
const expectedSignature = 'sha256=' + crypto
  .createHmac('sha256', webhookSecret)
  .update(JSON.stringify(payload))
  .digest('hex');

if (signature !== expectedSignature) {
  throw new Error('Invalid signature');
}`}
                    language="javascript"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("支持的事件类型", "Supported Event Types")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  {[
                    { event: "order.created", desc: "订单创建时触发" },
                    { event: "order.completed", desc: "订单完成/恢复时触发" },
                    { event: "order.cancelled", desc: "订单取消时触发" },
                    { event: "member.created", desc: "会员创建时触发" },
                    { event: "member.updated", desc: "会员信息更新时触发" },
                    { event: "points.issued", desc: "积分发放时触发" },
                    { event: "points.redeemed", desc: "积分兑换时触发" },
                    { event: "gift.created", desc: "活动赠送创建时触发" },
                  ].map((item) => (
                    <div key={item.event} className="flex items-center gap-3 p-3 border rounded-lg">
                      <Badge variant="outline" className="font-mono">
                        {item.event}
                      </Badge>
                      <span className="text-sm text-muted-foreground">{item.desc}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("Payload 示例", "Payload Example")}</CardTitle>
              </CardHeader>
              <CardContent>
                <CodeBlock
                  code={`{
  "event": "order.created",
  "timestamp": "2024-01-27T10:00:00Z",
  "data": {
    "order_id": "uuid",
    "order_number": "ABC123456789",
    "phone_number": "08012345678",
    "member_code": "ABC1234",
    "currency": "NGN",
    "amount": 50000,
    "actual_payment": 48000,
    "status": "completed",
    "created_at": "2024-01-27T10:00:00Z"
  }
}`}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("重试策略", "Retry Policy")}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground">
                  <li>{t("最大重试次数: 3 次", "Maximum retries: 3 times")}</li>
                  <li>{t("重试间隔: 指数退避 (1分钟 → 2分钟 → 4分钟)", "Retry interval: Exponential backoff (1m → 2m → 4m)")}</li>
                  <li>{t("超时时间: 10 秒", "Timeout: 10 seconds")}</li>
                  <li>{t("成功状态码: 2xx", "Success status: 2xx")}</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="errors" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("错误码说明", "Error Codes")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left p-3">{t("HTTP 状态码", "HTTP Status")}</th>
                      <th className="text-left p-3">{t("错误码", "Error Code")}</th>
                      <th className="text-left p-3">{t("说明", "Description")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { status: 400, code: "BAD_REQUEST", desc: "请求参数错误" },
                      { status: 401, code: "MISSING_API_KEY", desc: "缺少 API Key" },
                      { status: 401, code: "INVALID_KEY", desc: "API Key 无效" },
                      { status: 401, code: "KEY_DISABLED", desc: "API Key 已禁用" },
                      { status: 401, code: "KEY_EXPIRED", desc: "API Key 已过期" },
                      { status: 403, code: "IP_NOT_ALLOWED", desc: "IP 不在白名单中" },
                      { status: 403, code: "PERMISSION_DENIED", desc: "没有访问该端点的权限" },
                      { status: 404, code: "NOT_FOUND", desc: "资源不存在" },
                      { status: 429, code: "RATE_LIMIT_EXCEEDED", desc: "超出频率限制" },
                      { status: 500, code: "INTERNAL_ERROR", desc: "服务器内部错误" },
                    ].map((error, idx) => (
                      <tr key={idx} className="border-t">
                        <td className="p-3">
                          <Badge variant="outline">{error.status}</Badge>
                        </td>
                        <td className="p-3 font-mono text-xs">{error.code}</td>
                        <td className="p-3 text-muted-foreground">{error.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="examples" className="mt-6">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>cURL {t("示例", "Example")}</CardTitle>
              </CardHeader>
              <CardContent>
                <CodeBlock
                  code={`# 获取会员列表
curl -X GET "${baseUrl}/members?page=1&limit=20" \\
  -H "X-API-Key: fgc_your_api_key_here" \\
  -H "Content-Type: application/json"

# 获取会员详情
curl -X GET "${baseUrl}/members/detail?phone=08012345678" \\
  -H "X-API-Key: fgc_your_api_key_here"

# 获取订单统计
curl -X GET "${baseUrl}/orders/stats?start_date=2024-01-01&end_date=2024-01-31" \\
  -H "X-API-Key: fgc_your_api_key_here"`}
                  language="bash"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>JavaScript (Fetch) {t("示例", "Example")}</CardTitle>
              </CardHeader>
              <CardContent>
                <CodeBlock
                  code={`const API_KEY = 'fgc_your_api_key_here';
const BASE_URL = '${baseUrl}';

async function getMembers(page = 1, limit = 20) {
  const response = await fetch(
    \`\${BASE_URL}/members?page=\${page}&limit=\${limit}\`,
    {
      headers: {
        'X-API-Key': API_KEY,
        'Content-Type': 'application/json',
      },
    }
  );
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Request failed');
  }
  
  return response.json();
}

// 使用示例
getMembers(1, 20)
  .then(result => console.log(result.data))
  .catch(err => console.error(err));`}
                  language="javascript"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Python {t("示例", "Example")}</CardTitle>
              </CardHeader>
              <CardContent>
                <CodeBlock
                  code={`import requests

API_KEY = 'fgc_your_api_key_here'
BASE_URL = '${baseUrl}'

def get_members(page=1, limit=20):
    response = requests.get(
        f'{BASE_URL}/members',
        params={'page': page, 'limit': limit},
        headers={
            'X-API-Key': API_KEY,
            'Content-Type': 'application/json'
        }
    )
    response.raise_for_status()
    return response.json()

# 使用示例
result = get_members(page=1, limit=20)
print(result['data']['members'])`}
                  language="python"
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
