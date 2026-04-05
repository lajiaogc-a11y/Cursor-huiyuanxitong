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
import { VendorCrudForm } from "@/components/merchants/VendorCrudForm";
import TableImportButton from "@/components/TableImportButton";
import { ExportConfirmDialog } from "@/components/ExportConfirmDialog";
import { useExportConfirm } from "@/hooks/useExportConfirm";
import { exportTable } from "@/services/export";
import { notify } from "@/lib/notifyHub";
import { useLanguage } from "@/contexts/LanguageContext";
import { useVendors, usePaymentProviders, Vendor } from "@/hooks/useMerchantConfig";
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
import { useIsMobile, useIsTablet } from "@/hooks/use-mobile";
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

export function VendorTab() {
  const { t } = useLanguage();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const useCompactLayout = isMobile || isTablet;
  const { vendors, loading, addVendor, updateVendor, deleteVendor, updateVendorSortOrders, refetch } = useVendors();
  const { providers: paymentProviders } = usePaymentProviders();
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [saving, setSaving] = useState(false);
  const vendorExportConfirm = useExportConfirm();

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const [formName, setFormName] = useState("");
  const [formStatus, setFormStatus] = useState<string>("active");
  const [formRemark, setFormRemark] = useState("");
  const [formPaymentProviders, setFormPaymentProviders] = useState<string[]>([]);

  const filteredVendors = searchQuery
    ? vendors.filter((vendor) => String(vendor.name ?? '').toLowerCase().includes(searchQuery.toLowerCase()))
    : vendors;

  const totalPages = Math.ceil(filteredVendors.length / pageSize);
  const paginatedVendors = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredVendors.slice(start, start + pageSize);
  }, [filteredVendors, currentPage, pageSize]);

  useEffect(() => { setCurrentPage(1); }, [searchQuery]);

  const resetForm = () => {
    setFormName("");
    setFormStatus("active");
    setFormRemark("");
    setFormPaymentProviders([]);
  };

  const openEditDialog = (vendor: Vendor) => {
    setEditingVendor(vendor);
    setFormName(vendor.name);
    setFormStatus(vendor.status);
    setFormRemark(vendor.remark);
    setFormPaymentProviders(vendor.paymentProviders || []);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = vendors.findIndex((v) => v.id === active.id);
      const newIndex = vendors.findIndex((v) => v.id === over.id);
      const newOrder = arrayMove(vendors, oldIndex, newIndex);
      const updates = newOrder.map((vendor, index) => ({ id: vendor.id, sortOrder: index + 1 }));
      const success = await updateVendorSortOrders(updates);
      if (success) {
        notify.success(t('merchants.sortUpdated'));
      }
    }
  };

  const handleSave = async () => {
    if (!formName) {
      notify.error(t('merchants.fillVendorName'));
      return;
    }

    setSaving(true);
    try {
      if (editingVendor) {
        const success = await updateVendor(editingVendor.id, {
          name: formName,
          status: formStatus,
          remark: formRemark,
          paymentProviders: formPaymentProviders,
        });
        if (success) {
          notify.success(t('merchants.vendorUpdated'));
          setEditingVendor(null);
        } else {
          notify.error(t('merchants.updateFailed'));
        }
      } else {
        const result = await addVendor({
          name: formName,
          status: formStatus,
          remark: formRemark,
        });
        if (result) {
          notify.success(t('merchants.vendorAdded'));
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

  const togglePaymentProviderSelection = (providerName: string) => {
    if (formPaymentProviders.includes(providerName)) {
      setFormPaymentProviders(formPaymentProviders.filter(p => p !== providerName));
    } else {
      setFormPaymentProviders([...formPaymentProviders, providerName]);
    }
  };

  const vendorForm = (
    <VendorCrudForm
      formName={formName}
      setFormName={setFormName}
      formStatus={formStatus}
      setFormStatus={setFormStatus}
      formRemark={formRemark}
      setFormRemark={setFormRemark}
      formPaymentProviders={formPaymentProviders}
      paymentProviders={paymentProviders}
      onTogglePaymentProvider={togglePaymentProviderSelection}
    />
  );

  const handleDelete = async (id: string) => {
    const success = await deleteVendor(id);
    if (success) {
      notify.success(t('merchants.vendorDeleted'));
    } else {
      notify.error(t('merchants.deleteFailed'));
    }
  };

  const toggleStatus = async (id: string) => {
    const vendor = vendors.find(v => v.id === id);
    if (vendor) {
      const newStatus = vendor.status === "active" ? "inactive" : "active";
      const success = await updateVendor(id, { status: newStatus });
      if (success) {
        notify.success(t('merchants.statusUpdated'));
      }
    }
  };

  if (loading) {
    return <TablePageSkeleton columns={6} rows={5} />;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className={cn("relative", isMobile ? "flex-1" : "flex-1 max-w-xs")}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={t('merchants.searchVendors')} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 h-9" />
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" className="h-9 w-9" title={t('导出', 'Export')} onClick={() => vendorExportConfirm.requestExport(() => exportTable('vendors', 'xlsx'))}>
            <Download className="h-4 w-4" />
          </Button>
          <TableImportButton tableName="vendors" onImportComplete={() => refetch()} />
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => refetch()} aria-label="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <MerchantCrudAddDrawer
            open={isAddDialogOpen}
            onOpenChange={(open) => {
              setIsAddDialogOpen(open);
              if (!open) resetForm();
            }}
            onRequestOpen={() => setIsAddDialogOpen(true)}
            title={t('merchants.addVendor')}
            onCancel={() => setIsAddDialogOpen(false)}
            onSave={handleSave}
            saving={saving}
            addButtonContent={<><Plus className="h-4 w-4 mr-1" />{t('merchants.add')}</>}
          >
            {vendorForm}
          </MerchantCrudAddDrawer>
        </div>
      </div>

      {useCompactLayout ? (
        <>
          <MobileCardList>
            {paginatedVendors.length === 0 ? (
              <MobileEmptyState message={t('merchants.noData')} />
            ) : paginatedVendors.map((vendor) => (
              <MobileCard key={vendor.id} accent="info">
                <MobileCardHeader>
                  <span className="font-medium text-sm">{vendor.name}</span>
                  <Badge variant={vendor.status === "active" ? "default" : "secondary"} className="cursor-pointer" onClick={() => toggleStatus(vendor.id)}>
                    {vendor.status === "active" ? t('merchants.active') : t('merchants.inactive')}
                  </Badge>
                </MobileCardHeader>
                {(vendor.paymentProviders && vendor.paymentProviders.length > 0) && (
                  <div className="flex flex-wrap gap-1">
                    {vendor.paymentProviders.slice(0, 3).map((p) => (
                      <Badge key={p} variant="secondary" className="text-xs">{p}</Badge>
                    ))}
                    {vendor.paymentProviders.length > 3 && (
                      <Badge variant="secondary" className="text-xs">+{vendor.paymentProviders.length - 3}</Badge>
                    )}
                  </div>
                )}
                {vendor.remark && (
                  <MobileCardRow label={t('merchants.remark')} value={vendor.remark} />
                )}
                <MobileCardActions>
                  <MerchantCrudRowActions
                    itemId={vendor.id}
                    editingId={editingVendor?.id ?? null}
                    onOpenEdit={() => openEditDialog(vendor)}
                    onDrawerOpenChange={(open) => { if (!open) { setEditingVendor(null); resetForm(); } }}
                    onCancelEdit={() => setEditingVendor(null)}
                    editTitle={t('merchants.editVendor')}
                    onSave={handleSave}
                    saving={saving}
                    formContent={vendorForm}
                    deleteDescription={t('merchants.deleteVendorWarning').replace('{name}', vendor.name)}
                    onDeleteConfirm={() => handleDelete(vendor.id)}
                    density="comfortable"
                  />
                </MobileCardActions>
              </MobileCard>
            ))}
          </MobileCardList>
          <MobilePagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={filteredVendors.length}
            onPageChange={setCurrentPage}
            pageSize={pageSize}
            onPageSizeChange={(s) => { setPageSize(s); setCurrentPage(1); }}
          />
        </>
      ) : (
        <>
          <div>
            <StickyScrollTableContainer minWidth="900px">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <Table className="text-xs">
                <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead className="text-center whitespace-nowrap px-1.5">{t('merchants.vendorName')}</TableHead>
                    <TableHead className="text-center whitespace-nowrap px-1.5">{t('merchants.paymentProvidersFor')}</TableHead>
                    <TableHead className="text-center whitespace-nowrap px-1.5">{t('merchants.status')}</TableHead>
                    <TableHead className="text-center whitespace-nowrap px-1.5">{t('merchants.remark')}</TableHead>
                    <TableHead className="text-center whitespace-nowrap px-1.5">{t('merchants.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <SortableContext items={paginatedVendors.map((v) => v.id)} strategy={verticalListSortingStrategy}>
                    {paginatedVendors.map((vendor) => (
                      <SortableMerchantTableRow key={vendor.id} id={vendor.id} disabled={!!searchQuery}>
                        <TableCell className="font-medium text-center px-1.5">{vendor.name}</TableCell>
                        <TableCell className="text-center px-1.5">
                          <div className="flex flex-wrap gap-1 justify-center">
                            {(vendor.paymentProviders || []).slice(0, 2).map((p) => (
                              <Badge key={p} variant="secondary" className="text-xs">{p}</Badge>
                            ))}
                            {(vendor.paymentProviders || []).length > 2 && (
                              <Badge variant="secondary" className="text-xs">+{(vendor.paymentProviders || []).length - 2}</Badge>
                            )}
                            {(!vendor.paymentProviders || vendor.paymentProviders.length === 0) && (
                              <span className="text-muted-foreground text-xs">{t('merchants.allProviders')}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center px-1.5">
                          <Badge variant={vendor.status === "active" ? "default" : "secondary"} className="cursor-pointer" onClick={() => toggleStatus(vendor.id)}>
                            {vendor.status === "active" ? t('merchants.active') : t('merchants.inactive')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-center px-1.5">{vendor.remark}</TableCell>
                        <TableCell className="text-center px-1.5">
                          <div className="flex items-center justify-center gap-2">
                            <MerchantCrudRowActions
                              itemId={vendor.id}
                              editingId={editingVendor?.id ?? null}
                              onOpenEdit={() => openEditDialog(vendor)}
                              onDrawerOpenChange={(open) => { if (!open) { setEditingVendor(null); resetForm(); } }}
                              onCancelEdit={() => setEditingVendor(null)}
                              editTitle={t('merchants.editVendor')}
                              onSave={handleSave}
                              saving={saving}
                              formContent={vendorForm}
                              deleteDescription={t('merchants.deleteVendorWarning').replace('{name}', vendor.name)}
                              onDeleteConfirm={() => handleDelete(vendor.id)}
                              density="compact"
                            />
                          </div>
                        </TableCell>
                      </SortableMerchantTableRow>
                    ))}
                  </SortableContext>
                  {paginatedVendors.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
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
                <span className="text-sm text-muted-foreground">{t('共', 'Total')} {filteredVendors.length} {t('条', 'items')}</span>
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
      <ExportConfirmDialog open={vendorExportConfirm.open} onOpenChange={vendorExportConfirm.handleOpenChange} onConfirm={vendorExportConfirm.handleConfirm} />
    </div>
  );
}
