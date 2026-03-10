// ============= 打印/PDF导出工具 =============
// 提供打印功能并优化打印样式

/**
 * 打印页面内容
 * @param elementId 要打印的元素ID（可选，默认打印整个页面）
 * @param title 打印标题
 */
export function printContent(elementId?: string, title?: string): void {
  // 创建打印样式
  const printStyles = `
    @media print {
      /* 隐藏不需要打印的元素 */
      .no-print,
      button,
      [role="button"],
      .print-hide,
      nav,
      aside,
      header:not(.print-header),
      .sidebar,
      .toast,
      [data-radix-popper-content-wrapper],
      .pagination-controls,
      [class*="pagination"] {
        display: none !important;
      }
      
      /* 重置页面样式 */
      body {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        margin: 0;
        padding: 10mm;
      }
      
      /* 表格样式优化 */
      table {
        width: 100% !important;
        border-collapse: collapse !important;
        font-size: 10pt !important;
      }
      
      th, td {
        border: 1px solid #333 !important;
        padding: 6px 8px !important;
        text-align: center !important;
      }
      
      th {
        background-color: #f0f0f0 !important;
        font-weight: bold !important;
      }
      
      /* 卡片样式 */
      .card {
        border: 1px solid #ddd !important;
        box-shadow: none !important;
        break-inside: avoid;
      }
      
      /* 徽章样式 */
      .badge {
        border: 1px solid #999 !important;
        background: transparent !important;
      }
      
      /* 分页设置 */
      .page-break {
        page-break-before: always;
      }
      
      /* 隐藏滚动条 */
      ::-webkit-scrollbar {
        display: none;
      }
    }
  `;

  // 添加打印样式到 head
  const styleElement = document.createElement('style');
  styleElement.id = 'print-styles';
  styleElement.textContent = printStyles;
  document.head.appendChild(styleElement);

  // 设置打印标题
  const originalTitle = document.title;
  if (title) {
    document.title = title;
  }

  // 如果指定了元素ID，只打印该元素
  if (elementId) {
    const element = document.getElementById(elementId);
    if (element) {
      // 创建打印容器
      const printContainer = document.createElement('div');
      printContainer.id = 'print-container';
      printContainer.appendChild(element.cloneNode(true));
      
      // 隐藏原始内容，显示打印容器
      const originalChildren = Array.from(document.body.childNodes);
      originalChildren.forEach(child => (child as HTMLElement).style && ((child as HTMLElement).style.display = 'none'));
      document.body.appendChild(printContainer);
      
      // 执行打印
      window.print();
      
      // 恢复原始内容
      document.body.removeChild(printContainer);
      originalChildren.forEach(child => (child as HTMLElement).style && ((child as HTMLElement).style.display = ''));
    }
  } else {
    // 打印整个页面
    window.print();
  }

  // 恢复原始标题
  document.title = originalTitle;

  // 清理打印样式
  const printStyleElement = document.getElementById('print-styles');
  if (printStyleElement) {
    printStyleElement.remove();
  }
}

/**
 * 添加打印类到元素
 * @param className 要添加的类名
 */
export function addPrintClass(element: HTMLElement, className: string): void {
  element.classList.add(className);
}

/**
 * 生成打印友好的日期时间
 */
export function formatPrintDateTime(date?: Date): string {
  const d = date || new Date();
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
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
  title: string
): void {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('请允许弹出窗口以进行打印');
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
      <div class="meta">打印时间：${formatPrintDateTime()}</div>
      <table>
        <thead>
          <tr>
            ${headers.map(h => `<th>${h}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${rows.map(row => `
            <tr>
              ${row.map(cell => `<td>${cell ?? '-'}</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div class="footer">共 ${rows.length} 条记录</div>
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
