import React, { useEffect, useState } from 'react';
import { useAdminShop } from '../../hooks/useAuth';
import { motion } from 'framer-motion';

export const ShopStatusCard = () => {
  const { getStatus, updateStatus } = useAdminShop();
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(true);
  const [note, setNote] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const s = await getStatus();
        setIsOpen(!!s.data?.is_open);
        setNote(s.data?.note || '');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const toggle = async () => {
    const next = !isOpen;
    setIsOpen(next);
    try { await updateStatus(next, note); } catch (e) {}
  };

  const saveNote = async () => {
    try { 
      await updateStatus(isOpen, note);
    } catch (e) {
      console.error('保存提示失败:', e);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 h-full">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-100 rounded w-1/4"></div>
          <div className="h-10 bg-gray-100 rounded w-1/3"></div>
        </div>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] border border-gray-100 p-6 h-full flex flex-col justify-between"
    >
      <div className="flex flex-col sm:flex-row gap-6 h-full">
        {/* 左侧：状态和按钮 */}
        <div className="flex-shrink-0 flex flex-col justify-between min-w-[140px]">
          <div>
            <div className="text-sm font-medium text-gray-500 mb-1">店铺状态</div>
            <div className={`text-2xl font-bold tracking-tight mb-4 ${isOpen ? 'text-green-600' : 'text-red-600'}`}>
              {isOpen ? '营业中' : '打烊中'}
            </div>
          </div>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={toggle}
            className={`w-full px-4 py-2.5 rounded-xl text-sm font-semibold text-white shadow-sm transition-colors ${
              isOpen 
                ? 'bg-red-500 hover:bg-red-600 shadow-red-200' 
                : 'bg-green-500 hover:bg-green-600 shadow-green-200'
            }`}
          >
            {isOpen ? '设为打烊' : '设为营业'}
          </motion.button>
        </div>
        
        {/* 右侧：打烊提示语输入框 */}
        <div className="flex-1 flex flex-col">
          <div className="text-sm font-medium text-gray-500 mb-2">打烊提示语</div>
          <textarea
            placeholder="可输入打烊时显示给顾客的提示信息..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={saveNote}
            className="w-full flex-1 min-h-[80px] px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none"
          />
        </div>
      </div>
    </motion.div>
  );
};

export default ShopStatusCard;
