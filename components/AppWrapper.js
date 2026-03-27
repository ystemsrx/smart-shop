import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { AuthProvider } from '../hooks/useAuth';
import { LocationProvider } from '../hooks/useLocation';
import { PaymentQrProvider } from '../hooks/usePaymentQr';
import { useAuth } from '../hooks/useAuth';
import Nav from './Nav';
import PageTransitionSkeleton from './PageTransitionSkeleton';

// 不显示导航条的页面路径
const NO_NAV_PAGES = ['/login', '/register', '/order-success', '/_error'];

// 不显示路由切换骨架屏的页面（这些页面有自己的骨架屏/加载态）
const NO_SKELETON_PAGES = ['/login', '/register'];

function useNavActive() {
  const router = useRouter();
  const { user } = useAuth();
  const path = router.pathname || '';
  const isStaff = user?.type === 'admin' || user?.type === 'agent';

  if (path === '/') return '';
  if (path === '/shop') return isStaff ? 'staff-shop' : 'shop';
  if (path.startsWith('/c')) return 'home';
  if (path === '/cart') return 'cart';
  if (path === '/orders') return 'orders';
  if (path === '/checkout') return 'checkout';
  if (path === '/admin/dashboard' || path === '/agent/dashboard') return 'staff-dashboard';
  if (path === '/admin' || path === '/agent') return 'staff-backend';
  return 'home';
}

function AppLayout({ children }) {
  const router = useRouter();
  const active = useNavActive();
  const showNav = !NO_NAV_PAGES.includes(router.pathname);
  const [transitionTarget, setTransitionTarget] = useState(null);

  useEffect(() => {
    const handleStart = (url) => {
      // 仅当路由真正变化时显示骨架屏（同页面锚点跳转等不触发）
      if (url !== router.asPath) {
        setTransitionTarget(url);
      }
    };
    const handleDone = () => setTransitionTarget(null);

    router.events.on('routeChangeStart', handleStart);
    router.events.on('routeChangeComplete', handleDone);
    router.events.on('routeChangeError', handleDone);
    return () => {
      router.events.off('routeChangeStart', handleStart);
      router.events.off('routeChangeComplete', handleDone);
      router.events.off('routeChangeError', handleDone);
    };
  }, [router]);

  // 目标页面有自己的骨架屏时不显示全局骨架屏
  const targetPath = transitionTarget ? transitionTarget.split('?')[0] : null;
  const showSkeleton = transitionTarget && !NO_SKELETON_PAGES.includes(targetPath);

  return (
    <>
      {showNav && <Nav active={active} />}
      {children}
      {showSkeleton && <PageTransitionSkeleton />}
    </>
  );
}

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

// 应用包装器组件 - 认证/位置/支付上下文统一入口
export default function AppWrapper({ Component, pageProps }) {
  return (
    <AuthProvider>
      <LocationProvider>
        <PaymentQrProvider>
          <StaffRedirector>
            <AppLayout>
              <Component {...pageProps} />
            </AppLayout>
          </StaffRedirector>
        </PaymentQrProvider>
      </LocationProvider>
    </AuthProvider>
  );
}
