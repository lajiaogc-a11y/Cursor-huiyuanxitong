import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { DrawerDetail } from "@/components/shell/DrawerDetail";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";

export interface MerchantFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  onCancel: () => void;
  onSave: () => void | Promise<void>;
  saving: boolean;
  children: ReactNode;
}

export function MerchantFormDrawer({
  open,
  onOpenChange,
  title,
  onCancel,
  onSave,
  saving,
  children,
}: MerchantFormDrawerProps) {
  const { t } = useLanguage();
  return (
    <DrawerDetail open={open} onOpenChange={onOpenChange} title={title} sheetMaxWidth="xl">
      {children}
      <div className="flex flex-wrap justify-end gap-2 pt-4 mt-4 border-t border-border">
        <Button variant="outline" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button onClick={() => void onSave()} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {t("common.save")}
        </Button>
      </div>
    </DrawerDetail>
  );
}
