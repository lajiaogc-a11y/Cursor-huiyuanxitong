import type { ReactNode } from "react";
import {
  EliteDataTableCard,
  EliteFilterBar,
  EliteKPIGrid,
  EliteMemberDataTableCard,
  EliteMemberFilterBar,
  EliteMemberKPIGrid,
  EliteMemberPageHeader,
  ElitePageHeader,
} from "./components";

/** Staff page scaffold: header → KPI → filter → custom body → optional table */
export function EliteStaffPageTemplate({
  title,
  description,
  kpis,
  filter,
  children,
  tableHeaders,
  tableRows,
  action,
}: {
  title: string;
  description?: string;
  kpis?: { label: string; value: string; change?: string; tone?: "positive" | "warning" | "neutral" }[];
  filter?: ReactNode;
  children?: ReactNode;
  tableHeaders?: string[];
  tableRows?: string[][];
  action?: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <ElitePageHeader title={title} description={description} actions={action} showTitle />
      {kpis ? <EliteKPIGrid items={kpis} /> : null}
      {filter ? <EliteFilterBar>{filter}</EliteFilterBar> : null}
      {children}
      {tableHeaders && tableRows ? <EliteDataTableCard headers={tableHeaders} rows={tableRows} /> : null}
    </div>
  );
}

/** Member page scaffold */
export function EliteMemberPageTemplate({
  title,
  description,
  kpis,
  filter,
  children,
  tableHeaders,
  tableRows,
  action,
}: {
  title: string;
  description?: string;
  kpis?: { label: string; value: string }[];
  filter?: ReactNode;
  children?: ReactNode;
  tableHeaders?: string[];
  tableRows?: string[][];
  action?: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <EliteMemberPageHeader title={title} description={description} actions={action} />
      {kpis ? <EliteMemberKPIGrid items={kpis} /> : null}
      {filter ? <EliteMemberFilterBar>{filter}</EliteMemberFilterBar> : null}
      {children}
      {tableHeaders && tableRows ? <EliteMemberDataTableCard headers={tableHeaders} rows={tableRows} /> : null}
    </div>
  );
}
