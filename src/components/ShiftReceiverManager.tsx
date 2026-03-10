// ============= 接班人管理组件 =============
// 支持接班人的增删改功能

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, Pencil, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  getShiftReceivers,
  addShiftReceiver,
  updateShiftReceiver,
  deleteShiftReceiver,
  ShiftReceiver,
} from '@/stores/shiftHandoverStore';

interface ShiftReceiverManagerProps {
  onReceiversChange?: (receivers: ShiftReceiver[]) => void;
}

export default function ShiftReceiverManager({ onReceiversChange }: ShiftReceiverManagerProps) {
  const { tr } = useLanguage();
  
  const [receivers, setReceivers] = useState<ShiftReceiver[]>([]);
  const [isManageDialogOpen, setIsManageDialogOpen] = useState(false);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  
  const [newReceiverName, setNewReceiverName] = useState('');
  const [editingReceiver, setEditingReceiver] = useState<ShiftReceiver | null>(null);
  const [editName, setEditName] = useState('');
  const [deletingReceiver, setDeletingReceiver] = useState<ShiftReceiver | null>(null);
  
  // 加载接班人列表
  const loadReceivers = async () => {
    const data = await getShiftReceivers();
    setReceivers(data);
    onReceiversChange?.(data);
  };
  
  useEffect(() => {
    loadReceivers();
  }, []);
  
  // 添加接班人
  const handleAdd = async () => {
    if (!newReceiverName.trim()) {
      toast.error(tr('shiftHandover.pleaseEnterName'));
      return;
    }
    
    const receiver = await addShiftReceiver(newReceiverName);
    if (receiver) {
      await loadReceivers();
      setNewReceiverName('');
      setIsAddDialogOpen(false);
      toast.success(tr('shiftHandover.addedSuccessfully'));
    } else {
      toast.error(tr('shiftHandover.addFailed'));
    }
  };
  
  // 开始编辑
  const handleStartEdit = (receiver: ShiftReceiver) => {
    setEditingReceiver(receiver);
    setEditName(receiver.name);
    setIsEditDialogOpen(true);
  };
  
  // 保存编辑
  const handleSaveEdit = async () => {
    if (!editingReceiver || !editName.trim()) {
      toast.error(tr('shiftHandover.pleaseEnterName'));
      return;
    }
    
    const updated = await updateShiftReceiver(editingReceiver.id, editName);
    if (updated) {
      await loadReceivers();
      setIsEditDialogOpen(false);
      setEditingReceiver(null);
      toast.success(tr('shiftHandover.updatedSuccessfully'));
    } else {
      toast.error(tr('shiftHandover.updateFailed'));
    }
  };
  
  // 开始删除
  const handleStartDelete = (receiver: ShiftReceiver) => {
    setDeletingReceiver(receiver);
    setIsDeleteDialogOpen(true);
  };
  
  // 确认删除
  const handleConfirmDelete = async () => {
    if (!deletingReceiver) return;
    
    const success = await deleteShiftReceiver(deletingReceiver.id);
    if (success) {
      await loadReceivers();
      setIsDeleteDialogOpen(false);
      setDeletingReceiver(null);
      toast.success(tr('shiftHandover.deletedSuccessfully'));
    } else {
      toast.error(tr('shiftHandover.deleteFailed'));
    }
  };
  
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsManageDialogOpen(true)}
        className="gap-1"
      >
        <Users className="h-3 w-3" />
        {tr('shiftHandover.manageReceivers')}
      </Button>
      
      {/* 管理接班人主对话框 */}
      <Dialog open={isManageDialogOpen} onOpenChange={setIsManageDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{tr('shiftHandover.receiverManagement')}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <div className="flex justify-end mb-4">
              <Button size="sm" onClick={() => setIsAddDialogOpen(true)} className="gap-1">
                <Plus className="h-4 w-4" />
                {tr('common.add')}
              </Button>
            </div>
            
            {receivers.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                {tr('shiftHandover.noReceiversYet')}
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b">
                      <th className="text-left p-3 font-medium">{tr('shiftHandover.name')}</th>
                      <th className="text-center p-3 font-medium w-32">{tr('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receivers.map(receiver => (
                      <tr key={receiver.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="p-3">{receiver.name}</td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              className="action-link flex items-center gap-1"
                              onClick={() => handleStartEdit(receiver)}
                            >
                              <Pencil className="h-3 w-3" />
                              {tr('common.edit')}
                            </button>
                            <span className="text-muted-foreground">|</span>
                            <button
                              className="action-link-destructive flex items-center gap-1"
                              onClick={() => handleStartDelete(receiver)}
                            >
                              <Trash2 className="h-3 w-3" />
                              {tr('common.delete')}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsManageDialogOpen(false)}>
              {tr('common.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* 添加对话框 */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{tr('shiftHandover.addReceiver')}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Label>{tr('shiftHandover.name')}</Label>
            <Input
              value={newReceiverName}
              onChange={e => setNewReceiverName(e.target.value)}
              placeholder={tr('shiftHandover.enterReceiverName')}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              {tr('common.cancel')}
            </Button>
            <Button onClick={handleAdd}>
              <Plus className="h-4 w-4 mr-1" />
              {tr('common.add')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* 编辑对话框 */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{tr('shiftHandover.editReceiver')}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Label>{tr('shiftHandover.name')}</Label>
            <Input
              value={editName}
              onChange={e => setEditName(e.target.value)}
              placeholder={tr('shiftHandover.enterReceiverName')}
              onKeyDown={e => e.key === 'Enter' && handleSaveEdit()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              {tr('common.cancel')}
            </Button>
            <Button onClick={handleSaveEdit}>
              {tr('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* 删除确认对话框 */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tr('merchants.confirmDelete')}</AlertDialogTitle>
            <AlertDialogDescription>
              {tr('shiftHandover.confirmDeleteReceiver')} "{deletingReceiver?.name}"？
              {tr('shiftHandover.cannotUndo')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {tr('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
