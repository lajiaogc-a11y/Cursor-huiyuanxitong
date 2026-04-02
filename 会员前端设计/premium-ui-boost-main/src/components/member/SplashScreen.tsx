import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap } from "lucide-react";

export default function SplashScreen({ onComplete }: { onComplete: () => void }) {
  const [phase, setPhase] = useState<"logo" | "expand" | "done">("logo");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("expand"), 1400);
    const t2 = setTimeout(() => {
      setPhase("done");
      onComplete();
    }, 2000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onComplete]);

  return (
    <AnimatePresence>
      {phase !== "done" && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{ background: "hsl(var(--m-bg-1))" }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: "easeInOut" }}
        >
          {/* Ambient glow */}
          <motion.div
            className="absolute w-80 h-80 rounded-full"
            style={{ background: "radial-gradient(circle, hsl(var(--gold) / 0.15), transparent 70%)" }}
            animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0.8, 0.5] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />

          <motion.div className="relative flex flex-col items-center gap-5">
            {/* Logo icon */}
            <motion.div
              className="w-20 h-20 rounded-3xl flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, hsl(var(--gold)), hsl(var(--gold-deep)))",
                boxShadow: "0 8px 40px -8px hsl(var(--gold) / 0.6)",
              }}
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.1 }}
            >
              <Zap className="w-9 h-9 text-[hsl(var(--m-bg-1))]" />
            </motion.div>

            {/* Brand name */}
            <motion.div
              className="text-center"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.5 }}
            >
              <h1 className="text-2xl font-extrabold tracking-tight mb-1">FastGC</h1>
              <motion.p
                className="text-xs font-medium"
                style={{ color: "hsl(var(--gold-soft))" }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8, duration: 0.5 }}
              >
                Your Rewards, Simplified.
              </motion.p>
            </motion.div>

            {/* Loading bar */}
            <motion.div
              className="w-24 h-0.5 rounded-full overflow-hidden mt-2"
              style={{ background: "hsl(var(--m-surface) / 0.3)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.9 }}
            >
              <motion.div
                className="h-full rounded-full"
                style={{ background: "linear-gradient(90deg, hsl(var(--gold)), hsl(var(--gold-soft)))" }}
                initial={{ width: "0%" }}
                animate={{ width: "100%" }}
                transition={{ delay: 1, duration: 0.8, ease: "easeInOut" }}
              />
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
