import { useEffect, useRef } from "react";
import { MEMBER_PULL_REFRESH_EVENT } from "@/lib/memberPullRefreshEvent";

/**
 * 会员端下拉刷新完成后会派发 MEMBER_PULL_REFRESH_EVENT。
 * 使用 ref 保存最新回调，避免子组件重复订阅或依赖数组导致重复绑定。
 */
export function useMemberPullRefreshSignal(onPullRefresh: () => void) {
  const cb = useRef(onPullRefresh);
  cb.current = onPullRefresh;

  useEffect(() => {
    const handler = () => {
      cb.current();
    };
    window.addEventListener(MEMBER_PULL_REFRESH_EVENT, handler);
    return () => window.removeEventListener(MEMBER_PULL_REFRESH_EVENT, handler);
  }, []);
}
