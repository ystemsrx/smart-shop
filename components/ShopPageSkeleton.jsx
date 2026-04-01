import React from 'react';

function SkeletonBlock({ className = '', style = {} }) {
  return <div className={`skeleton-shimmer ${className}`.trim()} style={style} />;
}

function ShopPageSkeletonBody() {
  return (
    <div className="pt-16 min-h-screen overflow-x-hidden bg-[#FDFBF7]">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <section className="relative overflow-hidden rounded-[32px] border border-[#F1E7DA] bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.95),_rgba(250,245,238,0.85)_50%,_rgba(244,235,224,0.72))] px-5 py-8 sm:px-8 sm:py-10">
          <div className="absolute inset-0 opacity-60" style={{ background: 'linear-gradient(135deg, rgba(255,107,107,0.06), transparent 40%, rgba(255,217,61,0.08))' }} />
          <div className="relative mx-auto flex max-w-3xl flex-col items-center text-center">
            <SkeletonBlock className="h-12 w-48 rounded-[20px] mb-5" />
            <SkeletonBlock className="h-5 w-full max-w-[560px] rounded-full mb-3" />
            <SkeletonBlock className="h-5 w-[82%] max-w-[440px] rounded-full mb-8" />
            <SkeletonBlock className="h-11 w-56 rounded-full mb-5" />
            <SkeletonBlock className="h-12 w-44 rounded-full" />
          </div>
        </section>

        <div className="mt-8 mb-6">
          <div className="mx-auto w-full md:w-1/2">
            <div className="flex items-center gap-3 rounded-full border border-[#ECE2D6] bg-white px-4 py-3 shadow-sm">
              <SkeletonBlock className="h-5 w-5 rounded-full" />
              <SkeletonBlock className="h-4 flex-1 rounded-full" />
              <SkeletonBlock className="h-5 w-5 rounded-full" />
            </div>
          </div>
        </div>

        <div className="sticky z-30 mb-6" style={{ top: 'calc(64px - 1px)' }}>
          <div className="rounded-[28px] border border-[#EEE4D8] bg-[#FDFBF7]/90 p-2 backdrop-blur-sm">
            <div className="flex gap-2 overflow-hidden">
              {[88, 72, 92, 78, 46].map((w, index) => (
                <SkeletonBlock
                  key={index}
                  className="h-11 shrink-0 rounded-full"
                  style={{ width: index === 4 ? 52 : `${w}px` }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <article
              key={index}
              className="overflow-hidden rounded-[28px] border border-[#EEE4D8] bg-white shadow-[0_16px_40px_rgba(29,24,18,0.05)]"
            >
              <div className="aspect-[4/4.4] p-3">
                <SkeletonBlock className="h-full w-full rounded-[22px]" />
              </div>
              <div className="px-4 pb-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <SkeletonBlock className="h-4 w-[62%] rounded-full" />
                  <SkeletonBlock className="h-5 w-14 rounded-full" />
                </div>
                <SkeletonBlock className="mb-2 h-3.5 w-[84%] rounded-full" />
                <SkeletonBlock className="mb-4 h-3.5 w-[56%] rounded-full" />
                <div className="flex items-center justify-between">
                  <SkeletonBlock className="h-8 w-20 rounded-full" />
                  <SkeletonBlock className="h-10 w-10 rounded-full" />
                </div>
              </div>
            </article>
          ))}
        </div>

        <div className="pointer-events-none fixed bottom-6 right-6 z-30 hidden sm:block">
          <div className="rounded-full border border-[#F5D1C2] bg-white/90 p-1 shadow-[0_10px_30px_rgba(217,119,87,0.15)] backdrop-blur-sm">
            <SkeletonBlock className="h-16 w-16 rounded-full" />
          </div>
        </div>
      </main>
    </div>
  );
}

export default function ShopPageSkeleton({ overlay = false }) {
  if (overlay) {
    return (
      <div className="fixed inset-0 z-[40] overflow-hidden bg-[#FDFBF7]">
        <ShopPageSkeletonBody />
      </div>
    );
  }

  return <ShopPageSkeletonBody />;
}
