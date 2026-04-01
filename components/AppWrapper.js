import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { AnimatePresence, motion } from 'framer-motion';
import { AuthProvider } from '../hooks/useAuth';
import { LocationProvider } from '../hooks/useLocation';
import { PaymentQrProvider } from '../hooks/usePaymentQr';
import { useAuth } from '../hooks/useAuth';
import Nav from './Nav';
import PageTransitionSkeleton from './PageTransitionSkeleton';
import CartPageSkeleton from './CartPageSkeleton';
import OrdersPageSkeleton from './OrdersPageSkeleton';
import ShopPageSkeleton from './ShopPageSkeleton';
import ChatPageSkeleton from './ChatPageSkeleton';
import AdminChatPageSkeleton from './AdminChatPageSkeleton';

// 不显示导航条的页面路径
const NO_NAV_PAGES = ['/login', '/register', '/order-success', '/_error'];

// 不显示路由切换骨架屏的页面（这些页面有自己的骨架屏/加载态）
const NO_SKELETON_PAGES = ['/login', '/register'];
const AUTH_TRANSITION_PAGES = ['/login', '/register'];

function matchChatRouteGroup(path) {
  if (!path) return null;
  if (path === '/c' || path.startsWith('/c/')) return 'user-chat';
  if (path === '/admin/ai-chat' || path.startsWith('/admin/ai-chat/')) return 'admin-chat';
  if (path === '/agent/ai-chat' || path.startsWith('/agent/ai-chat/')) return 'agent-chat';
  return null;
}

function shouldSuppressTransitionSkeleton(currentPath, targetPath) {
  if (!targetPath) return true;
  if (NO_SKELETON_PAGES.includes(targetPath)) return true;
  const currentChatGroup = matchChatRouteGroup(currentPath);
  const targetChatGroup = matchChatRouteGroup(targetPath);
  return Boolean(currentChatGroup && currentChatGroup === targetChatGroup);
}

function getTransitionSkeleton(path) {
  if (!path) return null;
  if (NO_SKELETON_PAGES.includes(path)) return null;
  if (path === '/shop') return <ShopPageSkeleton overlay />;
  if (path === '/cart') return <CartPageSkeleton overlay />;
  if (path === '/orders') return <OrdersPageSkeleton overlay />;
  if (path === '/c' || path.startsWith('/c/')) return <ChatPageSkeleton overlay />;
  if (path === '/admin/ai-chat' || path.startsWith('/admin/ai-chat/')) return <AdminChatPageSkeleton overlay />;
  if (path === '/agent/ai-chat' || path.startsWith('/agent/ai-chat/')) return <AdminChatPageSkeleton overlay />;
  return <PageTransitionSkeleton />;
}

function AuthRouteTransition({ routeKey, children }) {
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => { setHasMounted(true); }, []);

  // SSR and initial client render: plain divs to avoid hydration mismatch
  // (framer-motion's AnimatePresence/motion.div produce different HTML on server vs client)
  if (!hasMounted) {
    return (
      <div className="relative min-h-screen overflow-hidden">
        <div className="absolute inset-0 min-h-screen w-full">
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <AnimatePresence initial={false} mode="sync">
        <motion.div
          key={routeKey}
          initial={{ opacity: 0, y: -22, scale: 0.985, filter: 'blur(8px)' }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: 16, scale: 0.992, filter: 'blur(6px)' }}
          transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-0 min-h-screen w-full"
          style={{ willChange: 'transform, opacity, filter' }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function getNavActiveFromPath(path, isStaff) {
  if (path === '/') return '';
  if (path === '/shop') return isStaff ? 'staff-shop' : 'shop';
  if (path === '/cart') return 'cart';
  if (path === '/orders') return 'orders';
  if (path === '/checkout') return 'checkout';
  if (path.startsWith('/c')) return 'home';
  if (path.startsWith('/admin/ai-chat') || path.startsWith('/agent/ai-chat')) return 'staff-ai-chat';
  if (path === '/admin/dashboard' || path === '/agent/dashboard') return 'staff-dashboard';
  if (path === '/admin' || path === '/agent') return 'staff-backend';
  return 'home';
}

function useNavActive(pendingPath) {
  const router = useRouter();
  const { user } = useAuth();
  const isStaff = user?.type === 'admin' || user?.type === 'agent';

  // 路由切换中时立即使用目标路径，让选择器先移动过去
  if (pendingPath) {
    const targetPath = pendingPath.split('?')[0];
    return getNavActiveFromPath(targetPath, isStaff);
  }

  return getNavActiveFromPath(router.pathname || '', isStaff);
}

function AppLayout({ children }) {
  const router = useRouter();
  const showNav = !NO_NAV_PAGES.includes(router.pathname);
  const [transitionTarget, setTransitionTarget] = useState(null);
  const active = useNavActive(transitionTarget);

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
  const currentPath = router.asPath ? router.asPath.split('?')[0] : null;
  const targetPath = transitionTarget ? transitionTarget.split('?')[0] : null;
  const transitionSkeleton = transitionTarget && !shouldSuppressTransitionSkeleton(currentPath, targetPath)
    ? getTransitionSkeleton(targetPath)
    : null;
  const isAuthPage = AUTH_TRANSITION_PAGES.includes(router.pathname);
  const routeKey = router.asPath;
  return (
    <>
      {showNav && <Nav active={active} />}
      {isAuthPage ? (
        <AuthRouteTransition routeKey={routeKey}>
          {children}
        </AuthRouteTransition>
      ) : (
        children
      )}
      {transitionSkeleton}
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
