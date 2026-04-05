import { useState, useCallback, useEffect, useRef } from 'react';
import { Search, User, ShoppingCart, Building, X, ArrowRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DrawerDetail } from '@/components/shell/DrawerDetail';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { apiGet } from '@/api/client';
import { getMyTenantOrdersFull, getMyTenantUsdtOrdersFull, getTenantOrdersFull, getTenantUsdtOrdersFull } from '@/services/tenantService';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTenantView } from '@/contexts/TenantViewContext';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface SearchResult {
  type: 'member' | 'order' | 'merchant';
  id: string;
  title: string;
  subtitle: string;
  link: string;
}

const typeConfig = {
  member: { icon: User, label: { zh: '会员', en: 'Member' }, color: 'bg-blue-500/10 text-blue-600' },
  order: { icon: ShoppingCart, label: { zh: '订单', en: 'Order' }, color: 'bg-emerald-500/10 text-emerald-600' },
  merchant: { icon: Building, label: { zh: '商家', en: 'Merchant' }, color: 'bg-amber-500/10 text-amber-600' },
};

export function GlobalSearch() {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const { viewingTenantId } = useTenantView() || {};
  const { employee } = useAuth() || {};
  const effectiveTenantId = viewingTenantId || employee?.tenant_id || null;
  const useMyTenantRpc = !!(effectiveTenantId && employee?.tenant_id && effectiveTenantId === employee.tenant_id);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();
  const focusTimerRef = useRef<NodeJS.Timeout>();

  // Keyboard shortcut Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (open) {
      focusTimerRef.current = setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery('');
      setResults([]);
    }
    return () => {
      clearTimeout(focusTimerRef.current);
      clearTimeout(debounceRef.current);
    };
  }, [open]);

  const search = useCallback(async (q: string) => {
    if (!q || q.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const searchResults: SearchResult[] = [];
      
      // Search members by phone or member_code（表代理 or=）
      const orParam = encodeURIComponent(`phone_number.ilike.%${q}%,member_code.ilike.%${q}%`);
      const members = await apiGet<Array<{ id: string; phone_number: string; member_code: string }>>(
        `/api/data/table/members?select=id,phone_number,member_code&or=${orParam}&limit=5`
      );
      (Array.isArray(members) ? members : []).forEach((m: { id: string; phone_number: string; member_code: string }) => {
        searchResults.push({
          type: 'member',
          id: m.id,
          title: m.member_code,
          subtitle: m.phone_number,
          link: '/staff/member-management',
        });
      });

      // Search orders by order_number or phone - use RPC to avoid RLS
      const [ngnOrders, usdtOrders] = effectiveTenantId && !useMyTenantRpc
        ? await Promise.all([getTenantOrdersFull(effectiveTenantId), getTenantUsdtOrdersFull(effectiveTenantId)])
        : await Promise.all([getMyTenantOrdersFull(), getMyTenantUsdtOrdersFull()]);
      const allOrders = [...(ngnOrders || []), ...(usdtOrders || [])].filter(
        (o: any) => !o.is_deleted && (
          String(o.order_number || '').toLowerCase().includes(q.toLowerCase()) ||
          String(o.phone_number || '').toLowerCase().includes(q.toLowerCase())
        )
      ).slice(0, 5);
      allOrders.forEach((o: any) => {
        searchResults.push({
          type: 'order',
          id: o.id,
          title: o.order_number,
          subtitle: o.phone_number || '',
          link: '/staff/orders',
        });
      });

      const cards = await apiGet<{ id: string; name: string; status: string }[]>(
        `/api/data/table/cards?select=id,name,status&name=ilike.${encodeURIComponent(`%${q}%`)}&limit=5`
      );
      (Array.isArray(cards) ? cards : []).forEach((c: { id: string; name: string; status: string }) => {
        searchResults.push({
          type: 'merchant',
          id: c.id,
          title: c.name,
          subtitle: c.status === 'active' ? t('活跃', 'Active') : t('停用', 'Inactive'),
          link: '/staff/merchants',
        });
      });

      setResults(searchResults);
    } catch (e) {
      console.error('Search error:', e);
    } finally {
      setLoading(false);
    }
  }, [t, effectiveTenantId, useMyTenantRpc]);

  const handleInputChange = (value: string) => {
    setQuery(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), 300);
  };

  const handleSelect = (result: SearchResult) => {
    navigate(result.link);
    setOpen(false);
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-9 gap-2 text-muted-foreground hover:bg-accent"
        onClick={() => setOpen(true)}
      >
        <Search className="h-4 w-4" />
        <span className="hidden lg:inline text-xs">{t('搜索', 'Search')}</span>
        <kbd className="hidden lg:inline-flex h-5 items-center gap-0.5 rounded border border-border bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
          ⌘K
        </kbd>
      </Button>

      <DrawerDetail
        open={open}
        onOpenChange={setOpen}
        title={t('搜索', 'Search')}
        description={t('搜索会员、订单、商家…', 'Search members, orders, merchants…')}
        sheetMaxWidth="xl"
      >
        <div className="flex items-center rounded-lg border border-border bg-muted/30 px-2">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            id="staff-global-search-input"
            name="staff_global_search"
            ref={inputRef}
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder={t('输入关键词…', 'Type to search…')}
            aria-label={t('搜索会员、订单、商家', 'Search members, orders, merchants')}
            autoComplete="off"
            className="border-0 bg-transparent focus-visible:ring-0 h-11 text-sm shadow-none"
          />
          {query ? (
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => { setQuery(''); setResults([]); }} aria-label="Clear">
              <X className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
        <ScrollArea className="max-h-[min(50vh,360px)] mt-3">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
            </div>
          ) : results.length > 0 ? (
            <div className="space-y-0.5 pr-2">
              {results.map((r) => {
                const config = typeConfig[r.type];
                const Icon = config.icon;
                return (
                  <button
                    key={`${r.type}-${r.id}`}
                    type="button"
                    className="w-full flex items-center gap-3 px-2 py-2.5 rounded-md hover:bg-accent transition-colors text-left"
                    onClick={() => handleSelect(r)}
                  >
                    <div className={cn('h-8 w-8 rounded-md flex items-center justify-center shrink-0', config.color)}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{r.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{r.subtitle}</p>
                    </div>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {language === 'zh' ? config.label.zh : config.label.en}
                    </Badge>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  </button>
                );
              })}
            </div>
          ) : query.length >= 2 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {t('未找到结果', 'No results found')}
            </div>
          ) : query.length > 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {t('请输入至少2个字符', 'Type at least 2 characters')}
            </div>
          ) : null}
        </ScrollArea>
      </DrawerDetail>
    </>
  );
}
