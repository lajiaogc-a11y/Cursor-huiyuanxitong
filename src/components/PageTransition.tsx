import { ReactNode } from "react";
import { useLocation } from "react-router-dom";

interface PageTransitionProps {
  children: ReactNode;
}

/**
 * Premium page transition — scale + fade enter animation.
 * CSS-only, GPU-accelerated, no state-driven toggling.
 */
export function PageTransition({ children }: PageTransitionProps) {
  const location = useLocation();

  return (
    <div key={location.pathname} className="animate-page-enter">
      {children}
    </div>
  );
}
