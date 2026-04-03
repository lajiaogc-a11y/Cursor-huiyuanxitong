/**
 * 邀请海报模板（Canvas 绘制）
 *
 * 每个模板在 750×1334 画布上绘制背景 + 装饰，并提供统一的 QR 区域和文字区域。
 * 自定义上传背景图推荐尺寸：750×1334px（iPhone 标准截图比例）。
 * QR 码区域固定在画布中央偏上，280×280px，圆角白底，padding 24px。
 */

export const POSTER_WIDTH = 750;
export const POSTER_HEIGHT = 1334;
export const QR_BOX_SIZE = 280;
export const QR_BOX_X = (POSTER_WIDTH - QR_BOX_SIZE) / 2;
export const QR_BOX_Y = 520;
export const QR_PAD = 24;

export interface PosterFrame {
  id: string;
  labelZh: string;
  labelEn: string;
  drawBackground: (ctx: CanvasRenderingContext2D) => void;
  headlineColor: string;
  subtextColor: string;
  footerColor: string;
  qrBgColor: string;
  qrFgColor: string;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}

function drawDecoCircles(ctx: CanvasRenderingContext2D, color: string, opacity: number) {
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(120, 200, 180, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(650, 1100, 140, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(680, 300, 60, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

const frameDark: PosterFrame = {
  id: "dark",
  labelZh: "深色经典",
  labelEn: "Dark Classic",
  headlineColor: "hsl(210, 40%, 98%)",
  subtextColor: "hsla(213, 20%, 60%, 0.72)",
  footerColor: "hsla(213, 20%, 60%, 0.38)",
  qrBgColor: "#f8fafc",
  qrFgColor: "#0c1929",
  drawBackground(ctx) {
    const g = ctx.createLinearGradient(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
    g.addColorStop(0, "hsl(216, 50%, 6%)");
    g.addColorStop(0.55, "hsl(216, 50%, 8%)");
    g.addColorStop(1, "hsl(219, 40%, 11%)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
    drawDecoCircles(ctx, "#1e3a5f", 0.15);
  },
};

const frameGold: PosterFrame = {
  id: "gold",
  labelZh: "金色尊享",
  labelEn: "Golden Premium",
  headlineColor: "#fff8e1",
  subtextColor: "rgba(255,248,225,0.65)",
  footerColor: "rgba(255,248,225,0.35)",
  qrBgColor: "#fffdf5",
  qrFgColor: "#3e2723",
  drawBackground(ctx) {
    const g = ctx.createLinearGradient(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
    g.addColorStop(0, "#1a1208");
    g.addColorStop(0.4, "#2c1e0a");
    g.addColorStop(0.7, "#1f170a");
    g.addColorStop(1, "#0f0a04");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
    drawDecoCircles(ctx, "#c6993a", 0.08);
    // Gold border accent
    ctx.save();
    ctx.strokeStyle = "rgba(198,153,58,0.2)";
    ctx.lineWidth = 2;
    roundRect(ctx, 30, 30, POSTER_WIDTH - 60, POSTER_HEIGHT - 60, 32);
    ctx.stroke();
    ctx.restore();
  },
};

const frameGreen: PosterFrame = {
  id: "green",
  labelZh: "清新翠绿",
  labelEn: "Fresh Green",
  headlineColor: "#e8f5e9",
  subtextColor: "rgba(232,245,233,0.65)",
  footerColor: "rgba(232,245,233,0.35)",
  qrBgColor: "#f1f8e9",
  qrFgColor: "#1b5e20",
  drawBackground(ctx) {
    const g = ctx.createLinearGradient(0, 0, POSTER_WIDTH / 2, POSTER_HEIGHT);
    g.addColorStop(0, "#0a1f0e");
    g.addColorStop(0.5, "#0d2914");
    g.addColorStop(1, "#071a0a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
    drawDecoCircles(ctx, "#2e7d32", 0.1);
  },
};

const frameBlue: PosterFrame = {
  id: "blue",
  labelZh: "海洋深蓝",
  labelEn: "Ocean Blue",
  headlineColor: "#e3f2fd",
  subtextColor: "rgba(227,242,253,0.65)",
  footerColor: "rgba(227,242,253,0.35)",
  qrBgColor: "#e8eaf6",
  qrFgColor: "#0d47a1",
  drawBackground(ctx) {
    const g = ctx.createLinearGradient(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
    g.addColorStop(0, "#0a1628");
    g.addColorStop(0.5, "#0d1f3c");
    g.addColorStop(1, "#071222");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
    drawDecoCircles(ctx, "#1565c0", 0.1);
  },
};

const frameRed: PosterFrame = {
  id: "red",
  labelZh: "喜庆红色",
  labelEn: "Festive Red",
  headlineColor: "#ffebee",
  subtextColor: "rgba(255,235,238,0.65)",
  footerColor: "rgba(255,235,238,0.35)",
  qrBgColor: "#fff3f0",
  qrFgColor: "#b71c1c",
  drawBackground(ctx) {
    const g = ctx.createLinearGradient(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
    g.addColorStop(0, "#1a0808");
    g.addColorStop(0.5, "#2c0e0e");
    g.addColorStop(1, "#120505");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
    drawDecoCircles(ctx, "#c62828", 0.1);
    // Festive corner decorations
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = "#ff5252";
    ctx.beginPath();
    ctx.arc(0, 0, 200, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(POSTER_WIDTH, POSTER_HEIGHT, 200, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },
};

export const POSTER_FRAMES: PosterFrame[] = [frameGold, frameDark, frameGreen, frameBlue, frameRed];

export function getPosterFrame(id: string): PosterFrame {
  return POSTER_FRAMES.find((f) => f.id === id) ?? frameGold;
}

/**
 * 在 canvas 上绘制完整的邀请海报。
 * @param qrSvgElement - 页面上的 QR SVG DOM 元素
 * @param customBgImage - 可选自定义背景图（已加载的 Image）
 */
export function drawInvitePoster(
  canvas: HTMLCanvasElement,
  opts: {
    frame: PosterFrame;
    headlineL1: string;
    headlineL2: string;
    subtext: string;
    footerText: string;
    inviteLink: string;
    qrSvgElement: SVGSVGElement | HTMLElement;
    customBgImage?: HTMLImageElement | null;
  },
): Promise<void> {
  const { frame, headlineL1, headlineL2, subtext, footerText, inviteLink, qrSvgElement, customBgImage } = opts;
  const W = POSTER_WIDTH;
  const H = POSTER_HEIGHT;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Background
  if (customBgImage) {
    ctx.drawImage(customBgImage, 0, 0, W, H);
  } else {
    frame.drawBackground(ctx);
  }

  // Headline
  ctx.fillStyle = frame.headlineColor;
  ctx.textAlign = "center";
  ctx.font = "800 44px system-ui, -apple-system, sans-serif";
  ctx.fillText(headlineL1, W / 2, 160);
  ctx.fillText(headlineL2, W / 2, 220);

  // Subtext
  ctx.fillStyle = frame.subtextColor;
  ctx.font = "500 22px system-ui, -apple-system, sans-serif";
  const subtextLines = subtext.length > 30 ? [subtext.slice(0, 30), subtext.slice(30)] : [subtext];
  subtextLines.forEach((line, i) => {
    ctx.fillText(line, W / 2, 310 + i * 32);
  });

  // Decorative line above QR
  ctx.save();
  ctx.strokeStyle = frame.subtextColor;
  ctx.globalAlpha = 0.2;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 100, QR_BOX_Y - 40);
  ctx.lineTo(W / 2 + 100, QR_BOX_Y - 40);
  ctx.stroke();
  ctx.restore();

  // QR box with rounded corners
  ctx.fillStyle = frame.qrBgColor;
  roundRect(ctx, QR_BOX_X, QR_BOX_Y, QR_BOX_SIZE, QR_BOX_SIZE, 24);
  ctx.fill();

  // Draw QR code from SVG
  return new Promise<void>((resolve, reject) => {
    const svgData = new XMLSerializer().serializeToString(qrSvgElement);
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(
        img,
        QR_BOX_X + QR_PAD,
        QR_BOX_Y + QR_PAD,
        QR_BOX_SIZE - QR_PAD * 2,
        QR_BOX_SIZE - QR_PAD * 2,
      );

      // "Scan to register" label below QR
      ctx.fillStyle = frame.subtextColor;
      ctx.font = "500 18px system-ui, -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("扫描二维码注册 / Scan to register", W / 2, QR_BOX_Y + QR_BOX_SIZE + 40);

      // Invite link
      ctx.fillStyle = frame.footerColor;
      ctx.font = "400 14px monospace";
      const linkLines =
        inviteLink.length > 52 ? [inviteLink.slice(0, 52), inviteLink.slice(52)] : [inviteLink];
      linkLines.forEach((line, i) => {
        ctx.fillText(line, W / 2, QR_BOX_Y + QR_BOX_SIZE + 80 + i * 20);
      });

      // Decorative line above footer
      ctx.save();
      ctx.strokeStyle = frame.footerColor;
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(W / 2 - 80, H - 120);
      ctx.lineTo(W / 2 + 80, H - 120);
      ctx.stroke();
      ctx.restore();

      // Footer
      ctx.fillStyle = frame.footerColor;
      ctx.font = "500 18px system-ui, -apple-system, sans-serif";
      ctx.fillText(footerText, W / 2, H - 72);

      resolve();
    };
    img.onerror = () => reject(new Error("Failed to render QR SVG to image"));
    img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgData)))}`;
  });
}
