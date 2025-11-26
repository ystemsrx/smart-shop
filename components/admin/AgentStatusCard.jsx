import React, { useEffect, useState } from 'react';
import { useAgentStatus } from '../../hooks/useAuth';

export const AgentStatusCard = () => {
  const { getStatus, updateStatus } = useAgentStatus();
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(true);
  const [closedNote, setClosedNote] = useState('');
  const [allowReservation, setAllowReservation] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const s = await getStatus();
        setIsOpen(!!s.data?.is_open);
        setClosedNote(s.data?.closed_note || '');
        setAllowReservation(!!s.data?.allow_reservation);
      } catch (e) {
        console.error('获取代理状态失败:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const toggle = async () => {
    const next = !isOpen;
    setIsOpen(next);
    try { 
      await updateStatus(next, closedNote, allowReservation); 
    } catch (e) {
      console.error('更新代理状态失败:', e);
      setIsOpen(!next); // 恢复之前的状态
    }
  };

  const saveNote = async () => {
    try { 
      await updateStatus(isOpen, closedNote, allowReservation); 
    } catch (e) {
      console.error('保存提示失败:', e);
    }
  };

  const toggleReservation = async () => {
    const next = !allowReservation;
    setAllowReservation(next);
    try {
      await updateStatus(isOpen, closedNote, next);
    } catch (e) {
      console.error('更新预约状态失败:', e);
      setAllowReservation(!next);
    }
  };

  if (loading) {
    return (
      <div className="col-span-1 lg:col-span-2">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
              <div className="h-6 bg-gray-200 rounded w-1/3"></div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
              <div className="h-6 bg-gray-200 rounded w-1/3"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="col-span-1 lg:col-span-2">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 代理状态控制 */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex flex-col justify-between h-full">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-600">代理状态</div>
                <div className={`text-lg font-semibold mt-1 ${isOpen ? 'text-green-700' : 'text-red-700'}`}>
                  {isOpen ? '营业中' : '打烊中'}
                </div>
              </div>
              <button
                onClick={toggle}
                className={`px-4 py-2 rounded-md text-white font-semibold transition-colors ${
                  isOpen
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-green-600 hover:bg-green-700'
                }`}
              >
                {isOpen ? '设为打烊' : '设为营业'}
              </button>
            </div>
            <div className="mt-2">
              <textarea
                placeholder="打烊提示语（可选）"
                value={closedNote}
                onChange={(e) => setClosedNote(e.target.value)}
                onBlur={saveNote}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="mt-2 text-xs text-gray-500">打烊时显示给顾客的提示信息。</p>
            </div>
          </div>
        </div>

        {/* 预约下单控制 */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex flex-col justify-between h-full">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-600">预约下单</div>
                <div className={`text-lg font-semibold mt-1 ${allowReservation ? 'text-teal-600' : 'text-gray-700'}`}>
                  {allowReservation ? '已开启' : '未开启'}
                </div>
              </div>
              <button
                onClick={toggleReservation}
                className={`px-4 py-2 rounded-md text-white font-semibold transition-colors ${
                  allowReservation
                    ? 'bg-slate-500 hover:bg-slate-600'
                    : 'bg-teal-500 hover:bg-teal-600'
                }`}
              >
                {allowReservation ? '关闭预约' : '开启预约'}
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-500">开启后，店铺打烊时用户仍可提交预约订单，工作人员可在营业后处理。</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgentStatusCard;
