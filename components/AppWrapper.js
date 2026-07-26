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
import CheckoutPageSkeleton from './CheckoutPageSkeleton';
import ShopPageSkeleton from './ShopPageSkeleton';
import ChatPageSkeleton from './ChatPageSkeleton';


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
  if (path === '/checkout') return <CheckoutPageSkeleton overlay />;
  if (path === '/c') return <ChatPageSkeleton overlay variant="hero" />;
  if (path.startsWith('/c/')) return <ChatPageSkeleton overlay variant="conversation" />;
  if (path === '/admin/ai-chat' || path === '/agent/ai-chat') return <ChatPageSkeleton overlay variant="hero" />;
  if (path.startsWith('/admin/ai-chat/') || path.startsWith('/agent/ai-chat/')) return <ChatPageSkeleton overlay variant="conversation" />;
  return <PageTransitionSkeleton />;
}

function AuthRouteTransition({ routeKey, children }) {
  // AnimatePresence initial={false}：首屏（含 SSR）直接以 animate 终值渲染，服务端与客户端输出一致
  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <AnimatePresence initial={false} mode="sync">
        <motion.div
          key={routeKey}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8, transition: { duration: 0.15, ease: [0.22, 1, 0.36, 1] } }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-0 min-h-screen w-full"
          style={{ willChange: 'transform, opacity' }}
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
  // 骨架屏状态：150ms 延迟后显示（快速切换不闪骨架），完成后 120ms 淡出再卸载
  const [skeleton, setSkeleton] = useState({ path: null, leaving: false });
  const active = useNavActive(transitionTarget);

  useEffect(() => {
    let showTimer = null;
    let hideTimer = null;
    const handleStart = (url) => {
      // 仅当路由真正变化时显示骨架屏（同页面锚点跳转等不触发）
      if (url !== router.asPath) {
        setTransitionTarget(url);
        clearTimeout(showTimer);
        clearTimeout(hideTimer);
        showTimer = setTimeout(() => setSkeleton({ path: url, leaving: false }), 150);
      }
    };
    const handleDone = () => {
      setTransitionTarget(null);
      clearTimeout(showTimer);
      setSkeleton((s) => (s.path ? { ...s, leaving: true } : s));
      hideTimer = setTimeout(() => setSkeleton({ path: null, leaving: false }), 120);
    };

    router.events.on('routeChangeStart', handleStart);
    router.events.on('routeChangeComplete', handleDone);
    router.events.on('routeChangeError', handleDone);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
      router.events.off('routeChangeStart', handleStart);
      router.events.off('routeChangeComplete', handleDone);
      router.events.off('routeChangeError', handleDone);
    };
  }, [router]);

  // 目标页面有自己的骨架屏时不显示全局骨架屏
  const currentPath = router.asPath ? router.asPath.split('?')[0] : null;
  const skeletonPath = skeleton.path ? skeleton.path.split('?')[0] : null;
  const transitionSkeleton = skeleton.path && !shouldSuppressTransitionSkeleton(currentPath, skeletonPath)
    ? getTransitionSkeleton(skeletonPath)
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
      {transitionSkeleton && (
        <div
          className={`fixed inset-0 z-40 transition-opacity duration-[120ms] ease-out ${
            skeleton.leaving ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}
        >
          {transitionSkeleton}
        </div>
      )}
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
