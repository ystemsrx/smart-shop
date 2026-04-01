import React from 'react';

function SkeletonBlock({ className = '', style = {} }) {
  return <div className={`skeleton-shimmer ${className}`.trim()} style={style} />;
}

function ChatSidebarSkeleton() {
  return (
    <aside
      className="relative hidden h-full flex-col overflow-hidden border-r border-gray-100 bg-gray-50/70 backdrop-blur lg:flex"
      style={{ width: 240, minWidth: 240 }}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-2 px-4 pt-20">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <SkeletonBlock className="h-10 w-10 flex-shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <SkeletonBlock className="h-4 w-24 rounded-md" />
              <SkeletonBlock className="h-3 w-16 rounded-md" />
            </div>
          </div>
          <SkeletonBlock className="h-9 w-9 flex-shrink-0 rounded-lg" />
        </div>

        <div className="mt-4 px-4">
          <SkeletonBlock className="h-3 w-12 rounded-full" />
        </div>

        <div className="mt-2 flex-1 overflow-hidden px-2 pb-4">
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((item) => (
              <div key={item} className="rounded-xl px-3 py-2">
                <SkeletonBlock className="mb-2 h-4 w-[82%] rounded-md" />
                <SkeletonBlock className="h-3 w-14 rounded-md" />
              </div>
            ))}
          </div>
        </div>

        <div className="mb-[120px] border-t border-gray-100 p-4">
          <div className="flex items-center gap-2">
            <SkeletonBlock className="h-9 w-9 flex-shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <SkeletonBlock className="h-3.5 w-20 rounded-md" />
              <SkeletonBlock className="h-3 w-14 rounded-md" />
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function ChatHeaderSkeleton() {
  return (
    <header
      className="fixed top-16 left-0 right-0 z-30 bg-white lg:left-[240px]"
    >
      <div className="flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-2 min-w-0">
          <SkeletonBlock className="h-9 w-9 rounded-lg lg:hidden" />
          <SkeletonBlock className="h-8 w-40 rounded-xl" />
        </div>
        <SkeletonBlock className="h-10 w-10 rounded-xl flex-shrink-0" />
      </div>
    </header>
  );
}

function HeroSectionSkeleton() {
  return (
    <section className="flex min-h-[calc(100vh-220px)] flex-col items-center justify-center gap-8 text-center">
      <div className="flex h-12 items-center justify-center">
        <SkeletonBlock className="h-8 w-56 rounded-full" />
      </div>

      <div className="w-full max-w-2xl px-4">
        <div className="rounded-[28px] border border-gray-100 bg-white p-2 shadow-sm">
          <div className="flex items-end gap-2">
            <SkeletonBlock className="h-11 w-11 rounded-2xl flex-shrink-0" />
            <div className="flex-1 rounded-[24px] border border-gray-100 bg-white px-4 py-3">
              <SkeletonBlock className="mb-2 h-4 w-40 rounded-full" />
              <SkeletonBlock className="h-4 w-[64%] rounded-full" />
            </div>
            <SkeletonBlock className="h-11 w-11 rounded-full flex-shrink-0" />
          </div>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <SkeletonBlock key={item} className="h-12 rounded-full" />
          ))}
        </div>
      </div>
    </section>
  );
}

function ConversationSkeleton() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 pt-2 animate-fade-in-fast">
      <div className="space-y-2.5">
        <SkeletonBlock className="h-4 w-[72%] rounded-md" />
        <SkeletonBlock className="h-4 w-[88%] rounded-md" />
        <SkeletonBlock className="h-4 w-[52%] rounded-md" />
      </div>
      <div className="flex justify-end">
        <SkeletonBlock className="h-10 w-36 rounded-2xl" />
      </div>
      <div className="space-y-2.5">
        <SkeletonBlock className="h-4 w-[62%] rounded-md" />
        <SkeletonBlock className="h-4 w-[80%] rounded-md" />
        <SkeletonBlock className="h-4 w-[45%] rounded-md" />
        <SkeletonBlock className="h-4 w-[70%] rounded-md" />
      </div>
      <div className="flex justify-end">
        <SkeletonBlock className="h-10 w-28 rounded-2xl" />
      </div>
      <div className="space-y-2.5">
        <SkeletonBlock className="h-4 w-[76%] rounded-md" />
        <SkeletonBlock className="h-4 w-[56%] rounded-md" />
      </div>
    </div>
  );
}

function BottomInputSkeleton() {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 lg:left-[240px]">
      <div className="mx-auto max-w-4xl bg-white/95 px-4 pb-2 backdrop-blur-sm">
        <div className="rounded-[28px] border border-gray-100 bg-white p-2 shadow-sm">
          <div className="flex items-end gap-2">
            <SkeletonBlock className="h-11 w-11 rounded-2xl flex-shrink-0" />
            <div className="flex-1 rounded-[24px] border border-gray-100 bg-white px-4 py-3">
              <SkeletonBlock className="mb-2 h-4 w-40 rounded-full" />
              <SkeletonBlock className="h-4 w-[58%] rounded-full" />
            </div>
            <SkeletonBlock className="h-11 w-11 rounded-full flex-shrink-0" />
          </div>
        </div>
      </div>
    </div>
  );
}

function ChatPageSkeletonBody({ variant = 'hero' }) {
  const isConversation = variant === 'conversation';

  return (
    <div className="relative flex h-screen overflow-hidden bg-white text-gray-900">
      <ChatSidebarSkeleton />

      <div className="relative flex flex-1 flex-col">
        <ChatHeaderSkeleton />

        <main
          className={`absolute bottom-0 left-0 right-0 top-[120px] overflow-y-auto z-20 ${isConversation ? 'pb-[120px]' : 'pb-4'}`}
          style={{ scrollbarGutter: 'stable' }}
        >
          <div className="mx-auto w-full max-w-4xl px-4 pt-4">
            {isConversation ? <ConversationSkeleton /> : <HeroSectionSkeleton />}
          </div>
        </main>

        {isConversation && <BottomInputSkeleton />}
      </div>
    </div>
  );
}

export default function ChatPageSkeleton({ overlay = false, variant = 'hero' }) {
  if (overlay) {
    return (
      <div className="fixed inset-0 z-[40] overflow-hidden bg-white">
        <ChatPageSkeletonBody variant={variant} />
      </div>
    );
  }

  return <ChatPageSkeletonBody variant={variant} />;
}
