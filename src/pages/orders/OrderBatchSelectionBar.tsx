import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Props {
  selectedCount: number;
  batchCancelCount: number;
  canBatch: boolean;
  onClearSelection: () => void;
  onBatchClick: () => void;
  t: (zh: string, en: string) => string;
}

export function OrderBatchSelectionBar({
  selectedCount,
  batchCancelCount,
  canBatch,
  onClearSelection,
  onBatchClick,
  t,
}: Props) {
  if (selectedCount === 0) return null;
  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="text-sm text-muted-foreground">
          {t(`已选 ${selectedCount} 条`, `${selectedCount} selected`)}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" onClick={onClearSelection}>
              {t("清空选择", "Clear selection")}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("取消全部勾选", "Clear all checkboxes")}</TooltipContent>
        </Tooltip>
        {canBatch ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={batchCancelCount === 0}
                onClick={onBatchClick}
              >
                {t("批量处理", "Batch process")}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {batchCancelCount === 0
                ? t("所选行中没有「已完成」订单", "No completed orders in selection")
                : t("将所选「已完成」订单批量取消", "Cancel selected completed orders")}
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>
    </TooltipProvider>
  );
}
