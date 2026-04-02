import * as React from "react";
import { cn } from "@/lib/utils";

interface StickyScrollTableContainerProps {
  children: React.ReactNode;
  className?: string;
  minWidth?: string;
  /** 最大高度，支持 flex 布局下的垂直滚动 */
  maxHeight?: string;
}

/**
 * 表格滚动容器 - 支持水平滚动和可选的垂直滚动
 * 
 * 功能：
 * 1. 支持水平滚动（overflow-x-auto）
 * 2. 当设置 maxHeight 时支持垂直滚动
 * 3. 自定义水平滚动条
 * 4. sticky 定位用于固定表头
 */
const StickyScrollTableContainer = React.forwardRef<
  HTMLDivElement,
  StickyScrollTableContainerProps
>(({ className, children, minWidth = "2000px", maxHeight, ...props }, ref) => {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const scrollbarRef = React.useRef<HTMLDivElement>(null);
  const scrollbarThumbRef = React.useRef<HTMLDivElement>(null);
  
  // 🔧 使用 ref 而非 state 避免滚动时触发重渲染
  const scrollStateRef = React.useRef({
    scrollLeft: 0,
    scrollWidth: 0,
    clientWidth: 0,
  });
  
  // 只在需要更新 UI 时才触发重渲染
  const [, forceUpdate] = React.useReducer(x => x + 1, 0);

  // 同步滚动位置 - 直接更新 DOM，不触发 React 重渲染
  const syncScrollDirect = React.useCallback(() => {
    if (!scrollRef.current || !scrollbarThumbRef.current) return;
    
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    scrollStateRef.current = { scrollLeft, scrollWidth, clientWidth };
    
    const needsHorizontalScroll = scrollWidth > clientWidth;
    if (!needsHorizontalScroll) {
      scrollbarThumbRef.current.style.display = 'none';
      return;
    }
    
    scrollbarThumbRef.current.style.display = 'block';
    
    // 计算滚动条尺寸 - 直接设置样式
    const thumbWidth = Math.max((clientWidth / scrollWidth) * 100, 10);
    const maxScroll = scrollWidth - clientWidth;
    
    // 🔧 关键修复：简化 thumbLeft 计算，不做边界"吸附"
    // 直接用线性比例计算，避免回弹
    const thumbLeft = maxScroll > 0 
      ? (scrollLeft / maxScroll) * (100 - thumbWidth) 
      : 0;
    
    scrollbarThumbRef.current.style.width = `${thumbWidth}%`;
    scrollbarThumbRef.current.style.marginLeft = `${thumbLeft}%`;
  }, []);

  // 初始化时读取尺寸
  React.useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    // 初始化
    syncScrollDirect();
    forceUpdate(); // 首次渲染后更新滚动条可见性

    // 监听滚动 - 使用 passive 提升性能
    const handleScroll = () => {
      syncScrollDirect();
    };
    scrollEl.addEventListener("scroll", handleScroll, { passive: true });
    
    // 监听窗口大小变化
    const resizeObserver = new ResizeObserver(() => {
      syncScrollDirect();
      forceUpdate();
    });
    resizeObserver.observe(scrollEl);

    return () => {
      scrollEl.removeEventListener("scroll", handleScroll);
      resizeObserver.disconnect();
    };
  }, [syncScrollDirect]);

  // 判断是否需要滚动条（用于条件渲染）
  const needsHorizontalScroll = scrollStateRef.current.scrollWidth > scrollStateRef.current.clientWidth;

  // 处理自定义滚动条点击
  const handleScrollbarClick = (e: React.MouseEvent) => {
    if (!scrollbarRef.current || !scrollRef.current) return;
    
    const rect = scrollbarRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const { scrollWidth, clientWidth } = scrollStateRef.current;
    const newScrollLeft = percentage * (scrollWidth - clientWidth);
    scrollRef.current.scrollLeft = newScrollLeft;
  };

  // 处理滚动条拖动
  const handleThumbMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!scrollRef.current || !scrollbarRef.current) return;
    
    const startX = e.clientX;
    const startScrollLeft = scrollRef.current.scrollLeft;
    const { scrollWidth, clientWidth } = scrollStateRef.current;
    const trackWidth = scrollbarRef.current.clientWidth;
    const thumbWidth = Math.max((clientWidth / scrollWidth) * 100, 10);
    const thumbWidthPx = (thumbWidth / 100) * trackWidth;
    const scrollableTrackWidth = trackWidth - thumbWidthPx;
    const scrollableContentWidth = scrollWidth - clientWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const scrollDelta = scrollableTrackWidth > 0 
        ? (deltaX / scrollableTrackWidth) * scrollableContentWidth 
        : 0;
      if (scrollRef.current) {
        scrollRef.current.scrollLeft = Math.max(
          0,
          Math.min(scrollableContentWidth, startScrollLeft + scrollDelta)
        );
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  return (
    <div 
      ref={ref} 
      className={cn("relative flex flex-col", className)} 
      {...props}
    >
      {/* 
        支持水平滚动和可选的垂直滚动
        overflow-x-auto: 水平滚动
        overflow-y-auto: 当有 maxHeight 时启用垂直滚动
      */}
      <div
        ref={scrollRef}
        className="border rounded-lg rounded-b-none overflow-x-auto overflow-y-auto"
        style={maxHeight ? { maxHeight } : undefined}
        data-spa-scroll-root="sticky-table"
      >
        {/* minWidth 容器确保表格有足够宽度触发水平滚动 */}
        <div style={{ minWidth }}>
          {children}
        </div>
      </div>

      {/* 自定义水平滚动条 - 固定在表格底部 */}
      {needsHorizontalScroll && (
        <div 
          ref={scrollbarRef}
          className="h-3 bg-muted/50 border border-t-0 rounded-b-lg cursor-pointer flex-shrink-0"
          onClick={handleScrollbarClick}
        >
          <div 
            ref={scrollbarThumbRef}
            className="h-full bg-border hover:bg-muted-foreground/30 rounded-full transition-colors cursor-grab active:cursor-grabbing"
            onMouseDown={handleThumbMouseDown}
          />
        </div>
      )}
    </div>
  );
});
StickyScrollTableContainer.displayName = "StickyScrollTableContainer";

export { StickyScrollTableContainer };
