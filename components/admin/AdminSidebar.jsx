import React, { useRef, useState, useEffect } from 'react';
import { motion, useMotionValue, useTransform, useSpring, AnimatePresence } from 'framer-motion';
import { 
  ChevronLeft, ChevronRight, LogOut, User, ChevronUp, ChevronDown 
} from 'lucide-react';

const formatHeaderName = (name) => {
  const text = String(name || '').trim();
  if (text.length <= 3) return text || '---';
  return `${text.slice(0, 3)}...`;
};

const formatMenuName = (name) => {
  const text = String(name || '').trim();
  if (text.length <= 3) return text || '---';
  return `${text.slice(0, 2)}...`;
};

const SidebarItem = ({ tab, activeTab, setActiveTab, isCollapsed, mouseY, onItemClick, isMobile }) => {
  const ref = useRef(null);
  
  const distance = useTransform(mouseY, (val) => {
    const bounds = ref.current?.getBoundingClientRect() ?? { y: 0, height: 0 };
    return val - bounds.y - bounds.height / 2;
  });

  // Exaggerated scale effect for ICON only - disabled on mobile
  const scaleSync = useTransform(distance, [-120, 0, 120], [1, 2.5, 1]);
  const scale = useSpring(scaleSync, { mass: 0.1, stiffness: 200, damping: 15 });
  
  // X offset to push the icon out slightly when scaled - disabled on mobile
  const xSync = useTransform(distance, [-120, 0, 120], [0, 10, 0]);
  const x = useSpring(xSync, { mass: 0.1, stiffness: 200, damping: 15 });

  // Label opacity based on distance - only visible when very close (hovered)
  const labelOpacity = useTransform(distance, [-30, 0, 30], [0, 1, 0]);
  const labelX = useTransform(distance, [-30, 0, 30], [10, 20, 10]);
  const labelScale = useTransform(distance, [-30, 0, 30], [0.8, 1, 0.8]);

  const handleClick = () => {
    setActiveTab(tab.id);
    // 点击后调用回调，用于手机版自动折叠
    if (onItemClick) onItemClick();
  };

  // 手机版不使用放大效果
  const shouldScale = isCollapsed && !isMobile;

  return (
    <motion.button
      ref={ref}
      onClick={handleClick}
      // Dynamic z-index to ensure the magnified item is on top
      style={{ zIndex: useTransform(distance, (d) => Math.abs(d) < 60 ? 50 : 1) }}
      className={`w-full flex items-center p-2.5 rounded-lg transition-colors duration-200 group relative ${
        isCollapsed ? 'justify-center' : ''
      } ${
        activeTab === tab.id 
          ? 'text-blue-600' 
          : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
      }`}
    >
      {activeTab === tab.id && (
        <motion.div
          layoutId="activeTab"
          className="absolute inset-0 bg-blue-50 rounded-lg -z-10"
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        />
      )}

      <motion.div 
        style={{ scale: shouldScale ? scale : 1, x: shouldScale ? x : 0 }}
        className="relative flex-shrink-0 w-5 h-5 flex items-center justify-center origin-center"
      >
        {tab.icon}
        {tab.badge && (
          <span className={`absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] flex items-center justify-center px-1 rounded-full text-[10px] font-bold text-white ${tab.badgeColor || 'bg-red-500'} border-2 border-white`}>
            {tab.badge}
          </span>
        )}
        {tab.warning && (
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white animate-pulse" />
        )}
      </motion.div>
      
      {/* Expanded Label */}
      <motion.span
        initial={false}
        animate={{ opacity: isCollapsed ? 0 : 1, display: isCollapsed ? "none" : "block" }}
        transition={{ duration: 0.2 }}
        className="ml-3 font-medium whitespace-nowrap overflow-hidden text-sm"
      >
        {tab.label}
      </motion.span>

      {/* Collapsed Floating Label */}
      {shouldScale && (
        <motion.div
          style={{ 
            opacity: labelOpacity, 
            x: labelX, 
            scale: labelScale,
            left: '100%',
            pointerEvents: 'none'
          }}
          className="absolute ml-2 px-2 py-1 bg-gray-900 text-white text-xs font-medium rounded-md shadow-lg whitespace-nowrap z-50"
        >
          {tab.label}
        </motion.div>
      )}
    </motion.button>
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
  const mouseY = useMotionValue(Infinity);
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
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768 || 'ontouchstart' in window;
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
    return () => window.removeEventListener('resize', updatePosition);
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
  const resolvedAgentName = resolvedAgent?.name || userName || (role === 'admin' ? 'Admin' : '');
  const headerDisplayName = formatHeaderName(resolvedAgentName);

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
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="h-[calc(100vh-64px)] sticky top-16 bg-white border-r border-gray-100 flex flex-col shadow-sm z-40 overflow-visible flex-shrink-0"
      onMouseMove={(e) => !isMobile && mouseY.set(e.clientY)}
      onMouseLeave={() => mouseY.set(Infinity)}
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
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0 shadow-sm">
              <User size={18} className="text-white" />
            </div>
            
            <div className="ml-2.5 flex-1 min-w-0 overflow-hidden">
              <div className="text-sm font-semibold text-gray-900 truncate" title={resolvedAgentName || roleLabel}>
                {headerDisplayName || roleLabel}
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
              initial={{ opacity: 0, scale: 0.95, y: -8, filter: "blur(4px)" }}
              animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, scale: 0.95, y: -8, filter: "blur(4px)" }}
              transition={{ 
                type: "spring", 
                stiffness: 500, 
                damping: 30, 
                mass: 1 
              }}
              ref={menuRef}
              style={menuStyle}
              className="bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden origin-top-left"
            >
              <div className="max-h-72 overflow-y-auto space-y-1 p-2">
                {agentOptions.map((agent, idx) => {
                  const isActive = agent.id === currentSelection;
                  const disabled = agent.isDeleted || switchDisabled;
                  const badgeClass = agent.isDeleted
                    ? 'bg-gray-200'
                    : agent.isActive !== false ? 'bg-emerald-500' : 'bg-red-500';
                  const avatarColors = [
                    'from-blue-500 to-indigo-500',
                    'from-emerald-500 to-teal-500',
                    'from-amber-500 to-orange-500',
                    'from-purple-500 to-pink-500'
                  ];
                  const gradient = avatarColors[idx % avatarColors.length];
                  const baseName = agent.name || agent.id || '';
                  const avatarLabel = (baseName || '代').slice(0, 2) || '代';
                  const menuDisplayName = formatMenuName(baseName);
                  return (
                    <button
                      key={agent.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => handleAgentClick(agent.id)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border transition-all duration-150 ${
                        isActive
                          ? 'bg-blue-50 border-blue-300 text-blue-700'
                          : 'bg-white border-gray-100 text-gray-700 hover:bg-gray-50'
                      } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-xs font-bold text-white shadow-sm`}>
                          {avatarLabel}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold" title={baseName}>
                            {menuDisplayName}
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

      {/* Navigation Items */}
      <div className="flex-1 py-4 px-2 space-y-3 overflow-y-visible overflow-x-visible scrollbar-hide">
        {tabs.map((tab) => (
          <SidebarItem 
            key={tab.id}
            tab={tab}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            isCollapsed={isCollapsed}
            mouseY={mouseY}
            onItemClick={handleItemClick}
            isMobile={isMobile}
          />
        ))}
      </div>

      {/* Logout Button at Bottom */}
      <div className="p-2 border-t border-gray-100 flex-shrink-0">
        <LogoutButton 
          onLogout={onLogout} 
          isCollapsed={isCollapsed} 
          mouseY={mouseY}
          onItemClick={handleItemClick}
          isMobile={isMobile}
        />
      </div>
    </motion.div>
  );
}

const LogoutButton = ({ onLogout, isCollapsed, mouseY, onItemClick, isMobile }) => {
  const ref = useRef(null);
  
  const distance = useTransform(mouseY, (val) => {
    const bounds = ref.current?.getBoundingClientRect() ?? { y: 0, height: 0 };
    return val - bounds.y - bounds.height / 2;
  });

  const scaleSync = useTransform(distance, [-120, 0, 120], [1, 2.5, 1]);
  const scale = useSpring(scaleSync, { mass: 0.1, stiffness: 200, damping: 15 });

  const xSync = useTransform(distance, [-120, 0, 120], [0, 10, 0]);
  const x = useSpring(xSync, { mass: 0.1, stiffness: 200, damping: 15 });

  const handleClick = () => {
    if (onItemClick) onItemClick();
    onLogout();
  };

  // 手机版不使用放大效果
  const shouldScale = isCollapsed && !isMobile;

  return (
    <motion.button 
      ref={ref}
      onClick={handleClick}
      style={{ zIndex: useTransform(distance, (d) => Math.abs(d) < 60 ? 50 : 1) }}
      className={`w-full flex items-center p-2.5 rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-500 transition-colors group relative ${isCollapsed ? 'justify-center' : ''}`}
      title="退出登录"
    >
      <motion.div 
        style={{ scale: shouldScale ? scale : 1, x: shouldScale ? x : 0 }}
        className="w-5 h-5 flex-shrink-0 flex items-center justify-center origin-center"
      >
        <LogOut size={20} />
      </motion.div>
      <motion.span
        initial={false}
        animate={{ opacity: isCollapsed ? 0 : 1, display: isCollapsed ? "none" : "block" }}
        transition={{ duration: 0.2 }}
        className="ml-3 font-medium whitespace-nowrap overflow-hidden text-sm"
      >
        退出登录
      </motion.span>
    </motion.button>
  );
};
