import type { Dispatch, SetStateAction } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
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

export interface PortalConfirmDialogsProps {
  confirmForceRefreshOpen: boolean;
  setConfirmForceRefreshOpen: Dispatch<SetStateAction<boolean>>;
  executeNotifyForceRefresh: () => void | Promise<void>;

  confirmRemoveMallCategoryIdx: number | null;
  setConfirmRemoveMallCategoryIdx: Dispatch<SetStateAction<number | null>>;
  confirmRemoveMallCategory: () => void;

  confirmRemoveMallIdx: number | null;
  setConfirmRemoveMallIdx: Dispatch<SetStateAction<number | null>>;
  confirmRemoveMallItem: () => void;

  confirmRemoveBannerIdx: number | null;
  setConfirmRemoveBannerIdx: Dispatch<SetStateAction<number | null>>;
  confirmRemoveBanner: () => void;

  confirmRemoveAnnouncementIdx: number | null;
  setConfirmRemoveAnnouncementIdx: Dispatch<SetStateAction<number | null>>;
  confirmRemoveAnnouncement: () => void;

  confirmDiscardDraftOpen: boolean;
  setConfirmDiscardDraftOpen: Dispatch<SetStateAction<boolean>>;
  executeDiscardDraft: () => void | Promise<void>;

  confirmResetDefaultOpen: boolean;
  setConfirmResetDefaultOpen: Dispatch<SetStateAction<boolean>>;
  executeResetToDefault: () => void;

  confirmPublishOpen: boolean;
  setConfirmPublishOpen: Dispatch<SetStateAction<boolean>>;
  executePublish: () => void | Promise<void>;

  confirmSubmitReviewOpen: boolean;
  setConfirmSubmitReviewOpen: Dispatch<SetStateAction<boolean>>;
  executeSubmitForReview: () => void | Promise<void>;

  confirmRollbackVersionId: string | null;
  setConfirmRollbackVersionId: Dispatch<SetStateAction<string | null>>;
  executeRollback: () => void | Promise<void>;

  confirmVersionApproveId: string | null;
  setConfirmVersionApproveId: Dispatch<SetStateAction<string | null>>;
  confirmVersionRejectId: string | null;
  setConfirmVersionRejectId: Dispatch<SetStateAction<string | null>>;
  onApprove: (versionId: string, approve: boolean) => void | Promise<void>;
}

export function PortalConfirmDialogs({
  confirmForceRefreshOpen,
  setConfirmForceRefreshOpen,
  executeNotifyForceRefresh,
  confirmRemoveMallCategoryIdx,
  setConfirmRemoveMallCategoryIdx,
  confirmRemoveMallCategory,
  confirmRemoveMallIdx,
  setConfirmRemoveMallIdx,
  confirmRemoveMallItem,
  confirmRemoveBannerIdx,
  setConfirmRemoveBannerIdx,
  confirmRemoveBanner,
  confirmRemoveAnnouncementIdx,
  setConfirmRemoveAnnouncementIdx,
  confirmRemoveAnnouncement,
  confirmDiscardDraftOpen,
  setConfirmDiscardDraftOpen,
  executeDiscardDraft,
  confirmResetDefaultOpen,
  setConfirmResetDefaultOpen,
  executeResetToDefault,
  confirmPublishOpen,
  setConfirmPublishOpen,
  executePublish,
  confirmSubmitReviewOpen,
  setConfirmSubmitReviewOpen,
  executeSubmitForReview,
  confirmRollbackVersionId,
  setConfirmRollbackVersionId,
  executeRollback,
  confirmVersionApproveId,
  setConfirmVersionApproveId,
  confirmVersionRejectId,
  setConfirmVersionRejectId,
  onApprove,
}: PortalConfirmDialogsProps) {
  const { t } = useLanguage();

  return (
    <>
      <AlertDialog open={confirmForceRefreshOpen} onOpenChange={setConfirmForceRefreshOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("向全员发送刷新提示？", "Send “Update Now” to all users?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("会员端将收到立即更新提示，确定继续？", "Members will see an update prompt. Continue?")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmForceRefreshOpen(false);
                void executeNotifyForceRefresh();
              }}
            >
              {t("发送", "Send")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmRemoveMallCategoryIdx !== null} onOpenChange={(open) => !open && setConfirmRemoveMallCategoryIdx(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("删除该分类？", "Delete this category?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "删除后原归属该分类的积分商品将变为未分类；需点击「保存分类」后才会写入数据库。",
                "Items in this category become uncategorized. Click Save categories to persist.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={confirmRemoveMallCategory}>
              {t("删除", "Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmRemoveMallIdx !== null} onOpenChange={(open) => !open && setConfirmRemoveMallIdx(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("移除该商品？", "Remove this product?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("从列表中移除后需点击「保存」才会写入数据库。", "Removed from the list until you click Save to persist.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={confirmRemoveMallItem}>
              {t("移除", "Remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmRemoveBannerIdx !== null} onOpenChange={(open) => !open && setConfirmRemoveBannerIdx(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("移除该横幅？", "Remove this banner?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("从列表中移除后需点击「保存」才会写入数据库。", "Removed from the list until you click Save to persist.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={confirmRemoveBanner}>
              {t("移除", "Remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmRemoveAnnouncementIdx !== null} onOpenChange={(open) => !open && setConfirmRemoveAnnouncementIdx(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("移除该公告？", "Remove this announcement?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("从列表中移除后需点击「保存」才会写入数据库。", "Removed from the list until you click Save to persist.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={confirmRemoveAnnouncement}>
              {t("移除", "Remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDiscardDraftOpen} onOpenChange={setConfirmDiscardDraftOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("丢弃草稿？", "Discard draft?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("将恢复为当前已发布的设置，未发布修改将丢失。", "Restores published settings; unpublished changes will be lost.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setConfirmDiscardDraftOpen(false);
                void executeDiscardDraft();
              }}
            >
              {t("丢弃", "Discard")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmResetDefaultOpen} onOpenChange={setConfirmResetDefaultOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("恢复为系统默认模板？", "Reset to system default template?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "将用内置默认配置替换当前编辑区内容（含轮播、登录幻灯、模块顺序等），不会立即写入服务器；需保存草稿或发布后才生效。",
                "Replaces the editor with the built-in defaults (banners, login slides, module order, etc.). Nothing is saved to the server until you save a draft or publish.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setConfirmResetDefaultOpen(false);
                executeResetToDefault();
              }}
            >
              {t("恢复默认", "Reset")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmPublishOpen} onOpenChange={setConfirmPublishOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("确认发布上线？", "Publish now?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("发布后会员端将立即生效。", "Changes will take effect immediately for members.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void executePublish()}>{t("发布", "Publish")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmSubmitReviewOpen} onOpenChange={setConfirmSubmitReviewOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("提交审核？", "Submit for review?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("提交后需管理员审核通过才会对会员生效。", "An admin must approve before changes go live for members.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void executeSubmitForReview()}>{t("提交", "Save")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmRollbackVersionId} onOpenChange={(open) => !open && setConfirmRollbackVersionId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("回滚到此版本？", "Rollback to this version?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("将发布该历史版本并替换当前线上配置，请谨慎操作。", "This version will be published and replace the current live settings.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void executeRollback()}
            >
              {t("回滚", "Rollback")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmVersionApproveId} onOpenChange={(open) => !open && setConfirmVersionApproveId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("审核通过并发布？", "Approve and publish?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("通过后该版本将按流程发布，会员端将按规则生效。", "This version will be published per your workflow and take effect for members.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const id = confirmVersionApproveId;
                setConfirmVersionApproveId(null);
                if (id) void onApprove(id, true);
              }}
            >
              {t("通过", "Approve")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmVersionRejectId} onOpenChange={(open) => !open && setConfirmVersionRejectId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("驳回该版本审核？", "Reject this version?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("驳回后该版本不会上线，提交人需修改后重新提交。", "The version will not go live; submitter must revise and resubmit.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const id = confirmVersionRejectId;
                setConfirmVersionRejectId(null);
                if (id) void onApprove(id, false);
              }}
            >
              {t("驳回", "Reject")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
