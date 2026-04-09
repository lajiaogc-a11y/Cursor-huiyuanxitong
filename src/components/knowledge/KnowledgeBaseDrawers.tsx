import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Calendar, Copy, FolderPlus, ImageOff, Loader2, Pencil, Plus, Settings2 } from "lucide-react";
import { notify } from "@/lib/notifyHub";
import { formatBeijingTime } from "@/lib/beijingTime";
import { ResolvableMediaThumb } from "@/components/ResolvableMediaThumb";
import { useMemberResolvableMedia } from "@/hooks/members/useMemberResolvableMedia";
import type { KnowledgeCategory, KnowledgeArticle } from "@/hooks/staff/useKnowledge";

function KnowledgeArticleDrawerImage({
  article,
  t,
}: {
  article: KnowledgeArticle;
  t: (zh: string, en?: string) => string;
}) {
  const rawUrl = article.image_url || "";
  const { resolvedSrc, usePlaceholder, onImageError } = useMemberResolvableMedia(
    `kb-drawer-${article.id}`,
    rawUrl,
  );
  return (
    <div className="rounded-lg overflow-hidden border bg-muted mb-4">
      {usePlaceholder ? (
        <div className="flex h-48 items-center justify-center text-muted-foreground" role="img" aria-label={t("图片", "Image")}>
          <ImageOff className="h-12 w-12" strokeWidth={1.25} />
        </div>
      ) : (
        <img src={resolvedSrc} alt="" className="max-w-full h-auto" onError={onImageError} />
      )}
    </div>
  );
}

export interface CategoryFormState {
  name: string;
  content_type: KnowledgeCategory["content_type"];
  visibility: KnowledgeCategory["visibility"];
}

export interface ArticleFormState {
  title_zh: string;
  title_en: string;
  content: string;
  description: string;
  image_url: string;
  is_published: boolean;
  visibility: KnowledgeArticle["visibility"];
}

export interface KnowledgeBaseDrawersProps {
  t: (zh: string, en?: string) => string;
  localeForTime: string;

  isViewArticleOpen: boolean;
  onViewArticleOpenChange: (open: boolean) => void;
  selectedArticle: KnowledgeArticle | null;
  isArticleUnread: (article: KnowledgeArticle) => boolean;
  activeContentType: string;
  onCopyContent: (content: string, e?: React.MouseEvent) => void;
  canManage: boolean;
  onCloseViewAndEdit: (article: KnowledgeArticle) => void;

  isCategoryDialogOpen: boolean;
  onCategoryDialogOpenChange: (open: boolean) => void;
  editingCategory: KnowledgeCategory | null;
  categoryForm: CategoryFormState;
  setCategoryForm: React.Dispatch<React.SetStateAction<CategoryFormState>>;
  savingCategory: boolean;
  onSaveCategory: () => void | Promise<void>;

  isArticleDialogOpen: boolean;
  onArticleDialogOpenChange: (open: boolean) => void;
  editingArticle: KnowledgeArticle | null;
  articleForm: ArticleFormState;
  setArticleForm: React.Dispatch<React.SetStateAction<ArticleFormState>>;
  onSaveArticle: () => void | Promise<void>;

  deletingCategoryId: string | null;
  onDeletingCategoryOpenChange: (open: boolean) => void;
  onConfirmDeleteCategory: () => void | Promise<void>;

  deletingArticleId: string | null;
  onDeletingArticleOpenChange: (open: boolean) => void;
  onConfirmDeleteArticle: () => void | Promise<void>;

  markAllReadOpen: boolean;
  onMarkAllReadOpenChange: (open: boolean) => void;
  markAllReadSubmitting: boolean;
  setMarkAllReadSubmitting: (v: boolean) => void;
  markAllAsRead: () => Promise<boolean>;
}

export function KnowledgeBaseDrawers({
  t,
  localeForTime,
  isViewArticleOpen,
  onViewArticleOpenChange,
  selectedArticle,
  isArticleUnread,
  activeContentType,
  onCopyContent,
  canManage,
  onCloseViewAndEdit,
  isCategoryDialogOpen,
  onCategoryDialogOpenChange,
  editingCategory,
  categoryForm,
  setCategoryForm,
  savingCategory,
  onSaveCategory,
  isArticleDialogOpen,
  onArticleDialogOpenChange,
  editingArticle,
  articleForm,
  setArticleForm,
  onSaveArticle,
  deletingCategoryId,
  onDeletingCategoryOpenChange,
  onConfirmDeleteCategory,
  deletingArticleId,
  onDeletingArticleOpenChange,
  onConfirmDeleteArticle,
  markAllReadOpen,
  onMarkAllReadOpenChange,
  markAllReadSubmitting,
  setMarkAllReadSubmitting,
  markAllAsRead,
}: KnowledgeBaseDrawersProps) {
  return (
    <>
      <DrawerDetail
        open={isViewArticleOpen}
        onOpenChange={onViewArticleOpenChange}
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
                <span>
                  {t("发布于", "Published on")} {formatBeijingTime(selectedArticle.created_at)}
                </span>
              </div>
              {selectedArticle.description && (
                <p className="text-muted-foreground mb-4">{selectedArticle.description}</p>
              )}
              {selectedArticle.content && (
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  <div className="bg-muted/50 rounded-lg p-4 whitespace-pre-wrap">{selectedArticle.content}</div>
                  {activeContentType === "phrase" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4 h-9 gap-2 text-primary border-primary/50 hover:bg-primary/10 hover:text-primary"
                      onClick={() => onCopyContent(selectedArticle.content || "")}
                    >
                      <Copy className="h-4 w-4 shrink-0" aria-hidden />
                      {t("复制内容", "Copy Content")}
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
                <Button
                  variant="outline"
                  onClick={() => {
                    onCloseViewAndEdit(selectedArticle);
                  }}
                >
                  <Pencil className="h-4 w-4 mr-1.5" />
                  {t("编辑", "Edit")}
                </Button>
              )}
              <Button variant="outline" onClick={() => onViewArticleOpenChange(false)}>
                {t("common.close")}
              </Button>
            </div>
          </>
        )}
      </DrawerDetail>

      <DrawerDetail
        open={isCategoryDialogOpen}
        onOpenChange={onCategoryDialogOpenChange}
        title={
          <span className="flex items-center gap-2">
            {editingCategory ? (
              <Settings2 className="h-5 w-5 shrink-0" />
            ) : (
              <FolderPlus className="h-5 w-5 shrink-0" />
            )}
            {editingCategory ? t("编辑分类", "Edit Category") : t("新增分类", "New Category")}
          </span>
        }
        sheetMaxWidth="xl"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t("分类名称", "Category Name")} *</Label>
            <Input
              value={categoryForm.name}
              onChange={(e) => setCategoryForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder={t("输入分类名称", "Enter category name")}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("内容类型", "Content Type")}</Label>
            <Select
              value={categoryForm.content_type}
              onValueChange={(v) =>
                setCategoryForm((prev) => ({ ...prev, content_type: v as KnowledgeCategory["content_type"] }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="text">{t("文本", "Text")}</SelectItem>
                <SelectItem value="phrase">{t("话术", "Phrase")}</SelectItem>
                <SelectItem value="image">{t("图片", "Image")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("可见性", "Visibility")}</Label>
            <Select
              value={categoryForm.visibility}
              onValueChange={(v) =>
                setCategoryForm((prev) => ({ ...prev, visibility: v as KnowledgeCategory["visibility"] }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">{t("公开", "Public")}</SelectItem>
                <SelectItem value="private">{t("私有", "Private")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 pt-4 mt-4 border-t border-border">
          <Button type="button" variant="outline" onClick={() => onCategoryDialogOpenChange(false)} disabled={savingCategory}>
            {t("取消", "Cancel")}
          </Button>
          <Button type="button" onClick={() => void onSaveCategory()} disabled={savingCategory}>
            {savingCategory ? (
              <>
                <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full mr-2" />
                {t("保存中...", "Saving...")}
              </>
            ) : editingCategory ? (
              t("保存", "Save")
            ) : (
              t("创建", "Create")
            )}
          </Button>
        </div>
      </DrawerDetail>

      <DrawerDetail
        open={isArticleDialogOpen}
        onOpenChange={onArticleDialogOpenChange}
        title={
          <span className="flex items-center gap-2">
            {editingArticle ? <Pencil className="h-5 w-5 shrink-0" /> : <Plus className="h-5 w-5 shrink-0" />}
            {editingArticle ? t("编辑内容", "Edit Content") : t("新增内容", "New Content")}
          </span>
        }
        sheetMaxWidth="xl"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t("中文标题", "Chinese Title")} *</Label>
            <Input
              value={articleForm.title_zh}
              onChange={(e) => setArticleForm((prev) => ({ ...prev, title_zh: e.target.value }))}
              placeholder={t("输入标题", "Enter title")}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("英文标题", "English Title")}</Label>
            <Input
              value={articleForm.title_en}
              onChange={(e) => setArticleForm((prev) => ({ ...prev, title_en: e.target.value }))}
              placeholder="Optional"
            />
          </div>
          <div className="space-y-2">
            <Label>{t("内容", "Content")}</Label>
            <Textarea
              value={articleForm.content}
              onChange={(e) => setArticleForm((prev) => ({ ...prev, content: e.target.value }))}
              placeholder={t("输入内容", "Enter content")}
              rows={6}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("描述", "Description")}</Label>
            <Input
              value={articleForm.description}
              onChange={(e) => setArticleForm((prev) => ({ ...prev, description: e.target.value }))}
              placeholder={t("可选", "Optional")}
            />
          </div>
          {activeContentType === "image" && (
            <div className="space-y-2">
              <Label>{t("图片链接", "Image URL")}</Label>
              <Input
                value={articleForm.image_url}
                onChange={(e) => setArticleForm((prev) => ({ ...prev, image_url: e.target.value }))}
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
                onCheckedChange={(v) => setArticleForm((prev) => ({ ...prev, is_published: v }))}
              />
              <Label className="text-sm">{t("发布", "Published")}</Label>
            </div>
            <div className="flex items-center gap-2">
              <Select
                value={articleForm.visibility}
                onValueChange={(v) =>
                  setArticleForm((prev) => ({ ...prev, visibility: v as KnowledgeArticle["visibility"] }))
                }
              >
                <SelectTrigger className="w-24 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">{t("公开", "Public")}</SelectItem>
                  <SelectItem value="private">{t("私有", "Private")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 pt-4 mt-4 border-t border-border">
          <Button variant="outline" onClick={() => onArticleDialogOpenChange(false)}>
            {t("取消", "Cancel")}
          </Button>
          <Button onClick={() => void onSaveArticle()}>{editingArticle ? t("保存", "Save") : t("发布", "Publish")}</Button>
        </div>
      </DrawerDetail>

      <ConfirmDialog
        open={!!deletingCategoryId}
        onOpenChange={(open) => !open && onDeletingCategoryOpenChange(false)}
        title={t("确认删除分类", "Delete Category")}
        description={t(
          "删除分类将同时删除该分类下的所有内容，此操作不可撤销。",
          "Deleting this category will also delete all its content. This cannot be undone.",
        )}
        confirmLabel={t("删除", "Delete")}
        variant="destructive"
        onConfirm={() => void onConfirmDeleteCategory()}
      />

      <ConfirmDialog
        open={!!deletingArticleId}
        onOpenChange={(open) => !open && onDeletingArticleOpenChange(false)}
        title={t("确认删除", "Confirm Delete")}
        description={t("此操作不可撤销，确定要删除这条内容吗？", "This action cannot be undone. Delete this content?")}
        confirmLabel={t("删除", "Delete")}
        variant="destructive"
        onConfirm={() => void onConfirmDeleteArticle()}
      />

      <AlertDialog
        open={markAllReadOpen}
        onOpenChange={(open) => {
          if (!markAllReadSubmitting) onMarkAllReadOpenChange(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("knowledge.markAllReadConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("knowledge.markAllReadConfirmDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={markAllReadSubmitting}>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={markAllReadSubmitting}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={(e) => {
                e.preventDefault();
                void (async () => {
                  setMarkAllReadSubmitting(true);
                  try {
                    const ok = await markAllAsRead();
                    if (ok) {
                      notify.success(t("knowledge.markAllReadDone"));
                      onMarkAllReadOpenChange(false);
                    } else {
                      notify.error(t("knowledge.markAllReadFailed"));
                    }
                  } finally {
                    setMarkAllReadSubmitting(false);
                  }
                })();
              }}
            >
              {markAllReadSubmitting ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden />
                  {t("处理中…", "Working…")}
                </span>
              ) : (
                t("确认", "Confirm")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
