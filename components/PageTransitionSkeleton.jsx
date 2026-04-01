import React from 'react';

// 页面切换骨架屏 - 路由变化时立即显示，消除切换顿感
export default function PageTransitionSkeleton() {
  return (
    <div className="fixed inset-0 z-[40] bg-[#FDFBF7] pt-24 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="space-y-5 animate-fade-in-fast">
          <div className="skeleton-shimmer h-5 w-[85%] rounded-full" />
          <div className="skeleton-shimmer h-5 w-[55%] rounded-full" />
          <div className="skeleton-shimmer h-5 w-[70%] rounded-full" />
          <div className="skeleton-shimmer h-5 w-[40%] rounded-full" />
        </div>
      </div>
    </div>
  );
}
