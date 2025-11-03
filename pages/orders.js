import React, { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Nav from '../components/Nav';
import { useAuth, useApi, useCart } from '../hooks/useAuth';
import { useRouter } from 'next/router';
import { getShopName } from '../utils/runtimeConfig';

// 格式化预约截止时间显示
const formatReservationCutoff = (cutoffTime) => {
  if (!cutoffTime) return '需提前预约';
  
  // 获取当前时间
  const now = new Date();
  const [hours, minutes] = cutoffTime.split(':').map(Number);
  
  // 创建今天的截止时间
  const todayCutoff = new Date();
  todayCutoff.setHours(hours, minutes, 0, 0);
  
  // 如果当前时间已过今天的截止时间，显示明日配送
  if (now > todayCutoff) {
    return `明日 ${cutoffTime} 后配送`;
  }
  
  return `今日 ${cutoffTime} 后配送`;
};

const collapseAutoGiftItemsForDisplay = (items = []) => {
  if (!Array.isArray(items)) return [];
  const grouped = [];
  const indexLookup = new Map();

  items.forEach((item) => {
    if (!item || typeof item !== 'object') return;
    const parsedQuantity = Number.parseInt(item.quantity, 10);
    const quantity = Number.isFinite(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : 1;

    if (item.is_auto_gift && item.product_id) {
      const variantKey = item.variant_id || 'base';
      const key = `${item.product_id}__${variantKey}`;
      if (indexLookup.has(key)) {
        const idx = indexLookup.get(key);
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
        indexLookup.set(key, grouped.length - 1);
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

// 统一状态计算（与管理端保持一致）
const getUnifiedStatus = (order) => {
  const ps = order?.payment_status;
  const st = order?.status;
  if (ps === 'processing') return '待确认';
  if (ps !== 'succeeded') return '未付款';
  if (st === 'shipped') return '配送中';
  if (st === 'delivered') return '已完成';
  return '待配送';
};

const UNIFIED_STATUS_MAP = {
  '未付款': { color: 'gray' },
  '待确认': { color: 'yellow' },
  '待配送': { color: 'cyan' },
  '配送中': { color: 'purple' },
  '已完成': { color: 'green' },
};

const UNIFIED_STATUS_ORDER = ['全部', '未付款', '待确认', '待配送', '配送中', '已完成'];

const colorClasses = {
  yellow: 'bg-yellow-100 text-yellow-800',
  cyan: 'bg-cyan-100 text-cyan-800',
  purple: 'bg-purple-100 text-purple-800',
  green: 'bg-green-100 text-green-800',
  red: 'bg-red-100 text-red-800',
  gray: 'bg-gray-100 text-gray-800'
};

function StatusBadge({ status }) {
  const meta = UNIFIED_STATUS_MAP[status] || { color: 'gray' };
  
  const getStatusIcon = (status) => {
    switch(status) {
      case '未付款': return 'fas fa-credit-card';
      case '待确认': return 'fas fa-clock';
      case '待配送': return 'fas fa-box';
      case '配送中': return 'fas fa-truck';
      case '已完成': return 'fas fa-check-circle';
      default: return 'fas fa-question-circle';
    }
  };

  const getStatusGradient = (status) => {
    switch(status) {
      case '未付款': return 'bg-gradient-to-r from-gray-500 to-gray-600';
      case '待确认': return 'bg-gradient-to-r from-yellow-500 to-orange-500';
      case '待配送': return 'bg-gradient-to-r from-cyan-500 to-cyan-600';
      case '配送中': return 'bg-gradient-to-r from-purple-500 to-purple-600';
      case '已完成': return 'bg-gradient-to-r from-green-500 to-green-600';
      default: return 'bg-gradient-to-r from-gray-500 to-gray-600';
    }
  };

  return (
    <span className={`px-3 py-1 inline-flex items-center gap-1 text-xs font-semibold rounded-full text-white ${getStatusGradient(status)} shadow-sm`}>
      <i className={getStatusIcon(status)}></i>
      <span>{status}</span>
    </span>
  );
}

export default function Orders() {
  const router = useRouter();
  const { user } = useAuth();
  const { apiRequest } = useApi();
  const { clearCart } = useCart();
  const shopName = getShopName();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payOrderId, setPayOrderId] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [viewingOrder, setViewingOrder] = useState(null);
  const [filter, setFilter] = useState('全部');
  const [tick, setTick] = useState(0); // 用于每秒刷新倒计时
  const [lotteryOpen, setLotteryOpen] = useState(false);
  const [lotteryNames, setLotteryNames] = useState([]);
  const [lotteryResult, setLotteryResult] = useState('');
  const [lotteryDisplay, setLotteryDisplay] = useState('');
  const [lotteryPrize, setLotteryPrize] = useState(null);
  const [spinning, setSpinning] = useState(false);
  const [lotteryThreshold, setLotteryThreshold] = useState(10);
  const [paymentQr, setPaymentQr] = useState(null);
  const [copiedOrderId, setCopiedOrderId] = useState(null);
  const formattedLotteryThreshold = useMemo(() => (
    Number.isInteger(lotteryThreshold)
      ? lotteryThreshold.toString()
      : lotteryThreshold.toFixed(2)
  ), [lotteryThreshold]);

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
  }, [user, router]);

  const loadOrders = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiRequest('/orders/my');
      setOrders(res.data.orders || []);
    } catch (err) {
      setError(err.message || '加载订单失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) loadOrders();
  }, [user]);

  // 每秒触发一次刷新用于倒计时显示
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const getRemainSeconds = (o) => {
    // 直接使用后端返回的时间戳（秒）
    const createdTimestamp = o.created_at_timestamp;
    if (!createdTimestamp || typeof createdTimestamp !== 'number') {
      console.error('订单创建时间戳无效:', createdTimestamp, '订单数据:', o);
      return 0;
    }
    
    // 计算过期时间（创建时间 + 15分钟）
    const expireTimestamp = createdTimestamp + (15 * 60); // 15分钟，单位秒
    
    // 当前时间戳（秒）
    const nowTimestamp = Math.floor(Date.now() / 1000);
    
    // 计算剩余秒数
    const remainSeconds = Math.max(0, expireTimestamp - nowTimestamp);
    
    // 添加更详细的调试日志
    const createdDate = new Date(createdTimestamp * 1000);
    const expireDate = new Date(expireTimestamp * 1000);
    const nowDate = new Date();
    const ageMinutes = Math.floor((nowTimestamp - createdTimestamp) / 60);
    
    console.log(`订单 ${o.id} 倒计时详情:`, {
      raw_timestamp: createdTimestamp,
      created_time: createdDate.toLocaleString('zh-CN'),
      expire_time: expireDate.toLocaleString('zh-CN'),
      current_time: nowDate.toLocaleString('zh-CN'),
      age_minutes: ageMinutes,
      remain_seconds: remainSeconds,
      remain_display: remainSeconds > 0 ? `${Math.floor(remainSeconds / 60)}:${String(remainSeconds % 60).padStart(2, '0')}` : '已过期'
    });
    
    return remainSeconds;
  };

  const formatRemain = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    const pad = (n) => (n < 10 ? `0${n}` : String(n));
    return `${pad(m)}:${pad(s)}`;
  };

  const startLottery = async (orderId) => {
    try {
      const resp = await apiRequest(`/orders/${orderId}/lottery/draw`, { method: 'POST' });
      if (resp.success) {
        const thresholdValue = Number(resp.data?.threshold_amount);
        if (Number.isFinite(thresholdValue) && thresholdValue > 0) {
          setLotteryThreshold(thresholdValue);
        }
        const resultName = resp.data?.prize_name || '';
        const list = (resp.data?.names && resp.data.names.length > 0)
          ? resp.data.names
          : (resultName ? [resultName] : ['谢谢参与']);
        setLotteryPrize(resp.data?.prize || null);
        setLotteryNames(list);
        setLotteryResult(resultName);
        setLotteryDisplay(list[0] || '');
        setLotteryOpen(true);
        // 简单滚动动画：2秒内循环高亮，最终停留在结果
        setSpinning(true);
        const duration = 2000;
        const interval = 80;
        let idx = 0;
        const timer = setInterval(() => {
          idx = (idx + 1) % list.length;
          setLotteryDisplay(list[idx]);
        }, interval);
        setTimeout(() => {
          clearInterval(timer);
          setSpinning(false);
          setLotteryDisplay(resultName || list[0]);
        }, duration);
      }
    } catch (e) {
      setLotteryPrize(null);
    }
  };

  const handleShowPayModal = async (orderId) => {
    setPayOrderId(orderId);
    setPaymentQr(null);
    
    // 获取订单对应的收款码
    try {
      const qrResponse = await apiRequest(`/orders/${orderId}/payment-qr`);
      if (qrResponse.success && qrResponse.data?.payment_qr) {
        setPaymentQr(qrResponse.data.payment_qr);
      } else {
        // 没有收款码
        setPaymentQr({
          owner_type: 'default',
          name: "无收款码"
        });
      }
    } catch (e) {
      console.warn('获取收款码失败:', e);
      setPaymentQr({
        owner_type: 'default',
        name: "无收款码"
      });
    }
  };

  const handleMarkPaid = async (orderId) => {
    try {
      const res = await apiRequest(`/orders/${orderId}/mark-paid`, { method: 'POST' });
      if (res.success) {
        try { await clearCart(); } catch (e) {}
        setPayOrderId(null);
        setPaymentQr(null);
        // 重新加载订单数据以刷新页面状态
        await loadOrders();
      } else {
        alert(res.message || '操作失败');
      }
    } catch (err) {
      alert(err.message || '操作失败');
    } finally {
      // 无论支付状态如何，均尝试触发抽奖
      startLottery(orderId);
    }
  };

  if (!user) return null;

  const filteredOrders = filter === '全部' ? orders : orders.filter(o => getUnifiedStatus(o) === filter);

  const formatDate = (val) => {
    if (typeof val === 'number' && isFinite(val)) {
      return new Date(val * 1000).toLocaleString('zh-CN');
    }
    const t = Date.parse(val);
    return isNaN(t) ? '' : new Date(t).toLocaleString('zh-CN');
  };

  const copyToClipboard = async (orderId) => {
    try {
      await navigator.clipboard.writeText(orderId);
      setCopiedOrderId(orderId);
      setTimeout(() => {
        setCopiedOrderId(null);
      }, 3000);
    } catch (e) {
      // ignore
    }
  };

  return (
    <>
      <Head>
        <title>我的订单 - {shopName}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>

      {/* 顶部导航（移动端优化） */}
      <Nav active="orders" />

      <div className="min-h-screen pt-16" style={{
        background: 'linear-gradient(180deg, #f1f5f9 0%, #e2e8f0 100%)'
      }}>
        {/* 背景装饰 */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-orange-400/10 blur-3xl"></div>
          <div className="absolute top-60 -left-40 w-96 h-96 rounded-full bg-cyan-400/10 blur-3xl"></div>
          <div className="absolute bottom-40 right-20 w-64 h-64 rounded-full bg-pink-400/10 blur-3xl"></div>
        </div>

        <main className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* 页面标题 */}
          <div className="text-center mb-8 sm:mb-12 animate-apple-fade-in">
            <div className="flex justify-center mb-4 sm:mb-6">
              <div className="relative">
                <div className="absolute -inset-3 sm:-inset-4 bg-gradient-to-r from-amber-500 to-orange-600 rounded-2xl sm:rounded-3xl blur-xl sm:blur-2xl opacity-30"></div>
                <div className="relative w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-amber-500 via-orange-600 to-red-500 rounded-2xl sm:rounded-3xl flex items-center justify-center shadow-2xl">
                  <i className="fas fa-receipt text-white text-xl sm:text-2xl"></i>
                </div>
              </div>
            </div>
            <h1 className="text-2xl sm:text-4xl font-bold bg-gradient-to-r from-gray-900 via-gray-800 to-gray-700 bg-clip-text text-transparent mb-2 sm:mb-3">
              我的订单
            </h1>
            <p className="text-sm sm:text-lg text-gray-600">
              查看订单状态和物流信息
            </p>
          </div>

          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div>
          )}

          {loading ? (
            <div className="text-center py-20 animate-apple-fade-in">
              <div className="w-16 h-16 bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <div className="loading-dots text-white"></div>
              </div>
              <p className="text-gray-600 text-lg">加载订单中...</p>
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-20 animate-apple-fade-in">
              <div className="max-w-md mx-auto">
                <div className="w-24 h-24 bg-gradient-to-br from-gray-200 to-gray-300 rounded-3xl flex items-center justify-center mx-auto mb-6">
                  <i className="fas fa-receipt text-gray-400 text-3xl"></i>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">暂无订单</h3>
                <p className="text-gray-600 mb-6">您还没有任何订单，快去商城选购喜欢的商品吧！</p>
                <Link 
                  href="/shop" 
                  className="btn-primary inline-flex items-center gap-2 transform hover:scale-105 transition-all duration-300"
                >
                  <i className="fas fa-shopping-bag"></i>
                  <span>立即购物</span>
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* 筛选器 */}
              <div className="animate-apple-slide-up animate-delay-200">
                <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl flex items-center justify-center">
                    <i className="fas fa-filter text-white text-xs sm:text-sm"></i>
                  </div>
                  <h3 className="text-base sm:text-lg font-semibold text-gray-900">订单筛选</h3>
                </div>
                <div className="flex flex-wrap gap-2 sm:gap-3">
                  {UNIFIED_STATUS_ORDER.map((label, index) => (
                    <button
                      key={label}
                      onClick={() => setFilter(label)}
                      className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-xs sm:text-sm font-medium transition-all duration-300 transform hover:scale-105 animate-apple-fade-in ${
                         filter === label 
                           ? 'bg-gradient-to-r from-emerald-500 to-cyan-600 text-white shadow-lg' 
                           : 'card-modern text-gray-700 hover:shadow-md border border-gray-200'
                      }`}
                      style={{ animationDelay: `${index * 0.05}s` }}
                    >
                      <div className="flex items-center gap-1.5 sm:gap-2">
                        <i className={`fas text-xs sm:text-sm ${
                          label === '全部' ? 'fa-th-list' :
                          label === '未付款' ? 'fa-credit-card' :
                          label === '待确认' ? 'fa-clock' :
                          label === '待配送' ? 'fa-box' :
                          label === '配送中' ? 'fa-truck' :
                          'fa-check-circle'
                        }`}></i>
                        <span>{label}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {filteredOrders.length === 0 ? (
                <div className="text-center py-20 animate-apple-fade-in">
                  <div className="max-w-md mx-auto">
                    <div className="w-24 h-24 bg-gradient-to-br from-gray-200 to-gray-300 rounded-3xl flex items-center justify-center mx-auto mb-6">
                      <i className="fas fa-filter text-gray-400 text-3xl"></i>
                    </div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">暂无「{filter}」状态的订单</h3>
                    <p className="text-gray-600 mb-6">尝试切换其他筛选条件查看订单</p>
                    <button
                      onClick={() => setFilter('全部')}
                      className="btn-primary inline-flex items-center gap-2 transform hover:scale-105 transition-all duration-300"
                    >
                      <i className="fas fa-th-list"></i>
                      <span>查看全部订单</span>
                    </button>
                  </div>
                </div>
              ) : filteredOrders.map((o, index) => {
                const us = getUnifiedStatus(o);
                const showCountdown = us === '未付款' && (o.payment_status === 'pending' || !o.payment_status);
                const remainSec = showCountdown ? getRemainSeconds(o) : 0;
                return (
                  <div 
                    key={o.id} 
                    className="card-modern overflow-hidden transform transition-all duration-300 ease-out animate-apple-fade-in hover:scale-102"
                    style={{ animationDelay: `${index * 0.1}s` }}
                  >
                    {/* header */}
                    <div className="px-4 sm:px-6 py-4 bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200">
                      {/* 手机端：纵向布局 */}
                      <div className="block md:hidden space-y-3">
                        {/* 第一行：状态、预约标签（左）和时间（右） */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap flex-1">
                            <StatusBadge status={us} />
                            {Boolean(o.is_reservation) && (
                              <span className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold text-white bg-gradient-to-r from-blue-500 to-sky-500 rounded-full shadow-sm">
                                <i className="fas fa-calendar-check"></i>
                                <span>预约订单</span>
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-gray-600 flex-shrink-0">
                            <i className="fas fa-calendar-alt"></i>
                            <span className="text-right">{formatDate(o.created_at_timestamp ?? o.created_at)}</span>
                          </div>
                        </div>
                        
                        {/* 第二行：倒计时（如果有） */}
                        {showCountdown && (
                          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-red-100 text-red-700 border border-red-200 w-fit">
                            <i className="fas fa-stopwatch text-red-500"></i>
                            <span className="text-xs font-semibold">
                              倒计时：{formatRemain(remainSec)}
                            </span>
                          </div>
                        )}
                        
                        {/* 第三行：金额和详情按钮 */}
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-lg font-bold text-gray-900">¥{o.total_amount}</p>
                            {o.discount_amount > 0 && (
                              <p className="text-xs text-pink-600">已用优惠券 -¥{Number(o.discount_amount).toFixed(2)}</p>
                            )}
                            <p className="text-xs text-gray-500">订单总额</p>
                          </div>
                          <button
                            onClick={() => setViewingOrder(o)}
                            className="flex items-center gap-2 px-3 py-2 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium text-gray-700 hover:text-gray-900 transition-colors whitespace-nowrap"
                          >
                            <i className="fas fa-eye"></i>
                            <span>查看详情</span>
                          </button>
                        </div>
                      </div>

                      {/* 电脑端：横向布局 */}
                      <div className="hidden md:flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <StatusBadge status={us} />
                          {Boolean(o.is_reservation) && (
                            <span className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold text-white bg-gradient-to-r from-blue-500 to-sky-500 rounded-full shadow-sm">
                              <i className="fas fa-calendar-check"></i>
                              <span>预约订单</span>
                            </span>
                          )}
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <i className="fas fa-calendar-alt"></i>
                            <span>{formatDate(o.created_at_timestamp ?? o.created_at)}</span>
                          </div>
                          {showCountdown && (
                            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-red-100 text-red-700 border border-red-200">
                              <i className="fas fa-stopwatch text-red-500"></i>
                              <span className="text-xs font-semibold">
                                倒计时：{formatRemain(remainSec)}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-lg font-bold text-gray-900">¥{o.total_amount}</p>
                            {o.discount_amount > 0 && (
                              <p className="text-xs text-pink-600">已用优惠券 -¥{Number(o.discount_amount).toFixed(2)}</p>
                            )}
                            <p className="text-xs text-gray-500">订单总额</p>
                          </div>
                          <button
                            onClick={() => setViewingOrder(o)}
                            className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
                          >
                            <i className="fas fa-eye"></i>
                            <span>查看详情</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* body */}
                    <div className="px-4 sm:px-6 py-4">
                      {/* 订单基本信息卡片 */}
                      <div className="bg-gray-50 rounded-xl p-4">
                        <div className="grid grid-cols-2 gap-4">
                            {/* 订单号 */}
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
                              <i className="fas fa-hashtag text-emerald-600 text-sm"></i>
                              </div>
                              <div className="min-w-0 flex-1">
                              <p className="text-xs text-gray-500">订单编号</p>
                              <p className="font-mono text-sm text-gray-900 truncate">{o.id.replace('order_', '')}</p>
                                </div>
                              </div>

                            {/* 支付方式 */}
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                              <i className="fas fa-credit-card text-green-600 text-sm"></i>
                              </div>
                            <div className="min-w-0">
                              <p className="text-xs text-gray-500">支付方式</p>
                                <div className="flex items-center gap-1">
                                  {o.payment_method === 'wechat' && <i className="fab fa-weixin text-green-500 text-xs"></i>}
                                <span className="text-sm text-gray-900 whitespace-nowrap">
                                    {o.payment_method === 'wechat' ? '微信支付' : (o.payment_method || '—')}
                                  </span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* 操作按钮（仅未付款时显示） */}
                        {us === '未付款' && (
                          <button 
                            onClick={() => handleShowPayModal(o.id)} 
                            className="btn-primary w-full mt-4 px-6 py-2.5 text-sm flex items-center justify-center gap-2 transform hover:scale-105 transition-all duration-300"
                          >
                            <i className="fas fa-credit-card"></i>
                            <span>{o.payment_status === 'failed' ? '重新付款' : '立即付款'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
                      </div>

      {/* 微信收款码弹窗 */}
      {payOrderId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-apple-fade-in px-4">
          <div className="absolute inset-0" onClick={() => { setPayOrderId(null); setPaymentQr(null); }}></div>
          <div className="relative card-glass max-w-sm w-full p-5 sm:p-8 border border-white/30 shadow-2xl animate-apple-scale-in z-10">
            {/* 弹窗标题 */}
            <div className="text-center mb-5 sm:mb-6">
              <div className="w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-3 sm:mb-4 shadow-lg">
                <i className="fab fa-weixin text-white text-xl sm:text-2xl"></i>
                              </div>
              <h3 className="text-lg sm:text-xl font-semibold text-white mb-1.5 sm:mb-2">微信扫码支付</h3>
              <p className="text-white/80 text-xs sm:text-sm">请使用微信扫描下方二维码完成支付</p>
                                </div>

            {/* 二维码区域 */}
            <div className="bg-white rounded-2xl p-3 sm:p-4 mb-5 sm:mb-6 shadow-lg">
              {paymentQr ? (
                paymentQr.owner_type === 'default' ? (
                  <div className="w-full h-64 sm:h-80 flex items-center justify-center bg-gray-50 rounded-xl border-2 border-dashed border-gray-300">
                    <div className="text-center px-4">
                      <div className="text-3xl sm:text-4xl mb-3 sm:mb-4">⚠️</div>
                      <p className="text-gray-600 text-sm sm:text-lg font-medium">暂不可付款，请联系管理员</p>
                              </div>
                            </div>
                ) : (
                  <div className="text-center">
                    <img 
                      src={paymentQr.image_path} 
                      alt={paymentQr.name || "收款码"} 
                      className="w-full h-64 sm:h-80 object-contain rounded-xl" 
                    />
                              </div>
                )
              ) : (
                <div className="w-full h-64 sm:h-80 flex items-center justify-center bg-gray-100 rounded-xl">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-7 w-7 sm:h-8 sm:w-8 border-b-2 border-gray-600 mx-auto mb-2"></div>
                    <p className="text-gray-600 text-xs sm:text-sm">正在加载收款码...</p>
                                </div>
                              </div>
              )}
                            </div>

            {/* 操作按钮 */}
            <div className="space-y-2.5 sm:space-y-3">
              <button
                onClick={() => handleMarkPaid(payOrderId)}
                disabled={paymentQr && paymentQr.owner_type === 'default'}
                className="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white py-2.5 sm:py-3 px-4 rounded-xl text-sm sm:text-base font-medium hover:from-green-600 hover:to-emerald-700 transform hover:scale-105 transition-all duration-300 shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              >
                <i className="fas fa-check-circle"></i>
                <span>我已完成付款</span>
              </button>
              
              <button
                onClick={() => { setPayOrderId(null); setPaymentQr(null); }}
                className="w-full bg-white/20 backdrop-blur-sm text-white py-2.5 sm:py-3 px-4 rounded-xl text-sm sm:text-base font-medium hover:bg-white/30 border border-white/30 transition-all duration-300 flex items-center justify-center gap-2"
              >
                <i className="fas fa-clock"></i>
                <span>稍后支付</span>
              </button>
                          </div>

            {/* 关闭按钮 */}
            <button
              onClick={() => { setPayOrderId(null); setPaymentQr(null); }}
              className="absolute top-3 right-3 sm:top-4 sm:right-4 w-7 h-7 sm:w-8 sm:h-8 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center text-white/80 hover:text-white transition-all duration-200"
            >
              <i className="fas fa-times text-sm"></i>
            </button>
                        </div>
        </div>
      )}

      {/* 订单详情弹窗 */}
      {viewingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-apple-fade-in px-4">
          <div className="absolute inset-0" onClick={() => setViewingOrder(null)}></div>
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl mx-4 max-h-[85vh] flex flex-col overflow-hidden animate-apple-scale-in z-10">
            {/* 右上角关闭按钮 */}
                            <button 
              onClick={() => setViewingOrder(null)}
              className="absolute top-3 right-3 sm:top-4 sm:right-4 z-10 w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-white hover:bg-gray-100 flex items-center justify-center text-gray-600 shadow-lg transition-all hover:scale-110"
                            >
              <i className="fas fa-times"></i>
                            </button>
            
            {/* 标题栏 */}
            <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-orange-50 via-amber-50 to-yellow-50">
              <div className="flex flex-col gap-3">
                <div>
                  <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    <i className="fas fa-receipt text-orange-600"></i>
                    订单详情
                  </h3>
                  <p className="text-sm text-gray-600 mt-1 font-mono break-all">订单号：{viewingOrder.id}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <StatusBadge status={getUnifiedStatus(viewingOrder)} />
                  {viewingOrder.is_reservation && (
                    <span className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold text-white bg-gradient-to-r from-blue-500 to-sky-500 rounded-full shadow-sm">
                      <i className="fas fa-calendar-check"></i>
                      <span>预约订单</span>
                    </span>
                  )}
                  <div className="text-xs text-gray-500">创建时间：{formatDate(viewingOrder.created_at_timestamp ?? viewingOrder.created_at)}</div>
                                </div>
                        </div>
                      </div>

            {/* 内容区域 */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                          {/* 商品明细 */}
                          <div>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-6 h-6 bg-orange-100 rounded-lg flex items-center justify-center">
                      <i className="fas fa-shopping-basket text-orange-600 text-xs"></i>
                              </div>
                    <h4 className="text-sm font-semibold text-gray-900">商品明细</h4>
                            </div>
                  <div className="space-y-3">
                    {collapseAutoGiftItemsForDisplay(viewingOrder.items || [])
                      .sort((a, b) => {
                        // 非卖品排到最后
                        const aIsNonSellable = Boolean(a.is_not_for_sale);
                        const bIsNonSellable = Boolean(b.is_not_for_sale);
                        if (aIsNonSellable && !bIsNonSellable) return 1;
                        if (!aIsNonSellable && bIsNonSellable) return -1;
                        return 0;
                      })
                      .map((it, idx) => (
                                <div 
                                  key={(it.product_id + (it.variant_id || '')) + '_' + idx} 
                        className="bg-white border border-gray-200 rounded-xl p-3 hover:shadow-md transition-shadow"
                                >
                        <div className="flex justify-between items-start gap-3">
                                    <div className="flex-1 min-w-0">
                            <h5 className="font-medium text-gray-900 text-sm flex items-center gap-2 flex-wrap">
                                        <span className="break-words">{it.name}</span>
                                        {it.is_lottery && (
                                <span className="px-2 py-0.5 text-[10px] rounded-full bg-pink-100 text-pink-700 border border-pink-200 whitespace-nowrap">抽奖</span>
                                        )}
                                        {it.is_auto_gift && (
                                <span className="px-2 py-0.5 text-[10px] rounded-full bg-green-100 text-green-700 border border-green-200 whitespace-nowrap">赠品</span>
                                        )}
                                        {it.is_reservation && (
                                <span className="px-2 py-0.5 text-[10px] rounded-full bg-blue-100 text-blue-700 border border-blue-200 whitespace-nowrap">预约</span>
                                        )}
                                        {it.is_not_for_sale && (
                                <span className="px-2 py-0.5 text-[10px] rounded-full bg-purple-100 text-purple-700 border border-purple-200 whitespace-nowrap">非卖</span>
                                        )}
                                      </h5>
                                      {it.variant_name && (
                              <span className="inline-block mt-1 px-2 py-0.5 bg-cyan-100 text-cyan-600 text-xs rounded-full border border-cyan-200">
                                          {it.variant_name}
                                        </span>
                                      )}
                            <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 flex-wrap">
                                        <span className="flex items-center gap-1">
                                          <i className="fas fa-cubes"></i>
                                          数量: {it.quantity}
                                        </span>
                                        <span className="flex items-center gap-1">
                                          <i className="fas fa-tag"></i>
                                          单价: ¥{it.unit_price}
                                        </span>
                                      </div>
                                      {it.is_reservation && (
                              <div className="mt-2 text-[11px] text-blue-600 leading-snug break-words">
                                          {formatReservationCutoff(it.reservation_cutoff)}
                                          {it.reservation_note ? ` · ${it.reservation_note}` : ''}
                                        </div>
                                      )}
                                      {(it.is_lottery || it.is_auto_gift) && (
                              <div className="mt-2 text-xs text-pink-600">
                                          <div className="font-medium break-words">
                                            {it.is_lottery ? '抽奖赠' : '满额赠'}：{(it.is_lottery ? (it.lottery_product_name || it.name) : (it.auto_gift_product_name || it.name))}
                                            {(it.is_lottery ? it.lottery_variant_name : it.auto_gift_variant_name) ? `（${it.is_lottery ? it.lottery_variant_name : it.auto_gift_variant_name}）` : ''}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                          <div className="text-right flex-shrink-0">
                            <p className="font-semibold text-gray-900 text-base">¥{it.subtotal}</p>
                                      <p className="text-xs text-gray-500">小计</p>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                          
                          {/* 收货信息 */}
                          <div>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-6 h-6 bg-green-100 rounded-lg flex items-center justify-center">
                      <i className="fas fa-map-marker-alt text-green-600 text-xs"></i>
                              </div>
                    <h4 className="text-sm font-semibold text-gray-900">收货信息</h4>
                            </div>
                  <div className="bg-white border border-gray-200 rounded-xl p-4">
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <i className="fas fa-user text-emerald-600 text-sm"></i>
                                  </div>
                                  <div className="min-w-0">
                          <p className="text-xs text-gray-500">收件人</p>
                          <p className="text-sm font-medium text-gray-900 break-words">{viewingOrder.shipping_info?.name}</p>
                                  </div>
                                </div>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <i className="fas fa-phone text-green-600 text-sm"></i>
                                  </div>
                                  <div className="min-w-0">
                          <p className="text-xs text-gray-500">联系电话</p>
                          <p className="text-sm font-medium text-gray-900 break-words">{viewingOrder.shipping_info?.phone}</p>
                                  </div>
                                </div>
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 bg-cyan-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <i className="fas fa-home text-cyan-600 text-sm"></i>
                                  </div>
                                  <div className="min-w-0 flex-1">
                          <p className="text-xs text-gray-500">收货地址</p>
                          <p className="text-sm font-medium text-gray-900 break-words leading-relaxed">{viewingOrder.shipping_info?.full_address}</p>
                                  </div>
                                </div>
                      {viewingOrder.note && (
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                            <i className="fas fa-comment text-orange-600 text-sm"></i>
                                    </div>
                                    <div className="min-w-0 flex-1">
                            <p className="text-xs text-gray-500">订单备注</p>
                            <p className="text-sm font-medium text-gray-900 break-words leading-relaxed">{viewingOrder.note}</p>
                                    </div>
                                  </div>
                                )}
                      {viewingOrder.shipping_info?.reservation && (
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                            <i className="fas fa-calendar-day text-blue-600 text-sm"></i>
                                    </div>
                                    <div className="min-w-0 flex-1">
                            <p className="text-xs text-gray-500">预约说明</p>
                            <p className="text-sm font-medium text-blue-600 leading-relaxed break-words">
                              {(Array.isArray(viewingOrder.shipping_info?.reservation_reasons) && viewingOrder.shipping_info.reservation_reasons.length > 0)
                                ? viewingOrder.shipping_info.reservation_reasons.join('，')
                                          : '预约订单'}
                              {viewingOrder.shipping_info?.reservation_closure_note ? ` · ${viewingOrder.shipping_info.reservation_closure_note}` : ''}
                                      </p>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>

                  {/* 金额汇总 */}
                  <div className="mt-4 bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl p-4 border border-gray-200">
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">商品总额</span>
                        <span className="font-medium text-gray-900">¥{viewingOrder.total_amount}</span>
                          </div>
                      {viewingOrder.discount_amount > 0 && (
                        <div className="flex justify-between text-sm text-pink-600">
                          <span>优惠券减免</span>
                          <span>-¥{Number(viewingOrder.discount_amount).toFixed(2)}</span>
                        </div>
                      )}
                      <div className="pt-2 border-t border-gray-300 flex justify-between items-center">
                        <span className="font-semibold text-gray-900">订单总额</span>
                        <span className="text-lg font-bold text-orange-600">¥{viewingOrder.total_amount}</span>
                    </div>
                  </div>
            </div>
      </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 抽奖弹窗 */}
      {lotteryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="absolute inset-0" onClick={() => { setLotteryOpen(false); setLotteryPrize(null); }}></div>
          <div className="relative max-w-sm w-full p-5 sm:p-6 rounded-2xl bg-white shadow-2xl z-10">
            <div className="text-center mb-4">
              <h3 className="text-base sm:text-lg font-semibold">抽奖中</h3>
              <p className="text-gray-500 text-xs sm:text-sm mt-1">订单满{formattedLotteryThreshold}元即可参与抽奖</p>
            </div>
            <div className="h-16 sm:h-20 flex items-center justify-center mb-4">
              <span className={`text-xl sm:text-2xl font-bold ${spinning ? 'animate-pulse' : ''}`}>{lotteryDisplay}</span>
            </div>
            {!spinning && (
              <>
                <div className="text-center mb-4 space-y-2">
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs sm:text-sm font-medium ${
                    lotteryResult === '谢谢参与' 
                      ? 'bg-gray-100 text-gray-700' 
                      : 'bg-amber-100 text-amber-700'
                  }`}>
                    {lotteryResult === '谢谢参与' ? '谢谢参与' : `恭喜获得：${lotteryResult || '谢谢参与'}`}
                  </span>
                  {lotteryPrize ? (
                    <div className="text-[10px] sm:text-xs text-gray-600 space-y-1 px-2">
                      <div className="break-words">具体奖品：{lotteryPrize.product_name || '未命名奖品'}{lotteryPrize.variant_name ? `（${lotteryPrize.variant_name}）` : ''}</div>
                      <div className="text-gray-500">将在下次满额订单随单配送</div>
                    </div>
                  ) : (
                    <div className="text-[10px] sm:text-xs text-gray-500">本次未中奖，继续加油！</div>
                  )}
                </div>
                <div className="flex gap-3">
                  <button onClick={() => { setLotteryOpen(false); setLotteryPrize(null); }} className="flex-1 bg-gradient-to-r from-emerald-500 to-cyan-600 hover:from-emerald-600 hover:to-cyan-700 text-white py-2.5 sm:py-2 rounded-xl text-sm sm:text-base font-medium transition-all">知道了</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
