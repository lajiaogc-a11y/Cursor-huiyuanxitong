import type { ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useLanguage } from "@/contexts/LanguageContext";

export interface MerchantDeleteAlertProps {
  trigger: ReactNode;
  description: string;
  onConfirm: () => void;
}

export function MerchantDeleteAlert({ trigger, description, onConfirm }: MerchantDeleteAlertProps) {
  const { t } = useLanguage();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("merchants.confirmDelete")}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{t("common.delete")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
