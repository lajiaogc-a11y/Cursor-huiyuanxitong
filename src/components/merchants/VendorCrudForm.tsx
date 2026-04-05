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
import type { PaymentProvider } from "@/hooks/useMerchantConfig";

export interface VendorCrudFormProps {
  formName: string;
  setFormName: (v: string) => void;
  formStatus: string;
  setFormStatus: (v: string) => void;
  formRemark: string;
  setFormRemark: (v: string) => void;
  formPaymentProviders: string[];
  paymentProviders: PaymentProvider[];
  onTogglePaymentProvider: (providerName: string) => void;
}

export function VendorCrudForm({
  formName,
  setFormName,
  formStatus,
  setFormStatus,
  formRemark,
  setFormRemark,
  formPaymentProviders,
  paymentProviders,
  onTogglePaymentProvider,
}: VendorCrudFormProps) {
  const { t } = useLanguage();
  return (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <Label>{t("merchants.vendorName")} *</Label>
        <Input
          placeholder={t("merchants.namePlaceholder")}
          value={formName}
          onChange={(e) => setFormName(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>{t("merchants.paymentProvidersFor")}</Label>
        <div className="text-xs text-muted-foreground mb-1">{t("merchants.selectProviders")}</div>
        <div className="flex flex-wrap gap-1 p-2 border rounded-lg max-h-32 overflow-auto">
          {paymentProviders
            .filter((p) => p.status === "active")
            .map((provider) => (
              <Badge
                key={provider.id}
                variant={formPaymentProviders.includes(provider.name) ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => onTogglePaymentProvider(provider.name)}
              >
                {provider.name}
              </Badge>
            ))}
        </div>
        {formPaymentProviders.length > 0 && (
          <div className="text-xs text-muted-foreground">
            {t("merchants.selected")}: {formPaymentProviders.join(", ")}
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
