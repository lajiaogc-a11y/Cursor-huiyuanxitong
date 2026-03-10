/**
 * 数据导入导出组件
 * 支持表级别的 CSV 导入导出和全平台数据备份
 * 支持完整数据库迁移导出（SQL/JSON 格式）
 */

import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Download,
  Upload,
  FileSpreadsheet,
  Database,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  FileDown,
  FileUp,
  HardDrive,
  Package,
  FileCode,
  FileJson,
  Server,
} from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useFieldPermissions } from '@/hooks/useFieldPermissions';
import {
  EXPORTABLE_TABLES,
  exportTableToCSV,
  importTableFromCSVWithProgress,
  validateImportData,
  getTableRecordCount,
  type ImportProgress,
} from '@/services/dataExportImportService';
import {
  exportFullDatabase,
  type MigrationProgress,
  type MigrationExportOptions,
  type VerificationReport,
} from '@/services/databaseMigrationService';

interface TableStats {
  tableName: string;
  displayName: string;
  count: number;
  loading: boolean;
}

export default function DataExportImportTab() {
  const { t, language } = useLanguage();
  const { employee } = useAuth();
  const { checkPermission } = useFieldPermissions();
  const isEnglish = language === 'en';
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // 权限检查 - 只有管理员或有导入/导出权限的用户可以使用
  const isSuperAdmin = employee?.is_super_admin === true;
  const isAdmin = employee?.role === 'admin';
  const canImport = isSuperAdmin || isAdmin || checkPermission('data_management', 'import_data').canEdit;
  const canExport = isSuperAdmin || isAdmin || checkPermission('data_management', 'export_data').canEdit;
  
  // 表统计数据
  const [tableStats, setTableStats] = useState<TableStats[]>([]);
  const [loadingStats, setLoadingStats] = useState(false);
  
  // 导出状态
  const [exportingTable, setExportingTable] = useState<string | null>(null);
  const [exportAllProgress, setExportAllProgress] = useState({ current: 0, total: 0, tableName: '' });
  const [isExportingAll, setIsExportingAll] = useState(false);
  const [selectedTablesForExport, setSelectedTablesForExport] = useState<Set<string>>(new Set());
  
  // 导入状态
  const [importTable, setImportTable] = useState<string>('');
  const [importMode, setImportMode] = useState<'insert' | 'upsert'>('upsert');
  const [skipPointsCreation, setSkipPointsCreation] = useState(false); // 跳过积分创建开关
  const [isImporting, setIsImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<{ headers: string[]; rowCount: number; validation: any } | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  
  // 对话框
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showExportAllDialog, setShowExportAllDialog] = useState(false);
  const [showImportConfirmDialog, setShowImportConfirmDialog] = useState(false);
  
  // 导入结果
  const [importResult, setImportResult] = useState<{ success: boolean; imported: number; skipped: number; errors: string[]; pointsCreated?: number } | null>(null);
  
  // 导入进度
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  
  // 数据库迁移导出状态
  const [showMigrationDialog, setShowMigrationDialog] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationProgress, setMigrationProgress] = useState<MigrationProgress | null>(null);
  const [migrationOptions, setMigrationOptions] = useState<MigrationExportOptions>({
    includeSchema: true,
    includeFunctions: true,
    includePolicies: true,
    includeData: true,
    includeIndexes: true,
    format: 'sql',
  });
  
  // 校验报告状态
  const [verificationReport, setVerificationReport] = useState<VerificationReport | null>(null);

  // 加载表统计数据
  const loadTableStats = async () => {
    setLoadingStats(true);
    const isEng = t('test', 'test') === 'test' ? false : true; // 简单判断语言
    const stats: TableStats[] = EXPORTABLE_TABLES.map(t => ({
      tableName: t.tableName,
      displayName: t.displayName,
      count: 0,
      loading: true,
    }));
    setTableStats(stats);

    // 并行获取所有表的记录数
    const promises = EXPORTABLE_TABLES.map(async (table) => {
      const count = await getTableRecordCount(table.tableName);
      return { tableName: table.tableName, count };
    });

    const results = await Promise.all(promises);
    
    setTableStats(prev => prev.map(stat => {
      const result = results.find(r => r.tableName === stat.tableName);
      return result ? { ...stat, count: result.count, loading: false } : stat;
    }));
    
    setLoadingStats(false);
  };

  useEffect(() => {
    loadTableStats();
  }, []);

  // 导出单个表
  const handleExportTable = async (tableName: string) => {
    setExportingTable(tableName);
    const result = await exportTableToCSV(tableName, isEnglish);
    setExportingTable(null);
    
    if (result.success) {
      toast.success(t(`导出成功: ${result.filename}`, `Exported: ${result.filename}`));
    } else {
      toast.error(t(`导出失败: ${result.error}`, `Export failed: ${result.error}`));
    }
  };

  // 导出所有选中的表
  const handleExportAll = async () => {
    if (selectedTablesForExport.size === 0) {
      // 如果没有选中任何表，导出所有表
      setSelectedTablesForExport(new Set(EXPORTABLE_TABLES.map(t => t.tableName)));
    }
    
    setShowExportAllDialog(false);
    setIsExportingAll(true);
    
    const tablesToExport = selectedTablesForExport.size > 0 
      ? EXPORTABLE_TABLES.filter(t => selectedTablesForExport.has(t.tableName))
      : EXPORTABLE_TABLES;
    
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < tablesToExport.length; i++) {
      const table = tablesToExport[i];
      setExportAllProgress({ 
        current: i + 1, 
        total: tablesToExport.length, 
        tableName: isEnglish ? table.displayNameEn : table.displayName 
      });
      
      const result = await exportTableToCSV(table.tableName, isEnglish);
      if (result.success) {
        successCount++;
      } else {
        errorCount++;
      }
      
      // 短暂延迟避免浏览器阻止多个下载
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    setIsExportingAll(false);
    setExportAllProgress({ current: 0, total: 0, tableName: '' });
    
    toast.success(t(
      `全平台导出完成: 成功 ${successCount} 个表，失败 ${errorCount} 个`,
      `Full export completed: ${successCount} succeeded, ${errorCount} failed`
    ));
  };

  // 处理文件选择
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    if (!file.name.endsWith('.csv')) {
      toast.error(t('请选择 CSV 文件', 'Please select a CSV file'));
      return;
    }
    
    setImportFile(file);
    
    // 读取文件内容进行预览和验证
    const content = await file.text();
    const lines = content.split(/\r?\n/).filter(line => line.trim());
    
    if (lines.length === 0) {
      toast.error(t('文件为空', 'File is empty'));
      return;
    }
    
    // 移除 BOM
    let headerLine = lines[0];
    if (headerLine.charCodeAt(0) === 0xFEFF) {
      headerLine = headerLine.substring(1);
    }
    
    const headers = headerLine.split(',').map(h => h.replace(/^"|"$/g, '').trim());
    
    // 如果已选择表，进行验证
    if (importTable) {
      const validation = validateImportData(importTable, headers, isEnglish);
      setImportPreview({ headers, rowCount: lines.length - 1, validation });
    } else {
      setImportPreview({ headers, rowCount: lines.length - 1, validation: null });
    }
    
    setShowImportDialog(true);
  };

  // 表选择变更时重新验证
  const handleImportTableChange = (tableName: string) => {
    setImportTable(tableName);
    
    if (importPreview && tableName) {
      const validation = validateImportData(tableName, importPreview.headers, isEnglish);
      setImportPreview({ ...importPreview, validation });
    }
  };

  // 执行导入
  const handleImport = async () => {
    if (!importFile || !importTable) {
      toast.error(t('请选择文件和目标表', 'Please select file and target table'));
      return;
    }
    
    setShowImportConfirmDialog(false);
    setShowImportDialog(false); // 关闭导入对话框，显示进度条
    setIsImporting(true);
    setImportProgress(null);
    
    // 保存导入的表名用于进度显示
    const currentImportTable = importTable;
    
    try {
      const content = await importFile.text();
      
      // 使用带进度回调的导入函数
      const result = await importTableFromCSVWithProgress(
        importTable, 
        content, 
        isEnglish, 
        importMode,
        undefined,
        undefined,
        (progress) => {
          setImportProgress(progress);
        },
        skipPointsCreation // 传递跳过积分开关
      );
      
      setImportResult(result);
      
      if (result.success) {
        const pointsInfo = result.pointsCreated ? ` (积分: ${result.pointsCreated})` : '';
        toast.success(t(
          `导入成功: ${result.imported} 条记录${pointsInfo}`,
          `Import successful: ${result.imported} records${pointsInfo}`
        ));
        loadTableStats(); // 刷新统计
      } else {
        toast.error(t(
          `导入失败: ${result.errors[0] || '未知错误'}`,
          `Import failed: ${result.errors[0] || 'Unknown error'}`
        ));
      }
    } catch (error) {
      toast.error(t(`导入错误: ${error}`, `Import error: ${error}`));
    } finally {
      setIsImporting(false);
    }
  };

  // 重置导入状态
  const resetImportState = () => {
    setImportFile(null);
    setImportPreview(null);
    setImportResult(null);
    setImportProgress(null);
    setImportTable('');
    setSkipPointsCreation(false); // 重置跳过积分开关
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 切换导出选择
  const toggleExportSelection = (tableName: string) => {
    setSelectedTablesForExport(prev => {
      const next = new Set(prev);
      if (next.has(tableName)) {
        next.delete(tableName);
      } else {
        next.add(tableName);
      }
      return next;
    });
  };

  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectedTablesForExport.size === EXPORTABLE_TABLES.length) {
      setSelectedTablesForExport(new Set());
    } else {
      setSelectedTablesForExport(new Set(EXPORTABLE_TABLES.map(t => t.tableName)));
    }
  };

  const importableTables = EXPORTABLE_TABLES.filter(t => t.importable);

  // 执行数据库迁移导出
  const handleMigrationExport = async () => {
    setShowMigrationDialog(false);
    setIsMigrating(true);
    setMigrationProgress(null);
    setVerificationReport(null);
    
    try {
      const result = await exportFullDatabase({
        ...migrationOptions,
        onProgress: setMigrationProgress,
      });
      
      if (result.success) {
        if (result.verificationReport) {
          setVerificationReport(result.verificationReport);
        }
        toast.success(t(
          `数据库迁移导出成功: ${result.filename}`,
          `Database migration exported: ${result.filename}`
        ));
      } else {
        toast.error(t(`导出失败: ${result.error}`, `Export failed: ${result.error}`));
      }
    } catch (error) {
      toast.error(t('导出失败', 'Export failed'));
    } finally {
      setIsMigrating(false);
      setMigrationProgress(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* 数据库迁移导出进度 */}
      {isMigrating && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <div className="flex-1">
                <p className="font-medium">
                  {t('正在导出数据库...', 'Exporting database...')}
                </p>
                {migrationProgress && (
                  <>
                    <p className="text-sm text-muted-foreground">
                      {migrationProgress.message}
                    </p>
                    <Progress 
                      value={(migrationProgress.current / migrationProgress.total) * 100} 
                      className="mt-2 h-2"
                    />
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 校验报告展示 */}
      {verificationReport && (
        <Card className="border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                {t('导出校验报告', 'Export Verification Report')}
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setVerificationReport(null)}>✕</Button>
            </div>
            <CardDescription>
              {t(`导出时间: ${new Date(verificationReport.export_time).toLocaleString('zh-CN')} | 总记录: ${verificationReport.total_records} 条 | 表数量: ${verificationReport.schema_tables}`,
                `Export time: ${new Date(verificationReport.export_time).toLocaleString()} | Total: ${verificationReport.total_records} records | Tables: ${verificationReport.schema_tables}`)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-64 overflow-y-auto">
              <Table className="text-xs">
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-2">{t('表名', 'Table')}</TableHead>
                    <TableHead className="text-right px-2">{t('行数', 'Rows')}</TableHead>
                    <TableHead className="px-2">{t('校验信息', 'Checksums')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {verificationReport.tables.map((table) => (
                    <TableRow key={table.name}>
                      <TableCell className="font-mono text-xs px-2">{table.name}</TableCell>
                      <TableCell className="text-right px-2">
                        {table.row_count >= 0 ? (
                          <Badge variant="outline" className="text-xs">{table.row_count}</Badge>
                        ) : (
                          <Badge variant="destructive" className="text-xs">错误</Badge>
                        )}
                      </TableCell>
                      <TableCell className="px-2 text-xs text-muted-foreground">
                        {table.checksums ? Object.entries(table.checksums).map(([k, v]) => (
                          <span key={k} className="mr-2">{k}: {v.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                        )) : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 全平台导出进度 */}
      {isExportingAll && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              <div className="flex-1">
                <p className="font-medium text-blue-900">
                  {t('正在导出全平台数据...', 'Exporting all platform data...')}
                </p>
                <p className="text-sm text-blue-700">
                  {t(
                    `正在处理: ${exportAllProgress.tableName} (${exportAllProgress.current}/${exportAllProgress.total})`,
                    `Processing: ${exportAllProgress.tableName} (${exportAllProgress.current}/${exportAllProgress.total})`
                  )}
                </p>
                <Progress 
                  value={(exportAllProgress.current / exportAllProgress.total) * 100} 
                  className="mt-2 h-2"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 订单导入进度 */}
      {isImporting && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <div className="flex-1">
                <p className="font-medium">
                  {t('正在导入数据...', 'Importing data...')}
                </p>
                {importProgress ? (
                  <>
                    <p className="text-sm text-muted-foreground">
                      {importProgress.currentRow}
                    </p>
                    <div className="mt-2 flex items-center gap-4 text-sm flex-wrap">
                      <span className="text-green-600">✓ {t('成功', 'Success')}: {importProgress.imported}</span>
                      <span className="text-yellow-600">⚠ {t('跳过', 'Skipped')}: {importProgress.skipped}</span>
                      {importProgress.pointsCreated > 0 && (
                        <span className="text-blue-600">★ {t('积分', 'Points')}: {importProgress.pointsCreated}</span>
                      )}
                    </div>
                    <Progress 
                      value={(importProgress.current / importProgress.total) * 100} 
                      className="mt-2 h-2"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {importProgress.current} / {importProgress.total} ({Math.round((importProgress.current / importProgress.total) * 100)}%)
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t('正在准备数据...', 'Preparing data...')}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Database className="h-5 w-5" />
            {t('数据导入导出', 'Data Import/Export')}
          </CardTitle>
          <CardDescription>
            {t(
              '支持 CSV 格式的数据导入和导出，可用于数据备份、迁移和系统切换。导出的数据为原始存储值，不进行任何计算或转换。',
              'Support CSV format data import and export for backup, migration, and system switching. Exported data is raw stored values without any calculation or transformation.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {canExport && (
              <Button 
                variant="outline" 
                className="gap-2"
                onClick={() => {
                  setSelectedTablesForExport(new Set(EXPORTABLE_TABLES.map(t => t.tableName)));
                  setShowExportAllDialog(true);
                }}
                disabled={isExportingAll}
              >
                <HardDrive className="h-4 w-4" />
                {t('全平台数据导出', 'Export All Data')}
              </Button>
            )}
            
            {canImport && (
              <Button 
                variant="outline" 
                className="gap-2"
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
              >
                <Upload className="h-4 w-4" />
                {t('导入数据', 'Import Data')}
              </Button>
            )}
            
            <Button 
              variant="ghost" 
              size="icon"
              onClick={loadTableStats}
              disabled={loadingStats}
            >
              <RefreshCw className={`h-4 w-4 ${loadingStats ? 'animate-spin' : ''}`} />
            </Button>
            
            {!canExport && !canImport && (
              <div className="text-sm text-muted-foreground">
                {t('您没有数据导入/导出权限', 'You do not have data import/export permissions')}
              </div>
            )}
          </div>
          
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleFileSelect}
          />
        </CardContent>
      </Card>

      {/* 完整数据库迁移卡片 */}
      {isAdmin && (
        <Card className="border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Server className="h-5 w-5 text-primary" />
              {t('完整数据库迁移', 'Complete Database Migration')}
            </CardTitle>
            <CardDescription>
              {t(
                '导出完整的数据库结构（Schema）、函数、策略和所有数据，生成可在标准 PostgreSQL 中执行的 SQL 文件。适用于服务器迁移场景。',
                'Export complete database schema, functions, policies and all data. Generate SQL files that can be executed on standard PostgreSQL. Suitable for server migration scenarios.'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <Button 
                className="gap-2"
                onClick={() => setShowMigrationDialog(true)}
                disabled={isMigrating}
              >
                <Package className="h-4 w-4" />
                {t('导出完整数据库', 'Export Full Database')}
              </Button>
              
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileCode className="h-4 w-4" />
                {t('输出格式: ZIP (SQL + JSON)', 'Output format: ZIP (SQL + JSON)')}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 表列表 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            {t('数据表列表', 'Data Tables')}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[500px]">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-[200px]">{t('表名', 'Table')}</TableHead>
                  <TableHead className="text-right w-[100px]">{t('记录数', 'Records')}</TableHead>
                  <TableHead className="text-center w-[80px]">{t('可导入', 'Importable')}</TableHead>
                  <TableHead className="text-right w-[150px]">{t('操作', 'Actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tableStats.map((stat) => {
                  const tableConfig = EXPORTABLE_TABLES.find(t => t.tableName === stat.tableName);
                  return (
                    <TableRow key={stat.tableName}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="font-mono text-xs">
                            {stat.tableName}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {stat.displayName}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {stat.loading ? (
                          <Loader2 className="h-4 w-4 animate-spin inline" />
                        ) : (
                          <span className="font-mono">{stat.count.toLocaleString()}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {tableConfig?.importable ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600 inline" />
                        ) : (
                          <XCircle className="h-4 w-4 text-muted-foreground inline" />
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1"
                          onClick={() => handleExportTable(stat.tableName)}
                          disabled={exportingTable === stat.tableName || stat.count === 0}
                        >
                          {exportingTable === stat.tableName ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <FileDown className="h-3 w-3" />
                          )}
                          {t('导出', 'Export')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* 全平台导出对话框 */}
      <Dialog open={showExportAllDialog} onOpenChange={setShowExportAllDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HardDrive className="h-5 w-5" />
              {t('全平台数据导出', 'Export All Platform Data')}
            </DialogTitle>
            <DialogDescription>
              {t(
                '选择要导出的表，每个表将生成一个单独的 CSV 文件。导出的数据可用于数据库迁移或备份。',
                'Select tables to export. Each table will generate a separate CSV file. Exported data can be used for database migration or backup.'
              )}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="select-all"
                checked={selectedTablesForExport.size === EXPORTABLE_TABLES.length}
                onCheckedChange={toggleSelectAll}
              />
              <Label htmlFor="select-all" className="font-medium">
                {t('全选', 'Select All')} ({selectedTablesForExport.size}/{EXPORTABLE_TABLES.length})
              </Label>
            </div>
            
            <ScrollArea className="h-[300px] border rounded-md p-3">
              <div className="grid grid-cols-2 gap-2">
                {EXPORTABLE_TABLES.map(table => (
                  <div key={table.tableName} className="flex items-center gap-2">
                    <Checkbox
                      id={`export-${table.tableName}`}
                      checked={selectedTablesForExport.has(table.tableName)}
                      onCheckedChange={() => toggleExportSelection(table.tableName)}
                    />
                    <Label htmlFor={`export-${table.tableName}`} className="text-sm cursor-pointer">
                      {isEnglish ? table.displayNameEn : table.displayName}
                    </Label>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExportAllDialog(false)}>
              {t('取消', 'Cancel')}
            </Button>
            <Button 
              onClick={handleExportAll}
              disabled={selectedTablesForExport.size === 0}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              {t(`导出 ${selectedTablesForExport.size} 个表`, `Export ${selectedTablesForExport.size} Tables`)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 导入预览对话框 */}
      <Dialog open={showImportDialog} onOpenChange={(open) => {
        setShowImportDialog(open);
        if (!open) resetImportState();
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileUp className="h-5 w-5" />
              {t('导入数据预览', 'Import Data Preview')}
            </DialogTitle>
            <DialogDescription>
              {importFile && t(
                `文件: ${importFile.name}，共 ${importPreview?.rowCount || 0} 行数据`,
                `File: ${importFile.name}, ${importPreview?.rowCount || 0} rows`
              )}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* 目标表选择 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('目标表', 'Target Table')} *</Label>
                <Select value={importTable} onValueChange={handleImportTableChange}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('选择目标表', 'Select target table')} />
                  </SelectTrigger>
                  <SelectContent>
                    {importableTables.map(table => (
                      <SelectItem key={table.tableName} value={table.tableName}>
                        {isEnglish ? table.displayNameEn : table.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>{t('导入模式', 'Import Mode')}</Label>
                <Select value={importMode} onValueChange={(v) => setImportMode(v as 'insert' | 'upsert')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="upsert">
                      {t('更新或插入 (Upsert)', 'Update or Insert (Upsert)')}
                    </SelectItem>
                    <SelectItem value="insert">
                      {t('仅插入 (Insert)', 'Insert Only')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            {/* 验证结果 */}
            {importPreview?.validation && (
              <div className={`p-3 rounded-md ${
                importPreview.validation.valid 
                  ? 'bg-green-50 border border-green-200' 
                  : 'bg-red-50 border border-red-200'
              }`}>
                <div className="flex items-start gap-2">
                  {importPreview.validation.valid ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
                  )}
                  <div>
                    <p className={`font-medium ${
                      importPreview.validation.valid ? 'text-green-700' : 'text-red-700'
                    }`}>
                      {importPreview.validation.valid 
                        ? t('验证通过', 'Validation Passed')
                        : t('验证失败', 'Validation Failed')
                      }
                    </p>
                    {importPreview.validation.errors?.length > 0 && (
                      <ul className="text-sm text-red-600 mt-1 list-disc list-inside">
                        {importPreview.validation.errors.map((err: string, i: number) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                    )}
                    {importPreview.validation.valid && (
                      <p className="text-sm text-green-600 mt-1">
                        {t(
                          `匹配到 ${Object.keys(importPreview.validation.columnMapping).length} 个列`,
                          `Matched ${Object.keys(importPreview.validation.columnMapping).length} columns`
                        )}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
            
            {/* 订单导入专用选项：跳过积分创建 */}
            {importTable === 'orders' && (
              <div className="p-3 rounded-md bg-amber-50 border border-amber-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <div>
                      <p className="font-medium text-amber-700">
                        {t('数据迁移模式', 'Data Migration Mode')}
                      </p>
                      <p className="text-xs text-amber-600 mt-0.5">
                        {t(
                          '启用后仅导入订单记录，不自动产生积分数据。适用于平台数据迁移场景。',
                          'When enabled, only import order records without generating points data. Suitable for platform data migration.'
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="skip-points" className="text-sm text-amber-700">
                      {t('跳过积分', 'Skip Points')}
                    </Label>
                    <Switch
                      id="skip-points"
                      checked={skipPointsCreation}
                      onCheckedChange={setSkipPointsCreation}
                    />
                  </div>
                </div>
              </div>
            )}
            
            {/* 列预览 */}
            {importPreview?.headers && (
              <div className="space-y-2">
                <Label>{t('检测到的列', 'Detected Columns')}</Label>
                <div className="flex flex-wrap gap-1">
                  {importPreview.headers.slice(0, 15).map((header, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      {header}
                    </Badge>
                  ))}
                  {importPreview.headers.length > 15 && (
                    <Badge variant="outline" className="text-xs">
                      +{importPreview.headers.length - 15} {t('更多', 'more')}
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImportDialog(false)}>
              {t('取消', 'Cancel')}
            </Button>
            <Button 
              onClick={() => {
                setShowImportDialog(false);
                setShowImportConfirmDialog(true);
              }}
              disabled={!importTable || !importPreview?.validation?.valid}
              className="gap-2"
            >
              <Upload className="h-4 w-4" />
              {t('开始导入', 'Start Import')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 导入确认对话框 */}
      <AlertDialog open={showImportConfirmDialog} onOpenChange={setShowImportConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              {t('确认导入', 'Confirm Import')}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  {t(
                    `即将导入 ${importPreview?.rowCount || 0} 条数据到 "${EXPORTABLE_TABLES.find(t => t.tableName === importTable)?.displayName || importTable}" 表。`,
                    `About to import ${importPreview?.rowCount || 0} records to "${EXPORTABLE_TABLES.find(t => t.tableName === importTable)?.displayNameEn || importTable}" table.`
                  )}
                </p>
                <p className="text-amber-600 font-medium">
                  {importMode === 'upsert' 
                    ? t('更新模式：已存在的记录将被更新，新记录将被插入。', 'Upsert mode: Existing records will be updated, new records will be inserted.')
                    : t('插入模式：仅插入新记录，如有重复主键将报错。', 'Insert mode: Only insert new records, duplicate keys will cause errors.')
                  }
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('取消', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleImport} disabled={isImporting}>
              {isImporting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('导入中...', 'Importing...')}
                </>
              ) : (
                t('确认导入', 'Confirm Import')
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 数据库迁移导出对话框 */}
      <Dialog open={showMigrationDialog} onOpenChange={setShowMigrationDialog}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              {t('完整数据库迁移导出', 'Complete Database Migration Export')}
            </DialogTitle>
            <DialogDescription>
              {t(
                '选择要导出的内容，生成可在标准 PostgreSQL 中执行的 SQL 文件。',
                'Select content to export, generate SQL files that can be executed on standard PostgreSQL.'
              )}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* 导出格式 */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">{t('导出格式', 'Export Format')}</Label>
              <RadioGroup
                value={migrationOptions.format}
                onValueChange={(v) => setMigrationOptions(prev => ({ ...prev, format: v as 'sql' | 'json' }))}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="sql" id="format-sql" />
                  <Label htmlFor="format-sql" className="flex items-center gap-2 cursor-pointer">
                    <FileCode className="h-4 w-4" />
                    PostgreSQL SQL {t('（推荐）', '(Recommended)')}
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="json" id="format-json" />
                  <Label htmlFor="format-json" className="flex items-center gap-2 cursor-pointer">
                    <FileJson className="h-4 w-4" />
                    JSON
                  </Label>
                </div>
              </RadioGroup>
            </div>
            
            {/* 导出内容 */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">{t('导出内容', 'Export Content')}</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="include-schema"
                    checked={migrationOptions.includeSchema}
                    onCheckedChange={(checked) => setMigrationOptions(prev => ({ ...prev, includeSchema: !!checked }))}
                  />
                  <Label htmlFor="include-schema" className="cursor-pointer">
                    {t('表结构 (Schema)', 'Table Schema')}
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="include-functions"
                    checked={migrationOptions.includeFunctions}
                    onCheckedChange={(checked) => setMigrationOptions(prev => ({ ...prev, includeFunctions: !!checked }))}
                  />
                  <Label htmlFor="include-functions" className="cursor-pointer">
                    {t('数据库函数', 'Functions')}
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="include-policies"
                    checked={migrationOptions.includePolicies}
                    onCheckedChange={(checked) => setMigrationOptions(prev => ({ ...prev, includePolicies: !!checked }))}
                  />
                  <Label htmlFor="include-policies" className="cursor-pointer">
                    {t('RLS 策略', 'RLS Policies')}
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="include-indexes"
                    checked={migrationOptions.includeIndexes}
                    onCheckedChange={(checked) => setMigrationOptions(prev => ({ ...prev, includeIndexes: !!checked }))}
                  />
                  <Label htmlFor="include-indexes" className="cursor-pointer">
                    {t('索引和约束', 'Indexes')}
                  </Label>
                </div>
                <div className="flex items-center space-x-2 col-span-2">
                  <Checkbox 
                    id="include-data"
                    checked={migrationOptions.includeData}
                    onCheckedChange={(checked) => setMigrationOptions(prev => ({ ...prev, includeData: !!checked }))}
                  />
                  <Label htmlFor="include-data" className="cursor-pointer font-medium">
                    {t('全量数据 (Data)', 'All Data')}
                  </Label>
                </div>
              </div>
            </div>
            
            {/* 导出说明 */}
            <div className="p-3 rounded-md bg-muted/50 text-sm">
              <p className="font-medium mb-1">{t('导出文件将包含:', 'Export will include:')}</p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>01_schema.sql - {t('表结构定义', 'Table definitions')}</li>
                <li>02_functions.sql - {t('数据库函数', 'Database functions')}</li>
                <li>03_policies.sql - {t('RLS 策略', 'RLS policies')}</li>
                <li>04_indexes.sql - {t('索引定义', 'Index definitions')}</li>
                <li>05_data.sql - {t('全量数据 INSERT 语句', 'All data as INSERT statements')}</li>
                <li>IMPORT_GUIDE.md - {t('详细导入指南', 'Detailed import guide')}</li>
              </ul>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMigrationDialog(false)}>
              {t('取消', 'Cancel')}
            </Button>
            <Button 
              onClick={handleMigrationExport}
              disabled={!migrationOptions.includeSchema && !migrationOptions.includeData}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              {t('开始导出', 'Start Export')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 导入结果显示 */}
      {importResult && (
        <Card className={importResult.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}>
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              {importResult.success ? (
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              ) : (
                <XCircle className="h-6 w-6 text-red-600" />
              )}
              <div className="flex-1">
                <p className={`font-medium ${importResult.success ? 'text-green-700' : 'text-red-700'}`}>
                  {importResult.success 
                    ? t('导入完成', 'Import Completed')
                    : t('导入失败', 'Import Failed')
                  }
                </p>
                <div className="text-sm mt-1 space-y-1">
                  <p>{t(`成功导入: ${importResult.imported} 条`, `Imported: ${importResult.imported} records`)}</p>
                  <p>{t(`跳过: ${importResult.skipped} 条`, `Skipped: ${importResult.skipped} records`)}</p>
                  {importResult.errors.length > 0 && (
                    <div className="mt-2">
                      <p className="text-red-600 font-medium">{t('错误详情:', 'Errors:')}</p>
                      <ul className="text-red-600 list-disc list-inside max-h-32 overflow-y-auto">
                        {importResult.errors.slice(0, 10).map((err, i) => (
                          <li key={i} className="text-xs">{err}</li>
                        ))}
                        {importResult.errors.length > 10 && (
                          <li className="text-xs">... {t(`还有 ${importResult.errors.length - 10} 个错误`, `and ${importResult.errors.length - 10} more errors`)}</li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setImportResult(null)}>
                {t('关闭', 'Close')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
