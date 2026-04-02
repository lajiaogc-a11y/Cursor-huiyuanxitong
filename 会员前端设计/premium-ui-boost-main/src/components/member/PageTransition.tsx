import { forwardRef } from "react";
import { motion } from "framer-motion";

const PageTransition = forwardRef<HTMLDivElement, { children: React.ReactNode }>(
  ({ children }, ref) => {
    return (
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
      >
        {children}
      </motion.div>
    );
  }
);

PageTransition.displayName = "PageTransition";
export default PageTransition;
