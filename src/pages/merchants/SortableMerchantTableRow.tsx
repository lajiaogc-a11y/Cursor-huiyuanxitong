import {
  TableCell,
  TableRow,
} from "@/components/ui/table";
import { GripVertical } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";

export function SortableMerchantTableRow({
  id,
  children,
  disabled,
}: {
  id: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className={cn(isDragging && "opacity-50 bg-muted")}
      {...attributes}
    >
      <TableCell className="w-10 text-center">
        <button
          type="button"
          className={cn(
            "cursor-grab touch-none p-1 text-muted-foreground hover:text-foreground transition-colors inline-flex",
            isDragging && "cursor-grabbing",
            disabled && "cursor-not-allowed opacity-50"
          )}
          {...listeners}
          disabled={disabled}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </TableCell>
      {children}
    </TableRow>
  );
}
