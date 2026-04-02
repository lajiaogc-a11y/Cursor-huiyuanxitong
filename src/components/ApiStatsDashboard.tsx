// ============= API Stats Dashboard Component =============
import { useApiStats } from '@/hooks/useWebhooks';
import { useApiKeys } from '@/hooks/useApiKeys';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';
import { Activity, TrendingUp, TrendingDown, Clock, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useIsMobile, useIsTablet } from '@/hooks/use-mobile';

export function ApiStatsDashboard() {
  const { t, language } = useLanguage();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const useCompactLayout = isMobile || isTablet;
  const [days, setDays] = useState('7');
  const { dailyStats, endpointStats, loading, refetch } = useApiStats(parseInt(days));
  const { keys } = useApiKeys();

  // Calculate summary data
  const totalRequests = dailyStats.reduce((sum, d) => sum + d.totalRequests, 0);
  const totalSuccess = dailyStats.reduce((sum, d) => sum + d.successfulRequests, 0);
  const totalFailed = dailyStats.reduce((sum, d) => sum + d.failedRequests, 0);
  const avgErrorRate = totalRequests > 0 ? (totalFailed / totalRequests * 100).toFixed(2) : '0';
  const avgResponseTime = dailyStats.length > 0 
    ? (dailyStats.reduce((sum, d) => sum + d.avgResponseTime, 0) / dailyStats.length).toFixed(0)
    : '0';

  // Prepare chart data (ascending by date)
  const chartData = [...dailyStats].reverse().map(d => ({
    date: format(new Date(d.statDate), 'MM/dd'),
    requests: d.totalRequests,
    success: d.successfulRequests,
    failed: d.failedRequests,
    errorRate: d.errorRate,
    avgTime: d.avgResponseTime,
  }));

  const handleRefresh = () => {
    refetch();
  };

  // Bilingual legend names
  const successLabel = t("成功", "Success");
  const failedLabel = t("失败", "Failed");

  if (loading) {
    return <div className="flex items-center justify-center h-64">{t("加载统计数据...", "Loading statistics...")}</div>;
  }

  return (
    <div className="space-y-6">
      {/* Top Control Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
            <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">{t("最近 7 天", "Last 7 days")}</SelectItem>
              <SelectItem value="14">{t("最近 14 天", "Last 14 days")}</SelectItem>
              <SelectItem value="30">{t("最近 30 天", "Last 30 days")}</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            {t("刷新", "Refresh")}
          </Button>
        </div>
        <div className="text-sm text-muted-foreground">
          {t("活跃 API Key", "Active API Keys")}: {keys.filter(k => k.status === 'active').length}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("总请求量", "Total Requests")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              <span className="text-2xl font-bold">{totalRequests.toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("成功请求", "Successful")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-primary" />
              <span className="text-2xl font-bold">{totalSuccess.toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("失败请求", "Failed")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <span className="text-2xl font-bold">{totalFailed.toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("错误率", "Error Rate")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              {Number(avgErrorRate) > 5 ? (
                <TrendingUp className="h-5 w-5 text-destructive" />
              ) : (
                <TrendingDown className="h-5 w-5 text-primary" />
              )}
              <span className="text-2xl font-bold">{avgErrorRate}%</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("平均响应", "Avg Response")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <span className="text-2xl font-bold">{avgResponseTime}ms</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Request Trend Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("请求量趋势", "Request Trend")}</CardTitle>
          <CardDescription>{t("每日 API 请求成功/失败统计", "Daily API request success/failure statistics")}</CardDescription>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-muted-foreground">
              {t("暂无数据", "No data")}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }}
                />
                <Legend />
                <Bar dataKey="success" name={successLabel} fill="hsl(var(--primary))" stackId="a" />
                <Bar dataKey="failed" name={failedLabel} fill="hsl(var(--destructive))" stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Error Rate and Response Time Trends */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("错误率趋势", "Error Rate Trend")}</CardTitle>
          </CardHeader>
          <CardContent>
            {chartData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground">
                {t("暂无数据", "No data")}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs" />
                  <YAxis className="text-xs" unit="%" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                    formatter={(value: number) => [`${value}%`, t('错误率', 'Error Rate')]}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="errorRate" 
                    stroke="hsl(var(--destructive))" 
                    strokeWidth={2}
                    dot={{ fill: 'hsl(var(--destructive))' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("响应时间趋势", "Response Time Trend")}</CardTitle>
          </CardHeader>
          <CardContent>
            {chartData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground">
                {t("暂无数据", "No data")}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs" />
                  <YAxis className="text-xs" unit="ms" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                    formatter={(value: number) => [`${value}ms`, t('响应时间', 'Response Time')]}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="avgTime" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={2}
                    dot={{ fill: 'hsl(var(--primary))' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Endpoint Statistics */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("接口调用统计", "Endpoint Statistics")}</CardTitle>
          <CardDescription>{t("各 API 端点的请求量和性能", "Request volume and performance by API endpoint")}</CardDescription>
        </CardHeader>
        {useCompactLayout ? (
          <CardContent className="space-y-3 pt-0">
            {endpointStats.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">{t("暂无接口调用记录", "No endpoint call records")}</div>
            ) : endpointStats.map((stat, idx) => {
              const successRate = stat.totalRequests > 0 ? ((stat.successfulRequests / stat.totalRequests) * 100).toFixed(1) : '0';
              return (
                <div key={idx} className="border rounded-lg p-3 space-y-1.5">
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded block truncate">{stat.endpoint}</code>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{t("总请求", "Total")}: {stat.totalRequests.toLocaleString()}</span>
                    <Badge variant={Number(successRate) >= 95 ? 'default' : 'destructive'}>{successRate}%</Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>✓ {stat.successfulRequests} / ✗ {stat.failedRequests}</span>
                    <span>{stat.avgResponseTime}ms</span>
                  </div>
                </div>
              );
            })}
          </CardContent>
        ) : (
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("接口", "Endpoint")}</TableHead>
                  <TableHead className="text-right">{t("总请求", "Total")}</TableHead>
                  <TableHead className="text-right">{t("成功", "Success")}</TableHead>
                  <TableHead className="text-right">{t("失败", "Failed")}</TableHead>
                  <TableHead className="text-right">{t("成功率", "Success Rate")}</TableHead>
                  <TableHead className="text-right">{t("平均响应", "Avg Response")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {endpointStats.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      {t("暂无接口调用记录", "No endpoint call records")}
                    </TableCell>
                  </TableRow>
                ) : (
                  endpointStats.map((stat, idx) => {
                    const successRate = stat.totalRequests > 0 
                      ? ((stat.successfulRequests / stat.totalRequests) * 100).toFixed(1)
                      : '0';
                    return (
                      <TableRow key={idx}>
                        <TableCell>
                          <code className="text-xs bg-muted px-2 py-1 rounded">{stat.endpoint}</code>
                        </TableCell>
                        <TableCell className="text-right">{stat.totalRequests.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{stat.successfulRequests.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{stat.failedRequests.toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant={Number(successRate) >= 95 ? 'default' : 'destructive'}>
                            {successRate}%
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{stat.avgResponseTime}ms</TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
