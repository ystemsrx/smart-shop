import React from 'react';

// 页面切换骨架屏 - 路由变化时立即显示，消除切换顿感
export default function PageTransitionSkeleton() {
  return (
    <div className="fixed inset-0 z-[40] bg-gradient-to-b from-gray-50 to-white pt-20 px-4 sm:px-6 lg:px-8 overflow-hidden">
      <div className="max-w-5xl mx-auto space-y-6 animate-fade-in-fast">
        {/* 顶部标题骨架 */}
        <div className="flex items-center gap-4">
          <div className="skeleton-shimmer w-10 h-10 rounded-xl" />
          <div className="space-y-2 flex-1">
            <div className="skeleton-shimmer h-5 w-40 rounded-lg" />
            <div className="skeleton-shimmer h-3 w-24 rounded-md" />
          </div>
        </div>

        {/* 搜索栏骨架 */}
        <div className="skeleton-shimmer h-12 w-full rounded-2xl" />

        {/* 内容卡片骨架 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="rounded-2xl overflow-hidden" style={{ animationDelay: `${i * 60}ms` }}>
              <div className="skeleton-shimmer h-40 w-full" />
              <div className="p-4 space-y-3 bg-white">
                <div className="skeleton-shimmer h-4 w-3/4 rounded-md" />
                <div className="skeleton-shimmer h-3 w-1/2 rounded-md" />
                <div className="flex justify-between items-center">
                  <div className="skeleton-shimmer h-5 w-16 rounded-md" />
                  <div className="skeleton-shimmer h-8 w-8 rounded-full" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
