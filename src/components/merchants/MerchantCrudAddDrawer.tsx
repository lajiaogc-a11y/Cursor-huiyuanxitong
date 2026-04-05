import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { MerchantFormDrawer } from "@/components/merchants/MerchantFormDrawer";

export interface MerchantCrudAddDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRequestOpen: () => void;
  title: ReactNode;
  onCancel: () => void;
  onSave: () => void | Promise<void>;
  saving: boolean;
  children: ReactNode;
  addButtonContent: ReactNode;
  addButtonClassName?: string;
}

export function MerchantCrudAddDrawer({
  open,
  onOpenChange,
  onRequestOpen,
  title,
  onCancel,
  onSave,
  saving,
  children,
  addButtonContent,
  addButtonClassName = "h-9",
}: MerchantCrudAddDrawerProps) {
  return (
    <>
      <Button size="sm" className={addButtonClassName} onClick={onRequestOpen}>
        {addButtonContent}
      </Button>
      <MerchantFormDrawer
        open={open}
        onOpenChange={onOpenChange}
        title={title}
        onCancel={onCancel}
        onSave={onSave}
        saving={saving}
      >
        {children}
      </MerchantFormDrawer>
    </>
  );
}
