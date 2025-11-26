import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

export const Modal = ({ isOpen, onClose, title, children, size = 'large' }) => {
  const sizeClasses = {
    small: "max-w-md",
    medium: "max-w-lg", 
    large: "max-w-4xl",
    xlarge: "max-w-6xl"
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] overflow-y-auto overflow-x-hidden">
          <div className="flex min-h-screen items-center justify-center p-4 text-center">
            {/* 背景遮罩 */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm"
              onClick={onClose}
            />
            
            {/* 模态内容 */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ 
                type: "spring",
                stiffness: 350,
                damping: 25,
                mass: 0.8
              }}
              className={`relative w-full ${sizeClasses[size]} bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col text-left transform align-middle`}
            >
              {/* 标题栏 */}
              <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-white/80 backdrop-blur-md z-10">
                <h3 className="text-lg font-bold text-gray-900">{title}</h3>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-full bg-gray-50 hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-all duration-200 focus:outline-none active:scale-95"
                  aria-label="关闭"
                >
                  <X size={18} />
                </button>
              </div>
              
              {/* 内容区域 - 可滚动 */}
              <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                {children}
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default Modal;
