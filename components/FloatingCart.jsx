import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import Link from 'next/link';

// 悬浮购物车组件（右下角），带角标与抖动/弹跳动画
const FloatingCart = forwardRef(function FloatingCart({ count = 0 }, ref) {
  const iconRef = useRef(null);
  const badgeRef = useRef(null);

  useImperativeHandle(ref, () => ({
    // 获取购物车图标在视口中的位置
    getIconRect: () => iconRef.current?.getBoundingClientRect?.(),
    // 触发购物车图标抖动动画
    shake: () => {
      if (!iconRef.current) return;
      iconRef.current.classList.remove('cart-shake');
      // 重新触发动画
      // eslint-disable-next-line no-unused-expressions
      iconRef.current.offsetWidth; 
      iconRef.current.classList.add('cart-shake');
      // 清理类名
      setTimeout(() => iconRef.current && iconRef.current.classList.remove('cart-shake'), 500);
    },
    // 触发角标弹跳动画
    bounceBadge: () => {
      if (!badgeRef.current) return;
      badgeRef.current.classList.remove('badge-bounce');
      // eslint-disable-next-line no-unused-expressions
      badgeRef.current.offsetWidth;
      badgeRef.current.classList.add('badge-bounce');
      setTimeout(() => badgeRef.current && badgeRef.current.classList.remove('badge-bounce'), 600);
    }
  }));

  return (
    <Link href="/cart" aria-label="前往购物车">
      <div
        ref={iconRef}
        className="fixed bottom-6 right-6 z-40 group cursor-pointer select-none"
      >
        {/* 背景光晕效果 */}
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl blur-lg opacity-60 group-hover:opacity-80 transition-opacity duration-300 scale-110"></div>
        
        {/* 主要购物车图标 */}
        <div className="relative w-14 h-14 bg-gradient-to-br from-blue-500 via-purple-600 to-pink-500 rounded-2xl flex items-center justify-center shadow-2xl transform group-hover:scale-110 transition-all duration-300 ease-out backdrop-blur-sm border border-white/20">
          {/* 购物车图标 */}
          <i className="fas fa-shopping-cart text-white text-lg drop-shadow-sm"></i>
          
          {/* 装饰性边框 */}
          <div className="absolute inset-0 rounded-2xl border-2 border-white/30 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
        </div>

        {/* 数量角标 */}
        {count > 0 && (
          <div
            ref={badgeRef}
            className="absolute -top-2 -right-2 min-w-6 h-6 bg-gradient-to-r from-red-500 to-pink-500 rounded-full flex items-center justify-center shadow-lg border-2 border-white transform group-hover:scale-110 transition-transform duration-300"
          >
            <span className="text-white text-xs font-bold px-1">
              {count > 99 ? '99+' : count}
            </span>
          </div>
        )}

        {/* 脉冲效果（当有商品时） */}
        {count > 0 && (
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-500 to-purple-600 animate-ping opacity-20"></div>
        )}

        {/* 悬停提示 */}
        <div className="absolute bottom-full right-0 mb-2 px-3 py-1 bg-black/80 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap backdrop-blur-sm">
          <span className="flex items-center gap-1">
            <i className="fas fa-shopping-cart"></i>
            {count > 0 ? `购物车 (${count})` : '购物车'}
          </span>
          {/* 小箭头 */}
          <div className="absolute top-full right-4 transform -translate-x-1/2">
            <div className="w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-black/80"></div>
          </div>
        </div>
      </div>
    </Link>
  );
});

export default FloatingCart;

