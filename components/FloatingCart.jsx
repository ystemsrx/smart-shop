import React, { forwardRef, useImperativeHandle, useEffect, useRef } from 'react';
import { motion, useAnimation, AnimatePresence } from 'framer-motion';

// 悬浮购物车组件（右下角），简化版：仅保留简单的悬浮放大动画
const FloatingCart = forwardRef(function FloatingCart({ count = 0, onClick }, ref) {
  const controls = useAnimation();
  const badgeControls = useAnimation();

  useImperativeHandle(ref, () => ({
    // 获取购物车图标在视口中的位置
    getIconRect: () => {
      const el = document.getElementById('floating-cart-icon');
      return el?.getBoundingClientRect?.();
    },
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
  }));

  // 监听数量变化，自动触发角标弹跳动画
  const prevCountRef = useRef(count);
  useEffect(() => {
    if (count > 0 && count > prevCountRef.current) {
      badgeControls.start({
        scale: [1, 1.2, 1],
        transition: { duration: 0.3 }
      });
    }
    prevCountRef.current = count;
  }, [count, badgeControls]);

  return (
    <motion.div
      id="floating-cart-icon"
      onClick={onClick}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
      transition={{ type: "spring", stiffness: 400, damping: 17 }}
      className="fixed bottom-6 right-6 z-40 group cursor-pointer select-none"
    >
        {/* 背景光晕效果 - 静态 */}
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full blur-lg opacity-40 group-hover:opacity-60 transition-opacity duration-300"></div>
        
        {/* 主要购物车图标 */}
        <motion.div 
          animate={controls}
          className="relative w-14 h-14 bg-white/90 backdrop-blur-md border border-white/40 rounded-full flex items-center justify-center shadow-xl overflow-hidden"
        >
          {/* 购物车图标 */}
          <i className="fas fa-shopping-cart text-transparent bg-clip-text bg-gradient-to-br from-blue-600 to-purple-600 text-xl"></i>
        </motion.div>

        {/* 数量角标 */}
        <AnimatePresence>
          {count > 0 && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute -top-1 -right-1 z-50"
            >
              <motion.div
                animate={badgeControls}
                className="min-w-[20px] h-5 px-1.5 bg-gradient-to-r from-red-500 to-pink-600 rounded-full flex items-center justify-center shadow-lg border border-white"
              >
                <span className="text-white text-[10px] font-bold leading-none">
                  {count > 99 ? '99+' : count}
                </span>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
    </motion.div>
  );
});

export default FloatingCart;
