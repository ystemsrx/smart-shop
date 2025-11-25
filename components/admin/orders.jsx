import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { formatReservationCutoff } from './helpers';

// 统一状态映射（显示）
export const UNIFIED_STATUS_MAP = {
  '未付款': { text: '未付款', color: 'slate', bg: 'bg-slate-100', textCol: 'text-slate-700', ring: 'ring-slate-200', hoverBg: 'hover:bg-slate-200' },
  '待确认': { text: '待确认', color: 'amber', bg: 'bg-amber-100', textCol: 'text-amber-700', ring: 'ring-amber-200', hoverBg: 'hover:bg-amber-200' },
  '待配送': { text: '待配送', color: 'blue', bg: 'bg-blue-100', textCol: 'text-blue-700', ring: 'ring-blue-200', hoverBg: 'hover:bg-blue-200' },
  '配送中': { text: '配送中', color: 'purple', bg: 'bg-purple-100', textCol: 'text-purple-700', ring: 'ring-purple-200', hoverBg: 'hover:bg-purple-200' },
  '已完成': { text: '已完成', color: 'emerald', bg: 'bg-emerald-100', textCol: 'text-emerald-700', ring: 'ring-emerald-200', hoverBg: 'hover:bg-emerald-200' }
};

export const UNIFIED_STATUS_ORDER = ['未付款', '待确认', '待配送', '配送中', '已完成'];

// 将后端的 status/payment_status 映射为统一状态
export const getUnifiedStatus = (order) => {
  const ps = order?.payment_status;
  const st = order?.status;
  if (!ps && !st) return '未付款';
  if (ps === 'processing') return '待确认';
  if (ps !== 'succeeded') return '未付款';
  if (st === 'shipped') return '配送中';
  if (st === 'delivered') return '已完成';
  return '待配送';
};

export const collapseAutoGiftItemsForDisplay = (items = []) => {
  if (!Array.isArray(items)) return [];
  const grouped = [];
  const indexLookup = new Map();

  items.forEach((item) => {
    if (!item || typeof item !== 'object') return;
    const baseQuantity = Number.parseInt(item.quantity, 10);
    const quantity = Number.isFinite(baseQuantity) && baseQuantity > 0 ? baseQuantity : 1;
    if (item.is_auto_gift && item.product_id) {
      const variantKey = item.variant_id || 'base';
      const groupKey = `${item.product_id}__${variantKey}`;
      if (indexLookup.has(groupKey)) {
        const idx = indexLookup.get(groupKey);
        const existing = grouped[idx];
        const existingQty = Number(existing.quantity) || 0;
        const existingSubtotal = Number(existing.subtotal) || 0;
        grouped[idx] = {
          ...existing,
          quantity: existingQty + quantity,
          subtotal: existingSubtotal + (Number(item.subtotal) || 0)
        };
      } else {
        const clone = { ...item };
        clone.quantity = quantity;
        clone.subtotal = Number(item.subtotal) || 0;
        grouped.push(clone);
        indexLookup.set(groupKey, grouped.length - 1);
      }
      return;
    }

    const clone = { ...item };
    clone.quantity = quantity;
    clone.subtotal = Number(item.subtotal) || 0;
    grouped.push(clone);
  });

  return grouped;
};

// 状态选择气泡组件
const StatusSelectPopover = ({ currentStatus, onSelect, disabled }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState({});
  const [animateState, setAnimateState] = useState('closed'); // closed, opening, open
  const buttonRef = useRef(null);
  const popoverRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        popoverRef.current && 
        !popoverRef.current.contains(event.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };
    
    const handleScroll = () => {
      if (isOpen) setIsOpen(false);
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('scroll', handleScroll, true);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isOpen]);

  const handleToggle = (e) => {
    if (disabled) return;
    e.stopPropagation();
    
    if (!isOpen) {
      const rect = buttonRef.current.getBoundingClientRect();
      const popoverHeight = 180; // Estimated height
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      
      let top, left = rect.left;
      let transformOrigin = 'top left';
      
      // Auto placement
      if (spaceBelow < popoverHeight && spaceAbove > spaceBelow) {
        // Place above
        top = rect.top - 8;
        transformOrigin = 'bottom left';
        setPopoverStyle({
          position: 'fixed',
          top: 'auto',
          bottom: `${window.innerHeight - rect.top + 8}px`,
          left: `${left}px`,
          transformOrigin
        });
      } else {
        // Place below
        top = rect.bottom + 8;
        setPopoverStyle({
          position: 'fixed',
          top: `${top}px`,
          left: `${left}px`,
          transformOrigin
        });
      }
      setAnimateState('opening');
      setIsOpen(true);
      // Small delay to trigger animation class
      setTimeout(() => setAnimateState('open'), 10);
    } else {
      setIsOpen(false);
      setAnimateState('closed');
    }
  };

  const currentStatusInfo = UNIFIED_STATUS_MAP[currentStatus] || UNIFIED_STATUS_MAP['未付款'];

  return (
    <>
      <button
        ref={buttonRef}
        onClick={handleToggle}
        className={`px-3 py-1 inline-flex items-center gap-1.5 text-xs font-semibold rounded-full transition-all duration-200 ${currentStatusInfo.bg} ${currentStatusInfo.textCol} hover:opacity-80 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <span className={`w-1.5 h-1.5 rounded-full bg-current opacity-60`}></span>
        {currentStatusInfo.text}
        {!disabled && <i className={`fas fa-chevron-down text-[10px] opacity-50 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}></i>}
      </button>

      {isOpen && createPortal(
        <div 
          ref={popoverRef}
          style={{ ...popoverStyle, zIndex: 9999 }}
          className={`w-48 bg-white rounded-2xl shadow-xl border border-gray-100 p-2 transition-all duration-300 cubic-bezier(0.34, 1.56, 0.64, 1) ${
            animateState === 'open' ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-90 translate-y-2'
          }`}
        >
          <div className="grid grid-cols-2 gap-2">
            {UNIFIED_STATUS_ORDER.map((status) => {
              const info = UNIFIED_STATUS_MAP[status];
              const isSelected = currentStatus === status;
              return (
                <button
                  key={status}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(status);
                    setIsOpen(false);
                  }}
                  className={`flex flex-col items-center justify-center p-2 rounded-xl text-xs transition-all duration-200 border ${
                    isSelected 
                      ? `${info.bg} ${info.textCol} ring-2 ring-inset ${info.ring} border-transparent font-bold shadow-sm` 
                      : `${info.bg} ${info.textCol} border-transparent opacity-70 hover:opacity-100 hover:scale-105`
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full mb-1 bg-current opacity-60`}></span>
                  {status}
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export const OrderDetailsModal = ({ open, onClose, order, renderStatusBadge, formatDate, getUnifiedStatusFn, agentLabel }) => {
  const [isVisible, setIsVisible] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      requestAnimationFrame(() => setIsVisible(true));
    } else {
      setIsVisible(false);
    }
  }, [open]);

  if (!open && !isVisible) return null;

  const items = collapseAutoGiftItemsForDisplay(order?.items || []);
  const status = order && typeof getUnifiedStatusFn === 'function' ? getUnifiedStatusFn(order) : '';
  const statusBadge = status && typeof renderStatusBadge === 'function' ? renderStatusBadge(status) : null;
  const createdAtDisplay = order && typeof formatDate === 'function'
    ? formatDate(order.created_at_timestamp ?? order.created_at)
    : '';
  const paymentMethod = order?.payment_method === 'wechat'
    ? '微信支付'
    : (order?.payment_method || '未知');
  const discountAmount = Number(order?.discount_amount ?? 0);
  const totalAmount = Number(order?.total_amount ?? 0);
  const couponAmount = Number(order?.coupon_amount ?? 0);
  const resolvedAgentLabel = agentLabel || order?.agent_id || '未分配';

  const reservationFlag = order?.shipping_info?.reservation;
  const reservationReasons = Array.isArray(order?.shipping_info?.reservation_reasons)
    ? order.shipping_info.reservation_reasons.filter(Boolean)
    : [];

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center transition-all duration-300 ${isVisible ? 'bg-black/40 backdrop-blur-md' : 'bg-black/0'}`}>
      <div className="absolute inset-0" onClick={onClose}></div>
      <div className={`relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col overflow-hidden transform transition-all duration-300 ${isVisible ? 'scale-100 opacity-100 translate-y-0' : 'scale-95 opacity-0 translate-y-4'}`}>
        
        {/* Header */}
        <div className="px-8 py-5 border-b border-gray-100 flex justify-between items-start bg-white z-10">
          <div>
            <h3 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
              订单详情
              <span className="text-sm font-normal text-gray-400 font-mono bg-gray-50 px-2 py-1 rounded-md border border-gray-100">#{order?.id || '-'}</span>
            </h3>
            <div className="flex items-center gap-4 mt-2">
              {statusBadge}
              {createdAtDisplay && (
                <span className="text-sm text-gray-500 flex items-center gap-1.5">
                  <i className="far fa-clock text-gray-400"></i>
                  {createdAtDisplay}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-50 hover:bg-gray-100 flex items-center justify-center text-gray-500 transition-colors"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-gray-50/50">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Left Column: Products */}
            <div className="lg:col-span-2 flex flex-col gap-6">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-50 flex justify-between items-center bg-white">
                  <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                    <i className="fas fa-box-open text-blue-500"></i>
                    商品清单
                  </h4>
                  <span className="text-xs font-medium bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full">
                    共 {items.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0)} 件
                  </span>
                </div>
                
                {items.length === 0 ? (
                  <div className="p-8 text-center text-gray-400 text-sm">暂无商品记录</div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {items
                      .sort((a, b) => {
                        const aIsNonSellable = Boolean(a.is_not_for_sale);
                        const bIsNonSellable = Boolean(b.is_not_for_sale);
                        if (aIsNonSellable && !bIsNonSellable) return 1;
                        if (!aIsNonSellable && bIsNonSellable) return -1;
                        return 0;
                      })
                      .map((it, idx) => (
                      <div key={`${it.product_id || 'item'}_${idx}`} className="px-6 py-4 hover:bg-gray-50/50 transition-colors group">
                        <div className="flex justify-between items-start gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="text-gray-900 font-medium text-base mb-1.5 flex flex-wrap items-center gap-2">
                              {it.name}
                              {it.variant_name && (
                                <span className="px-2 py-0.5 text-xs rounded-md bg-gray-100 text-gray-600 border border-gray-200 font-normal">
                                  {it.variant_name}
                                </span>
                              )}
                              {it.is_lottery && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-pink-50 text-pink-600 border border-pink-100 font-normal">
                                  <i className="fas fa-trophy text-[10px]"></i> 抽奖
                                </span>
                              )}
                              {it.is_auto_gift && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100 font-normal">
                                  <i className="fas fa-gift text-[10px]"></i> 赠品
                                </span>
                              )}
                              {it.is_reservation && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-blue-50 text-blue-600 border border-blue-100 font-normal">
                                  <i className="fas fa-calendar-check text-[10px]"></i> 预约
                                </span>
                              )}
                              {it.is_not_for_sale && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-purple-50 text-purple-600 border border-purple-100 font-normal">
                                  <i className="fas fa-ban text-[10px]"></i> 非卖
                                </span>
                              )}
                            </div>

                            <div className="text-sm text-gray-500 flex items-center gap-3">
                              <span className="bg-gray-100 px-2 py-0.5 rounded text-gray-600 text-xs">x{Number(it.quantity) || 0}</span>
                              <span>单价 ¥{Number(it.unit_price || 0).toFixed(2)}</span>
                            </div>

                            {it.is_reservation && (
                              <div className="mt-2 text-xs text-blue-600 bg-blue-50/50 p-2 rounded-lg border border-blue-100/50">
                                <i className="fas fa-info-circle mr-1.5"></i>
                                {formatReservationCutoff(it.reservation_cutoff)}
                                {it.reservation_note ? ` · ${it.reservation_note}` : ''}
                              </div>
                            )}

                            {(it.is_lottery || it.is_auto_gift) && (
                              <div className="mt-1.5 text-xs text-gray-500">
                                <span className="text-pink-500 mr-1">
                                  {it.is_lottery ? '抽奖赠' : '满额赠'}:
                                </span>
                                {(it.is_lottery ? (it.lottery_product_name || it.name) : (it.auto_gift_product_name || it.name)) || '-'}
                                {(it.is_lottery ? it.lottery_variant_name : it.auto_gift_variant_name) ? `（${it.is_lottery ? it.lottery_variant_name : it.auto_gift_variant_name}）` : ''}
                              </div>
                            )}
                          </div>
                          
                          <div className="text-right">
                            <div className="text-gray-900 font-semibold text-base">¥{Number(it.subtotal || 0).toFixed(2)}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Info */}
            <div className="flex flex-col gap-6">
              
              {/* Shipping Info */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-50 bg-white">
                  <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                    <i className="fas fa-map-marker-alt text-red-500"></i>
                    收货信息
                  </h4>
                </div>
                <div className="p-5">
                  <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-4 text-sm">
                    <span className="text-gray-400 text-xs self-center">联系人</span>
                    <div className="font-medium text-gray-900 flex items-center gap-2">
                      {order?.shipping_info?.name || '—'}
                      <span className="text-gray-300">|</span>
                      {order?.shipping_info?.phone || '—'}
                    </div>

                    <span className="text-gray-400 text-xs mt-0.5">地址</span>
                    <div className="text-gray-700 leading-relaxed">
                      {order?.shipping_info?.dormitory && order?.shipping_info?.building && order?.shipping_info?.room
                        ? `${order.shipping_info.dormitory} · ${order.shipping_info.building} ${order.shipping_info.room}`
                        : (order?.shipping_info?.full_address || '—')}
                    </div>

                    <span className="text-gray-400 text-xs self-center">用户ID</span>
                    <div className="font-mono text-gray-500">{order?.student_id || '—'}</div>
                  </div>

                  {order?.note && (
                    <div className="mt-4 bg-amber-50 p-3 rounded-lg border border-amber-100 text-amber-800 text-xs leading-relaxed">
                      <span className="font-bold block mb-1">备注:</span>
                      {order.note}
                    </div>
                  )}
                  {reservationFlag && (
                    <div className="mt-3 bg-blue-50 p-3 rounded-lg border border-blue-100 text-blue-800 text-xs leading-relaxed">
                      <div className="flex items-center gap-1.5 font-bold mb-1">
                        <i className="fas fa-calendar-day"></i>
                        预约信息
                      </div>
                      {reservationReasons.length > 0 ? reservationReasons.join('，') : '预约订单'}
                      {order?.shipping_info?.reservation_closure_note ? ` · ${order.shipping_info.reservation_closure_note}` : ''}
                    </div>
                  )}
                </div>
              </div>

              {/* Order Summary */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-50 bg-white">
                  <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                    <i className="fas fa-file-invoice-dollar text-emerald-500"></i>
                    订单概览
                  </h4>
                </div>
                <div className="p-5 space-y-3 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">所属代理</span>
                    <span className="font-medium text-gray-900 bg-gray-100 px-2 py-0.5 rounded text-xs">{resolvedAgentLabel}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">支付方式</span>
                    <span className="font-medium text-gray-900">{paymentMethod}</span>
                  </div>
                  <div className="h-px bg-gray-100 my-2"></div>
                  {discountAmount > 0 && (
                    <div className="flex justify-between items-center text-pink-600">
                      <span>优惠抵扣</span>
                      <span>-¥{discountAmount.toFixed(2)}</span>
                    </div>
                  )}
                  {couponAmount > 0 && (
                    <div className="flex justify-between items-center text-indigo-600">
                      <span>赠送优惠券</span>
                      <span>{couponAmount.toFixed(2)} 元</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center pt-1">
                    <span className="text-gray-900 font-medium">实付金额</span>
                    <span className="text-xl font-bold text-gray-900">¥{totalAmount.toFixed(2)}</span>
                  </div>
                  {order?.gift_threshold_amount && (
                    <div className="mt-2 text-xs text-center text-gray-400 bg-gray-50 py-1.5 rounded">
                      已触发满 ¥{Number(order.gift_threshold_amount).toFixed(0)} 赠品门槛
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// 订单表格组件
export const OrderTable = ({
  orders,
  onUpdateUnifiedStatus,
  isLoading,
  selectedOrders = [],
  onSelectOrder,
  onSelectAllOrders,
  onBatchDeleteOrders,
  onRefresh,
  searchValue,
  onSearchChange,
  page = 0,
  hasMore = false,
  onPrevPage,
  onNextPage,
  agentNameMap = {},
  showAgentInfo = false
}) => {
  const [viewingOrder, setViewingOrder] = React.useState(null);
  
  const getStatusBadge = (status) => {
    const statusInfo = UNIFIED_STATUS_MAP[status] || { text: status, color: 'gray' };
    const colorClasses = {
      amber: 'bg-amber-50 text-amber-700 border-amber-200',
      blue: 'bg-blue-50 text-blue-700 border-blue-200',
      indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      purple: 'bg-purple-50 text-purple-700 border-purple-200',
      emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      red: 'bg-red-50 text-red-700 border-red-200',
      gray: 'bg-gray-50 text-gray-700 border-gray-200',
      slate: 'bg-slate-50 text-slate-700 border-slate-200'
    };
    
    return (
      <span className={`px-2.5 py-0.5 inline-flex text-xs font-medium rounded-full border ${colorClasses[statusInfo.color] || colorClasses.gray}`}>
        {statusInfo.text}
      </span>
    );
  };

  const formatDate = (val) => {
    if (typeof val === 'number' && isFinite(val)) {
      return new Date(val * 1000).toLocaleString('zh-CN', { hour12: false });
    }
    const t = Date.parse(val);
    return isNaN(t) ? '' : new Date(t).toLocaleString('zh-CN', { hour12: false });
  };

  const allIds = orders.map(o => o.id);
  const isAllSelected = allIds.length > 0 && allIds.every(id => selectedOrders.includes(id));

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200/60 overflow-hidden flex flex-col">
      {/* Toolbar */}
      <div className="px-6 py-4 border-b border-gray-100 flex flex-wrap justify-between items-center gap-4 bg-white">
        <div className="flex items-center gap-4">
          <h3 className="text-lg font-bold text-gray-900">订单列表</h3>
          {selectedOrders.length > 0 && (
            <div className="flex items-center gap-3 bg-red-50 px-3 py-1 rounded-lg border border-red-100 animate-fadeIn">
              <span className="text-xs font-medium text-red-600">已选 {selectedOrders.length} 项</span>
              <button
                onClick={() => onBatchDeleteOrders(selectedOrders)}
                className="text-xs bg-white text-red-600 px-2 py-0.5 rounded border border-red-200 hover:bg-red-50 transition-colors font-medium"
              >
                删除
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="relative group">
            <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs group-focus-within:text-blue-500 transition-colors"></i>
            <input
              type="text"
              placeholder="搜索订单号、姓名、手机..."
              value={searchValue}
              onChange={(e) => onSearchChange && onSearchChange(e.target.value)}
              className="pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-gray-50 focus:bg-white"
            />
          </div>
          <button 
            onClick={onRefresh} 
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-900 border border-gray-200 transition-all active:scale-95"
            title="刷新列表"
          >
            <i className="fas fa-sync-alt text-sm"></i>
          </button>
        </div>
      </div>
      
      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-100">
          <thead>
            <tr className="bg-gray-50/50">
              <th className="px-6 py-4 text-left w-12">
                <input
                  type="checkbox"
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  checked={isAllSelected}
                  onChange={(e) => onSelectAllOrders(e.target.checked, allIds)}
                />
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">订单信息</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">客户</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">商品</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">金额</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">状态</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">时间</th>
              <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider"></th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {orders.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center">
                  <div className="flex flex-col items-center justify-center text-gray-400">
                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                      <i className="fas fa-inbox text-2xl text-gray-300"></i>
                    </div>
                    <p className="text-sm">暂无订单数据</p>
                  </div>
                </td>
              </tr>
            ) : (
              orders.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50/80 transition-colors group">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <input
                      type="checkbox"
                      className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      checked={selectedOrders.includes(order.id)}
                      onChange={(e) => onSelectOrder(order.id, e.target.checked)}
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-medium text-gray-900 font-mono">{order.id}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                          {order.payment_method === 'wechat' ? '微信' : order.payment_method}
                        </span>
                        {showAgentInfo && (
                          <span className="text-xs text-gray-400" title="代理">
                            <i className="fas fa-user-tie mr-1"></i>
                            {agentNameMap?.[order.agent_id] || (order.agent_id ? order.agent_id : '未分配')}
                          </span>
                        )}
                      </div>
                      {Boolean(order.is_reservation) && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 bg-blue-50 rounded border border-blue-100 w-fit mt-1">
                          <i className="fas fa-calendar-check"></i> 预约
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col">
                      <span className="text-sm text-gray-900 font-medium">{order.shipping_info?.name || order.customer_name || '未知'}</span>
                      <span className="text-xs text-gray-500 mt-0.5">{order.shipping_info?.phone}</span>
                      <span className="text-xs text-gray-400 mt-0.5 truncate max-w-[150px]" title={order.shipping_info?.full_address}>
                        {order.shipping_info?.full_address}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-gray-600 bg-gray-50 px-2 py-1 rounded-md border border-gray-100">
                      {(order.items || []).reduce((sum, it) => sum + (parseInt(it.quantity) || 0), 0)} 件
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-gray-900">¥{Number(order.total_amount).toFixed(2)}</span>
                      {order.discount_amount > 0 && (
                        <span className="text-xs text-pink-500">-¥{Number(order.discount_amount).toFixed(2)}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <StatusSelectPopover 
                      currentStatus={getUnifiedStatus(order)}
                      onSelect={(newStatus) => onUpdateUnifiedStatus(order, newStatus)}
                      disabled={isLoading}
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col text-xs text-gray-500">
                      <span>{formatDate(order.created_at_timestamp ?? order.created_at).split(' ')[0]}</span>
                      <span className="text-gray-400">{formatDate(order.created_at_timestamp ?? order.created_at).split(' ')[1]}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <button
                      onClick={() => setViewingOrder(order)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-gray-900 hover:border-gray-300 transition-all shadow-sm active:scale-95"
                    >
                      <i className="fas fa-eye text-gray-400"></i>
                      查看
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/30">
        <span className="text-xs text-gray-500">
          第 <span className="font-medium text-gray-900">{Math.floor((page || 0) + 1)}</span> 页
        </span>
        <div className="flex items-center gap-2">
          <button 
            onClick={onPrevPage} 
            disabled={!(page > 0)} 
            className="px-3 py-1.5 text-xs font-medium bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            上一页
          </button>
          <button 
            onClick={onNextPage} 
            disabled={!hasMore} 
            className="px-3 py-1.5 text-xs font-medium bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            下一页
          </button>
        </div>
      </div>

      <OrderDetailsModal
        open={!!viewingOrder}
        onClose={() => setViewingOrder(null)}
        order={viewingOrder}
        renderStatusBadge={getStatusBadge}
        formatDate={formatDate}
        getUnifiedStatusFn={getUnifiedStatus}
        agentLabel={viewingOrder ? (agentNameMap?.[viewingOrder.agent_id] || viewingOrder.agent_id || '未分配') : '未分配'}
      />
    </div>
  );
};

// 订单管理面板
export const OrdersPanel = ({
  isAdmin,
  orderAgentFilter,
  orderAgentOptions,
  orderAgentFilterLabel,
  orderLoading,
  orders,
  orderStatusFilter,
  onOrderStatusFilterChange,
  orderExporting,
  onExportOrders,
  orderStats,
  onOrderAgentFilterChange,
  selectedOrders,
  onSelectOrder,
  onSelectAllOrders,
  onBatchDeleteOrders,
  onRefreshOrders,
  orderSearch,
  onOrderSearchChange,
  orderPage,
  orderHasMore,
  onPrevPage,
  onNextPage,
  agentNameMap,
  isSubmitting,
  currentUserLabel,
  onUpdateUnifiedStatus
}) => (
  <div className="space-y-6">
    {/* Header Section */}
    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight">订单管理</h2>
        <p className="text-sm text-gray-500 mt-1">查看和管理所有用户订单，处理发货与售后</p>
      </div>
      
      {isAdmin && (
        <div className="flex items-center gap-3 bg-white p-1.5 rounded-xl border border-gray-200 shadow-sm">
          <span className="text-xs font-medium text-gray-500 pl-2">查看范围</span>
          <select
            className="text-sm border-none bg-gray-50 rounded-lg px-3 py-1.5 text-gray-700 focus:ring-0 cursor-pointer hover:bg-gray-100 transition-colors"
            value={orderAgentFilter}
            onChange={(e) => onOrderAgentFilterChange(e.target.value)}
            disabled={orderLoading}
          >
            <option value="self">我的订单（{currentUserLabel || '当前账号'}）</option>
            <option value="all">全部订单</option>
            {orderAgentOptions.map(agent => (
              <option key={agent.id} value={agent.id}>
                {agent.name}{(!agent.isActive && !agent.isDeleted) ? '（停用）' : ''}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>

    {/* Stats Cards */}
    {(() => {
      const counts = orders.reduce((acc, o) => {
        const k = getUnifiedStatus(o);
        acc[k] = (acc[k] || 0) + 1;
        return acc;
      }, {});
      const hasAny = Object.keys(counts).length > 0;
      return hasAny ? (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {UNIFIED_STATUS_ORDER.map((status) => {
             const count = counts[status] || 0;
             const colorMap = {
               '未付款': 'text-slate-600 bg-slate-50 border-slate-100',
               '待确认': 'text-amber-600 bg-amber-50 border-amber-100',
               '待配送': 'text-blue-600 bg-blue-50 border-blue-100',
               '配送中': 'text-purple-600 bg-purple-50 border-purple-100',
               '已完成': 'text-emerald-600 bg-emerald-50 border-emerald-100',
             };
             const styleClass = colorMap[status] || 'text-gray-600 bg-gray-50 border-gray-100';
             
             return (
              <div key={status} className={`rounded-2xl p-4 border ${styleClass.split(' ')[0] === 'text-slate-600' ? 'bg-slate-50 border-slate-100' : styleClass.split(' ')[1] + ' ' + styleClass.split(' ')[2]} flex flex-col items-center justify-center transition-transform hover:scale-[1.02] cursor-default`}>
                <div className={`text-2xl font-bold ${styleClass.split(' ')[0]}`}>{count}</div>
                <div className="text-xs font-medium text-gray-500 mt-1">{status}</div>
              </div>
            );
          })}
        </div>
      ) : null;
    })()}

    {isSubmitting ? (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <div className="animate-pulse space-y-6">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex gap-4">
              <div className="h-10 w-10 bg-gray-100 rounded-full"></div>
              <div className="flex-1 space-y-3 py-1">
                <div className="h-4 bg-gray-100 rounded w-1/4"></div>
                <div className="h-3 bg-gray-100 rounded w-3/4"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    ) : (
      <>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex bg-gray-100/80 p-1 rounded-xl">
            {['全部', ...UNIFIED_STATUS_ORDER].map((label) => (
              <button
                key={label}
                onClick={() => onOrderStatusFilterChange(label)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  orderStatusFilter === label 
                    ? 'bg-white text-gray-900 shadow-sm' 
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={onExportOrders}
            disabled={orderExporting}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium shadow-sm shadow-emerald-200 disabled:opacity-60 disabled:cursor-not-allowed transition-all active:scale-95"
          >
            {orderExporting ? <i className="fas fa-spinner animate-spin"></i> : <i className="fas fa-file-excel"></i>}
            {orderExporting ? '导出中...' : '导出报表'}
          </button>
        </div>

        <OrderTable 
          orders={(orderStatusFilter === '全部' ? orders : orders.filter(o => getUnifiedStatus(o) === orderStatusFilter))}
          onUpdateUnifiedStatus={onUpdateUnifiedStatus}
          isLoading={isSubmitting || orderLoading}
          selectedOrders={selectedOrders}
          onSelectOrder={onSelectOrder}
          onSelectAllOrders={onSelectAllOrders}
          onBatchDeleteOrders={onBatchDeleteOrders}
          onRefresh={onRefreshOrders}
          searchValue={orderSearch}
          onSearchChange={onOrderSearchChange}
          page={orderPage}
          hasMore={orderHasMore}
          onPrevPage={onPrevPage}
          onNextPage={onNextPage}
          agentNameMap={agentNameMap}
          showAgentInfo={isAdmin}
        />
      </>
    )}
  </div>
);

export default OrdersPanel;
