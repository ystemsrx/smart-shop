import React, { useEffect, useRef } from "react";

import MarkdownRenderer from "./MarkdownRenderer";
import {
  preloadCodeIcons,
  resetPythonRuntime,
  warmupPyodideDownload,
} from "./services/pythonRuntime";

export const MarkdownRendererWrapper = ({ content, isStreaming }) => {
  const wrapperRef = useRef(null);
  const maxHeightRef = useRef(0);
  const isStreamingRef = useRef(isStreaming);

  useEffect(() => {
    isStreamingRef.current = isStreaming;
  }, [isStreaming]);

  useEffect(() => {
    if (!wrapperRef.current) return undefined;

    const timeoutId = setTimeout(() => {
      if (!wrapperRef.current) return undefined;

      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const currentHeight = entry.contentRect.height;

          if (currentHeight <= 10) continue;
          const bufferHeight = Math.floor(currentHeight * 0.97);

          if (currentHeight > maxHeightRef.current) {
            maxHeightRef.current = currentHeight;
            wrapperRef.current.style.minHeight = `${bufferHeight}px`;
            continue;
          }

          if (!isStreamingRef.current && currentHeight < maxHeightRef.current - 6) {
            maxHeightRef.current = currentHeight;
            if (wrapperRef.current) {
              wrapperRef.current.style.transition = "none";
              wrapperRef.current.style.minHeight = `${bufferHeight}px`;
              requestAnimationFrame(() => {
                if (wrapperRef.current) {
                  wrapperRef.current.style.transition = "min-height 0.3s cubic-bezier(0.4, 0, 0.2, 1)";
                }
              });
            }
          }
        }
      });

      if (wrapperRef.current) {
        resizeObserver.observe(wrapperRef.current);
      }

      return () => {
        resizeObserver.disconnect();
      };
    }, 80);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [content]);

  return (
    <div
      ref={wrapperRef}
      style={{
        transition: "min-height 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        willChange: "min-height",
        contain: "layout",
      }}
    >
      <MarkdownRenderer content={content} isStreaming={isStreaming} />
    </div>
  );
};

export { preloadCodeIcons, resetPythonRuntime, warmupPyodideDownload };
export default MarkdownRendererWrapper;
