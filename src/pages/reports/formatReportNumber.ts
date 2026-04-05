export function formatReportNumber(num: number): string {
  return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
