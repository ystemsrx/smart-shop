import React, { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '../hooks/useAuth';
import { useLocation } from '../hooks/useLocation';
import { getShopName, getHeaderLogo } from '../utils/runtimeConfig';
import CircularMenuButton from './CircularMenuButton';

// 通用导航（含移动端菜单），active 可为 'home' | 'shop' | 'cart' | 'orders' | 'staff-shop' | 'staff-dashboard' | 'staff-backend'
export default function Nav({ active = 'home' }) {
  const { user, logout } = useAuth();
  const { location, openLocationModal } = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const shopName = getShopName();
  const headerLogo = getHeaderLogo();
  const closeMenu = () => setMobileOpen(false);

  const isAdmin = user?.type === 'admin';
  const isAgent = user?.type === 'agent';
  const isStaff = isAdmin || isAgent;
  const staffShopLink = '/shop';
  const staffAiChatLink = isAdmin ? '/admin/ai-chat' : '/agent/ai-chat';
  const staffDashboardLink = isAdmin ? '/admin/dashboard' : '/agent/dashboard';
  const staffPortalLink = isAdmin ? '/admin' : '/agent';
  const locationLabel = location
    ? `${location.dormitory || ''}${location.building ? '·' + location.building : ''}`.trim() || '已选择地址'
    : '未选择地址';

  // 滑动选择器
  const navContainerRef = useRef(null);
  const tabRefs = useRef({});
  const [slider, setSlider] = useState({ left: 0, width: 0, ready: false });

  const setTabRef = useCallback((name) => (el) => {
    tabRefs.current[name] = el;
  }, []);

  useEffect(() => {
    const container = navContainerRef.current;
    const activeEl = tabRefs.current[active];
    if (!container || !activeEl) {
      setSlider(s => ({ ...s, ready: false }));
      return;
    }
    const containerRect = container.getBoundingClientRect();
    const elRect = activeEl.getBoundingClientRect();
    setSlider({
      left: elRect.left - containerRect.left,
      width: elRect.width,
      ready: true,
    });
  }, [active, user]);

  const linkCls = (name) => {
    const base = 'relative z-10 px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 transition-colors duration-200';
    if (name === active) return `${base} text-gray-900`;
    return `${base} text-gray-500 hover:text-gray-900`;
  };

  const mobileNavOpen = mobileOpen ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0';
  const userIconShell = 'rounded-full bg-[linear-gradient(135deg,#F6E7D6,#EDCDA7)] text-[#C96442] border border-[#F2D7BA]';

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 nav-glass">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* 左侧品牌和导航 */}
            <div className="flex items-center space-x-8">
              {/* 品牌Logo */}
              <div className="flex items-center space-x-3">
                {/* 移动端：使用圆形汉堡菜单按钮 */}
                <div className="md:hidden">
                  <CircularMenuButton
                    isOpen={mobileOpen}
                    onToggle={() => setMobileOpen(!mobileOpen)}
                  />
                </div>

                {/* 桌面端：品牌图标链接到首页 */}
                <Link href="/?home=true" className="hidden md:flex items-center group">
                  <div className="w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center shadow-sm group-hover:bg-stone-200 transition-colors duration-300">
                    <i className="fas fa-shopping-bag text-stone-500 text-base"></i>
                  </div>
                </Link>

                {/* Logo图片 */}
                <Link href="/?home=true" className="flex items-center group">
                  <img
                    src={headerLogo}
                    alt={shopName}
                    className="h-10 w-auto object-contain"
                  />
                </Link>
              </div>

              {/* 桌面导航菜单 */}
              <div ref={navContainerRef} className="hidden md:flex items-center space-x-1 relative">
                {/* 滑动背景指示器 */}
                {slider.ready && (
                  <div
                    className="absolute top-0 h-full rounded-xl bg-white/90 shadow-lg border border-white/20 backdrop-blur-sm"
                    style={{
                      left: slider.left,
                      width: slider.width,
                      transition: 'left 0.35s cubic-bezier(0.25, 0.1, 0.25, 1), width 0.35s cubic-bezier(0.25, 0.1, 0.25, 1)',
                    }}
                  />
                )}
                {/* 管理员专用导航 */}
                {isStaff ? (
                  <>
                    <Link ref={setTabRef('staff-ai-chat')} href={staffAiChatLink} className={linkCls('staff-ai-chat')}>
                      <i className="fas fa-robot"></i>
                      <span>管理助手</span>
                    </Link>
                    <Link ref={setTabRef('staff-shop')} href={staffShopLink} className={linkCls('staff-shop')}>
                      <i className="fas fa-store"></i>
                      <span>商品商城</span>
                    </Link>
                    <Link ref={setTabRef('staff-dashboard')} href={staffDashboardLink} className={linkCls('staff-dashboard')}>
                      <i className="fas fa-chart-line"></i>
                      <span>仪表盘</span>
                    </Link>
                    <Link ref={setTabRef('staff-backend')} href={staffPortalLink} className={linkCls('staff-backend')}>
                      <i className="fas fa-cog"></i>
                      <span>管理后台</span>
                    </Link>
                  </>
                ) : (
                  /* 普通用户导航 */
                  <>
                    <Link ref={setTabRef('home')} href="/c" className={linkCls('home')}>
                      <i className="fas fa-comments"></i>
                      <span>商城助手</span>
                    </Link>
                    <Link ref={setTabRef('shop')} href="/shop" className={linkCls('shop')}>
                      <i className="fas fa-store"></i>
                      <span>商品商城</span>
                    </Link>
                    {user && (
                      <Link ref={setTabRef('cart')} href="/cart" className={linkCls('cart')}>
                        <i className="fas fa-shopping-cart"></i>
                        <span>购物车</span>
                      </Link>
                    )}
                    {user && (
                      <Link ref={setTabRef('orders')} href="/orders" className={linkCls('orders')}>
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
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shadow-sm ${userIconShell}`}>
                      <i className="fas fa-user text-sm"></i>
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

                  <a
                    href="https://github.com/ystemsrx/smart-shop"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center w-10 h-10 shrink-0 aspect-square rounded-xl bg-white/70 hover:bg-white/90 text-gray-700 hover:text-gray-900 transition-all duration-300 backdrop-blur-sm border border-white/30 hover:shadow-md"
                    title="查看GitHub源码"
                  >
                    <i className="fab fa-github text-lg"></i>
                  </a>

                  <button
                    onClick={() => { logout(); closeMenu(); }}
                    className="flex items-center justify-center w-10 h-10 shrink-0 aspect-square rounded-xl bg-white/70 hover:bg-white/90 text-gray-700 hover:text-gray-900 transition-all duration-300 backdrop-blur-sm border border-white/30 hover:shadow-md"
                    title="退出登录"
                  >
                    <i className="fas fa-sign-out-alt"></i>
                  </button>
                </div>
              ) : (
                <div className="flex items-center space-x-3">
                  <a
                    href="https://github.com/ystemsrx/smart-shop"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center w-10 h-10 shrink-0 aspect-square rounded-xl bg-white/70 hover:bg-white/90 text-gray-700 hover:text-gray-900 transition-all duration-300 backdrop-blur-sm border border-white/30 hover:shadow-md"
                    title="查看GitHub源码"
                  >
                    <i className="fab fa-github text-lg"></i>
                  </a>

                  <Link
                    href="/login"
                    className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium text-gray-700 hover:text-gray-900 bg-white/70 hover:bg-white/90 backdrop-blur-sm border border-gray-200/60 hover:border-gray-300 transition-all duration-300 hover:shadow-sm"
                  >
                    <span>登录</span>
                    <i className="fas fa-arrow-right text-xs"></i>
                  </Link>
                </div>
              )}

            </div>
          </div>
        </div>
      </nav>

      {/* 移动端侧边栏菜单 */}
      <div className={`fixed inset-0 z-[45] md:hidden transition-all duration-300 ${mobileOpen ? 'visible' : 'invisible'}`}>
        {/* 遮罩层 */}
        <div 
          className={`absolute inset-0 bg-black/20 backdrop-blur-sm transition-opacity duration-300 ${mobileOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={closeMenu}
        />
        
        {/* 侧边栏 */}
        <div className={`absolute top-0 left-0 h-full w-80 max-w-sm bg-white/95 backdrop-blur-xl border-r border-white/20 shadow-2xl transform transition-all duration-300 ease-out ${mobileNavOpen} pt-20 flex flex-col`}>
          <div className="flex-1 p-6 space-y-4 overflow-y-auto">
            {/* 用户信息卡片 */}
            {user && (
              <div className="card-glass p-4 mb-6 animate-apple-slide-up">
                <div className="flex items-center space-x-3">
                   <div className={`w-12 h-12 rounded-full flex items-center justify-center shadow-sm ${userIconShell}`}>
                     <i className="fas fa-user"></i>
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
                    href={staffAiChatLink}
                    onClick={closeMenu}
                    className={`${active === 'staff-ai-chat' ? 'bg-purple-50 text-purple-600 border-purple-200' : 'text-gray-700 hover:bg-gray-50 border-transparent'} flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-200`}
                  >
                    <i className="fas fa-robot w-5"></i>
                    <span className="font-medium">管理助手</span>
                  </Link>
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
                  <Link href="/c" onClick={closeMenu} className={`${active === 'home' ? 'bg-purple-50 text-purple-600 border-purple-200' : 'text-gray-700 hover:bg-gray-50 border-transparent'} flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-200`}>
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
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gray-900 text-white font-medium transition-all duration-200 hover:bg-gray-800"
                >
                  <span>登录</span>
                  <i className="fas fa-arrow-right text-sm"></i>
                </Link>
              )}
            </div>
          </div>

          {/* GitHub链接 - 固定在侧边栏最底部 */}
          <div className="p-6 border-t border-gray-200/50">
            <a
              href="https://github.com/ystemsrx/smart-shop"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-700 font-medium transition-all duration-200"
              onClick={closeMenu}
            >
              <i className="fab fa-github"></i>
              <span>查看源码</span>
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
