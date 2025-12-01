import React, { useEffect, useState } from 'react';
import { useApi } from '../../hooks/useAuth';

// 当 free_delivery_threshold >= 此值时，视为"始终收取配送费"
const ALWAYS_CHARGE_THRESHOLD = 999999999;

export const DeliverySettingsPanel = ({ apiPrefix, apiRequest: injectedApiRequest }) => {
  const { apiRequest: contextApiRequest } = useApi();
  const apiRequest = injectedApiRequest || contextApiRequest;
  const [settings, setSettings] = useState({
    delivery_fee: 1.0,
    free_delivery_threshold: 10.0
  });
  const [originalSettings, setOriginalSettings] = useState({
    delivery_fee: 1.0,
    free_delivery_threshold: 10.0
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // "始终收取配送费"开关状态
  const [alwaysCharge, setAlwaysCharge] = useState(false);
  // 记录开启开关前的门槛值，以便关闭时恢复
  const [savedThreshold, setSavedThreshold] = useState(10.0);
  // 开关专用的保存状态（用于显示小loading indicator，不阻塞UI）
  const [toggleSaving, setToggleSaving] = useState(false);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await apiRequest(`${apiPrefix}/delivery-settings`);
      const settingsData = res?.data?.settings;
      if (settingsData) {
        const deliveryFee = settingsData.delivery_fee !== undefined && settingsData.delivery_fee !== null ? settingsData.delivery_fee : 1.0;
        const freeThreshold = settingsData.free_delivery_threshold !== undefined && settingsData.free_delivery_threshold !== null ? settingsData.free_delivery_threshold : 10.0;
        
        // 判断是否为"始终收取配送费"模式
        const isAlwaysCharge = freeThreshold >= ALWAYS_CHARGE_THRESHOLD;
        
        const newSettings = {
          delivery_fee: deliveryFee,
          free_delivery_threshold: freeThreshold
        };
        setSettings(newSettings);
        setOriginalSettings(newSettings);
        setAlwaysCharge(isAlwaysCharge);
        // 如果不是始终收费模式，保存当前门槛值
        if (!isAlwaysCharge) {
          setSavedThreshold(freeThreshold);
        }
      }
    } catch (e) {
      console.warn('加载配送费设置失败:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadSettings(); }, [apiPrefix, apiRequest]);

  const handleSave = async (field, value) => {
    const numericValue = typeof value === 'number' ? value : parseFloat(value);
    
    if (field === 'delivery_fee' && numericValue < 0) {
      alert('配送费不能为负数');
      setSettings({...settings, [field]: originalSettings[field]});
      return;
    }

    if (field === 'free_delivery_threshold' && numericValue < 0) {
      alert('免配送费门槛不能为负数');
      setSettings({...settings, [field]: originalSettings[field]});
      return;
    }

    setSaving(true);
    try {
      const newSettings = { ...originalSettings, [field]: numericValue };
      
      // 当基础配送费设为0时，自动将免配送费门槛也设为0
      if (field === 'delivery_fee' && numericValue === 0) {
        newSettings.free_delivery_threshold = 0;
      }
      
      await apiRequest(`${apiPrefix}/delivery-settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          delivery_fee: newSettings.delivery_fee,
          free_delivery_threshold: newSettings.free_delivery_threshold
        })
      });
      
      // 保存成功后重新加载数据
      await loadSettings();
    } catch (e) {
      alert(e.message || '保存配送费设置失败');
      // 恢复到之前的值
      setSettings({...settings, [field]: originalSettings[field]});
    } finally {
      setSaving(false);
    }
  };

  const handleBlur = (field, value) => {
    // 将输入值转换为数字并验证
    const numericValue = parseFloat(value);
    const originalValue = originalSettings[field];
    
    // 检查输入是否有效
    if (isNaN(numericValue)) {
      // 恢复到原始值
      setSettings({...settings, [field]: originalValue});
      return;
    }
    
    // 只有当值确实改变时才保存（使用更严格的比较）
    if (Math.abs(numericValue - originalValue) > 0.001) {
      handleSave(field, numericValue);
    } else {
      // 如果值没有改变，确保显示格式一致
      setSettings({...settings, [field]: originalValue});
    }
  };

  // 处理"始终收取配送费"开关切换（乐观更新）
  const handleAlwaysChargeToggle = (checked) => {
    // 防止重复点击
    if (toggleSaving) return;
    
    // 保存当前状态以便回滚
    const prevAlwaysCharge = alwaysCharge;
    const prevThreshold = savedThreshold;
    
    // 乐观更新 UI（立即响应）
    if (checked) {
      // 开启：保存当前门槛值
      const currentThreshold = settings.free_delivery_threshold;
      if (currentThreshold < ALWAYS_CHARGE_THRESHOLD) {
        setSavedThreshold(currentThreshold);
      }
      setAlwaysCharge(true);
    } else {
      // 关闭
      setAlwaysCharge(false);
    }
    
    // 后台异步保存
    setToggleSaving(true);
    const targetThreshold = checked ? ALWAYS_CHARGE_THRESHOLD : savedThreshold;
    
    apiRequest(`${apiPrefix}/delivery-settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        delivery_fee: originalSettings.delivery_fee,
        free_delivery_threshold: targetThreshold
      })
    })
      .then(() => {
        // 成功：更新 originalSettings
        setOriginalSettings(prev => ({ ...prev, free_delivery_threshold: targetThreshold }));
        setSettings(prev => ({ ...prev, free_delivery_threshold: targetThreshold }));
      })
      .catch((e) => {
        // 失败：回滚状态
        console.error('保存配送费设置失败:', e);
        setAlwaysCharge(prevAlwaysCharge);
        setSavedThreshold(prevThreshold);
        alert(e.message || '保存失败，请重试');
      })
      .finally(() => {
        setToggleSaving(false);
      });
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="px-6 py-4 border-b border-gray-200">
        <div>
          <h3 className="text-lg font-medium text-gray-900">配送费设置</h3>
          <p className="text-sm text-gray-600">设置基础配送费和免配送费门槛。</p>
        </div>
      </div>
      
      {loading ? (
        <div className="px-6 py-6 text-sm text-gray-500">加载中...</div>
      ) : (
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">基础配送费</label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={settings.delivery_fee}
                  onChange={(e) => setSettings({...settings, delivery_fee: e.target.value})}
                  onBlur={(e) => handleBlur('delivery_fee', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="配送费"
                  disabled={saving}
                />
                <span className="absolute right-3 top-2 text-gray-400">元</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">免配送费门槛</label>
              <div className="relative">
                {alwaysCharge ? (
                  <div className="w-full px-3 py-2 border border-gray-200 rounded-md bg-gray-100 text-gray-400 cursor-not-allowed select-none flex items-center">
                    <span className="text-2xl font-light leading-none" style={{ marginTop: '-2px' }}>∞</span>
                  </div>
                ) : (
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={settings.free_delivery_threshold}
                    onChange={(e) => setSettings({...settings, free_delivery_threshold: e.target.value})}
                    onBlur={(e) => handleBlur('free_delivery_threshold', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
                    placeholder="免配送费门槛"
                    disabled={saving}
                  />
                )}
                <span className="absolute right-3 top-2 text-gray-400">元</span>
              </div>
            </div>
          </div>
          
          {/* 始终收取配送费开关 */}
          <div className="mt-5 flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={alwaysCharge}
              onClick={() => handleAlwaysChargeToggle(!alwaysCharge)}
              disabled={toggleSaving}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 ${
                alwaysCharge ? 'bg-amber-500' : 'bg-gray-200'
              } ${toggleSaving ? 'cursor-wait' : ''}`}
              style={{ transition: 'background-color 150ms cubic-bezier(0.4, 0, 0.2, 1)' }}
            >
              <span
                className="pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md ring-0"
                style={{
                  transform: alwaysCharge ? 'translateX(20px)' : 'translateX(0)',
                  transition: 'transform 150ms cubic-bezier(0.4, 0, 0.2, 1)'
                }}
              />
            </button>
            <span className="text-sm font-medium text-gray-700">
              始终收取配送费
            </span>
            {toggleSaving ? (
              <span className="text-xs text-amber-600 flex items-center gap-1">
                <i className="fas fa-circle-notch fa-spin text-[10px]"></i>
                保存中
              </span>
            ) : (
              <span className="text-xs text-gray-500">
                （开启后无论订单金额多少都将收取配送费）
              </span>
            )}
          </div>
          
          <div className="mt-4">
            <p className="text-sm text-gray-600">
              {settings.delivery_fee === 0 || settings.delivery_fee === '0' ? (
                <>
                  基础配送费已设为0，所有订单均享受免费配送
                </>
              ) : alwaysCharge ? (
                <>
                  已开启始终收取配送费，所有订单均收取 <span className="font-medium text-gray-800">¥{settings.delivery_fee}</span> 配送费
                </>
              ) : (
                <>
                  当商品金额达到 <span className="font-medium text-gray-800">¥{settings.free_delivery_threshold}</span> 时免收配送费，
                  否则收取 <span className="font-medium text-gray-800">¥{settings.delivery_fee}</span> 配送费
                </>
              )}
              {saving && (
                <span className="ml-3 text-amber-600">
                  <i className="fas fa-spinner fa-spin mr-1"></i>
                  保存中...
                </span>
              )}
            </p>
            <p className="text-xs text-gray-500 mt-2">
              修改数值后点击其他地方即可自动保存
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeliverySettingsPanel;
