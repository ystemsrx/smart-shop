import React from 'react';

function SkeletonBlock({ className = '', style = {} }) {
  return <div className={`skeleton-shimmer ${className}`.trim()} style={style} />;
}

function AdminChatPageSkeletonBody() {
  return (
    <div className="relative flex h-screen overflow-hidden bg-[#F6F8FB] text-gray-900 animate-fade-in-fast">
      <div className="absolute inset-0 opacity-70" style={{ background: 'radial-gradient(circle at top left, rgba(255,255,255,0.98), rgba(238,244,250,0.9) 46%, rgba(225,234,245,0.86))' }} />
      <div className="absolute inset-0 opacity-70" style={{ background: 'linear-gradient(140deg, rgba(59,130,246,0.06), transparent 34%, rgba(16,185,129,0.06) 72%, rgba(255,255,255,0.3))' }} />

      <aside
        className="relative hidden h-full flex-col overflow-hidden border-r border-[#DDE6F1] bg-[#EEF3F8]/82 lg:flex"
        style={{ width: 240, minWidth: 240 }}
      >
        <div className="flex items-center gap-3 px-4 pt-20">
          <SkeletonBlock className="h-11 w-11 flex-shrink-0 rounded-2xl" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <SkeletonBlock className="h-4 w-24 rounded-md" />
            <SkeletonBlock className="h-3 w-16 rounded-md" />
          </div>
        </div>

        <div className="mt-5 px-4">
          <SkeletonBlock className="h-10 w-full rounded-2xl" />
        </div>

        <div className="mt-5 flex-1 overflow-hidden px-3">
          <div className="mb-3 px-1">
            <SkeletonBlock className="h-3 w-16 rounded-full" />
          </div>
          <div className="space-y-3">
            {[82, 60, 73, 48].map((w, i) => (
              <div key={i} className="rounded-[20px] border border-white/55 bg-white/60 px-3 py-3 shadow-sm">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <SkeletonBlock className="h-3.5 rounded-md" style={{ width: `${w}%` }} />
                  <SkeletonBlock className="h-5 w-10 rounded-full" />
                </div>
                <SkeletonBlock className="h-3 w-24 rounded-full" />
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-[#DDE6F1] p-4">
          <div className="mb-3 grid grid-cols-2 gap-2">
            <SkeletonBlock className="h-8 rounded-2xl" />
            <SkeletonBlock className="h-8 rounded-2xl" />
          </div>
          <div className="rounded-[20px] border border-white/60 bg-white/62 p-3">
            <SkeletonBlock className="mb-2 h-3.5 w-24 rounded-full" />
            <SkeletonBlock className="h-3 w-16 rounded-full" />
          </div>
        </div>
      </aside>

      <div className="relative flex flex-1 flex-col">
        <header className="fixed top-16 left-0 right-0 z-30 bg-[#F6F8FB]/86 backdrop-blur-md lg:left-[240px]">
          <div className="flex h-14 items-center justify-between px-4">
            <div className="flex items-center gap-3">
              <SkeletonBlock className="h-8 w-8 rounded-2xl lg:hidden" />
              <SkeletonBlock className="h-8 w-32 rounded-2xl" />
              <SkeletonBlock className="hidden sm:block h-8 w-24 rounded-full" />
            </div>
            <div className="flex items-center gap-2">
              <SkeletonBlock className="hidden sm:block h-9 w-24 rounded-full" />
              <SkeletonBlock className="h-9 w-9 rounded-2xl" />
            </div>
          </div>
        </header>

        <main className="absolute bottom-0 left-0 right-0 top-[120px] z-20 overflow-hidden">
          <div className="mx-auto w-full max-w-5xl px-4 pt-4">
            <section className="flex min-h-[calc(100vh-220px)] flex-col justify-center">
              <div className="mb-7 grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
                <div className="rounded-[30px] border border-white/65 bg-white/78 p-5 shadow-[0_20px_60px_rgba(42,62,92,0.08)] backdrop-blur-sm sm:p-6">
                  <div className="mb-5 flex items-start gap-4">
                    <SkeletonBlock className="h-14 w-14 flex-shrink-0 rounded-[24px]" />
                    <div className="min-w-0 flex-1">
                      <SkeletonBlock className="mb-3 h-6 w-44 rounded-full" />
                      <SkeletonBlock className="mb-2 h-4 w-[78%] rounded-full" />
                      <SkeletonBlock className="h-4 w-[58%] rounded-full" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {[0, 1, 2].map((card) => (
                      <div key={card} className="rounded-[22px] border border-[#E8EEF6] bg-[#FAFCFF] p-4">
                        <SkeletonBlock className="mb-3 h-8 w-8 rounded-2xl" />
                        <SkeletonBlock className="mb-2 h-3.5 w-[78%] rounded-full" />
                        <SkeletonBlock className="h-3 w-[56%] rounded-full" />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-4">
                  {[0, 1].map((card) => (
                    <div key={card} className="rounded-[28px] border border-white/65 bg-white/72 p-4 shadow-sm">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <SkeletonBlock className="h-4 w-24 rounded-full" />
                        <SkeletonBlock className="h-7 w-16 rounded-full" />
                      </div>
                      <SkeletonBlock className="mb-2 h-3.5 w-[88%] rounded-full" />
                      <SkeletonBlock className="mb-2 h-3.5 w-[72%] rounded-full" />
                      <SkeletonBlock className="h-3.5 w-[54%] rounded-full" />
                    </div>
                  ))}
                </div>
              </div>

              <div className="mx-auto w-full max-w-3xl">
                <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {[0, 1].map((card) => (
                    <div key={card} className="rounded-[24px] border border-[#E6EDF5] bg-white/72 p-4">
                      <SkeletonBlock className="mb-3 h-4 w-[46%] rounded-full" />
                      <SkeletonBlock className="mb-2 h-3.5 w-[88%] rounded-full" />
                      <SkeletonBlock className="h-3.5 w-[66%] rounded-full" />
                    </div>
                  ))}
                </div>

                <div className="rounded-full border border-[#DCE6F1] bg-white/88 p-1.5 shadow-[0_16px_40px_rgba(59,130,246,0.08)]">
                  <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
                    <SkeletonBlock className="h-10 w-10 rounded-full" />
                    <div className="min-h-[32px] px-2 flex items-center">
                      <SkeletonBlock className="h-4 w-44 rounded-full" />
                    </div>
                    <SkeletonBlock className="h-11 w-11 rounded-full" />
                  </div>
                </div>
                <div className="mt-3 flex justify-center">
                  <SkeletonBlock className="h-3 w-48 rounded-full" />
                </div>
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function AdminChatPageSkeleton({ overlay = false }) {
  if (overlay) {
    return (
      <div className="fixed inset-0 z-[40] overflow-hidden bg-[#F6F8FB]">
        <AdminChatPageSkeletonBody />
      </div>
    );
  }

  return <AdminChatPageSkeletonBody />;
}
