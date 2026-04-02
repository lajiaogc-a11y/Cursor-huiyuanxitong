import { useEffect } from "react";
import { useLocation } from "react-router-dom";

// TODO: unused - verify before delete (no importers in repo; ts-prune)
export function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
