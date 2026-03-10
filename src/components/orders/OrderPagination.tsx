/**
 * 订单分页控件 - 固定每页50条
 * 纯 UI 组件
 */
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface OrderPaginationProps {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  jumpToPage: string;
  onJumpToPageChange: (v: string) => void;
  onJumpToPage: () => void;
  t: (zh: string, en: string) => string;
}

export function OrderPagination({
  currentPage,
  totalPages,
  totalCount,
  pageSize,
  onPageChange,
  jumpToPage,
  onJumpToPageChange,
  onJumpToPage,
  t,
}: OrderPaginationProps) {
  if (totalCount <= 0) return null;

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>{t("每页", "Per page")} {pageSize} {t("条", "items")}</span>
        <span className="ml-4">{t("共", "Total")} {totalCount} {t("条", "items")}</span>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
        >
          {t("上一页", "Previous")}
        </Button>
        <span className="text-sm">
          {t("第", "Page")} <strong>{currentPage}</strong> / {totalPages || 1} {t("页", "")}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage >= totalPages}
        >
          {t("下一页", "Next")}
        </Button>
        <div className="flex items-center gap-1 ml-2">
          <span className="text-sm">{t("跳至", "Go to")}</span>
          <Input
            type="number"
            min={1}
            max={totalPages}
            value={jumpToPage}
            onChange={(e) => onJumpToPageChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onJumpToPage()}
            className="w-16 h-8 text-center"
            placeholder=""
          />
          <span className="text-sm">{t("页", "page")}</span>
          <Button variant="outline" size="sm" onClick={onJumpToPage}>
            {t("确定", "OK")}
          </Button>
        </div>
      </div>
    </div>
  );
}
