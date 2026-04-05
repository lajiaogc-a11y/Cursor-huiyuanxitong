import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CardHeader } from "@/components/ui/card";
import { Search, Download, X } from "lucide-react";
import TableImportButton from "@/components/TableImportButton";
import { MobileFilterBar } from "@/components/ui/mobile-filter-bar";
import { exportTableToXLSX } from "@/services/dataExportImportService";
import { notify } from "@/lib/notifyHub";
import { FilterBar } from "@/components/common";

type TFn = (zh: string, en?: string) => string;

type Props = {
  isMobile: boolean;
  searchDraft: string;
  setSearchDraft: (v: string) => void;
  searchError: string;
  setSearchError: (v: string) => void;
  setFilterQuery: (v: string) => void;
  t: TFn;
  handleRefresh: () => Promise<void>;
  refetch: () => Promise<void>;
  isAdmin: boolean;
  requestExport: (fn: () => void | Promise<void>) => void;
};

export function MemberManagementFilterSection({
  isMobile,
  searchDraft,
  setSearchDraft,
  searchError,
  setSearchError,
  setFilterQuery,
  t,
  handleRefresh,
  refetch,
  isAdmin,
  requestExport,
}: Props) {
  if (isMobile) {
    return (
      <CardHeader className="shrink-0 px-2.5 pb-2 pt-2">
        <div className="space-y-2">
          <MobileFilterBar
            searchValue={searchDraft}
            onSearchChange={(v) => {
              setSearchDraft(v);
              setSearchError("");
            }}
            placeholder={t("members.searchPlaceholder")}
            onRefresh={handleRefresh}
            actions={
              <div className="flex items-center gap-1.5">
                <TableImportButton tableName="members" onImportComplete={refetch} />
                {isAdmin && (
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 shrink-0 touch-manipulation rounded-lg"
                    onClick={() =>
                      requestExport(async () => {
                        const r = await exportTableToXLSX("members", false);
                        if (r.success) notify.success(t("已导出 Excel（.xlsx）", "Exported as Excel (.xlsx)"));
                        else if (r.error) notify.error(r.error);
                      })
                    }
                    aria-label="Export"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                )}
              </div>
            }
          />
          {searchError ? <span className="text-xs text-destructive">{searchError}</span> : null}
        </div>
      </CardHeader>
    );
  }

  return (
    <FilterBar>
      <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative min-w-0 max-w-md flex-1">
          <Search
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none z-[1]"
            aria-hidden
          />
          <Input
            placeholder={t("members.searchPlaceholder")}
            value={searchDraft}
            data-staff-page-search
            onChange={(e) => {
              setSearchDraft(e.target.value);
              setSearchError("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                setFilterQuery(searchDraft);
              }
            }}
            onPaste={(e) => {
              e.preventDefault();
              const raw = e.clipboardData.getData("text");
              const pasted = raw.replace(/[\r\n\t]/g, "").trim();
              setSearchDraft(pasted);
              setSearchError("");
            }}
            className={cn("pl-9 pr-9", searchError && "border-destructive")}
            autoComplete="off"
            name="member-search"
            data-lpignore="true"
            aria-describedby="member-search-hint"
            aria-invalid={!!searchError}
          />
          {searchDraft ? (
            <button
              type="button"
              className="absolute right-2 top-1/2 z-[1] -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => {
                setSearchDraft("");
                setFilterQuery("");
                setSearchError("");
              }}
              aria-label={t("清空搜索", "Clear search")}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
          <p id="member-search-hint" className="mt-1 text-[11px] text-muted-foreground">
            {t("粘贴时会自动去掉空格与符号。", "Paste automatically strips spaces and symbols.")}
          </p>
          {searchError ? (
            <span className="mt-1 block text-xs text-destructive" role="alert">
              {searchError}
            </span>
          ) : null}
        </div>
      </div>
    </FilterBar>
  );
}
