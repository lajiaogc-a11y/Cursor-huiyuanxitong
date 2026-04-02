import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingsPageContainer } from "@/components/SettingsSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { SortableTableRow } from "@/components/ui/sortable-item";
import { Plus, Edit, Trash2, Activity, Save } from "lucide-react";
import { notify } from "@/lib/notifyHub";
import { useLanguage } from "@/contexts/LanguageContext";
import { useActivityTypes, ActivityType } from "@/hooks/useActivityTypes";
import { logOperation } from "@/stores/auditLogStore";

export default function ActivityTypeSettingsTab() {
  const { t } = useLanguage();
  const { activityTypes, loading, addActivityType, updateActivityType, updateSortOrders, deleteActivityType } = useActivityTypes();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingType, setEditingType] = useState<ActivityType | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [typeToDelete, setTypeToDelete] = useState<ActivityType | null>(null);

  // 拖拽传感器配置
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleAdd = () => {
    setEditingType(null);
    setNewLabel("");
    setIsDialogOpen(true);
  };

  const handleEdit = (type: ActivityType) => {
    setEditingType(type);
    setNewLabel(type.label);
    setIsDialogOpen(true);
  };

  const handleDeleteClick = (type: ActivityType) => {
    setTypeToDelete(type);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (typeToDelete) {
      const success = await deleteActivityType(typeToDelete.id);
      if (success) {
        logOperation('activity_type', 'delete', typeToDelete.id, typeToDelete, null, `删除活动类型: ${typeToDelete.label}`);
        notify.success(t("已删除", "Deleted"));
      } else {
        notify.error(t("删除失败", "Delete failed"));
      }
    }
    setDeleteDialogOpen(false);
    setTypeToDelete(null);
  };

  const handleSave = async () => {
    if (!newLabel.trim()) {
      notify.error(t("请输入活动类型名称", "Please enter activity type name"));
      return;
    }

    if (editingType) {
      const beforeData = { ...editingType };
      const success = await updateActivityType(editingType.id, { label: newLabel.trim() });
      if (success) {
        logOperation('activity_type', 'update', editingType.id, beforeData, { ...editingType, label: newLabel.trim() }, `更新活动类型: ${newLabel.trim()}`);
        notify.success(t("已更新", "Updated"));
      } else {
        notify.error(t("更新失败", "Update failed"));
      }
    } else {
      const value = `type_${Date.now()}`;
      const success = await addActivityType(value, newLabel.trim());
      if (success) {
        logOperation('activity_type', 'create', value, null, { value, label: newLabel.trim() }, `新增活动类型: ${newLabel.trim()}`);
        notify.success(t("已添加", "Added"));
      } else {
        notify.error(t("添加失败", "Add failed"));
      }
    }

    setIsDialogOpen(false);
    setEditingType(null);
    setNewLabel("");
  };

  const handleToggleActive = async (type: ActivityType) => {
    const success = await updateActivityType(type.id, { isActive: !type.isActive });
    if (success) {
      notify.success(
        type.isActive
          ? t("已禁用", "Disabled")
          : t("已启用", "Enabled")
      );
    }
  };

  // 拖拽结束处理
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = activityTypes.findIndex((row) => row.id === active.id);
      const newIndex = activityTypes.findIndex((row) => row.id === over.id);

      const newOrder = arrayMove(activityTypes, oldIndex, newIndex);
      
      // 批量更新排序
      const updates = newOrder.map((type, index) => ({
        id: type.id,
        sortOrder: index + 1,
      }));

      const success = await updateSortOrders(updates);
      if (success) {
        notify.success(t("排序已更新", "Sort order updated"));
      } else {
        notify.error(t("排序更新失败", "Failed to update sort order"));
      }
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          {t("加载中...", "Loading...")}
        </CardContent>
      </Card>
    );
  }

  return (
    <SettingsPageContainer>
    <Card className="rounded-xl shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5" />
            {t("活动类型设置", "Activity Type Settings")}
          </CardTitle>
          <Button onClick={handleAdd} size="sm" className="gap-1">
            <Plus className="h-4 w-4" />
            {t("新增类型", "Add Type")}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {t(
            "拖拽左侧图标可调整排序。这些类型会在活动赠送中作为下拉选项使用。",
            "Drag the left icon to adjust order. These types are used as dropdown options in activity gifts."
          )}
        </p>
      </CardHeader>
      <CardContent>
        <div className="border rounded-lg overflow-hidden">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-[50px]"></TableHead>
                  <TableHead className="w-[60px] text-center">{t("序号", "No.")}</TableHead>
                  <TableHead>{t("活动类型名称", "Activity Type Name")}</TableHead>
                  <TableHead className="w-[80px] text-center">{t("状态", "Status")}</TableHead>
                  <TableHead className="w-[100px] text-center">{t("操作", "Actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <SortableContext
                  items={activityTypes.map((row) => row.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {activityTypes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        {t("暂无活动类型", "No activity types")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    activityTypes.map((type, index) => (
                      <SortableTableRow key={type.id} id={type.id}>
                        <TableCell className="text-center text-muted-foreground">{index + 1}</TableCell>
                        <TableCell className="font-medium">{type.label}</TableCell>
                        <TableCell className="text-center">
                          <Switch
                            checked={type.isActive}
                            onCheckedChange={() => handleToggleActive(type)}
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleEdit(type)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => handleDeleteClick(type)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </SortableTableRow>
                    ))
                  )}
                </SortableContext>
              </TableBody>
            </Table>
          </DndContext>
        </div>
      </CardContent>

      <DrawerDetail
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        title={
          editingType
            ? t("编辑活动类型", "Edit Activity Type")
            : t("新增活动类型", "Add Activity Type")
        }
        sheetMaxWidth="xl"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t("活动类型名称", "Activity Type Name")}</Label>
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder={t("请输入活动类型名称", "Enter activity type name")}
            />
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4 mt-4">
          <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
            {t("取消", "Cancel")}
          </Button>
          <Button onClick={handleSave} className="gap-1">
            <Save className="h-4 w-4" />
            {t("保存", "Save")}
          </Button>
        </div>
      </DrawerDetail>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("确认删除", "Confirm Delete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                `确定要删除活动类型"${typeToDelete?.label}"吗？此操作无法撤销。`,
                `Are you sure you want to delete activity type "${typeToDelete?.label}"? This action cannot be undone.`
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("删除", "Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
    </SettingsPageContainer>
  );
}
