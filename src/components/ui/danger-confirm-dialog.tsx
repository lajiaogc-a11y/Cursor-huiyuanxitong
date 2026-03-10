import { useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface DangerConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmText: string; // 用户需要输入的确认文字
  onConfirm: () => void;
}

export function DangerConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText,
  onConfirm,
}: DangerConfirmDialogProps) {
  const [inputValue, setInputValue] = useState("");
  const { t } = useLanguage();

  const isMatch = inputValue.trim() === confirmText;

  const handleConfirm = () => {
    if (isMatch) {
      onConfirm();
      setInputValue("");
      onOpenChange(false);
    }
  };

  const handleCancel = () => {
    setInputValue("");
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!v) handleCancel(); else onOpenChange(v); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <span>{description}</span>
            <span className="block text-sm mt-2">
              {t(
                `请输入 "${confirmText}" 以确认此操作`,
                `Type "${confirmText}" to confirm this action`
              )}
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={confirmText}
          className="mt-2"
          onKeyDown={(e) => {
            if (e.key === "Enter" && isMatch) handleConfirm();
          }}
        />
        <AlertDialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            {t("取消", "Cancel")}
          </Button>
          <Button
            variant="destructive"
            disabled={!isMatch}
            onClick={handleConfirm}
          >
            {t("确认执行", "Confirm")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
