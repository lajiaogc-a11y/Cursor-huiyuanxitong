/**
 * 通用表格数据导入按钮组件
 * 可在任何数据表页面中使用
 * 注意：仅管理员可使用导入功能
 */

import { useState, useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { DrawerDetail } from '@/components/shell/DrawerDetail';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { Upload, FileUp, Loader2, CheckCircle2, XCircle, AlertTriangle, Download } from 'lucide-react';
import { notify } from "@/lib/notifyHub";
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTenantView } from '@/contexts/TenantViewContext';
import { ExportConfirmDialog } from '@/components/ExportConfirmDialog';
import { useExportConfirm } from '@/hooks/useExportConfirm';
import {
  EXPORTABLE_TABLES,
  validateImportData,
  importTableFromCSV,
  importTableFromXLSX,
  parseXLSXForPreview,
  downloadImportTemplate,
  type TableConfig,
} from '@/services/dataExportImportService';
import { parseCSV, readCsvFileAsUtf8Text } from '@/services/export/utils';

interface TableImportButtonProps {
  tableName: string;
  onImportComplete?: () => void;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  showLabel?: boolean;
}

export default function TableImportButton({
  tableName,
  onImportComplete,
  variant = 'outline',
  size = 'sm',
  showLabel = true,
}: TableImportButtonProps) {
  const { t, language } = useLanguage();
  const { employee } = useAuth();
  const { viewingTenantId } = useTenantView() || {};
  const memberImportTenantId = useMemo(
    () => viewingTenantId || employee?.tenant_id || null,
    [viewingTenantId, employee?.tenant_id],
  );
  const isEnglish = language === 'en';
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importMode, setImportMode] = useState<'insert' | 'upsert'>('upsert');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<{
    headers: string[];
    rowCount: number;
    validation: {
      valid: boolean;
      errors: string[];
      columnMapping: Record<string, string>;
      usedHeuristic?: boolean;
    } | null;
  } | null>(null);
  const [importResult, setImportResult] = useState<{
    success: boolean;
    imported: number;
    skipped: number;
    errors: string[];
  } | null>(null);
  const exportConfirm = useExportConfirm();

  const tableConfig = EXPORTABLE_TABLES.find(t => t.tableName === tableName);

  // 仅管理员可使用导入功能
  const isAdmin = employee?.role === 'admin';

  if (!tableConfig || !tableConfig.importable || !isAdmin) {
    return null;
  }

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportFile(file);
    setImportResult(null);

    const lower = file.name.toLowerCase();
    if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
      const preview = await parseXLSXForPreview(file, tableName, isEnglish);
      if (!preview) {
        notify.error(t('无法解析 Excel，请确认文件未加密且首行为表头', 'Could not parse Excel; use unencrypted file with header row'));
        event.target.value = '';
        return;
      }
      setImportPreview({
        headers: preview.headers,
        rowCount: preview.rowCount,
        validation: preview.validation,
      });
      setShowImportDialog(true);
      event.target.value = '';
      return;
    }

    void (async () => {
      try {
        const content = await readCsvFileAsUtf8Text(file);
        const { headers, rows } = parseCSV(content);
        if (headers.length === 0) {
          notify.error(t('文件为空', 'File is empty'));
          return;
        }
        const validation = validateImportData(tableName, headers, isEnglish);
        setImportPreview({ headers, rowCount: rows.length, validation });
        setShowImportDialog(true);
      } catch {
        notify.error(t('无法读取 CSV，请使用 UTF-8 编码', 'Could not read CSV; use UTF-8 encoding'));
      }
    })();

    event.target.value = '';
  };

  const handleImport = async () => {
    if (!importFile || !importPreview?.validation?.valid) return;

    setShowConfirmDialog(false);
    setIsImporting(true);

    if (tableName === 'members' && !memberImportTenantId) {
      notify.error(
        t(
          '请先进入目标租户（租户管理 → 进入租户）再导入会员',
          'Enter a tenant from Tenant Management before importing members',
        ),
      );
      setIsImporting(false);
      return;
    }

    try {
      const lower = importFile.name.toLowerCase();
      const result =
        lower.endsWith('.xlsx') || lower.endsWith('.xls')
          ? await importTableFromXLSX(
              tableName,
              importFile,
              isEnglish,
              importMode,
              employee?.id ?? null,
              employee?.real_name ?? null,
              memberImportTenantId,
            )
          : await importTableFromCSV(
              tableName,
              await readCsvFileAsUtf8Text(importFile),
              isEnglish,
              importMode,
              employee?.id ?? null,
              employee?.real_name ?? null,
              memberImportTenantId,
            );

      setImportResult(result);

      if (result.imported > 0) {
        const message = t(
          `导入成功: ${result.imported} 条${result.skipped > 0 ? `，跳过: ${result.skipped} 条` : ''}`,
          `Import successful: ${result.imported} records${result.skipped > 0 ? `, skipped: ${result.skipped}` : ''}`,
        );
        notify.success(message);
        onImportComplete?.();
      } else if (result.skipped > 0) {
        notify.warning(
          t(
            `全部跳过: ${result.skipped} 条记录（可能已存在或数据无效）`,
            `All skipped: ${result.skipped} records (may exist or invalid)`,
          ),
        );
      } else if (result.errors.length > 0) {
        notify.error(t(`导入失败: ${result.errors[0]}`, `Import failed: ${result.errors[0]}`));
      } else {
        notify.error(t('导入失败：未知错误', 'Import failed: Unknown error'));
      }
    } finally {
      setIsImporting(false);
    }
  };

  const handleDownloadTemplate = async () => {
    const result = await downloadImportTemplate(tableName, isEnglish, "xlsx");
    if (result.success) {
      notify.success(t('模板下载成功', 'Template downloaded'));
    } else if (result.error) {
      notify.error(result.error);
    }
  };

  const resetState = () => {
    setShowImportDialog(false);
    setImportFile(null);
    setImportPreview(null);
    setImportResult(null);
  };

  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        accept=".csv,.xlsx,.xls"
        onChange={handleFileSelect}
        className="hidden"
      />

      <Button
        variant={variant}
        size={size}
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className="h-4 w-4" />
        {showLabel && <span className="ml-1">{t('导入', 'Import')}</span>}
      </Button>

      <DrawerDetail
        open={showImportDialog}
        onOpenChange={(open) => {
          if (!open) resetState();
        }}
        title={
          <span className="flex items-center gap-2">
            <FileUp className="h-5 w-5 shrink-0" />
            {t('导入数据', 'Import Data')} — {isEnglish ? tableConfig.displayNameEn : tableConfig.displayName}
          </span>
        }
        description={t('预览并确认要导入的数据', 'Preview and confirm the data to import')}
        sheetMaxWidth="2xl"
      >
          <div className="space-y-4">
            {/* 文件信息 */}
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm font-medium">{importFile?.name}</p>
              <p className="text-xs text-muted-foreground">
                {t(`${importPreview?.rowCount || 0} 行数据`, `${importPreview?.rowCount || 0} rows`)}
              </p>
            </div>

            {/* 验证状态 */}
            {importPreview?.validation && (
              <div className={`p-3 rounded-lg border ${
                importPreview.validation.valid 
                  ? 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800' 
                  : 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  {importPreview.validation.valid ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <span className="text-sm font-medium text-green-700 dark:text-green-400">
                        {t('结构验证通过', 'Structure validated')}
                      </span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4 text-red-600" />
                      <span className="text-sm font-medium text-red-700 dark:text-red-400">
                        {t('结构验证失败', 'Validation failed')}
                      </span>
                    </>
                  )}
                </div>
                
                {importPreview.validation.errors.length > 0 && (
                  <ul className="text-xs text-red-600 dark:text-red-400 space-y-1">
                    {importPreview.validation.errors.map((err, i) => (
                      <li key={i}>• {err}</li>
                    ))}
                  </ul>
                )}

                {importPreview.validation.valid && (
                  <div className="space-y-1">
                    <p className="text-xs text-green-600 dark:text-green-400">
                      {t(
                        `已匹配 ${Object.keys(importPreview.validation.columnMapping).length} 列`,
                        `Matched ${Object.keys(importPreview.validation.columnMapping).length} columns`,
                      )}
                    </p>
                    {importPreview.validation.usedHeuristic && (
                      <p className="text-xs text-amber-700 dark:text-amber-400">
                        {t(
                          '未识别到标准表头，已按列顺序猜测字段；建议点击「下载模板」（Excel）或使用 UTF-8 CSV 后重试。',
                          'Headers were not recognized; columns were guessed by position. Prefer “Download template” (Excel) or UTF-8 CSV.',
                        )}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 导入模式 */}
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('导入模式', 'Import Mode')}</label>
              <Select value={importMode} onValueChange={(v) => setImportMode(v as 'insert' | 'upsert')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="upsert">
                    {t('更新或插入 (推荐)', 'Upsert (Recommended)')}
                  </SelectItem>
                  <SelectItem value="insert">
                    {t('仅插入新记录', 'Insert new only')}
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {importMode === 'upsert'
                  ? t('存在相同主键时更新，否则插入', 'Update if exists, insert if not')
                  : t('跳过已存在的记录', 'Skip existing records')
                }
              </p>
            </div>

            {/* 导入结果 */}
            {importResult && (() => {
              const isPartial = !importResult.success && importResult.imported > 0 && importResult.errors.length > 0;
              const colorCls = importResult.success
                ? 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800'
                : isPartial
                  ? 'bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800'
                  : 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800';
              const title = importResult.success
                ? t('导入完成', 'Import completed')
                : isPartial
                  ? t('部分导入成功', 'Partially imported')
                  : t('导入失败', 'Import failed');
              return (
                <div className={`p-3 rounded-lg border ${colorCls}`}>
                  <p className="text-sm font-medium">{title}</p>
                  <p className="text-xs mt-1">
                    {t(
                      `成功: ${importResult.imported}, 跳过: ${importResult.skipped}, 失败: ${importResult.errors.length}`,
                      `Success: ${importResult.imported}, Skipped: ${importResult.skipped}, Failed: ${importResult.errors.length}`,
                    )}
                  </p>
                  {importResult.errors.length > 0 && (
                    <ul className="text-xs text-red-600 mt-2 max-h-20 overflow-y-auto">
                      {importResult.errors.slice(0, 5).map((err, i) => (
                        <li key={i}>• {err}</li>
                      ))}
                      {importResult.errors.length > 5 && (
                        <li>... {t(`还有 ${importResult.errors.length - 5} 个错误`, `${importResult.errors.length - 5} more errors`)}</li>
                      )}
                    </ul>
                  )}
                </div>
              );
            })()}
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4 mt-4">
            <Button variant="outline" size="sm" onClick={() => exportConfirm.requestExport(handleDownloadTemplate)}>
              <Download className="h-4 w-4 mr-1" />
              {t('下载模板', 'Template')}
            </Button>
            <Button variant="outline" onClick={resetState}>
              {t('取消', 'Cancel')}
            </Button>
            {importResult ? (
              <Button onClick={resetState}>
                {t('确定', 'OK')}
              </Button>
            ) : (
              <Button
                onClick={() => setShowConfirmDialog(true)}
                disabled={!importPreview?.validation?.valid || isImporting}
              >
                {isImporting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    {t('导入中...', 'Importing...')}
                  </>
                ) : (
                  t('开始导入', 'Start Import')
                )}
              </Button>
            )}
          </div>
      </DrawerDetail>

      {/* 确认对话框 */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              {t('确认导入', 'Confirm Import')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                `即将导入 ${importPreview?.rowCount || 0} 条记录到 ${isEnglish ? tableConfig.displayNameEn : tableConfig.displayName}。此操作可能会覆盖现有数据。`,
                `About to import ${importPreview?.rowCount || 0} records to ${isEnglish ? tableConfig.displayNameEn : tableConfig.displayName}. This may overwrite existing data.`
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('取消', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleImport}>
              {t('确认导入', 'Confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ExportConfirmDialog
        open={exportConfirm.open}
        onOpenChange={exportConfirm.handleOpenChange}
        onConfirm={exportConfirm.handleConfirm}
      />
    </>
  );
}
