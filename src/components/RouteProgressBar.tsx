import { useEffect, useState, useRef, useCallback } from "react";
import { useLocation } from "react-router-dom";

export function RouteProgressBar() {
  const location = useLocation();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const prevPathRef = useRef(location.pathname);
  const timersRef = useRef<NodeJS.Timeout[]>([]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const addTimer = useCallback((fn: () => void, ms: number) => {
    timersRef.current.push(setTimeout(fn, ms));
  }, []);

  useEffect(() => {
    if (prevPathRef.current !== location.pathname) {
      prevPathRef.current = location.pathname;
      clearTimers();

      // Start
      setFinishing(false);
      setVisible(true);
      setProgress(15);

      // Advance stages
      addTimer(() => setProgress(45), 80);
      addTimer(() => setProgress(75), 200);

      // Complete
      addTimer(() => {
        setProgress(100);
        setFinishing(true);
        addTimer(() => {
          setVisible(false);
          setFinishing(false);
          setProgress(0);
        }, 350);
      }, 300);
    }

    return clearTimers;
  }, [location.pathname, clearTimers, addTimer]);

  if (!visible) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[100] h-[2.5px] pointer-events-none"
      style={{ opacity: finishing ? 0 : 1, transition: "opacity 300ms ease-out" }}
    >
      <div
        className="h-full relative"
        style={{
          width: `${progress}%`,
          transition: "width 300ms cubic-bezier(0.4, 0, 0.2, 1)",
          background: "linear-gradient(90deg, hsl(var(--primary) / 0.3), hsl(var(--primary)), hsl(var(--primary)))",
        }}
      >
        {/* Glow tip */}
        <div
          className="absolute right-0 top-0 h-full w-24"
          style={{
            background: "linear-gradient(90deg, transparent, hsl(var(--primary)))",
            boxShadow: "0 0 14px hsl(var(--primary) / 0.6), 0 0 5px hsl(var(--primary) / 0.4)",
            borderRadius: "0 2px 2px 0",
          }}
        />
      </div>
    </div>
  );
}
