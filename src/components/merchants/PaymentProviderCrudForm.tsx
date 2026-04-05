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

export interface PaymentProviderCrudFormProps {
  formName: string;
  setFormName: (v: string) => void;
  formStatus: string;
  setFormStatus: (v: string) => void;
  formRemark: string;
  setFormRemark: (v: string) => void;
}

export function PaymentProviderCrudForm({
  formName,
  setFormName,
  formStatus,
  setFormStatus,
  formRemark,
  setFormRemark,
}: PaymentProviderCrudFormProps) {
  const { t } = useLanguage();
  return (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <Label>{t("merchants.providerName")} *</Label>
        <Input
          placeholder={t("merchants.namePlaceholder")}
          value={formName}
          onChange={(e) => setFormName(e.target.value)}
        />
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
