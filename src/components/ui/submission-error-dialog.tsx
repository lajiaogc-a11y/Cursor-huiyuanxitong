/**
 * Global Submission Error Dialog
 * Centered modal that shows submission failure message.
 * Must click "Confirm" to dismiss.
 */

import { useState, useEffect } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AlertTriangle } from 'lucide-react';
import { onSubmissionError } from '@/services/submissionErrorService';
import { useLanguage } from '@/contexts/LanguageContext';

export function SubmissionErrorDialog() {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const unsubscribe = onSubmissionError((msg) => {
      setMessage(msg);
      setOpen(true);
    });
    return unsubscribe;
  }, []);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            {t('提交失败', 'Submission Failed')}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-base pt-2">
            {message}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={() => setOpen(false)}>
            {t('确认', 'Confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
