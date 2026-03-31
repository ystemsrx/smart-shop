import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";

import { cx } from "../../utils/shared";

const ThinkingBubble = ({ content, isComplete = false, isStopped = false, thinkingDuration = null }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [startTime] = useState(Date.now());
  const [elapsedTime, setElapsedTime] = useState(thinkingDuration || 0);

  useEffect(() => {
    if (thinkingDuration !== null) {
      setElapsedTime(thinkingDuration);
      return;
    }

    if (isComplete || isStopped) {
      setElapsedTime((Date.now() - startTime) / 1000);
    } else {
      const timer = setInterval(() => {
        setElapsedTime((Date.now() - startTime) / 1000);
      }, 100);
      return () => clearInterval(timer);
    }
  }, [isComplete, isStopped, startTime, thinkingDuration]);

  const containerClassName = cx(
    "inline-flex max-w-[80%] flex-col items-start rounded-2xl border border-gray-100 bg-gray-50 text-sm leading-relaxed text-gray-500 shadow-sm transition-all",
    isExpanded ? "w-full px-4 py-3" : "px-3 py-2"
  );

  const handleContainerClick = (event) => {
    if (!isExpanded) {
      event.stopPropagation();
      setIsExpanded(true);
    }
  };

  const handleHeaderClick = (event) => {
    if (isExpanded) {
      event.stopPropagation();
      setIsExpanded(false);
    }
  };

  return (
    <div className="flex w-full justify-start">
      <div
        className={containerClassName}
        onClick={handleContainerClick}
        style={{ cursor: isExpanded ? "default" : "pointer" }}
      >
        <div
          onClick={handleHeaderClick}
          className={cx(
            "inline-flex items-center gap-2 text-[11px] font-semibold tracking-wide text-gray-400 transition-colors w-full select-none",
            isExpanded ? "hover:text-gray-600 cursor-pointer" : ""
          )}
          style={{ userSelect: "none", WebkitUserSelect: "none", MozUserSelect: "none", msUserSelect: "none" }}
        >
          {!isComplete && !isStopped && (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="flex-shrink-0"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
              </svg>
            </motion.div>
          )}
          <span className="normal-case">
            {isStopped ? "Stopped thinking" : isComplete ? (elapsedTime > 0 ? `Thought for ${elapsedTime.toFixed(1)}s` : "Thought") : "Thinking"}
          </span>
          <motion.span
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="flex items-center"
          >
            <ChevronDown size={14} strokeWidth={2.5} />
          </motion.span>
        </div>
        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              key="thinking-details"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <div className="mt-2 whitespace-pre-wrap break-all text-sm text-gray-500">{(content || "").replace(/^\n+/, "") || "…"}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default ThinkingBubble;
