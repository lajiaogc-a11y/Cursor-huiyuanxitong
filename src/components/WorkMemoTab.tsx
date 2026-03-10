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
import { MobileCardList, MobileCard, MobileCardHeader, MobileCardRow, MobileCardActions } from "@/components/ui/mobile-data-card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { toast } from "sonner";
import {
  getWorkMemos,
  addWorkMemo,
  updateWorkMemo,
  markMemoAsRead,
  deleteMemo,
  getUnreadMemoCount,
  cleanupExpiredMemos,
  WorkMemo,
} from "@/stores/systemSettings";
import { CustomReminderSelect } from "@/components/CustomReminderSelect";
import { useLanguage } from "@/contexts/LanguageContext";

interface WorkMemoTabProps {
  onUnreadCountChange?: (count: number) => void;
}

export default function WorkMemoTab({ onUnreadCountChange }: WorkMemoTabProps) {
  const { tr } = useLanguage();
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
  }, [onUnreadCountChange]);

  useEffect(() => {
    const count = getUnreadMemoCount();
    onUnreadCountChange?.(count);
  }, [onUnreadCountChange]);

  const handleAddMemo = () => {
    if (!phoneNumber) {
      toast.error(tr('workMemo.pleaseEnterPhone'));
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

    toast.success(tr('workMemo.memoAdded'));
    setPhoneNumber("");
    setRemark1("");
    setRemark2("");
    loadMemos();
  };

  const handleMarkAsRead = (memoId: string) => {
    markMemoAsRead(memoId);
    loadMemos();
    toast.success(tr('workMemo.markedAsRead'));
  };

  const handleDelete = (memoId: string) => {
    deleteMemo(memoId);
    loadMemos();
    toast.success(tr('workMemo.memoDeleted'));
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
    
    toast.success(tr('workMemo.memoUpdated'));
    setIsEditDialogOpen(false);
    setEditingMemo(null);
    loadMemos();
  };

  const isReminderTriggered = (memo: WorkMemo) => {
    const now = new Date();
    const reminderTime = new Date(memo.reminderTime);
    return reminderTime <= now;
  };

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      {/* Add New Memo */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Plus className="h-4 w-4" />
            {tr('workMemo.addNewMemo')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className={isMobile ? "flex flex-col gap-3" : "grid grid-cols-5 gap-4"}>
            <div className="space-y-2">
              <Label className="text-xs">{tr('workMemo.phoneNumber')}</Label>
              <Input
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder={tr('workMemo.phonePlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">{tr('workMemo.remark1')}</Label>
              <Input
                value={remark1}
                onChange={(e) => setRemark1(e.target.value)}
                placeholder={tr('workMemo.remarkPlaceholder')}
              />
            </div>
            {!isMobile && (
              <div className="space-y-2">
                <Label className="text-xs">{tr('workMemo.remark2')}</Label>
                <Input
                  value={remark2}
                  onChange={(e) => setRemark2(e.target.value)}
                  placeholder={tr('workMemo.remarkPlaceholder')}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-xs">{tr('workMemo.reminderTime')}</Label>
              <CustomReminderSelect
                value={reminderOffset}
                onChange={setReminderOffset}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={handleAddMemo} className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                {tr('workMemo.addMemo')}
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
            {tr('workMemo.memoList')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isMobile ? (
            <MobileCardList>
              {memos.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">{tr('workMemo.noMemos')}</div>
              ) : (
                memos.map((memo) => {
                  const triggered = isReminderTriggered(memo);
                  return (
                    <MobileCard key={memo.id} className={triggered && !memo.isRead ? 'border-l-4 border-l-amber-500' : memo.isRead ? 'opacity-60' : ''}>
                      <MobileCardHeader>
                        <span className="font-medium">{memo.phoneNumber}</span>
                        {triggered && !memo.isRead ? (
                          <Badge className="bg-amber-500 text-white animate-pulse text-xs">
                            <Bell className="h-3 w-3 mr-1" />{tr('workMemo.pending')}
                          </Badge>
                        ) : memo.isRead ? (
                          <Badge variant="outline" className="text-xs">{tr('workMemo.read')}</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">{tr('workMemo.waiting')}</Badge>
                        )}
                      </MobileCardHeader>
                      <MobileCardRow label={tr('workMemo.remark1')} value={memo.remark1 || '-'} />
                      <MobileCardRow label={tr('workMemo.reminderTime')} value={formatDateTime(memo.reminderTime)} />
                      <MobileCardActions>
                        {triggered && !memo.isRead && (
                          <Button variant="ghost" size="sm" className="h-8 flex-1 text-green-600" onClick={() => handleMarkAsRead(memo.id)}>
                            <Check className="h-4 w-4 mr-1" />{tr('workMemo.confirmRead')}
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" className="h-8 flex-1" onClick={() => handleOpenEdit(memo)}>
                          <Pencil className="h-4 w-4 mr-1" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 text-destructive" onClick={() => handleDelete(memo.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
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
                  <TableHead className="text-center">{tr('workMemo.status')}</TableHead>
                  <TableHead className="text-center">{tr('workMemo.entryTime')}</TableHead>
                  <TableHead className="text-center">{tr('workMemo.phoneNumber')}</TableHead>
                  <TableHead className="text-center">{tr('workMemo.remark1')}</TableHead>
                  <TableHead className="text-center">{tr('workMemo.remark2')}</TableHead>
                  <TableHead className="text-center">{tr('workMemo.reminderTime')}</TableHead>
                  <TableHead className="text-center w-[120px]">{tr('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {memos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      {tr('workMemo.noMemos')}
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
                              {tr('workMemo.pending')}
                            </Badge>
                          ) : memo.isRead ? (
                            <Badge variant="outline" className="text-muted-foreground">
                              {tr('workMemo.read')}
                            </Badge>
                          ) : (
                            <Badge variant="outline">{tr('workMemo.waiting')}</Badge>
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
                                  >
                                    <Check className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>{tr('workMemo.confirmRead')}</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      {tr('workMemo.confirmReadQuestion')}
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>{tr('common.cancel')}</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleMarkAsRead(memo.id)}
                                      className="bg-green-600 text-white hover:bg-green-700"
                                    >
                                      {tr('workMemo.confirmRead')}
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
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>{tr('workMemo.confirmDelete')}</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    {tr('workMemo.deleteQuestion')}
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>{tr('common.cancel')}</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDelete(memo.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    {tr('common.delete')}
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

      {/* Edit Memo Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{tr('workMemo.editMemo')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{tr('workMemo.phoneNumber')}</Label>
              <Input
                value={editPhoneNumber}
                onChange={(e) => setEditPhoneNumber(e.target.value)}
                placeholder={tr('workMemo.phonePlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label>{tr('workMemo.remark1')}</Label>
              <Input
                value={editRemark1}
                onChange={(e) => setEditRemark1(e.target.value)}
                placeholder={tr('workMemo.remarkPlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label>{tr('workMemo.remark2')}</Label>
              <Input
                value={editRemark2}
                onChange={(e) => setEditRemark2(e.target.value)}
                placeholder={tr('workMemo.remarkPlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label>{tr('workMemo.delayReminder')}</Label>
              <CustomReminderSelect
                value={delayOffset}
                onChange={setDelayOffset}
              />
              <p className="text-xs text-muted-foreground">
                {tr('workMemo.delayNote')}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              {tr('common.cancel')}
            </Button>
            <Button onClick={handleSaveEdit}>{tr('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
