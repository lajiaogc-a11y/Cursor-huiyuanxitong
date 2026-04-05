export interface EmployeeProfitData {
  employeeId: string;
  employeeName: string;
  orderCount: number;
  profitNgn: number;
  profitUsdt: number;
  errorProfitNgn: number;
  errorProfitUsdt: number;
  activityGiftRatio: number;
  activityGiftAmount: number;
  manualGiftRatio: number;
  manualGiftAmount: number;
}

export interface CardReportData {
  cardType: string;
  orderCount: number;
  cardValueSum: number;
  profitNgn: number;
  profitUsdt: number;
}

export interface VendorReportData {
  vendorId: string;
  vendorName: string;
  orderCount: number;
  cardValueSum: number;
  profitNgn: number;
  profitUsdt: number;
}

export interface PaymentProviderReportData {
  providerId: string;
  providerName: string;
  orderCount: number;
  paymentValueNgnGhs: number;
  paymentValueUsdt: number;
}

export interface DailyReportData {
  date: string;
  orderCount: number;
  cardValueSum: number;
  paymentValueNgnGhs: number;
  paymentValueUsdt: number;
  activityAmount: number;
  profitNgn: number;
  profitUsdt: number;
  totalProfit: number;
}

export interface MonthlyReportData {
  month: string;
  orderCount: number;
  cardValueSum: number;
  paymentValueNgnGhs: number;
  paymentValueUsdt: number;
  activityAmount: number;
  profitNgn: number;
  profitUsdt: number;
  totalProfit: number;
}

export interface ActivityReportData {
  date: string;
  activityType: string;
  activityTypeLabel: string;
  giftNgn: number;
  giftGhs: number;
  giftUsdt: number;
  giftValueTotal: number;
  effectCount: number;
}

export type ReportPaginationControlsProps = {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
};
