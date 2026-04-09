import { useEffect } from "react";

function isTypingInField(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "TEXTAREA") return true;
  if (tag === "INPUT") {
    const t = (target as HTMLInputElement).type;
    if (t === "button" || t === "submit" || t === "reset" || t === "checkbox" || t === "radio" || t === "file") return false;
    return true;
  }
  return false;
}

/**
 * 员工端全局快捷键（需在 MainLayout 等壳层挂载一次）
 * - `/`：聚焦当前页 `[data-staff-page-search]`（不在输入框内时）
 * - Escape：向 document 派发一次 Escape，便于 Radix Dialog / Sheet 关闭
 * - Enter：仅当焦点在带 `data-staff-enter-submit` 的 form 内且为常规输入控件时 requestSubmit（避免破坏默认行为）
 */
export function useGlobalHotkeys() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      const typing = isTypingInField(target);

      if (e.key === "Escape" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const openLayer = document.querySelector(
          '[data-state="open"][role="dialog"],[data-state="open"][data-radix-dialog-content],[data-state="open"][data-radix-alert-dialog-content]',
        );
        if (openLayer) {
          e.preventDefault();
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
        }
        return;
      }

      if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const el = document.querySelector<HTMLElement>(
          "input[data-staff-page-search]:not([disabled]), textarea[data-staff-page-search]:not([disabled])",
        );
        if (el) {
          e.preventDefault();
          el.focus();
          (el as HTMLInputElement).select();
        }
        return;
      }

      if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        const form = target?.closest?.("form[data-staff-enter-submit]");
        if (!form || !(form instanceof HTMLFormElement)) return;
        if (target?.tagName === "TEXTAREA") return;
        if (target?.tagName === "SELECT") return;
        if (target?.tagName === "INPUT") {
          const t = (target as HTMLInputElement).type;
          if (t === "checkbox" || t === "radio" || t === "file" || t === "button" || t === "submit" || t === "reset") return;
        }
        if (!form.contains(target)) return;
        e.preventDefault();
        e.stopPropagation();
        form.requestSubmit();
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);
}
