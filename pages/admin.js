import React, { useState, useEffect, useMemo, useRef } from 'react';
import Head from 'next/head';
import { useAuth, useApi } from '../hooks/useAuth';
import { useRouter } from 'next/router';
import Toast from '../components/Toast';
import Nav from '../components/Nav';
import { getShopName } from '../utils/runtimeConfig';
import { useToast } from '../hooks/useToast';
import { Modal } from '../components/admin/Modal';
import { ProductsPanel, ProductForm, VariantStockModal } from '../components/admin/products';
import { OrdersPanel, getUnifiedStatus, UNIFIED_STATUS_ORDER } from '../components/admin/orders';
import { normalizeBooleanFlag } from '../components/admin/helpers';
import { AgentManagement } from '../components/admin/AgentManagement';
import { AddressManagement } from '../components/admin/AddressManagement';
import { LotteryConfigPanel } from '../components/admin/LotteryConfigPanel';
import { GiftThresholdPanel } from '../components/admin/GiftThresholdPanel';
import { CouponsPanel } from '../components/admin/CouponsPanel';
import { PaymentQrPanel } from '../components/admin/PaymentQrPanel';
import { AgentStatusCard } from '../components/admin/AgentStatusCard';
import { RegistrationSettingsCard } from '../components/admin/RegistrationSettingsCard';
import { ShopStatusCard } from '../components/admin/ShopStatusCard';
import { DeliverySettingsPanel } from '../components/admin/DeliverySettingsPanel';
import { StatsCard } from '../components/admin/StatsCard';


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
            <AgentManagement
              agents={agents}
              deletedAgents={deletedAgents}
              agentError={agentError}
              agentLoading={agentLoading}
              agentModalOpen={agentModalOpen}
              showDeletedAgentsModal={showDeletedAgentsModal}
              editingAgent={editingAgent}
              agentForm={agentForm}
              agentSaving={agentSaving}
              addresses={addresses}
              buildingsByAddress={buildingsByAddress}
              buildingLabelMap={buildingLabelMap}
              loadAgents={loadAgents}
              openAgentModal={openAgentModal}
              closeAgentModal={closeAgentModal}
              toggleAgentBuilding={toggleAgentBuilding}
              setAgentForm={setAgentForm}
              handleAgentSave={handleAgentSave}
              handleAgentStatusToggle={handleAgentStatusToggle}
              handleAgentDelete={handleAgentDelete}
              setShowDeletedAgentsModal={setShowDeletedAgentsModal}
            />
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
            <AddressManagement
              addresses={addresses}
              agents={agents}
              buildingsByAddress={buildingsByAddress}
              addrLoading={addrLoading}
              addrSubmitting={addrSubmitting}
              newAddrName={newAddrName}
              setNewAddrName={setNewAddrName}
              newBldNameMap={newBldNameMap}
              setNewBldNameMap={setNewBldNameMap}
              bldDragState={bldDragState}
              setBldDragState={setBldDragState}
              loadAddresses={loadAddresses}
              handleAddAddress={handleAddAddress}
              handleUpdateAddress={handleUpdateAddress}
              handleDeleteAddress={handleDeleteAddress}
              handleAddBuilding={handleAddBuilding}
              onAddressDragStart={onAddressDragStart}
              onAddressDragOver={onAddressDragOver}
              onAddressDragEnd={onAddressDragEnd}
              setBuildingsByAddress={setBuildingsByAddress}
              apiRequest={apiRequest}
            />
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
