import { useState, useMemo, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { TablePageSkeleton } from "@/components/skeletons/TablePageSkeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StickyScrollTableContainer } from "@/components/ui/sticky-scroll-table";
import { DrawerDetail } from "@/components/shell/DrawerDetail";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Search, Pencil, Trash2, RefreshCw, CreditCard, Store, Wallet, Loader2, GripVertical, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Download, Upload } from "lucide-react";
import TableImportButton from "@/components/TableImportButton";
import { ExportConfirmDialog } from "@/components/ExportConfirmDialog";
import { useExportConfirm } from "@/hooks/useExportConfirm";
import { exportTable } from "@/services/export";
import { notify } from "@/lib/notifyHub";
import { useLanguage } from "@/contexts/LanguageContext";
import { useCards, useVendors, usePaymentProviders, CardItem, Vendor, PaymentProvider } from "@/hooks/useMerchantConfig";
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
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { useIsMobile, useIsTablet } from "@/hooks/use-mobile";
import {
  MobileCardList,
  MobileCard,
  MobileCardHeader,
  MobileCardRow,
  MobileCardCollapsible,
  MobileCardActions,
  MobilePagination,
  MobileEmptyState,
} from "@/components/ui/mobile-data-card";

// Sortable Row Component
function SortableRow({ id, children, disabled }: { id: string; children: React.ReactNode; disabled?: boolean }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className={cn(isDragging && "opacity-50 bg-muted")}
      {...attributes}
    >
      <TableCell className="w-10 text-center">
        <button
          type="button"
          className={cn(
            "cursor-grab touch-none p-1 text-muted-foreground hover:text-foreground transition-colors inline-flex",
            isDragging && "cursor-grabbing",
            disabled && "cursor-not-allowed opacity-50"
          )}
          {...listeners}
          disabled={disabled}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </TableCell>
      {children}
    </TableRow>
  );
}

// Card Management Tab Component
function CardTab() {
  const { t } = useLanguage();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const useCompactLayout = isMobile || isTablet;
  const { cards, loading, addCard, updateCard, deleteCard, updateCardSortOrders, refetch } = useCards();
  const { vendors } = useVendors();
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<CardItem | null>(null);
  const [saving, setSaving] = useState(false);
  const exportConfirm = useExportConfirm();

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // 拖拽传感器
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Form state
  const [formName, setFormName] = useState("");
  const [formCardType, setFormCardType] = useState("");
  const [formStatus, setFormStatus] = useState<string>("active");
  const [formRemark, setFormRemark] = useState("");
  const [formCardVendors, setFormCardVendors] = useState<string[]>([]);

  // 拖拽处理
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = cards.findIndex((c) => c.id === active.id);
      const newIndex = cards.findIndex((c) => c.id === over.id);
      const newOrder = arrayMove(cards, oldIndex, newIndex);
      const updates = newOrder.map((card, index) => ({ id: card.id, sortOrder: index + 1 }));
      const success = await updateCardSortOrders(updates);
      if (success) {
        notify.success(t('merchants.sortUpdated'));
      }
    }
  };

  const filteredCards = searchQuery 
    ? cards.filter((card) => String(card.name ?? '').toLowerCase().includes(searchQuery.toLowerCase()))
    : cards;

  // Pagination
  const totalPages = Math.ceil(filteredCards.length / pageSize);
  const paginatedCards = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredCards.slice(start, start + pageSize);
  }, [filteredCards, currentPage, pageSize]);

  // Reset to first page when search changes
  useEffect(() => { setCurrentPage(1); }, [searchQuery]);

  const resetForm = () => {
    setFormName("");
    setFormCardType("");
    setFormStatus("active");
    setFormRemark("");
    setFormCardVendors([]);
  };

  const openEditDialog = (card: CardItem) => {
    setEditingCard(card);
    setFormName(card.name);
    setFormCardType(card.type ?? "");
    setFormStatus(card.status);
    setFormRemark(card.remark);
    setFormCardVendors(card.cardVendors || []);
  };

  const handleSave = async () => {
    if (!formName) {
      notify.error(t('merchants.fillCardName'));
      return;
    }

    setSaving(true);
    try {
      if (editingCard) {
        const success = await updateCard(editingCard.id, {
          name: formName,
          type: formCardType.trim(),
          status: formStatus,
          remark: formRemark,
          cardVendors: formCardVendors,
        });
        if (success) {
          notify.success(t('merchants.cardUpdated'));
          setEditingCard(null);
        } else {
          notify.error(t('merchants.updateFailed'));
        }
      } else {
        const result = await addCard({
          name: formName,
          type: formCardType.trim(),
          status: formStatus,
          remark: formRemark,
          cardVendors: formCardVendors,
        });
        if (result) {
          notify.success(t('merchants.cardAdded'));
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
    const success = await deleteCard(id);
    if (success) {
      notify.success(t('merchants.cardDeleted'));
    } else {
      notify.error(t('merchants.deleteFailed'));
    }
  };

  const toggleStatus = async (id: string) => {
    const card = cards.find(c => c.id === id);
    if (card) {
      const newStatus = card.status === "active" ? "inactive" : "active";
      const success = await updateCard(id, { status: newStatus });
      if (success) {
        notify.success(t('merchants.statusUpdated'));
      }
    }
  };

  const toggleVendorSelection = (vendorName: string) => {
    if (formCardVendors.includes(vendorName)) {
      setFormCardVendors(formCardVendors.filter(v => v !== vendorName));
    } else {
      setFormCardVendors([...formCardVendors, vendorName]);
    }
  };

  const cardFormContent = (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <Label>{t('merchants.cardName')} *</Label>
        <Input
          placeholder={t('merchants.namePlaceholder')}
          value={formName}
          onChange={(e) => setFormName(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>{t('merchants.cardType')}</Label>
        <div className="text-xs text-muted-foreground mb-1">{t('merchants.cardTypeHint')}</div>
        <Input
          placeholder={t('merchants.cardType')}
          value={formCardType}
          onChange={(e) => setFormCardType(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>{t('merchants.cardVendors')}</Label>
        <div className="text-xs text-muted-foreground mb-1">{t('merchants.selectVendors')}</div>
        <div className="flex flex-wrap gap-1 p-2 border rounded-lg max-h-32 overflow-auto">
          {vendors.filter(v => v.status === "active").map((vendor) => (
            <Badge 
              key={vendor.id} 
              variant={formCardVendors.includes(vendor.name) ? "default" : "outline"} 
              className="cursor-pointer"
              onClick={() => toggleVendorSelection(vendor.name)}
            >
              {vendor.name}
            </Badge>
          ))}
        </div>
        {formCardVendors.length > 0 && (
          <div className="text-xs text-muted-foreground">
            {t('merchants.selected')}: {formCardVendors.join(", ")}
          </div>
        )}
      </div>
      <div className="space-y-2">
        <Label>{t('merchants.status')}</Label>
        <Select value={formStatus} onValueChange={(v) => setFormStatus(v as "active" | "inactive")}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">{t('merchants.active')}</SelectItem>
            <SelectItem value="inactive">{t('merchants.inactive')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>{t('merchants.remark')}</Label>
        <Textarea placeholder={t('merchants.remarkPlaceholder')} value={formRemark} onChange={(e) => setFormRemark(e.target.value)} rows={3} />
      </div>
    </div>
  );

  if (loading) {
    return <TablePageSkeleton columns={6} rows={5} />;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className={cn("relative", isMobile ? "flex-1" : "flex-1 max-w-xs")}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={t('merchants.searchCards')} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 h-9" />
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" className="h-9 w-9" title={t('导出', 'Export')} onClick={() => exportConfirm.requestExport(() => exportTable('cards', 'xlsx'))}>
            <Download className="h-4 w-4" />
          </Button>
          <TableImportButton tableName="cards" onImportComplete={() => refetch()} />
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => refetch()} aria-label="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <>
            <Button size="sm" className="h-9" onClick={() => setIsAddDialogOpen(true)}><Plus className="h-4 w-4 mr-1" />{t('merchants.add')}</Button>
            <DrawerDetail open={isAddDialogOpen} onOpenChange={(open) => { setIsAddDialogOpen(open); if (!open) resetForm(); }} title={t('merchants.addCard')} sheetMaxWidth="xl">
              {cardFormContent}
              <div className="flex flex-wrap justify-end gap-2 pt-4 mt-4 border-t border-border">
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>{t('common.cancel')}</Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {t('common.save')}
                </Button>
              </div>
            </DrawerDetail>
          </>
        </div>
      </div>

      {useCompactLayout ? (
        <>
          <MobileCardList>
            {paginatedCards.length === 0 ? (
              <MobileEmptyState message={t('merchants.noData')} />
            ) : paginatedCards.map((card) => (
              <MobileCard key={card.id} accent="info">
                <MobileCardHeader>
                  <span className="font-medium text-sm">{card.name}</span>
                  <Badge variant={card.status === "active" ? "default" : "secondary"} className="cursor-pointer" onClick={() => toggleStatus(card.id)}>
                    {card.status === "active" ? t('merchants.active') : t('merchants.inactive')}
                  </Badge>
                </MobileCardHeader>
                {(card.cardVendors && card.cardVendors.length > 0) && (
                  <div className="flex flex-wrap gap-1">
                    {card.cardVendors.slice(0, 3).map((v) => (
                      <Badge key={v} variant="secondary" className="text-xs">{v}</Badge>
                    ))}
                    {card.cardVendors.length > 3 && (
                      <Badge variant="secondary" className="text-xs">+{card.cardVendors.length - 3}</Badge>
                    )}
                  </div>
                )}
                {card.remark && (
                  <MobileCardRow label={t('merchants.remark')} value={card.remark} />
                )}
                <MobileCardActions>
                  <>
                    <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={() => openEditDialog(card)}>
                      <Pencil className="h-3.5 w-3.5" />
                      {t('common.edit')}
                    </Button>
                    <DrawerDetail open={editingCard?.id === card.id} onOpenChange={(open) => { if (!open) { setEditingCard(null); resetForm(); } }} title={t('merchants.editCard')} sheetMaxWidth="xl">
                      {cardFormContent}
                      <div className="flex flex-wrap justify-end gap-2 pt-4 mt-4 border-t border-border">
                        <Button variant="outline" onClick={() => setEditingCard(null)}>{t('common.cancel')}</Button>
                        <Button onClick={handleSave} disabled={saving}>
                          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                          {t('common.save')}
                        </Button>
                      </div>
                    </DrawerDetail>
                  </>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 gap-1 text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                        {t('common.delete')}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t('merchants.confirmDelete')}</AlertDialogTitle>
                        <AlertDialogDescription>{t('merchants.deleteCardWarning').replace('{name}', card.name)}</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(card.id)}>{t('common.delete')}</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </MobileCardActions>
              </MobileCard>
            ))}
          </MobileCardList>
          <MobilePagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={filteredCards.length}
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
                    <TableHead className="text-center whitespace-nowrap px-1.5">{t('merchants.cardName')}</TableHead>
                    <TableHead className="text-center whitespace-nowrap px-1.5">{t('merchants.cardVendors')}</TableHead>
                    <TableHead className="text-center whitespace-nowrap px-1.5">{t('merchants.status')}</TableHead>
                    <TableHead className="text-center whitespace-nowrap px-1.5">{t('merchants.remark')}</TableHead>
                    <TableHead className="text-center whitespace-nowrap px-1.5">{t('merchants.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <SortableContext items={paginatedCards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                    {paginatedCards.map((card) => (
                      <SortableRow key={card.id} id={card.id} disabled={!!searchQuery}>
                        <TableCell className="font-medium text-center px-1.5">{card.name}</TableCell>
                        <TableCell className="text-center px-1.5">
                          <div className="flex flex-wrap gap-1 justify-center">
                            {(card.cardVendors || []).slice(0, 2).map((v) => (
                              <Badge key={v} variant="secondary" className="text-xs">{v}</Badge>
                            ))}
                            {(card.cardVendors || []).length > 2 && (
                              <Badge variant="secondary" className="text-xs">+{(card.cardVendors || []).length - 2}</Badge>
                            )}
                            {(!card.cardVendors || card.cardVendors.length === 0) && (
                              <span className="text-muted-foreground text-xs">{t('merchants.allVendors')}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center px-1.5">
                          <Badge variant={card.status === "active" ? "default" : "secondary"} className="cursor-pointer" onClick={() => toggleStatus(card.id)}>
                            {card.status === "active" ? t('merchants.active') : t('merchants.inactive')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-center px-1.5">{card.remark}</TableCell>
                        <TableCell className="text-center px-1.5">
                          <div className="flex items-center justify-center gap-2">
                            <>
                              <Button variant="ghost" size="icon" onClick={() => openEditDialog(card)} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                              <DrawerDetail open={editingCard?.id === card.id} onOpenChange={(open) => { if (!open) { setEditingCard(null); resetForm(); } }} title={t('merchants.editCard')} sheetMaxWidth="xl">
                                {cardFormContent}
                                <div className="flex flex-wrap justify-end gap-2 pt-4 mt-4 border-t border-border">
                                  <Button variant="outline" onClick={() => setEditingCard(null)}>{t('common.cancel')}</Button>
                                  <Button onClick={handleSave} disabled={saving}>
                                    {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                    {t('common.save')}
                                  </Button>
                                </div>
                              </DrawerDetail>
                            </>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="text-destructive" aria-label="Delete"><Trash2 className="h-4 w-4" /></Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>{t('merchants.confirmDelete')}</AlertDialogTitle>
                                  <AlertDialogDescription>{t('merchants.deleteCardWarning').replace('{name}', card.name)}</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDelete(card.id)}>{t('common.delete')}</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </SortableRow>
                    ))}
                  </SortableContext>
                  {paginatedCards.length === 0 && (
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
          {/* Pagination */}
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
                <span className="text-sm text-muted-foreground">{t('共', 'Total')} {filteredCards.length} {t('条', 'items')}</span>
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
      <ExportConfirmDialog open={exportConfirm.open} onOpenChange={exportConfirm.handleOpenChange} onConfirm={exportConfirm.handleConfirm} />
    </div>
  );
}

// Vendor Management Tab Component
function VendorTab() {
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

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // 拖拽传感器
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Form state
  const [formName, setFormName] = useState("");
  const [formStatus, setFormStatus] = useState<string>("active");
  const [formRemark, setFormRemark] = useState("");
  const [formPaymentProviders, setFormPaymentProviders] = useState<string[]>([]);

  const filteredVendors = searchQuery 
    ? vendors.filter((vendor) => String(vendor.name ?? '').toLowerCase().includes(searchQuery.toLowerCase()))
    : vendors;

  // Pagination
  const totalPages = Math.ceil(filteredVendors.length / pageSize);
  const paginatedVendors = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredVendors.slice(start, start + pageSize);
  }, [filteredVendors, currentPage, pageSize]);

  // Reset to first page when search changes
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

  // 拖拽处理
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

  const vendorFormContent = (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <Label>{t('merchants.vendorName')} *</Label>
        <Input placeholder={t('merchants.namePlaceholder')} value={formName} onChange={(e) => setFormName(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>{t('merchants.paymentProvidersFor')}</Label>
        <div className="text-xs text-muted-foreground mb-1">{t('merchants.selectProviders')}</div>
        <div className="flex flex-wrap gap-1 p-2 border rounded-lg max-h-32 overflow-auto">
          {paymentProviders.filter(p => p.status === "active").map((provider) => (
            <Badge 
              key={provider.id} 
              variant={formPaymentProviders.includes(provider.name) ? "default" : "outline"} 
              className="cursor-pointer"
              onClick={() => togglePaymentProviderSelection(provider.name)}
            >
              {provider.name}
            </Badge>
          ))}
        </div>
        {formPaymentProviders.length > 0 && (
          <div className="text-xs text-muted-foreground">
            {t('merchants.selected')}: {formPaymentProviders.join(", ")}
          </div>
        )}
      </div>
      <div className="space-y-2">
        <Label>{t('merchants.status')}</Label>
        <Select value={formStatus} onValueChange={(v) => setFormStatus(v as "active" | "inactive")}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">{t('merchants.active')}</SelectItem>
            <SelectItem value="inactive">{t('merchants.inactive')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>{t('merchants.remark')}</Label>
        <Textarea placeholder={t('merchants.remarkPlaceholder')} value={formRemark} onChange={(e) => setFormRemark(e.target.value)} rows={3} />
      </div>
    </div>
  );

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
          <>
            <Button size="sm" className="h-9" onClick={() => setIsAddDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              {t('merchants.add')}
            </Button>
            <DrawerDetail
              open={isAddDialogOpen}
              onOpenChange={(open) => {
                setIsAddDialogOpen(open);
                if (!open) resetForm();
              }}
              title={t('merchants.addVendor')}
              sheetMaxWidth="xl"
            >
              {vendorFormContent}
              <div className="flex flex-wrap justify-end gap-2 pt-4 mt-4 border-t border-border">
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  {t('common.cancel')}
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {t('common.save')}
                </Button>
              </div>
            </DrawerDetail>
          </>
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
                  <>
                    <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={() => openEditDialog(vendor)}>
                      <Pencil className="h-3.5 w-3.5" />
                      {t('common.edit')}
                    </Button>
                    <DrawerDetail open={editingVendor?.id === vendor.id} onOpenChange={(open) => { if (!open) { setEditingVendor(null); resetForm(); } }} title={t('merchants.editVendor')} sheetMaxWidth="xl">
                      {vendorFormContent}
                      <div className="flex flex-wrap justify-end gap-2 pt-4 mt-4 border-t border-border">
                        <Button variant="outline" onClick={() => setEditingVendor(null)}>{t('common.cancel')}</Button>
                        <Button onClick={handleSave} disabled={saving}>
                          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                          {t('common.save')}
                        </Button>
                      </div>
                    </DrawerDetail>
                  </>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 gap-1 text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                        {t('common.delete')}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t('merchants.confirmDelete')}</AlertDialogTitle>
                        <AlertDialogDescription>{t('merchants.deleteVendorWarning').replace('{name}', vendor.name)}</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(vendor.id)}>{t('common.delete')}</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
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
                      <SortableRow key={vendor.id} id={vendor.id} disabled={!!searchQuery}>
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
                            <>
                              <Button variant="ghost" size="icon" onClick={() => openEditDialog(vendor)} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                              <DrawerDetail open={editingVendor?.id === vendor.id} onOpenChange={(open) => { if (!open) { setEditingVendor(null); resetForm(); } }} title={t('merchants.editVendor')} sheetMaxWidth="xl">
                                {vendorFormContent}
                                <div className="flex flex-wrap justify-end gap-2 pt-4 mt-4 border-t border-border">
                                  <Button variant="outline" onClick={() => setEditingVendor(null)}>{t('common.cancel')}</Button>
                                  <Button onClick={handleSave} disabled={saving}>
                                    {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                    {t('common.save')}
                                  </Button>
                                </div>
                              </DrawerDetail>
                            </>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="text-destructive" aria-label="Delete"><Trash2 className="h-4 w-4" /></Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>{t('merchants.confirmDelete')}</AlertDialogTitle>
                                  <AlertDialogDescription>{t('merchants.deleteVendorWarning').replace('{name}', vendor.name)}</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDelete(vendor.id)}>{t('common.delete')}</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </SortableRow>
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
          {/* Pagination */}
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

// Payment Provider Tab Component
function PaymentProviderTab() {
  const { t } = useLanguage();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const useCompactLayout = isMobile || isTablet;
  const { providers, loading, addProvider, updateProvider, deleteProvider, updateProviderSortOrders, refetch } = usePaymentProviders();
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<PaymentProvider | null>(null);
  const [saving, setSaving] = useState(false);
  const providerExportConfirm = useExportConfirm();

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // 拖拽传感器
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Form state
  const [formName, setFormName] = useState("");
  const [formStatus, setFormStatus] = useState<string>("active");
  const [formRemark, setFormRemark] = useState("");

  const filteredProviders = searchQuery 
    ? providers.filter((provider) => String(provider.name ?? '').toLowerCase().includes(searchQuery.toLowerCase()))
    : providers;

  // Pagination
  const totalPages = Math.ceil(filteredProviders.length / pageSize);
  const paginatedProviders = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredProviders.slice(start, start + pageSize);
  }, [filteredProviders, currentPage, pageSize]);

  // Reset to first page when search changes
  useEffect(() => { setCurrentPage(1); }, [searchQuery]);

  const resetForm = () => {
    setFormName("");
    setFormStatus("active");
    setFormRemark("");
  };

  // 拖拽处理
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

  const providerFormContent = (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <Label>{t('merchants.providerName')} *</Label>
        <Input placeholder={t('merchants.namePlaceholder')} value={formName} onChange={(e) => setFormName(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>{t('merchants.status')}</Label>
        <Select value={formStatus} onValueChange={(v) => setFormStatus(v as "active" | "inactive")}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">{t('merchants.active')}</SelectItem>
            <SelectItem value="inactive">{t('merchants.inactive')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>{t('merchants.remark')}</Label>
        <Textarea placeholder={t('merchants.remarkPlaceholder')} value={formRemark} onChange={(e) => setFormRemark(e.target.value)} rows={3} />
      </div>
    </div>
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
          <Button variant="ghost" size="icon" className="h-9 w-9" title={t('导出', 'Export')} onClick={() => providerExportConfirm.requestExport(() => exportTable('payment_providers', 'xlsx'))}>
            <Download className="h-4 w-4" />
          </Button>
          <TableImportButton tableName="payment_providers" onImportComplete={() => refetch()} />
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => refetch()} aria-label="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <>
            <Button size="sm" className="h-9" onClick={() => setIsAddDialogOpen(true)}><Plus className="h-4 w-4 mr-1" />{t('merchants.add')}</Button>
            <DrawerDetail open={isAddDialogOpen} onOpenChange={(open) => { setIsAddDialogOpen(open); if (!open) resetForm(); }} title={t('merchants.addProvider')} sheetMaxWidth="xl">
              {providerFormContent}
              <div className="flex flex-wrap justify-end gap-2 pt-4 mt-4 border-t border-border">
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>{t('common.cancel')}</Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {t('common.save')}
                </Button>
              </div>
            </DrawerDetail>
          </>
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
                  <>
                    <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={() => openEditDialog(provider)}>
                      <Pencil className="h-3.5 w-3.5" />
                      {t('common.edit')}
                    </Button>
                    <DrawerDetail open={editingProvider?.id === provider.id} onOpenChange={(open) => { if (!open) { setEditingProvider(null); resetForm(); } }} title={t('merchants.editProvider')} sheetMaxWidth="xl">
                      {providerFormContent}
                      <div className="flex flex-wrap justify-end gap-2 pt-4 mt-4 border-t border-border">
                        <Button variant="outline" onClick={() => setEditingProvider(null)}>{t('common.cancel')}</Button>
                        <Button onClick={handleSave} disabled={saving}>
                          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                          {t('common.save')}
                        </Button>
                      </div>
                    </DrawerDetail>
                  </>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 gap-1 text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                        {t('common.delete')}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t('merchants.confirmDelete')}</AlertDialogTitle>
                        <AlertDialogDescription>{t('merchants.deleteProviderWarning').replace('{name}', provider.name)}</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(provider.id)}>{t('common.delete')}</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
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
                      <SortableRow key={provider.id} id={provider.id} disabled={!!searchQuery}>
                        <TableCell className="font-medium text-center px-1.5">{provider.name}</TableCell>
                        <TableCell className="text-center px-1.5">
                          <Badge variant={provider.status === "active" ? "default" : "secondary"} className="cursor-pointer" onClick={() => toggleStatus(provider.id)}>
                            {provider.status === "active" ? t('merchants.active') : t('merchants.inactive')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-center px-1.5">{provider.remark}</TableCell>
                        <TableCell className="text-center px-1.5">
                          <div className="flex items-center justify-center gap-2">
                            <>
                              <Button variant="ghost" size="icon" onClick={() => openEditDialog(provider)} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                              <DrawerDetail open={editingProvider?.id === provider.id} onOpenChange={(open) => { if (!open) { setEditingProvider(null); resetForm(); } }} title={t('merchants.editProvider')} sheetMaxWidth="xl">
                                {providerFormContent}
                                <div className="flex flex-wrap justify-end gap-2 pt-4 mt-4 border-t border-border">
                                  <Button variant="outline" onClick={() => setEditingProvider(null)}>{t('common.cancel')}</Button>
                                  <Button onClick={handleSave} disabled={saving}>
                                    {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                    {t('common.save')}
                                  </Button>
                                </div>
                              </DrawerDetail>
                            </>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="text-destructive" aria-label="Delete"><Trash2 className="h-4 w-4" /></Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>{t('merchants.confirmDelete')}</AlertDialogTitle>
                                  <AlertDialogDescription>{t('merchants.deleteProviderWarning').replace('{name}', provider.name)}</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDelete(provider.id)}>{t('common.delete')}</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </SortableRow>
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
          {/* Pagination */}
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

const MERCHANT_TAB_MAP: Record<string, string> = { cards: "cards", vendors: "vendors", "payment-providers": "payment-providers" };
const MERCHANT_TAB_LABELS: Record<string, { zh: string; en: string }> = {
  cards: { zh: "卡片管理", en: "Cards" },
  vendors: { zh: "卡商管理", en: "Vendors" },
  "payment-providers": { zh: "代付商家", en: "Payment Providers" },
};

// Main Component
export default function MerchantManagement() {
  const [searchParams, setSearchParams] = useSearchParams();
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
