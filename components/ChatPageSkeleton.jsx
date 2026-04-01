import React from 'react';

function SkeletonBlock({ className = '', style = {} }) {
  return <div className={`skeleton-shimmer ${className}`.trim()} style={style} />;
}

function ChatPageSkeletonBody() {
  return (
    <div className="relative flex h-screen overflow-hidden bg-[#FBF7F0] text-gray-900 animate-fade-in-fast">
      <div className="absolute inset-0 opacity-80" style={{ background: 'radial-gradient(circle at top, rgba(255,255,255,0.95), rgba(250,242,231,0.88) 50%, rgba(244,233,220,0.78))' }} />
      <div className="absolute inset-0 opacity-60" style={{ background: 'linear-gradient(120deg, rgba(217,119,87,0.06), transparent 32%, rgba(120,140,93,0.08) 68%, rgba(255,255,255,0.35))' }} />

      <aside
        className="relative hidden h-full flex-col overflow-hidden border-r border-[#E8DED0] bg-[#F6EEE3]/78 lg:flex"
        style={{ width: 240, minWidth: 240 }}
      >
        <div className="flex items-center gap-3 px-4 pt-20">
          <SkeletonBlock className="h-11 w-11 flex-shrink-0 rounded-2xl" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <SkeletonBlock className="h-4 w-24 rounded-md" />
            <SkeletonBlock className="h-3 w-16 rounded-md" />
          </div>
        </div>

        <div className="mt-6 px-4">
          <SkeletonBlock className="h-10 w-full rounded-2xl" />
        </div>

        <div className="mt-5 flex-1 overflow-hidden px-3">
          <div className="mb-3 px-1">
            <SkeletonBlock className="h-3 w-14 rounded-full" />
          </div>
          <div className="space-y-3">
            {[84, 62, 76, 55].map((w, i) => (
              <div key={i} className="rounded-[20px] border border-white/50 bg-white/55 px-3 py-3 shadow-sm">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <SkeletonBlock className="h-3.5 rounded-md" style={{ width: `${w}%` }} />
                  <SkeletonBlock className="h-5 w-5 rounded-full" />
                </div>
                <SkeletonBlock className="h-3 w-20 rounded-full" />
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-[#E8DED0] p-4">
          <div className="mb-3 flex items-center gap-2">
            <SkeletonBlock className="h-9 w-9 flex-shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <SkeletonBlock className="h-3.5 w-20 rounded-md" />
              <SkeletonBlock className="h-3 w-16 rounded-md" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <SkeletonBlock className="h-8 rounded-2xl" />
            <SkeletonBlock className="h-8 rounded-2xl" />
          </div>
        </div>
      </aside>

      <div className="relative flex flex-1 flex-col">
        <header className="fixed top-16 left-0 right-0 z-30 bg-[#FBF7F0]/88 backdrop-blur-md lg:left-[240px]">
          <div className="flex h-14 items-center justify-between px-4">
            <div className="flex items-center gap-3">
              <SkeletonBlock className="h-8 w-8 rounded-2xl lg:hidden" />
              <SkeletonBlock className="h-8 w-40 rounded-2xl" />
            </div>
            <div className="flex items-center gap-2">
              <SkeletonBlock className="h-9 w-9 rounded-2xl" />
              <SkeletonBlock className="hidden sm:block h-9 w-24 rounded-full" />
            </div>
          </div>
        </header>

        <main className="absolute bottom-0 left-0 right-0 top-[120px] z-20 overflow-hidden">
          <div className="mx-auto w-full max-w-4xl px-4 pt-4">
            <section className="flex min-h-[calc(100vh-220px)] flex-col justify-center">
              <div className="mx-auto mb-8 w-full max-w-3xl">
                <div className="rounded-[32px] border border-white/60 bg-white/72 p-5 shadow-[0_22px_60px_rgba(72,52,33,0.08)] backdrop-blur-sm sm:p-7">
                  <div className="mb-6 flex items-start gap-4">
                    <SkeletonBlock className="h-14 w-14 flex-shrink-0 rounded-[24px]" />
                    <div className="min-w-0 flex-1">
                      <SkeletonBlock className="mb-3 h-6 w-40 rounded-full" />
                      <SkeletonBlock className="mb-2 h-4 w-[78%] rounded-full" />
                      <SkeletonBlock className="h-4 w-[62%] rounded-full" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[1, 2, 3, 4].map((item) => (
                      <div key={item} className="rounded-[22px] border border-[#F2E7DA] bg-[#FFFDF9] p-3">
                        <SkeletonBlock className="mb-3 h-8 w-8 rounded-2xl" />
                        <SkeletonBlock className="mb-2 h-3.5 w-[82%] rounded-full" />
                        <SkeletonBlock className="h-3 w-[58%] rounded-full" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mx-auto w-full max-w-2xl px-2">
                <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {[0, 1].map((card) => (
                    <div key={card} className="rounded-[24px] border border-[#EFE3D5] bg-white/70 p-4 shadow-sm">
                      <SkeletonBlock className="mb-3 h-4 w-[44%] rounded-full" />
                      <SkeletonBlock className="mb-2 h-3.5 w-[86%] rounded-full" />
                      <SkeletonBlock className="h-3.5 w-[64%] rounded-full" />
                    </div>
                  ))}
                </div>

                <div className="rounded-full border border-[#E6DCCF] bg-white/86 p-1.5 shadow-[0_16px_40px_rgba(39,28,16,0.08)]">
                  <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                    <div className="min-h-[32px] px-4 flex items-center">
                      <SkeletonBlock className="h-4 w-40 rounded-full" />
                    </div>
                    <SkeletonBlock className="h-11 w-11 rounded-full" />
                  </div>
                </div>
                <div className="mt-3 flex justify-center">
                  <SkeletonBlock className="h-3 w-44 rounded-full" />
                </div>
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function ChatPageSkeleton({ overlay = false }) {
  if (overlay) {
    return (
      <div className="fixed inset-0 z-[40] overflow-hidden bg-[#FBF7F0]">
        <ChatPageSkeletonBody />
      </div>
    );
  }

  return <ChatPageSkeletonBody />;
}
