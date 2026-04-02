/**
 * PageTransition — Framer Motion wrapper for smooth route transitions.
 * Pure UI component, no business logic.
 */
import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

/** 与 premium-ui-boost-main `PageTransition` 一致（y: ±8） */
const variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

export default function PageTransition({ children, className = "" }: PageTransitionProps) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      variants={variants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={reduceMotion ? { duration: 0 } : { duration: 0.25, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
