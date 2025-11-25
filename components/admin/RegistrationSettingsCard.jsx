import React, { useEffect, useState } from 'react';
import { useApi } from '../../hooks/useAuth';

export const RegistrationSettingsCard = () => {
  const { apiRequest } = useApi();
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [reservationEnabled, setReservationEnabled] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    loadRegistrationStatus();
  }, []);

  const loadRegistrationStatus = async () => {
    try {
      const response = await apiRequest('/auth/registration-status');
      if (response.success) {
        setEnabled(response.data.enabled);
        setReservationEnabled(!!response.data.reservation_enabled);
      }
    } catch (e) {
      console.error('获取注册状态失败:', e);
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
      console.error('更新注册设置失败:', e);
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
    await updateSettings(enabled, !reservationEnabled);
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 用户注册控制 */}
        <div className="flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-600">用户注册</div>
              <div className={`text-lg font-semibold mt-1 ${enabled ? 'text-green-700' : 'text-gray-700'}`}>
                {enabled ? '已启用' : '已关闭'}
              </div>
            </div>
            <button
              onClick={toggleRegistration}
              disabled={updating}
              className={`px-4 py-2 rounded-md text-white font-semibold transition-colors ${
                enabled
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-green-600 hover:bg-green-700'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {enabled ? '关闭注册' : '启用注册'}
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-500">开启后，用户将能自行注册账户登录。</p>
        </div>

        {/* 预约下单控制 */}
        <div className="flex flex-col justify-between md:border-l md:border-gray-200 md:pl-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-600">预约下单</div>
              <div className={`text-lg font-semibold mt-1 ${reservationEnabled ? 'text-teal-600' : 'text-gray-700'}`}>
                {reservationEnabled ? '已开启' : '未开启'}
              </div>
            </div>
            <button
              onClick={toggleReservation}
              disabled={updating}
              className={`px-4 py-2 rounded-md text-white font-semibold transition-colors ${
                reservationEnabled
                  ? 'bg-slate-500 hover:bg-slate-600'
                  : 'bg-teal-500 hover:bg-teal-600'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {reservationEnabled ? '关闭预约' : '开启预约'}
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-500">开启后，店铺打烊时用户仍可提交预约订单，工作人员可在营业后处理。</p>
        </div>
      </div>
    </div>
  );
};

export default RegistrationSettingsCard;
