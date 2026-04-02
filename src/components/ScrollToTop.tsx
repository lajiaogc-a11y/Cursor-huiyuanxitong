import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/** 路由切换后将主窗口滚回顶部（与会员/员工布局的主滚动区无关时仍改善全页体验） */
export function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
