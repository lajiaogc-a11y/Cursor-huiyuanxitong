import { useState, useEffect, useMemo } from "react";
import { trackRender } from "@/lib/performanceUtils";
import { useIsMobile, useIsTablet } from "@/hooks/use-mobile";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
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
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import {
  useKnowledgeCategories,
  useKnowledgeArticles,
  KnowledgeCategory,
  KnowledgeArticle,
} from "@/hooks/useKnowledge";

// Get icon for category based on name or type
const getCategoryIcon = (name: string, contentType: string) => {
  const lowerName = name.toLowerCase();
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

/** 公司文档空状态：无分类时显示引导和初始化按钮 */
function EmptyKnowledgeState({
  onSeed,
  onRetry,
  t,
}: {
  onSeed: () => Promise<void>;
  onRetry: () => void;
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
          {t('请初始化默认分类或联系管理员。', 'Initialize default categories or contact admin.')}
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
              {t('初始化中...', 'Initializing...')}
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4 mr-2" />
              {t('初始化默认分类', 'Initialize default categories')}
            </>
          )}
        </Button>
        <Button variant="outline" size="sm" onClick={onRetry}>
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

  const { categories, loading: categoriesLoading, isError: categoriesError, fetchCategories } = useKnowledgeCategories(
    employee?.id,
    isSuperAdmin,
    isPlatformSuperAdmin
  );
  const [activeCategory, setActiveCategory] = useState<string>("");
  const { articles, loading: articlesLoading } = useKnowledgeArticles(
    activeCategory,
    employee?.id,
    isSuperAdmin,
    isPlatformSuperAdmin
  );

  const [selectedArticle, setSelectedArticle] = useState<KnowledgeArticle | null>(null);
  const [isViewArticleOpen, setIsViewArticleOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Set first category as active when loaded
  useEffect(() => {
    if (categories.length > 0 && !activeCategory) {
      setActiveCategory(categories[0].id);
    }
  }, [categories, activeCategory]);

  // 🔧 修复：移除自动批量标记已读，改为点击查看时逐个标记

  // Reset page when category or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeCategory, searchQuery]);

  // Filter and paginate articles
  const filteredArticles = useMemo(() => {
    if (!searchQuery.trim()) return articles;
    const query = searchQuery.toLowerCase();
    return articles.filter(article => 
      article.title_zh.toLowerCase().includes(query) ||
      (article.title_en && article.title_en.toLowerCase().includes(query)) ||
      (article.content && article.content.toLowerCase().includes(query)) ||
      (article.description && article.description.toLowerCase().includes(query))
    );
  }, [articles, searchQuery]);

  const totalPages = Math.ceil(filteredArticles.length / pageSize);
  const paginatedArticles = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredArticles.slice(start, start + pageSize);
  }, [filteredArticles, currentPage, pageSize]);

  const getCurrentCategory = (): KnowledgeCategory | undefined => {
    return categories.find(c => c.id === activeCategory);
  };

  const getCurrentCategoryType = (): 'text' | 'phrase' | 'image' => {
    const category = getCurrentCategory();
    return (category?.content_type as 'text' | 'phrase' | 'image') || 'text';
  };

  const handleViewArticle = (article: KnowledgeArticle) => {
    setSelectedArticle(article);
    setIsViewArticleOpen(true);
  };

  const handleCopyContent = (content: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    navigator.clipboard.writeText(content);
    toast.success(t('knowledge.copiedToClipboard'));
  };

  // Render table header
  const renderTableHeader = () => {
    const contentType = getCurrentCategoryType();
    
    return (
      <div className="grid grid-cols-11 gap-2 px-4 py-3 bg-muted/50 border-b text-xs font-medium text-muted-foreground uppercase tracking-wide">
        <div className="col-span-1 text-center">{t('序号', 'No.')}</div>
        <div className="col-span-2">{t('标题', 'Title')}</div>
        <div className={contentType === 'image' ? 'col-span-4' : 'col-span-5'}>{t('knowledge.content')}</div>
        {contentType === 'image' && <div className="col-span-1">{t('knowledge.imageUpload')}</div>}
        <div className="col-span-1">{t('发布时间', 'Published')}</div>
        <div className="col-span-2 text-right">{t('查看', 'View')}</div>
      </div>
    );
  };

  const ArticleRow = ({ article, index }: { article: KnowledgeArticle; index: number }) => {
    const contentType = getCurrentCategoryType();
    const sequenceNumber = (currentPage - 1) * pageSize + index + 1;

    return (
      <div
        className="group grid grid-cols-11 gap-2 px-4 py-3 border-b border-border/50 last:border-b-0 hover:bg-muted/30 transition-colors cursor-pointer items-center"
        onClick={() => handleViewArticle(article)}
      >
        <div className="col-span-1 flex items-center justify-center">
          <span className="text-sm font-medium text-muted-foreground">{sequenceNumber}</span>
        </div>
        <div className="col-span-2 min-w-0">
          <span className="text-sm font-medium text-foreground truncate block">{article.title_zh}</span>
          {article.title_en && contentType === 'phrase' && (
            <span className="text-xs text-muted-foreground truncate block">{article.title_en}</span>
          )}
        </div>
        <div className={`${contentType === 'image' ? 'col-span-4' : 'col-span-5'} min-w-0`}>
          {contentType === 'text' && article.content && (
            <p className="text-sm text-muted-foreground truncate">{article.content}</p>
          )}
          {contentType === 'phrase' && article.content && (
            <p className="text-sm text-muted-foreground truncate">{article.content}</p>
          )}
          {contentType === 'image' && (
            <p className="text-sm text-muted-foreground truncate">{article.description || '-'}</p>
          )}
        </div>
        {contentType === 'image' && (
          <div className="col-span-1">
            {article.image_url ? (
              <div className="w-10 h-8 rounded overflow-hidden border bg-muted/30">
                <img src={article.image_url} alt={article.title_zh} className="w-full h-full object-cover" />
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">-</span>
            )}
          </div>
        )}
        <div className="col-span-1 text-sm text-muted-foreground">
          {new Date(article.created_at).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' })}
        </div>
        <div className="col-span-2 flex items-center justify-end gap-1">
          {contentType === 'phrase' && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-primary hover:text-primary"
              onClick={(e) => handleCopyContent(article.content || '', e)}
            >
              <Copy className="h-3 w-3 mr-1" />
              {t('common.copy')}
            </Button>
          )}
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
        </div>
      </div>
    );
  };

  const getContentTypeLabel = (type: string) => {
    switch (type) {
      case 'text': return t('knowledge.text');
      case 'phrase': return t('knowledge.phrase');
      case 'image': return t('knowledge.image');
      default: return t('knowledge.text');
    }
  };

  if (categoriesError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-muted-foreground text-sm">{t("公司文档加载失败，请确保后端服务已启动", "Company docs failed to load. Please ensure backend is running.")}</p>
        <Button variant="outline" size="sm" onClick={() => fetchCategories()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          {t("重试", "Retry")}
        </Button>
      </div>
    );
  }

  if (categoriesLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
          <span>{t('common.loading')}</span>
        </div>
      </div>
    );
  }

  // 分类为空时显示引导和初始化按钮
  if (categories.length === 0) {
    return (
      <EmptyKnowledgeState
        onSeed={async () => {
          try {
            const { seedKnowledgeCategories } = await import('@/api/data');
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
        t={t}
      />
    );
  }

  return (
    <div className="space-y-6">

      {/* Main Content */}
      <div className="bg-card rounded-lg border shadow-sm">
        <Tabs value={activeCategory} onValueChange={setActiveCategory} className="w-full">
          {/* Category Navigation with flex-wrap */}
          <div className="border-b bg-muted/30">
            <div className="px-3 sm:px-4 py-3">
              <div className={isMobile ? "space-y-2" : "flex items-start justify-between gap-4"}>
                {/* Category buttons - 2-col grid on mobile, flex-wrap on desktop */}
                <div className={isMobile 
                  ? "grid grid-cols-2 gap-1.5"
                  : "flex flex-wrap gap-2 flex-1"
                }>
                  {categories.map(category => {
                    const IconComponent = getCategoryIcon(category.name, category.content_type);
                    const isActive = activeCategory === category.id;
                    return (
                      <button
                        key={category.id}
                        onClick={() => setActiveCategory(category.id)}
                        className={cn(
                          "flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-all",
                          isMobile ? "truncate" : "sm:gap-2 sm:px-3 sm:py-2 sm:text-sm whitespace-nowrap shrink-0",
                          isActive
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "bg-muted/50 hover:bg-muted text-foreground/70 hover:text-foreground"
                        )}
                      >
                        <IconComponent className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{category.name}</span>
                        {category.visibility === 'private' && (
                          <span className="text-[10px] opacity-70 shrink-0">🔒</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Tab Content */}
          {categories.map(category => (
            <TabsContent 
              key={category.id} 
              value={category.id} 
              className="m-0 p-4 md:p-6"
            >
              {/* Action Bar with Search */}
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
                  {/* Search Input */}
                  <div className="relative flex-1 sm:flex-none sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={t('knowledge.searchPlaceholder')}
                      className="h-9 pl-9 pr-8"
                    />
                    {searchQuery && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
                        onClick={() => setSearchQuery("")}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Articles Table */}
              {articlesLoading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
                    <span>{t('common.loading')}</span>
                  </div>
                </div>
              ) : filteredArticles.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                    <FileText className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <p className="text-muted-foreground font-medium">
                    {searchQuery ? t('未找到匹配内容', 'No matching content found') : t('knowledge.noArticles')}
                  </p>
                  {searchQuery && (
                    <Button variant="link" size="sm" className="mt-2" onClick={() => setSearchQuery("")}>
                      {t('清除搜索条件', 'Clear search')}
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {useCompactLayout ? (
                    /* Mobile: Card-based article list */
                    <div className="space-y-2">
                      {paginatedArticles.map((article, index) => {
                        const contentType = getCurrentCategoryType();
                        const sequenceNumber = (currentPage - 1) * pageSize + index + 1;
                        return (
                          <div
                            key={article.id}
                            className="border rounded-lg p-3 bg-card hover:bg-muted/30 transition-colors cursor-pointer"
                            onClick={() => handleViewArticle(article)}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <span className="text-xs text-muted-foreground">{sequenceNumber}.</span>
                                  <span className="text-sm font-medium truncate">{article.title_zh}</span>
                                </div>
                                {article.content && (
                                  <p className="text-xs text-muted-foreground line-clamp-2">{article.content}</p>
                                )}
                                {contentType === 'image' && article.description && (
                                  <p className="text-xs text-muted-foreground line-clamp-1">{article.description}</p>
                                )}
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {contentType === 'image' && article.image_url && (
                                  <div className="w-10 h-8 rounded overflow-hidden border bg-muted/30">
                                    <img src={article.image_url} alt="" className="w-full h-full object-cover" />
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center justify-between mt-2">
                              <span className="text-[10px] text-muted-foreground">
                                {new Date(article.created_at).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' })}
                              </span>
                              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                {contentType === 'phrase' && (
                                  <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[10px]" onClick={(e) => handleCopyContent(article.content || '', e)}>
                                    <Copy className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="border rounded-lg overflow-hidden bg-card">
                      {renderTableHeader()}
                      <div className="divide-y divide-border/50">
                        {paginatedArticles.map((article, index) => (
                          <ArticleRow key={article.id} article={article} index={index} />
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Pagination */}
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

      {/* View Article Dialog */}
      <Dialog open={isViewArticleOpen} onOpenChange={setIsViewArticleOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedArticle && (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl">{selectedArticle.title_zh}</DialogTitle>
                {selectedArticle.title_en && (
                  <p className="text-muted-foreground">{selectedArticle.title_en}</p>
                )}
              </DialogHeader>
              <div className="py-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
                  <Calendar className="h-4 w-4" />
                  <span>{t('发布于', 'Published on')} {new Date(selectedArticle.created_at).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}</span>
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
                        className="mt-3"
                        onClick={() => handleCopyContent(selectedArticle.content || '')}
                      >
                        <Copy className="h-4 w-4 mr-1.5" />
                        {t('复制内容', 'Copy Content')}
                      </Button>
                    )}
                  </div>
                )}

                {selectedArticle.image_url && (
                  <div className="mt-4">
                    <img
                      src={selectedArticle.image_url}
                      alt={selectedArticle.title_zh}
                      className="max-w-full rounded-lg border cursor-pointer hover:opacity-90 transition-opacity"
                      onClick={() => window.open(selectedArticle.image_url!, '_blank')}
                    />
                    <p className="text-xs text-muted-foreground mt-2 text-center">
                      {t('点击图片查看原图', 'Click image to view original')}
                    </p>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsViewArticleOpen(false)}>
                  {t('common.close')}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
