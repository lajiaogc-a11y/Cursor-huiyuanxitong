import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { setSpaNavigate } from "@/lib/spaNavigation";

/** 必须放在 BrowserRouter / HashRouter 内部，使全局 spaNavigate 可用 */
export function SpaNavigationBridge() {
  const navigate = useNavigate();
  useEffect(() => {
    setSpaNavigate((to, opts) => {
      navigate(to, { replace: opts?.replace ?? false });
    });
    return () => setSpaNavigate(null);
  }, [navigate]);
  return null;
}
