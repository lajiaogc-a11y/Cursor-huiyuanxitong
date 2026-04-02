// ============= 报表打印工具（报表管理等页面使用 printTable）=============

import { toast } from "sonner";
import { formatBeijingTime } from "@/lib/beijingTime";
import { pickBilingual, readEffectiveAppLocale, type AppLocale } from "@/lib/appLocale";

/**
 * 生成打印友好的日期时间（员工端：北京时间）
 */
export function formatPrintDateTime(date?: Date): string {
  const d = date || new Date();
  return formatBeijingTime(d);
}

export interface PrintTableOptions {
  /** 弹窗被拦截时的提示（建议由页面传入 t() 结果以与 LanguageContext 完全一致） */
  popupBlockedMessage?: string;
  locale?: AppLocale;
}

/**
 * 打印指定表格数据
 * @param headers 表头数组
 * @param rows 数据行数组
 * @param title 标题
 */
export function printTable(
  headers: string[],
  rows: (string | number)[][],
  title: string,
  options?: PrintTableOptions,
): void {
  const locale = options?.locale ?? readEffectiveAppLocale();
  const L = (zh: string, en: string) => pickBilingual(zh, en, locale);

  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    const msg =
      options?.popupBlockedMessage ??
      L("请允许弹出窗口以进行打印", "Please allow popups for printing");
    toast.error(msg);
    return;
  }

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${title}</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          padding: 20px;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        h1 {
          font-size: 18px;
          margin-bottom: 10px;
        }
        .meta {
          font-size: 12px;
          color: #666;
          margin-bottom: 20px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 11px;
        }
        th, td {
          border: 1px solid #333;
          padding: 8px;
          text-align: center;
        }
        th {
          background-color: #f0f0f0;
          font-weight: bold;
        }
        tr:nth-child(even) {
          background-color: #fafafa;
        }
        .footer {
          margin-top: 20px;
          font-size: 10px;
          color: #999;
          text-align: right;
        }
        @media print {
          body { padding: 0; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <h1>${title}</h1>
      <div class="meta">${L("打印时间", "Print time")}：${formatPrintDateTime()}</div>
      <table>
        <thead>
          <tr>
            ${headers.map((h) => `<th>${h}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) => `
            <tr>
              ${row.map((cell) => `<td>${cell ?? "-"}</td>`).join("")}
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
      <div class="footer">${L(`共 ${rows.length} 条记录`, `${rows.length} records total`)}</div>
      <script>
        window.onload = function() {
          window.print();
          window.onafterprint = function() {
            window.close();
          };
        };
      </script>
    </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
}
