import { useIsFetching } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";

export function BackgroundUpdateIndicator() {
  const isFetching = useIsFetching();
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (isFetching) {
      timerRef.current = setTimeout(() => setVisible(true), 800);
    } else {
      clearTimeout(timerRef.current);
      setVisible(false);
    }
    return () => clearTimeout(timerRef.current);
  }, [isFetching]);

  if (!visible) return null;

  return (
    <div className="fixed top-[2px] left-0 right-0 z-[99] h-[1.5px] overflow-hidden pointer-events-none">
      <div className="h-full w-full animate-shimmer-slide" />
    </div>
  );
}
