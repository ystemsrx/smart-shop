import React, { useEffect, useRef } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { useAuth } from '../hooks/useAuth'
import { getShopName } from '../utils/runtimeConfig'
import LandingPage from '../components/page'

export default function Home() {
  const { user, isInitialized } = useAuth()
  const router = useRouter()
  const shopName = getShopName()
  const homeTitle = `${shopName} - Future Marketplace`
  const hasRedirectedRef = useRef(false)

  // 检查是否强制显示首页
  const showHome = router.query.home === 'true'

  // 根据用户类型重定向（仅在认证状态判定完成后执行一次）
  useEffect(() => {
    if (!isInitialized || !user || showHome || hasRedirectedRef.current) return;

    if (user.type === 'admin') {
      hasRedirectedRef.current = true;
      router.push('/admin/dashboard');
    } else if (user.type === 'agent') {
      hasRedirectedRef.current = true;
      router.push('/agent/dashboard');
    } else if (user.type === 'user') {
      // 普通用户自动跳转到AI聊天界面
      hasRedirectedRef.current = true;
      router.push('/c');
    }
  }, [user, isInitialized, router, showHome]);

  const head = (
    <Head>
      <title>{homeTitle}</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta
        name="description"
        content={`${shopName} - 下一代智能购物平台，AI 驱动的个性化购物体验`}
      />
      <link rel="icon" type="image/svg+xml" href="/favicon.ico" />
    </Head>
  )

  // 认证状态未判定完成或即将重定向时不渲染落地页，避免闪一帧
  if (!showHome && (!isInitialized || user)) {
    return head
  }

  return (
    <>
      {head}
      <LandingPage />
    </>
  )
}

