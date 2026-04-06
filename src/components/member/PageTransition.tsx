/**
 * PageTransition — Framer Motion wrapper for route transitions.
 * 轻量位移 + 极轻淡变，避免整页从透明「先藏再显」造成闪屏。
 */
import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** 与 animate 接近，退场时内容仍基本连续，不整块变黑/变白 */
const variants = {
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0.96, y: -3 },
};

export default function PageTransition({ children, className = "" }: PageTransitionProps) {
  const reduceMotion = useReducedMotion();
  const duration = reduceMotion ? 0 : 0.2;

  return (
    <motion.div
      variants={variants}
      /** 进入页不再从 opacity:0 起步，避免与 Suspense/路由叠成明显闪烁 */
      initial={false}
      animate="animate"
      exit="exit"
      transition={{ duration, ease: EASE_OUT }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
