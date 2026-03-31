import React, { useEffect, useRef } from "react";

import { cx } from "../../utils/shared";

const Bubble = ({ role, children }) => {
  const me = role === "user";
  const containerRef = useRef(null);
  const maxHeightRef = useRef(0);

  useEffect(() => {
    if (!containerRef.current) return;

    const timeoutId = setTimeout(() => {
      if (!containerRef.current) return;

      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const currentHeight = entry.contentRect.height;

          if (currentHeight > 10 && currentHeight > maxHeightRef.current) {
            maxHeightRef.current = currentHeight;
            const bufferHeight = Math.floor(currentHeight * 0.98);
            containerRef.current.style.minHeight = `${bufferHeight}px`;
          }
        }
      });

      if (containerRef.current) {
        resizeObserver.observe(containerRef.current);
      }

      return () => {
        resizeObserver.disconnect();
      };
    }, 50);

    return () => {
      clearTimeout(timeoutId);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={cx("flex w-full", me ? "justify-end" : "justify-start")}
      style={{
        transition: "min-height 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
        willChange: "min-height",
      }}
    >
      <div
        className={cx(
          "max-w-[85%] rounded-[2rem] px-5 py-3.5 text-[15px] leading-relaxed shadow-sm whitespace-pre-wrap transition-all duration-200",
          me ? "bg-black text-white" : "bg-white text-gray-900 border border-gray-100"
        )}
        style={{
          contain: "layout style",
        }}
      >
        {children}
      </div>
    </div>
  );
};

export default Bubble;
