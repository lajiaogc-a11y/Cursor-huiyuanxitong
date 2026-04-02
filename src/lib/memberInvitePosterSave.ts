import { toast } from "sonner";

export type BilingualT = (zh: string, en: string) => string;

function removeOverlay(wrap: HTMLElement, objectUrl: string) {
  if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
  URL.revokeObjectURL(objectUrl);
}

/**
 * 微信 / 部分内置浏览器无法可靠触发下载或系统分享，用全屏图 + 长按保存（H5 通用做法）。
 */
export function openLongPressSaveOverlay(objectUrl: string, t: BilingualT): void {
  const wrap = document.createElement("div");
  wrap.setAttribute("role", "dialog");
  wrap.setAttribute("aria-modal", "true");
  wrap.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:2147483646",
    "background:rgba(0,0,0,0.9)",
    "display:flex",
    "flex-direction:column",
    "align-items:center",
    "justify-content:center",
    "padding:16px",
    "box-sizing:border-box",
  ].join(";");

  const hint = document.createElement("p");
  hint.textContent = t(
    "长按下方图片，选择「保存图片」或「存储到相册」",
    "Long-press the image, then choose \"Save image\" or \"Save to Photos\".",
  );
  hint.style.cssText =
    "color:#fff;text-align:center;font-size:14px;margin:0 0 16px;max-width:340px;line-height:1.5;";

  const img = document.createElement("img");
  img.src = objectUrl;
  img.alt = t("邀请海报", "Invite poster");
  img.style.cssText =
    "max-width:min(92vw,420px);max-height:min(55vh,520px);border-radius:12px;background:#fff;padding:8px;box-sizing:border-box;object-fit:contain;";

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.textContent = t("关闭", "Close");
  closeBtn.style.cssText =
    "margin-top:20px;padding:12px 24px;border-radius:12px;border:none;font-weight:700;cursor:pointer;background:linear-gradient(135deg,#34d399,#6ee7b7);color:#062c1f;";

  const close = () => removeOverlay(wrap, objectUrl);
  closeBtn.onclick = close;
  wrap.addEventListener("click", (e) => {
    if (e.target === wrap) close();
  });

  wrap.appendChild(hint);
  wrap.appendChild(img);
  wrap.appendChild(closeBtn);
  document.body.appendChild(wrap);
}

/**
 * 将会员邀请海报 PNG 交给系统：优先分享面板（可存相册），微信等走长按预览，桌面走下载。
 */
export async function saveInvitePosterPngBlob(blob: Blob, filename: string, t: BilingualT): Promise<void> {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isWeChat = /MicroMessenger/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);

  if (isWeChat) {
    const url = URL.createObjectURL(blob);
    openLongPressSaveOverlay(url, t);
    toast.success(
      t("已打开预览，请长按图片保存到相册", "Preview opened — long-press the image to save to your gallery."),
    );
    return;
  }

  const file = new File([blob], filename, { type: "image/png" });
  if (typeof navigator !== "undefined" && navigator.share && typeof navigator.canShare === "function") {
    try {
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: filename,
          text: t("邀请注册海报", "Invite registration poster"),
        });
        toast.success(
          t(
            "如未直接存入相册，请在分享面板中选择「存储图像」或相册类应用。",
            "If it didn't save to Photos, choose \"Save Image\" or a gallery app in the share sheet.",
          ),
        );
        return;
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
    }
  }

  const url = URL.createObjectURL(blob);

  // iOS Safari 常忽略 download 属性：用长按预览更可靠
  if (isIOS) {
    openLongPressSaveOverlay(url, t);
    toast.success(
      t("请长按图片保存到相册。", "Long-press the image to save to Photos."),
    );
    return;
  }

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
  toast.success(t("邀请海报已下载", "Poster downloaded"));
}
