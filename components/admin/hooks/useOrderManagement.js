import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getUnifiedStatus } from '../orders';
import { getApiBaseUrl } from '../../../utils/runtimeConfig';

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
  const [exportHistory, setExportHistory] = useState([]);
  const [exportState, setExportState] = useState({
    status: 'idle',
    progress: 0,
    stage: '',
    message: '',
    downloadUrl: '',
    filename: '',
    expiresAt: '',
    rangeLabel: '',
    scopeLabel: '',
    exported: 0,
    total: 0
  });
  const [orderAgentFilter, setOrderAgentFilter] = useState('self');
  const [orderAgentOptions, setOrderAgentOptions] = useState([]);
  const [selectedOrders, setSelectedOrders] = useState([]);
  const [orderCycles, setOrderCycles] = useState([]);
  const [orderCycleId, setOrderCycleId] = useState('all');
  const [orderCycleLoading, setOrderCycleLoading] = useState(false);
  const [orderCycleLocked, setOrderCycleLocked] = useState(false);
  const forceCycleAllRef = useRef(false);

  const loadOrdersRef = useRef(null);
  const previousOrderSearchRef = useRef(orderSearch);
  const agentFilterChangeHandlerRef = useRef(onAgentFilterChange);
  const exportEventSourceRef = useRef(null);

  useEffect(() => {
    agentFilterChangeHandlerRef.current = onAgentFilterChange;
  }, [onAgentFilterChange]);

  const resolveCycleOwner = useCallback((agentFilterValue = orderAgentFilter) => {
    if (!isAdmin) {
      return { ownerType: 'agent', ownerId: user?.agent_id || user?.id || '', disabled: false };
    }
    const raw = (agentFilterValue ?? orderAgentFilter).toString().trim().toLowerCase();
    if (raw === 'all') {
      return { ownerType: 'all', ownerId: '', disabled: true };
    }
    if (!raw || raw === 'self' || raw === 'admin') {
      return { ownerType: 'admin', ownerId: 'admin', disabled: false };
    }
    return { ownerType: 'agent', ownerId: agentFilterValue, disabled: false };
  }, [isAdmin, orderAgentFilter, user]);

  const loadOrderCycles = useCallback(async (agentFilterValue = orderAgentFilter, options = {}) => {
    const shouldForceAll = options.forceAll || forceCycleAllRef.current;
    const owner = resolveCycleOwner(agentFilterValue);
    if (owner.disabled) {
      setOrderCycles([]);
      setOrderCycleLocked(false);
      setOrderCycleId('all');
      if (forceCycleAllRef.current) {
        forceCycleAllRef.current = false;
      }
      return;
    }
    if (!owner.ownerId) return;
    setOrderCycleLoading(true);
    try {
      const params = new URLSearchParams();
      if (isAdmin && owner.ownerType === 'agent') {
        params.set('agent_id', owner.ownerId);
      }
      const suffix = params.toString();
      const res = await apiRequest(`${staffPrefix}/sales-cycles${suffix ? `?${suffix}` : ''}`);
      if (res?.success) {
        const cycles = Array.isArray(res.data?.cycles) ? res.data.cycles : [];
        setOrderCycles(cycles);
        setOrderCycleLocked(!!res.data?.locked);
        setOrderCycleId((prev) => {
          if (shouldForceAll) {
            return 'all';
          }
          if (prev === 'all') {
            return 'all';
          }
          if (prev && cycles.some((cycle) => cycle.id === prev)) {
            return prev;
          }
          return res.data?.active_cycle_id || res.data?.latest_cycle_id || (cycles[cycles.length - 1]?.id ?? 'all');
        });
      } else {
        setOrderCycles([]);
        setOrderCycleId('all');
      }
    } catch (err) {
      console.error('Failed to load sales cycles', err);
      setOrderCycles([]);
      setOrderCycleId('all');
    } finally {
      if (forceCycleAllRef.current) {
        forceCycleAllRef.current = false;
      }
      setOrderCycleLoading(false);
    }
  }, [apiRequest, isAdmin, orderAgentFilter, resolveCycleOwner, staffPrefix]);

  useEffect(() => () => {
    if (exportEventSourceRef.current) {
      exportEventSourceRef.current.close();
      exportEventSourceRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    loadOrderCycles(orderAgentFilter);
  }, [user, orderAgentFilter, loadOrderCycles]);

  const buildOrdersQueryParams = useCallback(({
    limit = 20,
    offset = 0,
    search = '',
    agentFilterValue = orderAgentFilter,
    cycleIdValue = orderCycleId
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

    if (cycleIdValue && cycleIdValue !== 'all') {
      params.set('cycle_id', cycleIdValue);
    }

    return `${staffPrefix}/orders?${params.toString()}`;
  }, [orderAgentFilter, isAdmin, staffPrefix, orderCycleId]);

  const buildOrdersQuery = useCallback((page = 0, search = '', agentFilterValue = orderAgentFilter, cycleIdValue = orderCycleId) => {
    const limit = 20;
    const p = parseInt(page, 10) || 0;
    const offset = p * limit;
    return buildOrdersQueryParams({ limit, offset, search, agentFilterValue, cycleIdValue });
  }, [buildOrdersQueryParams, orderAgentFilter, orderCycleId]);

  const loadOrders = useCallback(async (page = orderPage, search = orderSearch, agentFilterValue = orderAgentFilter, cycleIdValue = orderCycleId) => {
    setOrderLoading(true);
    try {
      const url = buildOrdersQuery(page, search, agentFilterValue, cycleIdValue);
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
  }, [apiRequest, buildOrdersQuery, orderAgentFilter, orderPage, orderSearch, orderCycleId]);
  loadOrdersRef.current = loadOrders;

  useEffect(() => {
    if (previousOrderSearchRef.current === orderSearch) {
      previousOrderSearchRef.current = orderSearch;
      return;
    }
    previousOrderSearchRef.current = orderSearch;
    loadOrdersRef.current?.(0, orderSearch, orderAgentFilter);
  }, [orderSearch, orderAgentFilter]);

  useEffect(() => {
    if (!orderCycleId) return;
    loadOrdersRef.current?.(0, orderSearch, orderAgentFilter);
  }, [orderCycleId, orderAgentFilter, orderSearch]);

  const handleOrderRefresh = useCallback(async () => {
    await loadOrders(orderPage, orderSearch, orderAgentFilter);
  }, [loadOrders, orderAgentFilter, orderPage, orderSearch]);

  const orderAgentNameMap = useMemo(() => {
    const map = {};
    orderAgentOptions.forEach(agent => {
      if (agent?.id) {
        map[agent.id] = agent.name || agent.account || agent.id;
      }
    });
    return map;
  }, [orderAgentOptions]);

  const orderAgentDeletedMap = useMemo(() => {
    const map = {};
    orderAgentOptions.forEach(agent => {
      if (agent?.id) {
        map[agent.id] = !!(agent.isDeleted || agent.is_deleted);
      }
    });
    return map;
  }, [orderAgentOptions]);

  const stopExportStream = useCallback(() => {
    if (exportEventSourceRef.current) {
      exportEventSourceRef.current.close();
      exportEventSourceRef.current = null;
    }
  }, []);

  const resetExportState = useCallback(() => {
    stopExportStream();
    setOrderExporting(false);
    setExportState((prev) => ({
      ...prev,
      status: 'idle',
      progress: 0,
      stage: '',
      message: '',
      downloadUrl: '',
      filename: '',
      expiresAt: '',
      rangeLabel: '',
      scopeLabel: '',
      exported: 0,
      total: 0
    }));
  }, [stopExportStream]);

  const loadExportHistory = useCallback(async () => {
    try {
      const res = await apiRequest(`${staffPrefix}/orders/export/history`);
      const historyList = res?.data?.history || [];
      setExportHistory(historyList);
      return historyList;
    } catch (e) {
      console.error('Failed to load export history', e);
      return [];
    }
  }, [apiRequest, staffPrefix]);

  const handleExportOrders = useCallback(async ({
    startTimeMs = null,
    endTimeMs = null,
    statusFilter = orderStatusFilter,
    keyword = orderSearch
  } = {}) => {
    if (orderExporting) return null;
    const timezoneOffset = typeof window !== 'undefined' ? new Date().getTimezoneOffset() : 0;
    const payload = {
      start_time_ms: startTimeMs,
      end_time_ms: endTimeMs,
      status_filter: statusFilter && statusFilter !== '全部' ? statusFilter : null,
      keyword: keyword || '',
      agent_filter: isAdmin ? orderAgentFilter : undefined,
      timezone_offset_minutes: timezoneOffset,
      cycle_id: orderCycleId && orderCycleId !== 'all' ? orderCycleId : null
    };
    setOrderExporting(true);
    setExportState((prev) => ({
      ...prev,
      status: 'running',
      progress: 4,
      stage: '准备导出',
      message: '',
      downloadUrl: '',
      filename: '',
      expiresAt: '',
      rangeLabel: '',
      scopeLabel: '',
      exported: 0,
      total: 0
    }));
    try {
      const res = await apiRequest(`${staffPrefix}/orders/export`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      if (!res?.success) {
        throw new Error(res?.message || '创建导出任务失败');
      }
      const data = res.data || {};
      if (Array.isArray(data.history)) {
        setExportHistory(data.history);
      }
      setExportState((prev) => ({
        ...prev,
        rangeLabel: data.range_label || prev.rangeLabel,
        scopeLabel: data.scope_label || prev.scopeLabel,
        filename: data.filename || prev.filename,
        expiresAt: data.expires_at || prev.expiresAt
      }));
      const streamPath = data.stream_path;
      if (!streamPath) {
        throw new Error('未获取到导出进度流地址');
      }
      const source = new EventSource(`${getApiBaseUrl()}${streamPath}`, { withCredentials: true });
      exportEventSourceRef.current = source;
      source.onmessage = (event) => {
        if (!event?.data) return;
        try {
          const payloadData = JSON.parse(event.data);
          const nextStatus = payloadData.status || 'running';
          setExportState((prev) => ({
            ...prev,
            status: nextStatus,
            progress: typeof payloadData.progress === 'number' ? payloadData.progress : prev.progress,
            stage: payloadData.stage || prev.stage,
            message: payloadData.message || prev.message,
            downloadUrl: payloadData.download_url || prev.downloadUrl,
            filename: payloadData.filename || prev.filename,
            expiresAt: payloadData.expires_at || prev.expiresAt,
            rangeLabel: payloadData.range_label || prev.rangeLabel,
            scopeLabel: payloadData.scope_label || prev.scopeLabel,
            exported: payloadData.exported ?? prev.exported,
            total: payloadData.total ?? prev.total
          }));
          if (Array.isArray(payloadData.history)) {
            setExportHistory(payloadData.history);
          }
          if (nextStatus === 'completed' || nextStatus === 'failed' || nextStatus === 'expired') {
            setOrderExporting(false);
            stopExportStream();
          }
        } catch (err) {
          console.error('Failed to parse export progress payload', err);
        }
      };
      source.onerror = (err) => {
        console.error('Export progress stream connection failed', err);
        setExportState((prev) => ({
          ...prev,
          status: 'failed',
          message: '导出进度连接中断，请重试',
        }));
        setOrderExporting(false);
        stopExportStream();
      };
      return data;
    } catch (error) {
      console.error('Order export failed:', error);
      if (showToast) {
        showToast(error?.message || '导出订单失败，请稍后重试');
      } else {
        alert(error?.message || '导出订单失败，请稍后重试');
      }
      setOrderExporting(false);
      stopExportStream();
      return null;
    }
  }, [apiRequest, staffPrefix, isAdmin, orderAgentFilter, orderCycleId, orderExporting, orderStatusFilter, orderSearch, stopExportStream, showToast]);

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
    setOrderCycleId('all');
    forceCycleAllRef.current = true;
    const refreshOrdersPromise = loadOrders(0, orderSearch, normalized, 'all');
    const refreshCyclesPromise = loadOrderCycles(normalized, { forceAll: true });
    const agentFilterChangePromise = agentFilterChangeHandlerRef.current
      ? agentFilterChangeHandlerRef.current(normalized)
      : Promise.resolve();
    await Promise.all([refreshOrdersPromise, refreshCyclesPromise, agentFilterChangePromise]);
  }, [loadOrderCycles, loadOrders, orderSearch]);

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
    return `${target?.name || target?.account || orderAgentFilter} 的订单`;
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
    exportHistory,
    exportState,
    orderAgentFilter,
    setOrderAgentFilter,
    orderAgentOptions,
    setOrderAgentOptions,
    orderAgentFilterLabel,
    orderAgentNameMap,
    orderAgentDeletedMap,
    orderCycles,
    orderCycleId,
    setOrderCycleId,
    orderCycleLoading,
    orderCycleLocked,
    selectedOrders,
    handleOrderRefresh,
    handleExportOrders,
    loadExportHistory,
    resetExportState,
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
