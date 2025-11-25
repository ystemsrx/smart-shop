import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useApi } from '../../hooks/useAuth';
import { normalizeBooleanFlag } from './helpers';

// 商品详情弹窗组件
const LotteryItemsViewModal = ({ open, onClose, prize }) => {
  const [isVisible, setIsVisible] = useState(false);
  
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => {
        setIsVisible(true);
      });
    } else {
      setIsVisible(false);
    }
  }, [open]);
  
  if (!open && !isVisible) return null;
  
  const itemList = prize?.items || [];
  
  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center transition-all duration-300 ${
      isVisible ? 'bg-black/40 backdrop-blur-md' : 'bg-black/0'
    }`}>
      <div className="absolute inset-0" onClick={onClose}></div>
      <div className={`relative bg-white rounded-3xl shadow-2xl w-full max-w-3xl mx-4 max-h-[80vh] flex flex-col overflow-hidden transform transition-all duration-300 ring-1 ring-black/5 ${
        isVisible ? 'scale-100 opacity-100 translate-y-0' : 'scale-95 opacity-0 translate-y-4'
      }`}>
        <div className="px-8 py-6 border-b border-gray-100 flex justify-between items-center bg-white sticky top-0 z-10">
          <div>
            <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              {prize.display_name}
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              共 {itemList.length} 件商品 · 权重 {Number.isFinite(prize.weight) ? prize.weight : 0}%
            </p>
          </div>
          <button 
            onClick={onClose} 
            className="w-9 h-9 rounded-full bg-gray-50 hover:bg-gray-100 flex items-center justify-center text-gray-500 transition-all duration-200"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-8 bg-white">
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
                const stock = Number.parseInt(item.stock, 10);
                const isActive = item.is_active !== false && item.is_active !== 0;
                const hasStock = !Number.isNaN(stock) && stock > 0;
                const available = isActive && hasStock;
                
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
                          {Number.isNaN(stock) ? '未知' : stock}
                        </div>
                      </div>
                      <div className="bg-gray-50 rounded-xl px-3 py-2.5">
                        <div className="text-xs text-gray-500 mb-1">参考价值</div>
                        <div className="font-bold text-sm text-gray-900">
                          ¥{Number.isFinite(item.retail_price) ? Number(item.retail_price).toFixed(2) : '--'}
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
                  {itemList.filter(it => it.available).length}
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
      </div>
    </div>
  );
};

const LotteryPrizeModal = ({ open, onClose, onSave, initialPrize, apiRequest, apiPrefix }) => {
  const [displayName, setDisplayName] = useState('');
  const [weight, setWeight] = useState('0');
  const [isActive, setIsActive] = useState(true);
  const [selectedItems, setSelectedItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [error, setError] = useState('');
  const [isVisible, setIsVisible] = useState(false);
  const searchTimerRef = useRef(null);
  
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => {
        setIsVisible(true);
      });
    } else {
      setIsVisible(false);
    }
  }, [open]);

  const mapResultToItem = (item) => ({
    id: item.id,
    product_id: item.product_id,
    variant_id: item.variant_id || null,
    product_name: item.product_name || item.label || '',
    variant_name: item.variant_name || null,
    stock: item.stock,
    retail_price: item.retail_price,
    is_active: item.is_active !== false && item.is_active !== 0,
    available: normalizeBooleanFlag(item.available, false),
    label: item.variant_name ? `${item.product_name || ''} - ${item.variant_name}` : (item.product_name || item.label || ''),
  });

  useEffect(() => {
    if (!open) {
      const timer = setTimeout(() => {
        setDisplayName('');
        setWeight('0');
        setIsActive(true);
        setSelectedItems([]);
        setSearchTerm('');
        setSearchResults([]);
        setError('');
      }, 300);
      return () => clearTimeout(timer);
    }

    const initial = initialPrize || null;
    setDisplayName(initial?.display_name || '');
    setWeight(String(initial ? (Number.isFinite(initial.weight) ? initial.weight : 0) : 0));
    setIsActive(initial ? (initial.is_active === true || initial.is_active === 1) : true);
    setSelectedItems((initial?.items || []).map(mapResultToItem));
    setSearchTerm('');
    setSearchResults([]);
    setError('');
  }, [open, initialPrize]);

  useEffect(() => {
    if (!open) return;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    const term = searchTerm.trim();
    searchTimerRef.current = setTimeout(async () => {
      try {
        setSearchLoading(true);
        const res = await apiRequest(`${apiPrefix}/lottery-prizes/search${term ? `?query=${encodeURIComponent(term)}` : ''}`);
        setSearchResults(res?.data?.items || []);
      } catch (e) {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 250);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchTerm, open, apiRequest, apiPrefix]);


  const handleAddItem = (item) => {
    const mapped = mapResultToItem(item);
    const key = `${mapped.product_id}__${mapped.variant_id || 'base'}`;
    if (selectedItems.some((it) => `${it.product_id}__${it.variant_id || 'base'}` === key)) {
      return;
    }
    setSelectedItems(prev => [...prev, mapped]);
  };

  const handleRemoveItem = (productId, variantId) => {
    setSelectedItems(prev => prev.filter(it => !(it.product_id === productId && (it.variant_id || null) === (variantId || null))));
  };


  const handleSubmit = () => {
    if (!displayName.trim()) {
      setError('请输入奖项名称');
      return;
    }
    if (selectedItems.length === 0) {
      setError('请至少选择一个商品作为奖品');
      return;
    }
    setError('');
    onSave({
      displayName: displayName.trim(),
      weight,
      isActive,
      items: selectedItems
    });
  };

  if (!open && !isVisible) return null;
  
  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center transition-all duration-300 ${
      isVisible ? 'bg-black/40 backdrop-blur-md' : 'bg-black/0'
    } ${!isVisible && 'pointer-events-none'}`}>
      <div className="absolute inset-0" onClick={onClose}></div>
      <div className={`relative bg-white rounded-3xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden transform transition-all duration-300 ring-1 ring-black/5 ${
        isVisible ? 'scale-100 opacity-100 translate-y-0' : 'scale-95 opacity-0 translate-y-4'
      }`}>
        <div className="px-8 py-6 border-b border-gray-100 flex justify-between items-center bg-white sticky top-0 z-10">
          <div>
            <h3 className="text-xl font-bold text-gray-900">{initialPrize ? '编辑奖项' : '新增奖项'}</h3>
            <p className="text-sm text-gray-500 mt-1">搜索并选择商品，支持多选组合</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-gray-50 hover:bg-gray-100 flex items-center justify-center text-gray-500 transition-all duration-200">
            <i className="fas fa-times"></i>
          </button>
        </div>
        <div className="px-8 py-6 space-y-6 max-h-[70vh] overflow-y-auto bg-white">
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3 flex items-center gap-2"><i className="fas fa-exclamation-circle"></i>{error}</div>}
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">奖项名称</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="例如：特等奖、安慰奖"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-400 transition-all duration-200"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">概率权重</label>
              <input
                type="number"
                step="0.01"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-400 transition-all duration-200"
              />
              <p className="mt-1.5 text-xs text-gray-400">支持百分比或小数（如 5 或 0.05）</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700">状态</label>
            <button
              onClick={() => setIsActive(prev => !prev)}
              className={`px-4 py-1.5 rounded-full text-xs font-medium border transition-all duration-200 ${
                isActive 
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700' 
                  : 'bg-gray-50 border-gray-200 text-gray-500'
              }`}
            >
              <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${isActive ? 'bg-emerald-500' : 'bg-gray-400'}`}></span>
              {isActive ? '已启用' : '已停用'}
            </button>
          </div>

          <div className="border-t border-gray-100 pt-6">
            <label className="block text-sm font-bold text-gray-900 mb-3">添加奖品商品</label>
            <div className="relative">
              <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="搜索商品名称..."
                className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-400 transition-all duration-200"
              />
            </div>
            
            <div className="mt-2 border border-gray-100 rounded-xl max-h-48 overflow-y-auto bg-white shadow-sm">
              {searchLoading ? (
                <div className="px-4 py-3 text-xs text-gray-500 flex items-center gap-2">
                  <i className="fas fa-spinner fa-spin"></i> 搜索中...
                </div>
              ) : (searchResults || []).length === 0 ? (
                searchTerm && <div className="px-4 py-3 text-xs text-gray-400">未找到匹配商品</div>
              ) : (
                searchResults.map(item => {
                  const key = `${item.product_id}__${item.variant_id || 'base'}`;
                  const alreadySelected = selectedItems.some(it => `${it.product_id}__${it.variant_id || 'base'}` === key);
                  const fullName = item.variant_name ? 
                    `${item.product_name || item.label || ''} - ${item.variant_name}` : 
                    (item.product_name || item.label || '');
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleAddItem(item)}
                      disabled={alreadySelected}
                      className={`w-full text-left px-4 py-3 text-sm border-b border-gray-50 last:border-b-0 transition-colors ${
                        alreadySelected ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : 'hover:bg-gray-50 text-gray-700'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-medium truncate mr-2">{fullName}</span>
                        {alreadySelected && <span className="text-xs bg-gray-200 px-2 py-0.5 rounded text-gray-500">已选</span>}
                      </div>
                      <div className="text-xs text-gray-400 mt-1 flex gap-3">
                        {item.is_active === false && (
                          <span className="text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded">
                            <i className="fas fa-pause-circle mr-1"></i>已下架
                          </span>
                        )}
                        <span>库存: {item.stock}</span>
                        <span>¥{Number.isFinite(item.retail_price) ? Number(item.retail_price).toFixed(2) : '--'}</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-bold text-gray-900">
                已选商品 <span className="text-gray-400 font-normal text-xs ml-1">({selectedItems.length})</span>
              </label>
            </div>
            {selectedItems.length === 0 ? (
              <div className="text-center py-8 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                <i className="fas fa-inbox text-gray-300 text-2xl mb-2"></i>
                <p className="text-xs text-gray-500">暂未选择任何商品</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-60 overflow-y-auto pr-1">
                {selectedItems.map(item => (
                  <div 
                    key={`${item.product_id}_${item.variant_id || 'base'}`} 
                    className="relative group rounded-xl border border-gray-200 p-3 bg-white hover:shadow-sm transition-all duration-200"
                  >
                    <button
                      onClick={() => handleRemoveItem(item.product_id, item.variant_id)}
                      className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-white border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200 flex items-center justify-center shadow-sm transition-all z-10"
                    >
                      <i className="fas fa-times text-xs"></i>
                    </button>
                    
                    <div className="pr-2">
                      <div className="font-medium text-sm text-gray-900 mb-1 truncate" title={item.label}>
                        {item.label}
                      </div>
                      
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>库存: {item.stock ?? '未知'}</span>
                        <span className="font-medium text-gray-900">¥{Number.isFinite(item.retail_price) ? Number(item.retail_price).toFixed(2) : '--'}</span>
                      </div>
                      
                      <div className="mt-2">
                         {item.available && item.is_active !== false && item.is_active !== 0 ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                            <i className="fas fa-check-circle"></i> 正常
                          </span>
                        ) : item.is_active === false || item.is_active === 0 ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                            <i className="fas fa-pause-circle"></i> 已下架
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                            <i className="fas fa-exclamation-circle"></i> 缺货
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        
        <div className="px-8 py-5 bg-white border-t border-gray-100 flex justify-end gap-3 sticky bottom-0 z-10">
          <button 
            onClick={onClose} 
            className="px-6 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-full hover:bg-gray-50 transition-all duration-200"
          >
            取消
          </button>
          <button 
            onClick={handleSubmit} 
            className="px-8 py-2.5 text-sm font-medium bg-black text-white rounded-full hover:bg-gray-800 transition-all duration-200 shadow-lg hover:shadow-xl"
          >
            保存配置
          </button>
        </div>
      </div>
    </div>
  );
};

export const LotteryConfigPanel = ({ apiPrefix, onWarningChange }) => {
  const { apiRequest } = useApi();
  const [prizes, setPrizes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [thresholdAmount, setThresholdAmount] = useState('10');
  const [thresholdSaving, setThresholdSaving] = useState(false);
  const [isEnabled, setIsEnabled] = useState(true);
  const [enabledSaving, setEnabledSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPrize, setEditingPrize] = useState(null);
  const [viewingPrize, setViewingPrize] = useState(null);
  const [itemsModalOpen, setItemsModalOpen] = useState(false);

  const MIN_THRESHOLD = 0.01;

  const checkForStockWarnings = useCallback((prizesData) => {
    const hasStockWarnings = prizesData.some(prize => {
      if (!prize.is_active) return false;
      const itemList = Array.isArray(prize.items) ? prize.items : [];
      if (itemList.length === 0) return false;
      const hasAvailable = itemList.some(item => item && item.available);
      if (hasAvailable) return false;
      return true;
    });
    
    if (typeof onWarningChange === 'function') {
      onWarningChange(hasStockWarnings);
    }
  }, [onWarningChange]);

  const loadPrizes = async () => {
    setLoading(true);
    try {
      const res = await apiRequest(`${apiPrefix}/lottery-config`);
      const list = res?.data?.prizes || [];
      const prizesData = list.map((p) => {
        const normalizedItems = (p.items || []).map((item) => ({
          ...item,
          available: normalizeBooleanFlag(item?.available, false),
          is_active: normalizeBooleanFlag(item?.is_active, true)
        }));
        return {
          ...p,
          weight: parseFloat(p.weight || 0),
          is_active: normalizeBooleanFlag(p.is_active, true),
          items: normalizedItems
        };
      });
      setPrizes(prizesData);
      const rawThreshold = res?.data?.threshold_amount;
      if (rawThreshold !== undefined && rawThreshold !== null) {
        const numeric = Number(rawThreshold);
        if (Number.isFinite(numeric)) {
          const display = Number.isInteger(numeric) ? numeric.toString() : numeric.toFixed(2);
          setThresholdAmount(display);
        }
      }
      const rawEnabled = res?.data?.is_enabled;
      setIsEnabled(rawEnabled !== false);
      checkForStockWarnings(prizesData);
    } catch (e) {
      alert(e.message || '加载抽奖配置失败');
      setPrizes([]);
      if (onWarningChange) {
        onWarningChange(false);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadPrizes(); }, []);

  const totalWeightRaw = prizes.reduce((acc, p) => {
    if (!p.is_active) return acc;
    
    // 检查该奖项是否有可用的商品
    const itemList = p.items || [];
    if (itemList.length === 0) {
      // 没有任何商品的奖项不计入中奖率
      return acc;
    }
    
    const availableItems = itemList.filter(it => it.available);
    if (availableItems.length === 0) {
      // 没有可用商品的奖项不计入中奖率
      return acc;
    }
    
    return acc + (Number.isFinite(p.weight) ? Math.max(0, p.weight) : 0);
  }, 0);
  const isFraction = totalWeightRaw <= 1.000001;
  const totalPercent = isFraction ? totalWeightRaw * 100 : totalWeightRaw;
  const thanksPercent = Math.max(0, 100 - totalPercent);

  const openModal = (prize = null) => {
    setEditingPrize(prize);
    setModalOpen(true);
  };

  const openItemsModal = (prize) => {
    setViewingPrize(prize);
    setItemsModalOpen(true);
  };

  const handleDelete = async (prize) => {
    if (!prize?.id) return;
    setSaving(true);
    try {
      await apiRequest(`${apiPrefix}/lottery-prizes/${prize.id}`, { method: 'DELETE' });
      await loadPrizes();
    } catch (e) {
      alert(e.message || '删除失败');
    } finally {
      setSaving(false);
    }
    if (!confirm(`确定删除奖项“${prize.display_name}”吗？`)) return;
  };

  const handleToggleActive = async (prize, nextActive) => {
    if (!prize?.id) return;
    setSaving(true);
    try {
      const body = {
        id: prize.id,
        display_name: prize.display_name,
        weight: prize.weight,
        is_active: !!nextActive,
        items: (prize.items || []).map((item) => ({
          id: item.id,
          product_id: item.product_id,
          variant_id: item.variant_id
        }))
      };
      await apiRequest(`${apiPrefix}/lottery-prizes/${prize.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      await loadPrizes();
    } catch (e) {
      alert(e.message || '更新状态失败');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveThreshold = async () => {
    const value = Number.parseFloat(thresholdAmount);
    if (!Number.isFinite(value) || value < MIN_THRESHOLD) {
      alert(`请输入不少于 ${MIN_THRESHOLD} 的抽奖门槛`);
      return;
    }
    setThresholdSaving(true);
    try {
      const resp = await apiRequest(`${apiPrefix}/lottery-config/threshold`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threshold_amount: value })
      });
      if (!resp?.success) {
        throw new Error(resp?.message || '更新抽奖门槛失败');
      }
      const serverValue = Number(resp?.data?.threshold_amount ?? value);
      if (Number.isFinite(serverValue)) {
        const display = Number.isInteger(serverValue)
          ? serverValue.toString()
          : serverValue.toFixed(2);
        setThresholdAmount(display);
      }
    } catch (e) {
      alert(e.message || '更新抽奖门槛失败');
    } finally {
      setThresholdSaving(false);
    }
  };

  const handleToggleEnabled = async () => {
    setEnabledSaving(true);
    try {
      const resp = await apiRequest(`${apiPrefix}/lottery-config/enabled`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_enabled: !isEnabled })
      });
      if (!resp?.success) {
        throw new Error(resp?.message || '更新抽奖启用状态失败');
      }
      setIsEnabled(!isEnabled);
    } catch (e) {
      alert(e.message || '更新抽奖启用状态失败');
    } finally {
      setEnabledSaving(false);
    }
  };

  const handleSavePrize = async (payload) => {
    const weightValue = Number.parseFloat(payload.weight);
    if (Number.isNaN(weightValue)) {
      alert('请输入有效的权重');
      return;
    }
    if ((payload.items || []).length === 0) {
      alert('请至少选择一个奖品商品');
      return;
    }
    setSaving(true);
    try {
      const body = {
        id: editingPrize?.id,
        display_name: payload.displayName.trim(),
        weight: weightValue,
        is_active: payload.isActive,
        items: payload.items.map((item) => ({
          id: item.id,
          product_id: item.product_id,
          variant_id: item.variant_id
        }))
      };
      if (editingPrize?.id) {
        await apiRequest(`${apiPrefix}/lottery-prizes/${editingPrize.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
      } else {
        await apiRequest(`${apiPrefix}/lottery-prizes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
      }
      await loadPrizes();
      setModalOpen(false);
    } catch (e) {
      alert(e.message || '保存抽奖奖项失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden font-sans">
      <div className="px-8 py-6 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h3 className="text-2xl font-bold text-gray-900 tracking-tight">
            抽奖配置
          </h3>
          <p className="text-sm text-gray-500 mt-1">设置抽奖奖池、概率及参与门槛</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3 bg-gray-50 px-4 py-2.5 rounded-full border border-gray-100">
            <span className="text-sm font-medium text-gray-600">功能开关</span>
            <button
              onClick={handleToggleEnabled}
              disabled={enabledSaving}
              className={`relative inline-flex items-center h-6 w-11 rounded-full transition-colors duration-300 focus:outline-none ${
                isEnabled ? 'bg-black' : 'bg-gray-300'
              } disabled:opacity-50`}
            >
              <span className={`inline-block w-4 h-4 transform transition-transform duration-300 bg-white rounded-full shadow-sm ${
                isEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}></span>
            </button>
          </div>
          
          <div className="flex items-center gap-3 bg-gray-50 px-4 py-2.5 rounded-full border border-gray-100">
            <span className="text-sm font-medium text-gray-600">抽奖门槛</span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={MIN_THRESHOLD}
                step="0.01"
                value={thresholdAmount}
                disabled={thresholdSaving || !isEnabled}
                onChange={(e) => setThresholdAmount(e.target.value)}
                onBlur={handleSaveThreshold}
                className="w-16 bg-transparent text-center font-bold text-gray-900 border-b border-gray-300 focus:border-black focus:outline-none disabled:text-gray-400 transition-colors"
              />
              <span className="text-sm text-gray-500">元</span>
            </div>
          </div>
          
          <div className="flex items-center gap-4 bg-gray-50 px-5 py-2.5 rounded-full border border-gray-100">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">中奖率</span>
              <span className="text-sm font-bold text-gray-900">
                {Number.isFinite(totalPercent) ? totalPercent.toFixed(2) : '0.00'}%
              </span>
            </div>
            <div className="h-4 w-px bg-gray-300"></div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">谢谢参与</span>
              <span className={`text-sm font-bold ${totalPercent > 100 ? 'text-red-500' : 'text-gray-900'}`}>
                {thanksPercent.toFixed(2)}%
              </span>
            </div>
          </div>
          
          <button
            onClick={() => openModal(null)}
            disabled={!isEnabled}
            className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-medium shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-0.5 ${
              isEnabled 
                ? 'bg-black text-white hover:bg-gray-800' 
                : 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'
            }`}
          >
            <i className="fas fa-plus"></i>
            新增奖项
          </button>
        </div>
      </div>

      {loading ? (
        <div className="px-6 py-24 text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-gray-200 border-t-black mx-auto mb-4"></div>
          <p className="text-gray-500 font-medium">加载配置中...</p>
        </div>
      ) : prizes.length === 0 ? (
        <div className="px-6 py-24 text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gray-50 rounded-full mb-6 border border-gray-100">
            <i className="fas fa-gift text-3xl text-gray-300"></i>
          </div>
          <p className="text-lg font-bold text-gray-900 mb-2">尚未配置奖项</p>
          <p className="text-sm text-gray-500">点击右上角按钮添加第一个奖项</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50/50 border-b border-gray-100">
                <tr>
                  <th className="px-8 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">奖项名称</th>
                  <th className="px-4 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">状态</th>
                  <th className="px-4 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">权重</th>
                  <th className="px-4 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">商品数</th>
                  <th className="px-4 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">可用库存</th>
                  <th className="px-8 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {prizes.map((prize, index) => {
                  const itemList = prize.items || [];
                  const availableItems = itemList.filter(it => it.available);
                  const hasWarning = availableItems.length === 0 && itemList.length > 0;
                  
                  return (
                    <tr key={prize.id} className="hover:bg-gray-50/50 transition-colors group">
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-4">
                          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 font-bold text-xs">
                            {index + 1}
                          </div>
                          <div>
                            <div className="font-bold text-gray-900">{prize.display_name}</div>
                            {hasWarning && (
                              <div className="flex items-center gap-1.5 text-xs text-red-500 mt-1 font-medium">
                                <i className="fas fa-exclamation-triangle"></i>
                                <span>无可用库存</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      
                      <td className="px-4 py-5 text-center">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                          prize.is_active 
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                            : 'bg-gray-50 text-gray-500 border-gray-200'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${prize.is_active ? 'bg-emerald-500' : 'bg-gray-400'}`}></span>
                          {prize.is_active ? '启用' : '停用'}
                        </span>
                      </td>
                      
                      <td className="px-4 py-5 text-center">
                        <span className="font-mono text-sm font-medium text-gray-700 bg-gray-100 px-2 py-1 rounded">
                          {Number.isFinite(prize.weight) ? prize.weight : 0}
                        </span>
                      </td>
                      
                      <td className="px-4 py-5 text-center">
                        <span className="text-sm text-gray-600">{itemList.length}</span>
                      </td>
                      
                      <td className="px-4 py-5 text-center">
                        <span className={`text-sm font-bold ${availableItems.length > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                          {availableItems.length}
                        </span>
                      </td>
                      
                      <td className="px-8 py-5 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {itemList.length > 0 && (
                            <button
                              onClick={() => openItemsModal(prize)}
                              className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all"
                              title="查看商品"
                            >
                              <i className="fas fa-eye"></i>
                            </button>
                          )}
                          <button
                            onClick={() => handleToggleActive(prize, !prize.is_active)}
                            className={`p-2 rounded-lg transition-all ${
                              prize.is_active 
                                ? 'text-gray-400 hover:text-amber-600 hover:bg-amber-50' 
                                : 'text-gray-400 hover:text-emerald-600 hover:bg-emerald-50'
                            }`}
                            title={prize.is_active ? '停用' : '启用'}
                          >
                            <i className={`fas ${prize.is_active ? 'fa-pause' : 'fa-play'}`}></i>
                          </button>
                          <button
                            onClick={() => openModal(prize)}
                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                            title="编辑"
                          >
                            <i className="fas fa-edit"></i>
                          </button>
                          <button
                            onClick={() => handleDelete(prize)}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                            title="删除"
                          >
                            <i className="fas fa-trash"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      
      {(saving || thresholdSaving) && (
        <div className="px-8 py-3 bg-gray-50 border-t border-gray-100 flex items-center gap-3 text-sm text-gray-600 animate-pulse">
          <i className="fas fa-spinner fa-spin"></i>
          <span>正在保存更改...</span>
        </div>
      )}
      
      <LotteryItemsViewModal
        open={itemsModalOpen}
        onClose={() => setItemsModalOpen(false)}
        prize={viewingPrize}
      />
      
      <LotteryPrizeModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSavePrize}
        initialPrize={editingPrize}
        apiRequest={apiRequest}
        apiPrefix={apiPrefix}
      />
    </div>
  );
};
