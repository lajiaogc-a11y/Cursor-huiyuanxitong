import { useState, useMemo, useEffect } from "react";
import { TablePageSkeleton } from "@/components/skeletons/TablePageSkeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Plus, Search, Pencil, Trash2, RefreshCw, CreditCard, Store, Wallet, Loader2, GripVertical, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { toast as sonnerToast } from "sonner";

// Compatibility wrapper: converts old Radix toast API to sonner
const toast = (opts: { title: string; variant?: string; description?: string }) => {
  if (opts.variant === 'destructive') {
    sonnerToast.error(opts.title, opts.description ? { description: opts.description } : undefined);
  } else {
    sonnerToast.success(opts.title, opts.description ? { description: opts.description } : undefined);
  }
};
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
  const { t, tr } = useLanguage();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const useCompactLayout = isMobile || isTablet;
  const { cards, loading, addCard, updateCard, deleteCard, updateCardSortOrders, refetch } = useCards();
  const { vendors } = useVendors();
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<CardItem | null>(null);
  const [saving, setSaving] = useState(false);

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
  const [formStatus, setFormStatus] = useState<"active" | "inactive">("active");
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
        toast({ title: tr('merchants.sortUpdated') });
      }
    }
  };

  const filteredCards = searchQuery 
    ? cards.filter((card) => card.name.toLowerCase().includes(searchQuery.toLowerCase()))
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
    setFormStatus("active");
    setFormRemark("");
    setFormCardVendors([]);
  };

  const openEditDialog = (card: CardItem) => {
    setEditingCard(card);
    setFormName(card.name);
    setFormStatus(card.status);
    setFormRemark(card.remark);
    setFormCardVendors(card.cardVendors || []);
  };

  const handleSave = async () => {
    if (!formName) {
      toast({ title: tr('merchants.fillCardName'), variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      if (editingCard) {
        const success = await updateCard(editingCard.id, {
          name: formName,
          type: "",
          status: formStatus,
          remark: formRemark,
          cardVendors: formCardVendors,
        });
        if (success) {
          toast({ title: tr('merchants.cardUpdated') });
          setEditingCard(null);
        } else {
          toast({ title: tr('merchants.updateFailed'), variant: "destructive" });
        }
      } else {
        const result = await addCard({
          name: formName,
          type: "",
          status: formStatus,
          remark: formRemark,
          cardVendors: formCardVendors,
        });
        if (result) {
          toast({ title: tr('merchants.cardAdded') });
          setIsAddDialogOpen(false);
        } else {
          toast({ title: tr('merchants.addFailed'), variant: "destructive" });
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
      toast({ title: tr('merchants.cardDeleted') });
    } else {
      toast({ title: tr('merchants.deleteFailed'), variant: "destructive" });
    }
  };

  const toggleStatus = async (id: string) => {
    const card = cards.find(c => c.id === id);
    if (card) {
      const newStatus = card.status === "active" ? "inactive" : "active";
      const success = await updateCard(id, { status: newStatus });
      if (success) {
        toast({ title: tr('merchants.statusUpdated') });
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
        <Label>{tr('merchants.cardName')} *</Label>
        <Input
          placeholder={tr('merchants.namePlaceholder')}
          value={formName}
          onChange={(e) => setFormName(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>{tr('merchants.cardVendors')}</Label>
        <div className="text-xs text-muted-foreground mb-1">{tr('merchants.selectVendors')}</div>
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
            {tr('merchants.selected')}: {formCardVendors.join(", ")}
          </div>
        )}
      </div>
      <div className="space-y-2">
        <Label>{tr('merchants.status')}</Label>
        <Select value={formStatus} onValueChange={(v) => setFormStatus(v as "active" | "inactive")}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">{tr('merchants.active')}</SelectItem>
            <SelectItem value="inactive">{tr('merchants.inactive')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>{tr('merchants.remark')}</Label>
        <Textarea placeholder={tr('merchants.remarkPlaceholder')} value={formRemark} onChange={(e) => setFormRemark(e.target.value)} rows={3} />
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
          <Input placeholder={tr('merchants.searchCards')} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 h-9" />
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Dialog open={isAddDialogOpen} onOpenChange={(open) => { setIsAddDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-9"><Plus className="h-4 w-4 mr-1" />{tr('merchants.add')}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{tr('merchants.addCard')}</DialogTitle></DialogHeader>
              {cardFormContent}
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>{tr('common.cancel')}</Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {tr('common.save')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {useCompactLayout ? (
        <>
          <MobileCardList>
            {paginatedCards.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground text-sm">{tr('merchants.noData')}</p>
            ) : paginatedCards.map((card) => (
              <MobileCard key={card.id}>
                <MobileCardHeader>
                  <span className="font-medium text-sm">{card.name}</span>
                  <Badge variant={card.status === "active" ? "default" : "secondary"} className="cursor-pointer" onClick={() => toggleStatus(card.id)}>
                    {card.status === "active" ? tr('merchants.active') : tr('merchants.inactive')}
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
                  <MobileCardRow label={tr('merchants.remark')} value={card.remark} />
                )}
                <MobileCardActions>
                  <Dialog open={editingCard?.id === card.id} onOpenChange={(open) => { if (!open) { setEditingCard(null); resetForm(); } }}>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={() => openEditDialog(card)}>
                        <Pencil className="h-3.5 w-3.5" />
                        {tr('common.edit')}
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>{tr('merchants.editCard')}</DialogTitle></DialogHeader>
                      {cardFormContent}
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setEditingCard(null)}>{tr('common.cancel')}</Button>
                        <Button onClick={handleSave} disabled={saving}>
                          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                          {tr('common.save')}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 gap-1 text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                        {tr('common.delete')}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{tr('merchants.confirmDelete')}</AlertDialogTitle>
                        <AlertDialogDescription>{tr('merchants.deleteCardWarning').replace('{name}', card.name)}</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{tr('common.cancel')}</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(card.id)}>{tr('common.delete')}</AlertDialogAction>
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
                    <TableHead className="text-center whitespace-nowrap px-1.5">{tr('merchants.cardName')}</TableHead>
                    <TableHead className="text-center whitespace-nowrap px-1.5">{tr('merchants.cardVendors')}</TableHead>
                    <TableHead className="text-center whitespace-nowrap px-1.5">{tr('merchants.status')}</TableHead>
                    <TableHead className="text-center whitespace-nowrap px-1.5">{tr('merchants.remark')}</TableHead>
                    <TableHead className="text-center whitespace-nowrap px-1.5">{tr('merchants.actions')}</TableHead>
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
                              <span className="text-muted-foreground text-xs">{tr('merchants.allVendors')}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center px-1.5">
                          <Badge variant={card.status === "active" ? "default" : "secondary"} className="cursor-pointer" onClick={() => toggleStatus(card.id)}>
                            {card.status === "active" ? tr('merchants.active') : tr('merchants.inactive')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-center px-1.5">{card.remark}</TableCell>
                        <TableCell className="text-center px-1.5">
                          <div className="flex items-center justify-center gap-2">
                            <Dialog open={editingCard?.id === card.id} onOpenChange={(open) => { if (!open) { setEditingCard(null); resetForm(); } }}>
                              <DialogTrigger asChild>
                                <Button variant="ghost" size="icon" onClick={() => openEditDialog(card)}><Pencil className="h-4 w-4" /></Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader><DialogTitle>{tr('merchants.editCard')}</DialogTitle></DialogHeader>
                                {cardFormContent}
                                <DialogFooter>
                                  <Button variant="outline" onClick={() => setEditingCard(null)}>{tr('common.cancel')}</Button>
                                  <Button onClick={handleSave} disabled={saving}>
                                    {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                    {tr('common.save')}
                                  </Button>
                                </DialogFooter>
                              </DialogContent>
                            </Dialog>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="text-destructive"><Trash2 className="h-4 w-4" /></Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>{tr('merchants.confirmDelete')}</AlertDialogTitle>
                                  <AlertDialogDescription>{tr('merchants.deleteCardWarning').replace('{name}', card.name)}</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>{tr('common.cancel')}</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDelete(card.id)}>{tr('common.delete')}</AlertDialogAction>
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
                        {tr('merchants.noData')}
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
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(1)} disabled={currentPage <= 1}>
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(currentPage - 1)} disabled={currentPage <= 1}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="tabular-nums px-3 text-sm">{currentPage} / {totalPages}</span>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(currentPage + 1)} disabled={currentPage >= totalPages}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(totalPages)} disabled={currentPage >= totalPages}>
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
      {searchQuery && (
        <p className="text-xs text-muted-foreground shrink-0">{tr('merchants.dragDisabled')}</p>
      )}
    </div>
  );
}

// Vendor Management Tab Component
function VendorTab() {
  const { t, tr } = useLanguage();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const useCompactLayout = isMobile || isTablet;
  const { vendors, loading, addVendor, updateVendor, deleteVendor, updateVendorSortOrders, refetch } = useVendors();
  const { providers: paymentProviders } = usePaymentProviders();
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [saving, setSaving] = useState(false);

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
  const [formStatus, setFormStatus] = useState<"active" | "inactive">("active");
  const [formRemark, setFormRemark] = useState("");
  const [formPaymentProviders, setFormPaymentProviders] = useState<string[]>([]);

  const filteredVendors = searchQuery 
    ? vendors.filter((vendor) => vendor.name.toLowerCase().includes(searchQuery.toLowerCase()))
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
        toast({ title: tr('merchants.sortUpdated') });
      }
    }
  };

  const handleSave = async () => {
    if (!formName) {
      toast({ title: tr('merchants.fillVendorName'), variant: "destructive" });
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
          toast({ title: tr('merchants.vendorUpdated') });
          setEditingVendor(null);
        } else {
          toast({ title: tr('merchants.updateFailed'), variant: "destructive" });
        }
      } else {
        const result = await addVendor({
          name: formName,
          status: formStatus,
          remark: formRemark,
        });
        if (result) {
          toast({ title: tr('merchants.vendorAdded') });
          setIsAddDialogOpen(false);
        } else {
          toast({ title: tr('merchants.addFailed'), variant: "destructive" });
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
      toast({ title: tr('merchants.vendorDeleted') });
    } else {
      toast({ title: tr('merchants.deleteFailed'), variant: "destructive" });
    }
  };

  const toggleStatus = async (id: string) => {
    const vendor = vendors.find(v => v.id === id);
    if (vendor) {
      const newStatus = vendor.status === "active" ? "inactive" : "active";
      const success = await updateVendor(id, { status: newStatus });
      if (success) {
        toast({ title: tr('merchants.statusUpdated') });
      }
    }
  };

  const vendorFormContent = (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <Label>{tr('merchants.vendorName')} *</Label>
        <Input placeholder={tr('merchants.namePlaceholder')} value={formName} onChange={(e) => setFormName(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>{tr('merchants.paymentProvidersFor')}</Label>
        <div className="text-xs text-muted-foreground mb-1">{tr('merchants.selectProviders')}</div>
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
            {tr('merchants.selected')}: {formPaymentProviders.join(", ")}
          </div>
        )}
      </div>
      <div className="space-y-2">
        <Label>{tr('merchants.status')}</Label>
        <Select value={formStatus} onValueChange={(v) => setFormStatus(v as "active" | "inactive")}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">{tr('merchants.active')}</SelectItem>
            <SelectItem value="inactive">{tr('merchants.inactive')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>{tr('merchants.remark')}</Label>
        <Textarea placeholder={tr('merchants.remarkPlaceholder')} value={formRemark} onChange={(e) => setFormRemark(e.target.value)} rows={3} />
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
          <Input placeholder={tr('merchants.searchVendors')} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 h-9" />
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Dialog open={isAddDialogOpen} onOpenChange={(open) => { setIsAddDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-9"><Plus className="h-4 w-4 mr-1" />{tr('merchants.add')}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{tr('merchants.addVendor')}</DialogTitle></DialogHeader>
              {vendorFormContent}
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>{tr('common.cancel')}</Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {tr('common.save')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {useCompactLayout ? (
        <>
          <MobileCardList>
            {paginatedVendors.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground text-sm">{tr('merchants.noData')}</p>
            ) : paginatedVendors.map((vendor) => (
              <MobileCard key={vendor.id}>
                <MobileCardHeader>
                  <span className="font-medium text-sm">{vendor.name}</span>
                  <Badge variant={vendor.status === "active" ? "default" : "secondary"} className="cursor-pointer" onClick={() => toggleStatus(vendor.id)}>
                    {vendor.status === "active" ? tr('merchants.active') : tr('merchants.inactive')}
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
                  <MobileCardRow label={tr('merchants.remark')} value={vendor.remark} />
                )}
                <MobileCardActions>
                  <Dialog open={editingVendor?.id === vendor.id} onOpenChange={(open) => { if (!open) { setEditingVendor(null); resetForm(); } }}>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={() => openEditDialog(vendor)}>
                        <Pencil className="h-3.5 w-3.5" />
                        {tr('common.edit')}
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>{tr('merchants.editVendor')}</DialogTitle></DialogHeader>
                      {vendorFormContent}
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setEditingVendor(null)}>{tr('common.cancel')}</Button>
                        <Button onClick={handleSave} disabled={saving}>
                          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                          {tr('common.save')}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 gap-1 text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                        {tr('common.delete')}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{tr('merchants.confirmDelete')}</AlertDialogTitle>
                        <AlertDialogDescription>{tr('merchants.deleteVendorWarning').replace('{name}', vendor.name)}</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{tr('common.cancel')}</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(vendor.id)}>{tr('common.delete')}</AlertDialogAction>
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
                    <TableHead className="text-center whitespace-nowrap px-1.5">{tr('merchants.vendorName')}</TableHead>
                    <TableHead className="text-center whitespace-nowrap px-1.5">{tr('merchants.paymentProvidersFor')}</TableHead>
                    <TableHead className="text-center whitespace-nowrap px-1.5">{tr('merchants.status')}</TableHead>
                    <TableHead className="text-center whitespace-nowrap px-1.5">{tr('merchants.remark')}</TableHead>
                    <TableHead className="text-center whitespace-nowrap px-1.5">{tr('merchants.actions')}</TableHead>
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
                              <span className="text-muted-foreground text-xs">{tr('merchants.allProviders')}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center px-1.5">
                          <Badge variant={vendor.status === "active" ? "default" : "secondary"} className="cursor-pointer" onClick={() => toggleStatus(vendor.id)}>
                            {vendor.status === "active" ? tr('merchants.active') : tr('merchants.inactive')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-center px-1.5">{vendor.remark}</TableCell>
                        <TableCell className="text-center px-1.5">
                          <div className="flex items-center justify-center gap-2">
                            <Dialog open={editingVendor?.id === vendor.id} onOpenChange={(open) => { if (!open) { setEditingVendor(null); resetForm(); } }}>
                              <DialogTrigger asChild>
                                <Button variant="ghost" size="icon" onClick={() => openEditDialog(vendor)}><Pencil className="h-4 w-4" /></Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader><DialogTitle>{tr('merchants.editVendor')}</DialogTitle></DialogHeader>
                                {vendorFormContent}
                                <DialogFooter>
                                  <Button variant="outline" onClick={() => setEditingVendor(null)}>{tr('common.cancel')}</Button>
                                  <Button onClick={handleSave} disabled={saving}>
                                    {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                    {tr('common.save')}
                                  </Button>
                                </DialogFooter>
                              </DialogContent>
                            </Dialog>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="text-destructive"><Trash2 className="h-4 w-4" /></Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>{tr('merchants.confirmDelete')}</AlertDialogTitle>
                                  <AlertDialogDescription>{tr('merchants.deleteVendorWarning').replace('{name}', vendor.name)}</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>{tr('common.cancel')}</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDelete(vendor.id)}>{tr('common.delete')}</AlertDialogAction>
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
                        {tr('merchants.noData')}
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
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(1)} disabled={currentPage <= 1}>
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(currentPage - 1)} disabled={currentPage <= 1}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="tabular-nums px-3 text-sm">{currentPage} / {totalPages}</span>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(currentPage + 1)} disabled={currentPage >= totalPages}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(totalPages)} disabled={currentPage >= totalPages}>
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
      {searchQuery && (
        <p className="text-xs text-muted-foreground shrink-0">{tr('merchants.dragDisabled')}</p>
      )}
    </div>
  );
}

// Payment Provider Tab Component
function PaymentProviderTab() {
  const { t, tr } = useLanguage();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const useCompactLayout = isMobile || isTablet;
  const { providers, loading, addProvider, updateProvider, deleteProvider, updateProviderSortOrders, refetch } = usePaymentProviders();
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<PaymentProvider | null>(null);
  const [saving, setSaving] = useState(false);

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
  const [formStatus, setFormStatus] = useState<"active" | "inactive">("active");
  const [formRemark, setFormRemark] = useState("");

  const filteredProviders = searchQuery 
    ? providers.filter((provider) => provider.name.toLowerCase().includes(searchQuery.toLowerCase()))
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
        toast({ title: tr('merchants.sortUpdated') });
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
      toast({ title: tr('merchants.fillProviderName'), variant: "destructive" });
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
          toast({ title: tr('merchants.providerUpdated') });
          setEditingProvider(null);
        } else {
          toast({ title: tr('merchants.updateFailed'), variant: "destructive" });
        }
      } else {
        const result = await addProvider({
          name: formName,
          status: formStatus,
          remark: formRemark,
        });
        if (result) {
          toast({ title: tr('merchants.providerAdded') });
          setIsAddDialogOpen(false);
        } else {
          toast({ title: tr('merchants.addFailed'), variant: "destructive" });
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
      toast({ title: tr('merchants.providerDeleted') });
    } else {
      toast({ title: tr('merchants.deleteFailed'), variant: "destructive" });
    }
  };

  const toggleStatus = async (id: string) => {
    const provider = providers.find(p => p.id === id);
    if (provider) {
      const newStatus = provider.status === "active" ? "inactive" : "active";
      const success = await updateProvider(id, { status: newStatus });
      if (success) {
        toast({ title: tr('merchants.statusUpdated') });
      }
    }
  };

  const providerFormContent = (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <Label>{tr('merchants.providerName')} *</Label>
        <Input placeholder={tr('merchants.namePlaceholder')} value={formName} onChange={(e) => setFormName(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>{tr('merchants.status')}</Label>
        <Select value={formStatus} onValueChange={(v) => setFormStatus(v as "active" | "inactive")}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">{tr('merchants.active')}</SelectItem>
            <SelectItem value="inactive">{tr('merchants.inactive')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>{tr('merchants.remark')}</Label>
        <Textarea placeholder={tr('merchants.remarkPlaceholder')} value={formRemark} onChange={(e) => setFormRemark(e.target.value)} rows={3} />
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
          <Input placeholder={tr('merchants.searchProviders')} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 h-9" />
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Dialog open={isAddDialogOpen} onOpenChange={(open) => { setIsAddDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-9"><Plus className="h-4 w-4 mr-1" />{tr('merchants.add')}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{tr('merchants.addProvider')}</DialogTitle></DialogHeader>
              {providerFormContent}
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>{tr('common.cancel')}</Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {tr('common.save')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {useCompactLayout ? (
        <>
          <MobileCardList>
            {paginatedProviders.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground text-sm">{tr('merchants.noData')}</p>
            ) : paginatedProviders.map((provider) => (
              <MobileCard key={provider.id}>
                <MobileCardHeader>
                  <span className="font-medium text-sm">{provider.name}</span>
                  <Badge variant={provider.status === "active" ? "default" : "secondary"} className="cursor-pointer" onClick={() => toggleStatus(provider.id)}>
                    {provider.status === "active" ? tr('merchants.active') : tr('merchants.inactive')}
                  </Badge>
                </MobileCardHeader>
                {provider.remark && (
                  <MobileCardRow label={tr('merchants.remark')} value={provider.remark} />
                )}
                <MobileCardActions>
                  <Dialog open={editingProvider?.id === provider.id} onOpenChange={(open) => { if (!open) { setEditingProvider(null); resetForm(); } }}>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={() => openEditDialog(provider)}>
                        <Pencil className="h-3.5 w-3.5" />
                        {tr('common.edit')}
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>{tr('merchants.editProvider')}</DialogTitle></DialogHeader>
                      {providerFormContent}
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setEditingProvider(null)}>{tr('common.cancel')}</Button>
                        <Button onClick={handleSave} disabled={saving}>
                          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                          {tr('common.save')}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 gap-1 text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                        {tr('common.delete')}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{tr('merchants.confirmDelete')}</AlertDialogTitle>
                        <AlertDialogDescription>{tr('merchants.deleteProviderWarning').replace('{name}', provider.name)}</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{tr('common.cancel')}</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(provider.id)}>{tr('common.delete')}</AlertDialogAction>
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
                    <TableHead className="text-center whitespace-nowrap px-1.5">{tr('merchants.providerName')}</TableHead>
                    <TableHead className="text-center whitespace-nowrap px-1.5">{tr('merchants.status')}</TableHead>
                    <TableHead className="text-center whitespace-nowrap px-1.5">{tr('merchants.remark')}</TableHead>
                    <TableHead className="text-center whitespace-nowrap px-1.5">{tr('merchants.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <SortableContext items={paginatedProviders.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                    {paginatedProviders.map((provider) => (
                      <SortableRow key={provider.id} id={provider.id} disabled={!!searchQuery}>
                        <TableCell className="font-medium text-center px-1.5">{provider.name}</TableCell>
                        <TableCell className="text-center px-1.5">
                          <Badge variant={provider.status === "active" ? "default" : "secondary"} className="cursor-pointer" onClick={() => toggleStatus(provider.id)}>
                            {provider.status === "active" ? tr('merchants.active') : tr('merchants.inactive')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-center px-1.5">{provider.remark}</TableCell>
                        <TableCell className="text-center px-1.5">
                          <div className="flex items-center justify-center gap-2">
                            <Dialog open={editingProvider?.id === provider.id} onOpenChange={(open) => { if (!open) { setEditingProvider(null); resetForm(); } }}>
                              <DialogTrigger asChild>
                                <Button variant="ghost" size="icon" onClick={() => openEditDialog(provider)}><Pencil className="h-4 w-4" /></Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader><DialogTitle>{tr('merchants.editProvider')}</DialogTitle></DialogHeader>
                                {providerFormContent}
                                <DialogFooter>
                                  <Button variant="outline" onClick={() => setEditingProvider(null)}>{tr('common.cancel')}</Button>
                                  <Button onClick={handleSave} disabled={saving}>
                                    {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                    {tr('common.save')}
                                  </Button>
                                </DialogFooter>
                              </DialogContent>
                            </Dialog>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="text-destructive"><Trash2 className="h-4 w-4" /></Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>{tr('merchants.confirmDelete')}</AlertDialogTitle>
                                  <AlertDialogDescription>{tr('merchants.deleteProviderWarning').replace('{name}', provider.name)}</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>{tr('common.cancel')}</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDelete(provider.id)}>{tr('common.delete')}</AlertDialogAction>
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
                        {tr('merchants.noData')}
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
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(1)} disabled={currentPage <= 1}>
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(currentPage - 1)} disabled={currentPage <= 1}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="tabular-nums px-3 text-sm">{currentPage} / {totalPages}</span>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(currentPage + 1)} disabled={currentPage >= totalPages}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(totalPages)} disabled={currentPage >= totalPages}>
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
      {searchQuery && (
        <p className="text-xs text-muted-foreground shrink-0">{tr('merchants.dragDisabled')}</p>
      )}
    </div>
  );
}

// Main Component
export default function MerchantManagement() {
  const { tr } = useLanguage();
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4">
          <Tabs defaultValue="cards" className="w-full">
            <TabsList className="grid w-full grid-cols-3 h-9">
              <TabsTrigger value="cards" className="flex items-center gap-1.5 text-sm">
                <CreditCard className="h-3.5 w-3.5" />
                {tr('merchants.cards')}
              </TabsTrigger>
              <TabsTrigger value="vendors" className="flex items-center gap-1.5 text-sm">
                <Store className="h-3.5 w-3.5" />
                {tr('merchants.vendors')}
              </TabsTrigger>
              <TabsTrigger value="payment-providers" className="flex items-center gap-1.5 text-sm">
                <Wallet className="h-3.5 w-3.5" />
                {tr('merchants.paymentProviders')}
              </TabsTrigger>
            </TabsList>
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
