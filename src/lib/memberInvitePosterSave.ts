import { notify } from "@/lib/notifyHub";

export type BilingualT = (zh: string, en: string) => string;

declare global {
  interface Window {
    AndroidBridge?: {
      saveBase64ImageToGallery?: (base64: string, filename: string) => void;
    };
  }
}

function removeOverlay(wrap: HTMLElement, objectUrl: string) {
  if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
  URL.revokeObjectURL(objectUrl);
}

function isAndroidWebView(): boolean {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  if (/FastGC-Android/i.test(ua)) return true;
  return /Android/i.test(ua) && /wv\)|Version\/[\d.]+.*Chrome/i.test(ua);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] || "";
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("FileReader failed"));
    reader.readAsDataURL(blob);
  });
}

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

export async function saveInvitePosterPngBlob(blob: Blob, filename: string, t: BilingualT): Promise<void> {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isWeChat = /MicroMessenger/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);

  if (isWeChat) {
    const url = URL.createObjectURL(blob);
    openLongPressSaveOverlay(url, t);
    notify.success(
      t("已打开预览，请长按图片保存到相册", "Preview opened — long-press the image to save to your gallery."),
    );
    return;
  }

  // Android WebView: use native bridge to save directly to gallery
  if (isAndroidWebView() && window.AndroidBridge?.saveBase64ImageToGallery) {
    try {
      const base64 = await blobToBase64(blob);
      window.AndroidBridge.saveBase64ImageToGallery(base64, filename);
      notify.success(t("海报已保存到相册", "Poster saved to gallery"));
      return;
    } catch {
      // fall through to other methods
    }
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
        notify.success(
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

  if (isIOS) {
    openLongPressSaveOverlay(url, t);
    notify.success(
      t("请长按图片保存到相册。", "Long-press the image to save to Photos."),
    );
    return;
  }

  // Android WebView without bridge: use long-press overlay as fallback
  if (isAndroidWebView()) {
    openLongPressSaveOverlay(url, t);
    notify.success(
      t("请长按图片保存到相册", "Long-press the image to save to gallery"),
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
  notify.success(t("邀请海报已下载", "Poster downloaded"));
}
