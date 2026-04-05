import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/contexts/LanguageContext";
import type { Vendor } from "@/hooks/useMerchantConfig";

export interface CardCrudFormProps {
  formName: string;
  setFormName: (v: string) => void;
  formCardType: string;
  setFormCardType: (v: string) => void;
  formStatus: string;
  setFormStatus: (v: string) => void;
  formRemark: string;
  setFormRemark: (v: string) => void;
  formCardVendors: string[];
  vendors: Vendor[];
  onToggleVendor: (vendorName: string) => void;
}

export function CardCrudForm({
  formName,
  setFormName,
  formCardType,
  setFormCardType,
  formStatus,
  setFormStatus,
  formRemark,
  setFormRemark,
  formCardVendors,
  vendors,
  onToggleVendor,
}: CardCrudFormProps) {
  const { t } = useLanguage();
  return (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <Label>{t("merchants.cardName")} *</Label>
        <Input
          placeholder={t("merchants.namePlaceholder")}
          value={formName}
          onChange={(e) => setFormName(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>{t("merchants.cardType")}</Label>
        <div className="text-xs text-muted-foreground mb-1">{t("merchants.cardTypeHint")}</div>
        <Input
          placeholder={t("merchants.cardType")}
          value={formCardType}
          onChange={(e) => setFormCardType(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>{t("merchants.cardVendors")}</Label>
        <div className="text-xs text-muted-foreground mb-1">{t("merchants.selectVendors")}</div>
        <div className="flex flex-wrap gap-1 p-2 border rounded-lg max-h-32 overflow-auto">
          {vendors
            .filter((v) => v.status === "active")
            .map((vendor) => (
              <Badge
                key={vendor.id}
                variant={formCardVendors.includes(vendor.name) ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => onToggleVendor(vendor.name)}
              >
                {vendor.name}
              </Badge>
            ))}
        </div>
        {formCardVendors.length > 0 && (
          <div className="text-xs text-muted-foreground">
            {t("merchants.selected")}: {formCardVendors.join(", ")}
          </div>
        )}
      </div>
      <div className="space-y-2">
        <Label>{t("merchants.status")}</Label>
        <Select value={formStatus} onValueChange={(v) => setFormStatus(v)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">{t("merchants.active")}</SelectItem>
            <SelectItem value="inactive">{t("merchants.inactive")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>{t("merchants.remark")}</Label>
        <Textarea
          placeholder={t("merchants.remarkPlaceholder")}
          value={formRemark}
          onChange={(e) => setFormRemark(e.target.value)}
          rows={3}
        />
      </div>
    </div>
  );
}
