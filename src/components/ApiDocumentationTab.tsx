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
import { getApiBaseUrl } from "@/lib/apiBase";

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
        aria-label="Copy"
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
  const { t } = useLanguage();
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
            <h4 className="text-sm font-semibold mb-2">{t("参数", "Parameters")}</h4>
            <div className="border rounded-lg overflow-hidden hidden md:block">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-2">{t("参数名", "Param Name")}</th>
                    <th className="text-left p-2">{t("类型", "Type")}</th>
                    <th className="text-left p-2">{t("必填", "Required")}</th>
                    <th className="text-left p-2">{t("说明", "Description")}</th>
                  </tr>
                </thead>
                <tbody>
                  {params.map((param, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="p-2 font-mono text-xs">{param.name}</td>
                      <td className="p-2">{param.type}</td>
                      <td className="p-2">
                        <Badge variant={param.required ? "default" : "secondary"}>
                          {param.required ? t("是", "Yes") : t("否", "No")}
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
                      {param.required ? t("必填", "Required") : t("可选", "Optional")}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{param.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}
        <div>
          <h4 className="text-sm font-semibold mb-2">{t("响应示例", "Response Example")}</h4>
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

  const apiBaseTrim = getApiBaseUrl().replace(/\/$/, "");
  const nodeApiBase = apiBaseTrim || "(当前页同源，或未配置 VITE_API_BASE)";
  /** 与后端 `app.use('/api/...')` 一致；未配置 VITE_API_BASE 时浏览器用相对路径 /api */
  const restApiBase = apiBaseTrim ? `${apiBaseTrim}/api` : "/api";

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
                  <CodeBlock code={`X-API-Key: fast_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`} language="text" />
                  <p className="text-sm text-muted-foreground mt-2">
                    {t(
                      "密钥必须以 fast_ 开头（与控制台生成的格式一致）。也可在查询参数中传递 api_key=…（不推荐写入日志或分享链接）。",
                      'Keys must start with fast_ (same as keys generated in the console). You may also pass api_key=… as a query parameter (avoid logging or sharing URLs).'
                    )}
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">{t("权限范围", "Permission scopes")}</h4>
                  <p className="text-sm text-muted-foreground mb-2">
                    {t(
                      "在 API 管理中按分组勾选权限。网关别名：members↔member_management、activity_data↔activity、orders↔order_management、merchants↔merchant_management、referrals↔referral_management。活动类可细分为 activity_summary（仅汇总）、activity_list（仅活动行）、gift_records（仅赠送）、points_ledger（仅积分流水）。订单可细分为 order_list、order_detail、order_stats。勾选「全部权限」为 all。",
                      'Assign grouped scopes in API Management. Aliases: members↔member_management, activity_data↔activity, orders↔order_management, merchants↔merchant_management, referrals↔referral_management. Activity: activity_summary, activity_list, gift_records, points_ledger. Orders: order_list, order_detail, order_stats. "All permissions" is all.'
                    )}
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">{t("获取 API Key", "Get API Key")}</h4>
                  <p className="text-sm text-muted-foreground">
                    {t(
                      "请在系统设置 → API 管理中创建和管理 API Key。每个 Key 可配置独立的权限、IP 白名单、过期时间与频率限制；创建成功后明文仅显示一次，请立即保存。",
                      "Create and manage API Keys in System Settings → API Management. Each key supports permissions, IP whitelist, expiry, and rate limits; the plain secret is shown only once—save it immediately."
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
                <CardTitle>{t("Base URL（Node / MySQL API）", "Base URL (Node / MySQL API)")}</CardTitle>
                <CardDescription>
                  {t(
                    "数据与认证均由本系统 Node 服务 + MySQL 提供。REST 入口为同源 /api/... 或 VITE_API_BASE + /api；员工表数据走 /api/data/table/…（Bearer 员工 JWT）。",
                    'Data and auth are served by this Node API and MySQL only. REST lives at same-origin /api/... or VITE_API_BASE + /api; staff table access uses /api/data/table/… with a staff Bearer JWT.'
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="text-sm font-semibold mb-2">{t("REST 根路径", "REST base path")}</h4>
                  <CodeBlock code={restApiBase} language="text" />
                  <p className="text-xs text-muted-foreground mt-2">
                    {t("示例：", "Example: ")}{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-[11px]">{`${restApiBase}/members?page=1&limit=20`}</code>
                    {t(
                      "。需 Header：Authorization: Bearer 加员工登录返回的 JWT（先 POST /api/auth/login）。",
                      '. Send Header Authorization: Bearer with the JWT from POST /api/auth/login.'
                    )}
                  </p>
                </div>
                <div>
                  <h4 className="text-sm font-semibold mb-2">{t("表代理（员工 Token）", "Table proxy (staff token)")}</h4>
                  <CodeBlock code={nodeApiBase} language="text" />
                  <p className="text-xs text-muted-foreground mt-2">
                    {t(
                      "路径形如 /api/data/table/…，需 Bearer 员工 JWT。",
                      'Paths like /api/data/table/… require a staff Bearer JWT.'
                    )}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="endpoints" className="mt-6">
          <ScrollArea className="h-[600px] pr-4">
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Badge>{t("会员", "Member")}</Badge> {t("会员数据接口", "Member Endpoints")}
                </h3>
                <EndpointCard
                  method="GET"
                  path="/members"
                  description={t("获取会员列表（与 /members/list 相同），支持分页与 search 关键词", "Member list (same as /members/list), pagination and search")}
                  params={[
                    { name: "page", type: "number", required: false, description: t("页码，默认 1", "Page number, default 1") },
                    { name: "limit", type: "number", required: false, description: t("每页数量，默认 50，最大 100", "Items per page, default 50, max 100") },
                    { name: "search", type: "string", required: false, description: t("模糊匹配会员编号或手机号", "Fuzzy match member code or phone") },
                  ]}
                  response={`{
  "success": true,
  "data": {
    "data": [
      {
        "id": "uuid",
        "member_code": "ABC1234",
        "phone_number": "08012345678",
        "member_level": "普通会员",
        "created_at": "2024-01-27T10:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 100,
      "total_pages": 2
    }
  }
}`}
                />
                <EndpointCard
                  method="GET"
                  path="/members/detail"
                  description={t("获取单个会员详情（须提供 member_id、member_code 或 phone 之一）", "Member detail; pass one of member_id, member_code, or phone")}
                  params={[
                    { name: "member_id", type: "string", required: false, description: t("会员 UUID", "Member UUID") },
                    { name: "member_code", type: "string", required: false, description: t("会员编号", "Member code") },
                    { name: "phone", type: "string", required: false, description: t("手机号（仅数字）", "Phone digits only") },
                  ]}
                  response={`{
  "success": true,
  "data": {
    "member": {
      "id": "uuid",
      "member_code": "ABC1234",
      "phone_number": "08012345678",
      "member_level": "普通会员",
      "currency_preferences": {},
      "remark": null,
      "created_at": "2024-01-27T10:00:00Z"
    },
    "activity": null,
    "points_account": null
  }
}`}
                />
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Badge>{t("活动", "Activity")}</Badge> {t("活动数据接口", "Activity Endpoints")}
                </h3>
                <EndpointCard
                  method="GET"
                  path="/activity/summary"
                  description={t("全库活动汇总（与 /activity 相同）：按 member_activity 聚合与 activity_gifts 条数", "Global activity summary (same as /activity): aggregates member_activity and gift count")}
                  params={[
                    { name: "start_date", type: "string", required: false, description: t("赠送记录开始日期", "Gift records start date") },
                    { name: "end_date", type: "string", required: false, description: t("赠送记录结束日期", "Gift records end date") },
                  ]}
                  response={`{
  "success": true,
  "data": {
    "member_activity_summary": {
      "total_members": 10,
      "total_accumulated_ngn": 0,
      "total_accumulated_ghs": 0,
      "total_accumulated_usdt": 0,
      "total_gift_ngn": 0,
      "total_gift_ghs": 0,
      "total_gift_usdt": 0,
      "total_accumulated_profit": 0,
      "total_referral_count": 0
    },
    "total_gift_records": 0,
    "query_period": { "start_date": null, "end_date": null }
  }
}`}
                />
                <EndpointCard
                  method="GET"
                  path="/activity/list"
                  description={t("会员活动行列表（member_activity），支持 search 按手机号模糊查", "Paginated member_activity rows; search filters phone")}
                  params={[
                    { name: "search", type: "string", required: false, description: t("手机号模糊", "Phone fuzzy search") },
                    { name: "page", type: "number", required: false, description: t("页码", "Page number") },
                    { name: "limit", type: "number", required: false, description: t("每页条数，最大 100", "Page size, max 100") },
                  ]}
                  response={`{
  "success": true,
  "data": {
    "data": [],
    "pagination": { "page": 1, "limit": 50, "total": 0, "total_pages": 0 }
  }
}`}
                />
                <EndpointCard
                  method="GET"
                  path="/activity/gifts"
                  description={t("活动赠送记录（activity_gifts）", "Activity gift records (activity_gifts)")}
                  params={[
                    { name: "phone", type: "string", required: false, description: t("按电话号码精确筛选", "Exact phone filter") },
                    { name: "start_date", type: "string", required: false, description: t("开始日期", "Start date") },
                    { name: "end_date", type: "string", required: false, description: t("结束日期", "End date") },
                    { name: "page", type: "number", required: false, description: t("页码，默认 1", "Page number, default 1") },
                    { name: "limit", type: "number", required: false, description: t("每页数量，默认 50", "Items per page, default 50") },
                  ]}
                  response={`{
  "success": true,
  "data": {
    "data": [
      {
        "id": "uuid",
        "phone_number": "08012345678",
        "currency": "NGN",
        "amount": 5000,
        "gift_type": "activity_1",
        "created_at": "2024-01-27T10:00:00Z"
      }
    ],
    "pagination": { "page": 1, "limit": 50, "total": 10, "total_pages": 1 }
  }
}`}
                />
                <EndpointCard
                  method="GET"
                  path="/activity/points"
                  description={t("积分流水（points_ledger）", "Points ledger (points_ledger)")}
                  params={[
                    { name: "phone", type: "string", required: false, description: t("按电话号码筛选", "Filter by phone") },
                    { name: "member_code", type: "string", required: false, description: t("按会员编号筛选", "Filter by member code") },
                    { name: "page", type: "number", required: false, description: t("页码", "Page number") },
                    { name: "limit", type: "number", required: false, description: t("每页数量", "Items per page") },
                  ]}
                  response={`{
  "success": true,
  "data": {
    "data": [
      {
        "id": "uuid",
        "member_code": "ABC1234",
        "phone_number": "08012345678",
        "points_earned": 10,
        "transaction_type": "consumption",
        "status": "issued",
        "created_at": "2024-01-27T10:00:00Z"
      }
    ],
    "pagination": { "page": 1, "limit": 50, "total": 50, "total_pages": 1 }
  }
}`}
                />
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Badge>{t("订单", "Order")}</Badge> {t("订单数据接口", "Order Endpoints")}
                </h3>
                <EndpointCard
                  method="GET"
                  path="/orders"
                  description={t("订单列表（与 /orders/list 相同），不含已软删订单", "Order list (same as /orders/list), excludes deleted")}
                  params={[
                    { name: "phone", type: "string", required: false, description: t("按电话号码筛选", "Filter by phone") },
                    { name: "status", type: "string", required: false, description: t("订单状态", "Order status") },
                    { name: "start_date", type: "string", required: false, description: t("开始日期", "Start date") },
                    { name: "end_date", type: "string", required: false, description: t("结束日期", "End date") },
                    { name: "page", type: "number", required: false, description: t("页码", "Page number") },
                    { name: "limit", type: "number", required: false, description: t("每页数量，最大 100", "Page size, max 100") },
                  ]}
                  response={`{
  "success": true,
  "data": {
    "data": [
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
    "pagination": { "page": 1, "limit": 50, "total": 200, "total_pages": 4 }
  }
}`}
                />
                <EndpointCard
                  method="GET"
                  path="/orders/detail"
                  description={t("订单详情（order_id 或 order_number 二选一）", "Order detail: order_id or order_number")}
                  params={[
                    { name: "order_id", type: "string", required: false, description: t("订单 UUID", "Order UUID") },
                    { name: "order_number", type: "string", required: false, description: t("业务单号", "Business order number") },
                  ]}
                  response={`{
  "success": true,
  "data": {
    "order": {
      "id": "uuid",
      "order_number": "ABC123456789",
      "phone_number": "08012345678",
      "currency": "NGN",
      "amount": 50000,
      "status": "completed",
      "created_at": "2024-01-27T10:00:00Z"
    }
  }
}`}
                />
                <EndpointCard
                  method="GET"
                  path="/orders/stats"
                  description={t("订单统计（按完成单汇总金额与利润等）", "Order stats from completed orders")}
                  params={[
                    { name: "start_date", type: "string", required: false, description: t("开始日期", "Start date") },
                    { name: "end_date", type: "string", required: false, description: t("结束日期", "End date") },
                  ]}
                  response={`{
  "success": true,
  "data": {
    "stats": {
      "total_orders": 500,
      "completed_orders": 400,
      "pending_orders": 50,
      "cancelled_orders": 50,
      "total_amount": 25000000,
      "total_profit_usdt": 1000,
      "total_profit_ngn": 0,
      "by_currency": {
        "NGN": { "count": 300, "amount": 15000000 }
      }
    },
    "query_period": { "start_date": null, "end_date": null }
  }
}`}
                />
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Badge>{t("商家", "Merchant")}</Badge> {t("商家数据接口", "Merchant Endpoints")}
                </h3>
                <p className="text-sm text-muted-foreground mb-2">
                  {t(
                    "无单独 /merchants 路径；请使用下列子路径。",
                    "There is no bare /merchants path; use the subpaths below."
                  )}
                </p>
                <EndpointCard
                  method="GET"
                  path="/merchants/vendors"
                  description={t("获取卡商列表", "Get card vendor list")}
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
                  description={t("获取代付商家列表", "Get payment provider list")}
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
                  <Badge>{t("推荐", "Referral")}</Badge> {t("推荐关系接口", "Referral Endpoints")}
                </h3>
                <EndpointCard
                  method="GET"
                  path="/referrals"
                  description={t("获取推荐关系列表", "Get referral relationship list")}
                  params={[
                    { name: "referrer_phone", type: "string", required: false, description: t("推荐人电话", "Referrer phone") },
                    { name: "referee_phone", type: "string", required: false, description: t("被推荐人电话", "Referee phone") },
                    { name: "page", type: "number", required: false, description: t("页码", "Page number") },
                    { name: "limit", type: "number", required: false, description: t("每页数量", "Items per page") },
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
                    code={`// ${t("请求头", "Request Headers")}
X-Webhook-Signature: sha256=xxxxx

// ${t("验证方式 (Node.js 示例)", "Verification (Node.js Example)")}
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
                    { event: "order.created", desc: t("订单创建时触发", "Triggered when an order is created") },
                    { event: "order.completed", desc: t("订单完成/恢复时触发", "Triggered when an order is completed/restored") },
                    { event: "order.cancelled", desc: t("订单取消时触发", "Triggered when an order is cancelled") },
                    { event: "member.created", desc: t("会员创建时触发", "Triggered when a member is created") },
                    { event: "member.updated", desc: t("会员信息更新时触发", "Triggered when member info is updated") },
                    { event: "points.issued", desc: t("积分发放时触发", "Triggered when points are issued") },
                    { event: "points.redeemed", desc: t("积分兑换时触发", "Triggered when points are redeemed") },
                    { event: "gift.created", desc: t("活动赠送创建时触发", "Triggered when an activity gift is created") },
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
                      { status: 400, code: "BAD_REQUEST", desc: t("请求参数错误", "Bad request parameters") },
                      { status: 400, code: "MISSING_IDENTIFIER", desc: t("会员详情缺少 member_id / member_code / phone", "Member detail missing identifier") },
                      { status: 400, code: "MISSING_ORDER_IDENTIFIER", desc: t("订单详情缺少 order_id / order_number", "Order detail missing identifier") },
                      { status: 401, code: "INVALID_KEY_FORMAT", desc: t("密钥格式错误（须以 fast_ 开头）", "Invalid key format (must start with fast_)") },
                      { status: 401, code: "VALIDATION_ERROR", desc: t("校验过程失败（如数据库 RPC 未配置）", "Validation failed (e.g. RPC not configured)") },
                      { status: 401, code: "INVALID_KEY", desc: t("API Key 无效", "Invalid API Key") },
                      { status: 403, code: "KEY_DISABLED", desc: t("API Key 已禁用", "API Key disabled") },
                      { status: 403, code: "KEY_EXPIRED", desc: t("API Key 已过期", "API Key expired") },
                      { status: 403, code: "IP_NOT_ALLOWED", desc: t("IP 不在白名单中", "IP not in whitelist") },
                      { status: 403, code: "PERMISSION_DENIED", desc: t("没有访问该端点的权限", "No permission for this endpoint") },
                      { status: 404, code: "NOT_FOUND", desc: t("资源不存在", "Resource not found") },
                      { status: 404, code: "ENDPOINT_NOT_FOUND", desc: t("路径不在支持列表中", "Path not in supported list") },
                      { status: 404, code: "MEMBER_NOT_FOUND", desc: t("未找到会员", "Member not found") },
                      { status: 404, code: "ORDER_NOT_FOUND", desc: t("未找到订单", "Order not found") },
                      { status: 429, code: "RATE_LIMIT_EXCEEDED", desc: t("超出频率限制", "Rate limit exceeded") },
                      { status: 500, code: "INTERNAL_ERROR", desc: t("服务器内部错误", "Internal server error") },
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
                  code={`# ${t("获取会员列表", "Get member list")}（${t("先登录拿到 JWT", "get JWT from login first")}）
curl -X GET "${restApiBase}/members?page=1&limit=20" \\
  -H "Authorization: Bearer YOUR_STAFF_JWT" \\
  -H "Content-Type: application/json"

# ${t("获取会员详情", "Get member details")}
curl -X GET "${restApiBase}/members/detail?member_code=ABC1234" \\
  -H "Authorization: Bearer YOUR_STAFF_JWT"

# ${t("获取订单统计", "Get order statistics")}
curl -X GET "${restApiBase}/orders/stats?start_date=2024-01-01&end_date=2024-01-31" \\
  -H "Authorization: Bearer YOUR_STAFF_JWT"`}
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
                  code={`const STAFF_JWT = 'YOUR_STAFF_JWT';
const BASE_URL = '${restApiBase}';

async function getMembers(page = 1, limit = 20) {
  const response = await fetch(
    \`\${BASE_URL}/members?page=\${page}&limit=\${limit}\`,
    {
      headers: {
        Authorization: \`Bearer \${STAFF_JWT}\`,
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

// ${t("使用示例", "Usage example")}
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

STAFF_JWT = 'YOUR_STAFF_JWT'
BASE_URL = '${restApiBase}'

def get_members(page=1, limit=20):
    response = requests.get(
        f'{BASE_URL}/members',
        params={'page': page, 'limit': limit},
        headers={
            'Authorization': f'Bearer {STAFF_JWT}',
            'Content-Type': 'application/json'
        }
    )
    response.raise_for_status()
    return response.json()

# ${t("使用示例", "Usage example")}
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
