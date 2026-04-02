/**
 * 模态框统一出口（与 alert-dialog 一致，便于后续替换实现）。
 * 新业务优先使用 `Modal` 命名；旧代码可继续用 AlertDialog。
 */
export {
  AlertDialog as Modal,
  AlertDialogPortal as ModalPortal,
  AlertDialogOverlay as ModalOverlay,
  AlertDialogTrigger as ModalTrigger,
  AlertDialogContent as ModalContent,
  AlertDialogHeader as ModalHeader,
  AlertDialogFooter as ModalFooter,
  AlertDialogTitle as ModalTitle,
  AlertDialogDescription as ModalDescription,
  AlertDialogAction as ModalAction,
  AlertDialogCancel as ModalCancel,
} from "./alert-dialog";
