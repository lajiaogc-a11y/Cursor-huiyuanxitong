import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useLanguage } from "@/contexts/LanguageContext";
import { CardTab } from "@/pages/merchants/CardTab";
import { VendorTab } from "@/pages/merchants/VendorTab";
import { PaymentProviderTab } from "@/pages/merchants/PaymentProviderTab";

const MERCHANT_TAB_MAP: Record<string, string> = { cards: "cards", vendors: "vendors", "payment-providers": "payment-providers" };

export default function MerchantManagement() {
  const [searchParams] = useSearchParams();
  const tabFromUrl = MERCHANT_TAB_MAP[searchParams.get("tab") || ""] || "cards";
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState(tabFromUrl);

  useEffect(() => {
    setActiveTab(tabFromUrl);
  }, [tabFromUrl]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Link
          to="/staff/tasks/settings"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {t("进入维护设置", "Maintenance Settings")} →
        </Link>
      </div>
      <Card>
        <CardContent className="pt-4">
          <Tabs value={activeTab} className="w-full">
            <TabsContent value="cards" className="mt-4">
              <CardTab />
            </TabsContent>
            <TabsContent value="vendors" className="mt-4">
              <VendorTab />
            </TabsContent>
            <TabsContent value="payment-providers" className="mt-4">
              <PaymentProviderTab />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
