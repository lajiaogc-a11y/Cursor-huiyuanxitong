import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

interface SortableItemProps {
  id: string;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

export function SortableItem({ id, children, className, disabled }: SortableItemProps) {
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
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2",
        isDragging && "opacity-50 z-50",
        className
      )}
      {...attributes}
    >
      <button
        type="button"
        className={cn(
          "cursor-grab touch-none p-1 text-muted-foreground hover:text-foreground transition-colors",
          isDragging && "cursor-grabbing",
          disabled && "cursor-not-allowed opacity-50"
        )}
        {...listeners}
        disabled={disabled}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      {children}
    </div>
  );
}

interface SortableTableRowProps {
  id: string;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

export function SortableTableRow({ id, children, className, disabled }: SortableTableRowProps) {
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
    <tr
      ref={setNodeRef}
      style={style}
      className={cn(
        "border-b transition-colors hover:bg-muted/50",
        isDragging && "opacity-50 bg-muted shadow-lg z-50",
        className
      )}
      {...attributes}
    >
      <td className="w-10 p-2 text-center">
        <button
          type="button"
          className={cn(
            "cursor-grab touch-none p-1 text-muted-foreground hover:text-foreground transition-colors inline-flex items-center justify-center",
            isDragging && "cursor-grabbing",
            disabled && "cursor-not-allowed opacity-50"
          )}
          {...listeners}
          disabled={disabled}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </td>
      {children}
    </tr>
  );
}
