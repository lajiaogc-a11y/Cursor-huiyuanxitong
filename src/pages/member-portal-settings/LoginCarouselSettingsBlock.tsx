/**
 * 登录落地页顶部轮播：配图上传 + 中英标题正文（与 login_carousel_slides 字段绑定）
 * 在后台「会员门户 → 登录设置」中编辑；会员端登录页读取同一字段。
 */
import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Upload, Loader2, ChevronUp, ChevronDown, GripVertical, Images } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { StaffImageReplaceZone } from "@/components/staff/StaffImageReplaceZone";
import type { LoginCarouselSlideItem } from "@/services/members/memberPortalSettingsService";
import { cn } from "@/lib/utils";
import { SectionTitle } from "./shared";
import {
  portalSettingsEmptyShellClass,
  portalSettingsEmptyIconWrapClass,
} from "@/components/common/EmptyState";
import { BANNER_MAX_DIMENSION } from "@/lib/imageClientCompress";

export type LoginCarouselFormRow = Omit<LoginCarouselSlideItem, "sort_order">;

type Props = {
  /** 区块主标题；默认「顶部轮播」 */
  headerTitle?: string;
  intervalSec: number;
  onIntervalSecChange: (v: number) => void;
  slides: LoginCarouselFormRow[];
  onSlidesChange: React.Dispatch<React.SetStateAction<LoginCarouselFormRow[]>>;
  uploadLoginCarouselImage: (idx: number, file?: File | null) => Promise<void>;
  uploadingIndex: number | null;
};

export default function LoginCarouselSettingsBlock({
  headerTitle,
  intervalSec,
  onIntervalSecChange,
  slides,
  onSlidesChange,
  uploadLoginCarouselImage,
  uploadingIndex,
}: Props) {
  const { t } = useLanguage();
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const [removeSlideIdx, setRemoveSlideIdx] = useState<number | null>(null);

  const updateSlide = (idx: number, patch: Partial<LoginCarouselFormRow>) =>
    onSlidesChange((prev) => prev.map((item, i) => (i === idx ? { ...item, ...patch } : item)));
  const addSlide = () =>
    onSlidesChange((prev) => [...prev, { image_url: "", title_zh: "", title_en: "", body_zh: "", body_en: "" }]);
  const removeSlide = (idx: number) => onSlidesChange((prev) => prev.filter((_, i) => i !== idx));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionTitle className="mb-0">{headerTitle ?? t("顶部轮播", "Top carousel")}</SectionTitle>
        <Button type="button" variant="outline" size="sm" onClick={addSlide} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          {t("新增幻灯", "Add slide")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {t(
          "每张可上传配图，并填写中英文标题与正文（会员端按界面语言优先展示）。显示在会员未登录时的登录/注册页顶部大卡片区。自动向左切换间隔见下方。最多 8 张；全部留空时会员端使用内置默认轮播。",
          "Each slide: upload an image plus CN/EN title and body (member app follows UI language). Shown at the top of the sign-in landing page. Auto-advance below. Up to 8 slides; if empty, built-in defaults are used.",
        )}
      </p>
      <p className="mt-2 rounded-lg border border-border/40 bg-muted/25 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
        {t(
          `【配图尺寸】宽:高建议 2:1（与会员登录页大卡片区一致），推荐 ${BANNER_MAX_DIMENSION}×${Math.round(BANNER_MAX_DIMENSION / 2)}px 或同比例更高分辨率；上传后长边自动缩至不超过 ${BANNER_MAX_DIMENSION}px。单张原图不超过 3MB。`,
          `Image size: use 2:1 width:height (matches the member sign-in hero). Recommended ${BANNER_MAX_DIMENSION}×${Math.round(BANNER_MAX_DIMENSION / 2)}px or larger at the same ratio; long edge is scaled to max ${BANNER_MAX_DIMENSION}px. Up to 3MB per original file.`,
        )}
      </p>
      <div className="flex flex-wrap items-end gap-4 max-w-xs">
        <div className="space-y-2 flex-1 min-w-[140px]">
          <Label>{t("切换间隔（秒）", "Interval (sec)")}</Label>
          <Input
            type="number"
            min={3}
            max={60}
            value={intervalSec}
            onChange={(e) => {
              const n = Math.floor(Number(e.target.value));
              const v = Number.isFinite(n) ? Math.min(60, Math.max(3, n)) : 5;
              onIntervalSecChange(v);
            }}
          />
        </div>
      </div>
      {slides.length === 0 ? (
        <div className={cn(portalSettingsEmptyShellClass, "py-10")}>
          <div className="relative flex flex-col items-center">
            <div className={cn("mb-3", portalSettingsEmptyIconWrapClass, "h-12 w-12 rounded-2xl")}>
              <Images className="h-6 w-6" strokeWidth={1.75} aria-hidden />
            </div>
            <p className="text-sm font-medium text-foreground">
              {t("暂无自定义幻灯", "No custom slides yet")}
            </p>
            <p className="mt-1.5 max-w-md text-xs leading-relaxed text-muted-foreground">
              {t(
                "点击「新增幻灯」上传配图并填写中英文文案；若列表留空，会员端将使用内置默认轮播。",
                "Tap “Add slide” to upload art and CN/EN copy. If you leave the list empty, the member app uses built-in defaults.",
              )}
            </p>
          </div>
        </div>
      ) : (
        slides.map((slide, idx) => (
          <div key={`login-slide-${idx}`} className="rounded-xl border p-4 space-y-3 bg-muted/20">
            <div className="flex items-center gap-2">
              <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
              <p className="text-sm font-medium flex-1">
                {t("幻灯", "Slide")} #{idx + 1}
              </p>
              <div className="flex items-center gap-1">
                {idx > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() =>
                      onSlidesChange((prev) => {
                        const arr = [...prev];
                        [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
                        return arr;
                      })
                    }
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </Button>
                )}
                {idx < slides.length - 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() =>
                      onSlidesChange((prev) => {
                        const arr = [...prev];
                        [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
                        return arr;
                      })
                    }
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => setRemoveSlideIdx(idx)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">{t("配图", "Hero image")}</Label>
              <input
                ref={(el) => {
                  fileInputRefs.current[idx] = el;
                }}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  void uploadLoginCarouselImage(idx, e.target.files?.[0]);
                  e.currentTarget.value = "";
                }}
              />
              <StaffImageReplaceZone
                idKey={`login-carousel-edit-${idx}-${slide.image_url || "empty"}`}
                imageUrl={slide.image_url}
                frameClassName="aspect-[2/1] w-full max-w-lg min-h-[120px]"
                emptyLabel={t("点击上传配图（2:1）", "Tap to upload (2:1)")}
                replaceLabel={t("更换配图", "Replace image")}
                tapHint={t("点击上方区域上传；也可在下方粘贴图片链接。", "Tap the preview to upload, or paste a URL below.")}
                uploading={uploadingIndex === idx}
                onPick={() => fileInputRefs.current[idx]?.click()}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={slide.image_url}
                  onChange={(e) => updateSlide(idx, { image_url: e.target.value })}
                  placeholder={t("或粘贴图片 URL", "Or paste image URL")}
                  className="min-w-0 flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploadingIndex === idx}
                  className="h-9 shrink-0 gap-1.5 px-3"
                  onClick={() => fileInputRefs.current[idx]?.click()}
                >
                  {uploadingIndex === idx ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  <span className="hidden sm:inline">{t("本地上传", "Upload")}</span>
                </Button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs">{t("标题（中文）", "Title (Chinese)")}</Label>
                <Input value={slide.title_zh} onChange={(e) => updateSlide(idx, { title_zh: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">{t("标题（英文）", "Title (English)")}</Label>
                <Input value={slide.title_en} onChange={(e) => updateSlide(idx, { title_en: e.target.value })} />
              </div>
              <div className="space-y-2 sm:col-span-1">
                <Label className="text-xs">{t("正文（中文）", "Body (Chinese)")}</Label>
                <Textarea rows={2} value={slide.body_zh} onChange={(e) => updateSlide(idx, { body_zh: e.target.value })} />
              </div>
              <div className="space-y-2 sm:col-span-1">
                <Label className="text-xs">{t("正文（英文）", "Body (English)")}</Label>
                <Textarea rows={2} value={slide.body_en} onChange={(e) => updateSlide(idx, { body_en: e.target.value })} />
              </div>
            </div>
          </div>
        ))
      )}

      <AlertDialog open={removeSlideIdx !== null} onOpenChange={(o) => !o && setRemoveSlideIdx(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {removeSlideIdx !== null
                ? t(`删除第 ${removeSlideIdx + 1} 张幻灯？`, `Remove slide #${removeSlideIdx + 1}?`)
                : t("删除幻灯？", "Remove slide?")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "将移除该张幻灯及其配图与文案。保存并发布后会员端才会更新。",
                "Removes this slide’s image and copy. Save and publish to update the member app.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const i = removeSlideIdx;
                setRemoveSlideIdx(null);
                if (i !== null) removeSlide(i);
              }}
            >
              {t("删除", "Remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
