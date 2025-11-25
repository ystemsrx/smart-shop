import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useApi } from '../../hooks/useAuth';

export const GiftThresholdPanel = ({ apiPrefix, onWarningChange }) => {
  const { apiRequest } = useApi();
  const [thresholds, setThresholds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingThreshold, setEditingThreshold] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const checkForStockWarnings = useCallback((thresholdsData) => {
    const hasStockWarnings = thresholdsData.some(threshold => {
      if (!threshold.is_active) return false;
      if (!threshold.gift_products) return false;
      const itemList = Array.isArray(threshold.items) ? threshold.items : [];
      if (itemList.length === 0) return false;
      const hasAvailable = itemList.some(item => item && item.available);
      if (hasAvailable) return false;
      return true;
    });
    
    if (typeof onWarningChange === 'function') {
      onWarningChange(hasStockWarnings);
    }
  }, [onWarningChange]);

  const loadThresholds = async () => {
    setLoading(true);
    try {
      const res = await apiRequest(`${apiPrefix}/gift-thresholds?include_inactive=true`);
      const thresholdsData = res?.data?.thresholds || [];
      setThresholds(thresholdsData);
      checkForStockWarnings(thresholdsData);
    } catch (e) {
      alert(e.message || '加载满额门槛配置失败');
      setThresholds([]);
      checkForStockWarnings([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadThresholds(); }, []);

  const handleDelete = async (thresholdId) => {
    if (!confirm('确定要删除这个满额门槛配置吗？')) return;
    
    try {
      await apiRequest(`${apiPrefix}/gift-thresholds/${thresholdId}`, { method: 'DELETE' });
      await loadThresholds();
    } catch (e) {
      alert(e.message || '删除失败');
    }
  };

  const handleToggleActive = async (threshold) => {
    try {
      await apiRequest(`${apiPrefix}/gift-thresholds/${threshold.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !threshold.is_active })
      });
      await loadThresholds();
    } catch (e) {
      alert(e.message || '更新状态失败');
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
      <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50 px-6 py-4 border-b border-gray-200">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <i className="fas fa-gift text-emerald-500"></i>
              满额门槛配置
            </h3>
            <p className="text-sm text-gray-600 mt-1">设置多个满额门槛，可以选择发放商品或优惠券。</p>
          </div>
          
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 shadow-sm transition-colors"
          >
            <i className="fas fa-plus text-sm"></i>
            添加门槛
          </button>
        </div>
      </div>
      
      <div className="p-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-3">
              <i className="fas fa-spinner fa-spin text-3xl text-emerald-500"></i>
              <p className="text-sm text-gray-500">加载中...</p>
            </div>
          </div>
        ) : thresholds.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <i className="fas fa-gift text-3xl text-gray-400"></i>
            </div>
            <p className="text-gray-500 text-base">暂未配置满额门槛</p>
            <p className="text-gray-400 text-sm mt-1">点击右上角按钮添加</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {thresholds.map((threshold) => (
              <div 
                key={threshold.id} 
                className={`bg-gradient-to-br ${
                  threshold.is_active 
                    ? 'from-white to-emerald-50/30' 
                    : 'from-white to-gray-50'
                } rounded-xl border-2 ${
                  threshold.is_active 
                    ? 'border-emerald-200 shadow-md' 
                    : 'border-gray-200 shadow-sm'
                } p-5 transition-all hover:shadow-lg`}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`flex items-center justify-center w-10 h-10 rounded-full ${
                      threshold.is_active 
                        ? 'bg-emerald-100' 
                        : 'bg-gray-100'
                    }`}>
                      <i className={`fas fa-coins text-lg ${
                        threshold.is_active 
                          ? 'text-emerald-600' 
                          : 'text-gray-400'
                      }`}></i>
                    </div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-lg font-bold text-gray-900">
                        满 {threshold.threshold_amount} 元
                      </h4>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        threshold.is_active 
                          ? 'bg-emerald-100 text-emerald-700 border border-emerald-300' 
                          : 'bg-gray-100 text-gray-500 border border-gray-300'
                      }`}>
                        {threshold.is_active ? '● 启用中' : '○ 已停用'}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleActive(threshold)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        threshold.is_active
                          ? 'bg-orange-50 text-orange-600 hover:bg-orange-100 border border-orange-200'
                          : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-200'
                      }`}
                    >
                      <i className={`fas ${threshold.is_active ? 'fa-pause' : 'fa-play'} mr-1`}></i>
                      {threshold.is_active ? '停用' : '启用'}
                    </button>
                    <button
                      onClick={() => setEditingThreshold(threshold)}
                      className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 text-xs font-medium transition-colors"
                    >
                      <i className="fas fa-edit mr-1"></i>
                      编辑
                    </button>
                    <button
                      onClick={() => handleDelete(threshold.id)}
                      className="px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 text-xs font-medium transition-colors"
                    >
                      <i className="fas fa-trash mr-1"></i>
                      删除
                    </button>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                  <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${
                    threshold.gift_products 
                      ? 'bg-green-50 border-green-200' 
                      : 'bg-gray-50 border-gray-200'
                  }`}>
                    <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
                      threshold.gift_products 
                        ? 'bg-green-100' 
                        : 'bg-gray-100'
                    }`}>
                      <i className={`fas fa-gift text-sm ${
                        threshold.gift_products 
                          ? 'text-green-600' 
                          : 'text-gray-400'
                      }`}></i>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-gray-500 font-medium">赠送商品</div>
                      <div className={`text-sm font-bold truncate ${
                        threshold.gift_products 
                          ? 'text-green-700' 
                          : 'text-gray-400'
                      }`}>
                        {threshold.gift_products ? `${threshold.items?.filter(i => i.available).length || 0} 种可用` : '否'}
                      </div>
                    </div>
                  </div>
                  
                  <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${
                    threshold.gift_coupon 
                      ? 'bg-blue-50 border-blue-200' 
                      : 'bg-gray-50 border-gray-200'
                  }`}>
                    <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
                      threshold.gift_coupon 
                        ? 'bg-blue-100' 
                        : 'bg-gray-100'
                    }`}>
                      <i className={`fas fa-ticket-alt text-sm ${
                        threshold.gift_coupon 
                          ? 'text-blue-600' 
                          : 'text-gray-400'
                      }`}></i>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-gray-500 font-medium">赠送优惠券</div>
                      <div className={`text-sm font-bold truncate ${
                        threshold.gift_coupon 
                          ? 'text-blue-700' 
                          : 'text-gray-400'
                      }`}>
                        {threshold.gift_coupon ? `${threshold.coupon_amount} 元` : '否'}
                      </div>
                    </div>
                  </div>
                  
                  <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${
                    threshold.per_order_limit 
                      ? 'bg-purple-50 border-purple-200' 
                      : 'bg-gray-50 border-gray-200'
                  }`}>
                    <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
                      threshold.per_order_limit 
                        ? 'bg-purple-100' 
                        : 'bg-gray-100'
                    }`}>
                      <i className={`fas ${threshold.per_order_limit ? 'fa-layer-group' : 'fa-infinity'} text-sm ${
                        threshold.per_order_limit 
                          ? 'text-purple-600' 
                          : 'text-gray-400'
                      }`}></i>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-gray-500 font-medium">每单上限</div>
                      <div className={`text-sm font-bold truncate ${
                        threshold.per_order_limit 
                          ? 'text-purple-700' 
                          : 'text-gray-400'
                      }`}>
                        {threshold.per_order_limit ? `${threshold.per_order_limit} 份` : '不限'}
                      </div>
                    </div>
                  </div>
                </div>
                
                {threshold.gift_products && threshold.items?.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <div className="flex items-center gap-2 mb-3">
                      <i className="fas fa-box text-sm text-gray-500"></i>
                      <span className="text-sm font-semibold text-gray-700">赠品列表</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {threshold.items.slice(0, 5).map((item, idx) => (
                        <div 
                          key={idx} 
                          className={`inline-flex flex-col gap-1 px-3 py-2 rounded-lg text-xs font-medium border ${
                            item.available 
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                              : 'bg-red-50 text-red-700 border-red-200'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span>{item.product_name}{item.variant_name ? ` (${item.variant_name})` : ''}</span>
                            <i className={`fas ${item.available ? 'fa-check-circle text-emerald-600' : 'fa-times-circle text-red-600'}`}></i>
                          </div>
                          <div className="flex items-center gap-1 text-gray-600">
                            <i className="fas fa-box text-[10px]"></i>
                            <span>库存：{item.stock !== undefined && item.stock !== null ? item.stock : 0}</span>
                          </div>
                        </div>
                      ))}
                      {threshold.items.length > 5 && (
                        <div className="inline-flex items-center px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs font-medium border border-gray-200">
                          +{threshold.items.length - 5} 更多...
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      
      {showCreateModal && (
        <GiftThresholdModal
          open={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onSave={loadThresholds}
          apiRequest={apiRequest}
          apiPrefix={apiPrefix}
        />
      )}

      {editingThreshold && (
        <GiftThresholdModal
          open={!!editingThreshold}
          threshold={editingThreshold}
          onClose={() => setEditingThreshold(null)}
          onSave={loadThresholds}
          apiRequest={apiRequest}
          apiPrefix={apiPrefix}
        />
      )}
      
      {saving && <div className="px-6 py-2 text-xs text-gray-400">正在保存更改...</div>}
    </div>
  );
};

const GiftThresholdModal = ({ open, onClose, onSave, threshold, apiRequest, apiPrefix }) => {
  const [formData, setFormData] = useState({
    threshold_amount: '',
    gift_products: false,
    gift_coupon: false,
    coupon_amount: '',
    per_order_limit: '',
    items: []
  });
  const [selectedItems, setSelectedItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const searchTimerRef = useRef(null);

  useEffect(() => {
    if (!open) {
      setFormData({
        threshold_amount: '',
        gift_products: false,
        gift_coupon: false,
        coupon_amount: '',
        per_order_limit: '',
        items: []
      });
      setSelectedItems([]);
      setSearchResults([]);
      setSearchTerm('');
      return;
    }

    if (threshold) {
      setFormData({
        threshold_amount: threshold.threshold_amount?.toString() || '',
        gift_products: threshold.gift_products || false,
        gift_coupon: threshold.gift_coupon || false,
        coupon_amount: threshold.coupon_amount?.toString() || '',
        per_order_limit: threshold.per_order_limit ? threshold.per_order_limit.toString() : '',
        items: threshold.items || []
      });
      setSelectedItems(threshold.items?.map(item => ({
        product_id: item.product_id,
        variant_id: item.variant_id,
        product_name: item.product_name,
        variant_name: item.variant_name,
        stock: item.stock,
        available: item.available
      })) || []);
    }
  }, [open, threshold]);

  const doSearch = async (term) => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      try {
        setSearchLoading(true);
        const res = await apiRequest(`${apiPrefix}/gift-thresholds/search${term ? `?query=${encodeURIComponent(term)}` : ''}`);
        setSearchResults(res?.data?.items || []);
      } catch (e) {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
  };

  useEffect(() => {
    if (open && formData.gift_products) {
      doSearch(searchTerm);
    }
  }, [searchTerm, open, formData.gift_products]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.threshold_amount || parseFloat(formData.threshold_amount) <= 0) {
      alert('请输入有效的门槛金额');
      return;
    }
    
    if (formData.gift_coupon && (!formData.coupon_amount || parseFloat(formData.coupon_amount) <= 0)) {
      alert('请输入有效的优惠券金额');
      return;
    }

    let perOrderLimit = null;
    if (formData.per_order_limit !== '') {
      const trimmed = String(formData.per_order_limit).trim();
      if (trimmed !== '') {
        const parsedLimit = Number.parseInt(trimmed, 10);
        if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
          alert('每单赠送上限必须为正整数，留空表示不限');
          return;
        }
        perOrderLimit = parsedLimit;
      }
    }

    setSaving(true);
    try {
      const payload = {
        threshold_amount: parseFloat(formData.threshold_amount),
        gift_products: formData.gift_products,
        gift_coupon: formData.gift_coupon,
        coupon_amount: formData.gift_coupon ? parseFloat(formData.coupon_amount) : 0,
        per_order_limit: perOrderLimit !== null ? perOrderLimit : null,
        items: formData.gift_products ? selectedItems.map(item => ({
          product_id: item.product_id,
          variant_id: item.variant_id || null
        })) : []
      };

      if (threshold) {
        await apiRequest(`${apiPrefix}/gift-thresholds/${threshold.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
      } else {
        await apiRequest(`${apiPrefix}/gift-thresholds`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }
      
      onSave();
      onClose();
    } catch (e) {
      alert(e.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleItemToggle = (item) => {
    const exists = selectedItems.find(si => 
      si.product_id === item.product_id && 
      (si.variant_id || null) === (item.variant_id || null)
    );
    
    if (exists) {
      setSelectedItems(selectedItems.filter(si => 
        !(si.product_id === item.product_id && 
          (si.variant_id || null) === (item.variant_id || null))
      ));
    } else {
      setSelectedItems([...selectedItems, item]);
    }
  };

  return (
    <div className={`fixed inset-0 z-50 ${open ? '' : 'pointer-events-none opacity-0'} flex items-center justify-center bg-black/50 backdrop-blur-sm transition-all duration-200`}>
      <div className="absolute inset-0" onClick={onClose}></div>
      <div className={`relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl mx-4 max-h-[85vh] flex flex-col overflow-hidden transform transition-all duration-200 ${open ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}>
        <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50 px-6 py-5 border-b-2 border-emerald-100 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
              <i className="fas fa-gift text-emerald-600 text-lg"></i>
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900">
                {threshold ? '编辑满额门槛' : '添加满额门槛'}
              </h3>
              <p className="text-xs text-gray-600 mt-0.5">
                {threshold ? '修改现有的满额赠送规则' : '创建新的满额赠送规则'}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="w-10 h-10 rounded-full bg-white hover:bg-red-50 border-2 border-gray-200 hover:border-red-200 flex items-center justify-center text-gray-600 hover:text-red-600 transition-all shadow-sm"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-6 space-y-6 flex-1 overflow-y-auto bg-gray-50">
          <div className="bg-white rounded-xl border-2 border-gray-200 p-5 shadow-sm">
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-3">
              <i className="fas fa-coins text-amber-500"></i>
              门槛金额
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.threshold_amount}
                onChange={(e) => setFormData({...formData, threshold_amount: e.target.value})}
                className="w-full px-4 py-3 pr-12 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-lg font-medium transition-all"
                placeholder="请输入门槛金额"
                required
              />
              <span className="absolute right-4 top-3.5 text-gray-500 font-medium">元</span>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              <i className="fas fa-info-circle mr-1"></i>
              订单金额达到此数值时将触发赠送
            </p>
          </div>

          <div className="bg-white rounded-xl border-2 border-gray-200 p-5 shadow-sm space-y-4">
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <i className="fas fa-gift text-pink-500"></i>
              赠品配置
            </label>
            
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="flex items-center gap-2 text-xs font-medium text-gray-600 mb-3">
                  <i className="fas fa-tags text-pink-500"></i>
                  赠品类型
                </label>
                <div className="flex gap-3">
                  <label className="flex items-center justify-center gap-2 h-[52px] px-3 border-2 border-gray-200 rounded-lg hover:border-green-300 hover:bg-green-50 cursor-pointer transition-all flex-1">
                    <input
                      type="checkbox"
                      checked={formData.gift_products}
                      onChange={(e) => setFormData({...formData, gift_products: e.target.checked})}
                      className="w-5 h-5 rounded border-gray-300 text-green-600 focus:ring-green-500"
                    />
                    <span className="text-sm font-medium text-gray-900">赠送商品</span>
                    <i className="fas fa-box text-green-500 ml-auto"></i>
                  </label>
                  <label className="flex items-center justify-center gap-2 h-[52px] px-3 border-2 border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 cursor-pointer transition-all flex-1">
                    <input
                      type="checkbox"
                      checked={formData.gift_coupon}
                      onChange={(e) => setFormData({...formData, gift_coupon: e.target.checked})}
                      className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-900">赠送优惠券</span>
                    <i className="fas fa-ticket-alt text-blue-500 ml-auto"></i>
                  </label>
                </div>
              </div>
              
              <div>
                <label className="flex items-center gap-2 text-xs font-medium text-gray-600 mb-3">
                  <i className="fas fa-layer-group text-purple-500"></i>
                  每单赠送上限
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    inputMode="numeric"
                    value={formData.per_order_limit}
                    onChange={(e) => setFormData({...formData, per_order_limit: e.target.value})}
                    className="w-full px-4 py-3 pr-12 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                    placeholder="不限制"
                  />
                  <span className="absolute right-4 top-3.5 text-gray-500 font-medium">份</span>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  <i className="fas fa-info-circle mr-1"></i>
                  仅限满额赠送商品，留空代表不限制数量
                </p>
              </div>
            </div>
          </div>

          {formData.gift_coupon && (
            <div className="bg-white rounded-xl border-2 border-blue-200 p-5 shadow-sm">
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-3">
                <i className="fas fa-ticket-alt text-blue-500"></i>
                优惠券金额
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.coupon_amount}
                  onChange={(e) => setFormData({...formData, coupon_amount: e.target.value})}
                  className="w-full px-4 py-3 pr-12 border-2 border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg font-medium transition-all"
                  placeholder="请输入优惠券金额"
                  required
                />
                <span className="absolute right-4 top-3.5 text-blue-600 font-medium">元</span>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                <i className="fas fa-info-circle mr-1"></i>
                满足条件后将自动发放此金额的优惠券
              </p>
            </div>
          )}

          {formData.gift_products && (
            <div className="bg-white rounded-xl border-2 border-green-200 p-5 shadow-sm">
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-4">
                <i className="fas fa-box text-green-500"></i>
                选择赠送商品
              </label>
              
              <div className="space-y-4">
                {selectedItems.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-green-700 flex items-center gap-2">
                      <i className="fas fa-check-circle text-green-600"></i>
                      已选择 {selectedItems.length} 个商品
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {selectedItems.map((item, idx) => (
                        <span key={idx} className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-50 border-2 border-green-300 text-green-800 rounded-lg text-sm font-medium">
                          <span>{item.product_name}{item.variant_name ? ` (${item.variant_name})` : ''}</span>
                          <button
                            type="button"
                            onClick={() => handleItemToggle(item)}
                            className="w-5 h-5 rounded-full bg-red-100 hover:bg-red-200 flex items-center justify-center text-red-600 text-xs transition-colors"
                            title="移除"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="relative">
                  <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all"
                    placeholder="搜索商品名称或规格..."
                  />
                </div>
                
                <div className="border-2 border-gray-200 rounded-lg overflow-hidden">
                  {searchLoading ? (
                    <div className="flex flex-col items-center justify-center py-8 text-gray-500">
                      <i className="fas fa-spinner fa-spin text-2xl mb-2"></i>
                      <p className="text-sm">搜索中...</p>
                    </div>
                  ) : searchResults.length > 0 ? (
                    <div className="max-h-64 overflow-y-auto divide-y divide-gray-200">
                      {searchResults.map((item) => {
                        const isSelected = selectedItems.some(si => 
                          si.product_id === item.product_id && 
                          (si.variant_id || null) === (item.variant_id || null)
                        );
                        
                        return (
                          <div
                            key={`${item.product_id}_${item.variant_id || 'base'}`}
                            className={`p-4 cursor-pointer transition-all ${
                              isSelected 
                                ? 'bg-green-50 hover:bg-green-100' 
                                : 'hover:bg-gray-50'
                            }`}
                            onClick={() => handleItemToggle(item)}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3 flex-1">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                  isSelected ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'
                                }`}>
                                  <i className={`fas ${isSelected ? 'fa-check' : 'fa-box'} text-sm`}></i>
                                </div>
                                <div className="flex-1">
                                  <p className="font-medium text-gray-900">{item.product_name}</p>
                                  {item.variant_name && (
                                    <p className="text-sm text-gray-500">{item.variant_name}</p>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                                  item.stock > 0 
                                    ? 'bg-emerald-100 text-emerald-700' 
                                    : 'bg-red-100 text-red-700'
                                }`}>
                                  库存: {item.stock}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : searchTerm ? (
                    <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                      <i className="fas fa-search text-3xl mb-2"></i>
                      <p className="text-sm">没有找到相关商品</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                      <i className="fas fa-info-circle text-3xl mb-2"></i>
                      <p className="text-sm">输入关键词搜索商品</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          </div>
          
          <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-gray-100 border-t-2 border-gray-200 flex justify-between items-center gap-3 flex-shrink-0">
            <p className="text-xs text-gray-500 flex items-center gap-1.5">
              <i className="fas fa-info-circle"></i>
              提交后配置立即生效
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 text-gray-700 bg-white border-2 border-gray-300 rounded-lg hover:bg-gray-100 hover:border-gray-400 font-medium transition-all shadow-sm"
              >
                <i className="fas fa-times mr-2"></i>
                取消
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-lg hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-all shadow-md flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <i className="fas fa-spinner fa-spin"></i>
                    保存中...
                  </>
                ) : (
                  <>
                    <i className="fas fa-check"></i>
                    {threshold ? '更新配置' : '创建配置'}
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

