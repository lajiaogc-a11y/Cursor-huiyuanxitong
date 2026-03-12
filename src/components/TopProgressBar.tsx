/**
 * 顶部细进度条 - 作为 Suspense fallback 使用
 * 挂载时开始进度，卸载时完成（懒加载 chunk 加载完成即卸载）
 */
import { useEffect } from 'react';
import NProgress from 'nprogress';

NProgress.configure({
  showSpinner: false,
  minimum: 0.08,
  easing: 'ease',
  speed: 200,
  trickleSpeed: 200,
});

export function TopProgressBar() {
  useEffect(() => {
    NProgress.start();
    return () => NProgress.done();
  }, []);
  return null;
}
