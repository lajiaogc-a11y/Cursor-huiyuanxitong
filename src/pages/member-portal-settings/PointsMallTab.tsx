import type { LucideIcon } from "lucide-react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Loader2,
  Upload,
  Plus,
  Trash2,
  Save,
  ChevronUp,
  ChevronDown,
  ShoppingBag,
} from "lucide-react";
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
import {
  MobileCardList,
  MobileCard,
  MobileCardHeader,
} from "@/components/ui/mobile-data-card";
import { ResolvableMediaThumb } from "@/components/ResolvableMediaThumb";
import { cn } from "@/lib/utils";
import {
  portalSettingsEmptyShellClass,
  portalSettingsEmptyIconWrapClass,
} from "@/components/common/EmptyState";
import type { MemberPortalSettings } from "@/services/members/memberPortalSettingsService";
import type { PointsMallCategory, PointsMallItem } from "@/services/members/memberPointsMallService";
import { SectionTitle } from "./shared";

function MallTabEmptyState({
  icon: Icon,
  title,
  hint,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
}) {
  return (
    <div className={cn(portalSettingsEmptyShellClass)}>
      <div className="relative flex flex-col items-center">
        <div className={cn("mb-3", portalSettingsEmptyIconWrapClass)}>
          <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        {hint ? <p className="mt-1.5 max-w-lg text-xs leading-relaxed text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  );
}

export interface PointsMallTabProps {
  t: (zh: string, en: string) => string;
  language: string;
  settings: MemberPortalSettings;
  setSettings: Dispatch<SetStateAction<MemberPortalSettings>>;
  mallItems: PointsMallItem[];
  setMallItems: Dispatch<SetStateAction<PointsMallItem[]>>;
  mallCategories: PointsMallCategory[];
  savingMallCategories: boolean;
  savingMallItems: boolean;
  tenantId: string | null | undefined;
  isMobile: boolean;
  uploadingMallImageIndex: number | null;
  mallItemInputRefs: MutableRefObject<Record<number, HTMLInputElement | null>>;
  addMallCategory: () => void;
  saveMallCategories: () => void | Promise<void>;
  updateMallCategory: (idx: number, patch: Partial<PointsMallCategory>) => void;
  requestRemoveMallCategory: (idx: number) => void;
  addMallItem: () => void;
  requestRemoveMallItem: (idx: number) => void;
  updateMallItem: (idx: number, patch: Partial<PointsMallItem>) => void;
  moveMallItem: (from: number, to: number) => void;
  uploadMallItemImage: (idx: number, file?: File | null) => void | Promise<void>;
  saveMallItems: () => void | Promise<void>;
}

export function PointsMallTab({
  t,
  language,
  settings,
  setSettings,
  mallItems,
  setMallItems,
  mallCategories,
  savingMallCategories,
  savingMallItems,
  tenantId,
  isMobile,
  uploadingMallImageIndex,
  mallItemInputRefs,
  addMallCategory,
  saveMallCategories,
  updateMallCategory,
  requestRemoveMallCategory,
  addMallItem,
  requestRemoveMallItem,
  updateMallItem,
  moveMallItem,
  uploadMallItemImage,
  saveMallItems,
}: PointsMallTabProps) {
  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground -mb-2">
        {t(
          "可兑换商品与兑换订单处理；与「任务与奖励」中的消费积分体系配合。",
          "Redeemable products and redemption orders; works with points from tasks.",
        )}
      </p>
      <Card>
        <CardContent className="pt-5 space-y-4">
          <SectionTitle className="!mt-0">
            {t("兑换弹窗文案（会员端）", "Redeem dialog copy (member app)")}
          </SectionTitle>
          <p className="text-xs text-muted-foreground -mt-2">
            {t(
              "会员在积分商城点击兑换时弹出窗口内的「规则」标题，以及未配置每日/终身上限时显示的整行说明。留空则使用默认英文。",
              "Title of the rules box and the full-line lines when daily/lifetime limits are unset in admin. Leave empty to use the default English.",
            )}
          </p>
          <div className="space-y-2">
            <Label>{t("规则标题（英文）", "Rules title (English)")}</Label>
            <Input
              value={settings.points_mall_redeem_rules_title_en}
              onChange={(e) => setSettings((s) => ({ ...s, points_mall_redeem_rules_title_en: e.target.value }))}
              placeholder="Rules (synced with admin)"
            />
          </div>
          <div className="space-y-2">
            <Label>{t("规则标题（中文）", "Rules title (Chinese)")}</Label>
            <Input
              value={settings.points_mall_redeem_rules_title_zh}
              onChange={(e) => setSettings((s) => ({ ...s, points_mall_redeem_rules_title_zh: e.target.value }))}
              placeholder=""
            />
          </div>
          <div className="space-y-2">
            <Label>{t("未设每日上限时整行（英文）", "Daily unlimited line (English)")}</Label>
            <Input
              value={settings.points_mall_redeem_daily_unlimited_en}
              onChange={(e) => setSettings((s) => ({ ...s, points_mall_redeem_daily_unlimited_en: e.target.value }))}
              placeholder="Daily limit: none (per admin)"
            />
          </div>
          <div className="space-y-2">
            <Label>{t("未设每日上限时整行（中文）", "Daily unlimited line (Chinese)")}</Label>
            <Input
              value={settings.points_mall_redeem_daily_unlimited_zh}
              onChange={(e) => setSettings((s) => ({ ...s, points_mall_redeem_daily_unlimited_zh: e.target.value }))}
              placeholder=""
            />
          </div>
          <div className="space-y-2">
            <Label>{t("未设终身上限时整行（英文）", "Lifetime unlimited line (English)")}</Label>
            <Input
              value={settings.points_mall_redeem_lifetime_unlimited_en}
              onChange={(e) => setSettings((s) => ({ ...s, points_mall_redeem_lifetime_unlimited_en: e.target.value }))}
              placeholder="Lifetime limit: none"
            />
          </div>
          <div className="space-y-2">
            <Label>{t("未设终身上限时整行（中文）", "Lifetime unlimited line (Chinese)")}</Label>
            <Input
              value={settings.points_mall_redeem_lifetime_unlimited_zh}
              onChange={(e) => setSettings((s) => ({ ...s, points_mall_redeem_lifetime_unlimited_zh: e.target.value }))}
              placeholder=""
            />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <SectionTitle>{t("商城展示分类", "Mall display categories")}</SectionTitle>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={addMallCategory} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                {t("新增分类", "Add category")}
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={savingMallCategories || !tenantId}
                onClick={() => void saveMallCategories()}
                className="gap-1.5"
              >
                {savingMallCategories ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {t("保存分类", "Save categories")}
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground -mt-2">
            {t(
              "会员端筛选项除「全部」「受欢迎的」外，其余来自此处。删除分类后，原归属商品变为未分类（仅出现在「全部」）。请先保存分类再为商品选择分类。",
              "Member filters use these (besides “All” and “Popular”). Deleting a category unassigns items. Save categories before assigning products.",
            )}
          </p>
          {mallCategories.length === 0 ? (
            <MallTabEmptyState
              icon={ShoppingBag}
              title={t("暂无分类", "No categories")}
              hint={t("点击「新增分类」添加，默认迁移会创建「优惠券」「礼品」。", "Add categories; migration seeds Coupons & Gifts by default.")}
            />
          ) : (
            <div className="space-y-3">
              {mallCategories.map((cat, cidx) => (
                <div key={cat.id || cidx} className="flex flex-wrap items-end gap-2 rounded-lg border bg-muted/20 p-3">
                  <div className="grid flex-1 min-w-[140px] gap-1">
                    <Label className="text-[10px] text-muted-foreground">{t("中文名", "Name (ZH)")}</Label>
                    <Input
                      value={cat.name_zh}
                      onChange={(e) => updateMallCategory(cidx, { name_zh: e.target.value })}
                      className="h-8 text-xs"
                      placeholder={t("例如：优惠券", "e.g. Coupons")}
                    />
                  </div>
                  <div className="grid flex-1 min-w-[140px] gap-1">
                    <Label className="text-[10px] text-muted-foreground">{t("英文名", "Name (EN)")}</Label>
                    <Input
                      value={cat.name_en}
                      onChange={(e) => updateMallCategory(cidx, { name_en: e.target.value })}
                      className="h-8 text-xs"
                      placeholder="Coupons"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-destructive hover:text-destructive"
                    aria-label="Delete"
                    onClick={() => requestRemoveMallCategory(cidx)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <SectionTitle>{t("积分商城商品", "Points Mall Items")}</SectionTitle>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={addMallItem} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                {t("新增商品", "Add Item")}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10"
                    disabled={mallItems.length === 0}
                  >
                    {t("清空列表", "Clear list")}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("清空商品列表？", "Clear all products in the table?")}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t(
                        "将移除表格中所有行（仅本页编辑区）。清空后请点「保存积分商城商品」才会同步到数据库；保存后会员端只显示你保存后的商品。",
                        "Removes all rows in this editor only. Click Save to update the database; members will only see items you save.",
                      )}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => setMallItems([])}
                    >
                      {t("确认清空", "Clear")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
          <p className="text-xs text-muted-foreground -mt-2">
            {t(
              "一行一个商品，可新增、改字段、删行、排序。「保存」会按当前表格全量覆盖数据库中本租户商品（与清空后只录第二条等场景一致）。",
              "One row per product: add, edit, delete, reorder. Save replaces the full catalog for your tenant (e.g. after clearing and adding new items).",
            )}
          </p>
          {mallItems.length === 0 ? (
            <MallTabEmptyState
              icon={ShoppingBag}
              title={t("暂无商品", "No items yet")}
              hint={t(
                "点击右上角「新增商品」填写积分价、库存与配图，再点「保存积分商城商品」。",
                "Use “Add Item” above for points, stock, and image, then “Save Points Mall Items”.",
              )}
            />
          ) : isMobile ? (
            <MobileCardList>
              {mallItems.map((item, idx) => (
                <MobileCard key={`${item.id || "item"}-${idx}`}>
                  <MobileCardHeader>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs text-muted-foreground font-mono">{idx + 1}.</span>
                      {String(item.image_url || "").trim() ? (
                        <ResolvableMediaThumb
                          idKey={`portal-mall-m-${String(item.id ?? idx)}`}
                          url={item.image_url}
                          frameClassName="h-8 w-8 shrink-0 rounded-md"
                          imgClassName="border object-cover"
                        />
                      ) : (
                        <div className="h-8 w-8 shrink-0 rounded-md border bg-muted/40" />
                      )}
                      <span className="font-medium text-sm truncate">{item.title || t("未命名", "Untitled")}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Switch checked={item.enabled !== false} onCheckedChange={(v) => updateMallItem(idx, { enabled: v })} />
                      <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" aria-label="Delete" onClick={() => requestRemoveMallItem(idx)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </MobileCardHeader>
                  <div className="space-y-2 mt-2">
                    <Input value={item.title || ""} onChange={(e) => updateMallItem(idx, { title: e.target.value })} placeholder={t("商品标题", "Title")} className="h-8 text-xs" />
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">{t("展示分类", "Category")}</Label>
                      <Select
                        value={
                          item.mall_category_id &&
                          mallCategories.some((c) => c.id === item.mall_category_id)
                            ? String(item.mall_category_id)
                            : "__none__"
                        }
                        onValueChange={(v) =>
                          updateMallItem(idx, { mall_category_id: v === "__none__" ? null : v })
                        }
                      >
                        <SelectTrigger className="h-8 text-xs w-full">
                          <SelectValue placeholder={t("未分类", "Uncategorized")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">{t("未分类", "Uncategorized")}</SelectItem>
                          {mallCategories.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {language === "en" ? c.name_en || c.name_zh : c.name_zh}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Textarea value={item.description || ""} onChange={(e) => updateMallItem(idx, { description: e.target.value })} rows={2} placeholder={t("商品描述", "Description")} className="min-h-[44px] max-h-24 text-xs py-1.5 resize-y" />
                    <div className="flex items-center gap-2">
                      <Input value={item.image_url || ""} onChange={(e) => updateMallItem(idx, { image_url: e.target.value })} placeholder={t("图片 URL", "Image URL")} className="h-8 text-xs font-mono flex-1" />
                      <input ref={(el) => { mallItemInputRefs.current[idx] = el; }} type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; void uploadMallItemImage(idx, file); e.currentTarget.value = ""; }} />
                      <Button type="button" variant="outline" size="sm" className="h-8 w-8 p-0 shrink-0" aria-label="Upload" onClick={() => mallItemInputRefs.current[idx]?.click()} disabled={uploadingMallImageIndex === idx}>
                        {uploadingMallImageIndex === idx ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div><Label className="text-[10px] text-muted-foreground">{t("积分", "Pts")}</Label><Input type="number" min={0} value={item.points_cost ?? 0} onChange={(e) => updateMallItem(idx, { points_cost: Number(e.target.value || 0) })} className="h-8 text-xs px-2" /></div>
                      <div><Label className="text-[10px] text-muted-foreground">{t("库存", "Stock")}</Label><Input type="number" value={item.stock_remaining ?? -1} onChange={(e) => updateMallItem(idx, { stock_remaining: Number(e.target.value || -1) })} className="h-8 text-xs px-2" title={t("-1 无限", "-1 = unlimited")} /></div>
                      <div><Label className="text-[10px] text-muted-foreground">{t("每单", "Per order")}</Label><Input type="number" min={1} value={item.per_order_limit ?? 1} onChange={(e) => updateMallItem(idx, { per_order_limit: Number(e.target.value || 1) })} className="h-8 text-xs px-2" /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><Label className="text-[10px] text-muted-foreground">{t("日限", "Daily limit")}</Label><Input type="number" min={0} value={item.per_user_daily_limit ?? 0} onChange={(e) => updateMallItem(idx, { per_user_daily_limit: Number(e.target.value || 0) })} className="h-8 text-xs px-2" title={t("0 不限", "0 = no limit")} /></div>
                      <div><Label className="text-[10px] text-muted-foreground">{t("终身", "Life")}</Label><Input type="number" min={0} value={item.per_user_lifetime_limit ?? 0} onChange={(e) => updateMallItem(idx, { per_user_lifetime_limit: Number(e.target.value || 0) })} className="h-8 text-xs px-2" title={t("0 不限", "0 = no limit")} /></div>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center gap-1">
                        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={idx === 0} onClick={() => moveMallItem(idx, idx - 1)} title={t("上移", "Up")}><ChevronUp className="h-4 w-4" /></Button>
                        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={idx >= mallItems.length - 1} onClick={() => moveMallItem(idx, idx + 1)} title={t("下移", "Down")}><ChevronDown className="h-4 w-4" /></Button>
                      </div>
                    </div>
                  </div>
                </MobileCard>
              ))}
            </MobileCardList>
          ) : (
            <div className="rounded-lg border bg-card">
              <div className="max-h-[min(70vh,640px)] overflow-auto">
                <Table className="min-w-[1140px] text-xs">
                  <TableHeader className="sticky top-0 z-10 bg-muted/95 backdrop-blur-sm shadow-sm">
                    <TableRow className="hover:bg-transparent border-b">
                      <TableHead className="w-10 whitespace-nowrap">#</TableHead>
                      <TableHead className="w-[72px] text-center whitespace-nowrap">{t("排序", "Sort")}</TableHead>
                      <TableHead className="w-[52px]">{t("图", "Img")}</TableHead>
                      <TableHead className="min-w-[140px]">{t("标题", "Title")}</TableHead>
                      <TableHead className="min-w-[130px] whitespace-nowrap">{t("展示分类", "Category")}</TableHead>
                      <TableHead className="min-w-[160px]">{t("描述", "Desc")}</TableHead>
                      <TableHead className="min-w-[200px]">{t("图片链接", "Image URL")}</TableHead>
                      <TableHead className="w-[72px] whitespace-nowrap">{t("积分", "Pts")}</TableHead>
                      <TableHead className="w-[72px] whitespace-nowrap">{t("库存", "Stock")}</TableHead>
                      <TableHead className="w-[64px] whitespace-nowrap">{t("每单", "Per order")}</TableHead>
                      <TableHead className="w-[64px] whitespace-nowrap">{t("日限", "Daily limit")}</TableHead>
                      <TableHead className="w-[64px] whitespace-nowrap">{t("终身", "Life")}</TableHead>
                      <TableHead className="w-[56px] text-center">{t("上架", "On")}</TableHead>
                      <TableHead className="w-12 text-right">{t("操作", "Actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mallItems.map((item, idx) => (
                      <TableRow key={`${item.id || "item"}-${idx}`} className="align-top">
                        <TableCell className="font-mono text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell>
                          <div className="flex flex-col items-center gap-0.5">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              disabled={idx === 0}
                              onClick={() => moveMallItem(idx, idx - 1)}
                              title={t("上移", "Up")}
                            >
                              <ChevronUp className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              disabled={idx >= mallItems.length - 1}
                              onClick={() => moveMallItem(idx, idx + 1)}
                              title={t("下移", "Down")}
                            >
                              <ChevronDown className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col items-center gap-1">
                            {String(item.image_url || "").trim() ? (
                              <ResolvableMediaThumb
                                idKey={`portal-mall-t-${String(item.id ?? idx)}`}
                                url={item.image_url}
                                frameClassName="h-10 w-10 shrink-0 rounded-md"
                                imgClassName="border object-cover"
                              />
                            ) : (
                              <div className="h-10 w-10 shrink-0 rounded-md border bg-muted/40" />
                            )}
                            <input
                              ref={(el) => {
                                mallItemInputRefs.current[idx] = el;
                              }}
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                void uploadMallItemImage(idx, file);
                                e.currentTarget.value = "";
                              }}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => mallItemInputRefs.current[idx]?.click()}
                              disabled={uploadingMallImageIndex === idx}
                              title={t("上传图片", "Upload")}
                            >
                              {uploadingMallImageIndex === idx ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Upload className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Input
                            value={item.title || ""}
                            onChange={(e) => updateMallItem(idx, { title: e.target.value })}
                            placeholder={t("商品标题", "Title")}
                            className="h-8 text-xs"
                          />
                        </TableCell>
                        <TableCell>
                          <Select
                            value={
                              item.mall_category_id &&
                              mallCategories.some((c) => c.id === item.mall_category_id)
                                ? String(item.mall_category_id)
                                : "__none__"
                            }
                            onValueChange={(v) =>
                              updateMallItem(idx, { mall_category_id: v === "__none__" ? null : v })
                            }
                          >
                            <SelectTrigger className="h-8 text-xs w-[min(160px,100%)]">
                              <SelectValue placeholder={t("未分类", "Uncategorized")} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">{t("未分类", "Uncategorized")}</SelectItem>
                              {mallCategories.map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                  {language === "en" ? c.name_en || c.name_zh : c.name_zh}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Textarea
                            value={item.description || ""}
                            onChange={(e) => updateMallItem(idx, { description: e.target.value })}
                            rows={2}
                            placeholder={t("商品描述", "Description")}
                            className="min-h-[52px] max-h-28 text-xs py-1.5 resize-y"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={item.image_url || ""}
                            onChange={(e) => updateMallItem(idx, { image_url: e.target.value })}
                            placeholder={t("图片 URL", "Image URL")}
                            className="h-8 text-xs font-mono"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            value={item.points_cost ?? 0}
                            onChange={(e) => updateMallItem(idx, { points_cost: Number(e.target.value || 0) })}
                            className="h-8 text-xs px-2"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={item.stock_remaining ?? -1}
                            onChange={(e) => updateMallItem(idx, { stock_remaining: Number(e.target.value || -1) })}
                            className="h-8 text-xs px-2"
                            title={t("-1 无限", "-1 = unlimited")}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={1}
                            value={item.per_order_limit ?? 1}
                            onChange={(e) => updateMallItem(idx, { per_order_limit: Number(e.target.value || 1) })}
                            className="h-8 text-xs px-2"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            value={item.per_user_daily_limit ?? 0}
                            onChange={(e) => updateMallItem(idx, { per_user_daily_limit: Number(e.target.value || 0) })}
                            className="h-8 text-xs px-2"
                            title={t("0 不限", "0 = no limit")}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            value={item.per_user_lifetime_limit ?? 0}
                            onChange={(e) => updateMallItem(idx, { per_user_lifetime_limit: Number(e.target.value || 0) })}
                            className="h-8 text-xs px-2"
                            title={t("0 不限", "0 = no limit")}
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch checked={item.enabled !== false} onCheckedChange={(v) => updateMallItem(idx, { enabled: v })} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                            aria-label="Delete"
                            onClick={() => requestRemoveMallItem(idx)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
          <Button onClick={() => void saveMallItems()} disabled={savingMallItems} className="w-full gap-2">
            {savingMallItems ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t("保存积分商城商品", "Save Points Mall Items")}
          </Button>
          <p className="text-xs text-muted-foreground text-center leading-relaxed">
            {t(
              "会员提交的商城兑换单请在「订单管理 → 商城订单」中处理。",
              "Process mall redemption orders under Orders → Mall orders.",
            )}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
