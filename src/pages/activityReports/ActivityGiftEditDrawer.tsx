import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { DrawerDetail } from "@/components/shell/DrawerDetail";
import { cn } from "@/lib/utils";
import type { Dispatch, SetStateAction } from "react";
import type { ActivityGiftEditForm } from "./activityGiftsData";

type CurrencyOption = { code: string; name_zh: string };
type ProviderOption = { id: string; name: string; status: string };
type ActivityTypeEntry = { value: string; label: string; isActive: boolean };
type EmployeeOption = { id: string; realName: string };

export interface ActivityGiftEditDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  editFormData: ActivityGiftEditForm;
  setEditFormData: Dispatch<SetStateAction<ActivityGiftEditForm>>;
  currencies: CurrencyOption[];
  activeProviders: ProviderOption[];
  activityTypeEntries: ActivityTypeEntry[];
  employeeList: EmployeeOption[];
  showRecorderSelect: boolean;
  isAdmin: boolean;
  activityGiftPreferSubmitReview: boolean;
  saveButtonLabelAdmin: string;
  saveButtonLabelReview: string;
  saveButtonLabelDefault: string;
  cancelLabel: string;
  t: (zh: string, en: string) => string;
  onSave: () => void;
}

export default function ActivityGiftEditDrawer({
  open,
  onOpenChange,
  title,
  editFormData,
  setEditFormData,
  currencies,
  activeProviders,
  activityTypeEntries,
  employeeList,
  showRecorderSelect,
  isAdmin,
  activityGiftPreferSubmitReview,
  saveButtonLabelAdmin,
  saveButtonLabelReview,
  saveButtonLabelDefault,
  cancelLabel,
  t,
  onSave,
}: ActivityGiftEditDrawerProps) {
  return (
    <DrawerDetail open={open} onOpenChange={onOpenChange} title={title} sheetMaxWidth="2xl">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{t("赠送币种", "Currency")}</Label>
          <Select value={editFormData.currency} onValueChange={(v) => setEditFormData({ ...editFormData, currency: v })}>
            <SelectTrigger>
              <SelectValue placeholder={t("请选择币种", "Select currency")} />
            </SelectTrigger>
            <SelectContent>
              {currencies.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.code} - {c.name_zh}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>{t("赠送金额", "Amount")}</Label>
          <Input value={editFormData.amount} onChange={(e) => setEditFormData({ ...editFormData, amount: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>{t("汇率", "Rate")}</Label>
          <Input type="number" step="0.01" value={editFormData.rate} onChange={(e) => setEditFormData({ ...editFormData, rate: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>{t("电话号码", "Phone")}</Label>
          <Input value={editFormData.phone} onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>{t("代付商家", "Agent")}</Label>
          <Select value={editFormData.paymentAgent} onValueChange={(v) => setEditFormData({ ...editFormData, paymentAgent: v })}>
            <SelectTrigger>
              <SelectValue placeholder={t("请选择代付商家", "Select agent")} />
            </SelectTrigger>
            <SelectContent>
              {activeProviders
                .filter((p) => p.status === "active")
                .map((provider) => (
                  <SelectItem key={provider.id} value={provider.name}>
                    {provider.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>{t("类型", "Type")}</Label>
          <Select value={editFormData.giftType} onValueChange={(v) => setEditFormData({ ...editFormData, giftType: v })}>
            <SelectTrigger>
              <SelectValue placeholder={t("请选择类型", "Select type")} />
            </SelectTrigger>
            <SelectContent>
              {activityTypeEntries
                .filter((entry) => entry.isActive)
                .map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        {showRecorderSelect && (
          <div className="space-y-2">
            <Label>{t("录入人", "Recorder")}</Label>
            <Select value={editFormData.creatorId} onValueChange={(v) => setEditFormData({ ...editFormData, creatorId: v })}>
              <SelectTrigger>
                <SelectValue placeholder={t("请选择录入人", "Select recorder")} />
              </SelectTrigger>
              <SelectContent>
                {employeeList.map((emp) => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.realName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className={`space-y-2 ${showRecorderSelect ? "" : "col-span-2"}`}>
          <Label>{t("备注", "Remark")}</Label>
          <Input value={editFormData.remark} onChange={(e) => setEditFormData({ ...editFormData, remark: e.target.value })} />
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4 mt-4">
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          {cancelLabel}
        </Button>
        <Button onClick={onSave} className={cn(!isAdmin && activityGiftPreferSubmitReview && "bg-amber-500 text-white hover:bg-amber-600")}>
          {isAdmin ? saveButtonLabelAdmin : activityGiftPreferSubmitReview ? saveButtonLabelReview : saveButtonLabelDefault}
        </Button>
      </div>
    </DrawerDetail>
  );
}
