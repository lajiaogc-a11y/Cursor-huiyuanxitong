import { useState, useEffect, useMemo, useCallback } from "react";
import { trackRender } from "@/lib/performanceUtils";
import { useIsMobile, useIsTablet } from "@/hooks/use-mobile";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { BookOpen, RefreshCw, FolderPlus } from "lucide-react";
import { notify } from "@/lib/notifyHub";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { ExportConfirmDialog } from "@/components/ExportConfirmDialog";
import { useExportConfirm } from "@/hooks/useExportConfirm";
import { exportTable } from "@/services/export";
import {
  useKnowledgeCategories,
  useKnowledgeArticles,
  useUnreadCount,
  useArticleReadStatus,
  type KnowledgeCategory,
  type KnowledgeArticle,
} from "@/hooks/useKnowledge";
import { seedKnowledgeCategories } from "@/services/staff/dataApi";
import {
  KnowledgeBaseDrawers,
  type CategoryFormState,
  type ArticleFormState,
} from "@/components/knowledge/KnowledgeBaseDrawers";
import { KnowledgeArticleListPanel } from "@/components/knowledge/KnowledgeArticleListPanel";
import { KnowledgeCategoryNav } from "@/components/knowledge/KnowledgeCategoryNav";

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
          {t("暂无公司文档分类", "No knowledge categories yet")}
        </p>
        <p className="text-sm text-muted-foreground max-w-md">
          {t("请初始化默认分类或手动创建分类。", "Initialize default categories or create one manually.")}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button
          onClick={async () => {
            setSeeding(true);
            try {
              await onSeed();
            } finally {
              setSeeding(false);
            }
          }}
          disabled={seeding}
        >
          {seeding ? (
            <>
              <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full mr-2" />
              {t("初始化中...", "Initializing...")}
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4 mr-2" />
              {t("初始化默认分类", "Initialize default categories")}
            </>
          )}
        </Button>
        <Button variant="outline" onClick={onAddCategory}>
          <FolderPlus className="h-4 w-4 mr-2" />
          {t("手动创建分类", "Create Category")}
        </Button>
        <Button variant="ghost" size="sm" onClick={onRetry}>
          <RefreshCw className="h-4 w-4 mr-2" />
          {t("重试", "Retry")}
        </Button>
      </div>
    </div>
  );
}

export default function KnowledgeBase() {
  trackRender("KnowledgeBase");
  const { employee } = useAuth();
  const { t, language } = useLanguage();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const useCompactLayout = isMobile || isTablet;

  const isSuperAdmin = employee?.is_super_admin === true;
  const isPlatformSuperAdmin = employee?.is_platform_super_admin === true;
  const isAdmin = employee?.role === "admin" || isSuperAdmin || isPlatformSuperAdmin;
  const isManager = employee?.role === "manager";
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
    fetchArticles,
    addArticle,
    updateArticle,
    deleteArticle,
  } = useKnowledgeArticles(activeCategory, employee?.id, isSuperAdmin, isPlatformSuperAdmin);

  const { markAsRead, unreadByCategory, unreadCount, markAllAsRead } = useUnreadCount();
  const { readArticleIds } = useArticleReadStatus();
  const kbExportConfirm = useExportConfirm();

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
  const [markAllReadOpen, setMarkAllReadOpen] = useState(false);
  const [markAllReadSubmitting, setMarkAllReadSubmitting] = useState(false);

  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<KnowledgeCategory | null>(null);
  const [categoryForm, setCategoryForm] = useState<CategoryFormState>({
    name: "",
    content_type: "text",
    visibility: "public",
  });
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null);
  const [savingCategory, setSavingCategory] = useState(false);

  const [isArticleDialogOpen, setIsArticleDialogOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<KnowledgeArticle | null>(null);
  const [articleForm, setArticleForm] = useState<ArticleFormState>({
    title_zh: "",
    title_en: "",
    content: "",
    description: "",
    image_url: "",
    is_published: true,
    visibility: "public",
  });
  const [deletingArticleId, setDeletingArticleId] = useState<string | null>(null);

  useEffect(() => {
    if (categories.length > 0 && !activeCategory) {
      setActiveCategory(categories[0].id);
    }
  }, [categories, activeCategory]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeCategory, searchQuery]);

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
    const cat = categories.find((c) => c.id === activeCategory);
    return cat?.content_type || "text";
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
    void navigator.clipboard.writeText(String(content ?? ""));
    notify.success(t("已复制到剪贴板", "Copied to clipboard"));
  };

  const openAddCategory = () => {
    setEditingCategory(null);
    setCategoryForm({ name: "", content_type: "text", visibility: "public" });
    setIsCategoryDialogOpen(true);
  };

  const openEditCategory = (cat: KnowledgeCategory) => {
    setEditingCategory(cat);
    setCategoryForm({
      name: String(cat.name ?? ""),
      content_type: cat.content_type,
      visibility: cat.visibility,
    });
    setIsCategoryDialogOpen(true);
  };

  const handleSaveCategory = async () => {
    if (!categoryForm.name.trim()) {
      notify.error(t("请输入分类名称", "Please enter category name"));
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
        ok = await addCategory(
          categoryForm.name.trim(),
          categoryForm.content_type,
          categoryForm.visibility,
          employee?.id,
        );
      }
      if (ok) {
        setIsCategoryDialogOpen(false);
        setEditingCategory(null);
        setCategoryForm({ name: "", content_type: "text", visibility: "public" });
      }
    } catch (err) {
      console.error("handleSaveCategory error:", err);
      notify.error(t("保存失败，请重试", "Save failed. Please try again."));
    } finally {
      setSavingCategory(false);
    }
  };

  const handleDeleteCategory = async () => {
    if (!deletingCategoryId) return;
    await deleteCategory(deletingCategoryId);
    if (activeCategory === deletingCategoryId) {
      setActiveCategory(categories.find((c) => c.id !== deletingCategoryId)?.id || "");
    }
    setDeletingCategoryId(null);
  };

  const openAddArticle = () => {
    setEditingArticle(null);
    setArticleForm({
      title_zh: "",
      title_en: "",
      content: "",
      description: "",
      image_url: "",
      is_published: true,
      visibility: "public",
    });
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
      notify.error(t("请输入标题", "Please enter title"));
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
        visibility: articleForm.visibility as "public" | "private",
      });
    }
    setIsArticleDialogOpen(false);
  };

  const handleDeleteArticle = async () => {
    if (!deletingArticleId) return;
    await deleteArticle(deletingArticleId);
    setDeletingArticleId(null);
  };

  if (categoriesError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-muted-foreground text-sm">
          {t("公司文档加载失败，请确保后端服务已启动", "Company docs failed to load.")}
        </p>
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
                <div
                  key={i}
                  className="h-9 rounded-lg bg-muted animate-pulse"
                  style={{ width: `${80 + i * 12}px` }}
                />
              ))}
            </div>
          </div>
          <div className="p-6 space-y-3">
            <div className="flex justify-between items-center">
              <div className="h-5 w-24 bg-muted animate-pulse rounded" />
              <div className="h-9 w-64 bg-muted animate-pulse rounded" />
            </div>
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-12 w-full bg-muted animate-pulse rounded"
                style={{ opacity: 1 - i * 0.15 }}
              />
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
              notify.success(t("已初始化默认分类", "Default categories initialized"));
              fetchCategories();
            } else {
              notify.info(result.message || t("已有分类或需管理员权限", "Categories exist or admin required"));
              fetchCategories();
            }
          } catch {
            notify.error(t("初始化失败，请确保以管理员身份登录", "Init failed. Please login as admin"));
            fetchCategories();
          }
        }}
        onRetry={fetchCategories}
        onAddCategory={openAddCategory}
        t={t}
      />
    );
  }

  const localeForTime = language === "zh" ? "zh-CN" : "en-US";

  return (
    <div className="space-y-6">
      <div className="bg-card rounded-lg border shadow-sm">
        <Tabs value={activeCategory} onValueChange={setActiveCategory} className="w-full">
          <KnowledgeCategoryNav
            categories={categories}
            activeCategory={activeCategory}
            onActiveCategoryChange={setActiveCategory}
            unreadByCategory={unreadByCategory}
            unreadCount={unreadCount}
            canManage={canManage}
            isMobile={isMobile}
            employeeId={employee?.id != null ? String(employee.id) : undefined}
            onOpenAddCategory={openAddCategory}
            onOpenEditCategory={openEditCategory}
            onRequestDeleteCategory={setDeletingCategoryId}
            onMarkAllReadOpen={() => setMarkAllReadOpen(true)}
            t={t}
          />

          {categories.map((category) => (
            <TabsContent key={category.id} value={category.id} className="m-0 p-4 md:p-6">
              <KnowledgeArticleListPanel
                category={category}
                contentType={getCurrentCategoryType()}
                filteredArticles={filteredArticles}
                articles={articles}
                articlesLoading={articlesLoading}
                searchQuery={searchQuery}
                onSearchQueryChange={setSearchQuery}
                currentPage={currentPage}
                onPageChange={setCurrentPage}
                pageSize={pageSize}
                onPageSizeChange={setPageSize}
                totalPages={totalPages}
                paginatedArticles={paginatedArticles}
                useCompactLayout={useCompactLayout}
                language={language}
                canManage={canManage}
                isArticleUnread={isArticleUnread}
                onViewArticle={handleViewArticle}
                onCopyContent={handleCopyContent}
                onOpenAddArticle={openAddArticle}
                onOpenEditArticle={openEditArticle}
                onRequestDeleteArticle={setDeletingArticleId}
                onRequestExport={() =>
                  kbExportConfirm.requestExport(() => void exportTable("knowledge_articles", language === "en", "xlsx"))
                }
                onImportComplete={() => fetchArticles()}
                t={t}
              />
            </TabsContent>
          ))}
        </Tabs>
      </div>

      <KnowledgeBaseDrawers
        t={t}
        localeForTime={localeForTime}
        isViewArticleOpen={isViewArticleOpen}
        onViewArticleOpenChange={setIsViewArticleOpen}
        selectedArticle={selectedArticle}
        isArticleUnread={isArticleUnread}
        activeContentType={getCurrentCategoryType()}
        onCopyContent={handleCopyContent}
        canManage={canManage}
        onCloseViewAndEdit={(article) => {
          setIsViewArticleOpen(false);
          openEditArticle(article);
        }}
        isCategoryDialogOpen={isCategoryDialogOpen}
        onCategoryDialogOpenChange={(open) => {
          setIsCategoryDialogOpen(open);
          if (!open) {
            setEditingCategory(null);
            setCategoryForm({ name: "", content_type: "text", visibility: "public" });
            setSavingCategory(false);
          }
        }}
        editingCategory={editingCategory}
        categoryForm={categoryForm}
        setCategoryForm={setCategoryForm}
        savingCategory={savingCategory}
        onSaveCategory={handleSaveCategory}
        isArticleDialogOpen={isArticleDialogOpen}
        onArticleDialogOpenChange={setIsArticleDialogOpen}
        editingArticle={editingArticle}
        articleForm={articleForm}
        setArticleForm={setArticleForm}
        onSaveArticle={handleSaveArticle}
        deletingCategoryId={deletingCategoryId}
        onDeletingCategoryOpenChange={(open) => {
          if (!open) setDeletingCategoryId(null);
        }}
        onConfirmDeleteCategory={handleDeleteCategory}
        deletingArticleId={deletingArticleId}
        onDeletingArticleOpenChange={(open) => {
          if (!open) setDeletingArticleId(null);
        }}
        onConfirmDeleteArticle={handleDeleteArticle}
        markAllReadOpen={markAllReadOpen}
        onMarkAllReadOpenChange={setMarkAllReadOpen}
        markAllReadSubmitting={markAllReadSubmitting}
        setMarkAllReadSubmitting={setMarkAllReadSubmitting}
        markAllAsRead={markAllAsRead}
      />

      <ExportConfirmDialog
        open={kbExportConfirm.open}
        onOpenChange={kbExportConfirm.handleOpenChange}
        onConfirm={kbExportConfirm.handleConfirm}
      />
    </div>
  );
}
