import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { AuthProvider } from '../hooks/useAuth';
import { LocationProvider } from '../hooks/useLocation';
import { PaymentQrProvider } from '../hooks/usePaymentQr';
import { useAuth } from '../hooks/useAuth';

function StaffRedirector({ children }) {
  const router = useRouter();
  const { user, isInitialized } = useAuth();

  useEffect(() => {
    if (!isInitialized || !user) return;
    if (user.type !== 'admin' && user.type !== 'agent') return;

    const staffTarget = user.type === 'admin' ? '/admin/dashboard' : '/agent/dashboard';
    const path = router.pathname || '';
    const asPath = router.asPath || '';

    const isStaffTarget = asPath.startsWith(staffTarget);
    const isChat = path.startsWith('/c') || asPath.startsWith('/c');
    const isHome = path === '/' || asPath === '/';
    const isLogin = path === '/login' || asPath.startsWith('/login');

    if (isStaffTarget) return;
    if (isChat || isHome || isLogin) {
      router.replace(staffTarget);
    }
  }, [isInitialized, user, router]);

  return children;
}

// 应用包装器组件 - 优化后的版本
// 移除了不必要的 isClient 双重检查，因为 _app.js 已经通过 dynamic({ ssr: false }) 保证只在客户端运行
export default function AppWrapper({ Component, pageProps }) {
  // 由于 dynamic({ ssr: false })，这个组件只会在客户端渲染
  // 所以不需要额外的 isClient 状态检查

  return (
    <AuthProvider>
      <LocationProvider>
        <PaymentQrProvider>
          <StaffRedirector>
            <Component {...pageProps} />
          </StaffRedirector>
        </PaymentQrProvider>
      </LocationProvider>
    </AuthProvider>
  );
}
