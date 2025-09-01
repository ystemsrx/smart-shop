import React from 'react'
import Head from 'next/head'
import Link from 'next/link'
import ChatModern from '../components/ChatUI'
import { useAuth } from '../hooks/useAuth'

export default function Home() {
  const { user, logout, isInitialized } = useAuth()

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

  return (
    <>
      <Head>
        <title>{user ? `${user.name} - AI智能助手` : 'AI智能助手'} - 宿舍智能小商城</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="description" content="宿舍智能小商城的AI购物助手，帮您搜索商品、管理购物车、提供购物建议" />
        <link rel="icon" type="image/svg+xml" href="/favicon.ico" />
      </Head>
      
      {/* 顶部导航栏 */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center space-x-6">
            <div className="flex items-center">
              <div className="h-8 w-8 bg-indigo-600 rounded-full flex items-center justify-center">
                <span className="text-white font-bold text-sm">L</span>
              </div>
              <span className="ml-2 text-lg font-bold text-gray-900">AI助手</span>
            </div>
            
            <div className="hidden sm:flex items-center space-x-4">
              <Link href="/" className="text-indigo-600 font-medium text-sm">
                AI助手
              </Link>
              <Link href="/shop" className="text-gray-700 hover:text-gray-900 text-sm">
                商品商城
              </Link>
              {user && user.type !== 'admin' && (
                <Link href="/cart" className="text-gray-700 hover:text-gray-900 text-sm">
                  购物车
                </Link>
              )}
              {user && user.type !== 'admin' && (
                <Link href="/orders" className="text-gray-700 hover:text-gray-900 text-sm">
                  我的订单
                </Link>
              )}
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            {user ? (
              <div className="flex items-center space-x-3">
                <span className="text-sm text-gray-600 hidden sm:inline">
                  {user.name}
                  {user.type === 'admin' && (
                    <span className="ml-1 px-2 py-0.5 bg-red-100 text-red-600 text-xs rounded-full">
                      管理员
                    </span>
                  )}
                </span>
                {user.type === 'admin' && (
                  <Link href="/admin" className="text-xs bg-red-600 text-white px-2 py-1 rounded-md hover:bg-red-700">
                    管理后台
                  </Link>
                )}
                <button
                  onClick={logout}
                  className="text-xs text-gray-600 hover:text-gray-800 px-2 py-1 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  退出
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-2">
                <Link href="/login" className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-md hover:bg-indigo-700">
                  登录
                </Link>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* 聊天界面 */}
      <div className="pt-14">
        <ChatModern user={user} />
      </div>
      
      {/* 未登录提示 */}
      {!user && (
        <div className="fixed bottom-20 left-4 right-4 z-40">
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
