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
import { useLanguage } from '@/contexts/LanguageContext';

type ExportConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  title?: string;
  description?: string;
};

export function ExportConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
}: ExportConfirmDialogProps) {
  const { t } = useLanguage();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title ?? t('确认导出', 'Confirm export')}</AlertDialogTitle>
          <AlertDialogDescription>
            {description ??
              t(
                '确定要导出当前数据吗？文件将下载到您的设备。',
                'Export the current data? The file will download to your device.',
              )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('取消', 'Cancel')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
          >
            {t('确认导出', 'Export')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
