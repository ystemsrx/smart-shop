import React, { useState, useEffect } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import ChatModern from '../components/ChatUI'
import { useAuth } from '../hooks/useAuth'
import Nav from '../components/Nav'

export default function Home() {
  const { user, logout, isInitialized } = useAuth()
  const router = useRouter()

  // 等待认证状态初始化
  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">正在加载...</p>
        </div>
      </div>
    )
  }

  // 如果是管理员访问聊天页面，重定向到仪表盘
  useEffect(() => {
    if (user && user.type === 'admin') {
      router.push('/admin/dashboard');
    } else if (user && user.type === 'agent') {
      router.push('/agent/dashboard');
    }
  }, [user, router]);

  return (
    <>
      <Head>
        <title>{user ? `${user.name} - ` : ''}[商店名称]</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="description" content="[商店名称]的AI购物助手，帮您搜索商品、管理购物车、提供购物建议" />
        <link rel="icon" type="image/svg+xml" href="/favicon.ico" />
      </Head>
      
      {/* 统一导航栏 */}
      <Nav active="home" />

      {/* 聊天界面 */}
      <div className="pt-16">
        <ChatModern user={user} />
      </div>
      
      {/* 未登录提示 */}
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
  )
}

