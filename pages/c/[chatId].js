import React, { useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Link from 'next/link';
import ChatModern from '../../components/ChatUI';
import Nav from '../../components/Nav';
import { useAuth } from '../../hooks/useAuth';
import { getShopName } from '../../utils/runtimeConfig';
import LandingPage from '../../components/page';

const shopName = getShopName();

export default function ChatPage() {
  const { user, logout, isInitialized } = useAuth();
  const router = useRouter();
  const { chatId, home } = router.query;
  const showHome = home === 'true';

  useEffect(() => {
    if (!user || showHome) return;
    if (user.type === 'admin') {
      router.push('/admin/dashboard');
    } else if (user.type === 'agent') {
      router.push('/agent/dashboard');
    }
  }, [user, router, showHome]);

  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p className="text-gray-600">正在加载...</p>
        </div>
      </div>
    );
  }

  if (showHome) {
    return (
      <>
        <Head>
          <title>{shopName} - Future Marketplace</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <meta
            name="description"
            content={`${shopName} - 下一代智能购物平台，AI 驱动的个性化购物体验`}
          />
          <link rel="icon" type="image/svg+xml" href="/favicon.ico" />
        </Head>
        <LandingPage user={user} logout={logout} />
      </>
    );
  }

  return (
    <>
      <Head>
        <title>{user ? `${user.name} - ` : ''}{shopName}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta
          name="description"
          content={`${shopName}的AI购物助手，帮您搜索商品、管理购物车、提供购物建议`}
        />
        <link rel="icon" type="image/svg+xml" href="/favicon.ico" />
      </Head>
      <Nav active="home" />
      <ChatModern user={user} initialConversationId={chatId ? String(chatId) : null} />
      {!user && (
        <div className="fixed bottom-32 left-4 right-4 z-40">
          <div className="max-w-md mx-auto bg-yellow-50 border border-yellow-200 rounded-lg p-3 shadow-sm">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <span className="text-yellow-400">⚠️</span>
              </div>
              <div className="ml-2 text-sm">
                <p className="text-yellow-800 font-medium">功能受限提示</p>
                <p className="text-yellow-700 mt-1">
                  未登录用户只能搜索商品，
                  <Link href="/login" className="underline font-medium">
                    登录后
                  </Link>
                  可使用购物车功能
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
