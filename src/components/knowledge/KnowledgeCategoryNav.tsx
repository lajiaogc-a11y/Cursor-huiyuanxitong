import {
  Bell,
  BookOpen,
  CreditCard,
  MessageCircle,
  FileText,
  MessageSquare,
  Image,
  Plus,
  Pencil,
  Trash2,
  CheckCheck,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { KnowledgeCategory } from "@/hooks/staff/useKnowledge";

const getCategoryIcon = (name: string | null | undefined, contentType: string) => {
  const lowerName = String(name ?? "").toLowerCase();
  if (lowerName.includes("通知") || lowerName.includes("公告")) return Bell;
  if (lowerName.includes("知识") || lowerName.includes("学习")) return BookOpen;
  if (lowerName.includes("兑卡") || lowerName.includes("卡")) return CreditCard;
  if (lowerName.includes("话术") || lowerName.includes("话")) return MessageCircle;

  switch (contentType) {
    case "text":
      return FileText;
    case "phrase":
      return MessageSquare;
    case "image":
      return Image;
    default:
      return FileText;
  }
};

export interface KnowledgeCategoryNavProps {
  categories: KnowledgeCategory[];
  activeCategory: string;
  onActiveCategoryChange: (id: string) => void;
  unreadByCategory: Record<string, number>;
  unreadCount: number;
  canManage: boolean;
  isMobile: boolean;
  employeeId: string | undefined;
  onOpenAddCategory: () => void;
  onOpenEditCategory: (cat: KnowledgeCategory) => void;
  onRequestDeleteCategory: (id: string) => void;
  onMarkAllReadOpen: () => void;
  t: (zh: string, en?: string) => string;
}

export function KnowledgeCategoryNav({
  categories,
  activeCategory,
  onActiveCategoryChange,
  unreadByCategory,
  unreadCount,
  canManage,
  isMobile,
  employeeId,
  onOpenAddCategory,
  onOpenEditCategory,
  onRequestDeleteCategory,
  onMarkAllReadOpen,
  t,
}: KnowledgeCategoryNavProps) {
  return (
    <div className="border-b bg-muted/30">
      <div className="px-3 sm:px-4 py-3">
        <div className={isMobile ? "space-y-2" : "flex items-start justify-between gap-3"}>
          <div className={isMobile ? "grid grid-cols-2 gap-1.5" : "flex flex-wrap gap-2 flex-1 min-w-0"}>
            {categories.map((category) => {
              const IconComponent = getCategoryIcon(category.name, category.content_type);
              const isActive = activeCategory === category.id;
              const catUnread = unreadByCategory[category.id] ?? 0;
              return (
                <div key={category.id} className="relative group/cat">
                  <button
                    type="button"
                    onClick={() => onActiveCategoryChange(category.id)}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-all w-full",
                      isMobile ? "truncate" : "sm:gap-2 sm:px-3 sm:py-2 sm:text-sm whitespace-nowrap shrink-0",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-muted/50 hover:bg-muted text-foreground/70 hover:text-foreground",
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
                    {category.visibility === "private" && (
                      <Lock className="h-3 w-3 opacity-70 shrink-0" aria-hidden />
                    )}
                  </button>
                  {canManage && isActive && (
                    <div className="absolute -top-1 -right-1 flex gap-0.5 z-10">
                      <button
                        type="button"
                        className="h-5 w-5 rounded-full bg-blue-500 text-white flex items-center justify-center hover:bg-blue-600 shadow-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenEditCategory(category);
                        }}
                      >
                        <Pencil className="h-2.5 w-2.5" />
                      </button>
                      <button
                        type="button"
                        className="h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center hover:bg-destructive/80 shadow-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRequestDeleteCategory(category.id);
                        }}
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
                type="button"
                onClick={onOpenAddCategory}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-all border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 hover:text-primary text-muted-foreground",
                  isMobile ? "" : "sm:gap-2 sm:px-3 sm:py-2 sm:text-sm whitespace-nowrap shrink-0",
                )}
              >
                <Plus className="h-3.5 w-3.5" />
                {t("新增分类", "Add Category")}
              </button>
            )}
          </div>
          {!isMobile && employeeId ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 shrink-0 gap-1.5"
              disabled={unreadCount <= 0}
              onClick={onMarkAllReadOpen}
            >
              <CheckCheck className="h-3.5 w-3.5" aria-hidden />
              {t("knowledge.oneClickAllRead")}
            </Button>
          ) : null}
        </div>
        {isMobile && employeeId ? (
          <div className="flex justify-end pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 gap-1.5"
              disabled={unreadCount <= 0}
              onClick={onMarkAllReadOpen}
            >
              <CheckCheck className="h-3.5 w-3.5" aria-hidden />
              {t("knowledge.oneClickAllRead")}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
