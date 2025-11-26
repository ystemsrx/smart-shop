import React, { forwardRef, useImperativeHandle, useEffect, useRef } from 'react';
import { motion, useAnimation, AnimatePresence } from 'framer-motion';

// 悬浮购物车组件（右下角），带角标与抖动/弹跳动画
const FloatingCart = forwardRef(function FloatingCart({ count = 0, onClick }, ref) {
  const controls = useAnimation();
  const badgeControls = useAnimation();

  useImperativeHandle(ref, () => ({
    // 获取购物车图标在视口中的位置 (保持兼容性，虽然framer-motion可以直接处理，但外部可能依赖此DOM方法)
    getIconRect: () => {
      const el = document.getElementById('floating-cart-icon');
      return el?.getBoundingClientRect?.();
    },
    // 触发购物车图标抖动动画
    shake: () => {
      controls.start({
        x: [0, -4, 4, -4, 4, 0],
        rotate: [0, -5, 5, -5, 5, 0],
        transition: { duration: 0.5, ease: "easeInOut" }
      });
    },
    // 触发角标弹跳动画
    bounceBadge: () => {
      badgeControls.start({
        scale: [1, 1.5, 1],
        y: [0, -5, 0],
        transition: { duration: 0.4, ease: "easeInOut" }
      });
    }
  }));

  // 监听数量变化，自动触发角标弹跳动画
  const prevCountRef = useRef(count);
  useEffect(() => {
    if (count > 0 && count > prevCountRef.current) {
      // 只触发角标弹跳，抖动由flyToCart动画完成后触发
      badgeControls.start({
        scale: [1, 1.3, 1],
        transition: { duration: 0.3 }
      });
    }
    prevCountRef.current = count;
  }, [count, badgeControls]);

  return (
    <motion.div
      id="floating-cart-icon"
      onClick={onClick}
      initial={{ opacity: 0, y: 50, scale: 0.8 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ 
        type: "spring", 
        stiffness: 260, 
        damping: 20,
        delay: 0.5
      }}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className="fixed bottom-6 right-6 z-40 group cursor-pointer select-none"
    >
        {/* 背景光晕效果 - 改为圆形 */}
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full blur-lg opacity-40 group-hover:opacity-60 transition-opacity duration-500"></div>
        
        {/* 主要购物车图标 - 改为圆形 */}
        <motion.div 
          animate={controls}
          className="relative w-14 h-14 bg-white/80 backdrop-blur-md border border-white/40 rounded-full flex items-center justify-center shadow-xl overflow-hidden"
          style={{
            boxShadow: "0 8px 32px 0 rgba(31, 38, 135, 0.15)"
          }}
        >
          {/* 渐变背景层 */}
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-purple-500/10 to-pink-500/10 opacity-100 group-hover:opacity-100 transition-opacity duration-500"></div>
          
          {/* 购物车图标 */}
          <i className="fas fa-shopping-cart text-transparent bg-clip-text bg-gradient-to-br from-blue-600 to-purple-600 text-xl drop-shadow-sm group-hover:scale-110 transition-transform duration-300"></i>
          
          {/* 装饰性高光 */}
          <div className="absolute -top-10 -left-10 w-20 h-20 bg-white/40 rounded-full blur-xl transform rotate-45 group-hover:translate-x-20 group-hover:translate-y-20 transition-transform duration-1000 ease-in-out"></div>
        </motion.div>

        {/* 数量角标 */}
        <AnimatePresence>
          {count > 0 && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
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

        {/* 悬停提示 */}
        <motion.div 
          initial={{ opacity: 0, x: 10 }}
          whileHover={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2 }}
          className="absolute bottom-full right-0 mb-3 px-3 py-1.5 bg-white/90 backdrop-blur-md text-gray-800 text-xs font-medium rounded-xl shadow-lg border border-white/50 whitespace-nowrap pointer-events-none"
        >
          <span className="flex items-center gap-1.5">
            <i className="fas fa-shopping-bag text-purple-500"></i>
            {count > 0 ? `购物车 (${count})` : '购物车'}
          </span>
          {/* 小箭头 */}
          <div className="absolute top-full right-5 transform -translate-x-1/2 w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-transparent border-t-white/90"></div>
        </motion.div>
    </motion.div>
  );
});

export default FloatingCart;
