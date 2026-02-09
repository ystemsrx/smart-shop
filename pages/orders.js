import React, { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Nav from '../components/Nav';
import { useAuth, useApi, useCart } from '../hooks/useAuth';
import { useRouter } from 'next/router';
import { getShopName } from '../utils/runtimeConfig';
import { getProductImage } from '../utils/urls';

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

const UNIFIED_STATUS_ORDER = ['全部', '未付款', '待确认', '待配送', '配送中', '已完成'];

// 手机端显示的简化筛选选项
const MOBILE_FILTER_ORDER = ['全部', '待确认', '已确认', '已完成'];

// 手机端筛选映射到实际状态
const MOBILE_FILTER_MAP = {
  '全部': ['全部'],
  '待确认': ['未付款', '待确认'],
  '已确认': ['待配送', '配送中'],
  '已完成': ['已完成']
};

function StatusBadge({ status }) {
  const config = {
    '未付款': { bg: 'bg-slate-100', text: 'text-slate-600', icon: 'fa-credit-card', ring: 'ring-slate-200' },
    '待确认': { bg: 'bg-amber-50', text: 'text-amber-600', icon: 'fa-clock', ring: 'ring-amber-200' },
    '待配送': { bg: 'bg-sky-50', text: 'text-sky-600', icon: 'fa-box', ring: 'ring-sky-200' },
    '配送中': { bg: 'bg-violet-50', text: 'text-violet-600', icon: 'fa-truck', ring: 'ring-violet-200' },
    '已完成': { bg: 'bg-emerald-50', text: 'text-emerald-600', icon: 'fa-check-circle', ring: 'ring-emerald-200' },
  }[status] || { bg: 'bg-gray-50', text: 'text-gray-600', icon: 'fa-circle', ring: 'ring-gray-200' };

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text} ring-1 ring-inset ${config.ring} transition-all duration-300`}>
      <i className={`fas ${config.icon} text-[10px]`}></i>
      <span>{status}</span>
    </span>
  );
}

export default function Orders() {
  const router = useRouter();
  const { user, isInitialized } = useAuth();
  const { apiRequest } = useApi();
  const { clearCart } = useCart();
  const shopName = getShopName();
  const pageTitle = `我的订单 - ${shopName}`;

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payOrderId, setPayOrderId] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [viewingOrder, setViewingOrder] = useState(null);
  const [filter, setFilter] = useState('全部');
  const [isClosing, setIsClosing] = useState(false);

  const handleCloseOrderModal = () => {
    setIsClosing(true);
    setTimeout(() => {
      setViewingOrder(null);
      setIsClosing(false);
    }, 300);
  };
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
    if (!router.isReady || !isInitialized) return;
    if (!user) {
      const redirect = encodeURIComponent(router.asPath || '/orders');
      router.replace(`/login?redirect=${redirect}`);
      return;
    }
  }, [user, isInitialized, router, router.asPath, router.isReady]);

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
      console.error('Invalid order creation timestamp:', createdTimestamp, o);
      return 0;
    }
    
    // 计算过期时间（创建时间 + 15分钟）
    const expireTimestamp = createdTimestamp + (15 * 60); // 15分钟，单位秒
    
    // 当前时间戳（秒）
    const nowTimestamp = Math.floor(Date.now() / 1000);
    
    // 计算剩余秒数
    const remainSeconds = Math.max(0, expireTimestamp - nowTimestamp);
    
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
      console.warn('Failed to load payment QR:', e);
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

  // 根据筛选条件过滤订单 - 必须在所有条件返回之前调用（React Hooks规则）
  const filteredOrders = useMemo(() => {
    if (filter === '全部') return orders;
    
    // 检查是否是手机端的合并筛选
    const mappedStatuses = MOBILE_FILTER_MAP[filter];
    if (mappedStatuses && mappedStatuses[0] !== '全部') {
      return orders.filter(o => mappedStatuses.includes(getUnifiedStatus(o)));
    }
    
    // 桌面端的单一状态筛选
    return orders.filter(o => getUnifiedStatus(o) === filter);
  }, [orders, filter]);

  // 提前返回必须在所有hooks之后
  if (!user) return null;

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
        <title>{pageTitle}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>

      {/* 顶部导航（移动端优化） */}
      <Nav active="orders" />

      <div className="min-h-screen bg-[#F5F5F7] pt-20 pb-12 selection:bg-orange-100 selection:text-orange-900">
        <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          
          {/* 页面标题 */}
          <div className="mb-10 mt-4 animate-fade-in-up">
            <h1 className="text-4xl font-bold text-gray-900 tracking-tight">我的订单</h1>
            <p className="mt-2 text-lg text-gray-500">查看及管理您的历史订单</p>
          </div>

          {error && (
            <div className="mb-6 bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-2xl text-sm animate-fade-in-up">
              <i className="fas fa-exclamation-circle mr-2"></i>
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-32 animate-fade-in-up">
              <div className="w-10 h-10 border-4 border-gray-200 border-t-orange-500 rounded-full animate-spin"></div>
              <p className="mt-4 text-gray-400 text-sm font-medium">正在加载订单...</p>
            </div>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 animate-fade-in-up">
              <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-6">
                <i className="fas fa-shopping-bag text-gray-300 text-3xl"></i>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">暂无订单</h3>
              <p className="text-gray-500 mb-8 max-w-xs text-center">您还没有购买过任何商品，去商城逛逛吧</p>
              <Link 
                href="/shop" 
                className="px-8 py-3 bg-gray-900 hover:bg-black text-white rounded-full font-medium transition-all transform hover:scale-105 shadow-lg shadow-gray-200"
              >
                前往商城
              </Link>
            </div>
          ) : (
            <>
              {/* 筛选器 - 手机端 */}
              <div className="sticky top-16 z-30 -mx-4 sm:hidden mb-8 px-4 animate-fade-in-up" style={{ animationDelay: '0.05s', animationFillMode: 'both' }}>
                <div className="bg-white/80 backdrop-blur-xl border border-white/20 shadow-sm rounded-2xl p-1.5 flex overflow-x-auto hide-scrollbar snap-x relative">
                  {/* 滑动背景 */}
                  <div 
                    className="absolute top-1.5 bottom-1.5 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.08)] rounded-xl transition-all duration-300 ease-out z-0"
                    style={{
                      left: `calc(6px + ${MOBILE_FILTER_ORDER.indexOf(filter)} * ((100% - 12px) / ${MOBILE_FILTER_ORDER.length}))`,
                      width: `calc((100% - 12px) / ${MOBILE_FILTER_ORDER.length})`
                    }}
                  ></div>

                  {MOBILE_FILTER_ORDER.map((label) => (
                    <button
                      key={label}
                      onClick={() => setFilter(label)}
                      className={`flex-1 px-4 py-2 rounded-xl text-sm font-medium transition-colors duration-300 snap-start whitespace-nowrap justify-center relative z-10 ${
                        filter === label ? 'text-gray-900' : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 筛选器 - 桌面端 */}
              <div className="sticky top-16 z-30 hidden sm:block mb-8 animate-fade-in-up" style={{ animationDelay: '0.05s', animationFillMode: 'both' }}>
                <div className="bg-white/80 backdrop-blur-xl border border-white/20 shadow-sm rounded-2xl p-1.5 flex overflow-x-auto hide-scrollbar snap-x relative">
                  {/* 滑动背景 */}
                  <div 
                    className="absolute top-1.5 bottom-1.5 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.08)] rounded-xl transition-all duration-300 ease-out z-0"
                    style={{
                      left: `calc(6px + ${UNIFIED_STATUS_ORDER.indexOf(filter)} * ((100% - 12px) / ${UNIFIED_STATUS_ORDER.length}))`,
                      width: `calc((100% - 12px) / ${UNIFIED_STATUS_ORDER.length})`
                    }}
                  ></div>

                  {UNIFIED_STATUS_ORDER.map((label) => (
                    <button
                      key={label}
                      onClick={() => setFilter(label)}
                      className={`flex-1 px-4 py-2 rounded-xl text-sm font-medium transition-colors duration-300 snap-start whitespace-nowrap justify-center relative z-10 ${
                        filter === label ? 'text-gray-900' : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 订单列表 */}
              <div className="space-y-4" key={filter}>
                {filteredOrders.length === 0 ? (
                  <div className="text-center py-20 bg-white rounded-3xl border border-gray-100 shadow-sm animate-fade-in-up">
                    <p className="text-gray-400">暂无「{filter}」状态的订单</p>
                    <button
                      onClick={() => setFilter('全部')}
                      className="mt-4 text-orange-600 font-medium hover:text-orange-700 text-sm"
                    >
                      查看全部
                    </button>
                  </div>
                ) : filteredOrders.map((o, index) => {
                  const us = getUnifiedStatus(o);
                  const showCountdown = us === '未付款' && (o.payment_status === 'pending' || !o.payment_status);
                  const remainSec = showCountdown ? getRemainSeconds(o) : 0;
                  
                  return (
                    <div 
                      key={o.id} 
                      className="group bg-white rounded-3xl p-5 sm:p-6 shadow-[0_2px_12px_rgba(0,0,0,0.02)] border border-gray-100 hover:shadow-[0_8px_24px_rgba(0,0,0,0.04)] hover:border-gray-200 transition-all duration-300 animate-fade-in-up"
                      style={{ animationDelay: `${index * 0.03}s`, animationFillMode: 'both' }}
                    >
                      {/* 订单头部 - 移动端优化布局 */}
                      <div className="flex flex-wrap items-center justify-between gap-y-3 gap-x-4 mb-5">
                        <div className="flex items-center gap-2 sm:gap-3">
                          <StatusBadge status={us} />
                          <span className="text-xs text-gray-400 font-mono tracking-wide">#{o.id.replace(/^order_/, '').slice(-8)}</span>
                          {Boolean(o.is_reservation) && (
                            <span className="px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-600 text-[10px] font-medium border border-blue-100">
                              预约
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-400">
                          <span>{formatDate(o.created_at_timestamp ?? o.created_at)}</span>
                          {showCountdown && (
                            <span className="flex items-center gap-1.5 text-orange-600 bg-orange-50 px-2 py-0.5 rounded-lg animate-pulse">
                              <i className="fas fa-clock text-[10px]"></i>
                              <span className="font-mono font-bold">{formatRemain(remainSec)}</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 极简节点式进度条 */}
                      <div className="mb-6 px-2">
                        <div className="flex items-center justify-between relative">
                          {/* 背景连线 - 虚线 */}
                          <div className="absolute top-1 left-0 w-full h-[1px] border-t border-dashed border-gray-200 -z-10"></div>
                          
                          {['未付款', '待确认', '待配送', '配送中', '已完成'].map((step, idx) => {
                            const steps = ['未付款', '待确认', '待配送', '配送中', '已完成'];
                            const currentIdx = steps.indexOf(us);
                            const isCompleted = idx < currentIdx;
                            const isCurrent = idx === currentIdx;
                            const isPending = idx > currentIdx;
                            const isLastStepCompleted = step === '已完成' && us === '已完成';
                            
                            // 定义每个状态的主题色
                            const stepColors = {
                              '未付款': 'text-slate-500 border-slate-500 bg-slate-500',
                              '待确认': 'text-amber-500 border-amber-500 bg-amber-500',
                              '待配送': 'text-cyan-500 border-cyan-500 bg-cyan-500',
                              '配送中': 'text-blue-500 border-blue-500 bg-blue-500',
                              '已完成': 'text-emerald-500 border-emerald-500 bg-emerald-500'
                            };
                            const colorClass = stepColors[step] || 'text-gray-400 border-gray-400 bg-gray-400';
                            const borderColor = colorClass.split(' ')[1];
                            const bgColor = colorClass.split(' ')[2];
                            const textColor = colorClass.split(' ')[0];

                            return (
                              <div key={step} className="flex flex-col items-center group">
                                {/* 节点圆点 */}
                                <div className={`
                                  w-2 h-2 rounded-full border-[1.5px] transition-all duration-300 z-10 bg-white
                                  ${isCompleted ? borderColor : ''}
                                  ${isCurrent ? `${borderColor} scale-150 shadow-[0_0_0_3px_rgba(255,255,255,1),0_0_0_4px_rgba(0,0,0,0.05)]` : ''}
                                  ${isPending ? 'border-gray-200' : ''}
                                `}></div>
                                
                                {/* 节点文字 */}
                                <div className={`
                                  text-[10px] mt-2 transition-colors duration-300 font-medium
                                  ${isCurrent ? `${textColor} font-bold` : 'text-gray-300'}
                                `}>
                                  {step}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* 订单内容摘要 */}
                      <div className="flex flex-col sm:flex-row gap-5 items-start sm:items-center justify-between bg-gray-50/50 rounded-2xl p-4 border border-gray-100/50">
                        <div className="flex-1 space-y-1">
                          <div className="flex items-baseline gap-2">
                            <span className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight font-mono">¥{o.total_amount}</span>
                            <span className="text-xs sm:text-sm text-gray-500">共 {o.items?.reduce((acc, i) => acc + (Number(i.quantity)||0), 0)} 件</span>
                          </div>
                          {o.discount_amount > 0 && (
                            <div className="text-xs text-pink-500 font-medium flex items-center gap-1">
                              <i className="fas fa-tag text-[10px]"></i>
                              已优惠 ¥{Number(o.discount_amount).toFixed(2)}
                            </div>
                          )}
                        </div>

                        {/* 操作按钮组 */}
                        <div className="flex items-center gap-3 w-full sm:w-auto mt-2 sm:mt-0">
                          <button
                            onClick={() => setViewingOrder(o)}
                            className="flex-1 sm:flex-none px-5 py-2 rounded-xl bg-white border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm"
                          >
                            详情
                          </button>
                          {us === '未付款' && (
                            <button 
                              onClick={() => handleShowPayModal(o.id)} 
                              className="flex-1 sm:flex-none px-6 py-2 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-black transition-all shadow-lg shadow-gray-200 transform active:scale-95 flex items-center justify-center gap-2"
                            >
                              <span>去支付</span>
                              <i className="fas fa-arrow-right text-xs opacity-60"></i>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </main>
      </div>

      {/* 支付弹窗 */}
      {payOrderId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm transition-opacity" onClick={() => { setPayOrderId(null); setPaymentQr(null); }}></div>
          <div className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden transform transition-all animate-fade-in-up">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-green-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <i className="fab fa-weixin text-green-600 text-3xl"></i>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-1">微信支付</h3>
              <p className="text-sm text-gray-500 mb-6">请使用微信扫一扫完成支付</p>
              
              <div className="bg-gray-50 p-4 rounded-2xl mb-6 border border-gray-100">
                {paymentQr ? (
                  paymentQr.owner_type === 'default' ? (
                    <div className="h-64 flex flex-col items-center justify-center text-gray-400">
                      <i className="fas fa-exclamation-triangle text-2xl mb-2"></i>
                      <span className="text-sm">暂无收款码</span>
                    </div>
                  ) : (
                    <img src={paymentQr.image_path} alt="Payment QR" className="w-full h-64 object-contain rounded-lg mix-blend-multiply" />
                  )
                ) : (
                  <div className="h-64 flex items-center justify-center">
                    <div className="w-8 h-8 border-2 border-gray-200 border-t-green-500 rounded-full animate-spin"></div>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => handleMarkPaid(payOrderId)}
                  disabled={paymentQr && paymentQr.owner_type === 'default'}
                  className="w-full py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-medium transition-colors shadow-lg shadow-green-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  我已完成支付
                </button>
                <button
                  onClick={() => { setPayOrderId(null); setPaymentQr(null); }}
                  className="w-full py-3 text-gray-500 hover:text-gray-700 font-medium text-sm"
                >
                  稍后支付
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 订单详情弹窗 */}
      {viewingOrder && (
        <div className={`fixed inset-0 z-[60] flex items-center justify-center p-4 transition-opacity duration-300 ${isClosing ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
          <div className="absolute inset-0 bg-gray-900/30 backdrop-blur-sm" onClick={handleCloseOrderModal}></div>
          <div className={`relative w-full max-w-2xl bg-white max-h-[85vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden transform transition-all duration-300 ${isClosing ? 'scale-95 opacity-0' : 'animate-fade-in-up'}`}>
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-10">
              <div>
                <h3 className="text-lg font-bold text-gray-900">订单详情</h3>
                <p className="text-xs text-gray-400 font-mono mt-0.5">{viewingOrder.id}</p>
              </div>
              <button 
                onClick={handleCloseOrderModal}
                className="w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center text-gray-500 transition-colors"
              >
                <i className="fas fa-times text-sm"></i>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              {/* Status Section */}
              <div className="bg-gray-50 rounded-2xl p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 mb-1">当前状态</p>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={getUnifiedStatus(viewingOrder)} />
                    {Boolean(viewingOrder.is_reservation) && (
                      <span className="text-xs text-blue-600 font-medium bg-blue-50 px-2 py-0.5 rounded-md">预约单</span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500 mb-1">订单总额</p>
                  <p className="text-xl font-bold text-gray-900">¥{viewingOrder.total_amount}</p>
                </div>
              </div>

              {/* Items */}
              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <i className="fas fa-box-open text-gray-400"></i>
                  商品清单
                </h4>
                <div className="space-y-3">
                  {collapseAutoGiftItemsForDisplay(viewingOrder.items || []).map((it, idx) => {
                    const imageSrc = getProductImage(it);
                    return (
                      <div key={idx} className="flex items-start gap-4 py-3 border-b border-gray-50 last:border-0">
                        {imageSrc ? (
                          <img src={imageSrc} alt={it.name} className="w-12 h-12 rounded-xl object-cover flex-shrink-0 border border-gray-100" />
                        ) : (
                          <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center flex-shrink-0 text-gray-400">
                            <i className="fas fa-cube"></i>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start">
                            <h5 className="text-sm font-medium text-gray-900 truncate pr-2">{it.name}</h5>
                            <span className="text-sm font-medium text-gray-900 whitespace-nowrap">¥{it.subtotal}</span>
                          </div>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {it.variant_name && <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{it.variant_name}</span>}
                            <span className="text-[10px] text-gray-500">x{it.quantity}</span>
                          </div>
                          {(it.is_lottery || it.is_auto_gift) && (
                            <p className="text-[10px] text-pink-500 mt-1">
                              {it.is_lottery ? '抽奖赠品' : '满额赠品'}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Info Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 mb-3">配送信息</h4>
                  <div className="bg-white border border-gray-100 rounded-2xl p-4 space-y-3 text-sm">
                    <div className="flex gap-3">
                      <span className="text-gray-400 flex-shrink-0 w-12">收件人</span>
                      <span className="text-gray-900 font-medium">{viewingOrder.shipping_info?.name}</span>
                    </div>
                    <div className="flex gap-3">
                      <span className="text-gray-400 flex-shrink-0 w-12">电话</span>
                      <span className="text-gray-900 font-medium">{viewingOrder.shipping_info?.phone}</span>
                    </div>
                    <div className="flex gap-3">
                      <span className="text-gray-400 flex-shrink-0 w-12">地址</span>
                      <span className="text-gray-900 leading-relaxed">{viewingOrder.shipping_info?.full_address}</span>
                    </div>
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 mb-3">其他信息</h4>
                  <div className="bg-white border border-gray-100 rounded-2xl p-4 space-y-3 text-sm">
                    <div className="flex gap-3">
                      <span className="text-gray-400 flex-shrink-0 w-16">支付方式</span>
                      <span className="text-gray-900">{viewingOrder.payment_method === 'wechat' ? '微信支付' : viewingOrder.payment_method || '-'}</span>
                    </div>
                    <div className="flex gap-3">
                      <span className="text-gray-400 flex-shrink-0 w-16">下单时间</span>
                      <span className="text-gray-900">{formatDate(viewingOrder.created_at_timestamp ?? viewingOrder.created_at)}</span>
                    </div>
                    {viewingOrder.note && (
                      <div className="flex gap-3">
                        <span className="text-gray-400 flex-shrink-0 w-16">备注</span>
                        <span className="text-gray-900">{viewingOrder.note}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            
            {/* Footer */}
            <div className="p-4 border-t border-gray-100 bg-gray-50/50">
              <button 
                onClick={() => copyToClipboard(viewingOrder.id)}
                className="w-full py-3 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
              >
                <i className="fas fa-copy"></i>
                {copiedOrderId === viewingOrder.id ? '已复制' : '复制订单号'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 抽奖弹窗 */}
      {lotteryOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm transition-opacity" onClick={() => { setLotteryOpen(false); setLotteryPrize(null); }}></div>
          <div className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden transform transition-all animate-fade-in-up">
            <div className="p-8 text-center">
              <div className="w-20 h-20 bg-gradient-to-br from-amber-100 to-orange-100 rounded-full flex items-center justify-center mx-auto mb-6 animate-bounce-slow">
                <i className="fas fa-gift text-orange-500 text-4xl"></i>
              </div>
              
              <h3 className="text-2xl font-bold text-gray-900 mb-2">幸运抽奖</h3>
              <p className="text-sm text-gray-500 mb-8">订单满 {formattedLotteryThreshold} 元即可参与</p>

              <div className="bg-gray-50 rounded-2xl p-6 mb-8 border border-gray-100">
                <div className={`text-2xl font-bold ${spinning ? 'text-orange-500 animate-pulse' : 'text-gray-900'}`}>
                  {lotteryDisplay}
                </div>
                {!spinning && lotteryResult && (
                  <div className="mt-2 text-sm font-medium text-gray-500">
                    {lotteryResult === '谢谢参与' ? '下次好运！' : '恭喜中奖！'}
                  </div>
                )}
              </div>

              {!spinning && (
                <div className="space-y-4 animate-fade-in-up">
                  {lotteryPrize && (
                    <div className="text-sm text-gray-600 bg-orange-50 p-3 rounded-xl border border-orange-100">
                      <p className="font-medium text-orange-800 mb-1">奖品详情</p>
                      <p>{lotteryPrize.product_name || '未命名奖品'}</p>
                      {lotteryPrize.variant_name && <p className="text-xs mt-0.5 opacity-75">({lotteryPrize.variant_name})</p>}
                      <p className="text-xs text-orange-600/70 mt-2">将在下次满额订单中随单配送</p>
                    </div>
                  )}
                  
                  <button 
                    onClick={() => { setLotteryOpen(false); setLotteryPrize(null); }}
                    className="w-full py-3 bg-gray-900 hover:bg-black text-white rounded-xl font-medium transition-all shadow-lg shadow-gray-200"
                  >
                    知道了
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
