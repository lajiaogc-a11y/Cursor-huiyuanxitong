/** UI 层统一导出：实现仍在 `@/lib/notifyHub`（单源，避免双份逻辑） */
export {
  notify,
  notifySuccess,
  notifyError,
  notifyInfo,
  notifyLoading,
  resolveNotifyText,
  type BilingualInput,
} from "@/lib/notifyHub";
