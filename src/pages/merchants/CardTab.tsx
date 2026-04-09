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
import { CardCrudForm } from "@/components/merchants/CardCrudForm";
import TableImportButton from "@/components/TableImportButton";
import { ExportConfirmDialog } from "@/components/ExportConfirmDialog";
import { useExportConfirm } from "@/hooks/useExportConfirm";
import { exportTable } from "@/services/export";
import { notify } from "@/lib/notifyHub";
import { useLanguage } from "@/contexts/LanguageContext";
import { useCards, useVendors, CardItem } from "@/hooks/useMerchantConfig";
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

export function CardTab() {
  const { t, language } = useLanguage();
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

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const [formName, setFormName] = useState("");
  const [formCardType, setFormCardType] = useState("");
  const [formStatus, setFormStatus] = useState<string>("active");
  const [formRemark, setFormRemark] = useState("");
  const [formCardVendors, setFormCardVendors] = useState<string[]>([]);

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

  const totalPages = Math.ceil(filteredCards.length / pageSize);
  const paginatedCards = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredCards.slice(start, start + pageSize);
  }, [filteredCards, currentPage, pageSize]);

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

  const cardForm = (
    <CardCrudForm
      formName={formName}
      setFormName={setFormName}
      formCardType={formCardType}
      setFormCardType={setFormCardType}
      formStatus={formStatus}
      setFormStatus={setFormStatus}
      formRemark={formRemark}
      setFormRemark={setFormRemark}
      formCardVendors={formCardVendors}
      vendors={vendors}
      onToggleVendor={toggleVendorSelection}
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
          <Input placeholder={t('merchants.searchCards')} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 h-9" />
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            title={t('导出', 'Export')}
            onClick={() => exportConfirm.requestExport(() => void exportTable("cards", language === "en", "xlsx"))}
          >
            <Download className="h-4 w-4" />
          </Button>
          <TableImportButton tableName="cards" onImportComplete={() => refetch()} />
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => refetch()} aria-label="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <MerchantCrudAddDrawer
            open={isAddDialogOpen}
            onOpenChange={(open) => { setIsAddDialogOpen(open); if (!open) resetForm(); }}
            onRequestOpen={() => setIsAddDialogOpen(true)}
            title={t('merchants.addCard')}
            onCancel={() => setIsAddDialogOpen(false)}
            onSave={handleSave}
            saving={saving}
            addButtonContent={<><Plus className="h-4 w-4 mr-1" />{t('merchants.add')}</>}
          >
            {cardForm}
          </MerchantCrudAddDrawer>
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
                  <MerchantCrudRowActions
                    itemId={card.id}
                    editingId={editingCard?.id ?? null}
                    onOpenEdit={() => openEditDialog(card)}
                    onDrawerOpenChange={(open) => { if (!open) { setEditingCard(null); resetForm(); } }}
                    onCancelEdit={() => setEditingCard(null)}
                    editTitle={t('merchants.editCard')}
                    onSave={handleSave}
                    saving={saving}
                    formContent={cardForm}
                    deleteDescription={t('merchants.deleteCardWarning').replace('{name}', card.name)}
                    onDeleteConfirm={() => handleDelete(card.id)}
                    density="comfortable"
                  />
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
                      <SortableMerchantTableRow key={card.id} id={card.id} disabled={!!searchQuery}>
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
                            <MerchantCrudRowActions
                              itemId={card.id}
                              editingId={editingCard?.id ?? null}
                              onOpenEdit={() => openEditDialog(card)}
                              onDrawerOpenChange={(open) => { if (!open) { setEditingCard(null); resetForm(); } }}
                              onCancelEdit={() => setEditingCard(null)}
                              editTitle={t('merchants.editCard')}
                              onSave={handleSave}
                              saving={saving}
                              formContent={cardForm}
                              deleteDescription={t('merchants.deleteCardWarning').replace('{name}', card.name)}
                              onDeleteConfirm={() => handleDelete(card.id)}
                              density="compact"
                            />
                          </div>
                        </TableCell>
                      </SortableMerchantTableRow>
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
