import React from 'react';

function SkeletonBlock({ className = '', style = {} }) {
  return <div className={`skeleton-shimmer ${className}`.trim()} style={style} />;
}

function CheckoutPageSkeletonBody() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'radial-gradient(ellipse 80% 50% at 30% 0%, rgba(217,119,87,0.04) 0%, transparent 55%), #FAF8F4',
        WebkitFontSmoothing: 'antialiased',
      }}
    >
      <nav
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '14px 16px',
          position: 'sticky',
          top: 0,
          zIndex: 10,
          background: 'rgba(250,250,250,.88)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderBottom: '1px solid rgba(20,20,19,0.08)',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 1080,
            height: 22,
          }}
        />
      </nav>

      <div
        style={{
          maxWidth: 1080,
          margin: '0 auto',
          padding: '20px 16px 108px',
        }}
      >
        <div className="checkout-skeleton-grid" style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'grid', gap: 14 }}>
            {[0, 1, 2].map((card) => (
              <div
                key={card}
                style={{
                  background: '#FFFFFF',
                  border: '1px solid rgba(20,20,19,0.06)',
                  borderRadius: 20,
                  padding: 20,
                  overflow: 'hidden',
                  boxShadow: '0 1px 6px rgba(0,0,0,0.04)',
                }}
              >
                <div className="flex items-center justify-between gap-3 mb-5">
                  <div className="flex items-center gap-3">
                    <SkeletonBlock className="h-5 w-5 rounded-full" />
                    <SkeletonBlock className="h-4 w-24 rounded-full" />
                  </div>
                  <SkeletonBlock className="h-4 w-12 rounded-full" />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <SkeletonBlock className="h-11 rounded-2xl" />
                  <SkeletonBlock className="h-11 rounded-2xl" />
                </div>
                <SkeletonBlock className="mt-3 h-11 w-full rounded-2xl" />
                <SkeletonBlock className="mt-3 h-16 w-full rounded-[18px]" />
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gap: 14 }}>
            <div
              style={{
                background: '#FFFFFF',
                border: '1px solid rgba(20,20,19,0.06)',
                borderRadius: 20,
                padding: 20,
                overflow: 'hidden',
                boxShadow: '0 1px 6px rgba(0,0,0,0.04)',
              }}
            >
              <div className="flex items-center justify-between gap-3 mb-5">
                <SkeletonBlock className="h-5 w-28 rounded-full" />
                <SkeletonBlock className="h-4 w-16 rounded-full" />
              </div>
              {[0, 1, 2].map((row) => (
                <div key={row} className="flex items-center gap-4 py-3">
                  <SkeletonBlock className="h-14 w-14 rounded-2xl flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <SkeletonBlock className="mb-2 h-4 w-[76%] rounded-full" />
                    <SkeletonBlock className="h-3.5 w-[48%] rounded-full" />
                  </div>
                  <SkeletonBlock className="h-5 w-14 rounded-full flex-shrink-0" />
                </div>
              ))}
            </div>

            <div
              style={{
                background: '#FFFDF9',
                border: '1px solid rgba(217,119,87,0.12)',
                borderRadius: 20,
                padding: 20,
                overflow: 'hidden',
                boxShadow: '0 1px 6px rgba(0,0,0,0.03)',
              }}
            >
              <SkeletonBlock className="mb-4 h-5 w-24 rounded-full" />
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <SkeletonBlock className="h-4 w-24 rounded-full" />
                  <SkeletonBlock className="h-4 w-16 rounded-full" />
                </div>
                <div className="flex items-center justify-between">
                  <SkeletonBlock className="h-4 w-20 rounded-full" />
                  <SkeletonBlock className="h-4 w-20 rounded-full" />
                </div>
                <SkeletonBlock className="h-3 w-full rounded-full" />
                <SkeletonBlock className="h-12 w-full rounded-full" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 15,
          padding: '12px 16px calc(12px + env(safe-area-inset-bottom, 0px))',
          background: 'rgba(250,248,244,0.92)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          borderTop: '1px solid rgba(20,20,19,0.06)',
        }}
      >
        <div style={{ maxWidth: 1080, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ flex: 1 }}>
            <SkeletonBlock className="mb-2 h-3.5 w-20 rounded-full" />
            <SkeletonBlock className="h-6 w-28 rounded-full" />
          </div>
          <SkeletonBlock className="h-12 w-40 rounded-full" />
        </div>
      </div>

      <style jsx>{`
        @media (min-width: 960px) {
          .checkout-skeleton-grid {
            grid-template-columns: minmax(0, 1.15fr) minmax(320px, 0.85fr);
            align-items: start;
          }
        }
      `}</style>
    </div>
  );
}

export default function CheckoutPageSkeleton({ overlay = false }) {
  if (overlay) {
    return (
      <div className="fixed inset-0 z-[40] overflow-hidden bg-[#FAF8F4] pt-16">
        <CheckoutPageSkeletonBody />
      </div>
    );
  }

  return (
    <div className="pt-16">
      <CheckoutPageSkeletonBody />
    </div>
  );
}
