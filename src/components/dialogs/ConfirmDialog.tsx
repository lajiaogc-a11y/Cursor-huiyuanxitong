/**
 * 通用确认弹窗 - 封装 AlertDialog，统一确认/取消交互
 * 不包含任何业务逻辑，仅 UI 封装
 */
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
import { cn } from "@/lib/utils";

export interface ConfirmDialogProps {
  /** 触发元素，如 Button */
  trigger: React.ReactNode;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void | Promise<void>;
  /** 确认按钮样式：default | destructive | amber(取消订单等) */
  confirmVariant?: "default" | "destructive" | "amber";
  disabled?: boolean;
  className?: string;
}

const variantClasses = {
  default: "bg-primary hover:bg-primary/90",
  destructive: "bg-destructive hover:bg-destructive/90",
  amber: "bg-amber-500 hover:bg-amber-600",
};

export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmText = "确认",
  cancelText = "取消",
  onConfirm,
  confirmVariant = "default",
  disabled = false,
  className,
}: ConfirmDialogProps) {
  const handleConfirm = async () => {
    await onConfirm();
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild disabled={disabled}>
        {trigger}
      </AlertDialogTrigger>
      <AlertDialogContent className={cn(className)}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelText}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            className={variantClasses[confirmVariant]}
          >
            {confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
