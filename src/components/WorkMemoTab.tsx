import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileCardList, MobileCard, MobileCardHeader, MobileCardRow, MobileCardActions, MobileEmptyState } from "@/components/ui/mobile-data-card";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Bell, Plus, Trash2, Check, Pencil } from "lucide-react";
import { notify } from "@/lib/notifyHub";
import {
  getWorkMemos,
  addWorkMemo,
  updateWorkMemo,
  markMemoAsRead,
  deleteMemo,
  getUnreadMemoCount,
  cleanupExpiredMemos,
  WorkMemo,
} from "@/services/system/systemSettingsService";
import { CustomReminderSelect } from "@/components/CustomReminderSelect";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatBeijingTime } from "@/lib/beijingTime";

interface WorkMemoTabProps {
  onUnreadCountChange?: (count: number) => void;
}

export default function WorkMemoTab({ onUnreadCountChange }: WorkMemoTabProps) {
  const { t } = useLanguage();
  const isMobile = useIsMobile();
  const [memos, setMemos] = useState<WorkMemo[]>([]);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [remark1, setRemark1] = useState("");
  const [remark2, setRemark2] = useState("");
  const [reminderOffset, setReminderOffset] = useState<number>(60);
  
  // Edit dialog state
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingMemo, setEditingMemo] = useState<WorkMemo | null>(null);
  const [editPhoneNumber, setEditPhoneNumber] = useState("");
  const [editRemark1, setEditRemark1] = useState("");
  const [editRemark2, setEditRemark2] = useState("");
  const [delayOffset, setDelayOffset] = useState<number>(60);

  const loadMemos = () => {
    cleanupExpiredMemos();
    const loadedMemos = getWorkMemos();
    setMemos(loadedMemos);
    const count = getUnreadMemoCount();
    onUnreadCountChange?.(count);
  };

  useEffect(() => {
    loadMemos();
    const interval = setInterval(() => {
      cleanupExpiredMemos();
      const count = getUnreadMemoCount();
      onUnreadCountChange?.(count);
    }, 10000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onUnreadCountChange]);

  useEffect(() => {
    const count = getUnreadMemoCount();
    onUnreadCountChange?.(count);
  }, [onUnreadCountChange]);

  const handleAddMemo = () => {
    if (!phoneNumber) {
      notify.error(t('workMemo.pleaseEnterPhone'));
      return;
    }

    const now = new Date();
    const reminderTime = new Date(now.getTime() + reminderOffset * 60000);

    addWorkMemo({
      phoneNumber,
      remark1,
      remark2,
      reminderTime: reminderTime.toISOString(),
      reminderOffset,
    });

    notify.success(t('workMemo.memoAdded'));
    setPhoneNumber("");
    setRemark1("");
    setRemark2("");
    loadMemos();
  };

  const handleMarkAsRead = (memoId: string) => {
    markMemoAsRead(memoId);
    loadMemos();
    notify.success(t('workMemo.markedAsRead'));
  };

  const handleDelete = (memoId: string) => {
    deleteMemo(memoId);
    loadMemos();
    notify.success(t('workMemo.memoDeleted'));
  };

  const handleOpenEdit = (memo: WorkMemo) => {
    setEditingMemo(memo);
    setEditPhoneNumber(memo.phoneNumber);
    setEditRemark1(memo.remark1);
    setEditRemark2(memo.remark2);
    setDelayOffset(60);
    setIsEditDialogOpen(true);
  };

  const handleSaveEdit = () => {
    if (!editingMemo) return;
    
    const now = new Date();
    const newReminderTime = new Date(now.getTime() + delayOffset * 60000);
    
    updateWorkMemo(editingMemo.id, {
      phoneNumber: editPhoneNumber,
      remark1: editRemark1,
      remark2: editRemark2,
      reminderTime: newReminderTime.toISOString(),
      reminderOffset: delayOffset,
      isRead: false,
    });
    
    notify.success(t('workMemo.memoUpdated'));
    setIsEditDialogOpen(false);
    setEditingMemo(null);
    loadMemos();
  };

  const isReminderTriggered = (memo: WorkMemo) => {
    const now = new Date();
    const reminderTime = new Date(memo.reminderTime);
    return reminderTime <= now;
  };

  const formatDateTime = (dateStr: string) => formatBeijingTime(dateStr);

  return (
    <div className="space-y-6">
      {/* Add New Memo */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Plus className="h-4 w-4" />
            {t('workMemo.addNewMemo')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className={isMobile ? "flex flex-col gap-3" : "grid grid-cols-5 gap-4"}>
            <div className="space-y-2">
              <Label className="text-xs">{t('workMemo.phoneNumber')}</Label>
              <Input
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder={t('workMemo.phonePlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">{t('workMemo.remark1')}</Label>
              <Input
                value={remark1}
                onChange={(e) => setRemark1(e.target.value)}
                placeholder={t('workMemo.remarkPlaceholder')}
              />
            </div>
            {!isMobile && (
              <div className="space-y-2">
                <Label className="text-xs">{t('workMemo.remark2')}</Label>
                <Input
                  value={remark2}
                  onChange={(e) => setRemark2(e.target.value)}
                  placeholder={t('workMemo.remarkPlaceholder')}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-xs">{t('workMemo.reminderTime')}</Label>
              <CustomReminderSelect
                value={reminderOffset}
                onChange={setReminderOffset}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={handleAddMemo} className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                {t('workMemo.addMemo')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Memo List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Bell className="h-4 w-4" />
            {t('workMemo.memoList')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isMobile ? (
            <MobileCardList>
              {memos.length === 0 ? (
                <MobileEmptyState message={t('workMemo.noMemos')} />
              ) : (
                memos.map((memo) => {
                  const triggered = isReminderTriggered(memo);
                  return (
                    <MobileCard key={memo.id} accent="info" className={memo.isRead ? "opacity-60" : ""}>
                      <MobileCardHeader>
                        <span className="font-medium">{memo.phoneNumber}</span>
                        {triggered && !memo.isRead ? (
                          <Badge className="bg-amber-500 text-white animate-pulse text-xs">
                            <Bell className="h-3 w-3 mr-1" />{t('workMemo.pending')}
                          </Badge>
                        ) : memo.isRead ? (
                          <Badge variant="outline" className="text-xs">{t('workMemo.read')}</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">{t('workMemo.waiting')}</Badge>
                        )}
                      </MobileCardHeader>
                      <MobileCardRow label={t('workMemo.remark1')} value={memo.remark1 || '-'} />
                      <MobileCardRow label={t('workMemo.reminderTime')} value={formatDateTime(memo.reminderTime)} />
                      <MobileCardActions>
                        {triggered && !memo.isRead && (
                          <Button variant="ghost" size="sm" className="h-8 flex-1 text-green-600" onClick={() => handleMarkAsRead(memo.id)}>
                            <Check className="h-4 w-4 mr-1" />{t('workMemo.confirmRead')}
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" className="h-8 flex-1" onClick={() => handleOpenEdit(memo)} aria-label="Edit">
                          <Pencil className="h-4 w-4 mr-1" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 text-destructive" aria-label="Delete">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>{t('workMemo.confirmDelete')}</AlertDialogTitle>
                              <AlertDialogDescription>
                                {t('workMemo.deleteQuestion')}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDelete(memo.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                {t('common.delete')}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </MobileCardActions>
                    </MobileCard>
                  );
                })
              )}
            </MobileCardList>
          ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-center">{t('workMemo.status')}</TableHead>
                  <TableHead className="text-center">{t('workMemo.entryTime')}</TableHead>
                  <TableHead className="text-center">{t('workMemo.phoneNumber')}</TableHead>
                  <TableHead className="text-center">{t('workMemo.remark1')}</TableHead>
                  <TableHead className="text-center">{t('workMemo.remark2')}</TableHead>
                  <TableHead className="text-center">{t('workMemo.reminderTime')}</TableHead>
                  <TableHead className="text-center w-[120px]">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {memos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      {t('workMemo.noMemos')}
                    </TableCell>
                  </TableRow>
                ) : (
                  memos.map((memo) => {
                    const triggered = isReminderTriggered(memo);
                    return (
                      <TableRow
                        key={memo.id}
                        className={
                          triggered && !memo.isRead
                            ? "bg-amber-50 border-l-4 border-l-amber-500"
                            : memo.isRead
                            ? "bg-muted/30"
                            : ""
                        }
                      >
                        <TableCell>
                          {triggered && !memo.isRead ? (
                            <Badge className="bg-amber-500 text-white animate-pulse">
                              <Bell className="h-3 w-3 mr-1" />
                              {t('workMemo.pending')}
                            </Badge>
                          ) : memo.isRead ? (
                            <Badge variant="outline" className="text-muted-foreground">
                              {t('workMemo.read')}
                            </Badge>
                          ) : (
                            <Badge variant="outline">{t('workMemo.waiting')}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground text-center">
                          {formatDateTime(memo.createdAt)}
                        </TableCell>
                        <TableCell className="font-medium text-center">{memo.phoneNumber}</TableCell>
                        <TableCell className="max-w-[150px] truncate text-center">
                          {memo.remark1 || "-"}
                        </TableCell>
                        <TableCell className="max-w-[150px] truncate text-center">
                          {memo.remark2 || "-"}
                        </TableCell>
                        <TableCell className="text-sm text-center">
                          {formatDateTime(memo.reminderTime)}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            {triggered && !memo.isRead && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-green-600 hover:text-green-700"
                                    aria-label="Confirm"
                                  >
                                    <Check className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>{t('workMemo.confirmRead')}</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      {t('workMemo.confirmReadQuestion')}
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleMarkAsRead(memo.id)}
                                      className="bg-green-600 text-white hover:bg-green-700"
                                    >
                                      {t('workMemo.confirmRead')}
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-blue-600 hover:text-blue-700"
                              onClick={() => handleOpenEdit(memo)}
                              aria-label="Edit"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                  aria-label="Delete"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>{t('workMemo.confirmDelete')}</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    {t('workMemo.deleteQuestion')}
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDelete(memo.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    {t('common.delete')}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          )}
        </CardContent>
      </Card>

      <DrawerDetail
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        title={t('workMemo.editMemo')}
        sheetMaxWidth="xl"
      >
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('workMemo.phoneNumber')}</Label>
              <Input
                value={editPhoneNumber}
                onChange={(e) => setEditPhoneNumber(e.target.value)}
                placeholder={t('workMemo.phonePlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('workMemo.remark1')}</Label>
              <Input
                value={editRemark1}
                onChange={(e) => setEditRemark1(e.target.value)}
                placeholder={t('workMemo.remarkPlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('workMemo.remark2')}</Label>
              <Input
                value={editRemark2}
                onChange={(e) => setEditRemark2(e.target.value)}
                placeholder={t('workMemo.remarkPlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('workMemo.delayReminder')}</Label>
              <CustomReminderSelect
                value={delayOffset}
                onChange={setDelayOffset}
              />
              <p className="text-xs text-muted-foreground">
                {t('workMemo.delayNote')}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2 pt-4 mt-4 border-t border-border">
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSaveEdit}>{t('common.save')}</Button>
          </div>
      </DrawerDetail>
    </div>
  );
}
