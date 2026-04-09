import { useState, useMemo, useEffect } from "react";
import { TablePageSkeleton } from "@/components/skeletons/TablePageSkeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StickyScrollTableContainer } from "@/components/ui/sticky-scroll-table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, RefreshCw, Download, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { MerchantCrudAddDrawer } from "@/components/merchants/MerchantCrudAddDrawer";
import { MerchantCrudRowActions } from "@/components/merchants/MerchantCrudRowActions";
import { PaymentProviderCrudForm } from "@/components/merchants/PaymentProviderCrudForm";
import TableImportButton from "@/components/TableImportButton";
import { ExportConfirmDialog } from "@/components/ExportConfirmDialog";
import { useExportConfirm } from "@/hooks/ui/useExportConfirm";
import { exportTable } from "@/services/export";
import { notify } from "@/lib/notifyHub";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePaymentProviders, PaymentProvider } from "@/hooks/finance/useMerchantConfig";
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
import { cn } from "@/lib/utils";
import { useIsMobile, useIsTablet } from "@/hooks/ui/use-mobile";
import {
  MobileCardList,
  MobileCard,
  MobileCardHeader,
  MobileCardRow,
  MobileCardActions,
  MobilePagination,
  MobileEmptyState,
} from "@/components/ui/mobile-data-card";
import { SortableMerchantTableRow } from "@/pages/merchants/SortableMerchantTableRow";

export function PaymentProviderTab() {
  const { t, language } = useLanguage();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const useCompactLayout = isMobile || isTablet;
  const { providers, loading, addProvider, updateProvider, deleteProvider, updateProviderSortOrders, refetch } = usePaymentProviders();
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<PaymentProvider | null>(null);
  const [saving, setSaving] = useState(false);
  const providerExportConfirm = useExportConfirm();

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const [formName, setFormName] = useState("");
  const [formStatus, setFormStatus] = useState<string>("active");
  const [formRemark, setFormRemark] = useState("");

  const filteredProviders = searchQuery
    ? providers.filter((provider) => String(provider.name ?? '').toLowerCase().includes(searchQuery.toLowerCase()))
    : providers;

  const totalPages = Math.ceil(filteredProviders.length / pageSize);
  const paginatedProviders = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredProviders.slice(start, start + pageSize);
  }, [filteredProviders, currentPage, pageSize]);

  useEffect(() => { setCurrentPage(1); }, [searchQuery]);

  const resetForm = () => {
    setFormName("");
    setFormStatus("active");
    setFormRemark("");
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = providers.findIndex((p) => p.id === active.id);
      const newIndex = providers.findIndex((p) => p.id === over.id);
      const newOrder = arrayMove(providers, oldIndex, newIndex);
      const updates = newOrder.map((provider, index) => ({ id: provider.id, sortOrder: index + 1 }));
      const success = await updateProviderSortOrders(updates);
      if (success) {
        notify.success(t('merchants.sortUpdated'));
      }
    }
  };

  const openEditDialog = (provider: PaymentProvider) => {
    setEditingProvider(provider);
    setFormName(provider.name);
    setFormStatus(provider.status);
    setFormRemark(provider.remark);
  };

  const handleSave = async () => {
    if (!formName) {
      notify.error(t('merchants.fillProviderName'));
      return;
    }

    setSaving(true);
    try {
      if (editingProvider) {
        const success = await updateProvider(editingProvider.id, {
          name: formName,
          status: formStatus,
          remark: formRemark,
        });
        if (success) {
          notify.success(t('merchants.providerUpdated'));
          setEditingProvider(null);
        } else {
          notify.error(t('merchants.updateFailed'));
        }
      } else {
        const result = await addProvider({
          name: formName,
          status: formStatus,
          remark: formRemark,
        });
        if (result) {
          notify.success(t('merchants.providerAdded'));
          setIsAddDialogOpen(false);
        } else {
          notify.error(t('merchants.addFailed'));
        }
      }
      resetForm();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const success = await deleteProvider(id);
    if (success) {
      notify.success(t('merchants.providerDeleted'));
    } else {
      notify.error(t('merchants.deleteFailed'));
    }
  };

  const toggleStatus = async (id: string) => {
    const provider = providers.find(p => p.id === id);
    if (provider) {
      const newStatus = provider.status === "active" ? "inactive" : "active";
      const success = await updateProvider(id, { status: newStatus });
      if (success) {
        notify.success(t('merchants.statusUpdated'));
      }
    }
  };

  const providerForm = (
    <PaymentProviderCrudForm
      formName={formName}
      setFormName={setFormName}
      formStatus={formStatus}
      setFormStatus={setFormStatus}
      formRemark={formRemark}
      setFormRemark={setFormRemark}
    />
  );

  if (loading) {
    return <TablePageSkeleton columns={6} rows={5} />;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className={cn("relative", isMobile ? "flex-1" : "flex-1 max-w-xs")}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={t('merchants.searchProviders')} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 h-9" />
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            title={t('导出', 'Export')}
            onClick={() =>
              providerExportConfirm.requestExport(() => void exportTable("payment_providers", language === "en", "xlsx"))
            }
          >
            <Download className="h-4 w-4" />
          </Button>
          <TableImportButton tableName="payment_providers" onImportComplete={() => refetch()} />
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => refetch()} aria-label="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <MerchantCrudAddDrawer
            open={isAddDialogOpen}
            onOpenChange={(open) => { setIsAddDialogOpen(open); if (!open) resetForm(); }}
            onRequestOpen={() => setIsAddDialogOpen(true)}
            title={t('merchants.addProvider')}
            onCancel={() => setIsAddDialogOpen(false)}
            onSave={handleSave}
            saving={saving}
            addButtonContent={<><Plus className="h-4 w-4 mr-1" />{t('merchants.add')}</>}
          >
            {providerForm}
          </MerchantCrudAddDrawer>
        </div>
      </div>

      {useCompactLayout ? (
        <>
          <MobileCardList>
            {paginatedProviders.length === 0 ? (
              <MobileEmptyState message={t('merchants.noData')} />
            ) : paginatedProviders.map((provider) => (
              <MobileCard key={provider.id} accent="info">
                <MobileCardHeader>
                  <span className="font-medium text-sm">{provider.name}</span>
                  <Badge variant={provider.status === "active" ? "default" : "secondary"} className="cursor-pointer" onClick={() => toggleStatus(provider.id)}>
                    {provider.status === "active" ? t('merchants.active') : t('merchants.inactive')}
                  </Badge>
                </MobileCardHeader>
                {provider.remark && (
                  <MobileCardRow label={t('merchants.remark')} value={provider.remark} />
                )}
                <MobileCardActions>
                  <MerchantCrudRowActions
                    itemId={provider.id}
                    editingId={editingProvider?.id ?? null}
                    onOpenEdit={() => openEditDialog(provider)}
                    onDrawerOpenChange={(open) => { if (!open) { setEditingProvider(null); resetForm(); } }}
                    onCancelEdit={() => setEditingProvider(null)}
                    editTitle={t('merchants.editProvider')}
                    onSave={handleSave}
                    saving={saving}
                    formContent={providerForm}
                    deleteDescription={t('merchants.deleteProviderWarning').replace('{name}', provider.name)}
                    onDeleteConfirm={() => handleDelete(provider.id)}
                    density="comfortable"
                  />
                </MobileCardActions>
              </MobileCard>
            ))}
          </MobileCardList>
          <MobilePagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={filteredProviders.length}
            onPageChange={setCurrentPage}
            pageSize={pageSize}
            onPageSizeChange={(s) => { setPageSize(s); setCurrentPage(1); }}
          />
        </>
      ) : (
        <>
          <div>
            <StickyScrollTableContainer minWidth="700px">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <Table className="text-xs">
                <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead className="text-center whitespace-nowrap px-1.5">{t('merchants.providerName')}</TableHead>
                    <TableHead className="text-center whitespace-nowrap px-1.5">{t('merchants.status')}</TableHead>
                    <TableHead className="text-center whitespace-nowrap px-1.5">{t('merchants.remark')}</TableHead>
                    <TableHead className="text-center whitespace-nowrap px-1.5">{t('merchants.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <SortableContext items={paginatedProviders.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                    {paginatedProviders.map((provider) => (
                      <SortableMerchantTableRow key={provider.id} id={provider.id} disabled={!!searchQuery}>
                        <TableCell className="font-medium text-center px-1.5">{provider.name}</TableCell>
                        <TableCell className="text-center px-1.5">
                          <Badge variant={provider.status === "active" ? "default" : "secondary"} className="cursor-pointer" onClick={() => toggleStatus(provider.id)}>
                            {provider.status === "active" ? t('merchants.active') : t('merchants.inactive')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-center px-1.5">{provider.remark}</TableCell>
                        <TableCell className="text-center px-1.5">
                          <div className="flex items-center justify-center gap-2">
                            <MerchantCrudRowActions
                              itemId={provider.id}
                              editingId={editingProvider?.id ?? null}
                              onOpenEdit={() => openEditDialog(provider)}
                              onDrawerOpenChange={(open) => { if (!open) { setEditingProvider(null); resetForm(); } }}
                              onCancelEdit={() => setEditingProvider(null)}
                              editTitle={t('merchants.editProvider')}
                              onSave={handleSave}
                              saving={saving}
                              formContent={providerForm}
                              deleteDescription={t('merchants.deleteProviderWarning').replace('{name}', provider.name)}
                              onDeleteConfirm={() => handleDelete(provider.id)}
                              density="compact"
                            />
                          </div>
                        </TableCell>
                      </SortableMerchantTableRow>
                    ))}
                  </SortableContext>
                  {paginatedProviders.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        {t('merchants.noData')}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </DndContext>
            </StickyScrollTableContainer>
          </div>
          {totalPages > 0 && (
            <div className="flex items-center justify-between py-2 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{t('每页', 'Per page')}</span>
                <Select value={pageSize.toString()} onValueChange={(v) => { setPageSize(parseInt(v)); setCurrentPage(1); }}>
                  <SelectTrigger className="w-[70px] h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[10, 20, 50, 100].map((size) => (
                      <SelectItem key={size} value={size.toString()}>{size}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-sm text-muted-foreground">{t('共', 'Total')} {filteredProviders.length} {t('条', 'items')}</span>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(1)} disabled={currentPage <= 1} aria-label="First page">
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(currentPage - 1)} disabled={currentPage <= 1} aria-label="Previous">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="tabular-nums px-3 text-sm">{currentPage} / {totalPages}</span>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(currentPage + 1)} disabled={currentPage >= totalPages} aria-label="Next">
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(totalPages)} disabled={currentPage >= totalPages} aria-label="Last page">
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
      {searchQuery && (
        <p className="text-xs text-muted-foreground shrink-0">{t('merchants.dragDisabled')}</p>
      )}
      <ExportConfirmDialog open={providerExportConfirm.open} onOpenChange={providerExportConfirm.handleOpenChange} onConfirm={providerExportConfirm.handleConfirm} />
    </div>
  );
}
