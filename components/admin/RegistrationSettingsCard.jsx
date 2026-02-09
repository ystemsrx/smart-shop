import React, { useEffect, useState } from 'react';
import { useApi } from '../../hooks/useAuth';
import { motion } from 'framer-motion';

export const RegistrationSettingsCard = () => {
  const { apiRequest } = useApi();
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [reservationEnabled, setReservationEnabled] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [cycleLocked, setCycleLocked] = useState(false);

  useEffect(() => {
    loadRegistrationStatus();
  }, []);

  const loadRegistrationStatus = async () => {
    try {
      const response = await apiRequest('/auth/registration-status');
      if (response.success) {
        setEnabled(response.data.enabled);
        setReservationEnabled(!!response.data.reservation_enabled);
        setCycleLocked(!!response.data.cycle_locked);
      }
    } catch (e) {
      console.error('Failed to fetch registration status:', e);
    } finally {
      setLoading(false);
    }
  };

  const updateSettings = async (nextEnabled, nextReservation) => {
    const prevEnabled = enabled;
    const prevReservation = reservationEnabled;
    setEnabled(nextEnabled);
    setReservationEnabled(nextReservation);
    setUpdating(true);
    try {
      const response = await apiRequest(`/admin/registration-settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          enabled: nextEnabled,
          reservation_enabled: nextReservation
        })
      });
      if (!response.success) {
        throw new Error(response.message || '更新失败');
      }
    } catch (e) {
      console.error('Failed to update registration settings:', e);
      setEnabled(prevEnabled);
      setReservationEnabled(prevReservation);
      alert('更新注册/预约设置失败');
    } finally {
      setUpdating(false);
    }
  };

  const toggleRegistration = async () => {
    await updateSettings(!enabled, reservationEnabled);
  };

  const toggleReservation = async () => {
    if (cycleLocked) return;
    await updateSettings(enabled, !reservationEnabled);
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
      transition={{ delay: 0.1 }}
      className="bg-white rounded-2xl shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] border border-gray-100 p-6 h-full"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 h-full">
        {/* 用户注册控制 */}
        <div className="flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-gray-500">用户注册</div>
              <div className={`text-sm font-bold px-2 py-0.5 rounded-full ${enabled ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                {enabled ? '已启用' : '已关闭'}
              </div>
            </div>
            <p className="text-xs text-gray-400 mb-4 leading-relaxed">开启后，用户将能自行注册账户登录。</p>
          </div>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={toggleRegistration}
            disabled={updating}
            className={`w-full px-4 py-2.5 rounded-xl text-sm font-semibold text-white shadow-sm transition-colors ${
              enabled
                ? 'bg-red-500 hover:bg-red-600 shadow-red-200'
                : 'bg-green-500 hover:bg-green-600 shadow-green-200'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {enabled ? '关闭注册' : '启用注册'}
          </motion.button>
        </div>

        {/* 预约下单控制 */}
        <div className="flex flex-col justify-between md:border-l md:border-gray-100 md:pl-8">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-gray-500">预约下单</div>
              <div className={`text-sm font-bold px-2 py-0.5 rounded-full ${reservationEnabled ? 'bg-teal-50 text-teal-600' : 'bg-gray-100 text-gray-500'}`}>
                {reservationEnabled ? '已开启' : '未开启'}
              </div>
            </div>
            <p className="text-xs text-gray-400 mb-4 leading-relaxed">开启后，店铺打烊时用户仍可提交预约订单。</p>
          </div>
          <motion.button
            whileHover={cycleLocked ? undefined : { scale: 1.02 }}
            whileTap={cycleLocked ? undefined : { scale: 0.98 }}
            onClick={toggleReservation}
            disabled={updating || cycleLocked}
            className={`w-full px-4 py-2.5 rounded-xl text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              reservationEnabled
                ? 'bg-slate-500 hover:bg-slate-600 shadow-slate-200'
                : 'bg-teal-500 hover:bg-teal-600 shadow-teal-200'
            }`}
          >
            {reservationEnabled ? '关闭预约' : '开启预约'}
          </motion.button>
          {cycleLocked && (
            <div className="mt-3 text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              当前周期已结束，请先在仪表盘撤销或开启新周期。
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default RegistrationSettingsCard;
