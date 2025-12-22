import React, { useEffect } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import ChatModern from '../components/ChatUI'
import { useAuth } from '../hooks/useAuth'
import Nav from '../components/Nav'
import { getShopName } from '../utils/runtimeConfig'
import LandingPage from '../components/page'

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

