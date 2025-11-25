import React, { useRef, useState, useEffect } from 'react';
import { motion, useMotionValue, useTransform, useSpring } from 'framer-motion';
import { 
  ChevronLeft, ChevronRight, LogOut, User 
} from 'lucide-react';

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
      title={isCollapsed ? tab.label : undefined}
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
      
      <motion.span
        initial={false}
        animate={{ opacity: isCollapsed ? 0 : 1, display: isCollapsed ? "none" : "block" }}
        transition={{ duration: 0.2 }}
        className="ml-3 font-medium whitespace-nowrap overflow-hidden text-sm"
      >
        {tab.label}
      </motion.span>
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
  onLogout 
}) {
  const mouseY = useMotionValue(Infinity);
  const [isMobile, setIsMobile] = useState(false);

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
      <div className={`p-3 border-b border-gray-100 flex items-center flex-shrink-0 ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
        {/* User Avatar and Info - hide avatar when collapsed */}
        {!isCollapsed && (
          <div className="flex items-center min-w-0 flex-1">
            {/* User Avatar */}
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0 shadow-sm">
              <User size={18} className="text-white" />
            </div>
            
            {/* User Info */}
            <div className="ml-2.5 min-w-0 overflow-hidden">
              <div className="text-sm font-semibold text-gray-900 truncate">
                {role === 'admin' ? '管理员' : '代理商'}
              </div>
              <div className="text-xs text-gray-500 truncate">
                {role === 'admin' ? 'Admin' : 'Agent'}
              </div>
            </div>
          </div>
        )}

        {/* Toggle Button */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors flex-shrink-0"
        >
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
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
