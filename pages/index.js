import React, { useEffect } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import dynamic from 'next/dynamic'
import { useAuth } from '../hooks/useAuth'
import { getShopName } from '../utils/runtimeConfig'

// 动态加载重型组件
const LandingPage = dynamic(
  () => import(/* webpackChunkName: "landing-page" */ '../components/page'),
  { 
    ssr: false,
    loading: () => (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center shadow-xl animate-pulse">
            <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 2a4 4 0 00-4 4v1H5a1 1 0 00-.994.89l-1 9A1 1 0 004 18h12a1 1 0 00.994-1.11l-1-9A1 1 0 0015 7h-1V6a4 4 0 00-4-4zm2 5V6a2 2 0 10-4 0v1h4zm-6 3a1 1 0 112 0 1 1 0 01-2 0zm7-1a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="flex items-center justify-center gap-1">
            <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
        </div>
      </div>
    )
  }
)

export default function Home() {
  const { user, logout, isInitialized } = useAuth()
  const router = useRouter()
  const shopName = getShopName()

  // 检查是否强制显示首页
  const showHome = router.query.home === 'true'

  // 根据用户类型重定向
  useEffect(() => {
    if (!user || showHome) return;
    
    if (user.type === 'admin') {
      router.push('/admin/dashboard');
    } else if (user.type === 'agent') {
      router.push('/agent/dashboard');
    } else if (user.type === 'user') {
      // 普通用户自动跳转到AI聊天界面
      router.push('/c');
    }
  }, [user, router, showHome]);

  // 等待认证状态初始化
  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p className="text-gray-600">正在加载...</p>
        </div>
      </div>
    )
  }

  // 始终显示首页（无论是否登录）
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
  )
}

