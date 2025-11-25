import React from 'react';
import { formatReservationCutoff } from './helpers';

// 统一状态映射（显示）
export const UNIFIED_STATUS_MAP = {
  '未付款': { text: '未付款', color: 'gray' },
  '待确认': { text: '待确认', color: 'yellow' },
  '待配送': { text: '待配送', color: 'blue' },
  '配送中': { text: '配送中', color: 'purple' },
  '已完成': { text: '已完成', color: 'green' }
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
    <div className={`fixed inset-0 z-50 flex items-center justify-center transition-all duration-300 ${isVisible ? 'bg-black/50 backdrop-blur-sm' : 'bg-black/0'}`}>
      <div className="absolute inset-0" onClick={onClose}></div>
      <div className={`relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl mx-4 max-h-[95vh] flex flex-col overflow-hidden transform transition-all duration-300 ${isVisible ? 'scale-100 opacity-100 translate-y-0' : 'scale-95 opacity-0 translate-y-4'}`}>
        <button
          onClick={onClose}
          className="absolute top-3 right-3 sm:top-4 sm:right-4 z-10 w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-white hover:bg-gray-100 flex items-center justify-center text-gray-600 shadow-lg transition-all hover:scale-110"
        >
          <i className="fas fa-times"></i>
        </button>
        
        <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-indigo-50 via-blue-50 to-purple-50">
          <div className="flex flex-col gap-3">
            <div>
              <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <i className="fas fa-receipt text-indigo-600"></i>
                订单详情
              </h3>
              <p className="text-sm text-gray-600 mt-1 font-mono break-all">订单号：{order?.id || '-'}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {statusBadge}
              {createdAtDisplay && (
                <div className="text-xs text-gray-500">创建时间：{createdAtDisplay}</div>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 pb-12 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:items-start">
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col lg:h-[calc(95vh-260px)]">
              <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2 flex-shrink-0">
                <i className="fas fa-box text-indigo-500"></i>
                <span className="text-sm font-semibold text-gray-900">商品明细</span>
                <span className="text-xs text-gray-500">共 {items.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0)} 件</span>
              </div>
              {items.length === 0 ? (
                <div className="flex-1 flex items-center justify-center px-4 py-6 text-sm text-gray-500">
                  暂无商品记录
                </div>
              ) : (
                <div className="divide-y divide-gray-100 max-h-[400px] lg:max-h-none overflow-y-auto lg:flex-1 lg:min-h-0">
                  {items
                    .sort((a, b) => {
                      const aIsNonSellable = Boolean(a.is_not_for_sale);
                      const bIsNonSellable = Boolean(b.is_not_for_sale);
                      if (aIsNonSellable && !bIsNonSellable) return 1;
                      if (!aIsNonSellable && bIsNonSellable) return -1;
                      return 0;
                    })
                    .map((it, idx) => (
                    <div 
                      key={`${it.product_id || 'item'}_${idx}`} 
                      className="px-4 py-3 text-sm hover:bg-gray-50 transition-colors"
                    >
                        <div className="flex justify-between items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="text-gray-900 font-medium flex items-center gap-2 flex-wrap mb-1">
                              <span title={it.name}>{it.name}</span>
                              {it.is_lottery && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded-full bg-pink-100 text-pink-700 border border-pink-200 flex-shrink-0">
                                  <i className="fas fa-trophy"></i>
                                  <span>抽奖</span>
                                </span>
                              )}
                              {it.is_auto_gift && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded-full bg-green-100 text-green-700 border border-green-200 flex-shrink-0">
                                  <i className="fas fa-gift"></i>
                                  <span>赠品</span>
                                </span>
                              )}
                              {it.variant_name && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded-full bg-gray-100 text-gray-600 flex-shrink-0">
                                  <i className="fas fa-tag"></i>
                                  <span>{it.variant_name}</span>
                                </span>
                              )}
                              {it.is_reservation && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded-full bg-blue-100 text-blue-700 border border-blue-200 flex-shrink-0">
                                  <i className="fas fa-calendar-check"></i>
                                  <span>预约</span>
                                </span>
                              )}
                              {it.is_not_for_sale && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded-full bg-purple-100 text-purple-700 border border-purple-200 flex-shrink-0">
                                  <i className="fas fa-infinity"></i>
                                  <span>非卖</span>
                                </span>
                              )}
                            </div>
                            
                            <div className="text-gray-500 text-xs mt-1">
                              数量 x{Number(it.quantity) || 0} · 单价 ¥{Number(it.unit_price || 0).toFixed(2)}
                            </div>
                            
                            {it.is_reservation && (
                              <div className="text-[11px] text-blue-600 mt-1 leading-snug break-words">
                                <i className="fas fa-info-circle mr-1"></i>
                                {formatReservationCutoff(it.reservation_cutoff)}
                                {it.reservation_note ? ` · ${it.reservation_note}` : ''}
                              </div>
                            )}
                            
                            {(it.is_lottery || it.is_auto_gift) && (
                              <div className="text-xs text-pink-600 mt-1">
                                <i className="fas fa-gift mr-1"></i>
                                <span className="font-medium">
                                  {it.is_lottery ? '抽奖赠' : '满额赠'}：
                                  {(it.is_lottery ? (it.lottery_product_name || it.name) : (it.auto_gift_product_name || it.name)) || '-'}
                                  {(it.is_lottery ? it.lottery_variant_name : it.auto_gift_variant_name) ? `（${it.is_lottery ? it.lottery_variant_name : it.auto_gift_variant_name}）` : ''}
                                </span>
                              </div>
                            )}
                          </div>
                          
                          <div className="text-right flex-shrink-0">
                            <div className="text-gray-900 font-semibold">¥{Number(it.subtotal || 0).toFixed(2)}</div>
                            <div className="text-xs text-gray-500">小计</div>
                          </div>
                        </div>
                      </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-6 lg:h-[calc(95vh-260px)]">
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col lg:flex-shrink-0">
                <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2 flex-shrink-0">
                  <i className="fas fa-user text-indigo-500"></i>
                  <span className="text-sm font-semibold text-gray-900">收货信息</span>
                </div>
                <div className="px-4 py-4 text-sm text-gray-700 space-y-2">
                  <div>用户：{order?.student_id || '—'}</div>
                  <div>昵称：{order?.shipping_info?.name || '—'}</div>
                  <div>电话：{order?.shipping_info?.phone || '—'}</div>
                  <div>地址：{order?.shipping_info?.full_address || '—'}</div>
                  {order?.note && (
                    <div>备注：<span className="text-red-600">{order.note}</span></div>
                  )}
                  {reservationFlag && (
                    <div className="flex items-start gap-2 text-xs text-blue-600">
                      <i className="fas fa-calendar-day mt-0.5"></i>
                      <span className="leading-snug break-words">
                        {reservationReasons.length > 0 ? reservationReasons.join('，') : '预约订单'}
                        {order?.shipping_info?.reservation_closure_note ? ` · ${order.shipping_info.reservation_closure_note}` : ''}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col lg:flex-1 lg:min-h-0">
                <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2 flex-shrink-0">
                  <i className="fas fa-info-circle text-indigo-500"></i>
                  <span className="text-sm font-semibold text-gray-900">订单概览</span>
                </div>
                <div className="px-4 py-4 text-sm text-gray-700 space-y-2">
                  <div className="flex justify-between">
                    <span>所属代理</span>
                    <span>{resolvedAgentLabel}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>支付方式</span>
                    <span>{paymentMethod}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>订单金额</span>
                    <span className="font-medium text-gray-900">¥{totalAmount.toFixed(2)}</span>
                  </div>
                  {discountAmount > 0 && (
                    <div className="flex justify-between text-pink-600">
                      <span>优惠抵扣</span>
                      <span>-¥{discountAmount.toFixed(2)}</span>
                    </div>
                  )}
                  {couponAmount > 0 && (
                    <div className="flex justify-between text-indigo-600">
                      <span>赠送优惠券</span>
                      <span>{couponAmount.toFixed(2)} 元</span>
                    </div>
                  )}
                  {order?.gift_threshold_amount && (
                    <div className="flex justify-between text-sm text-gray-500">
                      <span>触发满额门槛</span>
                      <span>¥{Number(order.gift_threshold_amount).toFixed(2)}</span>
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
      yellow: 'bg-yellow-100 text-yellow-800',
      blue: 'bg-blue-100 text-blue-800',
      purple: 'bg-purple-100 text-purple-800',
      green: 'bg-green-100 text-green-800',
      red: 'bg-red-100 text-red-800',
      gray: 'bg-gray-100 text-gray-800'
    };
    
    return (
      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${colorClasses[statusInfo.color]}`}>
        {statusInfo.text}
      </span>
    );
  };

  const formatDate = (val) => {
    if (typeof val === 'number' && isFinite(val)) {
      return new Date(val * 1000).toLocaleString('zh-CN');
    }
    const t = Date.parse(val);
    return isNaN(t) ? '' : new Date(t).toLocaleString('zh-CN');
  };

  const allIds = orders.map(o => o.id);
  const isAllSelected = allIds.length > 0 && allIds.every(id => selectedOrders.includes(id));

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
        <h3 className="text-lg font-medium text-gray-900">订单列表</h3>
        <div className="flex items-center gap-3">
          {selectedOrders.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">已选择 {selectedOrders.length} 笔</span>
              <button
                onClick={() => onBatchDeleteOrders(selectedOrders)}
                className="bg-red-600 text-white px-3 py-1.5 rounded-md text-sm hover:bg-red-700"
              >删除</button>
            </div>
          )}
          <input
            type="text"
            placeholder="搜索订单..."
            value={searchValue}
            onChange={(e) => onSearchChange && onSearchChange(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-md text-sm w-56"
          />
          <button onClick={onRefresh} className="text-sm px-3 py-1.5 bg-gray-100 rounded-md border">刷新</button>
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <input
                  type="checkbox"
                  className="h-4 w-4 text-indigo-600 border-gray-300 rounded"
                  checked={isAllSelected}
                  onChange={(e) => onSelectAllOrders(e.target.checked, allIds)}
                />
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                订单信息
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                客户信息
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                商品数量
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                金额
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                状态
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                创建时间
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                操作
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {orders.length === 0 && (
              <tr>
                <td colSpan={8} className="px-6 py-4 text-center text-gray-500">
                  暂无订单
                </td>
              </tr>
            )}
            {orders.map((order) => (
              <React.Fragment key={order.id}>
              <tr>
                <td className="px-6 py-4 whitespace-nowrap">
                  <input
                    type="checkbox"
                    className="h-4 w-4 text-indigo-600 border-gray-300 rounded"
                    checked={selectedOrders.includes(order.id)}
                    onChange={(e) => onSelectOrder(order.id, e.target.checked)}
                  />
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900 flex items-center gap-2">
                    <span>订单号: {order.id}</span>
                  </div>
                  <div className="text-sm text-gray-500">
                    {order.payment_method === 'wechat' ? '微信支付' : order.payment_method}
                  </div>
                  {showAgentInfo && (
                    <div className="text-xs text-gray-500 mt-1">
                      代理: {agentNameMap?.[order.agent_id] || (order.agent_id ? order.agent_id : '未分配')}
                    </div>
                  )}
                  {Boolean(order.is_reservation) && (
                    <div className="mt-1">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold text-white bg-blue-500 rounded-full">
                        <i className="fas fa-calendar-check"></i>
                        预约
                      </span>
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      用户: {order.student_id || '未知'}
                    </div>
                    <div className="text-sm text-gray-500">
                      昵称: {order.shipping_info?.name || order.customer_name || '未知'}
                    </div>
                    <div className="text-sm text-gray-500">
                      电话: {order.shipping_info?.phone}
                    </div>
                    <div className="text-sm text-gray-500">
                      地址: {order.shipping_info?.full_address}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {(order.items || []).reduce((sum, it) => sum + (parseInt(it.quantity) || 0), 0)} 件
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  <div className="text-gray-900">¥{order.total_amount}</div>
                  {order.discount_amount > 0 && (
                    <div className="text-xs text-pink-600">券抵扣 -¥{Number(order.discount_amount).toFixed(2)}</div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {getStatusBadge(getUnifiedStatus(order))}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {formatDate(order.created_at_timestamp ?? order.created_at)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <div className="flex items-center gap-2">
                    <select
                      value={getUnifiedStatus(order)}
                      onChange={(e) => onUpdateUnifiedStatus(order, e.target.value)}
                      disabled={isLoading}
                      className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100"
                    >
                      {UNIFIED_STATUS_ORDER.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => setViewingOrder(order)}
                      className="group flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-blue-50 to-sky-50 hover:from-blue-100 hover:to-sky-100 text-blue-600 border border-blue-200 hover:border-blue-300 rounded-lg text-xs font-medium shadow-sm hover:shadow-md transition-all duration-200 transform hover:scale-105"
                      title="查看订单详情"
                    >
                      <i className="fas fa-eye text-xs"></i>
                      <span>查看</span>
                    </button>
                  </div>
                </td>
              </tr>
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-6 py-3 border-t flex items-center justify-between">
        <div className="text-sm text-gray-500">第 {Math.floor((page || 0) + 1)} 页</div>
        <div className="flex items-center gap-2">
          <button onClick={onPrevPage} disabled={!(page > 0)} className="px-3 py-1.5 border rounded disabled:opacity-50">上一页</button>
          <button onClick={onNextPage} disabled={!hasMore} className="px-3 py-1.5 border rounded disabled:opacity-50">下一页</button>
        </div>
      </div>
      
      {orders.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">暂无订单</p>
        </div>
      )}

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
  <>
    <div className="mb-6">
      <h2 className="text-lg font-medium text-gray-900">订单管理</h2>
      <p className="text-sm text-gray-600 mt-1">管理和跟踪用户订单</p>
      {isAdmin && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium text-gray-700">查看范围</label>
          <select
            className="min-w-[200px] rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
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
          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-lg">
            {orderAgentFilterLabel}
          </span>
        </div>
      )}
    </div>

    {(() => {
      const counts = orders.reduce((acc, o) => {
        const k = getUnifiedStatus(o);
        acc[k] = (acc[k] || 0) + 1;
        return acc;
      }, {});
      const hasAny = Object.keys(counts).length > 0;
      return hasAny ? (
      <div className="mb-6 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-md font-medium text-gray-900 mb-4">订单状态统计</h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {UNIFIED_STATUS_ORDER.map((status) => (
            <div key={status} className="text-center">
              <div className="text-2xl font-bold text-gray-900">{counts[status] || 0}</div>
              <div className="text-sm text-gray-600">{status}</div>
            </div>
          ))}
        </div>
      </div>
      ) : null;
    })()}

    {isSubmitting ? (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
        <div className="animate-pulse space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex space-x-4">
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    ) : (
      <>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {['全部', ...UNIFIED_STATUS_ORDER].map((label) => (
              <button
                key={label}
                onClick={() => onOrderStatusFilterChange(label)}
                className={`px-3 py-1 rounded-md text-sm border ${orderStatusFilter === label ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={onExportOrders}
            disabled={orderExporting}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <i className="fas fa-file-excel text-sm"></i>
            {orderExporting ? '导出中...' : '导出'}
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
  </>
);

export default OrdersPanel;
