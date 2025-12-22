import { useState, useEffect } from 'react';
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

// 应用包装器组件 - 只在客户端渲染
export default function AppWrapper({ Component, pageProps }) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // 确保只在客户端渲染
  if (!isClient) {
    return (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        height: '100vh',
        fontSize: '16px'
      }}>
        正在初始化...
      </div>
    );
  }

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
