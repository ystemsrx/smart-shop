import React, { useState } from "react";
import { motion } from "framer-motion";

export default function CircularMenuButton({
  isOpen: controlledOpen,
  onToggle,
  colourOpen = "black",
  colourClose = "black",
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;

  const toggle = () => {
    if (isControlled) {
      onToggle?.(!controlledOpen);
    } else {
      setInternalOpen((o) => !o);
      onToggle?.(!internalOpen);
    }
  };

  const lineSpring = { type: "spring", stiffness: 460, damping: 30 };
  const colour = isOpen ? colourOpen : colourClose;

  return (
    <motion.button
      onClick={toggle}
      aria-pressed={isOpen}
      aria-label={isOpen ? "关闭菜单" : "打开菜单"}
      // — Base style —
      className="relative w-12 h-12 rounded-full shadow-md flex items-center justify-center focus:outline-none"
      // — Interactive motions —
      whileHover={{ scale: 1.08, boxShadow: "0 0 0.75rem rgba(0,0,0,.25)" }}
      whileTap={{ scale: 0.92, boxShadow: "0 0 0.25rem rgba(0,0,0,.35)" }}
      animate={{ rotate: isOpen ? 90 : 0, backgroundColor: isOpen ? "#ffffff" : "#ffffff" }}
      transition={{ type: "spring", stiffness: 300, damping: 24 }}
    >
      {/* ===== TOP LINE ===== */}
      <motion.span
        className="absolute w-6 h-0.5 rounded origin-center"
        style={{ backgroundColor: colour }}
        animate={{ y: isOpen ? 0 : -8, rotate: isOpen ? 45 : 0 }}
        transition={lineSpring}
      />

      {/* ===== MIDDLE LINE (collapses) ===== */}
      <motion.span
        className="absolute w-6 h-0.5 rounded origin-center"
        style={{ backgroundColor: colour }}
        animate={{ scaleX: isOpen ? 0 : 1, opacity: isOpen ? 0 : 1 }}
        transition={{ scaleX: { duration: 0.24 }, opacity: { duration: 0.22 } }}
      />

      {/* ===== BOTTOM LINE ===== */}
      <motion.span
        className="absolute w-6 h-0.5 rounded origin-center"
        style={{ backgroundColor: colour }}
        animate={{ y: isOpen ? 0 : 8, rotate: isOpen ? -45 : 0 }}
        transition={lineSpring}
      />
    </motion.button>
  );
}
