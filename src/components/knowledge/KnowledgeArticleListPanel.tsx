import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { TablePagination } from "@/components/ui/table-pagination";
import { Copy, Download, Eye, FileText, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import TableImportButton from "@/components/TableImportButton";
import { formatBeijingMonthDayShort } from "@/lib/beijingTime";
import { cn } from "@/lib/utils";
import { ResolvableMediaThumb } from "@/components/ResolvableMediaThumb";
import type { KnowledgeArticle, KnowledgeCategory } from "@/hooks/staff/useKnowledge";

function cellDash(v: unknown) {
  const s = v != null ? String(v).trim() : "";
  return s ? s : "—";
}

function safeContentStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  return String(v).trim();
}

function getContentTypeLabel(
  type: string,
  t: (zh: string, en?: string) => string,
) {
  switch (type) {
    case "text":
      return t("knowledge.text");
    case "phrase":
      return t("knowledge.phrase");
    case "image":
      return t("knowledge.image");
    default:
      return t("knowledge.text");
  }
}

export interface KnowledgeArticleListPanelProps {
  category: KnowledgeCategory;
  contentType: string;
  filteredArticles: KnowledgeArticle[];
  articles: KnowledgeArticle[];
  articlesLoading: boolean;
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  currentPage: number;
  onPageChange: (p: number) => void;
  pageSize: number;
  onPageSizeChange: (s: number) => void;
  totalPages: number;
  paginatedArticles: KnowledgeArticle[];
  useCompactLayout: boolean;
  language: string;
  canManage: boolean;
  isArticleUnread: (article: KnowledgeArticle) => boolean;
  onViewArticle: (article: KnowledgeArticle) => void;
  onCopyContent: (content: string, e?: React.MouseEvent) => void;
  onOpenAddArticle: () => void;
  onOpenEditArticle: (article: KnowledgeArticle) => void;
  onRequestDeleteArticle: (id: string) => void;
  onRequestExport: () => void;
  onImportComplete: () => void;
  t: (zh: string, en?: string) => string;
}

function ArticleTableRow({
  article,
  index,
  contentType,
  currentPage,
  pageSize,
  unread,
  articleTableGridClass,
  locale,
  canManage,
  onViewArticle,
  onCopyContent,
  onOpenEditArticle,
  onRequestDeleteArticle,
  t,
}: {
  article: KnowledgeArticle;
  index: number;
  contentType: string;
  currentPage: number;
  pageSize: number;
  unread: boolean;
  articleTableGridClass: string;
  locale: string;
  canManage: boolean;
  onViewArticle: (article: KnowledgeArticle) => void;
  onCopyContent: (content: string, e?: React.MouseEvent) => void;
  onOpenEditArticle: (article: KnowledgeArticle) => void;
  onRequestDeleteArticle: (id: string) => void;
  t: (zh: string, en?: string) => string;
}) {
  const sequenceNumber = (currentPage - 1) * pageSize + index + 1;
  const contentText = cellDash(article.content);
  const descText = cellDash(article.description);

  return (
    <div
      className={cn(
        "group border-b border-border/50 last:border-b-0 hover:bg-muted/30 transition-colors cursor-pointer items-start",
        articleTableGridClass,
        unread && "bg-primary/[0.04] border-l-2 border-l-primary",
      )}
      onClick={() => onViewArticle(article)}
    >
      <div className="flex justify-center pt-0.5">
        <span
          className={cn(
            "text-sm font-medium tabular-nums",
            unread ? "text-primary font-semibold" : "text-muted-foreground",
          )}
        >
          {sequenceNumber}
        </span>
      </div>
      <div className="min-w-0 pt-0.5">
        <div className="flex items-start gap-1.5">
          {unread && (
            <span
              className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary shadow-[0_0_0_2px_hsl(var(--primary)/0.2)]"
              aria-hidden
            />
          )}
          <div className="min-w-0 flex-1 space-y-0.5">
            <p
              className={cn(
                "text-sm leading-snug line-clamp-2",
                unread ? "font-semibold text-foreground" : "font-medium text-foreground",
              )}
            >
              {article.title_zh}
            </p>
            {unread && (
              <Badge
                variant="outline"
                className="h-5 shrink-0 px-1.5 text-[10px] font-medium border-primary/50 text-primary w-fit"
              >
                {t("knowledge.unreadBadge")}
              </Badge>
            )}
          </div>
        </div>
      </div>
      <div className="min-w-0 pt-0.5 text-sm text-muted-foreground leading-snug line-clamp-2">
        {cellDash(article.title_en)}
      </div>
      <div className="min-w-0 pt-0.5 text-sm text-muted-foreground leading-snug line-clamp-2">
        {contentType === "image" && !safeContentStr(article.content) ? "—" : contentText}
      </div>
      <div className="min-w-0 pt-0.5">
        <div className="flex items-start gap-2">
          {contentType === "image" && article.image_url ? (
            <div className="w-9 h-7 shrink-0 rounded border bg-muted/30 overflow-hidden mt-0.5">
              <ResolvableMediaThumb
                idKey={`kb-row-${article.id}`}
                url={article.image_url}
                frameClassName="w-full h-full object-cover"
                tone="staff"
              />
            </div>
          ) : null}
          <p className="text-sm text-muted-foreground leading-snug line-clamp-2 flex-1 min-w-0">{descText}</p>
        </div>
      </div>
      <div className="text-[11px] sm:text-xs text-muted-foreground tabular-nums pt-0.5 whitespace-nowrap">
        {formatBeijingMonthDayShort(article.created_at, locale)}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-1 pt-0.5" onClick={(e) => e.stopPropagation()}>
        {(contentType === "text" || contentType === "phrase") && safeContentStr(article.content) ? (
          <Button
            variant="outline"
            size="sm"
            className="h-7 shrink-0 px-2 text-[11px] font-medium gap-1 text-primary border-primary/40 hover:bg-primary/10 hover:text-primary"
            onClick={(e) => onCopyContent(article.content || "", e)}
          >
            <Copy className="h-3 w-3 shrink-0" aria-hidden />
            {t("common.copy")}
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          aria-label="View"
          onClick={(e) => {
            e.stopPropagation();
            onViewArticle(article);
          }}
        >
          <Eye className="h-3.5 w-3.5" />
        </Button>
        {canManage && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-blue-600"
              aria-label="Edit"
              onClick={(e) => {
                e.stopPropagation();
                onOpenEditArticle(article);
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              aria-label="Delete"
              onClick={(e) => {
                e.stopPropagation();
                onRequestDeleteArticle(article.id);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export function KnowledgeArticleListPanel({
  category,
  contentType,
  filteredArticles,
  articles,
  articlesLoading,
  searchQuery,
  onSearchQueryChange,
  currentPage,
  onPageChange,
  pageSize,
  onPageSizeChange,
  totalPages,
  paginatedArticles,
  useCompactLayout,
  language,
  canManage,
  isArticleUnread,
  onViewArticle,
  onCopyContent,
  onOpenAddArticle,
  onOpenEditArticle,
  onRequestDeleteArticle,
  onRequestExport,
  onImportComplete,
  t,
}: KnowledgeArticleListPanelProps) {
  const locale = language === "zh" ? "zh-CN" : "en-US";
  const articleTableGridClass = canManage
    ? "grid gap-x-2 gap-y-1 px-3 py-2 grid-cols-[2rem_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.9fr)_4.5rem_minmax(9rem,auto)]"
    : "grid gap-x-2 gap-y-1 px-3 py-2 grid-cols-[2rem_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.9fr)_4.5rem_minmax(6.5rem,auto)]";

  const tableHeader = (
    <div
      className={cn(
        articleTableGridClass,
        "bg-muted/50 border-b text-[11px] font-semibold text-muted-foreground uppercase tracking-wide items-center",
      )}
    >
      <div className="text-center">{t("序号", "No.")}</div>
      <div>{t("中文标题", "Title (ZH)")}</div>
      <div>{t("英文标题", "Title (EN)")}</div>
      <div>{t("knowledge.content")}</div>
      <div>{t("描述", "Description")}</div>
      <div>{t("发布时间", "Published")}</div>
      <div className="text-right">{t("操作", "Actions")}</div>
    </div>
  );

  return (
    <>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            {getContentTypeLabel(category.content_type, t)}
          </Badge>
          <span className="text-sm text-muted-foreground">
            {t("共", "Total")} {filteredArticles.length} {t("条", "items")}
            {searchQuery && ` (${t("筛选自", "filtered from")} ${articles.length} ${t("条", "items")})`}
          </span>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-none sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              placeholder={t("knowledge.searchPlaceholder")}
              className="h-9 pl-9 pr-8"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
                aria-label="Close"
                onClick={() => onSearchQueryChange("")}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          {canManage && (
            <Button size="sm" className="h-9 gap-1.5 shrink-0" onClick={onOpenAddArticle}>
              <Plus className="h-3.5 w-3.5" />
              {t("新增内容", "Add Content")}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            title={t("导出", "Export")}
            onClick={onRequestExport}
          >
            <Download className="h-4 w-4" />
          </Button>
          {canManage && <TableImportButton tableName="knowledge_articles" onImportComplete={onImportComplete} />}
        </div>
      </div>

      {filteredArticles.length === 0 && !articlesLoading ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <FileText className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground font-medium">
            {searchQuery ? t("未找到匹配内容", "No matching content found") : t("knowledge.noArticles")}
          </p>
          {searchQuery ? (
            <Button variant="link" size="sm" className="mt-2" onClick={() => onSearchQueryChange("")}>
              {t("清除搜索条件", "Clear search")}
            </Button>
          ) : canManage ? (
            <Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={onOpenAddArticle}>
              <Plus className="h-3.5 w-3.5" />
              {t("添加第一条内容", "Add first content")}
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3 relative">
          {articlesLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-[1px] rounded-lg">
              <div className="flex items-center gap-2 text-muted-foreground">
                <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
                <span>{t("common.loading")}</span>
              </div>
            </div>
          )}
          {useCompactLayout ? (
            <div className="space-y-2">
              {paginatedArticles.map((article, index) => {
                const sequenceNumber = (currentPage - 1) * pageSize + index + 1;
                const unread = isArticleUnread(article);
                const contentPreview =
                  contentType === "image" && !safeContentStr(article.content) ? null : safeContentStr(article.content) || null;
                return (
                  <div
                    key={article.id}
                    className={cn(
                      "border rounded-lg bg-card hover:bg-muted/30 transition-colors",
                      unread && "border-primary/40 bg-primary/[0.04]",
                    )}
                  >
                    <div
                      className="cursor-pointer p-3"
                      onClick={() => onViewArticle(article)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onViewArticle(article);
                        }
                      }}
                    >
                      <div className="flex items-start gap-2">
                        <span
                          className={cn(
                            "shrink-0 mt-0.5 text-xs tabular-nums text-muted-foreground",
                            unread && "text-primary font-semibold",
                          )}
                        >
                          #{sequenceNumber}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start gap-1.5 mb-0.5">
                            {unread && (
                              <span className="h-2 w-2 mt-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                            )}
                            <span
                              className={cn(
                                "text-sm leading-snug line-clamp-2 text-foreground",
                                unread && "font-semibold",
                              )}
                            >
                              {article.title_zh}
                            </span>
                            {unread && (
                              <Badge
                                variant="outline"
                                className="h-5 px-1.5 text-[10px] border-primary/50 text-primary shrink-0"
                              >
                                {t("knowledge.unreadBadge")}
                              </Badge>
                            )}
                          </div>
                          {article.title_en && (
                            <p className="text-xs text-muted-foreground line-clamp-1 mb-1">{article.title_en}</p>
                          )}
                          {contentPreview && (
                            <p className="text-xs text-muted-foreground/80 line-clamp-2 mb-1">{contentPreview}</p>
                          )}
                          <div className="flex items-center gap-2 mt-1.5">
                            {contentType === "image" && article.image_url ? (
                              <div className="w-10 h-8 shrink-0 rounded overflow-hidden border bg-muted/30">
                                <ResolvableMediaThumb
                                  idKey={`kb-card-${article.id}`}
                                  url={article.image_url}
                                  frameClassName="w-full h-full object-cover"
                                  tone="staff"
                                />
                              </div>
                            ) : null}
                            {article.description && (
                              <p className="text-[11px] text-muted-foreground/70 line-clamp-1 flex-1 min-w-0 italic">
                                {article.description}
                              </p>
                            )}
                            <span className="shrink-0 text-[10px] text-muted-foreground/60 tabular-nums ml-auto">
                              {formatBeijingMonthDayShort(article.created_at, locale)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div
                      className="flex flex-wrap items-center justify-end gap-1 px-3 pb-2 pt-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {(contentType === "text" || contentType === "phrase") && safeContentStr(article.content) ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 shrink-0 px-2 text-[11px] font-medium gap-1 text-primary border-primary/40 hover:bg-primary/10 hover:text-primary"
                          onClick={(e) => onCopyContent(article.content || "", e)}
                        >
                          <Copy className="h-3 w-3 shrink-0" aria-hidden />
                          {t("common.copy")}
                        </Button>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground"
                        aria-label="View"
                        onClick={() => onViewArticle(article)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      {canManage && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-muted-foreground"
                            aria-label="Edit"
                            onClick={() => onOpenEditArticle(article)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-destructive"
                            aria-label="Delete"
                            onClick={() => onRequestDeleteArticle(article.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="border rounded-lg overflow-x-auto bg-card relative min-h-[20rem]">
              <div className="min-w-[56rem]">
                {tableHeader}
                <div className="divide-y divide-border/50">
                  {paginatedArticles.map((article, index) => (
                    <ArticleTableRow
                      key={article.id}
                      article={article}
                      index={index}
                      contentType={contentType}
                      currentPage={currentPage}
                      pageSize={pageSize}
                      unread={isArticleUnread(article)}
                      articleTableGridClass={articleTableGridClass}
                      locale={locale}
                      canManage={canManage}
                      onViewArticle={onViewArticle}
                      onCopyContent={onCopyContent}
                      onOpenEditArticle={onOpenEditArticle}
                      onRequestDeleteArticle={onRequestDeleteArticle}
                      t={t}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          <TablePagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={filteredArticles.length}
            pageSize={pageSize}
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
            pageSizeOptions={[10, 20, 50, 100]}
          />
        </div>
      )}
    </>
  );
}
