import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useApi } from '../../hooks/useAuth';
import { normalizeBooleanFlag } from './helpers';

const parseStockValue = (stock) => {
  const parsed = Number.parseInt(stock, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

const getItemAvailability = (item) => {
  const stockValue = parseStockValue(item?.stock);
  const hasStock = stockValue !== null && stockValue > 0;
  const isActive = item?.is_active !== false && item?.is_active !== 0;
  const available = normalizeBooleanFlag(item?.available, isActive && hasStock);
  return { available, stockValue, hasStock, isActive };
};

const countAvailableItems = (items) => (items || []).reduce((count, item) => {
  const { available } = getItemAvailability(item);
  return available ? count + 1 : count;
}, 0);

const sumAvailableStock = (items) => (items || []).reduce((sum, item) => {
  const { available, stockValue } = getItemAvailability(item);
  if (available && stockValue !== null && stockValue > 0) {
    return sum + stockValue;
  }
  return sum;
}, 0);

// 赠品详情弹窗组件
const GiftItemsViewModal = ({ open, onClose, threshold }) => {
  const itemList = threshold?.items || [];
  const availableItemCount = countAvailableItems(itemList);
  const availableStock = sumAvailableStock(itemList);
  
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/40 backdrop-blur-md"
            onClick={onClose}
          />
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
            className="relative bg-white rounded-3xl shadow-2xl w-full max-w-3xl mx-4 max-h-[80vh] flex flex-col overflow-hidden z-10"
          >
            <div className="px-8 py-6 border-b border-gray-100 flex justify-between items-center bg-white sticky top-0 z-10">
              <div>
                <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  满 {threshold.threshold_amount} 元赠品详情
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  共 {itemList.length} 件赠品 · {threshold.per_order_limit ? `每单限选 ${threshold.per_order_limit} 件` : '不限数量'}
                </p>
              </div>
              <button 
                onClick={onClose} 
                className="w-9 h-9 rounded-full bg-gray-50 hover:bg-gray-100 flex items-center justify-center text-gray-500 transition-all duration-200"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 bg-white custom-scrollbar">
              {itemList.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 py-12">
                  <i className="fas fa-box-open text-6xl mb-4 opacity-20"></i>
                  <p className="text-lg">未关联任何商品</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {itemList.map((item, index) => {
                    const label = item.variant_name
                      ? `${item.product_name || ''}` 
                      : (item.product_name || '未命名商品');
                    const { available, stockValue, hasStock, isActive } = getItemAvailability(item);
                    
                    let statusText = '可用';
                    let statusIcon = 'fa-check-circle';
                    if (!available) {
                      if (!isActive) {
                        statusText = '下架';
                        statusIcon = 'fa-pause-circle';
                      } else if (!hasStock) {
                        statusText = '缺货';
                        statusIcon = 'fa-exclamation-circle';
                      }
                    }
                    
                    return (
                      <div 
                        key={`${item.product_id}_${item.variant_id || 'base'}_${index}`} 
                        className={`rounded-2xl border p-5 transition-all duration-200 hover:shadow-md ${
                          available 
                            ? 'border-gray-200 bg-white hover:border-emerald-200' 
                            : 'border-gray-200 bg-gray-50 opacity-80'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-4">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-bold text-gray-900 text-sm truncate" title={label}>
                              {label}
                            </h4>
                            {item.variant_name && (
                              <p className="text-xs text-gray-500 mt-0.5 truncate" title={item.variant_name}>
                                规格：{item.variant_name}
                              </p>
                            )}
                          </div>
                          <span className={`flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                            available 
                              ? 'bg-emerald-50 text-emerald-700' 
                              : 'bg-red-50 text-red-700'
                          }`}>
                            <i className={`fas ${statusIcon} text-[10px]`}></i>
                            {statusText}
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-gray-50 rounded-xl px-3 py-2.5">
                            <div className="text-xs text-gray-500 mb-1">库存</div>
                            <div className={`font-bold text-sm ${available ? 'text-gray-900' : 'text-red-600'}`}>
                              {stockValue === null ? '未知' : stockValue}
                            </div>
                          </div>
                          <div className="bg-gray-50 rounded-xl px-3 py-2.5">
                            <div className="text-xs text-gray-500 mb-1">原价</div>
                            <div className="font-bold text-sm text-gray-900">
                              ¥{Number.isFinite(item.price) && item.price > 0 ? Number(item.price).toFixed(2) : '--'}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            
            <div className="px-8 py-5 bg-gray-50 border-t border-gray-100">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-6">
                  <span className="text-gray-600 flex items-center gap-2">
                    <i className="fas fa-box text-gray-400"></i>
                    总商品数 <span className="font-bold text-gray-900">{itemList.length}</span>
                  </span>
                  <span className="text-gray-600 flex items-center gap-2">
                    <i className="fas fa-check-circle text-emerald-500"></i>
                    可用商品 <span className="font-bold text-emerald-600">
                      {availableItemCount}
                    </span>
                  </span>
                  <span className="text-gray-600 flex items-center gap-2">
                    <i className="fas fa-boxes text-emerald-500"></i>
                    可用库存 <span className="font-bold text-emerald-600">
                      {availableStock}
                    </span>
                  </span>
                </div>
                <button
                  onClick={onClose}
                  className="px-6 py-2 bg-black text-white rounded-full hover:bg-gray-800 transition-all duration-200 font-medium text-sm shadow-lg hover:shadow-xl"
                >
                  关闭
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export const GiftThresholdPanel = ({ apiPrefix, onWarningChange, apiRequest: injectedApiRequest }) => {
  const { apiRequest: contextApiRequest } = useApi();
  const apiRequest = injectedApiRequest || contextApiRequest;
  const [thresholds, setThresholds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingThreshold, setEditingThreshold] = useState(null);
  const [viewingThreshold, setViewingThreshold] = useState(null);
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

  useEffect(() => { loadThresholds(); }, [apiPrefix, apiRequest]);

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
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden font-sans">
      <div className="px-8 py-6 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h3 className="text-2xl font-bold text-gray-900 tracking-tight">
            满额门槛
          </h3>
          <p className="text-sm text-gray-500 mt-1">设置订单满额赠送规则，提升客单价</p>
        </div>
        
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-black text-white text-sm font-medium rounded-full hover:bg-gray-800 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-0.5"
        >
          <i className="fas fa-plus text-sm"></i>
          添加门槛
        </button>
      </div>
      
      <div className="p-8">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="flex flex-col items-center gap-4">
              <div className="animate-spin rounded-full h-10 w-10 border-2 border-gray-200 border-t-black"></div>
              <p className="text-sm text-gray-500 font-medium">加载中...</p>
            </div>
          </div>
        ) : thresholds.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-20 h-20 rounded-full bg-gray-50 flex items-center justify-center mb-6 border border-gray-100">
              <i className="fas fa-gift text-3xl text-gray-300"></i>
            </div>
            <p className="text-lg font-bold text-gray-900 mb-2">暂未配置满额门槛</p>
            <p className="text-gray-500 text-sm">点击右上角按钮添加第一个规则</p>
          </div>
        ) : (
          <div className="grid gap-6">
            {thresholds.map((threshold) => (
              <div 
                key={threshold.id} 
                className={`bg-white rounded-2xl border transition-all duration-300 group ${
                  threshold.is_active 
                    ? 'border-gray-200 shadow-sm hover:shadow-md' 
                    : 'border-gray-100 opacity-75 hover:opacity-100'
                }`}
              >
                <div className="p-6">
                  <div className="flex items-start justify-between mb-6">
                    <div className="flex items-center gap-4">
                      <div className={`flex items-center justify-center w-12 h-12 rounded-2xl ${
                        threshold.is_active 
                          ? 'bg-black text-white' 
                          : 'bg-gray-100 text-gray-400'
                      }`}>
                        <i className="fas fa-coins text-lg"></i>
                      </div>
                      <div>
                        <div className="flex items-center gap-3">
                          <h4 className="text-xl font-bold text-gray-900">
                            满 {threshold.threshold_amount} 元
                          </h4>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                            threshold.is_active 
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                              : 'bg-gray-50 text-gray-500 border-gray-200'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${threshold.is_active ? 'bg-emerald-500' : 'bg-gray-400'}`}></span>
                            {threshold.is_active ? '启用中' : '已停用'}
                          </span>
                        </div>
                        <p className="text-sm text-gray-500 mt-1">
                          {threshold.gift_products && threshold.gift_coupon ? '赠送商品及优惠券' : 
                           threshold.gift_products ? '仅赠送商品' : 
                           threshold.gift_coupon ? '仅赠送优惠券' : '无赠品'}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggleActive(threshold)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                          threshold.is_active
                            ? 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                            : 'bg-black text-white hover:bg-gray-800'
                        }`}
                      >
                        {threshold.is_active ? '停用' : '启用'}
                      </button>
                      <button
                        onClick={() => setEditingThreshold(threshold)}
                        className="p-2 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        title="编辑"
                      >
                        <i className="fas fa-edit"></i>
                      </button>
                      <button
                        onClick={() => handleDelete(threshold.id)}
                        className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="删除"
                      >
                        <i className="fas fa-trash"></i>
                      </button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div 
                      onClick={() => threshold.gift_products && setViewingThreshold(threshold)}
                      className={`p-4 rounded-xl border transition-all duration-200 ${
                      threshold.gift_products 
                        ? 'bg-gray-50 border-gray-200 cursor-pointer hover:bg-gray-100 hover:shadow-sm' 
                        : 'bg-gray-50/50 border-gray-100 text-gray-400'
                    }`}>
                      <div className="flex items-center gap-3 mb-2">
                        <i className={`fas fa-gift ${threshold.gift_products ? 'text-gray-900' : 'text-gray-300'}`}></i>
                        <span className="text-sm font-semibold">赠送商品</span>
                      </div>
                      <div className="text-lg font-bold">
                        {threshold.gift_products ? `共 ${countAvailableItems(threshold.items)} 种可用，剩余总库存：${sumAvailableStock(threshold.items)}` : '未启用'}
                      </div>
                    </div>
                    
                    <div className={`p-4 rounded-xl border ${
                      threshold.gift_coupon 
                        ? 'bg-gray-50 border-gray-200' 
                        : 'bg-gray-50/50 border-gray-100 text-gray-400'
                    }`}>
                      <div className="flex items-center gap-3 mb-2">
                        <i className={`fas fa-ticket-alt ${threshold.gift_coupon ? 'text-gray-900' : 'text-gray-300'}`}></i>
                        <span className="text-sm font-semibold">赠送优惠券</span>
                      </div>
                      <div className="text-lg font-bold">
                        {threshold.gift_coupon ? `¥${threshold.coupon_amount}` : '未启用'}
                      </div>
                    </div>
                    
                    <div className={`p-4 rounded-xl border ${
                      threshold.per_order_limit 
                        ? 'bg-gray-50 border-gray-200' 
                        : 'bg-gray-50/50 border-gray-100 text-gray-400'
                    }`}>
                      <div className="flex items-center gap-3 mb-2">
                        <i className={`fas ${threshold.per_order_limit ? 'fa-layer-group' : 'fa-infinity'} ${threshold.per_order_limit ? 'text-gray-900' : 'text-gray-300'}`}></i>
                        <span className="text-sm font-semibold">每单上限</span>
                      </div>
                      <div className="text-lg font-bold">
                        {threshold.per_order_limit ? `${threshold.per_order_limit} 份` : '不限'}
                      </div>
                    </div>
                  </div>
                  
                  {threshold.gift_products && threshold.items?.length > 0 && (
                    <div className="mt-6 pt-6 border-t border-gray-100">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                          赠品列表（共{threshold.items.length}个）
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {threshold.items.slice(0, 5).map((item, idx) => (
                          <div 
                            key={idx} 
                            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border ${
                              item.available 
                                ? 'bg-white border-gray-200 text-gray-700' 
                                : 'bg-red-50 border-red-100 text-red-600'
                            }`}
                          >
                            <span>{item.product_name}{item.variant_name ? ` (${item.variant_name})` : ''}</span>
                            {!item.available && <i className="fas fa-exclamation-circle"></i>}
                          </div>
                        ))}
                        {threshold.items.length > 5 && (
                          <div className="inline-flex items-center px-3 py-1.5 rounded-lg bg-gray-50 text-gray-500 text-xs font-medium border border-gray-200">
                            +{threshold.items.length - 5}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      <AnimatePresence>
        {showCreateModal && (
          <GiftThresholdModal
            open={showCreateModal}
            onClose={() => setShowCreateModal(false)}
            onSave={loadThresholds}
            apiRequest={apiRequest}
            apiPrefix={apiPrefix}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
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
      </AnimatePresence>

      <GiftItemsViewModal
        open={!!viewingThreshold}
        threshold={viewingThreshold}
        onClose={() => setViewingThreshold(null)}
      />
      
      {saving && <div className="px-8 py-3 text-xs text-gray-400 bg-gray-50 border-t border-gray-100">正在保存更改...</div>}
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
  const selectedAvailableStock = useMemo(() => sumAvailableStock(selectedItems), [selectedItems]);

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
        is_active: item.is_active !== false && item.is_active !== 0,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="absolute inset-0 bg-black/40 backdrop-blur-md"
        onClick={onClose}
      />
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
        className="relative bg-white rounded-3xl shadow-2xl w-full max-w-3xl mx-4 max-h-[85vh] flex flex-col overflow-hidden z-10"
      >
        <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between flex-shrink-0 bg-white sticky top-0 z-10">
          <div>
            <h3 className="text-2xl font-bold text-gray-900">
              {threshold ? '编辑门槛' : '添加门槛'}
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              {threshold ? '修改现有的满额赠送规则' : '创建新的满额赠送规则'}
            </p>
          </div>
          <button 
            onClick={onClose} 
            className="w-9 h-9 rounded-full bg-gray-50 hover:bg-gray-100 flex items-center justify-center text-gray-500 transition-all duration-200"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden bg-white">
          <div className="p-8 space-y-8 flex-1 overflow-y-auto">
            <section>
              <label className="block text-sm font-bold text-gray-900 mb-3">门槛金额</label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.threshold_amount}
                  onChange={(e) => setFormData({...formData, threshold_amount: e.target.value})}
                  className="w-full px-4 py-3 pr-12 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-400 text-lg font-medium transition-all"
                  placeholder="0.00"
                  required
                />
                <span className="absolute right-4 top-3.5 text-gray-500 font-medium">元</span>
              </div>
              <p className="text-xs text-gray-400 mt-2">订单金额达到此数值时触发赠送</p>
            </section>

            <section className="space-y-4">
              <label className="block text-sm font-bold text-gray-900">赠品配置</label>
              
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">类型选择</label>
                  <div className="flex gap-3">
                    <label className={`flex items-center justify-center gap-2 h-12 px-4 border rounded-xl cursor-pointer transition-all flex-1 ${
                      formData.gift_products 
                        ? 'border-black bg-black text-white shadow-md' 
                        : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                    }`}>
                      <input
                        type="checkbox"
                        checked={formData.gift_products}
                        onChange={(e) => setFormData({...formData, gift_products: e.target.checked})}
                        className="hidden"
                      />
                      <span className="text-sm font-medium">赠送商品</span>
                      {formData.gift_products && <i className="fas fa-check text-xs ml-1"></i>}
                    </label>
                    <label className={`flex items-center justify-center gap-2 h-12 px-4 border rounded-xl cursor-pointer transition-all flex-1 ${
                      formData.gift_coupon 
                        ? 'border-black bg-black text-white shadow-md' 
                        : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                    }`}>
                      <input
                        type="checkbox"
                        checked={formData.gift_coupon}
                        onChange={(e) => setFormData({...formData, gift_coupon: e.target.checked})}
                        className="hidden"
                      />
                      <span className="text-sm font-medium">赠送优惠券</span>
                      {formData.gift_coupon && <i className="fas fa-check text-xs ml-1"></i>}
                    </label>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">每单上限</label>
                  <div className="relative">
                    <input
                      type="number"
                      min="1"
                      step="1"
                      inputMode="numeric"
                      value={formData.per_order_limit}
                      onChange={(e) => setFormData({...formData, per_order_limit: e.target.value})}
                      className="w-full px-4 py-3 pr-12 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-400 transition-all"
                      placeholder="不限制"
                    />
                    <span className="absolute right-4 top-3.5 text-gray-500 font-medium">份</span>
                  </div>
                </div>
              </div>
            </section>

            {formData.gift_coupon && (
              <section className="animate-fadeIn">
                <div className="bg-blue-50/50 rounded-2xl p-6 border border-blue-100">
                  <label className="block text-sm font-bold text-blue-900 mb-3">优惠券金额</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.coupon_amount}
                      onChange={(e) => setFormData({...formData, coupon_amount: e.target.value})}
                      className="w-full px-4 py-3 pr-12 bg-white border border-blue-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-lg font-medium transition-all text-blue-900 placeholder-blue-300"
                      placeholder="0.00"
                      required
                    />
                    <span className="absolute right-4 top-3.5 text-blue-500 font-medium">元</span>
                  </div>
                </div>
              </section>
            )}

            {formData.gift_products && (
              <section className="animate-fadeIn space-y-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <label className="block text-sm font-bold text-gray-900">选择赠送商品</label>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium bg-emerald-50 text-emerald-700 px-3 py-1 rounded-md border border-emerald-100">
                      可用库存 {selectedAvailableStock}
                    </span>
                    {selectedItems.length > 0 && (
                      <span className="text-xs font-medium bg-black text-white px-2 py-1 rounded-md">
                        已选 {selectedItems.length}
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="bg-gray-50 rounded-2xl p-6 border border-gray-200">
                  {selectedItems.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-4">
                      {selectedItems.map((item, idx) => {
                        const isInactive = item.is_active === false || item.is_active === 0;
                        const isOutOfStock = !item.stock || item.stock <= 0;
                        const hasIssue = isInactive || isOutOfStock;
                        
                        return (
                          <span 
                            key={idx} 
                            className={`inline-flex items-center gap-2 px-3 py-1.5 border rounded-lg text-sm font-medium shadow-sm ${
                              hasIssue 
                                ? 'bg-red-50 border-red-200 text-red-800' 
                                : 'bg-white border-gray-200 text-gray-900'
                            }`}
                          >
                            {isInactive && (
                              <span className="text-red-500 text-xs">
                                <i className="fas fa-pause-circle"></i>
                              </span>
                            )}
                            <span>{item.product_name}{item.variant_name ? ` (${item.variant_name})` : ''}</span>
                            {isInactive && <span className="text-xs text-red-500">已下架</span>}
                            {!isInactive && isOutOfStock && <span className="text-xs text-red-500">缺货</span>}
                            <button
                              type="button"
                              onClick={() => handleItemToggle(item)}
                              className={`w-5 h-5 rounded-full flex items-center justify-center transition-colors ${
                                hasIssue 
                                  ? 'bg-red-100 hover:bg-red-200 text-red-600' 
                                  : 'bg-gray-100 hover:bg-gray-200 text-gray-500'
                              }`}
                            >
                              <i className="fas fa-times text-xs"></i>
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                  
                  <div className="relative mb-4">
                    <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-400 transition-all"
                      placeholder="搜索商品..."
                    />
                  </div>
                  
                  <div className="bg-white border border-gray-200 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                    {searchLoading ? (
                      <div className="flex items-center justify-center py-8 text-gray-400 text-sm gap-2">
                        <i className="fas fa-spinner fa-spin"></i> 搜索中...
                      </div>
                    ) : searchResults.length > 0 ? (
                      <div className="divide-y divide-gray-100">
                        {searchResults.map((item) => {
                          const isSelected = selectedItems.some(si => 
                            si.product_id === item.product_id && 
                            (si.variant_id || null) === (item.variant_id || null)
                          );
                          
                          return (
                            <div
                              key={`${item.product_id}_${item.variant_id || 'base'}`}
                              className={`p-4 cursor-pointer transition-all flex items-center justify-between group ${
                                isSelected ? 'bg-gray-50' : 'hover:bg-gray-50'
                              }`}
                              onClick={() => handleItemToggle(item)}
                            >
                              <div className="flex items-center gap-3 overflow-hidden">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                                  isSelected ? 'bg-black text-white' : 'bg-gray-100 text-gray-400 group-hover:bg-gray-200'
                                }`}>
                                  <i className={`fas ${isSelected ? 'fa-check' : 'fa-box'} text-xs`}></i>
                                </div>
                                <div className="min-w-0">
                                  <p className={`text-sm font-medium truncate ${isSelected ? 'text-gray-900' : 'text-gray-700'}`}>
                                    {item.product_name}
                                  </p>
                                  {item.variant_name && (
                                    <p className="text-xs text-gray-500 truncate">{item.variant_name}</p>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {item.is_active === false && (
                                  <span className="text-xs px-2 py-1 rounded-md bg-gray-100 text-gray-600">
                                    <i className="fas fa-pause-circle mr-1"></i>已下架
                                  </span>
                                )}
                                <span className={`text-xs px-2 py-1 rounded-md ${
                                  item.stock > 0 
                                    ? 'bg-green-50 text-green-700' 
                                    : 'bg-red-50 text-red-700'
                                }`}>
                                  库存 {item.stock}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="py-8 text-center text-gray-400 text-sm">
                        {searchTerm ? '未找到相关商品' : '输入关键词开始搜索'}
                      </div>
                    )}
                  </div>
                </div>
              </section>
            )}
          </div>
          
          <div className="px-8 py-5 bg-white border-t border-gray-100 flex justify-end gap-3 sticky bottom-0 z-10">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-full hover:bg-gray-50 transition-all duration-200"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-8 py-2.5 text-sm font-medium bg-black text-white rounded-full hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl flex items-center gap-2"
            >
              {saving ? (
                <>
                  <i className="fas fa-spinner fa-spin"></i>
                  保存中...
                </>
              ) : (
                <>
                  <i className="fas fa-check"></i>
                  {threshold ? '更新配置' : '立即创建'}
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};
