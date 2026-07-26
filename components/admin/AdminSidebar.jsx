import React, { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, ChevronRight, LogOut, User, ChevronUp, ChevronDown
} from 'lucide-react';

const SidebarItem = ({ tab, activeTab, setActiveTab, isCollapsed, onItemClick }) => {
  const isActive = activeTab === tab.id;

  const handleClick = () => {
    setActiveTab(tab.id);
    // 点击后调用回调，用于手机版自动折叠
    if (onItemClick) onItemClick();
  };

  return (
    <button
      onClick={handleClick}
      title={tab.label}
      className={`w-full flex items-center p-2.5 rounded-lg transition-colors duration-150 group relative ${
        isCollapsed ? 'justify-center' : ''
      } ${
        isActive
          ? 'text-blue-600'
          : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
      }`}
    >
      {isActive && (
        <motion.div
          layoutId="activeTab"
          className="absolute inset-0 bg-blue-50 rounded-lg -z-10"
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        />
      )}

      <div className="relative flex-shrink-0 w-5 h-5 flex items-center justify-center">
        {tab.icon}
        {tab.badge && (
          <span className={`absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] flex items-center justify-center px-1 rounded-full text-[10px] font-bold text-white ${tab.badgeColor || 'bg-red-500'} border-2 border-white`}>
            {tab.badge}
          </span>
        )}
        {tab.warning && (
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white animate-pulse" />
        )}
      </div>

      {/* Expanded Label */}
      <AnimatePresence initial={false}>
        {!isCollapsed && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className={`ml-3 font-medium whitespace-nowrap overflow-hidden text-sm truncate ${
              isActive ? 'font-semibold' : ''
            }`}
          >
            {tab.label}
          </motion.span>
        )}
      </AnimatePresence>

    </button>
  );
};

export function AdminSidebar({
  activeTab,
  setActiveTab,
  tabs,
  isCollapsed,
  setIsCollapsed,
  role,
  onLogout,
  agentOptions = [],
  selectedAgentId = null,
  onAgentSelect,
  switchDisabled = false,
  userName = ''
}) {
  const [isMobile, setIsMobile] = useState(false);
  const [showAgentMenu, setShowAgentMenu] = useState(false);
  const headerRef = useRef(null);
  const menuRef = useRef(null);
  const [menuStyle, setMenuStyle] = useState({});

  const updateMenuPosition = () => {
    const rect = headerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const padding = 8;
    setMenuStyle({
      position: 'fixed',
      top: rect.bottom + 10,
      left: rect.left + padding,
      width: Math.max(140, rect.width - padding * 2),
      zIndex: 100
    });
  };

  // 检测是否为移动设备
  // 使用 pointer: coarse 媒体查询来检测主要输入设备是否为触摸屏
  // 同时结合屏幕宽度，避免将触屏电脑误判为手机
  useEffect(() => {
    const checkMobile = () => {
      // 检测是否为真正的移动设备：
      // 1. 屏幕宽度小于768px
      // 2. 或者主要指针设备是粗略的（触摸屏手机/平板）且屏幕宽度小于1024px
      const isNarrowScreen = window.innerWidth < 768;
      const isCoarsePointerDevice = window.matchMedia('(pointer: coarse)').matches;
      const isMediumScreen = window.innerWidth < 1024;

      // 真正的手机：窄屏幕，或者是触摸设备且不是大屏幕（排除触屏电脑）
      const mobile = isNarrowScreen || (isCoarsePointerDevice && isMediumScreen);
      setIsMobile(mobile);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (!showAgentMenu) return;
    const handleClickOutside = (e) => {
      if (
        headerRef.current && headerRef.current.contains(e.target)
      ) return;
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      if (headerRef.current && !headerRef.current.contains(e.target)) {
        setShowAgentMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAgentMenu]);

  useEffect(() => {
    setShowAgentMenu(false);
  }, [isCollapsed]);

  useEffect(() => {
    if (!showAgentMenu) return;
    const updatePosition = () => {
      updateMenuPosition();
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [showAgentMenu]);

  const sidebarVariants = {
    expanded: { width: 180 },
    collapsed: { width: 64 }
  };

  // 点击菜单项后，如果是移动设备且侧栏展开，则自动折叠
  const handleItemClick = () => {
    if (isMobile && !isCollapsed) {
      setIsCollapsed(true);
    }
  };

  const canSwitchAgent = role === 'admin' && agentOptions.length > 0 && typeof onAgentSelect === 'function';
  const currentSelection = selectedAgentId || 'self';
  const resolvedAgent = agentOptions.find((a) => a.id === currentSelection) || agentOptions[0];
  const roleLabel = role === 'admin' && currentSelection !== 'self' ? 'Agent' : (role === 'admin' ? 'Admin' : 'Agent');
  const resolvedAgentName = resolvedAgent?.name || resolvedAgent?.account || userName || (role === 'admin' ? 'Admin' : '');
  const isDeletedSelection = !!resolvedAgent?.isDeleted;

  const handleAgentClick = (agentId) => {
    if (!canSwitchAgent || switchDisabled) return;
    setShowAgentMenu(false);
    if (agentId === currentSelection) return;
    onAgentSelect(agentId);
  };

  const handleToggleMenu = () => {
    if (showAgentMenu) {
      setShowAgentMenu(false);
      return;
    }
    updateMenuPosition();
    setShowAgentMenu(true);
  };

  return (
    <motion.div
      initial="expanded"
      animate={isCollapsed ? "collapsed" : "expanded"}
      variants={sidebarVariants}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="h-full bg-white border-r border-gray-100 flex flex-col shadow-sm z-40 overflow-visible flex-shrink-0"
    >
      {/* Header with User Avatar and Toggle */}
      <div
        ref={headerRef}
        className={`p-3 border-b border-gray-100 flex items-center flex-shrink-0 gap-2 ${isCollapsed ? 'justify-center' : 'justify-between'} relative`}
      >
        {/* User Avatar and Info - hide avatar when collapsed */}
        {!isCollapsed ? (
          <button
            type="button"
            disabled={!canSwitchAgent || switchDisabled}
            onClick={handleToggleMenu}
            className={`flex items-center text-left transition-colors rounded-lg ${canSwitchAgent ? 'hover:bg-gray-50' : ''} ${switchDisabled ? 'opacity-60 cursor-not-allowed' : ''}`}
            style={{ width: '140px' }}
          >
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0 shadow-sm">
              <User size={18} className="text-white" />
            </div>

            <div className="ml-2.5 flex-1 min-w-0 overflow-hidden">
              <div className={`text-sm font-semibold truncate ${isDeletedSelection ? 'text-gray-400 line-through' : 'text-gray-900'}`} title={resolvedAgentName || roleLabel}>
                {resolvedAgentName || roleLabel}
              </div>
              <div className="text-xs text-gray-500 truncate">
                {roleLabel}
              </div>
            </div>

            {canSwitchAgent && (
              <span className="flex flex-col items-center justify-center text-gray-400 flex-shrink-0 ml-1">
                <ChevronUp size={12} />
                <ChevronDown size={12} />
              </span>
            )}
          </button>
        ) : null}

        {/* Toggle Button */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors flex-shrink-0"
        >
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>

        <AnimatePresence>
          {canSwitchAgent && showAgentMenu && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -8 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              ref={menuRef}
              style={menuStyle}
              className="bg-white rounded-2xl shadow-lg ring-1 ring-black/5 overflow-hidden origin-top-left"
            >
              <div className="max-h-72 overflow-y-auto space-y-1 p-2">
                {agentOptions.map((agent) => {
                  const isActive = agent.id === currentSelection;
                  const disabled = switchDisabled;
                  const badgeClass = agent.isDeleted
                    ? 'bg-red-500'
                    : agent.isActive !== false ? 'bg-emerald-500' : 'bg-yellow-500';
                  const baseName = agent.name || agent.account || agent.id || '';
                  const avatarLabel = (baseName || '代').slice(0, 2) || '代';
                  return (
                    <button
                      key={agent.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => handleAgentClick(agent.id)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border transition-colors ${
                        isActive
                          ? 'bg-blue-50 border-blue-300 text-blue-700'
                          : 'bg-white border-gray-100 text-gray-700 hover:bg-gray-50'
                      } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-lg bg-slate-200 text-slate-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
                          {avatarLabel}
                        </div>
                        <div className="min-w-0">
                          <div className={`text-sm font-semibold truncate ${agent.isDeleted ? 'text-gray-400 line-through' : ''}`} title={baseName}>
                            {baseName}
                          </div>
                        </div>
                      </div>
                      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${badgeClass}`} />
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Navigation Items - scrollable on short screens */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-hide">
        <div className="py-4 px-2 space-y-3">
          {tabs.map((tab) => (
            <SidebarItem
              key={tab.id}
              tab={tab}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              isCollapsed={isCollapsed}
              onItemClick={handleItemClick}
            />
          ))}
        </div>
      </div>

      {/* Logout Button at Bottom */}
      <div className="p-2 border-t border-gray-100 flex-shrink-0">
        <LogoutButton
          onLogout={onLogout}
          isCollapsed={isCollapsed}
          onItemClick={handleItemClick}
        />
      </div>
    </motion.div>
  );
}

const LogoutButton = ({ onLogout, isCollapsed, onItemClick }) => {
  const handleClick = () => {
    if (onItemClick) onItemClick();
    onLogout();
  };

  return (
    <button
      onClick={handleClick}
      className={`w-full flex items-center p-2.5 rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-500 transition-colors duration-150 group relative ${isCollapsed ? 'justify-center' : ''}`}
      title="退出登录"
    >
      <div className="w-5 h-5 flex-shrink-0 flex items-center justify-center">
        <LogOut size={20} />
      </div>
      <AnimatePresence initial={false}>
        {!isCollapsed && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="ml-3 font-medium whitespace-nowrap overflow-hidden text-sm"
          >
            退出登录
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
};
