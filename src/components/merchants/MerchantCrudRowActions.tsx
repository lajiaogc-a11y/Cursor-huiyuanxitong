import type { ReactNode } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MerchantFormDrawer } from "@/components/merchants/MerchantFormDrawer";
import { MerchantDeleteAlert } from "@/components/merchants/MerchantDeleteAlert";
import { useLanguage } from "@/contexts/LanguageContext";

export interface MerchantCrudRowActionsProps {
  itemId: string;
  editingId: string | null;
  onOpenEdit: () => void;
  onDrawerOpenChange: (open: boolean) => void;
  onCancelEdit: () => void;
  editTitle: ReactNode;
  onSave: () => void | Promise<void>;
  saving: boolean;
  formContent: ReactNode;
  deleteDescription: string;
  onDeleteConfirm: () => void;
  /** Mobile list: text buttons; table: icon-only */
  density: "comfortable" | "compact";
}

export function MerchantCrudRowActions({
  itemId,
  editingId,
  onOpenEdit,
  onDrawerOpenChange,
  onCancelEdit,
  editTitle,
  onSave,
  saving,
  formContent,
  deleteDescription,
  onDeleteConfirm,
  density,
}: MerchantCrudRowActionsProps) {
  const { t } = useLanguage();
  const isComfortable = density === "comfortable";

  return (
    <>
      <Button
        variant="ghost"
        size={isComfortable ? "sm" : "icon"}
        className={isComfortable ? "h-8 gap-1" : undefined}
        onClick={onOpenEdit}
        aria-label={isComfortable ? undefined : "Edit"}
      >
        <Pencil className={isComfortable ? "h-3.5 w-3.5" : "h-4 w-4"} />
        {isComfortable ? t("common.edit") : null}
      </Button>
      <MerchantFormDrawer
        open={editingId === itemId}
        onOpenChange={onDrawerOpenChange}
        title={editTitle}
        onCancel={onCancelEdit}
        onSave={onSave}
        saving={saving}
      >
        {formContent}
      </MerchantFormDrawer>
      <MerchantDeleteAlert
        description={deleteDescription}
        onConfirm={onDeleteConfirm}
        trigger={
          <Button
            variant="ghost"
            size={isComfortable ? "sm" : "icon"}
            className={isComfortable ? "h-8 gap-1 text-destructive" : "text-destructive"}
            aria-label={isComfortable ? undefined : "Delete"}
          >
            <Trash2 className={isComfortable ? "h-3.5 w-3.5" : "h-4 w-4"} />
            {isComfortable ? t("common.delete") : null}
          </Button>
        }
      />
    </>
  );
}
