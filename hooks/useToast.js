import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 简单的Toast管理hook，支持自动消失
 */
export function useToast(defaultDuration = 3000) {
  const [toast, setToast] = useState({ message: '', visible: false });
  const timerRef = useRef(null);

  const hideToast = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setToast((prev) => ({ ...prev, visible: false }));
  }, []);

  const showToast = useCallback((message, duration = defaultDuration) => {
    if (!message) return;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    setToast({ message, visible: true });
    timerRef.current = setTimeout(() => {
      setToast((prev) => ({ ...prev, visible: false }));
      timerRef.current = null;
    }, duration);
  }, [defaultDuration]);

  useEffect(() => () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
  }, []);

  return { toast, showToast, hideToast };
}
