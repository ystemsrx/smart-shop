import { useCallback, useRef } from "react";

export const useSmartAutoScroll = () => {
  const endRef = useRef(null);
  const containerRef = useRef(null);
  return { endRef, containerRef };
};

export const useId = () => {
  const counterRef = useRef(0);
  return useCallback(() => ++counterRef.current, []);
};
