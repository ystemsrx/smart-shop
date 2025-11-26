import React, { useEffect, useState } from 'react';
import { useApi } from '../../hooks/useAuth';

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

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await apiRequest(`${apiPrefix}/delivery-settings`);
      const settingsData = res?.data?.settings;
      if (settingsData) {
        const newSettings = {
          delivery_fee: settingsData.delivery_fee !== undefined && settingsData.delivery_fee !== null ? settingsData.delivery_fee : 1.0,
          free_delivery_threshold: settingsData.free_delivery_threshold !== undefined && settingsData.free_delivery_threshold !== null ? settingsData.free_delivery_threshold : 10.0
        };
        setSettings(newSettings);
        setOriginalSettings(newSettings);
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="配送费"
                  disabled={saving}
                />
                <span className="absolute right-3 top-2 text-gray-400">元</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">免配送费门槛</label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={settings.free_delivery_threshold}
                  onChange={(e) => setSettings({...settings, free_delivery_threshold: e.target.value})}
                  onBlur={(e) => handleBlur('free_delivery_threshold', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="免配送费门槛"
                  disabled={saving}
                />
                <span className="absolute right-3 top-2 text-gray-400">元</span>
              </div>
            </div>
          </div>
          
          <div className="mt-4">
            <p className="text-sm text-gray-600">
              {settings.delivery_fee === 0 || settings.delivery_fee === '0' ? (
                <>
                  基础配送费已设为0，所有订单均享受免费配送
                </>
              ) : (
                <>
                  当商品金额达到 <span className="font-medium text-gray-800">¥{settings.free_delivery_threshold}</span> 时免收配送费，
                  否则收取 <span className="font-medium text-gray-800">¥{settings.delivery_fee}</span> 配送费
                </>
              )}
              {saving && (
                <span className="ml-3 text-indigo-600">
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
