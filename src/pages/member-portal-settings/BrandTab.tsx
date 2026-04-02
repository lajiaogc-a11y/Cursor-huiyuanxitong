import { useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import { StaffImageReplaceZone } from "@/components/staff/StaffImageReplaceZone";
import type { MemberPortalSettings } from "@/services/members/memberPortalSettingsService";

// ─── 分区标题组件 ──────────────────────────────────────────────────────────────
function SectionTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3 mt-6 first:mt-0", className)}>
      {children}
    </p>
  );
}

interface BrandTabProps {
  settings: MemberPortalSettings;
  onSettingsChange: (patch: Partial<MemberPortalSettings>) => void;
  tenantId: string | null;
  logoPreview: string;
  uploading: boolean;
  onUploadLogo: (file?: File | null) => void;
}

export function BrandTab({
  settings,
  onSettingsChange,
  tenantId,
  logoPreview,
  uploading,
  onUploadLogo,
}: BrandTabProps) {
  const { t } = useLanguage();
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const [confirmRemoveLogoOpen, setConfirmRemoveLogoOpen] = useState(false);

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground -mb-2">
        {t(
          "公司名称与 Logo：同步显示在会员登录页、启动页与首页左上角；登录页文案、轮播与徽章亦在本 Tab 所在「登录设置」中配置。主题色在部分会员端组件中生效。",
          "Company name and logo: shown on member login, splash, and top-left of the home screen. Login copy, carousel, and badges are configured in this Login tab. Theme color applies across parts of the member UI.",
        )}
      </p>
      <Card>
        <CardContent className="pt-5 space-y-4">
          <SectionTitle>{t("基本信息", "Basic Info")}</SectionTitle>
          <div className="space-y-2">
            <Label>{t("公司名字", "Company Name")}</Label>
            <Input
              value={settings.company_name}
              onChange={(e) => onSettingsChange({ company_name: e.target.value })}
              placeholder={t("例如：GC 集团", "e.g. GC Group")}
            />
          </div>
          <div className="space-y-2 max-w-md">
            <Label>{t("主题色", "Theme color")}</Label>
            <div className="flex items-center gap-2">
              <Input
                type="color"
                className="h-10 w-14 cursor-pointer border p-1"
                value={/^#[0-9A-Fa-f]{6}$/.test(settings.theme_primary_color || "") ? settings.theme_primary_color : "#4d8cff"}
                onChange={(e) => onSettingsChange({ theme_primary_color: e.target.value })}
              />
              <Input
                value={settings.theme_primary_color}
                onChange={(e) => onSettingsChange({ theme_primary_color: e.target.value })}
                placeholder="#4d8cff"
                className="font-mono text-sm flex-1"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5 space-y-4">
          <SectionTitle>{t("Logo", "Logo")}</SectionTitle>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                onUploadLogo(file);
                e.currentTarget.value = "";
              }}
            />
            <StaffImageReplaceZone
              idKey={`portal-logo-${tenantId ?? "draft"}`}
              imageUrl={logoPreview}
              frameClassName="h-32 w-32 shrink-0 rounded-2xl"
              emptyLabel={t("点击上传 Logo", "Tap to upload logo")}
              replaceLabel={t("更换 Logo", "Replace logo")}
              tapHint={t("点击预览区域从相册或文件夹选择", "Tap the preview to choose a file")}
              uploading={uploading}
              onPick={() => logoInputRef.current?.click()}
            />
            <div className="min-w-0 flex-1 space-y-2">
              {settings.logo_url ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmRemoveLogoOpen(true)}
                  className="text-muted-foreground"
                >
                  {t("清除 Logo", "Remove logo")}
                </Button>
              ) : null}
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t("建议 512×512 正方形，最大 2MB；悬停或点击预览即可更换。", "512×512 square recommended, max 2MB. Hover or tap the preview to replace.")}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confirmRemoveLogoOpen} onOpenChange={setConfirmRemoveLogoOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("清除 Logo？", "Remove logo?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "将从当前草稿中移除 Logo；需保存并发布后会员端才会更新。",
                "Removes the logo from the current draft; save and publish to update the member app.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setConfirmRemoveLogoOpen(false);
                onSettingsChange({ logo_url: null });
              }}
            >
              {t("清除", "Remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
