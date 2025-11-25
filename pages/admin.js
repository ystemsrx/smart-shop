import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useAuth, useApi, useAdminShop, useAgentStatus } from '../hooks/useAuth';
import { useRouter } from 'next/router';
import Toast from '../components/Toast';
import { getProductImage } from '../utils/urls';
import Nav from '../components/Nav';
import { getShopName } from '../utils/runtimeConfig';
import { useToast } from '../hooks/useToast';
import { Modal } from '../components/admin/Modal';
import { ProductsPanel, ProductForm, VariantStockModal } from '../components/admin/products';
import { OrdersPanel, getUnifiedStatus, UNIFIED_STATUS_ORDER } from '../components/admin/orders';
import { normalizeBooleanFlag } from '../components/admin/helpers';


// 代理状态卡片（打烊/营业）
const AgentStatusCard = () => {
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
      <div className="mb-6 bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
          <div className="h-6 bg-gray-200 rounded w-1/3"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6 bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 代理状态控制 */}
        <div className="flex flex-col justify-between">
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

        {/* 预约下单控制 */}
        <div className="flex flex-col justify-between md:border-l md:border-gray-200 md:pl-6">
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
  );
};

// 注册设置卡片
const RegistrationSettingsCard = () => {
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

// 店铺状态卡片（打烊/营业）
const ShopStatusCard = () => {
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

// 商品详情弹窗组件
const LotteryItemsViewModal = ({ open, onClose, prize }) => {
  const [isVisible, setIsVisible] = React.useState(false);
  
  React.useEffect(() => {
    if (open) {
      // 延迟一帧以触发动画
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
      isVisible ? 'bg-black/50 backdrop-blur-sm' : 'bg-black/0'
    }`}>
      <div className="absolute inset-0" onClick={onClose}></div>
      <div className={`relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl mx-4 max-h-[80vh] flex flex-col overflow-hidden transform transition-all duration-300 ${
        isVisible ? 'scale-100 opacity-100 translate-y-0' : 'scale-95 opacity-0 translate-y-4'
      }`}>
        {/* 标题栏 */}
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gradient-to-r from-indigo-50 to-purple-50">
          <div>
            <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <i className="fas fa-gift text-indigo-600"></i>
              {prize.display_name}
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              共 {itemList.length} 件商品 · 权重 {Number.isFinite(prize.weight) ? prize.weight : 0}%
            </p>
          </div>
          <button 
            onClick={onClose} 
            className="w-10 h-10 rounded-full bg-white hover:bg-gray-100 flex items-center justify-center text-gray-600 shadow-sm transition-all hover:scale-110"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>
        
        {/* 商品列表 */}
        <div className="flex-1 overflow-y-auto p-6">
          {itemList.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 py-12">
              <i className="fas fa-box-open text-6xl mb-4 opacity-30"></i>
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
                
                // 确定状态文本和样式
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
                    className={`rounded-xl border-2 p-4 transition-all hover:shadow-lg ${
                      available 
                        ? 'border-emerald-200 bg-gradient-to-br from-emerald-50/50 to-white hover:border-emerald-300' 
                        : 'border-red-200 bg-gradient-to-br from-red-50/50 to-white hover:border-red-300'
                    }`}
                  >
                    {/* 商品标题 */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-gray-900 text-sm truncate" title={label}>
                          {label}
                        </h4>
                        {item.variant_name && (
                          <p className="text-xs text-gray-600 mt-0.5 truncate" title={item.variant_name}>
                            规格：{item.variant_name}
                          </p>
                        )}
                      </div>
                      {available ? (
                        <span className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium">
                          <i className={`fas ${statusIcon}`}></i>
                          {statusText}
                        </span>
                      ) : (
                        <span className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                          <i className={`fas ${statusIcon}`}></i>
                          {statusText}
                        </span>
                      )}
                    </div>
                    
                    {/* 商品信息 */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-white/60 rounded-lg px-3 py-2">
                        <div className="text-xs text-gray-500 mb-1">库存</div>
                        <div className={`font-bold ${available ? 'text-gray-900' : 'text-red-600'}`}>
                          {Number.isNaN(stock) ? '未知' : stock}
                        </div>
                      </div>
                      <div className="bg-white/60 rounded-lg px-3 py-2">
                        <div className="text-xs text-gray-500 mb-1">参考价值</div>
                        <div className="font-bold text-indigo-600">
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
        
        {/* 底部统计 */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-4">
              <span className="text-gray-600">
                <i className="fas fa-box text-indigo-600 mr-2"></i>
                总商品数：<span className="font-semibold text-gray-900">{itemList.length}</span>
              </span>
              <span className="text-gray-600">
                <i className="fas fa-check-circle text-emerald-600 mr-2"></i>
                可用商品：<span className="font-semibold text-emerald-700">
                  {itemList.filter(it => it.available).length}
                </span>
              </span>
            </div>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
            >
              关闭
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// 抽奖配置管理面板
const LotteryConfigPanel = ({ apiPrefix, onWarningChange }) => {
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

  // 计算是否有奖项存在库存问题
  const checkForStockWarnings = useCallback((prizesData) => {
    const hasStockWarnings = prizesData.some(prize => {
      if (!prize.is_active) return false; // 只检查启用的奖项
      const itemList = Array.isArray(prize.items) ? prize.items : [];
      if (itemList.length === 0) return false; // 没有关联商品的奖项不算
      const hasAvailable = itemList.some(item => item && item.available);
      if (hasAvailable) return false; // 仍有可抽取的奖品则不警告
      return true; // 所有关联商品都不可用（下架或无库存）
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
      // 设置启用状态
      const rawEnabled = res?.data?.is_enabled;
      setIsEnabled(rawEnabled !== false);
      // 检查库存警告
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

  // 只计算启用奖项的权重总和
  const totalWeightRaw = prizes.reduce((acc, p) => {
    if (!p.is_active) return acc; // 跳过停用的奖项
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
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
      {/* 顶部控制栏 - 重新设计为更紧凑的布局 */}
      <div className="bg-gradient-to-r from-indigo-50 via-purple-50 to-pink-50 px-6 py-4 border-b border-gray-200">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <i className="fas fa-trophy text-amber-500"></i>
              抽奖奖项配置
            </h3>
            <p className="text-sm text-gray-600 mt-1">根据库存权重自动抽取，可组合多种商品</p>
          </div>
          
          <div className="flex items-center gap-3 flex-wrap">
            {/* 抽奖功能开关 */}
            <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-gray-200 shadow-sm">
              <span className="text-sm font-medium text-gray-700">抽奖功能</span>
              <button
                onClick={handleToggleEnabled}
                disabled={enabledSaving}
                className={`relative inline-flex items-center h-6 w-11 rounded-full transition-colors ${
                  isEnabled ? 'bg-emerald-500' : 'bg-gray-300'
                } disabled:opacity-50`}
                title="点击切换抽奖功能启用状态"
              >
                <span className={`inline-block w-4 h-4 transform transition-transform bg-white rounded-full shadow-sm ${
                  isEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}></span>
              </button>
              <span className={`text-xs font-medium ${isEnabled ? 'text-emerald-600' : 'text-gray-500'}`}>
                {enabledSaving ? '保存中...' : (isEnabled ? '已启用' : '已禁用')}
              </span>
            </div>
            
            {/* 抽奖门槛 */}
            <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-gray-200 shadow-sm">
              <span className="text-sm font-medium text-gray-700">抽奖门槛</span>
              <input
                type="number"
                min={MIN_THRESHOLD}
                step="0.01"
                value={thresholdAmount}
                disabled={thresholdSaving || !isEnabled}
                onChange={(e) => setThresholdAmount(e.target.value)}
                onBlur={handleSaveThreshold}
                className="w-20 px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100"
                title="失焦时自动保存"
              />
              <span className="text-sm text-gray-600">元</span>
              {thresholdSaving && (
                <i className="fas fa-spinner fa-spin text-indigo-600"></i>
              )}
            </div>
            
            {/* 概率统计 */}
            <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-lg border border-gray-200 shadow-sm">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-500">中奖率</span>
                <span className="text-sm font-bold text-indigo-600">
                  {Number.isFinite(totalPercent) ? totalPercent.toFixed(2) : '0.00'}%
                </span>
              </div>
              <div className="h-4 w-px bg-gray-300"></div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-500">谢谢参与</span>
                <span className={`text-sm font-bold ${totalPercent > 100 ? 'text-red-600' : 'text-gray-600'}`}>
                  {thanksPercent.toFixed(2)}%
                </span>
              </div>
            </div>
            
            {/* 新增按钮 */}
            <button
              onClick={() => openModal(null)}
              disabled={!isEnabled}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium shadow-sm transition-all ${
                isEnabled 
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 hover:shadow-md' 
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
              title={!isEnabled ? '请先启用抽奖功能' : ''}
            >
              <i className="fas fa-plus"></i>
              新增奖项
            </button>
          </div>
        </div>
      </div>

      {/* 内容区域 */}
      {loading ? (
        <div className="px-6 py-12 text-center">
          <i className="fas fa-spinner fa-spin text-4xl text-indigo-600 mb-4"></i>
          <p className="text-gray-600">加载中...</p>
        </div>
      ) : prizes.length === 0 ? (
        <div className="px-6 py-16 text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-full mb-4">
            <i className="fas fa-gift text-4xl text-indigo-600"></i>
          </div>
          <p className="text-lg font-medium text-gray-900 mb-2">尚未配置任何奖项</p>
          <p className="text-sm text-gray-500">点击上方"新增奖项"开始配置抽奖系统</p>
        </div>
      ) : (
        <>
          {/* 表格布局 - 更紧凑美观 */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">奖项名称</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">状态</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">权重</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">商品数</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">可用商品</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {prizes.map((prize, index) => {
                  const itemList = prize.items || [];
                  const availableItems = itemList.filter(it => it.available);
                  const hasWarning = availableItems.length === 0 && itemList.length > 0;
                  
                  return (
                    <tr key={prize.id} className={`hover:bg-gray-50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                      {/* 奖项名称 */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex-shrink-0 w-8 h-8 rounded-full border-2 border-gray-300 flex items-center justify-center text-gray-600 font-semibold text-sm bg-white">
                            {index + 1}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-gray-900 truncate">{prize.display_name}</div>
                            {hasWarning && (
                              <div className="flex items-center gap-1 text-xs text-red-600 mt-1">
                                <i className="fas fa-exclamation-triangle"></i>
                                <span>无可用库存</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      
                      {/* 状态 */}
                      <td className="px-4 py-4 text-center">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
                          prize.is_active 
                            ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' 
                            : 'bg-gray-100 text-gray-600 border border-gray-200'
                        }`}>
                          <i className={`fas fa-circle text-[6px] ${prize.is_active ? 'text-emerald-500' : 'text-gray-400'}`}></i>
                          {prize.is_active ? '启用中' : '已停用'}
                        </span>
                      </td>
                      
                      {/* 权重 */}
                      <td className="px-4 py-4 text-center">
                        <span className="inline-flex items-center gap-1 text-sm font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-lg">
                          <i className="fas fa-percentage text-xs"></i>
                          {Number.isFinite(prize.weight) ? prize.weight : 0}
                        </span>
                      </td>
                      
                      {/* 商品数 */}
                      <td className="px-4 py-4 text-center">
                        <span className="text-sm font-medium text-gray-900">{itemList.length}</span>
                      </td>
                      
                      {/* 可用商品 */}
                      <td className="px-4 py-4 text-center">
                        <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${
                          availableItems.length > 0 ? 'text-emerald-600' : 'text-red-600'
                        }`}>
                          <i className={`fas ${availableItems.length > 0 ? 'fa-check-circle' : 'fa-times-circle'}`}></i>
                          {availableItems.length}
                        </span>
                      </td>
                      
                      {/* 操作按钮 */}
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-2">
                          {itemList.length > 0 && (
                            <button
                              onClick={() => openItemsModal(prize)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-md transition-colors"
                              title="查看商品详情"
                            >
                              <i className="fas fa-eye"></i>
                              查看
                            </button>
                          )}
                          <button
                            onClick={() => handleToggleActive(prize, !prize.is_active)}
                            className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                              prize.is_active 
                                ? 'text-amber-600 bg-amber-50 hover:bg-amber-100' 
                                : 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100'
                            }`}
                            title={prize.is_active ? '停用奖项' : '启用奖项'}
                          >
                            <i className={`fas ${prize.is_active ? 'fa-pause' : 'fa-play'}`}></i>
                            {prize.is_active ? '停用' : '启用'}
                          </button>
                          <button
                            onClick={() => openModal(prize)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
                            title="编辑奖项"
                          >
                            <i className="fas fa-edit"></i>
                            编辑
                          </button>
                          <button
                            onClick={() => handleDelete(prize)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-md transition-colors"
                            title="删除奖项"
                          >
                            <i className="fas fa-trash"></i>
                            删除
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
      
      {/* 保存提示 */}
      {(saving || thresholdSaving) && (
        <div className="px-6 py-3 bg-indigo-50 border-t border-indigo-100 flex items-center gap-2 text-sm">
          <i className="fas fa-spinner fa-spin text-indigo-600"></i>
          <span className="text-indigo-700 font-medium">正在保存更改...</span>
        </div>
      )}
      
      {/* 商品查看弹窗 */}
      <LotteryItemsViewModal
        open={itemsModalOpen}
        onClose={() => setItemsModalOpen(false)}
        prize={viewingPrize}
      />
      
      {/* 编辑/新增奖项弹窗 */}
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
  const searchTimerRef = React.useRef(null);
  
  // 动画效果
  React.useEffect(() => {
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
    available: normalizeBooleanFlag(item.available, false),
    label: item.variant_name ? `${item.product_name || ''} - ${item.variant_name}` : (item.product_name || item.label || ''),
  });

  useEffect(() => {
    if (!open) {
      // 延迟清空数据，等动画结束
      const timer = setTimeout(() => {
        setDisplayName('');
        setWeight('0');
        setIsActive(true);
        setSelectedItems([]);
        setSearchTerm('');
        setSearchResults([]);
        setError('');
      }, 300); // 与动画时长一致
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
      isVisible ? 'bg-black/40 backdrop-blur-sm' : 'bg-black/0'
    } ${!isVisible && 'pointer-events-none'}`}>
      <div className="absolute inset-0" onClick={onClose}></div>
      <div className={`relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden transform transition-all duration-300 ${
        isVisible ? 'scale-100 opacity-100 translate-y-0' : 'scale-95 opacity-0 translate-y-4'
      }`}>
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{initialPrize ? '编辑奖项' : '新增奖项'}</h3>
            <p className="text-sm text-gray-500">搜索并选择商品，支持多选组合。</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600">
            <i className="fas fa-times"></i>
          </button>
        </div>
        <div className="px-6 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700">奖项名称</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="输入奖项名称，如：火腿肠、小零食等"
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">概率权重</label>
              <input
                type="number"
                step="0.01"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              />
              <p className="mt-1 text-xs text-gray-500">支持填写百分比（如 5 表示 5%）或小数（如 0.05 表示 5%）。</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">状态</label>
            <button
              onClick={() => setIsActive(prev => !prev)}
              className={`px-3 py-1.5 rounded-full text-xs border ${isActive ? 'bg-green-100 border-green-200 text-green-700' : 'bg-gray-100 border-gray-200 text-gray-600'}`}
            >
              {isActive ? '已启用' : '未启用'}
            </button>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">搜索商品并添加到奖池</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="输入商品名称、类别关键字"
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
            />
            <div className="mt-2 border border-gray-200 rounded-md max-h-40 overflow-y-auto">
              {searchLoading ? (
                <div className="px-3 py-2 text-xs text-gray-500">搜索中...</div>
              ) : (searchResults || []).length === 0 ? (
                <div className="px-3 py-2 text-xs text-gray-500">未找到匹配的商品</div>
              ) : (
                searchResults.map(item => {
                  const key = `${item.product_id}__${item.variant_id || 'base'}`;
                  const alreadySelected = selectedItems.some(it => `${it.product_id}__${it.variant_id || 'base'}` === key);
                  // 构建完整的商品名称显示
                  const fullName = item.variant_name ? 
                    `${item.product_name || item.label || ''} - ${item.variant_name}` : 
                    (item.product_name || item.label || '');
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleAddItem(item)}
                      disabled={alreadySelected}
                      className={`w-full text-left px-3 py-2 text-sm border-b border-gray-100 last:border-b-0 ${alreadySelected ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'hover:bg-indigo-50'}`}
                    >
                      <div className="font-medium text-gray-800 flex items-center gap-2">
                        <span>{fullName}</span>
                        {alreadySelected && <span className="text-xs text-gray-500">已添加</span>}
                      </div>
                      <div className="text-[11px] text-gray-500 flex items-center gap-3 mt-1">
                        <span>库存：{item.stock}</span>
                        <span>价值：¥{Number.isFinite(item.retail_price) ? Number(item.retail_price).toFixed(2) : '--'}</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-gray-700">
                已选择的奖品商品
                {selectedItems.length > 0 && (
                  <span className="ml-2 text-xs text-gray-500">({selectedItems.length} 件)</span>
                )}
              </label>
            </div>
            {selectedItems.length === 0 ? (
              <div className="text-xs text-gray-500 border border-dashed border-gray-300 rounded-lg px-4 py-8 text-center bg-gray-50/50">
                <i className="fas fa-inbox text-2xl text-gray-400 mb-2"></i>
                <p>尚未选择任何商品</p>
                <p className="text-gray-400 mt-1">请使用上方搜索框添加商品</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-60 overflow-y-auto overflow-x-hidden pt-3 pb-1 px-1">
                {selectedItems.map(item => (
                  <div 
                    key={`${item.product_id}_${item.variant_id || 'base'}`} 
                    className={`relative group rounded-xl border-2 p-3 transition-all hover:shadow-md ${
                      item.available 
                        ? 'border-emerald-200 bg-emerald-50/30 hover:bg-emerald-50' 
                        : 'border-red-200 bg-red-50/30 hover:bg-red-50'
                    }`}
                  >
                    {/* 删除按钮 - 圆形叉号 */}
                    <button
                      onClick={() => handleRemoveItem(item.product_id, item.variant_id)}
                      className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-lg transition-all hover:scale-110 z-10"
                      title="移除商品"
                    >
                      <i className="fas fa-times text-xs"></i>
                    </button>
                    
                    {/* 商品信息 */}
                    <div className="pr-2">
                      {/* 商品名称 */}
                      <div className="font-medium text-sm text-gray-900 mb-2 line-clamp-2 min-h-[2.5rem]" title={item.label}>
                        {item.label}
                      </div>
                      
                      {/* 库存和价格 */}
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1">
                          <i className={`fas fa-cube ${item.available ? 'text-emerald-600' : 'text-red-600'}`}></i>
                          <span className={item.available ? 'text-emerald-700 font-medium' : 'text-red-700 font-medium'}>
                            {item.stock ?? '未知'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-indigo-600 font-semibold">
                          <i className="fas fa-tag text-xs"></i>
                          <span>¥{Number.isFinite(item.retail_price) ? Number(item.retail_price).toFixed(2) : '--'}</span>
                        </div>
                      </div>
                      
                      {/* 状态标签 - 包括正常、缺货、下架 */}
                      <div className="mt-2">
                        {item.available && item.is_active !== false && item.is_active !== 0 ? (
                          <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium">
                            <i className="fas fa-check-circle text-[10px]"></i>
                            <span>正常</span>
                          </div>
                        ) : !item.available && (item.is_active === false || item.is_active === 0) ? (
                          <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-700 rounded-full text-xs font-medium">
                            <i className="fas fa-pause-circle text-[10px]"></i>
                            <span>下架</span>
                          </div>
                        ) : !item.available ? (
                          <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                          <i className="fas fa-exclamation-circle text-[10px]"></i>
                          <span>缺货</span>
                        </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-100">取消</button>
          <button onClick={handleSubmit} className="px-4 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700">保存</button>
        </div>
      </div>
    </div>
  );
};

const GiftThresholdPanel = ({ apiPrefix, onWarningChange }) => {
  const { apiRequest } = useApi();
  const [thresholds, setThresholds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingThreshold, setEditingThreshold] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // 计算是否有门槛存在库存问题
  const checkForStockWarnings = useCallback((thresholdsData) => {
    const hasStockWarnings = thresholdsData.some(threshold => {
      if (!threshold.is_active) return false; // 只检查启用的门槛
      if (!threshold.gift_products) return false; // 只检查赠送商品的门槛
      const itemList = Array.isArray(threshold.items) ? threshold.items : [];
      if (itemList.length === 0) return false; // 没有关联商品的门槛不算
      const hasAvailable = itemList.some(item => item && item.available);
      if (hasAvailable) return false; // 仍有可用的赠品则不警告
      return true; // 所有关联商品都不可用（下架或无库存）
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
    // Removed the confirmation dialog for deletion
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
      {/* 顶部控制栏 - 使用渐变背景与抽奖配置一致 */}
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
      
      {/* 内容区域 */}
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
                {/* 顶部标题栏 */}
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
                  
                  {/* 操作按钮组 */}
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
                
                {/* 配置详情卡片 */}
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
                
                {/* 商品列表 */}
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

const DeliverySettingsPanel = ({ apiPrefix }) => {
  const { apiRequest } = useApi();
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

  useEffect(() => { loadSettings(); }, []);

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
  const searchTimerRef = React.useRef(null);

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
      // 编辑模式
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
        // 编辑模式
        await apiRequest(`${apiPrefix}/gift-thresholds/${threshold.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
      } else {
        // 创建模式
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
        {/* 顶部标题栏 - 渐变背景 */}
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
          {/* 门槛金额 */}
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

          {/* 赠品类型选择 + 每单上限 */}
          <div className="bg-white rounded-xl border-2 border-gray-200 p-5 shadow-sm space-y-4">
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <i className="fas fa-gift text-pink-500"></i>
              赠品配置
            </label>
            
            <div className="grid md:grid-cols-2 gap-4">
              {/* 赠品类型 */}
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
              
              {/* 每单上限 */}
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

          {/* 优惠券金额 */}
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

          {/* 商品选择 */}
          {formData.gift_products && (
            <div className="bg-white rounded-xl border-2 border-green-200 p-5 shadow-sm">
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-4">
                <i className="fas fa-box text-green-500"></i>
                选择赠送商品
              </label>
              
              <div className="space-y-4">
                {/* 已选择商品 */}
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
                
                {/* 搜索框 */}
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
                
                {/* 搜索结果 */}
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
          
          {/* 底部操作栏 */}
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

const AutoGiftModal = ({ open, onClose, onSave, initialItems, apiRequest }) => {
  const [selectedItems, setSelectedItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimerRef = React.useRef(null);

  useEffect(() => {
    if (!open) {
      setSelectedItems([]);
      setSearchResults([]);
      setSearchTerm('');
      return;
    }
    setSelectedItems((initialItems || []).map(item => ({ ...item })));
    setSearchResults([]);
    setSearchTerm('');
  }, [open, initialItems]);

  useEffect(() => {
    if (!open) return;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    const term = (searchTerm || '').trim();
    searchTimerRef.current = setTimeout(async () => {
      try {
        setSearchLoading(true);
        const res = await apiRequest(`/admin/auto-gifts/search${term ? `?query=${encodeURIComponent(term)}` : ''}`);
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
  }, [searchTerm, open, apiRequest]);

  const keyOf = (item) => `${item.product_id}__${item.variant_id || 'base'}`;

  const handleAdd = (item) => {
    const key = keyOf(item);
    if (selectedItems.some((it) => keyOf(it) === key)) {
      return;
    }
    setSelectedItems(prev => [...prev, { ...item }]);
  };

  const handleRemove = (productId, variantId) => {
    setSelectedItems(prev => prev.filter(it => !(it.product_id === productId && (it.variant_id || null) === (variantId || null))));
  };

  const handleSubmit = () => {
    onSave(selectedItems.map(it => ({ product_id: it.product_id, variant_id: it.variant_id })));
  };

  return (
    <div className={`fixed inset-0 z-50 ${open ? '' : 'pointer-events-none opacity-0'} flex items-center justify-center bg-black/40 transition-opacity`}>
      <div className="absolute inset-0" onClick={onClose}></div>
      <div className={`relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl mx-4 overflow-hidden transform transition-all ${open ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}>
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">编辑满额赠品池</h3>
            <p className="text-sm text-gray-500">可选择多个商品或规格，系统优先赠送库存最多的商品。</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600">
            <i className="fas fa-times"></i>
          </button>
        </div>
        <div className="px-6 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="text-sm font-medium text-gray-700">已选择的赠品</label>
            {selectedItems.length === 0 ? (
              <div className="mt-2 text-xs text-gray-500 border border-dashed border-gray-300 rounded-md px-3 py-4 text-center">
                尚未选择任何商品，使用下方搜索框添加。
              </div>
            ) : (
              <div className="mt-2 grid gap-2">
                {selectedItems.map(item => {
                  const label = item.variant_name ? `${item.product_name || '商品'} - ${item.variant_name}` : (item.product_name || '商品');
                  const stock = Number.isFinite(item.stock) ? item.stock : '--';
                  return (
                    <div key={keyOf(item)} className="px-3 py-2 rounded-md border border-gray-200 bg-gray-50 flex items-center justify-between">
                      <div className="text-xs">
                        <div className="font-medium">{label}</div>
                        <div className="mt-1 text-[11px] text-gray-500 flex items-center gap-3">
                          <span>库存：{stock}</span>
                          <span>价值：¥{Number.isFinite(item.retail_price) ? Number(item.retail_price).toFixed(2) : '--'}</span>
                        </div>
                      </div>
                      <button onClick={() => handleRemove(item.product_id, item.variant_id)} className="text-xs text-red-600 hover:text-red-800">移除</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">搜索商品并添加</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="输入商品名称或类别关键字"
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
            />
            <div className="mt-2 border border-gray-200 rounded-md max-h-48 overflow-y-auto">
              {searchLoading ? (
                <div className="px-3 py-2 text-xs text-gray-500">搜索中...</div>
              ) : (searchResults || []).length === 0 ? (
                <div className="px-3 py-2 text-xs text-gray-500">未找到匹配的商品</div>
              ) : (
                searchResults.map(item => {
                  const key = keyOf(item);
                  const alreadySelected = selectedItems.some(it => keyOf(it) === key);
                  const label = item.variant_name ? `${item.product_name || '商品'} - ${item.variant_name}` : (item.product_name || '商品');
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleAdd(item)}
                      disabled={alreadySelected}
                      className={`w-full text-left px-3 py-2 text-sm border-b border-gray-100 last:border-b-0 ${alreadySelected ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'hover:bg-indigo-50'}`}
                    >
                      <div className="font-medium text-gray-800 flex items-center gap-2">
                        <span>{label}</span>
                        {alreadySelected && <span className="text-xs text-gray-500">已添加</span>}
                      </div>
                      <div className="text-[11px] text-gray-500 flex items-center gap-3 mt-1">
                        <span>库存：{item.stock}</span>
                        <span>价值：¥{Number.isFinite(item.retail_price) ? Number(item.retail_price).toFixed(2) : '--'}</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-100">取消</button>
          <button onClick={handleSubmit} className="px-4 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700">保存</button>
        </div>
      </div>
    </div>
  );
};

// 统计卡片组件
const StatsCard = ({ title, value, icon, color = "indigo" }) => {
  const colorClasses = {
    indigo: "bg-indigo-500",
    green: "bg-green-500",
    yellow: "bg-yellow-500",
    purple: "bg-purple-500"
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center">
        <div className={`flex-shrink-0 ${colorClasses[color]} rounded-md p-3`}>
          <div className="text-white text-xl">{icon}</div>
        </div>
        <div className="ml-5 w-0 flex-1">
          <dl>
            <dt className="text-sm font-medium text-gray-500 truncate">{title}</dt>
            <dd className="text-lg font-medium text-gray-900">{value}</dd>
          </dl>
        </div>
      </div>
    </div>
  );
};

const CouponsPanel = ({ apiPrefix }) => {
  const { apiRequest } = useApi();
  const [q, setQ] = React.useState('');
  const [suggests, setSuggests] = React.useState([]);
  const [selected, setSelected] = React.useState('');
  const [amount, setAmount] = React.useState('');
  const [quantity, setQuantity] = React.useState(1);
  const [expiresAt, setExpiresAt] = React.useState(''); // datetime-local
  const [list, setList] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [issuing, setIssuing] = React.useState(false);
  const [expandedStudents, setExpandedStudents] = React.useState(new Set());
  const [statusFilter, setStatusFilter] = React.useState('all'); // all, active, used, revoked
  const [searchUser, setSearchUser] = React.useState('');

  // 实时查询（只有输入至少一个字符时才搜索）
  React.useEffect(() => {
    if (q.trim().length === 0) {
      setSuggests([]);
      return;
    }
    
    let mounted = true;
    (async () => {
      try {
        const r = await apiRequest(`/admin/students/search?q=${encodeURIComponent(q)}`);
        if (!mounted) return;
        setSuggests(r?.data?.students || []);
      } catch (e) {
        if (!mounted) return;
        setSuggests([]);
      }
    })();
    return () => { mounted = false; };
  }, [q, apiRequest]);

  const loadList = async () => {
    setLoading(true);
    try {
      // 始终加载所有优惠券，不受发放优惠券时选择的用户影响
      const r = await apiRequest(`${apiPrefix}/coupons`);
      setList(r?.data?.coupons || []);
    } catch (e) {
      setList([]);
    } finally {
      setLoading(false);
    }
  };

  // 组件挂载时加载一次列表
  React.useEffect(() => { loadList(); }, []);

  const handleIssue = async () => {
    const sid = selected || (suggests[0]?.id || '');
    if (!sid) { alert('请选择用户'); return; }
    const amt = parseFloat(amount);
    if (!(amt > 0)) { alert('请输入正确金额'); return; }
    let expires = null;
    if (expiresAt) {
      const t = new Date(expiresAt);
      if (!isNaN(t.getTime())) {
        const pad = (n) => n.toString().padStart(2, '0');
        expires = `${t.getFullYear()}-${pad(t.getMonth()+1)}-${pad(t.getDate())} ${pad(t.getHours())}:${pad(t.getMinutes())}:00`;
      }
    }
    setIssuing(true);
    try {
      await apiRequest(`${apiPrefix}/coupons/issue`, {
        method: 'POST',
        body: JSON.stringify({ student_id: sid, amount: amt, quantity: parseInt(quantity)||1, expires_at: expires })
      });
      setAmount('');
      setQuantity(1);
      await loadList();
      alert('发放成功');
    } catch (e) {
      alert(e.message || '发放失败');
    } finally {
      setIssuing(false);
    }
  };

  const handleRevoke = async (id) => {
    if (!confirm('确定撤回该优惠券？')) return;
    try {
      await apiRequest(`${apiPrefix}/coupons/${id}/revoke`, { method: 'PATCH' });
      await loadList();
    } catch (e) {
      alert(e.message || '撤回失败');
    }
  };

  const handleDelete = async (id) => {
    try {
      await apiRequest(`${apiPrefix}/coupons/${id}`, { method: 'DELETE' });
      await loadList();
    } catch (e) {
      alert(e.message || '删除失败');
    }
  };

  const toggleStudentExpanded = (studentId) => {
    const newExpanded = new Set(expandedStudents);
    if (newExpanded.has(studentId)) {
      newExpanded.delete(studentId);
    } else {
      newExpanded.add(studentId);
    }
    setExpandedStudents(newExpanded);
  };

  // 统计数据
  const stats = React.useMemo(() => {
    const total = list.length;
    const active = list.filter(c => c.status === 'active' && !c.expired).length;
    const used = list.filter(c => c.status === 'used').length;
    const revoked = list.filter(c => c.status === 'revoked').length;
    const expired = list.filter(c => c.expired && c.status === 'active').length;
    return { total, active, used, revoked, expired };
  }, [list]);

  // 过滤优惠券
  const filteredList = React.useMemo(() => {
    return list.filter(c => {
      // 状态筛选
      if (statusFilter === 'active' && (c.status !== 'active' || c.expired)) return false;
      if (statusFilter === 'used' && c.status !== 'used') return false;
      if (statusFilter === 'revoked' && c.status !== 'revoked') return false;
      if (statusFilter === 'expired' && (!c.expired || c.status !== 'active')) return false;
      
      // 用户搜索 - 支持用户名和昵称
      if (searchUser) {
        const searchLower = searchUser.toLowerCase();
        const matchStudentId = c.student_id?.toLowerCase().includes(searchLower);
        const matchUserName = c.user_name?.toLowerCase().includes(searchLower);
        if (!matchStudentId && !matchUserName) return false;
      }
      
      return true;
    });
  }, [list, statusFilter, searchUser]);

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">优惠券管理</h2>
        <p className="text-sm text-gray-600 mt-1">发放、管理和查看所有用户的优惠券使用情况</p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">总计</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{stats.total}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <i className="fas fa-ticket-alt text-blue-600 text-xl"></i>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">可用</p>
              <p className="text-2xl font-bold text-green-600 mt-1">{stats.active}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <i className="fas fa-check-circle text-green-600 text-xl"></i>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">已使用</p>
              <p className="text-2xl font-bold text-purple-600 mt-1">{stats.used}</p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <i className="fas fa-receipt text-purple-600 text-xl"></i>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">已撤回</p>
              <p className="text-2xl font-bold text-red-600 mt-1">{stats.revoked}</p>
            </div>
            <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
              <i className="fas fa-ban text-red-600 text-xl"></i>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">已过期</p>
              <p className="text-2xl font-bold text-gray-500 mt-1">{stats.expired}</p>
            </div>
            <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
              <i className="fas fa-clock text-gray-500 text-xl"></i>
            </div>
          </div>
        </div>
      </div>

      {/* 发放优惠券表单 */}
      <div className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-lg shadow-sm border border-indigo-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <i className="fas fa-gift text-indigo-600 text-lg"></i>
          <h3 className="text-lg font-semibold text-gray-900">发放优惠券</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">选择用户 *</label>
            <input 
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent" 
              placeholder="输入用户名搜索..." 
              value={q} 
              onChange={(e) => setQ(e.target.value)}
              onFocus={() => {
                if (q.length > 0 && suggests.length > 0) {
                  document.getElementById('suggest-dropdown').style.display = 'block';
                }
              }}
              onBlur={() => {
                setTimeout(() => {
                  const dropdown = document.getElementById('suggest-dropdown');
                  if (dropdown) dropdown.style.display = 'none';
                }, 200);
              }}
            />
            {q.length > 0 && suggests.length > 0 && (
              <div 
                id="suggest-dropdown"
                className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-xl max-h-48 overflow-y-auto"
              >
                {suggests.map(s => (
                  <div 
                    key={s.id} 
                    className="px-3 py-2 hover:bg-indigo-50 cursor-pointer border-b border-gray-100 last:border-b-0 transition-colors"
                    onClick={() => {
                      setSelected(s.id);
                      setQ(s.id + (s.name ? ` · ${s.name}` : ''));
                      document.getElementById('suggest-dropdown').style.display = 'none';
                    }}
                  >
                    <div className="text-sm font-medium text-gray-900">{s.id}</div>
                    {s.name && <div className="text-xs text-gray-500">{s.name}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">金额（元）*</label>
            <input 
              type="number" 
              step="0.01" 
              min="0.01" 
              value={amount} 
              onChange={(e) => setAmount(e.target.value)} 
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent" 
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">数量 *</label>
            <input 
              type="number" 
              min="1" 
              value={quantity} 
              onChange={(e) => setQuantity(parseInt(e.target.value)||1)} 
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent" 
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">过期时间</label>
            <input 
              type="datetime-local" 
              value={expiresAt} 
              onChange={(e) => setExpiresAt(e.target.value)} 
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent" 
            />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button 
            onClick={handleIssue} 
            disabled={issuing} 
            className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            {issuing ? (
              <><i className="fas fa-spinner fa-spin mr-2"></i>发放中...</>
            ) : (
              <><i className="fas fa-paper-plane mr-2"></i>发放优惠券</>
            )}
          </button>
          {selected && (
            <span className="text-sm text-gray-600">
              <i className="fas fa-user mr-1"></i>
              已选择：<span className="font-medium text-gray-900">{selected}</span>
            </span>
          )}
        </div>
      </div>

      {/* 优惠券列表 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        {/* 工具栏 */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-semibold text-gray-900">优惠券列表</h3>
              <button 
                onClick={loadList} 
                className="text-sm px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg border border-gray-300 transition-colors"
              >
                <i className="fas fa-sync-alt mr-1"></i>刷新
              </button>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              {/* 搜索框 */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="搜索用户名或昵称..."
                  value={searchUser}
                  onChange={(e) => setSearchUser(e.target.value)}
                  className="pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                />
                <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
              </div>
              {/* 状态筛选 */}
              <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-1 border border-gray-200">
                <button
                  onClick={() => setStatusFilter('all')}
                  className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                    statusFilter === 'all' 
                      ? 'bg-white text-indigo-600 shadow-sm' 
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  全部
                </button>
                <button
                  onClick={() => setStatusFilter('active')}
                  className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                    statusFilter === 'active' 
                      ? 'bg-white text-green-600 shadow-sm' 
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  可用
                </button>
                <button
                  onClick={() => setStatusFilter('used')}
                  className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                    statusFilter === 'used' 
                      ? 'bg-white text-purple-600 shadow-sm' 
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  已使用
                </button>
                <button
                  onClick={() => setStatusFilter('revoked')}
                  className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                    statusFilter === 'revoked' 
                      ? 'bg-white text-red-600 shadow-sm' 
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  已撤回
                </button>
                <button
                  onClick={() => setStatusFilter('expired')}
                  className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                    statusFilter === 'expired' 
                      ? 'bg-white text-gray-600 shadow-sm' 
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  已过期
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 列表内容 */}
        <div className="p-4">
          {loading ? (
            <div className="text-center py-12">
              <i className="fas fa-spinner fa-spin text-3xl text-gray-400 mb-3"></i>
              <p className="text-sm text-gray-500">加载中...</p>
            </div>
          ) : filteredList.length === 0 ? (
            <div className="text-center py-12">
              <i className="fas fa-inbox text-4xl text-gray-300 mb-3"></i>
              <p className="text-gray-500">暂无数据</p>
              {(statusFilter !== 'all' || searchUser) && (
                <button 
                  onClick={() => { setStatusFilter('all'); setSearchUser(''); }}
                  className="mt-3 text-sm text-indigo-600 hover:text-indigo-700"
                >
                  清除筛选条件
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {(() => {
                const groupedByStudent = {};
                filteredList.forEach(c => {
                  if (!groupedByStudent[c.student_id]) {
                    groupedByStudent[c.student_id] = [];
                  }
                  groupedByStudent[c.student_id].push(c);
                });

                const studentIds = Object.keys(groupedByStudent).sort();
                
                return studentIds.map(studentId => {
                  const coupons = groupedByStudent[studentId];
                  const isExpanded = expandedStudents.has(studentId);
                  const activeCoupons = coupons.filter(c => c.status === 'active' && !c.expired);
                  const usedCoupons = coupons.filter(c => c.status === 'used');
                  const revokedCoupons = coupons.filter(c => c.status === 'revoked');
                  const expiredCoupons = coupons.filter(c => c.expired && c.status === 'active');
                  
                  return (
                    <div key={studentId} className="border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow">
                      {/* 用户卡片头部 */}
                      <div 
                        className="px-4 py-3 bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200 cursor-pointer hover:from-gray-100 hover:to-gray-150 transition-all"
                        onClick={() => toggleStudentExpanded(studentId)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                              <i className="fas fa-chevron-right text-gray-400"></i>
                            </div>
                            <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                              <i className="fas fa-user text-indigo-600"></i>
                            </div>
                            <div>
                              <div className="font-semibold text-gray-900">
                                {studentId}
                                {coupons[0]?.user_name && (
                                  <span className="text-gray-600 font-normal"> （{coupons[0].user_name}）</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                {activeCoupons.length > 0 && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                    <i className="fas fa-check-circle mr-1"></i>
                                    {activeCoupons.length} 可用
                                  </span>
                                )}
                                {usedCoupons.length > 0 && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                                    <i className="fas fa-receipt mr-1"></i>
                                    {usedCoupons.length} 已用
                                  </span>
                                )}
                                {revokedCoupons.length > 0 && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                                    <i className="fas fa-ban mr-1"></i>
                                    {revokedCoupons.length} 已撤回
                                  </span>
                                )}
                                {expiredCoupons.length > 0 && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                                    <i className="fas fa-clock mr-1"></i>
                                    {expiredCoupons.length} 已过期
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <span className="text-sm text-gray-500">
                            共 {coupons.length} 张
                          </span>
                        </div>
                      </div>
                      
                      {/* 优惠券详情表格 */}
                      {isExpanded && (
                        <div className="bg-white">
                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">金额</th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">创建时间</th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">过期时间</th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-gray-200">
                                {coupons.map(c => {
                                  const amt = parseFloat(c.amount) || 0;
                                  const expired = !!c.expired;
                                  let statusText, statusBadge;
                                  
                                  if (c.status === 'used') {
                                    statusText = '已使用';
                                    statusBadge = 'bg-purple-100 text-purple-700';
                                  } else if (c.status === 'revoked') {
                                    statusText = '已撤回';
                                    statusBadge = 'bg-red-100 text-red-700';
                                  } else if (expired) {
                                    statusText = '已过期';
                                    statusBadge = 'bg-gray-100 text-gray-600';
                                  } else {
                                    statusText = '可用';
                                    statusBadge = 'bg-green-100 text-green-700';
                                  }
                                  
                                  return (
                                    <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                                      <td className="px-4 py-3 whitespace-nowrap">
                                        <span className="text-lg font-bold text-gray-900">¥{amt.toFixed(2)}</span>
                                      </td>
                                      <td className="px-4 py-3 whitespace-nowrap">
                                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusBadge}`}>
                                          {statusText}
                                        </span>
                                      </td>
                                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                                        {c.created_at ? new Date(c.created_at).toLocaleString('zh-CN', { 
                                          year: 'numeric', month: '2-digit', day: '2-digit',
                                          hour: '2-digit', minute: '2-digit'
                                        }) : '—'}
                                      </td>
                                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                                        {c.expires_at ? new Date(c.expires_at).toLocaleString('zh-CN', { 
                                          year: 'numeric', month: '2-digit', day: '2-digit',
                                          hour: '2-digit', minute: '2-digit'
                                        }) : '永久'}
                                      </td>
                                      <td className="px-4 py-3 whitespace-nowrap">
                                        {c.status === 'active' && !expired ? (
                                          <button 
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleRevoke(c.id);
                                            }} 
                                            className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 transition-colors shadow-sm"
                                          >
                                            <i className="fas fa-ban mr-1"></i>
                                            撤回
                                          </button>
                                        ) : c.status === 'revoked' ? (
                                          <button 
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleDelete(c.id);
                                            }} 
                                            className="px-3 py-1.5 bg-gray-600 text-white rounded-lg text-xs font-medium hover:bg-gray-700 transition-colors shadow-sm"
                                          >
                                            <i className="fas fa-trash mr-1"></i>
                                            删除
                                          </button>
                                        ) : (
                                          <span className="text-gray-400 text-xs">—</span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// 收款码管理面板
const PaymentQrPanel = ({ staffPrefix }) => {
  const { apiRequest } = useApi();
  const [paymentQrs, setPaymentQrs] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [form, setForm] = React.useState({ name: '', file: null });
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const [editingQrId, setEditingQrId] = React.useState(null);
  const [editingName, setEditingName] = React.useState('');

  const loadPaymentQrs = async () => {
    setLoading(true);
    try {
      const response = await apiRequest(`${staffPrefix}/payment-qrs`);
      setPaymentQrs(response?.data?.payment_qrs || []);
    } catch (e) {
      console.error('加载收款码失败:', e);
      setPaymentQrs([]);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    loadPaymentQrs();
  }, []);

  const handleCreate = async () => {
    if (!form.name.trim()) {
      setError('请输入收款码名称');
      return;
    }
    if (!form.file) {
      setError('请选择收款码图片');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('name', form.name.trim());
      formData.append('file', form.file);

      await apiRequest(`${staffPrefix}/payment-qrs`, {
        method: 'POST',
        body: formData,
      });

      setForm({ name: '', file: null });
      setModalOpen(false);
      loadPaymentQrs();
    } catch (e) {
      setError(e.message || '创建收款码失败');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateStatus = async (qrId, isEnabled) => {
    try {
      await apiRequest(`${staffPrefix}/payment-qrs/${qrId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_enabled: isEnabled }),
      });
      loadPaymentQrs();
    } catch (e) {
      alert(e.message || '更新状态失败');
    }
  };

  const handleDelete = async (qrId, qrName) => {
    if (!confirm(`确定要删除收款码"${qrName}"吗？`)) {
      return;
    }
    try {
      await apiRequest(`${staffPrefix}/payment-qrs/${qrId}`, {
        method: 'DELETE',
      });
      loadPaymentQrs();
    } catch (e) {
      alert(e.message || '删除收款码失败');
    }
  };

  const handleStartEdit = (qrId, currentName) => {
    setEditingQrId(qrId);
    setEditingName(currentName);
  };

  const handleSaveEdit = async (qrId) => {
    if (!editingName.trim()) {
      alert('收款码名称不能为空');
      return;
    }
    
    try {
      await apiRequest(`${staffPrefix}/payment-qrs/${qrId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingName.trim() }),
      });
      setEditingQrId(null);
      setEditingName('');
      loadPaymentQrs();
    } catch (e) {
      alert(e.message || '更新收款码名称失败');
    }
  };

  const handleCancelEdit = () => {
    setEditingQrId(null);
    setEditingName('');
  };

  const enabledCount = paymentQrs.filter(qr => qr.is_enabled).length;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-medium text-gray-900">收款码管理</h2>
        <p className="text-sm text-gray-600 mt-1">管理您的收款码，支持多个收款码并可选择启用状态</p>
      </div>

      <div className="mb-4">
        <button
          onClick={() => setModalOpen(true)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700"
        >
          添加收款码
        </button>
      </div>

      {loading ? (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          <p className="mt-2 text-gray-600">加载中...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {paymentQrs.map((qr) => (
            <div key={qr.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
              <div className="mb-3">
                <img
                  src={qr.image_path}
                  alt={qr.name}
                  className="w-full h-48 object-contain bg-gray-50 rounded border"
                />
              </div>
              
              <div className="mb-3">
                {editingQrId === qr.id ? (
                  <input
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={() => handleSaveEdit(qr.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSaveEdit(qr.id);
                      } else if (e.key === 'Escape') {
                        handleCancelEdit();
                      }
                    }}
                    className="font-medium text-gray-900 w-full px-2 py-1 border border-indigo-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    autoFocus
                  />
                ) : (
                  <h3 
                    className="font-medium text-gray-900 cursor-pointer hover:text-indigo-600 transition-colors"
                    onClick={() => handleStartEdit(qr.id, qr.name)}
                    title="点击编辑名称"
                  >
                    {qr.name}
                  </h3>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  创建时间: {new Date(qr.created_at).toLocaleDateString()}
                </p>
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={qr.is_enabled === 1}
                    onChange={(e) => handleUpdateStatus(qr.id, e.target.checked)}
                    disabled={qr.is_enabled === 1 && enabledCount === 1}
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                  />
                  <span className="ml-2 text-sm text-gray-700">启用</span>
                </label>
                
                <button
                  onClick={() => handleDelete(qr.id, qr.name)}
                  className="text-red-600 hover:text-red-800 text-sm"
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {paymentQrs.length === 0 && !loading && (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <i className="fas fa-qrcode text-4xl text-gray-400 mb-4"></i>
          <p className="text-gray-600 mb-4">还没有收款码</p>
          <button
            onClick={() => setModalOpen(true)}
            className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700"
          >
            添加第一个收款码
          </button>
        </div>
      )}

      {/* 添加收款码弹窗 */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">添加收款码</h3>
              <button
                onClick={() => {
                  setModalOpen(false);
                  setForm({ name: '', file: null });
                  setError('');
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  收款码名称
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="例如：微信收款码、支付宝收款码"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  收款码图片
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setForm(prev => ({ ...prev, file: e.target.files[0] }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  支持 JPG、PNG、GIF、WebP 格式
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setModalOpen(false);
                  setForm({ name: '', file: null });
                  setError('');
                }}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleCreate}
                disabled={saving}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? '创建中...' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function StaffPortalPage({ role = 'admin', navActive = 'staff-backend', initialTab = 'products' }) {
  const router = useRouter();
  const { user, logout, isInitialized } = useAuth();
  const { apiRequest } = useApi();
  const expectedRole = role === 'agent' ? 'agent' : 'admin';
  const isAdmin = expectedRole === 'admin';
  const isAgent = expectedRole === 'agent';
  const staffPrefix = isAgent ? '/agent' : '/admin';
  const shopName = getShopName();
  const allowedTabs = isAdmin
    ? ['products', 'orders', 'addresses', 'agents', 'lottery', 'autoGifts', 'coupons', 'paymentQrs']
    : ['products', 'orders', 'lottery', 'autoGifts', 'coupons', 'paymentQrs'];
  const { toast, showToast, hideToast } = useToast();
  
  const [stats, setStats] = useState({
    total_products: 0,
    categories: 0,
    total_stock: 0,
    recent_products: []
  });
  const [products, setProducts] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  const [categories, setCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [selectedOrders, setSelectedOrders] = useState([]);
  const [productCategoryFilter, setProductCategoryFilter] = useState('全部');
  const [showOnlyOutOfStock, setShowOnlyOutOfStock] = useState(false);
  const [showOnlyInactive, setShowOnlyInactive] = useState(false);
  const [variantStockProduct, setVariantStockProduct] = useState(null);
  
  // 排序状态管理
  const [sortBy, setSortBy] = useState(null); // null表示默认排序，'category'|'price'|'stock'|'created_at'
  const [sortOrder, setSortOrder] = useState('asc'); // 'asc'|'desc'
  
  // 商城显示下架商品的开关状态
  const [showInactiveInShop, setShowInactiveInShop] = useState(false);
  const [isLoadingShopSetting, setIsLoadingShopSetting] = useState(false);
  
  // 操作状态管理 - 防止重复操作
  const [operatingProducts, setOperatingProducts] = useState(new Set());
  
  // 订单管理相关状态
  const [orders, setOrders] = useState([]);
  const [orderStats, setOrderStats] = useState({
    total_orders: 0,
    status_counts: {},
    today_orders: 0,
    total_revenue: 0
  });
  const [orderStatusFilter, setOrderStatusFilter] = useState('全部'); // 全部/未付款/待确认/待配送/配送中/已完成
  const [activeTab, setActiveTab] = useState(
    allowedTabs.includes(initialTab) ? initialTab : allowedTabs[0]
  ); // 可见标签
  // 订单分页/搜索
  const [orderPage, setOrderPage] = useState(0);
  const [orderHasMore, setOrderHasMore] = useState(false);
  const [orderTotal, setOrderTotal] = useState(0);
  const [orderSearch, setOrderSearch] = useState('');
  const loadOrdersRef = useRef(null);
  const previousOrderSearchRef = useRef(orderSearch);
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderExporting, setOrderExporting] = useState(false);
  const [orderAgentFilter, setOrderAgentFilter] = useState('self');
  const [orderAgentOptions, setOrderAgentOptions] = useState([]);

  // 地址管理相关状态
  const [addresses, setAddresses] = useState([]);
  const [addrLoading, setAddrLoading] = useState(false);
  const [addrSubmitting, setAddrSubmitting] = useState(false);
  const [newAddrName, setNewAddrName] = useState('');
  // 合并视图用：每个地址下的楼栋列表、输入与拖拽状态
  const [buildingsByAddress, setBuildingsByAddress] = useState({}); // { [addrId]: [] }
  const [newBldNameMap, setNewBldNameMap] = useState({}); // { [addrId]: string }
  const [bldDragState, setBldDragState] = useState({ id: null, addressId: null });
  const [addrDragId, setAddrDragId] = useState(null);
  const [addrDragging, setAddrDragging] = useState(false);

  // 代理管理相关状态
  const initialAgentForm = { account: '', password: '', name: '', building_ids: [], is_active: true };
  const [agents, setAgents] = useState([]);
  const [deletedAgents, setDeletedAgents] = useState([]);
  
  // 抽奖警告状态
  const [lotteryHasStockWarning, setLotteryHasStockWarning] = useState(false);
  // 满额门槛警告状态
  const [giftThresholdHasStockWarning, setGiftThresholdHasStockWarning] = useState(false);
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentModalOpen, setAgentModalOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState(null);
  const [agentForm, setAgentForm] = useState(initialAgentForm);
  const [agentSaving, setAgentSaving] = useState(false);
  const [agentError, setAgentError] = useState('');
  const [showDeletedAgentsModal, setShowDeletedAgentsModal] = useState(false);

  // 收款码管理相关状态
  const [paymentQrs, setPaymentQrs] = useState([]);
  const [paymentQrLoading, setPaymentQrLoading] = useState(false);
  const [paymentQrModalOpen, setPaymentQrModalOpen] = useState(false);
  const [paymentQrForm, setPaymentQrForm] = useState({ name: '', file: null });
  const [paymentQrSaving, setPaymentQrSaving] = useState(false);
  const [paymentQrError, setPaymentQrError] = useState('');

  const buildingLabelMap = useMemo(() => {
    const map = {};
    (addresses || []).forEach(addr => {
      const blds = buildingsByAddress[addr.id] || [];
      blds.forEach(b => {
        if (b?.id) {
          map[b.id] = `${addr.name || ''}${b.name ? ' · ' + b.name : ''}`.trim();
        }
      });
    });
    return map;
  }, [addresses, buildingsByAddress]);

  const orderAgentFilterLabel = useMemo(() => {
    if (!isAdmin) {
      return '我的订单';
    }
    const raw = (orderAgentFilter || 'self').toString();
    const lower = raw.toLowerCase();
    if (lower === 'all') {
      return '全部代理订单';
    }
    if (lower === 'self') {
      return `${user?.name || user?.id || '当前账号'} 的订单`;
    }
    const target = orderAgentOptions.find(agent => agent.id === orderAgentFilter);
    return `${target?.name || orderAgentFilter} 的订单`;
  }, [isAdmin, orderAgentFilter, orderAgentOptions, user]);

  const orderAgentNameMap = useMemo(() => {
    const map = {};
    orderAgentOptions.forEach(agent => {
      if (agent?.id) {
        map[agent.id] = agent.name || agent.id;
      }
    });
    return map;
  }, [orderAgentOptions]);

  // 楼栋管理状态（已合并到地址列表）

  // 检查管理员权限
  useEffect(() => {
    if (!isInitialized) return;
    if (!user) {
      router.replace('/login');
      return;
    }

    if (user.type !== expectedRole) {
      const fallback = user.type === 'admin'
        ? '/admin/dashboard'
        : user.type === 'agent'
          ? '/agent/dashboard'
          : '/';
      router.replace(fallback);
    }
  }, [isInitialized, user, expectedRole, router]);

  // 预加载抽奖警告状态
  useEffect(() => {
    const preloadLotteryWarning = async () => {
      if (!user || user.type !== expectedRole) return;
      
      try {
        const response = await apiRequest(`${staffPrefix}/lottery-config`);
        const list = response?.data?.prizes || [];
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
        
        // 检查是否有启用的奖项的所有商品都没有库存
        const hasWarning = prizesData.some(prize => {
          if (!prize.is_active) return false; // 只检查启用的奖项
          const itemList = Array.isArray(prize.items) ? prize.items : [];
          if (itemList.length === 0) return false; // 没有关联商品的奖项不算
          const hasAvailable = itemList.some(item => item && item.available);
          if (hasAvailable) return false;
          return true;
        });
        
        setLotteryHasStockWarning(hasWarning);
      } catch (error) {
        console.error('预加载抽奖警告检查失败:', error);
      }
    };

    if (user && user.type === expectedRole) {
      preloadLotteryWarning();
    }
  }, [user, expectedRole, staffPrefix, apiRequest]);

  // 预加载满额门槛警告状态
  useEffect(() => {
    const preloadGiftThresholdWarning = async () => {
      if (!user || user.type !== expectedRole) return;
      
      try {
        const response = await apiRequest(`${staffPrefix}/gift-thresholds?include_inactive=true`);
        const thresholdsData = response?.data?.thresholds || [];
        
        // 检查是否有启用的门槛的所有赠品都不可用
        const hasWarning = thresholdsData.some(threshold => {
          if (!threshold.is_active) return false; // 只检查启用的门槛
          if (!threshold.gift_products) return false; // 只检查赠送商品的门槛
          const itemList = Array.isArray(threshold.items) ? threshold.items : [];
          if (itemList.length === 0) return false; // 没有关联商品的门槛不算
          const hasAvailable = itemList.some(item => item && item.available);
          if (hasAvailable) return false; // 仍有可用的赠品则不警告
          return true; // 所有关联商品都不可用（下架或无库存）
        });
        
        setGiftThresholdHasStockWarning(hasWarning);
      } catch (error) {
        console.error('预加载满额门槛警告检查失败:', error);
      }
    };

    if (user && user.type === expectedRole) {
      preloadGiftThresholdWarning();
    }
  }, [user, expectedRole, staffPrefix, apiRequest]);

  // 加载统计数据和商品列表
  const loadData = async (agentFilterValue = orderAgentFilter, shouldReloadOrders = true, forceRefresh = false) => {
    if (!user || user.type !== expectedRole) {
      return;
    }
    setIsLoading(true);
    setError('');

    // 如果是强制刷新，先清空相关状态
    if (forceRefresh) {
      setProducts([]);
      setStats({});
      setCategories([]);
    }

    try {
      const normalizedFilter = isAdmin ? (agentFilterValue || 'self').toString() : null;
      const buildQueryString = (key, value) => {
        const params = new URLSearchParams();
        params.set(key, value);
        // 如果是强制刷新，添加时间戳参数防止缓存
        if (forceRefresh) {
          params.set('_t', Date.now().toString());
        }
        const qs = params.toString();
        return qs ? `?${qs}` : '';
      };
      const ownerQuery = isAdmin ? buildQueryString('owner_id', normalizedFilter || 'self') : '';
      const agentQuery = isAdmin ? buildQueryString('agent_id', normalizedFilter || 'self') : '';

      const statsPromise = apiRequest(`/admin/stats${ownerQuery}`);
      // 注册人数统计：始终使用订单范围（agent_id）来统计，因为注册人数是基于用户的地址/楼栋分配
      const usersCountPromise = apiRequest(`/admin/users/count${agentQuery}`);
      const productsPromise = apiRequest(`${staffPrefix}/products${ownerQuery}`);
      const categoriesPromise = isAdmin
        ? apiRequest(`/admin/categories${ownerQuery}`)
        : Promise.resolve({ data: { categories: [] } });
      const orderStatsPromise = apiRequest(`/admin/order-stats${agentQuery}`);
      const addressesPromise = isAdmin
        ? apiRequest('/admin/addresses')
        : Promise.resolve({ data: { addresses: [] } });
      const shopSettingsPromise = isAdmin 
        ? apiRequest('/admin/shop-settings')
        : Promise.resolve({ data: {} });

      const [statsData, usersCountData, productsData, categoriesData, orderStatsData, addressesData, shopSettingsData] = await Promise.all([
        statsPromise,
        usersCountPromise,
        productsPromise,
        categoriesPromise,
        orderStatsPromise,
        addressesPromise,
        shopSettingsPromise
      ]);
      
      const mergedStats = { ...(statsData.data || {}), users_count: (usersCountData?.data?.count ?? 0) };
      setStats(mergedStats);
      const productPayload = productsData.data || {};
      const normalizedProducts = (productPayload.products || []).map((product) => ({
        ...product,
        is_active: normalizeBooleanFlag(product.is_active, true),
        is_hot: normalizeBooleanFlag(product.is_hot, false),
        is_not_for_sale: normalizeBooleanFlag(product.is_not_for_sale, false),
        reservation_required: normalizeBooleanFlag(product.reservation_required, false)
      }));
      setProducts(normalizedProducts);
      // 管理端分类按拼音/英文排序（A-Z > 0-9 > 中文 > 其他）
      const rawCategories = isAdmin
        ? (categoriesData.data.categories || [])
        : (productPayload.categories || []).map((name) => ({ id: name, name }));
      const adminCats = rawCategories.slice();
      const letters2 = Array.from({ length: 26 }, (_, i) => String.fromCharCode(97 + i));
      const firstSigChar2 = (s) => {
        const str = String(s || '');
        for (let i = 0; i < str.length; i++) {
          const ch = str[i];
          if (/[A-Za-z\u4e00-\u9fff]/.test(ch)) return ch;
        }
        return '';
      };
      const typeRank2 = (s) => {
        const ch = firstSigChar2(s);
        if (!ch) return 2;
        return /[A-Za-z]/.test(ch) ? 0 : 1;
      };
      const bucket2 = (s, collator) => {
        const name = String(s || '');
        if (!/[A-Za-z\u4e00-\u9fff]/.test(name)) return 26;
        let b = 25;
        for (let i = 0; i < 26; i++) {
          const cur = letters2[i];
          const next = i < 25 ? letters2[i + 1] : null;
          if (collator.compare(name, cur) < 0) { b = 0; break; }
          if (!next || (collator.compare(name, cur) >= 0 && collator.compare(name, next) < 0)) { b = i; break; }
        }
        return b;
      };
      try {
        const collator = new Intl.Collator(
          ['zh-Hans-u-co-pinyin', 'zh-Hans', 'zh', 'en', 'en-US'],
          { sensitivity: 'base', numeric: true }
        );
        adminCats.sort((a, b) => {
          const aName = String(a.name || '');
          const bName = String(b.name || '');
          const ab = bucket2(aName, collator);
          const bb = bucket2(bName, collator);
          if (ab !== bb) return ab - bb;
          const ar = typeRank2(aName);
          const br = typeRank2(bName);
          if (ar !== br) return ar - br;
          return collator.compare(aName, bName);
        });
      } catch (e) {
        adminCats.sort((a, b) => {
          const aName = String(a.name || '');
          const bName = String(b.name || '');
          const aCh = firstSigChar2(aName).toLowerCase();
          const bCh = firstSigChar2(bName).toLowerCase();
          const aIsEn = /^[a-z]$/.test(aCh);
          const bIsEn = /^[a-z]$/.test(bCh);
          const ab = aIsEn ? (aCh.charCodeAt(0) - 97) : 26;
          const bb = bIsEn ? (bCh.charCodeAt(0) - 97) : 26;
          if (ab !== bb) return ab - bb;
          const ar = aIsEn ? 0 : 1;
          const br = bIsEn ? 0 : 1;
          if (ar !== br) return ar - br;
          return aName.localeCompare(bName, 'en', { sensitivity: 'base', numeric: true });
        });
      }
      setCategories(adminCats);
      setOrderStats(orderStatsData.data || {
        total_orders: 0,
        status_counts: {},
        today_orders: 0,
        total_revenue: 0
      });
      setAddresses(addressesData.data.addresses || []);
      
      // 处理商城设置数据
      if (isAdmin && shopSettingsData.data) {
        const showInactive = normalizeBooleanFlag(shopSettingsData.data.show_inactive_in_shop, false);
        setShowInactiveInShop(showInactive);
      }
      
      setSelectedProducts([]); // 重新加载数据时清空选择
      // 初始加载订单第一页（分页，默认每页20）
      if (shouldReloadOrders) {
        await loadOrders(0, orderSearch, agentFilterValue);
      }
    } catch (err) {
      setError(err.message || '加载数据失败');
    } finally {
      setIsLoading(false);
    }
  };

  // 更新商城显示下架商品设置
  const updateShopInactiveSetting = async (showInactive) => {
    if (!isAdmin || isLoadingShopSetting) return;
    
    setIsLoadingShopSetting(true);
    try {
      const response = await apiRequest('/admin/shop-settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          show_inactive_in_shop: showInactive
        })
      });
      
      if (response.success) {
        setShowInactiveInShop(showInactive);
      } else {
        throw new Error(response.message || '更新设置失败');
      }
    } catch (err) {
      console.error('更新商城设置失败:', err);
      alert('更新设置失败: ' + err.message);
    } finally {
      setIsLoadingShopSetting(false);
    }
  };

  const buildOrdersQueryParams = ({
    limit = 20,
    offset = 0,
    search = '',
    agentFilterValue = orderAgentFilter
  } = {}) => {
    const params = new URLSearchParams();
    const normalizedLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const normalizedOffset = Math.max(0, parseInt(offset, 10) || 0);
    params.set('limit', String(normalizedLimit));
    params.set('offset', String(normalizedOffset));

    const q = String(search || '').trim();
    if (q) {
      params.set('keyword', q);
    }

    if (isAdmin) {
      const rawFilter = (agentFilterValue ?? '').toString().trim();
      const lowerFilter = rawFilter.toLowerCase();
      if (!rawFilter || lowerFilter === 'self') {
        params.set('agent_id', 'self');
      } else if (lowerFilter === 'all') {
        params.set('agent_id', 'all');
      } else {
        params.set('agent_id', rawFilter);
      }
    }

    return `${staffPrefix}/orders?${params.toString()}`;
  };

  const buildOrdersQuery = (page = 0, search = '', agentFilterValue = orderAgentFilter) => {
    const limit = 20;
    const p = parseInt(page, 10) || 0;
    const offset = p * limit;
    return buildOrdersQueryParams({ limit, offset, search, agentFilterValue });
  };

  const loadOrders = async (page = orderPage, search = orderSearch, agentFilterValue = orderAgentFilter) => {
    setOrderLoading(true);
    try {
      const url = buildOrdersQuery(page, search, agentFilterValue);
      const res = await apiRequest(url);
      const data = res?.data || {};
      setOrders(data.orders || []);
      setOrderHasMore(!!data.has_more);
      setOrderTotal(parseInt(data.total || 0, 10) || 0);
      setOrderPage(parseInt(page) || 0);
      if (data.stats) {
        setOrderStats(data.stats);
      }
      if (typeof data.selected_agent_filter === 'string') {
        const normalizedFilter = data.selected_agent_filter || 'self';
        if (normalizedFilter !== orderAgentFilter) {
          setOrderAgentFilter(normalizedFilter);
        }
      }
    } catch (e) {
      alert(e.message || '加载订单失败');
    } finally {
      setOrderLoading(false);
    }
  };
  loadOrdersRef.current = loadOrders;

  useEffect(() => {
    if (previousOrderSearchRef.current === orderSearch) {
      previousOrderSearchRef.current = orderSearch;
      return;
    }
    previousOrderSearchRef.current = orderSearch;
    loadOrdersRef.current?.(0, orderSearch, orderAgentFilter);
  }, [orderSearch, orderAgentFilter]);

  // 刷新/搜索/翻页（订单）
  const handleOrderRefresh = async () => {
    await loadOrders(orderPage, orderSearch, orderAgentFilter);
  };

  const handleExportOrders = async () => {
    if (orderExporting) return;
    setOrderExporting(true);
    try {
      const limit = 200;
      const allOrders = [];
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const url = buildOrdersQueryParams({
          limit,
          offset,
          search: orderSearch,
          agentFilterValue: orderAgentFilter
        });
        const res = await apiRequest(url);
        const data = res?.data || {};
        const batch = Array.isArray(data.orders) ? data.orders : [];
        allOrders.push(...batch);

        hasMore = !!data.has_more && batch.length > 0;
        if (hasMore) {
          offset += limit;
        }
      }

      const scopedOrders = orderStatusFilter === '全部'
        ? allOrders
        : allOrders.filter((order) => getUnifiedStatus(order) === orderStatusFilter);

      if (scopedOrders.length === 0) {
        alert('当前筛选条件下没有可导出的订单');
        return;
      }

      const xlsxModule = await import('xlsx');
      const XLSXLib = xlsxModule?.default?.utils ? xlsxModule.default : xlsxModule;
      if (!XLSXLib?.utils) {
        throw new Error('未能加载 Excel 导出依赖，请稍后重试');
      }

      const header = [
        '订单号',
        '归属',
        '用户名',
        '电话',
        '地址',
        '详细地址',
        '订单金额',
        '订单信息',
        '订单状态',
        '创建时间'
      ];

      const formatDateStamp = (dateObj) => {
        if (!(dateObj instanceof Date) || Number.isNaN(dateObj.valueOf())) return null;
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        return `${year}${month}${day}`;
      };

      const normalizeOrderDate = (order) => {
        if (Number.isFinite(order?.created_at_timestamp)) {
          return new Date(order.created_at_timestamp * 1000);
        }
        if (order?.created_at) {
          const parsed = new Date(order.created_at);
          if (!Number.isNaN(parsed.valueOf())) {
            return parsed;
          }
        }
        return null;
      };

      let earliestDate = null;

      const rows = scopedOrders.map((order) => {
        const shipping = order?.shipping_info && typeof order.shipping_info === 'object'
          ? order.shipping_info
          : {};
        const ownerLabel = isAdmin
          ? (orderAgentNameMap?.[order.agent_id] || order.agent_id || '未分配')
          : (order.agent_id || user?.name || user?.id || '我的订单');
        const addressParts = [shipping.dormitory, shipping.building].filter(Boolean);
        const baseAddress = addressParts.join(' ') || shipping.full_address || '';
        const detailSegments = [
          shipping.room,
          shipping.address_detail,
          shipping.detail,
          shipping.extra
        ].filter(Boolean);
        const detailAddress = detailSegments.join(' ') || '';
        const totalValue = Number(order?.total_amount);
        const totalText = Number.isFinite(totalValue)
          ? totalValue.toFixed(2)
          : String(order?.total_amount ?? '');
        const items = Array.isArray(order?.items) ? order.items : [];
        const itemSummary = items.map((item) => {
          if (!item) return '';
          const markers = [];
          if (item.is_auto_gift) markers.push('赠品');
          if (item.is_lottery) markers.push('抽奖');
          const markerText = markers.length > 0 ? `[${markers.join('+')}]` : '';
          const baseName = item.name || item.product_name || item.title || '未命名商品';
          const variant = item.variant_name ? `(${item.variant_name})` : '';
          const quantity = Number(item.quantity);
          const quantityText = Number.isFinite(quantity) ? `x${quantity}` : '';
          return [markerText, `${baseName}${variant}`.trim(), quantityText]
            .filter(Boolean)
            .join(' ');
        }).filter(Boolean).join('\n');

        const createdAtDate = normalizeOrderDate(order);
        if (createdAtDate && (!earliestDate || createdAtDate < earliestDate)) {
          earliestDate = createdAtDate;
        }
        const createdAtText = createdAtDate
          ? createdAtDate.toLocaleString('zh-CN', { hour12: false })
          : '';

        return [
          order?.id || '',
          ownerLabel,
          order?.student_id || order?.user_id || '',
          shipping.phone || '',
          baseAddress,
          detailAddress,
          totalText,
          itemSummary,
          getUnifiedStatus(order),
          createdAtText
        ].map((cell) => (cell == null ? '' : String(cell)));
      });

      const worksheetData = [header, ...rows];
      const workbook = XLSXLib.utils.book_new();
      const worksheet = XLSXLib.utils.aoa_to_sheet(worksheetData);
      XLSXLib.utils.book_append_sheet(workbook, worksheet, '订单导出');

      const excelBuffer = XLSXLib.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([excelBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const url = URL.createObjectURL(blob);

      const todayStamp = formatDateStamp(new Date()) || '今日';
      const earliestStamp = formatDateStamp(earliestDate || new Date()) || todayStamp;
      const link = document.createElement('a');
      link.href = url;
      link.download = `订单导出_${todayStamp}T${earliestStamp}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('导出订单失败:', error);
      alert(error?.message || '导出订单失败，请稍后重试');
    } finally {
      setOrderExporting(false);
    }
  };

  const handlePrevPage = async () => {
    const next = Math.max(0, (orderPage || 0) - 1);
    await loadOrders(next, orderSearch, orderAgentFilter);
  };
  const handleNextPage = async () => {
    if (!orderHasMore) return;
    const next = (orderPage || 0) + 1;
    await loadOrders(next, orderSearch, orderAgentFilter);
  };

  const handleOrderAgentFilterChange = async (nextFilter) => {
    const normalized = (nextFilter || 'self').toString();
    setOrderAgentFilter(normalized);
    setOrderStatusFilter('全部');
    await Promise.all([
      loadOrders(0, orderSearch, normalized),
      loadData(normalized, false, false)
    ]);
  };

  useEffect(() => {
    if (!isAdmin) return;
    const normalized = (orderAgentFilter || 'self').toString().toLowerCase();
    if (normalized === 'self' || normalized === 'all') return;
    if (orderAgentOptions.some(option => option.id === orderAgentFilter)) return;
    if (orderAgentOptions.length === 0) return;
    void handleOrderAgentFilterChange('self');
  }, [isAdmin, orderAgentFilter, orderAgentOptions, handleOrderAgentFilterChange]);

  // 地址操作
  const loadAddresses = async () => {
    if (!isAdmin) {
      setAddresses([]);
      setBuildingsByAddress({});
      return;
    }
    setAddrLoading(true);
    try {
      const res = await apiRequest('/admin/addresses');
      const addrs = res.data.addresses || [];
      setAddresses(addrs);
      // 同时加载每个地址下的楼栋
      const entries = await Promise.all(
        addrs.map(async (a) => {
          try {
            const r = await apiRequest(`/admin/buildings?address_id=${encodeURIComponent(a.id)}`);
            return [a.id, r.data.buildings || []];
          } catch (e) {
            return [a.id, []];
          }
        })
      );
      const map = {};
      entries.forEach(([id, list]) => { map[id] = list; });
      setBuildingsByAddress(map);
    } catch (e) {
      alert(e.message || '获取地址失败');
    } finally {
      setAddrLoading(false);
    }
  };

  const loadAgents = async () => {
    if (!isAdmin) {
      setAgents([]);
      setDeletedAgents([]);
      setOrderAgentOptions([]);
      return;
    }
    setAgentLoading(true);
    setAgentError('');
    try {
      const res = await apiRequest('/admin/agents?include_inactive=1');
      const list = (res.data?.agents || []).filter(item => item && !item.is_deleted);
      const deletedList = (res.data?.deleted_agents || []).filter(item => item && item.id);
      setAgents(list);
      setDeletedAgents(deletedList);
      const normalizedActive = list
        .filter(item => item && item.id)
        .map(item => ({
          id: item.id,
          name: item.name || item.id,
          isActive: item.is_active !== false,
          isDeleted: false
        }));
      const normalizedDeleted = deletedList.map(item => ({
        id: item.id,
        name: `${item.name || item.id}（已删除）`,
        isActive: false,
        isDeleted: true
      }));
      setOrderAgentOptions([...normalizedActive, ...normalizedDeleted]);
    } catch (e) {
      setAgents([]);
      setDeletedAgents([]);
      setAgentError(e.message || '获取代理列表失败');
      setOrderAgentOptions([]);
    } finally {
      setAgentLoading(false);
    }
  };

  const openAgentModal = (agent = null) => {
    if (agent) {
      setEditingAgent(agent);
      setAgentForm({
        account: agent.id,
        password: '',
        name: agent.name || agent.id,
        building_ids: (agent.buildings || []).map(b => b.building_id).filter(Boolean),
        is_active: agent.is_active !== false,
      });
    } else {
      setEditingAgent(null);
      setAgentForm(initialAgentForm);
    }
    setAgentError('');
    setAgentModalOpen(true);
  };

  const closeAgentModal = () => {
    setAgentModalOpen(false);
    setEditingAgent(null);
    setAgentForm(initialAgentForm);
    setAgentError('');
  };

  const toggleAgentBuilding = (buildingId) => {
    setAgentForm(prev => {
      const current = prev.building_ids || [];
      const next = current.includes(buildingId)
        ? current.filter(id => id !== buildingId)
        : [...current, buildingId];
      return { ...prev, building_ids: next };
    });
  };

  const handleAgentSave = async () => {
    try {
      const payload = agentForm;
      if (!payload.account.trim()) {
        setAgentError('请输入代理账号');
        return;
      }
      if (!editingAgent && !payload.password) {
        setAgentError('请设置代理初始密码');
        return;
      }
      // 验证密码长度：如果填写了密码，必须至少3位
      if (payload.password && payload.password.length < 3) {
        setAgentError('密码至少需要3位');
        return;
      }
      if (!payload.building_ids || payload.building_ids.length === 0) {
        setAgentError('请至少选择一个负责楼栋');
        return;
      }

      setAgentSaving(true);
      if (editingAgent) {
        const body = {
          name: payload.name,
          building_ids: payload.building_ids,
          is_active: payload.is_active,
        };
        if (payload.password) {
          body.password = payload.password;
        }
        await apiRequest(`/admin/agents/${editingAgent.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
      } else {
        await apiRequest('/admin/agents', {
          method: 'POST',
          body: JSON.stringify({
            account: payload.account.trim(),
            password: payload.password,
            name: payload.name || payload.account.trim(),
            building_ids: payload.building_ids,
          })
        });
      }
      closeAgentModal();
      await loadAgents();
    } catch (e) {
      setAgentError(e.message || '保存代理失败');
    } finally {
      setAgentSaving(false);
    }
  };

  const handleAgentStatusToggle = async (agent, nextActive) => {
    try {
      await apiRequest(`/admin/agents/${agent.id}`, {
        method: 'PUT',
        body: JSON.stringify({ is_active: nextActive ? 1 : 0 })
      });
      await loadAgents();
    } catch (e) {
      alert(e.message || '更新代理状态失败');
    }
  };

  const handleAgentDelete = async (agent) => {
    if (!confirm(`确定停用代理“${agent.name || agent.id}”吗？`)) return;
    try {
      await apiRequest(`/admin/agents/${agent.id}`, { method: 'DELETE' });
      await loadAgents();
    } catch (e) {
      alert(e.message || '停用代理失败');
    }
  };

  const handleAgentQrUpload = async (agent) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (event) => {
      const file = event.target?.files?.[0];
      if (!file) return;
      const form = new FormData();
      form.append('file', file);
      try {
        setAgentSaving(true);
        await apiRequest(`/admin/agents/${agent.id}/payment-qr`, {
          method: 'POST',
          body: form,
        });
        await loadAgents();
      } catch (e) {
        alert(e.message || '上传收款码失败');
      } finally {
        setAgentSaving(false);
      }
    };
    input.click();
  };

  // 地址拖拽排序
  const onAddressDragStart = (id) => {
    setAddrDragId(id);
    setAddrDragging(true);
  };
  const onAddressDragOver = (e, overId) => {
    e.preventDefault();
    if (!addrDragging || addrDragId === overId) return;
    setAddresses((prev) => {
      const from = prev.findIndex(a => a.id === addrDragId);
      const to = prev.findIndex(a => a.id === overId);
      if (from === -1 || to === -1) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };
  const onAddressDragEnd = async () => {
    if (!addrDragging) return;
    setAddrDragging(false);
    setAddrDragId(null);
    try {
      const order = addresses.map(a => a.id);
      await apiRequest('/admin/addresses/reorder', {
        method: 'POST',
        body: JSON.stringify({ order })
      });
    } catch (e) {
      alert(e.message || '保存地址排序失败');
      await loadAddresses();
    }
  };

  const handleAddAddress = async () => {
    const name = newAddrName.trim();
    if (!name) { alert('请输入地址名称'); return; }
    setAddrSubmitting(true);
    try {
      const payload = { name, enabled: true, sort_order: 0 };
      const res = await apiRequest('/admin/addresses', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      setNewAddrName('');
      await loadAddresses();
      alert('地址添加成功！');
    } catch (e) {
      alert(e.message || '添加地址失败');
    } finally {
      setAddrSubmitting(false);
    }
  };

  const handleUpdateAddress = async (addr, changes) => {
    setAddrSubmitting(true);
    try {
      await apiRequest(`/admin/addresses/${addr.id}`, {
        method: 'PUT',
        body: JSON.stringify(changes)
      });
      await loadAddresses();
    } catch (e) {
      alert(e.message || '更新地址失败');
    } finally {
      setAddrSubmitting(false);
    }
  };

  const handleDeleteAddress = async (addr) => {
    if (!confirm(`确定删除地址"${addr.name}"吗？`)) return;
    setAddrSubmitting(true);
    try {
      await apiRequest(`/admin/addresses/${addr.id}`, { method: 'DELETE' });
      await loadAddresses();
      alert('删除成功');
    } catch (e) {
      alert(e.message || '删除地址失败');
    } finally {
      setAddrSubmitting(false);
    }
  };

  // 楼栋：新增（合并视图）
  const handleAddBuilding = async (addrId) => {
    const name = (newBldNameMap[addrId] || '').trim();
    if (!name) { alert('请输入楼栋名称'); return; }
    try {
      await apiRequest('/admin/buildings', {
        method: 'POST',
        body: JSON.stringify({ address_id: addrId, name, enabled: true, sort_order: 0 })
      });
      setNewBldNameMap(prev => ({ ...prev, [addrId]: '' }));
      // 重新拉取该地址的楼栋列表
      const res = await apiRequest(`/admin/buildings?address_id=${encodeURIComponent(addrId)}`);
      setBuildingsByAddress(prev => ({ ...prev, [addrId]: res.data.buildings || [] }));
    } catch (e) {
      alert(e.message || '添加楼栋失败');
    }
  };

  // 旧楼栋管理逻辑已合并至地址列表中

  // 添加商品
  const handleAddProduct = async (productData) => {
    setIsSubmitting(true);
    
    try {
      const formData = new FormData();
      formData.append('name', productData.name);
      formData.append('category', productData.category);
      formData.append('price', productData.price);
      formData.append('stock', productData.stock);
      formData.append('description', productData.description);
      formData.append('cost', productData.cost || '0');
      formData.append('is_hot', productData.is_hot ? 'true' : 'false');
      formData.append('is_not_for_sale', productData.is_not_for_sale ? 'true' : 'false');
      formData.append('reservation_required', productData.reservation_required ? 'true' : 'false');
      formData.append('reservation_cutoff', productData.reservation_cutoff || '');
      formData.append('reservation_note', productData.reservation_note || '');
      
      if (productData.image) {
        formData.append('image', productData.image);
      }
      
      // 添加discount数据
      if (productData.discount !== undefined && productData.discount !== null) {
        formData.append('discount', productData.discount);
      }
      
      // 添加variants数据
      if (productData.variants && productData.variants.length > 0) {
        formData.append('variants', JSON.stringify(productData.variants));
      }
      
      const response = await apiRequest(`${staffPrefix}/products`, {
        method: 'POST',
        body: formData,
        headers: {} // 让浏览器自动设置Content-Type
      });
      
      // 如果服务器返回了新创建的商品数据，直接添加到列表中
      if (response && response.product) {
        const raw = response.product;
        const normalizedNewProduct = {
          ...raw,
          is_active: normalizeBooleanFlag(raw.is_active, true),
          is_hot: normalizeBooleanFlag(raw.is_hot, false),
          is_not_for_sale: normalizeBooleanFlag(raw.is_not_for_sale, false),
          reservation_required: normalizeBooleanFlag(raw.reservation_required, false)
        };
        setProducts(prevProducts => [normalizedNewProduct, ...prevProducts]); // 将新商品添加到列表开头
        setShowAddModal(false);
        // 刷新统计数据
        await refreshStats();
      } else {
        // 如果服务器没有返回商品数据，则重新加载
        setShowAddModal(false);
        await loadData(); // 重新加载数据
      }
      
    } catch (err) {
      alert(err.message || '添加商品失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditProduct = async (productData) => {
    setIsSubmitting(true);
    
    try {
      const updateData = {
        name: productData.name,
        category: productData.category,
        price: productData.price,
        stock: productData.stock,
        description: productData.description,
        cost: productData.cost || 0,
        discount: productData.discount !== undefined && productData.discount !== null ? productData.discount : 10,
        is_hot: !!productData.is_hot,
        is_not_for_sale: !!productData.is_not_for_sale,
        reservation_required: !!productData.reservation_required,
        reservation_cutoff: productData.reservation_cutoff || '',
        reservation_note: productData.reservation_note || ''
      };
      
      // 检测是否有关键变更需要刷新整个商品列表
      const hasImageUpdate = !!productData.image;
      const hasStockStructureChange = productData.stock !== editingProduct.stock;
      const hasCategoryChange = productData.category !== editingProduct.category;
      const hasNameChange = productData.name !== editingProduct.name;
      const skipCloseModal = productData.skipCloseModal; // 是否跳过关闭弹窗（规格变更尚未应用）
      
      await apiRequest(`${staffPrefix}/products/${editingProduct.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData)
      });
      
      // 如果有图片更新，单独处理
      if (productData.image) {
        const formData = new FormData();
        formData.append('image', productData.image);
        await apiRequest(`${staffPrefix}/products/${editingProduct.id}/image`, {
          method: 'POST',
          body: formData,
          headers: {}
        });
      }
      
      // 如果不跳过关闭弹窗，则正常关闭
      if (!skipCloseModal) {
        setEditingProduct(null);
        setShowEditModal(false);
      }
      
      // 判断是否需要完整刷新：图片更新、库存结构变化、分类变化、名称变化等
      // 如果skipCloseModal为true，说明还有规格变更要应用，延迟到规格变更完成后再刷新
      const needsFullRefresh = hasImageUpdate || hasStockStructureChange || hasCategoryChange || hasNameChange;
      
      if (!skipCloseModal) {
        // 只在不跳过关闭弹窗时才刷新（规格变更会在完成后统一刷新）
        if (needsFullRefresh) {
          // 如果有关键变更，刷新整个商品列表以确保数据同步
          await loadData();
        } else {
          // 即使是简单更新，也需要重新获取该商品的完整数据（包括规格信息）
          // 以确保 has_variants 等字段是最新的
          try {
            const refreshedProduct = await apiRequest(`${staffPrefix}/products/${editingProduct.id}`);
            const latest = refreshedProduct?.data?.product || null;
            const normalizedLatest = latest ? {
              ...latest,
              is_active: normalizeBooleanFlag(latest.is_active, true),
              is_hot: normalizeBooleanFlag(latest.is_hot, false),
              is_not_for_sale: normalizeBooleanFlag(latest.is_not_for_sale, false),
              reservation_required: normalizeBooleanFlag(latest.reservation_required, false)
            } : null;
            const updatedProducts = products.map(p => {
              if (p.id === editingProduct.id) {
                return {
                  ...p,
                  ...updateData,
                  ...(normalizedLatest || {})
                };
              }
              return p;
            });
            setProducts(updatedProducts);
            // 刷新统计数据（无论是否有关键变更，都可能影响统计）
            await refreshStats();
          } catch (refreshErr) {
            // 如果重新获取失败，降级到完整刷新
            console.error('重新获取商品数据失败，执行完整刷新:', refreshErr);
            await loadData();
          }
        }
      }
      
    } catch (err) {
      alert(err.message || '更新商品失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 刷新单个商品数据（用于确保规格等信息是最新的）
  const refreshSingleProduct = async (productId) => {
    try {
      const refreshedProduct = await apiRequest(`${staffPrefix}/products/${productId}`);
      if (refreshedProduct.data?.product) {
        const latest = refreshedProduct.data.product;
        const normalizedLatest = {
          ...latest,
          is_active: normalizeBooleanFlag(latest.is_active, true),
          is_hot: normalizeBooleanFlag(latest.is_hot, false),
          is_not_for_sale: normalizeBooleanFlag(latest.is_not_for_sale, false),
          reservation_required: normalizeBooleanFlag(latest.reservation_required, false)
        };
        const updatedProducts = products.map(p => {
          if (p.id === productId) {
            return {
              ...p,
              ...normalizedLatest
            };
          }
          return p;
        });
        setProducts(updatedProducts);
      }
    } catch (err) {
      console.error('刷新商品数据失败:', err);
    }
  };

  // 刷新统计数据（不刷新商品列表）
  const refreshStats = async () => {
    try {
      const normalizedFilter = isAdmin ? (orderAgentFilter || 'self').toString() : null;
      const buildQueryString = (key, value) => {
        const params = new URLSearchParams();
        params.set(key, value);
        params.set('_t', Date.now().toString()); // 添加时间戳防止缓存
        return `?${params.toString()}`;
      };
      const ownerQuery = isAdmin ? buildQueryString('owner_id', normalizedFilter || 'self') : '';
      const agentQuery = isAdmin ? buildQueryString('agent_id', normalizedFilter || 'self') : '';

      // 并行获取所有统计数据
      const [statsData, usersCountData, orderStatsData] = await Promise.all([
        apiRequest(`/admin/stats${ownerQuery}`),
        apiRequest(`/admin/users/count${agentQuery}`),
        apiRequest(`/admin/order-stats${agentQuery}`)
      ]);
      
      // 更新统计数据
      const mergedStats = { ...(statsData.data || {}), users_count: (usersCountData?.data?.count ?? 0) };
      setStats(mergedStats);
      setOrderStats(orderStatsData.data || {
        total_orders: 0,
        status_counts: {},
        today_orders: 0,
        total_revenue: 0
      });
    } catch (err) {
      console.error('刷新统计数据失败:', err);
    }
  };

  // 设置商品折扣
  const handleUpdateDiscount = async (productId, zhe) => {
    // 防止重复操作
    if (operatingProducts.has(productId)) return;
    
    // 标记正在操作
    setOperatingProducts(prev => new Set(prev).add(productId));
    
    // 乐观更新：立即更新UI
    const updatedProducts = products.map(p => 
      p.id === productId ? { ...p, discount: zhe } : p
    );
    setProducts(updatedProducts);
    
    try {
      await apiRequest(`${staffPrefix}/products/${productId}`, {
        method: 'PUT',
        body: JSON.stringify({ discount: zhe })
      });
      // 成功后不需要重新加载，UI已经更新
    } catch (e) {
      // 失败时回滚UI状态
      const originalProduct = products.find(p => p.id === productId);
      const revertedProducts = products.map(p => 
        p.id === productId ? { ...p, discount: originalProduct?.discount || 10 } : p
      );
      setProducts(revertedProducts);
      alert(e.message || '更新折扣失败');
    } finally {
      // 清除操作状态
      setOperatingProducts(prev => {
        const newSet = new Set(prev);
        newSet.delete(productId);
        return newSet;
      });
    }
  };

  // 批量设置折扣
  const handleBatchUpdateDiscount = async (productIds, zhe) => {
    if (!productIds || productIds.length === 0) { alert('请选择要设置折扣的商品'); return; }
    
    // 乐观更新：立即更新UI
    const originalProducts = [...products];
    const updatedProducts = products.map(p => 
      productIds.includes(p.id) ? { ...p, discount: zhe } : p
    );
    setProducts(updatedProducts);
    
    try {
      await apiRequest(`${staffPrefix}/products`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_ids: productIds, discount: zhe })
      });
      // 成功后不需要重新加载，UI已经更新
    } catch (e) {
      // 失败时回滚UI状态
      setProducts(originalProducts);
      alert(e.message || '批量设置折扣失败');
    }
  };

  // 上/下架切换
  const handleToggleActive = async (product) => {
    // 防止重复操作
    if (operatingProducts.has(product.id)) return;
    
    // 当前是否上架
    const currentActive = !(product.is_active === 0 || product.is_active === false);
    const target = currentActive ? 0 : 1; // 目标状态，使用数字
    
    // 标记正在操作
    setOperatingProducts(prev => new Set(prev).add(product.id));
    
    // 乐观更新：立即更新UI
    const updatedProducts = products.map(p => 
      p.id === product.id ? { ...p, is_active: target } : p
    );
    setProducts(updatedProducts);
    
    try {
      await apiRequest(`${staffPrefix}/products/${product.id}`, { method: 'PUT', body: JSON.stringify({ is_active: target }) });
      // 成功后不需要重新加载，UI已经更新
    } catch (e) {
      // 失败时回滚UI状态
      const revertedProducts = products.map(p => 
        p.id === product.id ? { ...p, is_active: product.is_active } : p
      );
      setProducts(revertedProducts);
      alert(e.message || '更新上下架状态失败');
    } finally {
      // 清除操作状态
      setOperatingProducts(prev => {
        const newSet = new Set(prev);
        newSet.delete(product.id);
        return newSet;
      });
    }
  };

  const handleToggleHot = async (product, nextHot) => {
    // 防止重复操作
    if (operatingProducts.has(product.id)) return;
    
    // 标记正在操作
    setOperatingProducts(prev => new Set(prev).add(product.id));
    
    // 乐观更新：立即更新UI
    const updatedProducts = products.map(p => 
      p.id === product.id ? { ...p, is_hot: !!nextHot } : p
    );
    setProducts(updatedProducts);
    
    try {
      await apiRequest(`${staffPrefix}/products/${product.id}`, {
        method: 'PUT',
        body: JSON.stringify({ is_hot: !!nextHot })
      });
      // 成功后不需要重新加载，UI已经更新
    } catch (e) {
      // 失败时回滚UI状态
      const revertedProducts = products.map(p => 
        p.id === product.id ? { ...p, is_hot: !nextHot } : p
      );
      setProducts(revertedProducts);
      alert(e.message || '更新热销状态失败');
    } finally {
      // 清除操作状态
      setOperatingProducts(prev => {
        const newSet = new Set(prev);
        newSet.delete(product.id);
        return newSet;
      });
    }
  };

  const normalizeStockValue = (value) => {
    if (value === null || value === undefined || value === '') return 0;
    const parsed = typeof value === 'number' ? value : parseInt(value, 10);
    if (!Number.isFinite(parsed)) return 0;
    return parsed < 0 ? 0 : parsed;
  };

  // 更新库存（内联版本）
  const handleUpdateStock = async (productId, change = {}) => {
    const { mode = 'set', delta, target, optimisticStock } = change || {};
    const safeDeltaRaw = Number.isFinite(delta) ? delta : parseInt(delta, 10);
    const safeDelta = Number.isNaN(safeDeltaRaw) ? 0 : safeDeltaRaw;

    const existingProduct = products.find(p => p.id === productId);
    if (!existingProduct) {
      alert('未找到要更新的商品');
      return;
    }

    const previousStock = normalizeStockValue(existingProduct.stock);

    const optimisticValue = (() => {
      if (typeof optimisticStock === 'number') {
        return normalizeStockValue(optimisticStock);
      }
      if (mode === 'delta') {
        return normalizeStockValue(previousStock + safeDelta);
      }
      if (target !== undefined) {
        return normalizeStockValue(target);
      }
      return previousStock;
    })();

    setProducts(prev => prev.map(p => 
      p.id === productId ? { ...p, stock: optimisticValue } : p
    ));

    try {
      const latestResponse = await apiRequest(`${staffPrefix}/products/${productId}`);
      const latestProduct = latestResponse?.data?.product;
      if (!latestProduct) {
        throw new Error('未获取到最新的商品信息');
      }

      const latestStock = normalizeStockValue(latestProduct.stock);

      const nextStock = (() => {
        if (mode === 'delta') {
          return normalizeStockValue(latestStock + safeDelta);
        }
        if (mode === 'set') {
          const normalizedTarget = target !== undefined ? normalizeStockValue(target) : optimisticValue;
          return normalizedTarget;
        }
        return normalizeStockValue(optimisticValue);
      })();

      const applyLatestSnapshot = (baseProduct, stockValue) => {
        const next = { ...baseProduct, stock: stockValue };
        if (Array.isArray(latestProduct.variants)) {
          next.variants = latestProduct.variants;
          next.has_variants = latestProduct.has_variants;
          if (typeof latestProduct.total_variant_stock !== 'undefined') {
            next.total_variant_stock = latestProduct.total_variant_stock;
          }
        }
        return next;
      };

      if (nextStock === latestStock) {
        setProducts(prev => prev.map(p => 
          p.id === productId ? applyLatestSnapshot(p, latestStock) : p
        ));
        return nextStock;
      }

      await apiRequest(`${staffPrefix}/products/${productId}`, {
        method: 'PUT',
        body: JSON.stringify({ stock: nextStock })
      });

      setProducts(prev => prev.map(p => 
        p.id === productId ? applyLatestSnapshot(p, nextStock) : p
      ));

      // 刷新统计数据
      refreshStats().catch(err => console.error('刷新统计数据失败:', err));

      return nextStock;
    } catch (err) {
      setProducts(prev => prev.map(p => 
        p.id === productId ? { ...p, stock: previousStock } : p
      ));
      alert(err.message || '更新库存失败');
      throw err;
    }
  };

  const handleProductVariantsSync = (productId, payload = {}) => {
    const variantList = Array.isArray(payload.variants) ? payload.variants : [];
    const computedTotal = typeof payload.totalStock === 'number'
      ? payload.totalStock
      : variantList.reduce((sum, item) => sum + normalizeStockValue(item?.stock), 0);
    const safeTotal = normalizeStockValue(computedTotal);

    setProducts(prev => prev.map(p => {
      if (p.id !== productId) return p;
      return {
        ...p,
        variants: variantList,
        has_variants: variantList.length > 0,
        total_variant_stock: safeTotal
      };
    }));

    setVariantStockProduct(prev => {
      if (!prev || prev.id !== productId) return prev;
      return {
        ...prev,
        variants: variantList,
        has_variants: variantList.length > 0,
        total_variant_stock: safeTotal
      };
    });
  };

  // 删除商品
  const handleDeleteProduct = async (product) => {
    if (!confirm(`确定要删除商品"${product.name}"吗？此操作不可恢复。`)) {
      return;
    }
    
    // 乐观更新：立即从UI中移除商品
    const originalProducts = [...products];
    const updatedProducts = products.filter(p => p.id !== product.id);
    setProducts(updatedProducts);
    
    try {
      await apiRequest(`${staffPrefix}/products/${product.id}`, {
        method: 'DELETE'
      });
      
      alert('商品删除成功！');
      // 成功后不需要重新加载，UI已经更新
      
    } catch (err) {
      // 失败时恢复原始状态
      setProducts(originalProducts);
      alert(err.message || '删除商品失败');
    }
  };

  // 选择商品
  const handleSelectProduct = (productId, checked) => {
    if (checked) {
      setSelectedProducts(prev => [...prev, productId]);
    } else {
      setSelectedProducts(prev => prev.filter(id => id !== productId));
    }
  };

  // 全选/取消全选（对当前筛选后的可见商品生效）
  const handleSelectAll = (checked) => {
    if (checked) {
      setSelectedProducts(visibleProducts.map(product => product.id));
    } else {
      setSelectedProducts([]);
    }
  };

  // 批量删除商品
  const handleBatchDelete = async (productIds) => {
    if (productIds.length === 0) {
      alert('请选择要删除的商品');
      return;
    }

    const productNames = products
      .filter(product => productIds.includes(product.id))
      .map(product => product.name)
      .join('、');

    if (!confirm(`确定要删除以下 ${productIds.length} 件商品吗？\n\n${productNames}\n\n此操作不可恢复。`)) {
      return;
    }

    // 乐观更新：立即从UI中移除商品
    const originalProducts = [...products];
    const updatedProducts = products.filter(product => !productIds.includes(product.id));
    setProducts(updatedProducts);
    setSelectedProducts([]); // 清空选择

    try {
      setIsSubmitting(true);
      
      // 使用同一个删除API，通过请求体传递多个商品ID
      await apiRequest(`${staffPrefix}/products/0`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ product_ids: productIds })
      });

      alert(`成功删除 ${productIds.length} 件商品！`);
      // 成功后不需要重新加载，UI已经更新

    } catch (err) {
      // 失败时恢复原始状态
      setProducts(originalProducts);
      setSelectedProducts(productIds); // 恢复选择状态
      alert(err.message || '批量删除商品失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 批量上架/下架商品
  const handleBatchToggleActive = async (productIds, isActive) => {
    if (productIds.length === 0) {
      return;
    }

    // 乐观更新：立即更新UI
    const originalProducts = [...products];
    const updatedProducts = products.map(p => 
      productIds.includes(p.id) ? { ...p, is_active: isActive } : p
    );
    setProducts(updatedProducts);

    try {
      setIsSubmitting(true);
      
      // 批量更新商品状态
      const promises = productIds.map(productId => 
        apiRequest(`${staffPrefix}/products/${productId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ is_active: isActive })
        })
      );
      
      await Promise.all(promises);

      // 批量上架/下架后保持选择状态，不清空选择
      // setSelectedProducts([]); // 注释掉清空选择
      // 成功后不需要重新加载，UI已经更新

    } catch (err) {
      // 失败时回滚UI状态
      setProducts(originalProducts);
      console.error('批量操作失败:', err);
    } finally {
      setIsSubmitting(false);
    }
  };



  // 更新订单状态
  const handleUpdateOrderStatus = async (orderId, newStatus) => {
    const resp = await apiRequest(`/admin/orders/${orderId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: newStatus })
    });
    if (!resp?.success) {
      throw new Error(resp?.message || '更新订单状态失败');
    }
    await loadOrders(orderPage, orderSearch, orderAgentFilter);
    return resp;
  };

  // 更新订单支付状态（管理员）
  const handleUpdatePaymentStatus = async (orderId, newPaymentStatus) => {
    const resp = await apiRequest(`/admin/orders/${orderId}/payment-status`, {
      method: 'PATCH',
      body: JSON.stringify({ payment_status: newPaymentStatus })
    });
    if (!resp?.success) {
      const outOfStock = resp?.details?.out_of_stock_items;
      const detailMessage = outOfStock?.length
        ? `以下商品缺货：${outOfStock.join('、')}`
        : null;
      throw new Error(detailMessage || resp?.message || '更新支付状态失败');
    }
    await loadOrders(orderPage, orderSearch, orderAgentFilter);
    return resp;
  };

  // 选择订单
  const handleSelectOrder = (orderId, checked) => {
    if (checked) setSelectedOrders((prev) => [...prev, orderId]);
    else setSelectedOrders((prev) => prev.filter((id) => id !== orderId));
  };

  // 全选/取消全选订单
  const handleSelectAllOrders = (checked, ids) => {
    if (checked) setSelectedOrders(ids);
    else setSelectedOrders([]);
  };

  // 批量删除订单
  const handleBatchDeleteOrders = async (orderIds) => {
    if (!orderIds || orderIds.length === 0) { alert('请选择要删除的订单'); return; }
    if (!confirm(`确定删除选中的 ${orderIds.length} 笔订单吗？此操作不可恢复。`)) return;
    try {
      await apiRequest('/admin/orders/0', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_ids: orderIds })
      });
      setSelectedOrders([]);
      await loadOrders(orderPage, orderSearch, orderAgentFilter);
      alert('已删除所选订单');
    } catch (e) {
      alert(e.message || '批量删除订单失败');
    }
  };

  // 统一状态更新：根据选择自动映射到后端支付状态/订单状态
  const handleUpdateUnifiedStatus = async (order, newUnified) => {
    try {
      // 当前统一状态和目标统一状态
      const currentUnified = getUnifiedStatus(order);
      if (currentUnified === newUnified) return;

      // 操作顺序：先处理支付状态，再处理发货/完成状态
      if (newUnified === '未付款') {
        // 回退为未付款：支付状态 pending，订单状态 pending
        await handleUpdatePaymentStatus(order.id, 'pending');
        await handleUpdateOrderStatus(order.id, 'pending');
      } else if (newUnified === '待确认') {
        await handleUpdatePaymentStatus(order.id, 'processing');
        await handleUpdateOrderStatus(order.id, 'pending');
      } else if (newUnified === '待配送') {
        // 标记已支付（会扣库存），并设为已确认
        if (order.payment_status !== 'succeeded') {
          await handleUpdatePaymentStatus(order.id, 'succeeded');
        }
        await handleUpdateOrderStatus(order.id, 'confirmed');
      } else if (newUnified === '配送中') {
        // 需已支付
        if (order.payment_status !== 'succeeded') {
          showToast('请先确认付款后再设为配送中');
          return;
        }
        await handleUpdateOrderStatus(order.id, 'shipped');
      } else if (newUnified === '已完成') {
        // 需已支付
        if (order.payment_status !== 'succeeded') {
          showToast('请先确认付款后再设为已完成');
          return;
        }
        await handleUpdateOrderStatus(order.id, 'delivered');
      }
    } catch (err) {
      showToast(err.message || '更新状态失败');
    }
  };

  // 登出
  const handleLogout = async () => {
    if (confirm('确定要退出登录吗？')) {
      await logout();
      router.push('/login');
    }
  };

  // 处理表头排序点击
  const handleSortClick = (column) => {
    if (sortBy === column) {
      // 同一列再次点击，切换排序方向
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      // 点击不同的列
      setSortBy(column);
      // 设置默认排序方向
      if (column === 'category') {
        setSortOrder('asc'); // 分类：正序（字母>emoji>拼音）
      } else if (column === 'price') {
        setSortOrder('asc'); // 价格：正序（低到高）
      } else if (column === 'stock') {
        setSortOrder('desc'); // 库存：倒序（高到低）
      } else if (column === 'created_at') {
        setSortOrder('desc'); // 创建时间：倒序（新到旧）
      }
    }
  };

  // 初始化加载
  useEffect(() => {
    if (!user || user.type !== expectedRole) return;
    loadData('self');
    if (isAdmin) {
      loadAddresses();
      loadAgents();
    }
  }, [user, expectedRole]);

  // 非授权账号不渲染
  if (!user || user.type !== expectedRole) {
    return null;
  }

  // 按分类筛选后的产品（用于当前页面显示）
  const filteredByCategory = productCategoryFilter === '全部' ? products : products.filter(p => p.category === productCategoryFilter);
  const isProductInactive = (product) => (product.is_active === 0 || product.is_active === false);
  const isProductOutOfStock = (product) => {
    if (normalizeBooleanFlag(product.is_not_for_sale, false)) {
      return false;
    }
    if (product.has_variants) {
      if (Array.isArray(product.variants) && product.variants.length > 0) {
        return product.variants.every(variant => (variant.stock || 0) <= 0);
      }
      if (typeof product.total_variant_stock === 'number') {
        return product.total_variant_stock <= 0;
      }
      return false;
    }
    return (product.stock || 0) <= 0;
  };
  
  // 辅助函数：获取字符串中第一个有意义的字符
  const getFirstSignificantChar = (str) => {
    const s = String(str || '');
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      // 获取字母、数字、emoji或中文
      if (/[A-Za-z0-9\u4e00-\u9fff]/.test(ch) || /[\u{1F000}-\u{1F9FF}]/u.test(ch)) {
        return ch;
      }
    }
    return '';
  };
  
  // 辅助函数：判断字符类型（0: emoji, 1: 字母, 2: 数字, 3: 中文, 4: 其他）
  const getCharType = (ch) => {
    if (!ch) return 4; // 空或无意义
    if (/[\u{1F000}-\u{1F9FF}]/u.test(ch)) return 0; // emoji
    if (/[A-Za-z]/.test(ch)) return 1; // 字母
    if (/[0-9]/.test(ch)) return 2; // 数字
    if (/[\u4e00-\u9fff]/.test(ch)) return 3; // 中文
    return 4; // 其他
  };
  
  // 辅助函数：获取商品的实际库存
  const getProductStock = (product) => {
    if (normalizeBooleanFlag(product.is_not_for_sale, false)) {
      return Number.POSITIVE_INFINITY;
    }
    if (product.has_variants) {
      if (Array.isArray(product.variants) && product.variants.length > 0) {
        return product.variants.reduce((sum, v) => sum + (v.stock || 0), 0);
      }
      if (typeof product.total_variant_stock === 'number') {
        return product.total_variant_stock;
      }
      return 0;
    }
    return product.stock || 0;
  };
  
  // 辅助函数：获取商品的折扣后价格
  const getDiscountedPrice = (product) => {
    const discount = (typeof product.discount === 'number' && product.discount) 
      ? product.discount 
      : (product.discount ? parseFloat(product.discount) : 10);
    const hasDiscount = discount && discount > 0 && discount < 10;
    return hasDiscount ? (Math.round(product.price * (discount / 10) * 100) / 100) : product.price;
  };
  
  // 分类名称排序比较器（emoji > 字母 > 数字 > 拼音）
  const compareCategoryName = (a, b) => {
    const aName = String(a.category || '');
    const bName = String(b.category || '');
    
    // 获取第一个有意义的字符
    const aChar = getFirstSignificantChar(aName);
    const bChar = getFirstSignificantChar(bName);
    
    // 获取字符类型
    const aType = getCharType(aChar);
    const bType = getCharType(bChar);
    
    // 首先按类型排序：emoji(0) > 字母(1) > 数字(2) > 中文(3) > 其他(4)
    if (aType !== bType) {
      return aType - bType;
    }
    
    // 同类型内按拼音/字母/数字排序
    try {
      const collator = new Intl.Collator(
        ['zh-Hans-u-co-pinyin', 'zh-Hans', 'zh', 'en', 'en-US'],
        { sensitivity: 'base', numeric: true }
      );
      return collator.compare(aName, bName);
    } catch (e) {
      return aName.localeCompare(bName, 'zh-Hans-u-co-pinyin');
    }
  };
  
  // 先筛选，再排序
  let visibleProducts = filteredByCategory.filter((product) => {
    if (showOnlyOutOfStock && !isProductOutOfStock(product)) return false;
    if (showOnlyInactive && !isProductInactive(product)) return false;
    return true;
  });
  
  // 应用排序
  if (sortBy === null) {
    // 默认排序：热销在最前面，然后是普通商品，内部按分类名称（emoji>字母>数字>拼音）排序
    visibleProducts = [...visibleProducts].sort((a, b) => {
      const aIsHot = Boolean(a.is_hot);
      const bIsHot = Boolean(b.is_hot);
      
      // 热销优先
      if (aIsHot !== bIsHot) {
        return bIsHot ? 1 : -1; // 热销的排前面
      }
      
      // 同为热销或同为普通，按分类名称排序
      return compareCategoryName(a, b);
    });
  } else {
    // 用户手动排序
    visibleProducts = [...visibleProducts].sort((a, b) => {
      let result = 0;
      
      if (sortBy === 'category') {
        result = compareCategoryName(a, b);
      } else if (sortBy === 'price') {
        const aPrice = getDiscountedPrice(a);
        const bPrice = getDiscountedPrice(b);
        result = aPrice - bPrice;
      } else if (sortBy === 'stock') {
        const aStock = getProductStock(a);
        const bStock = getProductStock(b);
        result = aStock - bStock;
      } else if (sortBy === 'created_at') {
        const aTime = new Date(a.created_at).getTime();
        const bTime = new Date(b.created_at).getTime();
        result = aTime - bTime;
      }
      
      // 应用排序方向
      return sortOrder === 'desc' ? -result : result;
    });
  }

  return (
    <>
      <Head>
        <title>{isAdmin ? `管理后台 - ${shopName}` : `代理后台 - ${shopName}`}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>

      <div className="min-h-screen bg-gray-50">
        {/* 统一导航栏 */}
        <Nav active={navActive} />
        
        {/* 主要内容 */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pt-24">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900">{isAdmin ? '管理后台' : '代理后台'}</h1>
            <p className="text-gray-600 mt-1">{isAdmin ? '管理商品、订单与系统配置。' : '管理您负责区域的商品与订单。'}</p>
          </div>

          {/* 状态开关 */}
          {isAdmin && (
            <div className="mb-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ShopStatusCard />
              <RegistrationSettingsCard />
            </div>
          )}
          {isAgent && <AgentStatusCard />}



          {/* 错误提示 */}
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {/* 统计卡片 */}
          {!isLoading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-6 mb-8">
              <StatsCard
                title="商品总数"
                value={stats.total_products}
                icon="📦"
                color="indigo"
              />
              <StatsCard
                title="商品分类"
                value={stats.categories}
                icon="🏷️"
                color="green"
              />
              <StatsCard
                title="总库存"
                value={stats.total_stock}
                icon="📊"
                color="yellow"
              />
              <StatsCard
                title="订单总数"
                value={orderStats.total_orders}
                icon="📋"
                color="purple"
              />
              <StatsCard
                title="总销售额"
                value={`¥${orderStats.total_revenue}`}
                icon="💰"
                color="indigo"
              />
              <StatsCard
                title="注册人数"
                value={stats.users_count}
                icon="🧑‍💻"
                color="green"
              />
            </div>
          )}

          {/* 选项卡导航 */}
          <div className="mb-8">
            <div className="border-b border-gray-200">
              <nav className="-mb-px flex space-x-8">
                <button
                  onClick={() => {
                    setActiveTab('products');
                    loadData(orderAgentFilter, false, false);
                  }}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'products'
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  商品管理
                </button>
                <button
                  onClick={async () => {
                    setActiveTab('orders');
                    await Promise.all([
                      loadOrders(0, orderSearch, orderAgentFilter),
                      loadData(orderAgentFilter, false, false)
                    ]);
                  }}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'orders'
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  订单管理
                  {orderStats.status_counts?.pending > 0 && (
                    <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                      {orderStats.status_counts.pending}
                    </span>
                  )}
                </button>
                {isAdmin && (
                  <>
                    <button
                      onClick={() => {
                        setActiveTab('addresses');
                        loadAddresses();
                      }}
                      className={`py-2 px-1 border-b-2 font-medium text-sm ${
                        activeTab === 'addresses'
                          ? 'border-indigo-500 text-indigo-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      地址管理
                    </button>
                    <button
                      onClick={() => {
                        setActiveTab('agents');
                        loadAgents();
                      }}
                      className={`py-2 px-1 border-b-2 font-medium text-sm ${
                        activeTab === 'agents'
                          ? 'border-indigo-500 text-indigo-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      代理管理
                    </button>
                  </>
                )}
                {allowedTabs.includes('lottery') && (
                  <button
                    onClick={() => setActiveTab('lottery')}
                    className={`py-2 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'lottery'
                        ? 'border-indigo-500 text-indigo-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    抽奖配置
                    {lotteryHasStockWarning && (
                      <span className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                        <i className="fas fa-exclamation text-red-600"></i>
                      </span>
                    )}
                  </button>
                )}
                {allowedTabs.includes('autoGifts') && (
                  <button
                    onClick={() => setActiveTab('autoGifts')}
                    className={`py-2 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'autoGifts'
                        ? 'border-indigo-500 text-indigo-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    满额门槛
                    {giftThresholdHasStockWarning && (
                      <span className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                        <i className="fas fa-exclamation text-red-600"></i>
                      </span>
                    )}
                  </button>
                )}
                {allowedTabs.includes('coupons') && (
                  <button
                    onClick={() => setActiveTab('coupons')}
                    className={`py-2 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'coupons'
                        ? 'border-indigo-500 text-indigo-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    优惠券管理
                  </button>
                )}
                {allowedTabs.includes('paymentQrs') && (
                  <button
                    onClick={() => setActiveTab('paymentQrs')}
                    className={`py-2 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'paymentQrs'
                        ? 'border-indigo-500 text-indigo-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    收款码管理
                  </button>
                )}
              </nav>
            </div>
          </div>

          {/* 商品管理 */}
          {activeTab === 'products' && (
            <ProductsPanel
              isAdmin={isAdmin}
              showInactiveInShop={showInactiveInShop}
              updateShopInactiveSetting={updateShopInactiveSetting}
              isLoadingShopSetting={isLoadingShopSetting}
              onAddClick={() => setShowAddModal(true)}
              categories={categories}
              productCategoryFilter={productCategoryFilter}
              onProductCategoryFilterChange={setProductCategoryFilter}
              isLoading={isLoading}
              visibleProducts={visibleProducts}
              onRefreshProducts={() => loadData(orderAgentFilter, true, true)}
              onEditProduct={(product) => {
                setEditingProduct(product);
                setShowEditModal(true);
              }}
              onDeleteProduct={handleDeleteProduct}
              onUpdateStock={handleUpdateStock}
              onBatchDelete={handleBatchDelete}
              onBatchUpdateDiscount={handleBatchUpdateDiscount}
              onBatchToggleActive={handleBatchToggleActive}
              selectedProducts={selectedProducts}
              onSelectProduct={handleSelectProduct}
              onSelectAllProducts={handleSelectAll}
              onUpdateDiscount={handleUpdateDiscount}
              onToggleActive={handleToggleActive}
              onOpenVariantStock={(p) => setVariantStockProduct(p)}
              onToggleHot={handleToggleHot}
              showOnlyOutOfStock={showOnlyOutOfStock}
              showOnlyInactive={showOnlyInactive}
              onToggleOutOfStockFilter={setShowOnlyOutOfStock}
              onToggleInactiveFilter={setShowOnlyInactive}
              operatingProducts={operatingProducts}
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSortClick={handleSortClick}
            />
          )}

          {/* 订单管理 */}
          {activeTab === 'orders' && (
            <OrdersPanel
              isAdmin={isAdmin}
              orderAgentFilter={orderAgentFilter}
              orderAgentOptions={orderAgentOptions}
              orderAgentFilterLabel={orderAgentFilterLabel}
              orderLoading={orderLoading}
              orders={orders}
              orderStatusFilter={orderStatusFilter}
              onOrderStatusFilterChange={setOrderStatusFilter}
              orderExporting={orderExporting}
              onExportOrders={handleExportOrders}
              orderStats={orderStats}
              onOrderAgentFilterChange={handleOrderAgentFilterChange}
              selectedOrders={selectedOrders}
              onSelectOrder={handleSelectOrder}
              onSelectAllOrders={handleSelectAllOrders}
              onBatchDeleteOrders={handleBatchDeleteOrders}
              onRefreshOrders={() => handleOrderRefresh()}
              orderSearch={orderSearch}
              onOrderSearchChange={setOrderSearch}
              orderPage={orderPage}
              orderHasMore={orderHasMore}
              onPrevPage={handlePrevPage}
              onNextPage={handleNextPage}
              agentNameMap={orderAgentNameMap}
              isSubmitting={isSubmitting}
              currentUserLabel={user?.name || user?.id || '当前账号'}
              onUpdateUnifiedStatus={handleUpdateUnifiedStatus}
            />
          )}

          {activeTab === 'agents' && (
            <div className="space-y-6">
              {/* 页面标题和操作 */}
              <div className="mb-8">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold bg-gradient-to-r from-gray-900 via-indigo-800 to-purple-800 bg-clip-text text-transparent">
                      代理管理系统
                    </h2>
                    <p className="text-sm text-gray-600 mt-2">创建代理账号并绑定负责的楼栋，系统将自动分配订单与商品管理权限</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={loadAgents} 
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-indigo-600 hover:text-indigo-700 bg-indigo-50/50 hover:bg-indigo-100/50 border border-indigo-200/50 hover:border-indigo-300/50 transition-all duration-300"
                    >
                      <i className="fas fa-sync-alt text-xs"></i>
                      刷新数据
                    </button>
                    <button
                      onClick={() => openAgentModal(null)}
                      className="inline-flex items-center gap-2 px-6 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 text-white font-medium hover:from-indigo-600 hover:to-indigo-700 transition-all duration-300 shadow-lg hover:shadow-xl"
                    >
                      <i className="fas fa-user-plus"></i>
                      新增代理
                    </button>
                  </div>
                </div>
                <div className="mt-4 w-20 h-1 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full"></div>
              </div>

              {/* 统计卡片 */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
                <div className="bg-gradient-to-br from-indigo-50 to-blue-100 rounded-2xl p-6 border border-indigo-200/50 hover:shadow-lg transition-all duration-300">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
                      <i className="fas fa-users text-white text-lg"></i>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-indigo-700">{agents.length}</div>
                      <div className="text-sm text-indigo-600">代理总数</div>
                    </div>
                  </div>
                </div>
                <div className="bg-gradient-to-br from-emerald-50 to-teal-100 rounded-2xl p-6 border border-emerald-200/50 hover:shadow-lg transition-all duration-300">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center shadow-lg">
                      <i className="fas fa-user-check text-white text-lg"></i>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-emerald-700">
                        {agents.filter(a => a.is_active !== false).length}
                      </div>
                      <div className="text-sm text-emerald-600">在职代理</div>
                    </div>
                  </div>
                </div>
                <div className="bg-gradient-to-br from-amber-50 to-orange-100 rounded-2xl p-6 border border-amber-200/50 hover:shadow-lg transition-all duration-300">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl flex items-center justify-center shadow-lg">
                      <i className="fas fa-building text-white text-lg"></i>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-amber-700">
                        {agents.reduce((sum, agent) => sum + (agent.buildings || []).length, 0)}
                      </div>
                      <div className="text-sm text-amber-600">负责楼栋</div>
                    </div>
                  </div>
                </div>
                <div className="bg-gradient-to-br from-red-50 to-pink-100 rounded-2xl p-6 border border-red-200/50 hover:shadow-lg transition-all duration-300">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-red-500 to-red-600 rounded-xl flex items-center justify-center shadow-lg">
                      <i className="fas fa-user-slash text-white text-lg"></i>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-red-700">
                        {agents.filter(a => a.is_active === false).length}
                      </div>
                      <div className="text-sm text-red-600">已停用</div>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setShowDeletedAgentsModal(true)}
                  className="bg-gradient-to-br from-gray-50 to-slate-100 rounded-2xl p-6 border border-gray-300/50 hover:shadow-lg transition-all duration-300 hover:from-gray-100 hover:to-slate-200 cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-gray-500 to-gray-600 rounded-xl flex items-center justify-center shadow-lg">
                      <i className="fas fa-archive text-white text-lg"></i>
                    </div>
                    <div className="text-left">
                      <div className="text-2xl font-bold text-gray-700">{deletedAgents.length}</div>
                      <div className="text-sm text-gray-600">已删除</div>
                    </div>
                  </div>
                </button>
              </div>

              {agentError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-2xl text-sm flex items-center gap-3 shadow-sm">
                  <i className="fas fa-exclamation-circle text-red-500"></i>
                  <span>{agentError}</span>
                </div>
              )}

              {agentLoading ? (
                <div className="flex items-center justify-center py-24 text-gray-500">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-indigo-600 mx-auto mb-4"></div>
                    <p className="text-lg font-medium">正在加载代理列表...</p>
                  </div>
                </div>
              ) : (
                agents.length === 0 ? (
                  <div className="text-center py-24">
                    <div className="w-24 h-24 bg-gradient-to-br from-indigo-100 to-indigo-200 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg">
                      <i className="fas fa-user-friends text-indigo-400 text-3xl"></i>
                    </div>
                    <h3 className="text-xl font-semibold text-gray-700 mb-3">暂无代理账号</h3>
                    <p className="text-gray-500 mb-6">点击"新增代理"按钮创建第一个代理账号</p>
                    <button
                      onClick={() => openAgentModal(null)}
                      className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 text-white font-medium hover:from-indigo-600 hover:to-indigo-700 transition-all duration-300 shadow-lg hover:shadow-xl"
                    >
                      <i className="fas fa-plus"></i>
                      创建代理账号
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                    {agents.map((agent, index) => {
                      const buildingNames = (agent.buildings || []).map(b => buildingLabelMap[b.building_id] || `${b.address_name || ''}${b.building_name ? '·' + b.building_name : ''}`.trim()).filter(Boolean);
                      const isActive = agent.is_active !== false;
                      
                      return (
                        <div 
                          key={agent.id} 
                          className="bg-white rounded-2xl shadow-sm border border-gray-200/50 overflow-hidden hover:shadow-lg transition-all duration-300 group"
                        >
                          {/* 代理卡片头部 */}
                          <div className={`p-6 ${
                            isActive 
                              ? 'bg-gradient-to-r from-indigo-500 to-indigo-600' 
                              : 'bg-gradient-to-r from-gray-400 to-gray-500'
                          }`}>
                            <div className="flex items-start justify-between">
                              <div className="flex items-center gap-4 flex-1">
                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-xl ${
                                  isActive ? 'bg-white/20 backdrop-blur-sm' : 'bg-black/10'
                                }`}>
                                  <i className="fas fa-user text-white text-xl"></i>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-lg font-bold text-white truncate" title={agent.name || agent.id}>
                                    {agent.name || agent.id}
                                  </div>
                                  <div className="flex items-center gap-2 mt-1">
                                    <div className={`px-3 py-1 rounded-full text-xs font-semibold ${
                                      isActive 
                                        ? 'bg-emerald-500/90 text-white' 
                                        : 'bg-gray-600/90 text-gray-100'
                                    }`}>
                                      {isActive ? '● 在职' : '● 已停用'}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* 代理信息区域 */}
                          <div className="p-6 space-y-4">
                            {/* 账号信息 */}
                            <div className="space-y-3">
                              <div className="flex items-center gap-3 text-sm">
                                <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                                  <i className="fas fa-id-card text-gray-600 text-xs"></i>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs text-gray-500">账号</div>
                                  <div className="font-medium text-gray-900 truncate" title={agent.id}>{agent.id}</div>
                                </div>
                              </div>
                              
                              {/* 负责楼栋 */}
                              <div className="flex items-start gap-3 text-sm">
                                <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                  <i className="fas fa-building text-gray-600 text-xs"></i>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs text-gray-500 mb-1">负责楼栋</div>
                                  {buildingNames.length > 0 ? (
                                    <div className="flex flex-wrap gap-1.5">
                                      {buildingNames.slice(0, 3).map((name, idx) => (
                                        <span 
                                          key={idx} 
                                          className="inline-flex items-center px-2.5 py-1 bg-indigo-50 text-indigo-700 text-xs font-medium rounded-lg border border-indigo-200/50"
                                          title={name}
                                        >
                                          {name}
                                        </span>
                                      ))}
                                      {buildingNames.length > 3 && (
                                        <span className="inline-flex items-center px-2.5 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded-lg">
                                          +{buildingNames.length - 3}
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="text-sm text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200/50 inline-flex items-center gap-1.5">
                                      <i className="fas fa-exclamation-triangle text-xs"></i>
                                      未绑定楼栋
                                    </div>
                                  )}
                                  {buildingNames.length > 0 && (
                                    <div className="text-xs text-gray-500 mt-2">
                                      共负责 <span className="font-semibold text-indigo-600">{buildingNames.length}</span> 个楼栋
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* 操作按钮 */}
                            <div className="pt-4 border-t border-gray-100 flex gap-2">
                              <button 
                                onClick={() => openAgentModal(agent)} 
                                className="flex-1 px-4 py-2.5 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-all duration-200 border border-indigo-200/50 hover:border-indigo-300/50"
                              >
                                <i className="fas fa-edit mr-2"></i>
                                编辑
                              </button>
                              <button 
                                onClick={() => handleAgentStatusToggle(agent, !isActive)} 
                                className={`flex-1 px-4 py-2.5 text-sm font-medium rounded-xl transition-all duration-200 border ${
                                  isActive
                                    ? 'text-amber-600 bg-amber-50 hover:bg-amber-100 border-amber-200/50 hover:border-amber-300/50'
                                    : 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100 border-emerald-200/50 hover:border-emerald-300/50'
                                }`}
                              >
                                <i className={`fas ${isActive ? 'fa-pause' : 'fa-play'} mr-2`}></i>
                                {isActive ? '停用' : '启用'}
                              </button>
                              {!isActive && (
                                <button 
                                  onClick={() => handleAgentDelete(agent)} 
                                  className="px-4 py-2.5 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition-all duration-200 border border-red-200/50 hover:border-red-300/50"
                                  title="删除代理"
                                >
                                  <i className="fas fa-trash"></i>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              )}

              {agentModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fadeIn">
                  <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col animate-scaleIn">
                    {/* 模态框头部 */}
                    <div className="bg-gradient-to-r from-indigo-500 to-purple-600 p-6 relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full transform translate-x-16 -translate-y-16"></div>
                      <div className="relative z-10 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center">
                            <i className="fas fa-user-cog text-white text-xl"></i>
                          </div>
                          <div>
                            <h3 className="text-xl font-bold text-white">{editingAgent ? '编辑代理信息' : '创建新代理'}</h3>
                            <p className="text-sm text-white/80 mt-1">为代理配置账号信息和负责区域，系统将自动分配权限</p>
                          </div>
                        </div>
                        <button 
                          onClick={closeAgentModal} 
                          className="w-10 h-10 bg-white/20 hover:bg-white/30 rounded-xl flex items-center justify-center transition-all duration-200"
                          aria-label="关闭"
                        >
                          <i className="fas fa-times text-white" />
                        </button>
                      </div>
                    </div>

                    {/* 模态框内容 */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-6">
                      {agentError && (
                        <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-2xl text-sm flex items-center gap-3 shadow-sm">
                          <i className="fas fa-exclamation-circle text-red-500 text-lg"></i>
                          <span>{agentError}</span>
                        </div>
                      )}

                      {/* 基本信息 */}
                      <div className="bg-gradient-to-br from-gray-50 to-blue-50/30 rounded-2xl p-6 border border-gray-200/50">
                        <div className="flex items-center gap-2 mb-4">
                          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                            <i className="fas fa-info-circle text-white text-sm"></i>
                          </div>
                          <h4 className="text-lg font-semibold text-gray-900">基本信息</h4>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                              <i className="fas fa-user text-gray-400 text-xs"></i>
                              账号
                              {!editingAgent && <span className="text-red-500">*</span>}
                            </label>
                            <input
                              type="text"
                              value={agentForm.account}
                              onChange={(e) => setAgentForm(prev => ({ ...prev, account: e.target.value }))}
                              disabled={!!editingAgent}
                              placeholder="输入登录账号"
                              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 disabled:bg-gray-100 disabled:cursor-not-allowed"
                            />
                            {editingAgent && (
                              <p className="text-xs text-gray-500 mt-1.5">账号创建后不可修改</p>
                            )}
                          </div>
                          <div>
                            <label className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                              <i className="fas fa-lock text-gray-400 text-xs"></i>
                              {editingAgent ? '重设密码（可选）' : '初始密码'}
                              {!editingAgent && <span className="text-red-500">*</span>}
                            </label>
                            <input
                              type="password"
                              value={agentForm.password}
                              onChange={(e) => setAgentForm(prev => ({ ...prev, password: e.target.value }))}
                              placeholder={editingAgent ? '留空则不修改密码' : '请输入初始密码'}
                              className={`w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 transition-all duration-200 ${
                                agentForm.password && agentForm.password.length > 0 && agentForm.password.length < 3
                                  ? 'border-red-300 focus:ring-red-500 focus:border-red-500'
                                  : 'border-gray-300 focus:ring-indigo-500 focus:border-transparent'
                              }`}
                            />
                            {agentForm.password && agentForm.password.length > 0 && agentForm.password.length < 3 ? (
                              <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1">
                                <i className="fas fa-exclamation-circle"></i>
                                密码至少需要3位
                              </p>
                            ) : editingAgent ? (
                              <p className="text-xs text-gray-500 mt-1.5">仅在需要重置密码时填写，至少3位</p>
                            ) : (
                              <p className="text-xs text-gray-500 mt-1.5">密码至少3位</p>
                            )}
                          </div>
                          <div>
                            <label className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                              <i className="fas fa-id-badge text-gray-400 text-xs"></i>
                              显示名称
                            </label>
                            <input
                              type="text"
                              value={agentForm.name}
                              onChange={(e) => setAgentForm(prev => ({ ...prev, name: e.target.value }))}
                              placeholder="用于展示的友好名称"
                              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200"
                            />
                            <p className="text-xs text-gray-500 mt-1.5">如：张三、李四等</p>
                          </div>
                          <div className="flex items-center">
                            <label className="flex items-center gap-3 cursor-pointer bg-white px-4 py-3 rounded-xl border border-gray-300 hover:border-indigo-300 transition-all duration-200 w-full">
                              <input
                                type="checkbox"
                                id="agent_active"
                                checked={agentForm.is_active}
                                onChange={(e) => setAgentForm(prev => ({ ...prev, is_active: !!e.target.checked }))}
                                className="h-5 w-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                              />
                              <div className="flex-1">
                                <span className="text-sm font-medium text-gray-900">启用该代理</span>
                                <p className="text-xs text-gray-500 mt-0.5">关闭后代理无法登录系统</p>
                              </div>
                            </label>
                          </div>
                        </div>
                      </div>

                      {/* 楼栋分配 */}
                      <div className="bg-gradient-to-br from-gray-50 to-indigo-50/30 rounded-2xl p-6 border border-gray-200/50">
                        <div className="flex items-center gap-2 mb-4">
                          <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg flex items-center justify-center">
                            <i className="fas fa-building text-white text-sm"></i>
                          </div>
                          <div className="flex-1">
                            <h4 className="text-lg font-semibold text-gray-900">负责楼栋</h4>
                            <p className="text-xs text-gray-500 mt-0.5">
                              已选择 <span className="font-semibold text-indigo-600">{agentForm.building_ids.length}</span> 个楼栋
                            </p>
                          </div>
                          {agentForm.building_ids.length > 0 && (
                            <button
                              onClick={() => setAgentForm(prev => ({ ...prev, building_ids: [] }))}
                              className="text-xs text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-all duration-200"
                            >
                              清空选择
                            </button>
                          )}
                        </div>
                        
                        {(addresses || []).some(addr => (buildingsByAddress[addr.id] || []).length > 0) ? (
                          <div className="space-y-4 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                            {(addresses || []).map(addr => {
                              const blds = buildingsByAddress[addr.id] || [];
                              if (!blds.length) return null;
                              
                              const selectedInAddress = blds.filter(b => agentForm.building_ids.includes(b.id)).length;
                              const allSelected = selectedInAddress === blds.length;
                              const someSelected = selectedInAddress > 0 && !allSelected;
                              
                              return (
                                <div key={addr.id} className="bg-white rounded-xl border border-gray-200/80 overflow-hidden shadow-sm hover:shadow-md transition-all duration-200">
                                  {/* 地址头部 */}
                                  <div className="bg-gradient-to-r from-gray-50 to-blue-50/50 px-4 py-3 border-b border-gray-200/50">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                                          <i className="fas fa-map-marker-alt text-white text-xs"></i>
                                        </div>
                                        <div>
                                          <div className="text-sm font-semibold text-gray-900">{addr.name}</div>
                                          <div className="text-xs text-gray-500">
                                            {selectedInAddress > 0 ? `已选 ${selectedInAddress}/${blds.length}` : `共 ${blds.length} 个楼栋`}
                                          </div>
                                        </div>
                                      </div>
                                      <button
                                        onClick={() => {
                                          const buildingIds = blds.map(b => b.id);
                                          setAgentForm(prev => ({
                                            ...prev,
                                            building_ids: allSelected
                                              ? prev.building_ids.filter(id => !buildingIds.includes(id))
                                              : [...new Set([...prev.building_ids, ...buildingIds])]
                                          }));
                                        }}
                                        className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-all duration-200 ${
                                          allSelected
                                            ? 'text-red-600 bg-red-50 hover:bg-red-100'
                                            : 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100'
                                        }`}
                                      >
                                        {allSelected ? '取消全选' : someSelected ? '全选' : '全选'}
                                      </button>
                                    </div>
                                  </div>
                                  
                                  {/* 楼栋列表 */}
                                  <div className="p-4">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                      {blds.map(b => {
                                        const isSelected = agentForm.building_ids.includes(b.id);
                                        return (
                                          <label
                                            key={b.id}
                                            className={`flex items-center gap-2 px-3 py-2.5 border rounded-xl text-sm cursor-pointer transition-all duration-200 ${
                                              isSelected 
                                                ? 'border-indigo-300 bg-indigo-50 text-indigo-700 shadow-sm' 
                                                : 'border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300'
                                            }`}
                                          >
                                            <input
                                              type="checkbox"
                                              checked={isSelected}
                                              onChange={() => toggleAgentBuilding(b.id)}
                                              className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                                            />
                                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                              <i className={`fas fa-building text-xs ${isSelected ? 'text-indigo-500' : 'text-gray-400'}`}></i>
                                              <span className="truncate font-medium">{b.name}</span>
                                            </div>
                                            {isSelected && (
                                              <i className="fas fa-check-circle text-indigo-500 text-xs"></i>
                                            )}
                                          </label>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-300">
                            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                              <i className="fas fa-building text-gray-400 text-2xl"></i>
                            </div>
                            <p className="text-sm font-medium text-gray-700 mb-2">暂无可分配的楼栋</p>
                            <p className="text-xs text-gray-500">请先在"地址管理"中添加地址和楼栋</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 模态框底部操作按钮 */}
                    <div className="border-t border-gray-200 bg-gray-50/50 px-6 py-4 flex items-center justify-between">
                      <div className="text-xs text-gray-500">
                        {editingAgent ? '修改后将立即生效' : '创建后代理即可使用账号登录'}
                      </div>
                      <div className="flex gap-3">
                        <button
                          onClick={closeAgentModal}
                          className="px-6 py-2.5 text-sm font-medium border border-gray-300 rounded-xl hover:bg-gray-50 transition-all duration-200"
                        >
                          取消
                        </button>
                        <button
                          onClick={handleAgentSave}
                          disabled={agentSaving || (agentForm.password && agentForm.password.length > 0 && agentForm.password.length < 3)}
                          className="px-6 py-2.5 text-sm font-medium bg-gradient-to-r from-indigo-500 to-indigo-600 text-white rounded-xl hover:from-indigo-600 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl flex items-center gap-2"
                        >
                          {agentSaving ? (
                            <>
                              <i className="fas fa-spinner animate-spin"></i>
                              保存中...
                            </>
                          ) : (
                            <>
                              <i className="fas fa-check"></i>
                              {editingAgent ? '保存修改' : '创建代理'}
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 已删除代理弹窗 */}
              {showDeletedAgentsModal && (
                <div className="fixed inset-0 z-50 overflow-y-auto">
                  <div className="flex min-h-screen items-center justify-center p-4">
                    {/* 背景遮罩 */}
                    <div 
                      className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
                      onClick={() => setShowDeletedAgentsModal(false)}
                    ></div>
                    
                    {/* 模态框内容 */}
                    <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[80vh] overflow-hidden">
                      {/* 模态框头部 */}
                      <div className="bg-gradient-to-r from-gray-500 to-gray-600 px-6 py-5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                              <i className="fas fa-archive text-white text-lg"></i>
                            </div>
                            <div>
                              <h3 className="text-xl font-bold text-white">已删除代理</h3>
                              <p className="text-sm text-white/80 mt-0.5">查看已删除的代理账号历史信息</p>
                            </div>
                          </div>
                          <button
                            onClick={() => setShowDeletedAgentsModal(false)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-all duration-200"
                          >
                            <i className="fas fa-times text-lg"></i>
                          </button>
                        </div>
                      </div>

                      {/* 模态框内容 */}
                      <div className="p-6 overflow-y-auto max-h-[calc(80vh-140px)]">
                        {deletedAgents.length === 0 ? (
                          <div className="text-center py-16">
                            <div className="w-20 h-20 bg-gray-100 rounded-3xl flex items-center justify-center mx-auto mb-4">
                              <i className="fas fa-archive text-gray-400 text-3xl"></i>
                            </div>
                            <h3 className="text-lg font-semibold text-gray-700 mb-2">暂无已删除代理</h3>
                            <p className="text-sm text-gray-500">没有已删除的代理记录</p>
                          </div>
                        ) : (
                          <>
                            <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-sm">
                              <div className="flex items-start gap-2">
                                <i className="fas fa-info-circle mt-0.5"></i>
                                <div>
                                  <p className="font-medium">历史数据已保留</p>
                                  <p className="text-xs mt-1 text-amber-700">
                                    已删除的代理订单数据已保留，可在订单管理的"查看范围"中选择对应的「（已删除）」选项查看历史订单。
                                  </p>
                                </div>
                              </div>
                            </div>
                            
                            <div className="space-y-3">
                              {deletedAgents.map((agent, index) => (
                                <div 
                                  key={agent.id}
                                  className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-all duration-200"
                                >
                                  <div className="flex items-start justify-between gap-4">
                                    <div className="flex items-start gap-4 flex-1">
                                      <div className="w-12 h-12 bg-gradient-to-br from-gray-400 to-gray-500 rounded-xl flex items-center justify-center text-white font-bold shadow-lg flex-shrink-0">
                                        {index + 1}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-2">
                                          <h4 className="text-base font-bold text-gray-900">
                                            {agent.name || agent.id}
                                          </h4>
                                          <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-lg border border-red-200">
                                            已删除
                                          </span>
                                        </div>
                                        <div className="space-y-1.5">
                                          <div className="flex items-center gap-2 text-sm text-gray-600">
                                            <i className="fas fa-user text-xs text-gray-400 w-4"></i>
                                            <span className="font-mono">{agent.id}</span>
                                          </div>
                                          {agent.deleted_at && (
                                            <div className="flex items-center gap-2 text-sm text-gray-600">
                                              <i className="fas fa-calendar-times text-xs text-gray-400 w-4"></i>
                                              <span>
                                                删除时间: {typeof agent.deleted_at === 'number' 
                                                  ? new Date(agent.deleted_at * 1000).toLocaleString('zh-CN')
                                                  : new Date(agent.deleted_at).toLocaleString('zh-CN')}
                                              </span>
                                            </div>
                                          )}
                                          {agent.building_ids && agent.building_ids.length > 0 && (
                                            <div className="flex items-start gap-2 text-sm text-gray-600">
                                              <i className="fas fa-building text-xs text-gray-400 w-4 mt-1"></i>
                                              <div className="flex flex-wrap gap-1.5">
                                                <span className="text-gray-500">曾负责:</span>
                                                {agent.building_ids.map((bid, idx) => (
                                                  <span key={idx} className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded-lg text-xs border border-gray-200">
                                                    {buildingLabelMap[bid] || bid}
                                                  </span>
                                                ))}
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>

                      {/* 模态框底部 */}
                      <div className="border-t border-gray-200 bg-gray-50/50 px-6 py-4 flex justify-end">
                        <button
                          onClick={() => setShowDeletedAgentsModal(false)}
                          className="px-6 py-2.5 text-sm font-medium bg-gray-600 hover:bg-gray-700 text-white rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl"
                        >
                          关闭
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 优惠券管理 */}
          {activeTab === 'coupons' && (
            <CouponsPanel apiPrefix={staffPrefix} />
          )}

          {/* 收款码管理 */}
          {activeTab === 'paymentQrs' && (
            <PaymentQrPanel staffPrefix={staffPrefix} />
          )}

          {/* 地址管理 */}
          {activeTab === 'addresses' && (
            <>
              <div className="mb-8">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold bg-gradient-to-r from-gray-900 via-blue-800 to-purple-800 bg-clip-text text-transparent">
                      智能地址管理
                    </h2>
                    <p className="text-sm text-gray-600 mt-2">管理配送地址、楼栋和代理分配，让配送更高效精准</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={loadAddresses} 
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-blue-600 hover:text-blue-700 bg-blue-50/50 hover:bg-blue-100/50 border border-blue-200/50 hover:border-blue-300/50 transition-all duration-300"
                    >
                      <i className="fas fa-sync-alt text-xs"></i>
                      刷新数据
                    </button>
                  </div>
                </div>
                <div className="mt-4 w-20 h-1 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full"></div>
              </div>

              {/* 快速统计卡片 */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <div className="bg-gradient-to-br from-blue-50 to-indigo-100 rounded-2xl p-6 border border-blue-200/50">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
                      <i className="fas fa-map-marker-alt text-white text-lg"></i>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-blue-700">{addresses.length}</div>
                      <div className="text-sm text-blue-600">配送地址</div>
                    </div>
                  </div>
                </div>
                <div className="bg-gradient-to-br from-emerald-50 to-teal-100 rounded-2xl p-6 border border-emerald-200/50">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center">
                      <i className="fas fa-building text-white text-lg"></i>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-emerald-700">
                        {Object.values(buildingsByAddress).reduce((total, buildings) => total + buildings.length, 0)}
                      </div>
                      <div className="text-sm text-emerald-600">配送楼栋</div>
                    </div>
                  </div>
                </div>
                <div className="bg-gradient-to-br from-amber-50 to-orange-100 rounded-2xl p-6 border border-amber-200/50">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl flex items-center justify-center">
                      <i className="fas fa-user-tie text-white text-lg"></i>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-amber-700">{agents.length}</div>
                      <div className="text-sm text-amber-600">在职代理</div>
                    </div>
                  </div>
                </div>
                <div className="bg-gradient-to-br from-purple-50 to-violet-100 rounded-2xl p-6 border border-purple-200/50">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center">
                      <i className="fas fa-users text-white text-lg"></i>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-purple-700">
                        {Object.values(buildingsByAddress).reduce((total, buildings) => 
                          total + buildings.filter(b => {
                            return agents.some(agent => 
                              (agent.buildings || []).some(ab => ab.building_id === b.id)
                            );
                          }).length, 0
                        )}
                      </div>
                      <div className="text-sm text-purple-600">已分配楼栋</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 快速添加地址 */}
              <div className="bg-gradient-to-br from-white via-blue-50/30 to-indigo-50/40 rounded-2xl p-8 shadow-lg border border-blue-200/50 mb-8 hover:shadow-xl transition-all duration-300">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg">
                    <i className="fas fa-plus text-white text-lg"></i>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">快速添加配送地址</h3>
                    <p className="text-xs text-gray-500 mt-0.5">输入园区名称后，您可以为其添加具体楼栋</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex-1">
                    <label className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                      <i className="fas fa-map-marked-alt text-gray-400 text-xs"></i>
                      地址名称
                      <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={newAddrName}
                      onChange={(e) => setNewAddrName(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' && newAddrName.trim() && !addrSubmitting) {
                          handleAddAddress();
                        }
                      }}
                      placeholder="例如：东校区、西校区、南园等"
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 text-sm"
                    />
                    <p className="text-xs text-gray-500 mt-2 flex items-center gap-1.5">
                      <i className="fas fa-info-circle"></i>
                      按 Enter 键快速添加
                    </p>
                  </div>
                  <div className="flex-shrink-0" style={{ paddingTop: '28px' }}>
                    <button
                      onClick={handleAddAddress}
                      disabled={addrSubmitting || !newAddrName.trim()}
                      className="h-[46px] px-6 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl font-semibold hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl flex items-center justify-center gap-2 whitespace-nowrap"
                    >
                      {addrSubmitting ? (
                        <>
                          <i className="fas fa-spinner animate-spin"></i>
                          添加中...
                        </>
                      ) : (
                        <>
                          <i className="fas fa-plus"></i>
                          添加
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* 地址列表 */}
              {addrLoading ? (
                <div className="flex items-center justify-center py-24">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-6"></div>
                    <p className="text-lg font-medium text-gray-700">正在加载地址信息...</p>
                    <p className="text-sm text-gray-500 mt-2">请稍候</p>
                  </div>
                </div>
              ) : addresses.length === 0 ? (
                <div className="text-center py-24">
                  <div className="w-24 h-24 bg-gradient-to-br from-blue-100 to-indigo-200 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg">
                    <i className="fas fa-map-marker-alt text-blue-400 text-3xl"></i>
                  </div>
                  <h3 className="text-xl font-bold text-gray-700 mb-3">暂无配送地址</h3>
                  <p className="text-gray-500 mb-2">请在上方添加第一个配送地址开始管理</p>
                  <p className="text-sm text-gray-400 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 inline-block mt-4">
                    <i className="fas fa-lightbulb text-amber-500 mr-2"></i>
                    提示：用户只能看到有具体楼栋的园区地址
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {addresses.map((addr, index) => {
                    const buildings = buildingsByAddress[addr.id] || [];
                    const totalBuildings = buildings.length;
                    const assignedBuildings = buildings.filter(b => 
                      agents.some(agent => 
                        (agent.buildings || []).some(ab => ab.building_id === b.id)
                      )
                    ).length;
                    
                    return (
                      <div 
                        key={addr.id} 
                        className="bg-white rounded-2xl shadow-sm border border-gray-200/50 overflow-hidden hover:shadow-md transition-all duration-300 group h-fit"
                        draggable
                        onDragStart={() => onAddressDragStart(addr.id)}
                        onDragOver={(e) => onAddressDragOver(e, addr.id)}
                        onDragEnd={onAddressDragEnd}
                      >
                        {/* 地址头部 */}
                        <div className={`p-4 bg-gradient-to-r ${
                          index % 4 === 0 ? 'from-blue-500 to-blue-600' :
                          index % 4 === 1 ? 'from-emerald-500 to-emerald-600' :
                          index % 4 === 2 ? 'from-amber-500 to-amber-600' :
                          'from-purple-500 to-purple-600'
                        }`}>
                          <div className="flex items-center justify-between text-white">
                            <div className="flex items-center gap-3">
                              <div className="w-2 h-6 bg-white/30 rounded-full cursor-move opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                <div className="w-full h-full flex items-center justify-center">
                                  <i className="fas fa-grip-vertical text-white/70 text-xs"></i>
                                </div>
                              </div>
                              <div>
                                <input
                                  type="text"
                                  defaultValue={addr.name}
                                  onBlur={(e) => {
                                    const val = e.target.value.trim();
                                    if (val && val !== addr.name) {
                                      handleUpdateAddress(addr, { name: val });
                                    }
                                  }}
                                  className="bg-transparent border-none text-lg font-bold text-white placeholder-white/70 focus:outline-none focus:ring-2 focus:ring-white/30 rounded-lg px-2 py-1 w-full"
                                />
                                <div className="flex items-center gap-3 mt-1">
                                  <span className="text-white/90 text-xs">
                                    {totalBuildings} 楼栋
                                  </span>
                                  <span className="text-white/90 text-xs">
                                    {assignedBuildings} 已分配
                                  </span>
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="checkbox"
                                      defaultChecked={!!addr.enabled}
                                      onChange={(e) => handleUpdateAddress(addr, { enabled: e.target.checked })}
                                      className="h-3 w-3 text-white border-white/30 rounded"
                                    />
                                    <span className="text-white/90 text-xs">启用</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                            <button
                              onClick={() => handleDeleteAddress(addr)}
                              className="p-1.5 hover:bg-white/20 rounded-lg transition-colors duration-200 opacity-0 group-hover:opacity-100"
                              title="删除地址"
                            >
                              <i className="fas fa-trash text-white/80 hover:text-white text-xs"></i>
                            </button>
                          </div>
                        </div>

                        {/* 楼栋列表 */}
                        <div className="p-4">
                          {buildings.length === 0 ? (
                            <div className="text-center py-8">
                              <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                                <i className="fas fa-building text-gray-400 text-xl"></i>
                              </div>
                              <p className="text-gray-600 text-sm font-medium mb-1">该地址下暂无楼栋</p>
                              <p className="text-gray-400 text-xs">请在下方添加具体楼栋信息</p>
                            </div>
                          ) : (
                            <div className="space-y-3 mb-4">
                              {buildings.map((bld) => {
                                const assignedAgent = agents.find(agent => 
                                  (agent.buildings || []).some(ab => ab.building_id === bld.id)
                                );
                                
                                return (
                                  <div
                                    key={bld.id}
                                    className="bg-gray-50 rounded-xl p-3 hover:bg-gray-100/70 transition-all duration-200 group/building"
                                    draggable
                                    onDragStart={() => setBldDragState({ id: bld.id, addressId: addr.id })}
                                    onDragOver={(e) => {
                                      e.preventDefault();
                                      const dragging = bldDragState.id;
                                      if (!dragging || bldDragState.addressId !== addr.id || dragging === bld.id) return;
                                      setBuildingsByAddress(prev => {
                                        const list = prev[addr.id] || [];
                                        const from = list.findIndex(x => x.id === dragging);
                                        const to = list.findIndex(x => x.id === bld.id);
                                        if (from === -1 || to === -1) return prev;
                                        const next = [...list];
                                        const [moved] = next.splice(from, 1);
                                        next.splice(to, 0, moved);
                                        return { ...prev, [addr.id]: next };
                                      });
                                    }}
                                    onDragEnd={async () => {
                                      const dragging = bldDragState.id;
                                      if (!dragging || bldDragState.addressId !== addr.id) return;
                                      setBldDragState({ id: null, addressId: null });
                                      try {
                                        const order = (buildingsByAddress[addr.id] || []).map(x => x.id);
                                        await apiRequest('/admin/buildings/reorder', {
                                          method: 'POST',
                                          body: JSON.stringify({ address_id: addr.id, order })
                                        });
                                      } catch (e) {
                                        alert(e.message || '保存楼栋排序失败');
                                        try {
                                          const r = await apiRequest(`/admin/buildings?address_id=${encodeURIComponent(addr.id)}`);
                                          setBuildingsByAddress(prev => ({ ...prev, [addr.id]: r.data.buildings || [] }));
                                        } catch {}
                                      }
                                    }}
                                  >
                                    <div className="flex items-center gap-2 mb-2">
                                      <div className="w-1 h-4 bg-gray-300 rounded-full opacity-0 group-hover/building:opacity-100 transition-opacity duration-200 cursor-move">
                                        <div className="w-full h-full flex items-center justify-center">
                                          <i className="fas fa-grip-vertical text-gray-400 text-xs"></i>
                                        </div>
                                      </div>
                                      <div className="w-5 h-5 bg-gray-400 rounded flex items-center justify-center">
                                        <i className="fas fa-building text-white text-xs"></i>
                                      </div>
                                      <input
                                        type="text"
                                        defaultValue={bld.name}
                                        onBlur={async (e) => {
                                          const val = e.target.value.trim();
                                          if (val && val !== bld.name) {
                                            try {
                                              await apiRequest(`/admin/buildings/${bld.id}`, { 
                                                method: 'PUT', 
                                                body: JSON.stringify({ name: val }) 
                                              });
                                              setBuildingsByAddress(prev => ({
                                                ...prev,
                                                [addr.id]: (prev[addr.id] || []).map(x => x.id === bld.id ? { ...x, name: val } : x)
                                              }));
                                            } catch (e) {
                                              alert(e.message || '更新失败');
                                            }
                                          }
                                        }}
                                        className="flex-1 font-medium text-gray-900 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 rounded px-1 py-0.5 text-sm"
                                      />
                                      <button
                                        onClick={async () => {
                                          if (!confirm(`确定删除楼栋"${bld.name}"吗？`)) return;
                                          try {
                                            await apiRequest(`/admin/buildings/${bld.id}`, { method: 'DELETE' });
                                            setBuildingsByAddress(prev => ({
                                              ...prev,
                                              [addr.id]: (prev[addr.id] || []).filter(x => x.id !== bld.id)
                                            }));
                                          } catch (er) {
                                            alert(er.message || '删除失败');
                                          }
                                        }}
                                        className="opacity-0 group-hover/building:opacity-100 p-1 hover:bg-red-100 text-red-500 hover:text-red-600 rounded transition-all duration-200"
                                      >
                                        <i className="fas fa-trash text-xs"></i>
                                      </button>
                                    </div>
                                    
                                    {/* 代理分配信息和启用状态 */}
                                    <div className="flex items-center gap-2">
                                      {/* 代理分配状态 */}
                                      <div className="flex-1">
                                        {assignedAgent ? (
                                          <div className="flex items-center gap-2 px-2 py-1 bg-emerald-50 border border-emerald-200 rounded-lg">
                                            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>
                                            <span className="text-xs font-medium text-emerald-700 truncate flex-1">
                                              {assignedAgent.name || assignedAgent.id}
                                            </span>
                                            <span className="text-xs text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded">
                                              负责中
                                            </span>
                                          </div>
                                        ) : (
                                          <div className="flex items-center gap-2 px-2 py-1 bg-amber-50 border border-amber-200 rounded-lg">
                                            <div className="w-1.5 h-1.5 bg-amber-500 rounded-full"></div>
                                            <span className="text-xs font-medium text-amber-700">未分配代理</span>
                                            <span className="text-xs text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded ml-auto">
                                              待分配
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                      
                                      {/* 启用状态 - 移到右边 */}
                                      <div className="flex items-center">
                                        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                                          <input
                                            type="checkbox"
                                            defaultChecked={!!bld.enabled}
                                            onChange={async (e) => {
                                              try {
                                                await apiRequest(`/admin/buildings/${bld.id}`, { 
                                                  method: 'PUT', 
                                                  body: JSON.stringify({ enabled: e.target.checked }) 
                                                });
                                                setBuildingsByAddress(prev => ({
                                                  ...prev,
                                                  [addr.id]: (prev[addr.id] || []).map(x => x.id === bld.id ? { ...x, enabled: e.target.checked ? 1 : 0 } : x)
                                                }));
                                              } catch (er) {
                                                alert(er.message || '更新失败');
                                              }
                                            }}
                                            className="h-3 w-3 text-blue-600 border-gray-300 rounded"
                                          />
                                          <span>启用</span>
                                        </label>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* 添加楼栋 */}
                          <div className="flex items-center gap-2 p-3 bg-gray-50/70 border-2 border-dashed border-gray-300 rounded-xl hover:bg-gray-50 hover:border-gray-400 transition-all duration-200">
                            <div className="w-5 h-5 bg-gray-300 rounded flex items-center justify-center">
                              <i className="fas fa-plus text-white text-xs"></i>
                            </div>
                            <input
                              type="text"
                              placeholder="添加楼栋..."
                              value={newBldNameMap[addr.id] || ''}
                              onChange={(e) => setNewBldNameMap(prev => ({ ...prev, [addr.id]: e.target.value }))}
                              className="flex-1 bg-transparent border-none focus:outline-none text-gray-700 placeholder-gray-500 text-sm"
                            />
                            <button
                              onClick={() => handleAddBuilding(addr.id)}
                              disabled={addrSubmitting || !(newBldNameMap[addr.id] || '').trim()}
                              className="px-3 py-1 bg-blue-500 text-white rounded-lg text-xs font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                            >
                              添加
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* 抽奖配置 */}
          {activeTab === 'lottery' && (
            <>
              <div className="mb-6">
                <h2 className="text-lg font-medium text-gray-900">抽奖配置</h2>
                <p className="text-sm text-gray-600 mt-1">点击名称或权重即可编辑，修改后自动保存。</p>
              </div>
              <LotteryConfigPanel 
                apiPrefix={staffPrefix} 
                onWarningChange={setLotteryHasStockWarning}
              />
            </>
          )}

          {activeTab === 'autoGifts' && (
            <>
              <div className="mb-6">
                <h2 className="text-lg font-medium text-gray-900">配送费设置</h2>
                <p className="text-sm text-gray-600 mt-1">设置基础配送费和免配送费门槛。</p>                                                      
              </div>
              <DeliverySettingsPanel apiPrefix={staffPrefix} />
              
              <div className="mb-6 mt-8">
                <h2 className="text-lg font-medium text-gray-900">满额门槛</h2>
                <p className="text-sm text-gray-600 mt-1">设置多个满额门槛，可以选择发放商品或优惠券。</p>                                                      
              </div>
              <GiftThresholdPanel 
                apiPrefix={staffPrefix} 
                onWarningChange={setGiftThresholdHasStockWarning}
              />
            </>
          )}
        </main>

        {/* 商品表单弹窗（添加或编辑） */}
        <Modal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          title="添加商品"
          size="large"
        >
          <ProductForm
            onSubmit={handleAddProduct}
            isLoading={isSubmitting}
            onCancel={() => setShowAddModal(false)}
            apiPrefix={staffPrefix}
            isAdmin={isAdmin}
            onStatsRefresh={refreshStats}
          />
        </Modal>

        <Modal
          isOpen={showEditModal}
          onClose={() => {
            // 点击关闭不应用变更，直接关闭
            setShowEditModal(false);
            setEditingProduct(null);
          }}
          title="编辑"
          size="large"
        >
          {editingProduct && (
            <ProductForm
              product={editingProduct}
              onSubmit={handleEditProduct}
              isLoading={isSubmitting}
              onCancel={() => {
                // 点击取消不应用变更，直接关闭
                setShowEditModal(false);
                setEditingProduct(null);
              }}
              onRefreshProduct={refreshSingleProduct}
              apiPrefix={staffPrefix}
              isAdmin={isAdmin}
              onStatsRefresh={refreshStats}
            />
          )}
        </Modal>

        {variantStockProduct && (
          <VariantStockModal
            product={variantStockProduct}
            onClose={() => setVariantStockProduct(null)}
            apiPrefix={staffPrefix}
            onProductVariantsSync={handleProductVariantsSync}
            onStatsRefresh={refreshStats}
          />
        )}

        <Toast message={toast.message} show={toast.visible} onClose={hideToast} />
      </div>
    </>
  );
}

export function StaffPortal(props) {
  return <StaffPortalPage {...props} />;
}

export default function AdminPage() {
  return (
    <StaffPortalPage
      role="admin"
      navActive="staff-backend"
      initialTab="products"
    />
  );
}
