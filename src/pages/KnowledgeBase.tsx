import { useState, useEffect, useMemo, useCallback } from "react";
import { trackRender } from "@/lib/performanceUtils";
import { useIsMobile, useIsTablet } from "@/hooks/use-mobile";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DrawerDetail } from "@/components/shell/DrawerDetail";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TablePagination } from "@/components/ui/table-pagination";
import { 
  Copy, 
  Image, 
  FileText, 
  MessageSquare, 
  Bell,
  BookOpen,
  CreditCard,
  MessageCircle,
  Calendar,
  Eye,
  X,
  Search,
  RefreshCw,
  Plus,
  Pencil,
  Trash2,
  FolderPlus,
  Settings2,
  ImageOff,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Download } from "lucide-react";
import TableImportButton from "@/components/TableImportButton";
import { ExportConfirmDialog } from "@/components/ExportConfirmDialog";
import { useExportConfirm } from "@/hooks/useExportConfirm";
import { exportTable } from "@/services/export";
import { formatBeijingTime, formatBeijingMonthDayShort } from "@/lib/beijingTime";
import { cn } from "@/lib/utils";
import { ResolvableMediaThumb } from "@/components/ResolvableMediaThumb";
import { useMemberResolvableMedia } from "@/hooks/useMemberResolvableMedia";
import { resolveMemberMediaUrl } from "@/lib/memberMediaUrl";
import {
  useKnowledgeCategories,
  useKnowledgeArticles,
  useUnreadCount,
  useArticleReadStatus,
  KnowledgeCategory,
  KnowledgeArticle,
} from "@/hooks/useKnowledge";
import { seedKnowledgeCategories } from "@/services/staff/dataApi";

const getCategoryIcon = (name: string | null | undefined, contentType: string) => {
  const lowerName = String(name ?? "").toLowerCase();
  if (lowerName.includes('通知') || lowerName.includes('公告')) return Bell;
  if (lowerName.includes('知识') || lowerName.includes('学习')) return BookOpen;
  if (lowerName.includes('兑卡') || lowerName.includes('卡')) return CreditCard;
  if (lowerName.includes('话术') || lowerName.includes('话')) return MessageCircle;
  
  switch (contentType) {
    case 'text': return FileText;
    case 'phrase': return MessageSquare;
    case 'image': return Image;
    default: return FileText;
  }
};

function EmptyKnowledgeState({
  onSeed,
  onRetry,
  onAddCategory,
  t,
}: {
  onSeed: () => Promise<void>;
  onRetry: () => void;
  onAddCategory: () => void;
  t: (zh: string, en?: string) => string;
}) {
  const [seeding, setSeeding] = useState(false);
  return (
    <div className="flex flex-col items-center justify-center min-h-[320px] gap-6 p-8">
      <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center">
        <BookOpen className="h-10 w-10 text-muted-foreground" />
      </div>
      <div className="text-center space-y-2">
        <p className="font-medium text-foreground">
          {t('暂无公司文档分类', 'No knowledge categories yet')}
        </p>
        <p className="text-sm text-muted-foreground max-w-md">
          {t('请初始化默认分类或手动创建分类。', 'Initialize default categories or create one manually.')}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button
          onClick={async () => {
            setSeeding(true);
            try { await onSeed(); } finally { setSeeding(false); }
          }}
          disabled={seeding}
        >
          {seeding ? (
            <>
              <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full mr-2" />
              {t('初始化中...', 'Initializing...')}
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4 mr-2" />
              {t('初始化默认分类', 'Initialize default categories')}
            </>
          )}
        </Button>
        <Button variant="outline" onClick={onAddCategory}>
          <FolderPlus className="h-4 w-4 mr-2" />
          {t('手动创建分类', 'Create Category')}
        </Button>
        <Button variant="ghost" size="sm" onClick={onRetry}>
          <RefreshCw className="h-4 w-4 mr-2" />
          {t('重试', 'Retry')}
        </Button>
      </div>
    </div>
  );
}

export default function KnowledgeBase() {
  trackRender('KnowledgeBase');
  const { employee } = useAuth();
  const { t, language } = useLanguage();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const useCompactLayout = isMobile || isTablet;
  
  const isSuperAdmin = employee?.is_super_admin === true;
  const isPlatformSuperAdmin = employee?.is_platform_super_admin === true;
  const isAdmin = employee?.role === 'admin' || isSuperAdmin || isPlatformSuperAdmin;
  const isManager = employee?.role === 'manager';
  const canManage = isAdmin || isManager;

  const {
    categories,
    loading: categoriesLoading,
    isError: categoriesError,
    fetchCategories,
    addCategory,
    updateCategory,
    deleteCategory,
  } = useKnowledgeCategories(employee?.id, isSuperAdmin, isPlatformSuperAdmin);

  const [activeCategory, setActiveCategory] = useState<string>("");

  const {
    articles,
    loading: articlesLoading,
    addArticle,
    updateArticle,
    deleteArticle,
  } = useKnowledgeArticles(activeCategory, employee?.id, isSuperAdmin, isPlatformSuperAdmin);

  const { markAsRead, unreadByCategory } = useUnreadCount();
  const { readArticleIds } = useArticleReadStatus();
  const kbExportConfirm = useExportConfirm();

  /** 与后端未读统计一致：非本人发布且未在读记录中（ID 统一为字符串，避免接口数字/字符串不一致） */
  const isArticleUnread = useCallback(
    (article: KnowledgeArticle) => {
      if (!employee?.id) return false;
      const me = String(employee.id);
      const author = article.created_by != null ? String(article.created_by) : "";
      if (author === me) return false;
      return !readArticleIds.has(String(article.id));
    },
    [employee?.id, readArticleIds],
  );

  const [selectedArticle, setSelectedArticle] = useState<KnowledgeArticle | null>(null);
  const [isViewArticleOpen, setIsViewArticleOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Category CRUD dialogs
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<KnowledgeCategory | null>(null);
  const [categoryForm, setCategoryForm] = useState({ name: "", content_type: "text" as 'text' | 'phrase' | 'image', visibility: "public" as 'public' | 'private' });
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null);
  const [savingCategory, setSavingCategory] = useState(false);

  // Article CRUD dialogs
  const [isArticleDialogOpen, setIsArticleDialogOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<KnowledgeArticle | null>(null);
  const [articleForm, setArticleForm] = useState({
    title_zh: "", title_en: "", content: "", description: "", image_url: "", is_published: true, visibility: "public" as 'public' | 'private',
  });
  const [deletingArticleId, setDeletingArticleId] = useState<string | null>(null);

  useEffect(() => {
    if (categories.length > 0 && !activeCategory) {
      setActiveCategory(categories[0].id);
    }
  }, [categories, activeCategory]);

  useEffect(() => { setCurrentPage(1); }, [activeCategory, searchQuery]);

  const filteredArticles = useMemo(() => {
    if (!searchQuery.trim()) return articles;
    const q = searchQuery.toLowerCase();
    const hay = (v: unknown) => String(v ?? "").toLowerCase();
    return articles.filter(
      (a) =>
        hay(a.title_zh).includes(q) ||
        hay(a.title_en).includes(q) ||
        hay(a.content).includes(q) ||
        hay(a.description).includes(q),
    );
  }, [articles, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredArticles.length / pageSize));
  const paginatedArticles = filteredArticles.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const getCurrentCategoryType = () => {
    const cat = categories.find(c => c.id === activeCategory);
    return cat?.content_type || 'text';
  };

  const handleViewArticle = (article: KnowledgeArticle) => {
    setSelectedArticle(article);
    setIsViewArticleOpen(true);
    const me = employee?.id != null ? String(employee.id) : "";
    const author = article.created_by != null ? String(article.created_by) : "";
    if (me && author !== me) {
      void markAsRead(String(article.id), String(article.category_id));
    }
  };

  const handleCopyContent = (content: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    navigator.clipboard.writeText(String(content ?? ""));
    toast.success(t('已复制到剪贴板', 'Copied to clipboard'));
  };

  // ---- Category management ----
  const openAddCategory = () => {
    setEditingCategory(null);
    setCategoryForm({ name: "", content_type: "text", visibility: "public" });
    setIsCategoryDialogOpen(true);
  };

  const openEditCategory = (cat: KnowledgeCategory) => {
    setEditingCategory(cat);
    setCategoryForm({ name: String(cat.name ?? ""), content_type: cat.content_type, visibility: cat.visibility });
    setIsCategoryDialogOpen(true);
  };

  const handleSaveCategory = async () => {
    if (!categoryForm.name.trim()) {
      toast.error(t("请输入分类名称", "Please enter category name"));
      return;
    }
    if (savingCategory) return;
    setSavingCategory(true);
    try {
      let ok: boolean;
      if (editingCategory) {
        ok = await updateCategory(editingCategory.id, {
          name: categoryForm.name.trim(),
          content_type: categoryForm.content_type,
          visibility: categoryForm.visibility,
        });
      } else {
        ok = await addCategory(categoryForm.name.trim(), categoryForm.content_type, categoryForm.visibility, employee?.id);
      }
      if (ok) {
        setIsCategoryDialogOpen(false);
        setEditingCategory(null);
        setCategoryForm({ name: "", content_type: "text", visibility: "public" });
      }
    } catch (err) {
      console.error("handleSaveCategory error:", err);
      toast.error(t("保存失败，请重试", "Save failed. Please try again."));
    } finally {
      setSavingCategory(false);
    }
  };

  const handleDeleteCategory = async () => {
    if (!deletingCategoryId) return;
    await deleteCategory(deletingCategoryId);
    if (activeCategory === deletingCategoryId) {
      setActiveCategory(categories.find(c => c.id !== deletingCategoryId)?.id || "");
    }
    setDeletingCategoryId(null);
  };

  // ---- Article management ----
  const openAddArticle = () => {
    setEditingArticle(null);
    setArticleForm({ title_zh: "", title_en: "", content: "", description: "", image_url: "", is_published: true, visibility: "public" });
    setIsArticleDialogOpen(true);
  };

  const openEditArticle = (article: KnowledgeArticle) => {
    setEditingArticle(article);
    setArticleForm({
      title_zh: article.title_zh || "",
      title_en: article.title_en || "",
      content: article.content || "",
      description: article.description || "",
      image_url: article.image_url || "",
      is_published: article.is_published,
      visibility: article.visibility || "public",
    });
    setIsArticleDialogOpen(true);
  };

  const handleSaveArticle = async () => {
    if (!articleForm.title_zh.trim()) {
      toast.error(t("请输入标题", "Please enter title"));
      return;
    }
    if (editingArticle) {
      await updateArticle(editingArticle.id, {
        title_zh: articleForm.title_zh.trim(),
        title_en: articleForm.title_en.trim() || null,
        content: articleForm.content || null,
        description: articleForm.description || null,
        image_url: articleForm.image_url || null,
        is_published: articleForm.is_published,
        visibility: articleForm.visibility,
      });
    } else {
      await addArticle({
        category_id: activeCategory,
        title_zh: articleForm.title_zh.trim(),
        title_en: articleForm.title_en.trim() || null,
        content: articleForm.content || null,
        description: articleForm.description || null,
        image_url: articleForm.image_url || null,
        sort_order: articles.length + 1,
        is_published: articleForm.is_published,
        visibility: articleForm.visibility as 'public' | 'private',
      });
    }
    setIsArticleDialogOpen(false);
  };

  const handleDeleteArticle = async () => {
    if (!deletingArticleId) return;
    await deleteArticle(deletingArticleId);
    setDeletingArticleId(null);
  };

  const getContentTypeLabel = (type: string) => {
    switch (type) {
      case 'text': return t('knowledge.text');
      case 'phrase': return t('knowledge.phrase');
      case 'image': return t('knowledge.image');
      default: return t('knowledge.text');
    }
  };

  /** 表格空值占位（文本 / 话术 / 图片统一列） */
  const cellDash = (v: string | null | undefined) => {
    const s = v != null ? String(v).trim() : "";
    return s ? s : "—";
  };

  /** 桌面端：文本·话术·图片同一套列宽 */
  const articleTableGridClass = canManage
    ? "grid gap-x-2 gap-y-1 px-3 py-2 grid-cols-[2.25rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,1fr)_4.75rem_minmax(10.5rem,1fr)]"
    : "grid gap-x-2 gap-y-1 px-3 py-2 grid-cols-[2.25rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,1fr)_4.75rem_minmax(7.5rem,1fr)]";

  const renderTableHeader = () => (
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

  const ArticleRow = ({ article, index }: { article: KnowledgeArticle; index: number }) => {
    const contentType = getCurrentCategoryType();
    const sequenceNumber = (currentPage - 1) * pageSize + index + 1;
    const unread = isArticleUnread(article);
    const contentText = cellDash(article.content);
    const descText = cellDash(article.description);

    return (
      <div
        className={cn(
          "group border-b border-border/50 last:border-b-0 hover:bg-muted/30 transition-colors cursor-pointer items-start",
          articleTableGridClass,
          unread && "bg-primary/[0.04] border-l-2 border-l-primary",
        )}
        onClick={() => handleViewArticle(article)}
      >
        <div className="flex justify-center pt-0.5">
          <span className={cn("text-sm font-medium tabular-nums", unread ? "text-primary font-semibold" : "text-muted-foreground")}>
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
              <p className={cn("text-sm leading-snug line-clamp-2", unread ? "font-semibold text-foreground" : "font-medium text-foreground")}>
                {article.title_zh}
              </p>
              {unread && (
                <Badge variant="outline" className="h-5 shrink-0 px-1.5 text-[10px] font-medium border-primary/50 text-primary w-fit">
                  {t("knowledge.unreadBadge")}
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="min-w-0 pt-0.5 text-sm text-muted-foreground leading-snug line-clamp-2">{cellDash(article.title_en)}</div>
        <div className="min-w-0 pt-0.5 text-sm text-muted-foreground leading-snug line-clamp-2">
          {contentType === "image" && !article.content?.trim() ? "—" : contentText}
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
          {formatBeijingMonthDayShort(article.created_at, language === "zh" ? "zh-CN" : "en-US")}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1 pt-0.5" onClick={(e) => e.stopPropagation()}>
          {(contentType === "text" || contentType === "phrase") && article.content?.trim() ? (
            <Button
              variant="outline"
              size="sm"
              className="h-7 shrink-0 px-2 text-[11px] font-medium gap-1 text-primary border-primary/40 hover:bg-primary/10 hover:text-primary"
              onClick={(e) => handleCopyContent(article.content || "", e)}
            >
              <Copy className="h-3 w-3 shrink-0" aria-hidden />
              {t("common.copy")}
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              handleViewArticle(article);
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
                onClick={(e) => {
                  e.stopPropagation();
                  openEditArticle(article);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeletingArticleId(article.id);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>
    );
  };

  if (categoriesError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-muted-foreground text-sm">{t("公司文档加载失败，请确保后端服务已启动", "Company docs failed to load.")}</p>
        <Button variant="outline" size="sm" onClick={() => fetchCategories()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          {t("重试", "Retry")}
        </Button>
      </div>
    );
  }

  if (categoriesLoading) {
    return (
      <div className="space-y-6">
        <div className="bg-card rounded-lg border shadow-sm">
          <div className="border-b bg-muted/30 px-4 py-3">
            <div className="flex gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-9 rounded-lg bg-muted animate-pulse" style={{ width: `${80 + i * 12}px` }} />
              ))}
            </div>
          </div>
          <div className="p-6 space-y-3">
            <div className="flex justify-between items-center">
              <div className="h-5 w-24 bg-muted animate-pulse rounded" />
              <div className="h-9 w-64 bg-muted animate-pulse rounded" />
            </div>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 w-full bg-muted animate-pulse rounded" style={{ opacity: 1 - i * 0.15 }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (categories.length === 0) {
    return (
      <EmptyKnowledgeState
        onSeed={async () => {
          try {
            const result = await seedKnowledgeCategories();
            if (result.seeded) {
              toast.success(t('已初始化默认分类', 'Default categories initialized'));
              fetchCategories();
            } else {
              toast.info(result.message || t('已有分类或需管理员权限', 'Categories exist or admin required'));
              fetchCategories();
            }
          } catch (e) {
            toast.error(t('初始化失败，请确保以管理员身份登录', 'Init failed. Please login as admin'));
            fetchCategories();
          }
        }}
        onRetry={fetchCategories}
        onAddCategory={openAddCategory}
        t={t}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-card rounded-lg border shadow-sm">
        <Tabs value={activeCategory} onValueChange={setActiveCategory} className="w-full">
          {/* Category Navigation */}
          <div className="border-b bg-muted/30">
            <div className="px-3 sm:px-4 py-3">
              <div className={isMobile ? "space-y-2" : "flex items-start justify-between gap-4"}>
                <div className={isMobile ? "grid grid-cols-2 gap-1.5" : "flex flex-wrap gap-2 flex-1"}>
                  {categories.map(category => {
                    const IconComponent = getCategoryIcon(category.name, category.content_type);
                    const isActive = activeCategory === category.id;
                    const catUnread = unreadByCategory[category.id] ?? 0;
                    return (
                      <div key={category.id} className="relative group/cat">
                        <button
                          onClick={() => setActiveCategory(category.id)}
                          className={cn(
                            "flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-all w-full",
                            isMobile ? "truncate" : "sm:gap-2 sm:px-3 sm:py-2 sm:text-sm whitespace-nowrap shrink-0",
                            isActive
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "bg-muted/50 hover:bg-muted text-foreground/70 hover:text-foreground"
                          )}
                        >
                          <IconComponent className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{category.name}</span>
                          {catUnread > 0 && (
                            <span
                              className={cn(
                                "shrink-0 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center tabular-nums",
                                isActive
                                  ? "bg-primary-foreground/20 text-primary-foreground"
                                  : "bg-destructive text-destructive-foreground",
                              )}
                            >
                              {catUnread > 99 ? "99+" : catUnread}
                            </span>
                          )}
                          {category.visibility === 'private' && (
                            <span className="text-[10px] opacity-70 shrink-0">&#128274;</span>
                          )}
                        </button>
                        {canManage && isActive && (
                          <div className="absolute -top-1 -right-1 flex gap-0.5 opacity-0 group-hover/cat:opacity-100 transition-opacity z-10">
                            <button
                              className="h-5 w-5 rounded-full bg-blue-500 text-white flex items-center justify-center hover:bg-blue-600 shadow-sm"
                              onClick={(e) => { e.stopPropagation(); openEditCategory(category); }}
                            >
                              <Pencil className="h-2.5 w-2.5" />
                            </button>
                            <button
                              className="h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center hover:bg-destructive/80 shadow-sm"
                              onClick={(e) => { e.stopPropagation(); setDeletingCategoryId(category.id); }}
                            >
                              <Trash2 className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {canManage && (
                    <button
                      onClick={openAddCategory}
                      className={cn(
                        "flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-all border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 hover:text-primary text-muted-foreground",
                        isMobile ? "" : "sm:gap-2 sm:px-3 sm:py-2 sm:text-sm whitespace-nowrap shrink-0"
                      )}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {t('新增分类', 'Add Category')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Tab Content */}
          {categories.map(category => (
            <TabsContent key={category.id} value={category.id} className="m-0 p-4 md:p-6">
              {/* Action Bar */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    {getContentTypeLabel(category.content_type)}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {t('共', 'Total')} {filteredArticles.length} {t('条', 'items')}
                    {searchQuery && ` (${t('筛选自', 'filtered from')} ${articles.length} ${t('条', 'items')})`}
                  </span>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <div className="relative flex-1 sm:flex-none sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={t('knowledge.searchPlaceholder')}
                      className="h-9 pl-9 pr-8"
                    />
                    {searchQuery && (
                      <Button variant="ghost" size="sm"
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
                        onClick={() => setSearchQuery("")}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  {canManage && (
                    <Button size="sm" className="h-9 gap-1.5 shrink-0" onClick={openAddArticle}>
                      <Plus className="h-3.5 w-3.5" />
                      {t('新增内容', 'Add Content')}
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" title={t('导出', 'Export')} onClick={() => kbExportConfirm.requestExport(() => exportTable('knowledge_articles', 'xlsx'))}>
                    <Download className="h-4 w-4" />
                  </Button>
                  {canManage && <TableImportButton tableName="knowledge_articles" onImportComplete={() => fetchArticles()} />}
                </div>
              </div>

              {/* Articles */}
              {filteredArticles.length === 0 && !articlesLoading ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                    <FileText className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <p className="text-muted-foreground font-medium">
                    {searchQuery ? t('未找到匹配内容', 'No matching content found') : t('knowledge.noArticles')}
                  </p>
                  {searchQuery ? (
                    <Button variant="link" size="sm" className="mt-2" onClick={() => setSearchQuery("")}>
                      {t('清除搜索条件', 'Clear search')}
                    </Button>
                  ) : canManage ? (
                    <Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={openAddArticle}>
                      <Plus className="h-3.5 w-3.5" />
                      {t('添加第一条内容', 'Add first content')}
                    </Button>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-3 relative">
                  {articlesLoading && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-[1px] rounded-lg">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
                        <span>{t('common.loading')}</span>
                      </div>
                    </div>
                  )}
                  {useCompactLayout ? (
                    <div className="space-y-2">
                      {paginatedArticles.map((article, index) => {
                        const contentType = getCurrentCategoryType();
                        const sequenceNumber = (currentPage - 1) * pageSize + index + 1;
                        const unread = isArticleUnread(article);
                        const contentPreview =
                          contentType === "image" && !article.content?.trim()
                            ? "—"
                            : cellDash(article.content);
                        return (
                          <div
                            key={article.id}
                            className={cn(
                              "border rounded-lg p-3 bg-card hover:bg-muted/30 transition-colors",
                              unread && "border-primary/40 bg-primary/[0.04]",
                            )}
                          >
                            <div
                              className="cursor-pointer space-y-2"
                              onClick={() => handleViewArticle(article)}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  handleViewArticle(article);
                                }
                              }}
                            >
                              <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground uppercase tracking-wide">
                                <span className={cn("tabular-nums", unread && "text-primary font-semibold")}>
                                  {t("序号", "No.")} {sequenceNumber}
                                </span>
                                <span className="tabular-nums normal-case">
                                  {formatBeijingMonthDayShort(article.created_at, language === "zh" ? "zh-CN" : "en-US")}
                                </span>
                              </div>
                              <div>
                                <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">
                                  {t("中文标题", "Title (ZH)")}
                                </div>
                                <div className="flex items-start gap-1.5 flex-wrap">
                                  {unread && <span className="h-2 w-2 mt-1 shrink-0 rounded-full bg-primary" aria-hidden />}
                                  <span className={cn("text-sm leading-snug line-clamp-2", unread && "font-semibold")}>
                                    {article.title_zh}
                                  </span>
                                  {unread && (
                                    <Badge variant="outline" className="h-5 px-1.5 text-[10px] border-primary/50 text-primary shrink-0">
                                      {t("knowledge.unreadBadge")}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              <div>
                                <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">
                                  {t("英文标题", "Title (EN)")}
                                </div>
                                <p className="text-xs text-muted-foreground line-clamp-2">{cellDash(article.title_en)}</p>
                              </div>
                              <div>
                                <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">
                                  {t("knowledge.content")}
                                </div>
                                <p className="text-xs text-muted-foreground line-clamp-3">{contentPreview}</p>
                              </div>
                              <div>
                                <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">
                                  {t("描述", "Description")}
                                </div>
                                <div className="flex items-start gap-2">
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
                                  <p className="text-xs text-muted-foreground line-clamp-2 flex-1 min-w-0">
                                    {cellDash(article.description)}
                                  </p>
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center justify-end gap-1 mt-2 pt-2 border-t border-border/50" onClick={(e) => e.stopPropagation()}>
                              {(contentType === "text" || contentType === "phrase") && article.content?.trim() ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 shrink-0 px-2 text-[11px] font-medium gap-1 text-primary border-primary/40 hover:bg-primary/10 hover:text-primary"
                                  onClick={(e) => handleCopyContent(article.content || "", e)}
                                >
                                  <Copy className="h-3 w-3 shrink-0" aria-hidden />
                                  {t("common.copy")}
                                </Button>
                              ) : null}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-muted-foreground"
                                onClick={() => handleViewArticle(article)}
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                              {canManage && (
                                <>
                                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground" onClick={() => openEditArticle(article)}>
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => setDeletingArticleId(article.id)}>
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
                      {articlesLoading && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-card/60 backdrop-blur-[1px]">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
                            <span>{t('common.loading')}</span>
                          </div>
                        </div>
                      )}
                      <div className="min-w-[72rem]">
                        {renderTableHeader()}
                        <div className="divide-y divide-border/50">
                          {paginatedArticles.map((article, index) => (
                            <ArticleRow key={article.id} article={article} index={index} />
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
                    onPageChange={setCurrentPage}
                    onPageSizeChange={setPageSize}
                    pageSizeOptions={[10, 20, 50, 100]}
                  />
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>

      <DrawerDetail
        open={isViewArticleOpen}
        onOpenChange={setIsViewArticleOpen}
        title={
          selectedArticle ? (
            <span className="text-xl flex flex-wrap items-center gap-2">
              {selectedArticle.title_zh}
              {isArticleUnread(selectedArticle) && (
                <Badge variant="outline" className="text-xs font-normal border-primary/50 text-primary">
                  {t("knowledge.unreadBadge")}
                </Badge>
              )}
            </span>
          ) : (
            ""
          )
        }
        description={selectedArticle?.title_en || undefined}
        sheetMaxWidth="2xl"
      >
          {selectedArticle && (
            <>
              <div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
                  <Calendar className="h-4 w-4" />
                  <span>{t('发布于', 'Published on')} {formatBeijingTime(selectedArticle.created_at)}</span>
                </div>
                {selectedArticle.description && (
                  <p className="text-muted-foreground mb-4">{selectedArticle.description}</p>
                )}
                {selectedArticle.content && (
                  <div className="prose prose-sm max-w-none dark:prose-invert">
                    <div className="bg-muted/50 rounded-lg p-4 whitespace-pre-wrap">
                      {selectedArticle.content}
                    </div>
                    {getCurrentCategoryType() === 'phrase' && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-4 h-9 gap-2 text-primary border-primary/50 hover:bg-primary/10 hover:text-primary"
                        onClick={() => handleCopyContent(selectedArticle.content || '')}
                      >
                        <Copy className="h-4 w-4 shrink-0" aria-hidden />
                        {t('复制内容', 'Copy Content')}
                      </Button>
                    )}
                  </div>
                )}
                {selectedArticle.image_url ? (
                  <KnowledgeArticleDrawerImage article={selectedArticle} t={t} />
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2 pt-4 mt-4 border-t border-border">
                {canManage && (
                  <Button variant="outline" onClick={() => {
                    setIsViewArticleOpen(false);
                    openEditArticle(selectedArticle);
                  }}>
                    <Pencil className="h-4 w-4 mr-1.5" />
                    {t('编辑', 'Edit')}
                  </Button>
                )}
                <Button variant="outline" onClick={() => setIsViewArticleOpen(false)}>
                  {t('common.close')}
                </Button>
              </div>
            </>
          )}
      </DrawerDetail>

      <DrawerDetail
        open={isCategoryDialogOpen}
        onOpenChange={(open) => {
          setIsCategoryDialogOpen(open);
          if (!open) {
            setEditingCategory(null);
            setCategoryForm({ name: "", content_type: "text", visibility: "public" });
            setSavingCategory(false);
          }
        }}
        title={
          <span className="flex items-center gap-2">
            {editingCategory ? <Settings2 className="h-5 w-5 shrink-0" /> : <FolderPlus className="h-5 w-5 shrink-0" />}
            {editingCategory ? t('编辑分类', 'Edit Category') : t('新增分类', 'New Category')}
          </span>
        }
        sheetMaxWidth="xl"
      >
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('分类名称', 'Category Name')} *</Label>
              <Input
                value={categoryForm.name}
                onChange={e => setCategoryForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder={t('输入分类名称', 'Enter category name')}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('内容类型', 'Content Type')}</Label>
              <Select value={categoryForm.content_type} onValueChange={v => setCategoryForm(prev => ({ ...prev, content_type: v as KnowledgeCategory['content_type'] }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">{t('文本', 'Text')}</SelectItem>
                  <SelectItem value="phrase">{t('话术', 'Phrase')}</SelectItem>
                  <SelectItem value="image">{t('图片', 'Image')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('可见性', 'Visibility')}</Label>
              <Select value={categoryForm.visibility} onValueChange={v => setCategoryForm(prev => ({ ...prev, visibility: v as KnowledgeCategory['visibility'] }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">{t('公开', 'Public')}</SelectItem>
                  <SelectItem value="private">{t('私有', 'Private')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2 pt-4 mt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsCategoryDialogOpen(false)} disabled={savingCategory}>
              {t('取消', 'Cancel')}
            </Button>
            <Button type="button" onClick={() => void handleSaveCategory()} disabled={savingCategory}>
              {savingCategory ? (
                <>
                  <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full mr-2" />
                  {t('保存中...', 'Saving...')}
                </>
              ) : editingCategory ? (
                t('保存', 'Save')
              ) : (
                t('创建', 'Create')
              )}
            </Button>
          </div>
      </DrawerDetail>

      <DrawerDetail
        open={isArticleDialogOpen}
        onOpenChange={setIsArticleDialogOpen}
        title={
          <span className="flex items-center gap-2">
            {editingArticle ? <Pencil className="h-5 w-5 shrink-0" /> : <Plus className="h-5 w-5 shrink-0" />}
            {editingArticle ? t('编辑内容', 'Edit Content') : t('新增内容', 'New Content')}
          </span>
        }
        sheetMaxWidth="xl"
      >
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('中文标题', 'Chinese Title')} *</Label>
              <Input
                value={articleForm.title_zh}
                onChange={e => setArticleForm(prev => ({ ...prev, title_zh: e.target.value }))}
                placeholder={t('输入标题', 'Enter title')}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('英文标题', 'English Title')}</Label>
              <Input
                value={articleForm.title_en}
                onChange={e => setArticleForm(prev => ({ ...prev, title_en: e.target.value }))}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-2">
              <Label>{t('内容', 'Content')}</Label>
              <Textarea
                value={articleForm.content}
                onChange={e => setArticleForm(prev => ({ ...prev, content: e.target.value }))}
                placeholder={t('输入内容', 'Enter content')}
                rows={6}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('描述', 'Description')}</Label>
              <Input
                value={articleForm.description}
                onChange={e => setArticleForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder={t('可选', 'Optional')}
              />
            </div>
            {getCurrentCategoryType() === 'image' && (
              <div className="space-y-2">
                <Label>{t('图片链接', 'Image URL')}</Label>
                <Input
                  value={articleForm.image_url}
                  onChange={e => setArticleForm(prev => ({ ...prev, image_url: e.target.value }))}
                  placeholder="https://..."
                />
                {articleForm.image_url && (
                  <div className="w-32 h-24 rounded border overflow-hidden bg-muted">
                    <ResolvableMediaThumb
                      idKey={`kb-form-${editingArticle?.id ?? "new"}`}
                      url={articleForm.image_url}
                      frameClassName="w-full h-full object-cover"
                      tone="staff"
                    />
                  </div>
                )}
              </div>
            )}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  checked={articleForm.is_published}
                  onCheckedChange={v => setArticleForm(prev => ({ ...prev, is_published: v }))}
                />
                <Label className="text-sm">{t('发布', 'Published')}</Label>
              </div>
              <div className="flex items-center gap-2">
                <Select value={articleForm.visibility} onValueChange={v => setArticleForm(prev => ({ ...prev, visibility: v as KnowledgeArticle['visibility'] }))}>
                  <SelectTrigger className="w-24 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">{t('公开', 'Public')}</SelectItem>
                    <SelectItem value="private">{t('私有', 'Private')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2 pt-4 mt-4 border-t border-border">
            <Button variant="outline" onClick={() => setIsArticleDialogOpen(false)}>
              {t('取消', 'Cancel')}
            </Button>
            <Button onClick={handleSaveArticle}>
              {editingArticle ? t('保存', 'Save') : t('发布', 'Publish')}
            </Button>
          </div>
      </DrawerDetail>

      {/* Delete Category Confirmation */}
      <AlertDialog open={!!deletingCategoryId} onOpenChange={() => setDeletingCategoryId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('确认删除分类', 'Delete Category')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('删除分类将同时删除该分类下的所有内容，此操作不可撤销。', 'Deleting this category will also delete all its content. This cannot be undone.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('取消', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteCategory} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('删除', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Article Confirmation */}
      <AlertDialog open={!!deletingArticleId} onOpenChange={() => setDeletingArticleId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('确认删除', 'Confirm Delete')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('此操作不可撤销，确定要删除这条内容吗？', 'This action cannot be undone. Delete this content?')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('取消', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteArticle} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('删除', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ExportConfirmDialog open={kbExportConfirm.open} onOpenChange={kbExportConfirm.handleOpenChange} onConfirm={kbExportConfirm.handleConfirm} />
    </div>
  );
}
