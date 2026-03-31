import React from 'react';

/**
 * 管理助手聊天页面骨架屏 — 精确匹配 ChatUI (mode="admin") 的布局结构
 * 与用户版的区别：输入栏包含图片上传按钮，三列栅格布局
 */
export default function AdminChatPageSkeleton() {
  return (
    <div className="relative flex h-screen bg-white text-gray-900 overflow-hidden animate-fade-in-fast">
      {/* ---- 侧边栏 (仅桌面端可见, 240px) ---- */}
      <aside
        className="hidden lg:flex h-full flex-col border-r border-gray-100 bg-gray-50/70 overflow-hidden"
        style={{ width: 240, minWidth: 240 }}
      >
        {/* Logo + 店铺名 */}
        <div className="flex items-center gap-2 pt-20 px-4">
          <div className="skeleton-shimmer h-10 w-10 flex-shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="skeleton-shimmer h-4 w-24 rounded-md" />
            <div className="skeleton-shimmer h-3 w-16 rounded-md" />
          </div>
        </div>

        {/* "Chats" 标签 */}
        <div className="mt-4 px-4">
          <div className="skeleton-shimmer h-3 w-10 rounded-md" />
        </div>

        {/* 聊天列表项 */}
        <div className="mt-2 flex-1 overflow-hidden px-2 space-y-2">
          {[78, 55, 68, 45].map((w, i) => (
            <div key={i} className="rounded-xl px-3 py-2.5 space-y-1.5">
              <div className="skeleton-shimmer h-3.5 rounded-md" style={{ width: `${w}%` }} />
              <div className="skeleton-shimmer h-3 w-14 rounded-md" />
            </div>
          ))}
        </div>

        {/* 底部用户信息 */}
        <div className="border-t border-gray-100 p-4">
          <div className="flex items-center gap-2">
            <div className="skeleton-shimmer h-9 w-9 flex-shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="skeleton-shimmer h-3.5 w-20 rounded-md" />
              <div className="skeleton-shimmer h-3 w-16 rounded-md" />
            </div>
          </div>
        </div>
      </aside>

      {/* ---- 主内容区 ---- */}
      <div className="relative flex flex-1 flex-col">
        {/* 固定头部 (top-16 = Nav高度64px, h-14 = 56px) */}
        <header
          className="fixed top-16 z-30 bg-white left-0 right-0 lg:left-[240px]"
        >
          <div className="flex h-14 items-center justify-between px-4">
            {/* 模型选择器 */}
            <div className="skeleton-shimmer h-7 w-32 rounded-xl" />
            {/* 新对话按钮 */}
            <div className="skeleton-shimmer h-9 w-9 rounded-xl" />
          </div>
        </header>

        {/* 欢迎/Hero 区域 */}
        <main className="absolute left-0 right-0 top-[120px] bottom-0 overflow-hidden z-20">
          <div className="mx-auto w-full max-w-4xl px-4 pt-4">
            <section className="flex min-h-[calc(100vh-220px)] flex-col items-center justify-center gap-8">
              {/* 欢迎文字 */}
              <div className="skeleton-shimmer h-9 w-56 rounded-xl" />

              <div className="w-full max-w-2xl px-4">
                {/* 输入栏 — admin 模式：含图片上传按钮的三列布局 */}
                <div className="mx-auto w-full max-w-3xl">
                  <div className="bg-white border border-gray-300 shadow-sm p-1.5 grid gap-2 items-center rounded-full grid-cols-[auto_1fr_auto]">
                    {/* 图片上传按钮占位 */}
                    <div className="skeleton-shimmer h-8 w-8 rounded-full" />
                    <div className="min-h-[32px] flex items-center px-3">
                      <div className="skeleton-shimmer h-4 w-36 rounded-md" />
                    </div>
                    <div className="skeleton-shimmer h-9 w-9 rounded-full" />
                  </div>
                  {/* 提示文字 */}
                  <div className="mt-2 flex justify-center">
                    <div className="skeleton-shimmer h-3 w-44 rounded-md" />
                  </div>
                </div>

                {/* 建议按钮 */}
                <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="skeleton-shimmer h-11 rounded-full"
                    />
                  ))}
                </div>
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
