import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getCurrenciesApi } from "@/services/staff/dataApi/referenceLists";
import { CurrencyCode } from "@/config/currencies";
import { useLanguage } from "@/contexts/LanguageContext";

interface Currency {
  code: string;
  name_zh: string;
  name_en: string;
  symbol?: string;
  badge_color?: string;
}

interface CurrencySelectProps {
  value: CurrencyCode | string;
  onValueChange: (value: CurrencyCode) => void;
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  locale?: 'zh' | 'en';
  disabled?: boolean;
}

// Hook to fetch currencies from database
export function useCurrencies() {
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCurrencies() {
      try {
        const all = await getCurrenciesApi();
        const list = all.filter((c) => {
          const raw = c.is_active as unknown;
          return raw === true || Number(raw) === 1 || String(raw) === "1";
        });
        if (list.length === 0) {
          setCurrencies([
            { code: 'NGN', name_zh: '奈拉', name_en: 'Naira', symbol: '₦' },
            { code: 'GHS', name_zh: '赛地', name_en: 'Cedi', symbol: '₵' },
            { code: 'USDT', name_zh: 'USDT', name_en: 'USDT', symbol: '$' },
          ]);
        } else {
          setCurrencies(
            list.map((c) => ({
              ...c,
              name_en: c.name_en ?? "",
              symbol: c.symbol ?? undefined,
              badge_color: c.badge_color ?? undefined,
            })),
          );
        }
      } catch (err) {
        console.error('Error fetching currencies:', err);
        setCurrencies([
          { code: 'NGN', name_zh: '奈拉', name_en: 'Naira', symbol: '₦' },
          { code: 'GHS', name_zh: '赛地', name_en: 'Cedi', symbol: '₵' },
          { code: 'USDT', name_zh: 'USDT', name_en: 'USDT', symbol: '$' },
        ]);
      } finally {
        setLoading(false);
      }
    }

    fetchCurrencies();
  }, []);

  return { currencies, loading };
}

// Get currency codes as array
export function getCurrencyCodes(currencies: Currency[]): string[] {
  return currencies.map(c => c.code);
}

export default function CurrencySelect({
  value,
  onValueChange,
  placeholder,
  className,
  triggerClassName,
  locale,
  disabled = false,
}: CurrencySelectProps) {
  const { currencies, loading } = useCurrencies();
  const { language, t } = useLanguage();
  
  const effectiveLocale = locale || language;
  const effectivePlaceholder = placeholder || t("选择币种", "Select currency");

  const getDisplayName = (currency: Currency) => {
    return effectiveLocale === 'zh' ? currency.name_zh : currency.name_en;
  };

  return (
    <Select 
      value={value} 
      onValueChange={(v) => onValueChange(v as CurrencyCode)} 
      disabled={disabled || loading}
    >
      <SelectTrigger className={`min-w-[120px] ${triggerClassName || ''}`}>
        <SelectValue placeholder={effectivePlaceholder} />
      </SelectTrigger>
      <SelectContent className={`min-w-[160px] ${className || ''}`}>
        {currencies.map((currency) => (
          <SelectItem key={currency.code} value={currency.code}>
            {getDisplayName(currency)} ({currency.code})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
