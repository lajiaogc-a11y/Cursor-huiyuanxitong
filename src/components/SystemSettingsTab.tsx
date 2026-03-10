import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Settings, Save } from "lucide-react";
import { toast } from "sonner";
import {
  getFeeSettings,
  saveFeeSettings,
  getTrxSettings,
  saveTrxSettings,
  FeeSettings,
  TrxSettings,
} from "@/stores/systemSettings";
import { CURRENCIES } from "@/config/currencies";
import { useLanguage } from "@/contexts/LanguageContext";

interface SystemSettingsTabProps {
  nairaRate: number;
  cediRate: number;
  usdtFee: number;
  onNairaRateChange: (rate: number) => void;
  onCediRateChange: (rate: number) => void;
  onUsdtFeeChange: (fee: number) => void;
}

export default function SystemSettingsTab({
  nairaRate,
  cediRate,
  usdtFee,
  onNairaRateChange,
  onCediRateChange,
  onUsdtFeeChange,
}: SystemSettingsTabProps) {
  const { tr, language } = useLanguage();
  const [feeSettings, setFeeSettings] = useState<FeeSettings>(getFeeSettings());
  const [trxSettings, setTrxSettings] = useState<TrxSettings>(getTrxSettings());


  const handleSaveFeeSettings = () => {
    saveFeeSettings(feeSettings);
    toast.success(tr('systemSettings.feeSaved'));
  };

  const handleSaveTrxQuantity = () => {
    saveTrxSettings(trxSettings);
    toast.success(tr('systemSettings.trxSaved'));
  };

  const handleSaveRates = () => {
    toast.success(tr('systemSettings.rateSaved'));
  };


  return (
    <div className="space-y-6 max-w-4xl">
      {/* Fee Settings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Settings className="h-4 w-4" />
            {tr('systemSettings.feeSettingsTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Naira Fee Settings */}
          <div className="p-4 bg-orange-50 dark:bg-orange-950/20 rounded-lg border border-orange-200 dark:border-orange-800">
            <div className="flex items-center gap-2 mb-3">
              <Badge className="bg-orange-500">{CURRENCIES.NGN.name}</Badge>
              <span className="text-sm text-muted-foreground">{tr('systemSettings.feeRules')}</span>
            </div>
            <div className="grid grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label className="text-xs">{tr('systemSettings.paymentAmountGte')}</Label>
                <Input
                  type="number"
                  value={feeSettings.nairaThreshold}
                  onChange={(e) =>
                    setFeeSettings({
                      ...feeSettings,
                      nairaThreshold: parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">{tr('systemSettings.fee')}</Label>
                <Input
                  type="number"
                  value={feeSettings.nairaFeeAbove}
                  onChange={(e) =>
                    setFeeSettings({
                      ...feeSettings,
                      nairaFeeAbove: parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">{tr('systemSettings.paymentAmountLt')}</Label>
                <Input
                  type="number"
                  value={feeSettings.nairaThreshold}
                  disabled
                  className="bg-muted"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">{tr('systemSettings.fee')}</Label>
                <Input
                  type="number"
                  value={feeSettings.nairaFeeBelow}
                  onChange={(e) =>
                    setFeeSettings({
                      ...feeSettings,
                      nairaFeeBelow: parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </div>
            </div>
          </div>

          {/* Cedi Fee Settings */}
          <div className="p-4 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800">
            <div className="flex items-center gap-2 mb-3">
              <Badge className="bg-green-500">{CURRENCIES.GHS.name}</Badge>
              <span className="text-sm text-muted-foreground">{tr('systemSettings.feeRules')}</span>
            </div>
            <div className="grid grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label className="text-xs">{tr('systemSettings.paymentAmountGte')}</Label>
                <Input
                  type="number"
                  value={feeSettings.cediThreshold}
                  onChange={(e) =>
                    setFeeSettings({
                      ...feeSettings,
                      cediThreshold: parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">{tr('systemSettings.fee')}</Label>
                <Input
                  type="number"
                  value={feeSettings.cediFeeAbove}
                  onChange={(e) =>
                    setFeeSettings({
                      ...feeSettings,
                      cediFeeAbove: parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">{tr('systemSettings.paymentAmountLt')}</Label>
                <Input
                  type="number"
                  value={feeSettings.cediThreshold}
                  disabled
                  className="bg-muted"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">{tr('systemSettings.fee')}</Label>
                <Input
                  type="number"
                  value={feeSettings.cediFeeBelow}
                  onChange={(e) =>
                    setFeeSettings({
                      ...feeSettings,
                      cediFeeBelow: parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </div>
            </div>
          </div>

          <Button onClick={handleSaveFeeSettings} className="gap-2">
            <Save className="h-4 w-4" />
            {tr('systemSettings.saveFeeSettings')}
          </Button>
        </CardContent>
      </Card>

      {/* TRX Settings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Settings className="h-4 w-4" />
            {tr('systemSettings.trxSettingsTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">
                {tr('systemSettings.trxRate')}
              </Label>
              <Input
                type="number"
                step="0.0001"
                value={trxSettings.trxRate}
                onChange={(e) =>
                  setTrxSettings({
                    ...trxSettings,
                    trxRate: parseFloat(e.target.value) || 0,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">{tr('systemSettings.trxQuantity')}</Label>
              <Input
                type="number"
                step="0.1"
                value={trxSettings.trxQuantity}
                onChange={(e) =>
                  setTrxSettings({
                    ...trxSettings,
                    trxQuantity: parseFloat(e.target.value) || 0,
                  })
                }
                placeholder={tr('systemSettings.trxQuantityPlaceholder')}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={handleSaveTrxQuantity} className="gap-2">
                <Save className="h-4 w-4" />
                {tr('systemSettings.saveTrxSettings')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Rate Settings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Settings className="h-4 w-4" />
            {tr('systemSettings.rateSettingsTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">{tr('systemSettings.nairaRate')}</Label>
              <Input
                type="number"
                value={nairaRate}
                onChange={(e) => onNairaRateChange(parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">{tr('systemSettings.cediRate')}</Label>
              <Input
                type="number"
                step="0.01"
                value={cediRate}
                onChange={(e) => onCediRateChange(parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">{tr('systemSettings.usdtFee')}</Label>
              <Input
                type="number"
                step="0.1"
                value={usdtFee}
                onChange={(e) => onUsdtFeeChange(parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>
          <Button onClick={handleSaveRates} className="gap-2 mt-4">
            <Save className="h-4 w-4" />
            {tr('systemSettings.saveRateSettings')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
