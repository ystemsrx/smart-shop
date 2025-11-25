import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getUnifiedStatus } from '../orders';

export function useOrderManagement({
  apiRequest,
  staffPrefix,
  isAdmin,
  user,
  showToast,
  onAgentFilterChange = null,
}) {
  const [orders, setOrders] = useState([]);
  const [orderStats, setOrderStats] = useState({
    total_orders: 0,
    status_counts: {},
    today_orders: 0,
    total_revenue: 0
  });
  const [orderStatusFilter, setOrderStatusFilter] = useState('全部');
  const [orderPage, setOrderPage] = useState(0);
  const [orderHasMore, setOrderHasMore] = useState(false);
  const [orderTotal, setOrderTotal] = useState(0);
  const [orderSearch, setOrderSearch] = useState('');
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderExporting, setOrderExporting] = useState(false);
  const [orderAgentFilter, setOrderAgentFilter] = useState('self');
  const [orderAgentOptions, setOrderAgentOptions] = useState([]);
  const [selectedOrders, setSelectedOrders] = useState([]);

  const loadOrdersRef = useRef(null);
  const previousOrderSearchRef = useRef(orderSearch);
  const agentFilterChangeHandlerRef = useRef(onAgentFilterChange);

  useEffect(() => {
    agentFilterChangeHandlerRef.current = onAgentFilterChange;
  }, [onAgentFilterChange]);

  const buildOrdersQueryParams = useCallback(({
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
  }, [orderAgentFilter, isAdmin, staffPrefix]);

  const buildOrdersQuery = useCallback((page = 0, search = '', agentFilterValue = orderAgentFilter) => {
    const limit = 20;
    const p = parseInt(page, 10) || 0;
    const offset = p * limit;
    return buildOrdersQueryParams({ limit, offset, search, agentFilterValue });
  }, [buildOrdersQueryParams, orderAgentFilter]);

  const loadOrders = useCallback(async (page = orderPage, search = orderSearch, agentFilterValue = orderAgentFilter) => {
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
  }, [apiRequest, buildOrdersQuery, orderAgentFilter, orderPage, orderSearch]);
  loadOrdersRef.current = loadOrders;

  useEffect(() => {
    if (previousOrderSearchRef.current === orderSearch) {
      previousOrderSearchRef.current = orderSearch;
      return;
    }
    previousOrderSearchRef.current = orderSearch;
    loadOrdersRef.current?.(0, orderSearch, orderAgentFilter);
  }, [orderSearch, orderAgentFilter]);

  const handleOrderRefresh = useCallback(async () => {
    await loadOrders(orderPage, orderSearch, orderAgentFilter);
  }, [loadOrders, orderAgentFilter, orderPage, orderSearch]);

  const orderAgentNameMap = useMemo(() => {
    const map = {};
    orderAgentOptions.forEach(agent => {
      if (agent?.id) {
        map[agent.id] = agent.name || agent.id;
      }
    });
    return map;
  }, [orderAgentOptions]);

  const handleExportOrders = useCallback(async () => {
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
        }).filter(Boolean).join('\\n');

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
  }, [apiRequest, buildOrdersQueryParams, orderAgentFilter, orderExporting, orderSearch, orderStatusFilter, orderAgentNameMap, isAdmin, user]);

  const handlePrevPage = useCallback(async () => {
    const next = Math.max(0, (orderPage || 0) - 1);
    await loadOrders(next, orderSearch, orderAgentFilter);
  }, [loadOrders, orderAgentFilter, orderPage, orderSearch]);

  const handleNextPage = useCallback(async () => {
    if (!orderHasMore) return;
    const next = (orderPage || 0) + 1;
    await loadOrders(next, orderSearch, orderAgentFilter);
  }, [loadOrders, orderAgentFilter, orderHasMore, orderPage, orderSearch]);

  const handleOrderAgentFilterChange = useCallback(async (nextFilter) => {
    const normalized = (nextFilter || 'self').toString();
    setOrderAgentFilter(normalized);
    setOrderStatusFilter('全部');
    const refreshOrdersPromise = loadOrders(0, orderSearch, normalized);
    const agentFilterChangePromise = agentFilterChangeHandlerRef.current
      ? agentFilterChangeHandlerRef.current(normalized)
      : Promise.resolve();
    await Promise.all([refreshOrdersPromise, agentFilterChangePromise]);
  }, [loadOrders, orderSearch]);

  useEffect(() => {
    if (!isAdmin) return;
    const normalized = (orderAgentFilter || 'self').toString().toLowerCase();
    if (normalized === 'self' || normalized === 'all') return;
    if (orderAgentOptions.some(option => option.id === orderAgentFilter)) return;
    if (orderAgentOptions.length === 0) return;
    void handleOrderAgentFilterChange('self');
  }, [isAdmin, orderAgentFilter, orderAgentOptions, handleOrderAgentFilterChange]);

  const handleUpdateOrderStatus = useCallback(async (orderId, newStatus) => {
    const resp = await apiRequest(`/admin/orders/${orderId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: newStatus })
    });
    if (!resp?.success) {
      throw new Error(resp?.message || '更新订单状态失败');
    }
    await loadOrders(orderPage, orderSearch, orderAgentFilter);
    return resp;
  }, [apiRequest, loadOrders, orderAgentFilter, orderPage, orderSearch]);

  const handleUpdatePaymentStatus = useCallback(async (orderId, newPaymentStatus) => {
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
  }, [apiRequest, loadOrders, orderAgentFilter, orderPage, orderSearch]);

  const handleSelectOrder = useCallback((orderId, checked) => {
    if (checked) setSelectedOrders((prev) => [...prev, orderId]);
    else setSelectedOrders((prev) => prev.filter((id) => id !== orderId));
  }, []);

  const handleSelectAllOrders = useCallback((checked, ids) => {
    if (checked) setSelectedOrders(ids);
    else setSelectedOrders([]);
  }, []);

  const handleBatchDeleteOrders = useCallback(async (orderIds) => {
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
  }, [apiRequest, loadOrders, orderAgentFilter, orderPage, orderSearch]);

  const handleUpdateUnifiedStatus = useCallback(async (order, newUnified) => {
    try {
      const currentUnified = getUnifiedStatus(order);
      if (currentUnified === newUnified) return;

      if (newUnified === '未付款') {
        await handleUpdatePaymentStatus(order.id, 'pending');
        await handleUpdateOrderStatus(order.id, 'pending');
      } else if (newUnified === '待确认') {
        await handleUpdatePaymentStatus(order.id, 'processing');
        await handleUpdateOrderStatus(order.id, 'pending');
      } else if (newUnified === '待配送') {
        if (order.payment_status !== 'succeeded') {
          await handleUpdatePaymentStatus(order.id, 'succeeded');
        }
        await handleUpdateOrderStatus(order.id, 'confirmed');
      } else if (newUnified === '配送中') {
        if (order.payment_status !== 'succeeded') {
          showToast('请先确认付款后再设为配送中');
          return;
        }
        await handleUpdateOrderStatus(order.id, 'shipped');
      } else if (newUnified === '已完成') {
        if (order.payment_status !== 'succeeded') {
          showToast('请先确认付款后再设为已完成');
          return;
        }
        await handleUpdateOrderStatus(order.id, 'delivered');
      }
    } catch (err) {
      showToast(err.message || '更新状态失败');
    }
  }, [handleUpdateOrderStatus, handleUpdatePaymentStatus, showToast]);

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

  const setOnAgentFilterChange = useCallback((handler) => {
    agentFilterChangeHandlerRef.current = handler;
  }, []);

  return {
    orders,
    orderStats,
    orderStatusFilter,
    setOrderStatusFilter,
    orderPage,
    orderHasMore,
    orderTotal,
    orderSearch,
    setOrderSearch,
    orderLoading,
    orderExporting,
    orderAgentFilter,
    setOrderAgentFilter,
    orderAgentOptions,
    setOrderAgentOptions,
    orderAgentFilterLabel,
    orderAgentNameMap,
    selectedOrders,
    handleOrderRefresh,
    handleExportOrders,
    handlePrevPage,
    handleNextPage,
    handleOrderAgentFilterChange,
    handleSelectOrder,
    handleSelectAllOrders,
    handleBatchDeleteOrders,
    handleUpdateUnifiedStatus,
    loadOrders,
    setOnAgentFilterChange,
    setOrderStats,
  };
}
