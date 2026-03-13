import { useState, useEffect, useMemo, useCallback } from "react";
import { trackRender } from "@/lib/performanceUtils";
import { useIsMobile, useIsTablet } from "@/hooks/use-mobile";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, arrayMove, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { TablePagination } from "@/components/ui/table-pagination";
import { 
  Plus, 
  Copy, 
  Trash2, 
  Pencil, 
  Image, 
  FileText, 
  MessageSquare, 
  Settings, 
  Check, 
  Bell,
  BookOpen,
  CreditCard,
  MessageCircle,
  ChevronRight,
  Calendar,
  Eye,
  Upload,
  X,
  GripVertical,
  Search,
  ChevronLeft,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import {
  useKnowledgeCategories,
  useKnowledgeArticles,
  useUnreadCount,
  useArticleReadStatus,
  uploadKnowledgeImage,
  KnowledgeCategory,
  KnowledgeArticle,
} from "@/hooks/useKnowledge";
import { useModulePermissions } from "@/hooks/useFieldPermissions";

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

// Sortable Category Item Component for drag-and-drop
function SortableCategoryItem({ 
  category, 
  IconComponent, 
  onUpdate, 
  onDelete, 
  getContentTypeLabel 
}: { 
  category: KnowledgeCategory; 
  IconComponent: React.ElementType;
  onUpdate: (id: string, updates: Partial<KnowledgeCategory>) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  getContentTypeLabel: (type: string) => string;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(category.name);
  const [editType, setEditType] = useState<'text' | 'phrase' | 'image'>(category.content_type);
  
  const { t } = useLanguage();
  
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.id, disabled: isEditing });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  
  const handleSave = async () => {
    if (!editName.trim()) {
      toast.error(t('knowledge.categoryNameEmpty'));
      return;
    }
    const success = await onUpdate(category.id, { 
      name: editName,
      content_type: editType 
    });
    if (success) {
      setIsEditing(false);
    }
  };
  
  const handleCancel = () => {
    setEditName(category.name);
    setEditType(category.content_type);
    setIsEditing(false);
  };
  
  if (isEditing) {
    return (
      <div 
        ref={setNodeRef} 
        style={style} 
        className={cn("flex items-center gap-2 p-3 rounded-lg bg-background border", isDragging && "opacity-50")}
      >
        <div className="text-muted-foreground cursor-not-allowed">
          <GripVertical className="h-4 w-4" />
        </div>
        <Input
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          className="flex-1 h-8"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
            if (e.key === 'Escape') handleCancel();
          }}
        />
        <Select value={editType} onValueChange={(v) => setEditType(v as any)}>
          <SelectTrigger className="w-20 h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="text">{t('knowledge.text')}</SelectItem>
            <SelectItem value="phrase">{t('knowledge.phrase')}</SelectItem>
            <SelectItem value="image">{t('knowledge.image')}</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-success" onClick={handleSave}>
          <Check className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleCancel}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }
  
  return (
    <div 
      ref={setNodeRef} 
      style={style}
      className={cn(
        "flex items-center justify-between p-3 rounded-lg bg-background border",
        isDragging && "opacity-50 shadow-lg z-50"
      )}
      {...attributes}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          className={cn(
            "cursor-grab touch-none p-1 text-muted-foreground hover:text-foreground transition-colors",
            isDragging && "cursor-grabbing"
          )}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center">
          <IconComponent className="h-4 w-4 text-primary" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{category.name}</span>
          <Badge variant="outline" className="text-xs">
            {getContentTypeLabel(category.content_type)}
          </Badge>
          {category.visibility === 'private' && (
            <Badge variant="secondary" className="text-xs bg-warning/20 text-warning-foreground">
              仅自己可见
            </Badge>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8 text-muted-foreground hover:text-primary"
          onClick={() => setIsEditing(true)}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('knowledge.confirmDeleteCategory')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('knowledge.deleteCategoryWarning')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => onDelete(category.id)}
                className="bg-destructive text-destructive-foreground"
              >
                {t('common.delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

export default function KnowledgeBase() {
  trackRender('KnowledgeBase');
  const { employee } = useAuth();
  const { t, language, formatDate } = useLanguage();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const useCompactLayout = isMobile || isTablet;
  
  // 使用权限系统替代硬编码的角色检查
  const { permissions: knowledgePermissions, canViewField, canEditField, canDeleteField } = useModulePermissions('knowledge_base');
  
  // 权限检查：总管理员始终有全部权限
  const isSuperAdmin = employee?.is_super_admin === true;
  const isPlatformSuperAdmin = employee?.is_platform_super_admin === true;
  const canViewArticles = isSuperAdmin || canViewField('view_articles');
  const canCreateArticles = isSuperAdmin || canEditField('create_articles');
  const canEditArticles = isSuperAdmin || canEditField('edit_articles');
  const canDeleteArticles = isSuperAdmin || canDeleteField('delete_articles');
  const canManageCategories = isSuperAdmin || canEditField('manage_categories');
  const canCreatePublicCategories = isSuperAdmin || canEditField('create_public_categories');

  const { categories, loading: categoriesLoading, addCategory, updateCategory, deleteCategory, reorderCategories } = useKnowledgeCategories(
    employee?.id,
    isSuperAdmin,
    isPlatformSuperAdmin
  );
  const [activeCategory, setActiveCategory] = useState<string>("");
  const { articles, loading: articlesLoading, fetchArticles, addArticle, updateArticle, deleteArticle, updateArticleSortOrders } = useKnowledgeArticles(
    activeCategory,
    employee?.id,
    isSuperAdmin,
    isPlatformSuperAdmin
  );

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // New category visibility state
  const [newCategoryVisibility, setNewCategoryVisibility] = useState<'public' | 'private'>('private');
  const { markAsRead, markAllAsRead } = useUnreadCount();
  const { readArticleIds } = useArticleReadStatus();
  
  // Article form visibility state
  const [articleVisibility, setArticleVisibility] = useState<'public' | 'private'>('public');

  // Dialog states
  const [isManageCategoryOpen, setIsManageCategoryOpen] = useState(false);
  const [isAddArticleOpen, setIsAddArticleOpen] = useState(false);
  const [isEditArticleOpen, setIsEditArticleOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<KnowledgeArticle | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<KnowledgeArticle | null>(null);
  const [isViewArticleOpen, setIsViewArticleOpen] = useState(false);

  // Search and pagination states
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Form states
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryType, setNewCategoryType] = useState<'text' | 'phrase' | 'image'>('text');
  const [articleForm, setArticleForm] = useState({
    title_zh: "",
    title_en: "",
    content: "",
    description: "",
    image_url: "",
    visibility: 'public' as 'public' | 'private',
  });
  const [isUploading, setIsUploading] = useState(false);

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

  // Handle drag end for article sorting
  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      const oldIndex = paginatedArticles.findIndex(a => a.id === active.id);
      const newIndex = paginatedArticles.findIndex(a => a.id === over.id);
      
      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(paginatedArticles, oldIndex, newIndex);
        const updates = newOrder.map((article, index) => ({
          id: article.id,
          sort_order: (currentPage - 1) * pageSize + index + 1,
        }));
        
        const success = await updateArticleSortOrders(updates);
        if (success) {
          toast.success(t("排序已更新", "Sort order updated"));
        }
      }
    }
  }, [paginatedArticles, updateArticleSortOrders, currentPage, pageSize, t]);

  const getCurrentCategory = (): KnowledgeCategory | undefined => {
    return categories.find(c => c.id === activeCategory);
  };

  const getCurrentCategoryType = (): 'text' | 'phrase' | 'image' => {
    const category = getCurrentCategory();
    return (category?.content_type as 'text' | 'phrase' | 'image') || 'text';
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) {
      toast.error(t('knowledge.enterCategoryName'));
      return;
    }
    // Only users with create_public_categories permission can create public categories
    const visibility = canCreatePublicCategories ? newCategoryVisibility : 'private';
    const success = await addCategory(newCategoryName, newCategoryType, visibility, employee?.id);
    if (success) {
      setNewCategoryName("");
      setNewCategoryType('text');
      setNewCategoryVisibility('private');
    }
  };

  const handleAddArticle = async () => {
    if (!articleForm.title_zh.trim()) {
      toast.error(t('knowledge.enterTitleZh'));
      return;
    }
    
    const success = await addArticle({
      category_id: activeCategory,
      title_zh: articleForm.title_zh,
      title_en: articleForm.title_en || null,
      content: articleForm.content || null,
      description: articleForm.description || null,
      image_url: articleForm.image_url || null,
      sort_order: 0,
      is_published: true,
      visibility: isSuperAdmin ? articleForm.visibility : 'private', // Non-super admin articles are private by default
    });

    if (success) {
      resetArticleForm();
      setIsAddArticleOpen(false);
    }
  };

  const handleUpdateArticle = async () => {
    if (!editingArticle) return;
    
    const success = await updateArticle(editingArticle.id, {
      title_zh: articleForm.title_zh,
      title_en: articleForm.title_en || null,
      content: articleForm.content || null,
      description: articleForm.description || null,
      image_url: articleForm.image_url || null,
    });

    if (success) {
      resetArticleForm();
      setIsEditArticleOpen(false);
      setEditingArticle(null);
    }
  };

  // Check if user can edit/delete this article
  const canEditThisArticle = (article: KnowledgeArticle) => {
    if (isSuperAdmin) return true; // Super admin can edit all
    return article.created_by === employee?.id; // Others can only edit their own
  };

  const handleEditClick = (article: KnowledgeArticle, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingArticle(article);
    setArticleForm({
      title_zh: article.title_zh,
      title_en: article.title_en || "",
      content: article.content || "",
      description: article.description || "",
      image_url: article.image_url || "",
      visibility: article.visibility || 'public',
    });
    setIsEditArticleOpen(true);
  };

  const handleViewArticle = (article: KnowledgeArticle) => {
    setSelectedArticle(article);
    setIsViewArticleOpen(true);
    
    // 🔧 修复：只对公开文章标记已读，点击查看时才计为已读
    if (article.visibility === 'public') {
      markAsRead(article.id);
    }
  };

  const resetArticleForm = () => {
    setArticleForm({
      title_zh: "",
      title_en: "",
      content: "",
      description: "",
      image_url: "",
      visibility: 'public',
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    toast.info(t('knowledge.uploadConverting'));
    const url = await uploadKnowledgeImage(file);
    if (url) {
      setArticleForm(prev => ({ ...prev, image_url: url }));
      toast.success(t('knowledge.uploadSuccess'));
    }
    setIsUploading(false);
  };

  const handleCopyContent = (content: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    navigator.clipboard.writeText(content);
    toast.success(t('knowledge.copiedToClipboard'));
  };

  const renderArticleForm = () => {
    const contentType = editingArticle 
      ? (categories.find(c => c.id === editingArticle.category_id)?.content_type as 'text' | 'phrase' | 'image') || 'text'
      : getCurrentCategoryType();

    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label className="text-sm font-medium">{t('knowledge.titleZh')} <span className="text-destructive">*</span></Label>
          <Input
            value={articleForm.title_zh}
            onChange={(e) => setArticleForm(prev => ({ ...prev, title_zh: e.target.value }))}
            placeholder={t('knowledge.titlePlaceholder')}
            className="h-10"
          />
        </div>

        {contentType === 'phrase' && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">{t('knowledge.titleEn')}</Label>
            <Input
              value={articleForm.title_en}
              onChange={(e) => setArticleForm(prev => ({ ...prev, title_en: e.target.value }))}
              placeholder={t('knowledge.titleEnPlaceholder')}
              className="h-10"
            />
          </div>
        )}

        {(contentType === 'text' || contentType === 'phrase') && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              {contentType === 'phrase' ? t('knowledge.phraseContent') : t('knowledge.textContent')}
            </Label>
            <Textarea
              value={articleForm.content}
              onChange={(e) => setArticleForm(prev => ({ ...prev, content: e.target.value }))}
              placeholder={contentType === 'phrase' ? t('knowledge.phrasePlaceholder') : t('knowledge.contentPlaceholder')}
              rows={8}
              className="resize-none"
            />
          </div>
        )}

        {contentType === 'image' && (
          <>
            <div className="space-y-2">
              <Label className="text-sm font-medium">{t('knowledge.description')}</Label>
              <Textarea
                value={articleForm.description}
                onChange={(e) => setArticleForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder={t('knowledge.descPlaceholder')}
                rows={3}
                className="resize-none"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">{t('knowledge.imageUpload')}</Label>
              <div className="space-y-3">
                {articleForm.image_url ? (
                  <div className="relative rounded-lg border overflow-hidden bg-muted">
                    <img
                      src={articleForm.image_url}
                      alt="Preview"
                      className="max-w-full max-h-64 mx-auto object-contain"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute top-2 right-2 h-8 w-8"
                      onClick={() => setArticleForm(prev => ({ ...prev, image_url: "" }))}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <Label className="cursor-pointer block">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleImageUpload}
                      disabled={isUploading}
                    />
                    <div className="border-2 border-dashed rounded-lg p-8 text-center hover:bg-muted/50 transition-colors">
                      <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">
                        {isUploading ? t('knowledge.uploading') : t('knowledge.uploadHint')}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {t('knowledge.uploadNote')}
                      </p>
                    </div>
                  </Label>
                )}
              </div>
            </div>
          </>
        )}

        {/* Visibility selector - only for Super Admin */}
        {isSuperAdmin && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">{t('knowledge.visibility')}</Label>
            <Select 
              value={articleForm.visibility} 
              onValueChange={(v: 'public' | 'private') => setArticleForm(prev => ({ ...prev, visibility: v }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">{t('knowledge.visibilityPublic')}</SelectItem>
                <SelectItem value="private">{t('knowledge.visibilityPrivate')}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {articleForm.visibility === 'public' 
                ? t('knowledge.visibilityPublicDesc')
                : t('knowledge.visibilityPrivateDesc')
              }
            </p>
          </div>
        )}
        
        {/* Notice for non-Super Admin */}
        {!isSuperAdmin && (
          <div className="p-3 bg-muted rounded-lg text-sm text-muted-foreground">
            {t('knowledge.privateOnlyNotice')}
          </div>
        )}
      </div>
    );
  };

  // Render table header
  const renderTableHeader = () => {
    const contentType = getCurrentCategoryType();
    
    return (
      <div className="grid grid-cols-12 gap-2 px-4 py-3 bg-muted/50 border-b text-xs font-medium text-muted-foreground uppercase tracking-wide">
        <div className="col-span-1 w-10"></div>
        <div className="col-span-1 text-center">{t('序号', 'No.')}</div>
        <div className="col-span-2">{t('标题', 'Title')}</div>
        <div className={contentType === 'image' ? 'col-span-4' : 'col-span-5'}>{t('knowledge.content')}</div>
        {contentType === 'image' && <div className="col-span-1">{t('knowledge.imageUpload')}</div>}
        <div className="col-span-1">{t('发布时间', 'Published')}</div>
        <div className="col-span-2 text-right">{t('common.actions')}</div>
      </div>
    );
  };

  // SortableArticleRow - uses useSortable hook for drag and drop
  const SortableArticleRow = ({ article, index }: { article: KnowledgeArticle; index: number }) => {
    const contentType = getCurrentCategoryType();
    const sequenceNumber = (currentPage - 1) * pageSize + index + 1;
    // 🔧 新增：判断文章是否未读（公开文章 + 不是自己发布的 + 未在已读列表中）
    const isUnread = article.visibility === 'public' && article.created_by !== employee?.id && !readArticleIds.has(article.id);
    
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: article.id });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
    };

    return (
      <div 
        ref={setNodeRef}
        style={style}
        className={cn(
          "group grid grid-cols-12 gap-2 px-4 py-3 border-b border-border/50 last:border-b-0 hover:bg-muted/30 transition-colors cursor-pointer items-center",
          isDragging && "opacity-50 bg-muted shadow-lg z-50"
        )}
        onClick={() => handleViewArticle(article)}
        {...attributes}
      >
        {/* Drag Handle */}
        <div className="col-span-1 flex items-center justify-center">
          <button
            type="button"
            className={cn(
              "cursor-grab touch-none p-1 text-muted-foreground hover:text-foreground transition-colors",
              isDragging && "cursor-grabbing"
            )}
            onClick={(e) => e.stopPropagation()}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        </div>

        {/* Sequence Number with unread dot */}
        <div className="col-span-1 flex items-center justify-center gap-1">
          {isUnread && <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 animate-pulse" />}
          <span className="text-sm font-medium text-muted-foreground">{sequenceNumber}</span>
        </div>

        {/* Title Column */}
        <div className="col-span-2 min-w-0">
          <span className={cn("text-sm text-foreground truncate block", isUnread ? "font-bold" : "font-medium")}>
            {article.title_zh}
          </span>
          {article.title_en && contentType === 'phrase' && (
            <span className="text-xs text-muted-foreground truncate block">
              {article.title_en}
            </span>
          )}
        </div>
        
        {/* Content Column */}
        <div className={`${contentType === 'image' ? 'col-span-4' : 'col-span-5'} min-w-0`}>
          {contentType === 'text' && article.content && (
            <p className="text-sm text-muted-foreground truncate">
              {article.content}
            </p>
          )}
          {contentType === 'phrase' && article.content && (
            <p className="text-sm text-muted-foreground truncate">
              {article.content}
            </p>
          )}
          {contentType === 'image' && (
            <p className="text-sm text-muted-foreground truncate">
              {article.description || '-'}
            </p>
          )}
        </div>

        {/* Image Thumbnail (only for image type) */}
        {contentType === 'image' && (
          <div className="col-span-1">
            {article.image_url ? (
              <div className="w-10 h-8 rounded overflow-hidden border bg-muted/30">
                <img
                  src={article.image_url}
                  alt={article.title_zh}
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">-</span>
            )}
          </div>
        )}

        {/* Date Column */}
        <div className="col-span-1 text-sm text-muted-foreground">
          {new Date(article.created_at).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' })}
        </div>

        {/* Actions Column */}
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
          {(canEditArticles || canDeleteArticles) && (
            <>
              {canEditArticles && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-primary"
                  onClick={(e) => handleEditClick(article, e)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              )}
              {canDeleteArticles && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t('knowledge.confirmDeleteArticle')}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t('knowledge.deleteArticleWarning')}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteArticle(article.id);
                        }}
                        className="bg-destructive text-destructive-foreground"
                      >
                        {t('common.delete')}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </>
          )}
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
                {/* Actions */}
                <div className={cn("flex items-center gap-2", isMobile && "justify-end")}>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={markAllAsRead}
                    className="h-8 text-xs"
                  >
                    <Check className="h-3.5 w-3.5 mr-1" />
                    {!isMobile && t('knowledge.markAllRead')}
                  </Button>
                  {canManageCategories && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => setIsManageCategoryOpen(true)}
                      className="h-8 text-xs"
                    >
                      <Settings className="h-3.5 w-3.5 mr-1" />
                      {!isMobile && t('knowledge.manageCategories')}
                    </Button>
                  )}
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
                  {canCreateArticles && (
                    <Button 
                      onClick={() => { resetArticleForm(); setIsAddArticleOpen(true); }}
                      size="sm"
                      className="h-9 whitespace-nowrap"
                    >
                      <Plus className="h-4 w-4 mr-1.5" />
                      {t('发布', 'Publish')}
                    </Button>
                  )}
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
                  {searchQuery ? (
                    <Button variant="link" size="sm" className="mt-2" onClick={() => setSearchQuery("")}>
                      {t('清除搜索条件', 'Clear search')}
                    </Button>
                  ) : canCreateArticles && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {t('点击上方"发布"按钮添加新内容', 'Click "Publish" button above to add new content')}
                    </p>
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
                        const isUnread = article.visibility === 'public' && article.created_by !== employee?.id && !readArticleIds.has(article.id);
                        return (
                          <div
                            key={article.id}
                            className="border rounded-lg p-3 bg-card hover:bg-muted/30 transition-colors cursor-pointer"
                            onClick={() => handleViewArticle(article)}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 mb-1">
                                  {isUnread && <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 animate-pulse" />}
                                  <span className="text-xs text-muted-foreground">{sequenceNumber}.</span>
                                  <span className={cn("text-sm truncate", isUnread ? "font-bold" : "font-medium")}>
                                    {article.title_zh}
                                  </span>
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
                                {canEditArticles && canEditThisArticle(article) && (
                                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={(e) => handleEditClick(article, e)}>
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    /* Desktop: Table-based article list */
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEnd}
                    >
                      <div className="border rounded-lg overflow-hidden bg-card">
                        {renderTableHeader()}
                        <SortableContext
                          items={paginatedArticles.map(a => a.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          <div className="divide-y divide-border/50">
                            {paginatedArticles.map((article, index) => (
                              <SortableArticleRow key={article.id} article={article} index={index} />
                            ))}
                          </div>
                        </SortableContext>
                      </div>
                    </DndContext>
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

      {/* Manage Category Dialog */}
      <Dialog open={isManageCategoryOpen} onOpenChange={setIsManageCategoryOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('knowledge.manageCategories')}</DialogTitle>
            <DialogDescription>
              {t('添加或删除知识库分类', 'Add or remove knowledge base categories')}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {/* Add New Category */}
            <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
              <Label className="text-sm font-medium">{t('knowledge.addCategory')}</Label>
              <div className="flex gap-2">
                <Input
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder={t('knowledge.categoryName')}
                  className="flex-1 h-9"
                />
                <Select value={newCategoryType} onValueChange={(v) => setNewCategoryType(v as any)}>
                  <SelectTrigger className="w-24 h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">{t('knowledge.text')}</SelectItem>
                    <SelectItem value="phrase">{t('knowledge.phrase')}</SelectItem>
                    <SelectItem value="image">{t('knowledge.image')}</SelectItem>
                  </SelectContent>
                </Select>
                {canCreatePublicCategories ? (
                  <Select value={newCategoryVisibility} onValueChange={(v) => setNewCategoryVisibility(v as 'public' | 'private')}>
                    <SelectTrigger className="w-24 h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="private">私有</SelectItem>
                      <SelectItem value="public">公开</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant="secondary" className="h-9 px-3 flex items-center bg-warning/20 text-warning-foreground">
                    私有
                  </Badge>
                )}
                <Button size="sm" className="h-9" onClick={handleAddCategory}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {!canCreatePublicCategories && (
                <p className="text-xs text-muted-foreground">
                  {t('您创建的分类仅自己可见', 'Categories you create are only visible to you')}
                </p>
              )}
            </div>

            {/* Existing Categories with Drag-and-Drop */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium text-muted-foreground">{t('现有分类', 'Existing Categories')}</Label>
                <span className="text-xs text-muted-foreground">{t('拖拽调整顺序', 'Drag to reorder')}</span>
              </div>
              <ScrollArea className="h-[250px]">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={async (event) => {
                    const { active, over } = event;
                    if (over && active.id !== over.id) {
                      const oldIndex = categories.findIndex(c => c.id === active.id);
                      const newIndex = categories.findIndex(c => c.id === over.id);
                      const newCategories = arrayMove(categories, oldIndex, newIndex);
                      await reorderCategories(newCategories);
                    }
                  }}
                >
                  <SortableContext
                    items={categories.map(c => c.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-2 pr-4">
                      {categories.map(cat => {
                        const IconComponent = getCategoryIcon(cat.name, cat.content_type);
                        return (
                          <SortableCategoryItem
                            key={cat.id}
                            category={cat}
                            IconComponent={IconComponent}
                            onUpdate={updateCategory}
                            onDelete={deleteCategory}
                            getContentTypeLabel={getContentTypeLabel}
                          />
                        );
                      })}
                    </div>
                  </SortableContext>
                </DndContext>
              </ScrollArea>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsManageCategoryOpen(false)}>
              {t('common.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Article Dialog */}
      <Dialog open={isAddArticleOpen} onOpenChange={setIsAddArticleOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('发布内容', 'Publish Content')}</DialogTitle>
            <DialogDescription>
              {t('发布到', 'Publish to')}「{getCurrentCategory()?.name || ''}」{t('分类', 'category')}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {renderArticleForm()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddArticleOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleAddArticle}>{t('发布', 'Publish')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Article Dialog */}
      <Dialog open={isEditArticleOpen} onOpenChange={setIsEditArticleOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('knowledge.editArticle')}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            {renderArticleForm()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditArticleOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleUpdateArticle}>{t('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
