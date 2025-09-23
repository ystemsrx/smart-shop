import React, { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../hooks/useAuth';
import { useLocation } from '../hooks/useLocation';

// 通用导航（含移动端菜单），active 可为 'home' | 'shop' | 'cart' | 'orders' | 'staff-shop' | 'staff-dashboard' | 'staff-backend'
export default function Nav({ active = 'home' }) {
  const { user, logout } = useAuth();
  const { location, openLocationModal } = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMenu = () => setMobileOpen(false);

  const isAdmin = user?.type === 'admin';
  const isAgent = user?.type === 'agent';
  const isStaff = isAdmin || isAgent;
  const staffShopLink = '/shop';
  const staffDashboardLink = isAdmin ? '/admin/dashboard' : '/agent/dashboard';
  const staffPortalLink = isAdmin ? '/admin' : '/agent';
  const locationLabel = location
    ? `${location.dormitory || ''}${location.building ? '·' + location.building : ''}`.trim() || '已选择地址'
    : '未选择地址';

  const linkCls = (name) => {
    const base = 'px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 ease-out flex items-center gap-2';
    if (name === active) {
      return `${base} bg-white/90 text-gray-900 shadow-lg backdrop-blur-sm border border-white/20`;
    }
    return `${base} text-gray-600 hover:text-gray-900 hover:bg-white/50`;
  };

  const mobileNavOpen = mobileOpen ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0';

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 nav-glass">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* 左侧品牌和导航 */}
            <div className="flex items-center space-x-8">
              {/* 品牌Logo */}
              <div className="flex items-center space-x-3">
                {/* 移动端：点击图标打开菜单，桌面端：链接到首页 */}
                <button
                  className="md:hidden flex items-center group"
                  onClick={() => setMobileOpen(!mobileOpen)}
                  aria-label="打开菜单"
                >
                  <div className="relative">
                     <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-pink-600 flex items-center justify-center shadow-lg transform group-hover:scale-105 transition-transform duration-300">
                       <i className="fas fa-shopping-bag text-white text-lg"></i>
                     </div>
                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-orange-400 rounded-full flex items-center justify-center">
                      <i className="fas fa-sparkles text-white text-xs"></i>
                    </div>
                  </div>
                </button>
                
                <Link href="/" className="hidden md:flex items-center group">
                  <div className="relative">
                     <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-pink-600 flex items-center justify-center shadow-lg transform group-hover:scale-105 transition-transform duration-300">
                       <i className="fas fa-shopping-bag text-white text-lg"></i>
                     </div>
                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-orange-400 rounded-full flex items-center justify-center">
                      <i className="fas fa-sparkles text-white text-xs"></i>
                    </div>
                  </div>
                </Link>
                
                {/* Logo图片 */}
                <Link href="/" className="flex items-center group">
                  <img 
                    src="/logo.png" 
                    alt="[商店名称]" 
                    className="h-10 w-auto object-contain"
                  />
                </Link>
              </div>

              {/* 桌面导航菜单 */}
              <div className="hidden md:flex items-center space-x-2">
                {/* 管理员专用导航 */}
                {isStaff ? (
                  <>
                    <Link href={staffShopLink} className={linkCls('staff-shop')}>
                      <i className="fas fa-store"></i>
                      <span>商品商城</span>
                    </Link>
                    <Link href={staffDashboardLink} className={linkCls('staff-dashboard')}>
                      <i className="fas fa-chart-line"></i>
                      <span>仪表盘</span>
                    </Link>
                    <Link href={staffPortalLink} className={linkCls('staff-backend')}>
                      <i className="fas fa-cog"></i>
                      <span>管理后台</span>
                    </Link>
                  </>
                ) : (
                  /* 普通用户导航 */
                  <>
                    <Link href="/" className={linkCls('home')}>
                      <i className="fas fa-comments"></i>
                      <span>商城助手</span>
                    </Link>
                    <Link href="/shop" className={linkCls('shop')}>
                      <i className="fas fa-store"></i>
                      <span>商品商城</span>
                    </Link>
                    {user && (
                      <Link href="/cart" className={linkCls('cart')}>
                        <i className="fas fa-shopping-cart"></i>
                        <span>购物车</span>
                      </Link>
                    )}
                    {user && (
                      <Link href="/orders" className={linkCls('orders')}>
                        <i className="fas fa-receipt"></i>
                        <span>我的订单</span>
                      </Link>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* 右侧用户区域 */}
            <div className="flex items-center space-x-4">
              {user ? (
                <div className="flex items-center space-x-3">
                  <div className="hidden sm:flex items-center space-x-3 px-3 py-2 rounded-xl bg-white/50 backdrop-blur-sm border border-white/20">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
                      <i className="fas fa-user text-white text-sm"></i>
                    </div>
                    <div className="text-sm">
                      <div className="font-medium text-gray-900">{user.name}</div>
                      {isAdmin && (
                        <div className="flex items-center gap-1 text-xs text-red-600">
                          <i className="fas fa-crown"></i>
                          <span>管理员</span>
                        </div>
                      )}
                      {isAgent && (
                        <div className="flex items-center gap-1 text-xs text-amber-600">
                          <i className="fas fa-user-tie"></i>
                          <span>代理</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {user.type === 'user' && (
                    <button
                      onClick={() => { openLocationModal(); closeMenu(); }}
                      className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-xl bg-white/60 hover:bg-white/80 text-gray-700 text-sm font-medium transition-all duration-300 backdrop-blur-sm border border-white/30 hover:shadow-md"
                    >
                      <i className="fas fa-location-dot text-emerald-500"></i>
                      <span>{locationLabel}</span>
                    </button>
                  )}

                  <button
                    onClick={() => { logout(); closeMenu(); }}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/70 hover:bg-white/90 text-gray-700 hover:text-gray-900 text-sm font-medium transition-all duration-300 backdrop-blur-sm border border-white/30 hover:shadow-md"
                  >
                    <i className="fas fa-sign-out-alt"></i>
                    <span className="hidden sm:inline">退出</span>
                  </button>
                </div>
              ) : (
                <Link 
                  href="/login" 
                   className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-600 text-white font-medium hover:from-emerald-600 hover:to-cyan-700 transform hover:scale-105 transition-all duration-300 shadow-lg"
                >
                  <i className="fas fa-sign-in-alt"></i>
                  <span>登录</span>
                </Link>
              )}

            </div>
          </div>
        </div>
      </nav>

      {/* 移动端侧边栏菜单 */}
      <div className={`fixed inset-0 z-40 md:hidden transition-all duration-300 ${mobileOpen ? 'visible' : 'invisible'}`}>
        {/* 遮罩层 */}
        <div 
          className={`absolute inset-0 bg-black/20 backdrop-blur-sm transition-opacity duration-300 ${mobileOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={closeMenu}
        />
        
        {/* 侧边栏 */}
        <div className={`absolute top-0 left-0 h-full w-80 max-w-sm bg-white/95 backdrop-blur-xl border-r border-white/20 shadow-2xl transform transition-all duration-300 ease-out ${mobileNavOpen} pt-20`}>
          <div className="p-6 space-y-4">
            {/* 用户信息卡片 */}
            {user && (
              <div className="card-glass p-4 mb-6 animate-apple-slide-up">
                <div className="flex items-center space-x-3">
                   <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
                     <i className="fas fa-user text-white"></i>
                   </div>
                  <div>
                    <div className="font-semibold text-gray-900">{user.name}</div>
                    {isAdmin && (
                      <div className="flex items-center gap-1 text-sm text-red-600">
                        <i className="fas fa-crown"></i>
                        <span>管理员</span>
                      </div>
                    )}
                    {isAgent && (
                      <div className="flex items-center gap-1 text-sm text-amber-600">
                        <i className="fas fa-user-tie"></i>
                        <span>代理</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {user && user.type === 'user' && (
              <button
                onClick={() => { openLocationModal(); closeMenu(); }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 transition-all duration-200"
              >
                <i className="fas fa-location-dot w-5"></i>
                <div className="flex-1 text-left">
                  <div className="text-sm font-semibold">当前地址</div>
                  <div className="text-xs text-emerald-600 mt-0.5">{locationLabel}</div>
                </div>
                <i className="fas fa-pen"></i>
              </button>
            )}

            {/* 导航菜单 */}
            <div className="space-y-2">
              {/* 管理员专用菜单 */}
              {isStaff ? (
                <>
                  <Link
                    href={staffShopLink}
                    onClick={closeMenu}
                    className={`${active === 'staff-shop' ? 'bg-blue-50 text-blue-600 border-blue-200' : 'text-gray-700 hover:bg-gray-50 border-transparent'} flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-200`}
                  >
                    <i className="fas fa-store w-5"></i>
                    <span className="font-medium">商品商城</span>
                  </Link>
                  <Link
                    href={staffDashboardLink}
                    onClick={closeMenu}
                    className={`${active === 'staff-dashboard' ? 'bg-green-50 text-green-600 border-green-200' : 'text-gray-700 hover:bg-gray-50 border-transparent'} flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-200`}
                  >
                    <i className="fas fa-chart-line w-5"></i>
                    <span className="font-medium">仪表盘</span>
                  </Link>
                  <Link
                    href={staffPortalLink}
                    onClick={closeMenu}
                    className={`${active === 'staff-backend' ? 'bg-amber-50 text-amber-600 border-amber-200' : 'text-gray-700 hover:bg-gray-50 border-transparent'} flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-200`}
                  >
                    <i className="fas fa-cog w-5"></i>
                    <span className="font-medium">管理后台</span>
                  </Link>
                </>
              ) : (
                /* 普通用户菜单 */
                <>
                  <Link href="/" onClick={closeMenu} className={`${active === 'home' ? 'bg-purple-50 text-purple-600 border-purple-200' : 'text-gray-700 hover:bg-gray-50 border-transparent'} flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-200`}>
                    <i className="fas fa-comments w-5"></i>
                    <span className="font-medium">商城助手</span>
                  </Link>
                  <Link href="/shop" onClick={closeMenu} className={`${active === 'shop' ? 'bg-blue-50 text-blue-600 border-blue-200' : 'text-gray-700 hover:bg-gray-50 border-transparent'} flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-200`}>
                    <i className="fas fa-store w-5"></i>
                    <span className="font-medium">商品商城</span>
                  </Link>
                  {user && (
                    <Link href="/cart" onClick={closeMenu} className={`${active === 'cart' ? 'bg-cyan-50 text-cyan-600 border-cyan-200' : 'text-gray-700 hover:bg-gray-50 border-transparent'} flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-200`}>
                      <i className="fas fa-shopping-cart w-5"></i>
                      <span className="font-medium">购物车</span>
                    </Link>
                  )}
                  {user && (
                    <Link href="/orders" onClick={closeMenu} className={`${active === 'orders' ? 'bg-orange-50 text-orange-600 border-orange-200' : 'text-gray-700 hover:bg-gray-50 border-transparent'} flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-200`}>
                      <i className="fas fa-receipt w-5"></i>
                      <span className="font-medium">我的订单</span>
                    </Link>
                  )}
                </>
              )}
            </div>

            {/* 底部操作 */}
            <div className="pt-6 border-t border-gray-200/50">
              {user ? (
                <button
                  onClick={() => { logout(); closeMenu(); }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium transition-all duration-200"
                >
                  <i className="fas fa-sign-out-alt"></i>
                  <span>退出登录</span>
                </button>
              ) : (
                <Link 
                  href="/login" 
                  onClick={closeMenu}
                   className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-600 text-white font-medium transition-all duration-200"
                >
                  <i className="fas fa-sign-in-alt"></i>
                  <span>登录</span>
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
