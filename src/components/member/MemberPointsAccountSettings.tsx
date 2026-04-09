import { useRef, useState } from "react";
import { Camera, Trash2, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useMemberResolvableMedia } from "@/hooks/members/useMemberResolvableMedia";
import { notify } from "@/lib/notifyHub";

export interface MemberPointsAccountSettingsProps {
  avatarUrl: string | null;
  displayInitial: string;
  onPickAvatar: (file: File) => Promise<void>;
  onClearAvatar: () => void;
  t: (zh: string, en: string) => string;
  /** inline：仅头像卡片，用于设置页等已有大标题的场景 */
  variant?: "full" | "inline";
}

export function MemberPointsAccountSettings({
  avatarUrl,
  displayInitial,
  onPickAvatar,
  onClearAvatar,
  t,
  variant = "full",
}: MemberPointsAccountSettingsProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [removeAvatarOpen, setRemoveAvatarOpen] = useState(false);
  const rawAvatar = String(avatarUrl ?? "").trim();
  const { resolvedSrc, usePlaceholder, onImageError } = useMemberResolvableMedia(
    "member-points-account-settings-avatar",
    rawAvatar || undefined,
  );
  const showAvatarPreview = rawAvatar && !usePlaceholder;

  const handleFiles = async (list: FileList | null) => {
    const file = list?.[0];
    if (!file) return;
    setBusy(true);
    try {
      await onPickAvatar(file);
      notify.success(t("头像已更新", "Avatar updated"));
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      if (code === "FILE_TOO_LARGE") {
        notify.error(t("单张原图最大 8MB，请换一张较小的图片", "Each file must be 8MB or smaller"));
      } else if (code === "NOT_IMAGE") {
        notify.error(t("请选择图片文件", "Please choose an image"));
      } else if (e instanceof DOMException && e.name === "QuotaExceededError") {
        notify.error(t("存储空间不足", "Storage full"));
      } else {
        notify.error(t("处理图片失败，请换一张试试", "Could not process image"));
      }
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const card = (
    <div className="member-points-account-settings__card">
        <div className="member-points-account-settings__row">
          <button
            type="button"
            className="member-points-account-settings__preview"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            aria-label={t("上传头像", "Upload avatar")}
          >
            {showAvatarPreview ? (
              <img
                src={resolvedSrc}
                alt=""
                className="member-points-account-settings__preview-img"
                onError={onImageError}
              />
            ) : (
              <span className="member-points-account-settings__preview-letter" aria-hidden>
                {(displayInitial || "?").charAt(0).toUpperCase()}
              </span>
            )}
            <span className="member-points-account-settings__preview-badge" aria-hidden>
              <Camera size={14} strokeWidth={2.25} />
            </span>
          </button>

          <div className="member-points-account-settings__actions">
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="sr-only"
              aria-hidden
              tabIndex={-1}
              onChange={(e) => void handleFiles(e.target.files)}
            />
            <button
              type="button"
              className="member-points-account-settings__btn member-points-account-settings__btn--primary"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
              ) : (
                <Camera className="h-4 w-4" aria-hidden />
              )}
              {t("更换头像", "Change photo")}
            </button>
            {avatarUrl ? (
              <button
                type="button"
                className="member-points-account-settings__btn member-points-account-settings__btn--ghost"
                disabled={busy}
                onClick={() => setRemoveAvatarOpen(true)}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                {t("移除头像", "Remove")}
              </button>
            ) : null}
          </div>
        </div>
        <AlertDialog open={removeAvatarOpen} onOpenChange={setRemoveAvatarOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("移除头像？", "Remove avatar?")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("将恢复为默认字母头像，可随时重新上传。", "Your photo will be cleared; you can upload again anytime.")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  setRemoveAvatarOpen(false);
                  onClearAvatar();
                  notify.message(t("已恢复默认头像", "Reset to default avatar"));
                }}
              >
                {t("移除", "Remove")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <p className="member-points-account-settings__fineprint">
          {t(
            "支持 JPG / PNG / WebP / GIF 上传；单张最大 8MB。将转为 WebP（不支持时转为 JPEG）。",
            "Upload JPG, PNG, WebP or GIF; max 8MB. We convert to WebP (JPEG fallback).",
          )}
        </p>
      </div>
  );

  if (variant === "inline") {
    return <div className="member-points-account-settings member-points-account-settings--inline">{card}</div>;
  }

  return (
    <section className="member-points-account-settings scroll-mt-4" aria-labelledby="member-points-account-settings-title">
      <p id="member-points-account-settings-title" className="member-section-title">
        {t("账户设置", "Account settings")}
      </p>
      {card}
    </section>
  );
}
