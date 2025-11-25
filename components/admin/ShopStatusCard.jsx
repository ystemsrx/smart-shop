import React, { useEffect, useState } from 'react';
import { useAdminShop } from '../../hooks/useAuth';

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
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
          <div className="h-6 bg-gray-200 rounded w-1/3"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <div className="flex gap-6">
        {/* 左侧：状态和按钮 */}
        <div className="flex-shrink-0">
          <div className="text-sm text-gray-600 mb-2">店铺状态</div>
          <div className={`text-lg font-semibold mb-3 ${isOpen ? 'text-green-700' : 'text-red-700'}`}>
            {isOpen ? '营业中' : '打烊中'}
          </div>
          <button
            onClick={toggle}
            className={`px-4 py-2 rounded-md text-white font-semibold ${
              isOpen 
                ? 'bg-red-600 hover:bg-red-700' 
                : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {isOpen ? '设为打烊' : '设为营业'}
          </button>
        </div>
        
        {/* 右侧：打烊提示语输入框 */}
        <div className="flex-1">
          <div className="text-sm text-gray-600 mb-2">打烊提示语</div>
          <textarea
            placeholder="可输入打烊时显示给顾客的提示信息..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={saveNote}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            style={{ height: '82px' }}
          />
        </div>
      </div>
    </div>
  );
};

export default ShopStatusCard;
