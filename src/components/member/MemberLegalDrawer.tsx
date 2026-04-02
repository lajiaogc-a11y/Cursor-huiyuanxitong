import type { ReactNode } from "react";
import { DrawerDetail } from "@/components/shell/DrawerDetail";

export function MemberLegalDrawer({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <DrawerDetail
      variant="member"
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      sheetMaxWidth="2xl"
    >
      <div className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-[hsl(var(--pu-m-text)/0.9)]">
        {children}
      </div>
    </DrawerDetail>
  );
}
