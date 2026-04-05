import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import type { PortalT } from "@/lib/spinFormatters";

export function PaginationBar({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
  t,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  t: PortalT;
}) {
  const startItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);

  const getVisiblePages = (): (number | "...")[] => {
    const pages: (number | "...")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push("...");
      for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
      if (page < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div className="flex items-center justify-between flex-wrap gap-2 pt-2">
      <span className="text-xs text-muted-foreground">
        {t(`显示 ${startItem}-${endItem}，共 ${total} 条`, `Showing ${startItem}-${endItem} of ${total}`)}
      </span>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronDown className="h-3.5 w-3.5 rotate-90" />
        </Button>
        {getVisiblePages().map((p, i) =>
          p === "..." ? (
            <span key={`dot-${i}`} className="px-1 text-xs text-muted-foreground">
              ...
            </span>
          ) : (
            <Button
              key={p}
              variant={p === page ? "default" : "outline"}
              size="sm"
              className={cn("h-7 w-7 p-0 text-xs", p === page && "pointer-events-none")}
              onClick={() => onPageChange(p as number)}
            >
              {p}
            </Button>
          )
        )}
        <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          <ChevronDown className="h-3.5 w-3.5 -rotate-90" />
        </Button>
      </div>
    </div>
  );
}
