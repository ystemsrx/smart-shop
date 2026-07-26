import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { motion, useAnimation, AnimatePresence } from 'framer-motion';

// 悬浮购物车组件（右下角），简化版：仅保留简单的悬浮放大动画
const FloatingCart = forwardRef(function FloatingCart({ count = 0, onClick }, ref) {
  const controls = useAnimation();
  const badgeControls = useAnimation();
  const rootRef = useRef(null);
  // 仅在支持 hover 的设备上启用悬浮放大，避免触屏粘滞
  const [canHover] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches
  ));

  useImperativeHandle(ref, () => ({
    // 获取购物车图标在视口中的位置
    getIconRect: () => rootRef.current?.getBoundingClientRect?.(),
    // 触发购物车图标抖动动画 (保留接口以防调用报错，但可简化效果)
    shake: () => {
      controls.start({
        x: [0, -4, 4, -4, 4, 0],
        transition: { duration: 0.4 }
      });
    },
    // 触发角标弹跳动画
    bounceBadge: () => {
      badgeControls.start({
        scale: [1, 1.2, 1],
        transition: { duration: 0.3 }
      });
    }
  }), [controls, badgeControls]);

  return (
    <motion.button
      type="button"
      aria-label="打开购物车"
      id="floating-cart-icon"
      ref={rootRef}
      onClick={onClick}
      whileHover={canHover ? { scale: 1.06 } : undefined}
      whileTap={{ scale: 0.95 }}
      transition={{ type: "spring", stiffness: 400, damping: 17 }}
      className="fixed bottom-6 right-6 z-40 group cursor-pointer select-none"
    >
        {/* 主要购物车图标 */}
        <motion.div
          animate={controls}
          className="relative w-14 h-14 bg-primary hover:bg-primary-deep transition-colors rounded-full flex items-center justify-center shadow-lg"
        >
          <i className="fas fa-shopping-cart text-white text-lg"></i>
        </motion.div>

        {/* 数量角标 */}
        <AnimatePresence>
          {count > 0 && (
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              style={{ transformOrigin: 'center' }}
              className="absolute -top-1 -right-1 z-50"
            >
              <motion.div
                animate={badgeControls}
                className="min-w-[20px] h-5 px-1.5 bg-white rounded-full flex items-center justify-center shadow-md border border-primary/20"
              >
                <span className="text-primary text-[10px] font-bold leading-none">
                  {count > 99 ? '99+' : count}
                </span>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
    </motion.button>
  );
});

export default FloatingCart;
