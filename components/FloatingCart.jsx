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
        className="fixed bottom-6 right-6 z-40 w-12 h-12 rounded-full bg-indigo-600 text-white shadow-lg flex items-center justify-center hover:scale-105 transition-transform duration-150 cursor-pointer select-none"
      >
        {/* 购物车图标 */}
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zm10 0c-1.1 0-1.99.9-1.99 2S15.9 22 17 22s2-.9 2-2-.9-2-2-2zM7.17 14h9.66c.75 0 1.41-.41 1.75-1.03l3.58-6.49A1 1 0 0 0 21.25 5H6.31l-.94-2H2v2h2l3.6 7.59-1.35 2.44A2 2 0 0 0 8 18h12v-2H8l1.1-2z"/>
        </svg>

        {/* 红色角标 */}
        {count > 0 && (
          <span
            ref={badgeRef}
            className="cart-badge"
          >
            {count}
          </span>
        )}
      </div>
    </Link>
  );
});

export default FloatingCart;

