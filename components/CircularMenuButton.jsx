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

  // 三根杠与容器共用同一条 spring，保证同时落位
  const lineSpring = { type: "spring", stiffness: 400, damping: 30 };
  const colour = isOpen ? colourOpen : colourClose;

  return (
    <motion.button
      onClick={toggle}
      aria-expanded={isOpen}
      aria-label={isOpen ? "关闭菜单" : "打开菜单"}
      className="relative w-12 h-12 rounded-full bg-white shadow-md flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      whileTap={{ scale: 0.92 }}
      transition={lineSpring}
    >
      {/* ===== TOP LINE ===== */}
      <motion.span
        className="absolute w-5 h-0.5 rounded origin-center"
        style={{ backgroundColor: colour }}
        animate={{ y: isOpen ? 0 : -7, rotate: isOpen ? 45 : 0 }}
        transition={lineSpring}
      />

      {/* ===== MIDDLE LINE (collapses) ===== */}
      <motion.span
        className="absolute w-5 h-0.5 rounded origin-center"
        style={{ backgroundColor: colour }}
        animate={{ scaleX: isOpen ? 0 : 1, opacity: isOpen ? 0 : 1 }}
        transition={lineSpring}
      />

      {/* ===== BOTTOM LINE ===== */}
      <motion.span
        className="absolute w-5 h-0.5 rounded origin-center"
        style={{ backgroundColor: colour }}
        animate={{ y: isOpen ? 0 : 7, rotate: isOpen ? -45 : 0 }}
        transition={lineSpring}
      />
    </motion.button>
  );
}
