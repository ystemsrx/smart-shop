import React from 'react';

function SkeletonBlock({ className = '', style = {} }) {
  return <div className={`skeleton-shimmer ${className}`.trim()} style={style} />;
}

function CartPageSkeletonBody() {
  return (
    <main
      className="w-full min-w-0 overflow-x-hidden pb-20"
      style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: '32px clamp(20px, 5vw, 64px) 80px'
      }}
    >
      <div className="mb-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-baseline gap-3 sm:gap-4">
            <SkeletonBlock className="h-10 w-32 rounded-2xl" />
            <SkeletonBlock className="h-7 w-24 rounded-full" />
          </div>
          <SkeletonBlock className="hidden sm:block h-11 w-52 rounded-xl" />
        </div>
      </div>

      <div className="cart-skeleton-grid grid gap-8" style={{ alignItems: 'start' }}>
        <div className="space-y-5">
          <section
            className="w-full min-w-0 rounded-2xl overflow-hidden"
            style={{ background: '#FFFFFF', border: '1px solid #E8E2D8' }}
          >
            <div className="flex items-center justify-between gap-3 px-4 py-4 sm:px-6" style={{ borderBottom: '1px solid #E8E2D8' }}>
              <div className="flex min-w-0 items-center gap-3">
                <SkeletonBlock className="h-5 w-5 rounded-md" />
                <SkeletonBlock className="h-4 w-24 rounded-md" />
              </div>
              <SkeletonBlock className="h-4 w-10 rounded-md" />
            </div>

            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="flex w-full min-w-0 items-center gap-3 py-4 px-4 sm:gap-4 sm:px-6"
                style={{ borderBottom: item < 2 ? '1px solid #E8E2D8' : 'none' }}
              >
                <SkeletonBlock className="h-14 w-14 rounded-xl flex-shrink-0 sm:h-[68px] sm:w-[68px]" />
                <div className="flex-1 min-w-0">
                  <SkeletonBlock className="h-4 w-[68%] rounded-md mb-3" />
                  <SkeletonBlock className="h-3 w-[42%] rounded-md mb-2" />
                  <SkeletonBlock className="h-3 w-20 rounded-md" />
                </div>
                <div className="flex w-20 flex-shrink-0 flex-col items-end gap-3 sm:w-24">
                  <SkeletonBlock className="h-5 w-16 rounded-md" />
                  <SkeletonBlock className="h-8 w-full rounded-lg" />
                </div>
              </div>
            ))}
          </section>

          <section
            className="w-full min-w-0 rounded-2xl overflow-hidden"
            style={{ background: '#FFFFFF', border: '1px solid #E8E2D8' }}
          >
            <div className="flex items-center justify-between gap-3 px-4 py-4 sm:px-6" style={{ borderBottom: '1px solid #E8E2D8' }}>
              <div className="flex min-w-0 items-center gap-3">
                <SkeletonBlock className="h-5 w-5 rounded-md" />
                <SkeletonBlock className="h-4 w-28 rounded-md" />
              </div>
              <SkeletonBlock className="h-4 w-10 rounded-md" />
            </div>
            <div className="grid grid-cols-1 gap-3 px-4 py-4 sm:flex sm:overflow-hidden sm:px-6">
              {[0, 1, 2].map((coupon) => (
                <div
                  key={coupon}
                  className="w-full min-w-0 rounded-xl px-4 py-3.5 sm:min-w-[170px]"
                  style={{ background: '#FAF8F4', border: '1.5px dashed #E8E2D8' }}
                >
                  <SkeletonBlock className="h-6 w-14 rounded-md mb-3" />
                  <SkeletonBlock className="h-3 w-24 rounded-md mb-2" />
                  <SkeletonBlock className="h-3 w-12 rounded-md" />
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside
          className="hidden lg:block rounded-2xl overflow-hidden"
          style={{ background: '#FFFFFF', border: '1px solid #E8E2D8' }}
        >
          <div className="px-6 pt-6 pb-5" style={{ borderBottom: '1px solid #E8E2D8' }}>
            <SkeletonBlock className="h-7 w-28 rounded-lg mb-5" />
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <SkeletonBlock className="h-4 w-24 rounded-md" />
                <SkeletonBlock className="h-4 w-16 rounded-md" />
              </div>
              <div className="flex items-center justify-between">
                <SkeletonBlock className="h-4 w-20 rounded-md" />
                <SkeletonBlock className="h-4 w-14 rounded-md" />
              </div>
            </div>
          </div>
          <div className="px-6 py-5">
            <SkeletonBlock className="h-3 w-full rounded-full mb-5" />
            <SkeletonBlock className="h-12 w-full rounded-xl" />
          </div>
        </aside>
      </div>

      <style jsx>{`
        @media (min-width: 1024px) {
          .cart-skeleton-grid {
            grid-template-columns: minmax(0, 1fr) 380px;
          }
        }
        @media (max-width: 640px) {
          main {
            padding: 20px 16px 60px !important;
          }
        }
      `}</style>
    </main>
  );
}

export default function CartPageSkeleton({ overlay = false }) {
  if (overlay) {
    return (
      <div className="fixed inset-0 z-[40] overflow-hidden" style={{ background: '#FDFBF7' }}>
        <div className="min-h-screen pt-16" style={{ background: '#FDFBF7', WebkitFontSmoothing: 'antialiased', overflowX: 'hidden' }}>
          <CartPageSkeletonBody />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-16" style={{ background: '#FDFBF7', WebkitFontSmoothing: 'antialiased', overflowX: 'hidden' }}>
      <CartPageSkeletonBody />
    </div>
  );
}
