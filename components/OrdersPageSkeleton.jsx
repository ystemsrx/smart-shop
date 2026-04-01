import React from 'react';

function SkeletonBlock({ className = '', style = {} }) {
  return <div className={`skeleton-shimmer ${className}`.trim()} style={style} />;
}

function OrdersCardSkeleton() {
  return (
    <section
      className="w-full min-w-0 rounded-2xl p-5 sm:p-6"
      style={{ background: '#FFFFFF', border: '1px solid #E8E2D8' }}
    >
      <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
        <div className="flex min-w-0 items-center gap-3">
          <SkeletonBlock className="h-7 w-20 rounded-full" />
          <SkeletonBlock className="h-4 w-24 rounded-md" />
        </div>
        <div className="flex w-full min-w-0 items-center justify-between gap-3 sm:w-auto sm:justify-start">
          <SkeletonBlock className="h-4 w-28 max-w-[45vw] rounded-md sm:w-36 sm:max-w-none" />
          <SkeletonBlock className="h-7 w-24 flex-shrink-0 rounded-lg" />
        </div>
      </div>

      <div className="mb-6 overflow-hidden px-1 sm:px-2">
        <div className="relative flex items-start justify-between">
          <div className="absolute left-0 right-0 top-1 h-px border-t border-dashed" style={{ borderColor: '#E8E2D8' }}></div>
          {[0, 1, 2, 3, 4].map((step) => (
            <div key={step} className="relative z-10 flex min-w-0 flex-col items-center">
              <SkeletonBlock className="h-2.5 w-2.5 rounded-full" />
              <SkeletonBlock className="mt-2 h-3 w-7 rounded-md sm:w-9" />
            </div>
          ))}
        </div>
      </div>

      <div
        className="flex flex-col sm:flex-row gap-5 items-start sm:items-center justify-between rounded-2xl p-4"
        style={{ background: '#FAF9F5', border: '1px solid #F5F2ED' }}
      >
        <div className="flex-1">
          <SkeletonBlock className="h-7 w-24 rounded-md mb-3" />
          <SkeletonBlock className="h-4 w-32 rounded-md" />
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <SkeletonBlock className="h-10 flex-1 sm:w-20 rounded-xl" />
          <SkeletonBlock className="h-10 flex-1 sm:w-24 rounded-xl" />
        </div>
      </div>
    </section>
  );
}

function OrdersPageSkeletonBody() {
  return (
    <main className="max-w-5xl mx-auto w-full min-w-0 overflow-x-hidden px-4 sm:px-6 lg:px-8">
      <div className="mb-10 mt-4">
        <SkeletonBlock className="h-11 w-40 rounded-2xl mb-4" />
        <SkeletonBlock className="h-5 w-48 rounded-md" />
      </div>

      <div
        className="mb-8 grid grid-cols-2 gap-2 rounded-2xl p-1.5 sm:flex"
        style={{ background: 'rgba(253,251,247,0.85)', border: '1px solid #E8E2D8' }}
      >
        {[0, 1, 2, 3].map((tab) => (
          <SkeletonBlock key={tab} className="h-10 flex-1 rounded-xl" />
        ))}
      </div>

      <div className="space-y-4">
        {[0, 1, 2].map((card) => (
          <OrdersCardSkeleton key={card} />
        ))}
      </div>
    </main>
  );
}

export default function OrdersPageSkeleton({ overlay = false }) {
  if (overlay) {
    return (
      <div className="fixed inset-0 z-[40] overflow-hidden" style={{ background: '#FDFBF7' }}>
        <div className="min-h-screen pt-20 pb-12" style={{ background: '#FDFBF7' }}>
          <OrdersPageSkeletonBody />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 pb-12" style={{ background: '#FDFBF7' }}>
      <OrdersPageSkeletonBody />
    </div>
  );
}
