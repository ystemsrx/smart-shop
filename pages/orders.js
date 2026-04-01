import React, { useEffect, useMemo, useState, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';

import { useAuth, useApi, useCart } from '../hooks/useAuth';
import { useRouter } from 'next/router';
import { getShopName } from '../utils/runtimeConfig';
import { getProductImage } from '../utils/urls';

// 格式化预约截止时间显示
const formatReservationCutoff = (cutoffTime) => {
  if (!cutoffTime) return '需提前预约';
  const now = new Date();
  const [hours, minutes] = cutoffTime.split(':').map(Number);
  const todayCutoff = new Date();
  todayCutoff.setHours(hours, minutes, 0, 0);
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
  if (st === 'cancelled') return '已取消';
  if (ps === 'processing') return '待确认';
  if (ps !== 'succeeded') return '未付款';
  if (st === 'shipped') return '配送中';
  if (st === 'delivered') return '已完成';
  return '待配送';
};

const UNIFIED_STATUS_ORDER = ['全部', '未付款', '待确认', '待配送', '配送中', '已完成', '已取消'];

// 手机端显示的简化筛选选项
const MOBILE_FILTER_ORDER = ['全部', '待确认', '已确认', '已完成'];

// 手机端筛选映射到实际状态
const MOBILE_FILTER_MAP = {
  '全部': ['全部'],
  '待确认': ['未付款', '待确认'],
  '已确认': ['待配送', '配送中'],
  '已完成': ['已完成', '已取消']
};

// Status config
const STATUS_CONFIG = {
  '未付款': { bg: 'bg-slate-100',   text: 'text-slate-600',   icon: 'fa-credit-card',  ring: 'ring-slate-200' },
  '待确认': { bg: 'bg-amber-50',    text: 'text-amber-600',   icon: 'fa-clock',         ring: 'ring-amber-200' },
  '待配送': { bg: 'bg-sky-50',      text: 'text-sky-600',     icon: 'fa-box',           ring: 'ring-sky-200' },
  '配送中': { bg: 'bg-violet-50',   text: 'text-violet-600',  icon: 'fa-truck',         ring: 'ring-violet-200' },
  '已完成': { bg: 'bg-emerald-50',  text: 'text-emerald-600', icon: 'fa-check-circle',  ring: 'ring-emerald-200' },
  '已取消': { bg: 'bg-gray-100',    text: 'text-gray-600',    icon: 'fa-ban',           ring: 'ring-gray-200' },
};

function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status] || { bg: 'bg-gray-50', text: 'text-gray-600', icon: 'fa-circle', ring: 'ring-gray-200' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium opacity-80 ${config.bg} ${config.text} ring-1 ring-inset ${config.ring} transition-all duration-300`}>
      <i className={`fas ${config.icon} text-[10px]`}></i>
      <span>{status}</span>
    </span>
  );
}

// Progress steps - original colors
const PROGRESS_STEPS = [
  { key: '未付款', color: '#64748b' },   // slate-500
  { key: '待确认', color: '#f59e0b' },   // amber-500
  { key: '待配送', color: '#06b6d4' },   // cyan-500
  { key: '配送中', color: '#3b82f6' },   // blue-500
  { key: '已完成', color: '#10b981' },   // emerald-500
];

function OrderProgress({ status }) {
  const currentIdx = PROGRESS_STEPS.findIndex(s => s.key === status);
  return (
    <div className="flex items-center justify-between relative px-2">
      <div className="absolute top-1 left-0 w-full h-[1px] border-t border-dashed" style={{ borderColor: '#E8E2D8' }}></div>
      {PROGRESS_STEPS.map((step, idx) => {
        const isCompleted = idx < currentIdx;
        const isCurrent = idx === currentIdx;
        const stepColor = isCurrent || isCompleted ? step.color : '#DDD8D0';
        return (
          <div key={step.key} className="flex flex-col items-center">
            <div
              className="w-2 h-2 rounded-full border-[1.5px] z-10 transition-all duration-300"
              style={{
                borderColor: stepColor,
                background: isCurrent ? stepColor : '#FDFBF7',
                transform: isCurrent ? 'scale(1.6)' : 'scale(1)',
                boxShadow: isCurrent ? '0 0 0 3px #FDFBF7, 0 0 0 4px rgba(0,0,0,0.04)' : 'none'
              }}
            ></div>
            <div
              className="text-[10px] mt-2 font-medium transition-colors duration-300"
              style={{ color: isCurrent ? stepColor : '#DDD8D0' }}
            >
              {step.key}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Order detail drawer/sheet content (shared between desktop and mobile)
function OrderDetailContent({ order, onClose, copiedOrderId, onCopy }) {
  if (!order) return null;
  const us = getUnifiedStatus(order);

  const formatDate = (val) => {
    if (typeof val === 'number' && isFinite(val)) {
      return new Date(val * 1000).toLocaleString('zh-CN');
    }
    const t = Date.parse(val);
    return isNaN(t) ? '' : new Date(t).toLocaleString('zh-CN');
  };

  return (
    <>
      {/* Header */}
      <div className="px-6 py-4 flex items-center justify-between sticky top-0 z-10" style={{ borderBottom: '1px solid #E8E2D8', background: 'rgba(253,251,247,0.95)', backdropFilter: 'blur(12px)' }}>
        <div>
          <h3 className="text-lg font-bold" style={{ color: '#141413', fontFamily: "'LXGW WenKai', 'Songti SC', serif" }}>订单详情</h3>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-xs font-mono" style={{ color: '#B0AEA5' }}>{order.id}</span>
            <button
              onClick={() => onCopy(order.id)}
              className="w-5 h-5 flex items-center justify-center rounded transition-colors"
              style={{ color: copiedOrderId === order.id ? '#788C5D' : '#B0AEA5' }}
            >
              <i className={`fas ${copiedOrderId === order.id ? 'fa-check' : 'fa-copy'} text-[11px]`}></i>
            </button>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
          style={{ background: '#F5F2ED', color: '#6B6860' }}
        >
          <i className="fas fa-times text-sm"></i>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Status + Amount */}
        <div className="rounded-2xl p-5 flex items-center justify-between" style={{ background: '#F5F2ED' }}>
          <div>
            <p className="text-xs mb-1" style={{ color: '#B0AEA5' }}>当前状态</p>
            <div className="flex items-center gap-2">
              <StatusBadge status={us} />
              {Boolean(order.is_reservation) && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-md" style={{ color: '#D97757', background: 'rgba(217,119,87,0.08)' }}>预约单</span>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs mb-1" style={{ color: '#B0AEA5' }}>订单总额</p>
            <p className="text-xl font-bold" style={{ color: '#C96442', fontFamily: "'Lora', serif" }}>¥{order.total_amount}</p>
          </div>
        </div>

        {/* Items */}
        <div>
          <h4 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: '#141413' }}>
            <i className="fas fa-box-open" style={{ color: '#B0AEA5' }}></i>
            商品清单
          </h4>
          <div className="space-y-0">
            {collapseAutoGiftItemsForDisplay(order.items || []).map((it, idx) => {
              const imageSrc = getProductImage(it);
              return (
                <div key={idx} className="flex items-start gap-4 py-3" style={{ borderBottom: idx < (order.items || []).length - 1 ? '1px solid #F5F2ED' : 'none' }}>
                  {imageSrc ? (
                    <img src={imageSrc} alt={it.name} className="w-12 h-12 rounded-xl object-cover flex-shrink-0" style={{ border: '1px solid #E8E2D8', background: '#F5F2ED' }} />
                  ) : (
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#F5F2ED', color: '#B0AEA5' }}>
                      <i className="fas fa-cube"></i>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                      <h5 className="text-sm font-medium truncate pr-2" style={{ color: '#141413' }}>{it.name}</h5>
                      <span className="text-sm font-medium whitespace-nowrap" style={{ color: '#141413', fontFamily: "'Lora', serif" }}>¥{it.subtotal}</span>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {it.variant_name && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: '#F5F2ED', color: '#6B6860' }}>{it.variant_name}</span>}
                      <span className="text-[10px]" style={{ color: '#B0AEA5' }}>x{it.quantity}</span>
                    </div>
                    {(it.is_lottery || it.is_auto_gift) && (
                      <p className="text-[10px] mt-1" style={{ color: '#D97757' }}>
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
            <h4 className="text-sm font-semibold mb-3" style={{ color: '#141413' }}>配送信息</h4>
            <div className="rounded-2xl p-4 space-y-3 text-sm" style={{ background: '#FFFFFF', border: '1px solid #E8E2D8' }}>
              <div className="flex gap-3">
                <span className="flex-shrink-0 w-12" style={{ color: '#B0AEA5' }}>收件人</span>
                <span className="font-medium" style={{ color: '#141413' }}>{order.shipping_info?.name}</span>
              </div>
              <div className="flex gap-3">
                <span className="flex-shrink-0 w-12" style={{ color: '#B0AEA5' }}>电话</span>
                <span className="font-medium" style={{ color: '#141413' }}>{order.shipping_info?.phone}</span>
              </div>
              <div className="flex gap-3">
                <span className="flex-shrink-0 w-12" style={{ color: '#B0AEA5' }}>地址</span>
                <span className="leading-relaxed" style={{ color: '#141413' }}>{order.shipping_info?.full_address}</span>
              </div>
            </div>
          </div>
          <div>
            <h4 className="text-sm font-semibold mb-3" style={{ color: '#141413' }}>其他信息</h4>
            <div className="rounded-2xl p-4 space-y-3 text-sm" style={{ background: '#FFFFFF', border: '1px solid #E8E2D8' }}>
              <div className="flex gap-3">
                <span className="flex-shrink-0 w-16" style={{ color: '#B0AEA5' }}>支付方式</span>
                <span style={{ color: '#141413' }}>{order.payment_method === 'wechat' ? '微信支付' : order.payment_method || '-'}</span>
              </div>
              <div className="flex gap-3">
                <span className="flex-shrink-0 w-16" style={{ color: '#B0AEA5' }}>下单时间</span>
                <span style={{ color: '#141413' }}>{formatDate(order.created_at_timestamp ?? order.created_at)}</span>
              </div>
              {order.note && (
                <div className="flex gap-3">
                  <span className="flex-shrink-0 w-16" style={{ color: '#B0AEA5' }}>备注</span>
                  <span style={{ color: '#141413' }}>{order.note}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
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
  const [viewingOrder, setViewingOrder] = useState(null);
  const [filter, setFilter] = useState('全部');
  const [tick, setTick] = useState(0);
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

  // Lock body scroll when drawer/sheet is open
  useEffect(() => {
    if (viewingOrder) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = 'unset'; };
    }
  }, [viewingOrder]);

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const getRemainSeconds = (o) => {
    const createdTimestamp = o.created_at_timestamp;
    if (!createdTimestamp || typeof createdTimestamp !== 'number') return 0;
    const expireTimestamp = createdTimestamp + (15 * 60);
    const nowTimestamp = Math.floor(Date.now() / 1000);
    return Math.max(0, expireTimestamp - nowTimestamp);
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
    try {
      const qrResponse = await apiRequest(`/orders/${orderId}/payment-qr`);
      if (qrResponse.success && qrResponse.data?.payment_qr) {
        setPaymentQr(qrResponse.data.payment_qr);
      } else {
        setPaymentQr({ owner_type: 'default', name: "无收款码" });
      }
    } catch (e) {
      setPaymentQr({ owner_type: 'default', name: "无收款码" });
    }
  };

  const handleMarkPaid = async (orderId) => {
    try {
      const res = await apiRequest(`/orders/${orderId}/mark-paid`, { method: 'POST' });
      if (res.success) {
        try { await clearCart(); } catch (e) {}
        setPayOrderId(null);
        setPaymentQr(null);
        await loadOrders();
      } else {
        alert(res.message || '操作失败');
      }
    } catch (err) {
      alert(err.message || '操作失败');
    } finally {
      startLottery(orderId);
    }
  };

  const filteredOrders = useMemo(() => {
    if (filter === '全部') return orders;
    const mappedStatuses = MOBILE_FILTER_MAP[filter];
    if (mappedStatuses && mappedStatuses[0] !== '全部') {
      return orders.filter(o => mappedStatuses.includes(getUnifiedStatus(o)));
    }
    return orders.filter(o => getUnifiedStatus(o) === filter);
  }, [orders, filter]);

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
      setTimeout(() => setCopiedOrderId(null), 3000);
    } catch (e) {}
  };

  // Drawer drag handler for mobile pull-to-dismiss
  const handleDrawerDragEnd = (event, info) => {
    if (info.offset.y > 100) {
      setViewingOrder(null);
    }
  };

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>

      <div className="min-h-screen pt-20 pb-12 selection:bg-orange-100 selection:text-orange-900" style={{ background: '#FDFBF7' }}>
        <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">

          {/* 页面标题 */}
          <div className="mb-10 mt-4 animate-fade-in-up">
            <h1 className="text-4xl font-bold tracking-tight" style={{ color: '#141413', fontFamily: "'LXGW WenKai', 'Songti SC', serif" }}>我的订单</h1>
            <p className="mt-2 text-lg" style={{ color: '#B0AEA5' }}>查看及管理您的历史订单</p>
          </div>

          {error && (
            <div className="mb-6 px-4 py-3 rounded-2xl text-sm animate-fade-in-up" style={{ background: 'rgba(192,69,58,0.06)', border: '1px solid rgba(192,69,58,0.15)', color: '#C0453A' }}>
              <i className="fas fa-exclamation-circle mr-2"></i>
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-32 animate-fade-in-up">
              <div className="w-10 h-10 border-4 rounded-full animate-spin" style={{ borderColor: '#E8E2D8', borderTopColor: '#D97757' }}></div>
              <p className="mt-4 text-sm font-medium" style={{ color: '#B0AEA5' }}>正在加载订单...</p>
            </div>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 animate-fade-in-up">
              <div className="w-24 h-24 rounded-full flex items-center justify-center mb-6" style={{ background: '#F5F2ED' }}>
                <i className="fas fa-shopping-bag text-3xl" style={{ color: '#DDD8D0' }}></i>
              </div>
              <h3 className="text-xl font-semibold mb-2" style={{ color: '#141413' }}>暂无订单</h3>
              <p className="mb-8 max-w-xs text-center" style={{ color: '#B0AEA5' }}>您还没有购买过任何商品，去商城逛逛吧</p>
              <Link
                href="/shop"
                className="px-8 py-3 text-white rounded-full font-medium transition-all transform hover:scale-105 shadow-lg"
                style={{ background: '#141413' }}
              >
                前往商城
              </Link>
            </div>
          ) : (
            <>
              {/* 筛选器 - 手机端 */}
              <div className="sticky top-16 z-30 -mx-4 sm:hidden mb-8 px-4 animate-fade-in-up" style={{ animationDelay: '0.05s', animationFillMode: 'both' }}>
                <div className="backdrop-blur-xl shadow-sm rounded-2xl p-1.5 flex overflow-x-auto hide-scrollbar snap-x relative" style={{ background: 'rgba(253,251,247,0.85)', border: '1px solid #E8E2D8' }}>
                  <div
                    className="absolute top-1.5 bottom-1.5 rounded-xl transition-all duration-300 ease-out z-0"
                    style={{
                      background: '#FFFFFF',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                      left: `calc(6px + ${MOBILE_FILTER_ORDER.indexOf(filter)} * ((100% - 12px) / ${MOBILE_FILTER_ORDER.length}))`,
                      width: `calc((100% - 12px) / ${MOBILE_FILTER_ORDER.length})`
                    }}
                  ></div>

                  {MOBILE_FILTER_ORDER.map((label) => (
                    <button
                      key={label}
                      onClick={() => setFilter(label)}
                      className="flex-1 px-4 py-2 rounded-xl text-sm font-medium transition-colors duration-300 snap-start whitespace-nowrap justify-center relative z-10"
                      style={{ color: filter === label ? '#141413' : '#B0AEA5' }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 筛选器 - 桌面端 */}
              <div className="sticky top-16 z-30 hidden sm:block mb-8 animate-fade-in-up" style={{ animationDelay: '0.05s', animationFillMode: 'both' }}>
                <div className="backdrop-blur-xl shadow-sm rounded-2xl p-1.5 flex overflow-x-auto hide-scrollbar snap-x relative" style={{ background: 'rgba(253,251,247,0.85)', border: '1px solid #E8E2D8' }}>
                  <div
                    className="absolute top-1.5 bottom-1.5 rounded-xl transition-all duration-300 ease-out z-0"
                    style={{
                      background: '#FFFFFF',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                      left: `calc(6px + ${UNIFIED_STATUS_ORDER.indexOf(filter)} * ((100% - 12px) / ${UNIFIED_STATUS_ORDER.length}))`,
                      width: `calc((100% - 12px) / ${UNIFIED_STATUS_ORDER.length})`
                    }}
                  ></div>

                  {UNIFIED_STATUS_ORDER.map((label) => (
                    <button
                      key={label}
                      onClick={() => setFilter(label)}
                      className="flex-1 px-4 py-2 rounded-xl text-sm font-medium transition-colors duration-300 snap-start whitespace-nowrap justify-center relative z-10"
                      style={{ color: filter === label ? '#141413' : '#B0AEA5' }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 订单列表 */}
              <div className="space-y-4" key={filter}>
                {filteredOrders.length === 0 ? (
                  <div className="text-center py-20 rounded-3xl animate-fade-in-up" style={{ background: '#FFFFFF', border: '1px solid #E8E2D8' }}>
                    <p style={{ color: '#B0AEA5' }}>暂无「{filter}」状态的订单</p>
                    <button
                      onClick={() => setFilter('全部')}
                      className="mt-4 font-medium text-sm"
                      style={{ color: '#D97757' }}
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
                      className="group rounded-2xl p-5 sm:p-6 transition-all duration-300 animate-fade-in-up"
                      style={{
                        background: '#FFFFFF',
                        border: '1px solid #E8E2D8',
                        animationDelay: `${index * 0.03}s`,
                        animationFillMode: 'both'
                      }}
                    >
                      {/* 订单头部 */}
                      <div className="flex flex-wrap items-center justify-between gap-y-3 gap-x-4 mb-5">
                        <div className="flex items-center gap-2 sm:gap-3">
                          <StatusBadge status={us} />
                          <div className="flex items-center gap-1">
                            <span className="text-xs font-mono tracking-wide" style={{ color: '#B0AEA5' }}>#{o.id.replace(/^order_/, '').slice(-8)}</span>
                            <button
                              onClick={() => copyToClipboard(o.id)}
                              className="w-5 h-5 flex items-center justify-center rounded transition-all duration-200"
                              style={{ color: copiedOrderId === o.id ? '#788C5D' : '#DDD8D0' }}
                            >
                              <i className={`fas ${copiedOrderId === o.id ? 'fa-check' : 'fa-copy'} text-[11px]`}></i>
                            </button>
                          </div>
                          {Boolean(o.is_reservation) && (
                            <span className="px-1.5 py-0.5 rounded-md text-[10px] font-medium" style={{ background: 'rgba(217,119,87,0.08)', color: '#D97757', border: '1px solid rgba(217,119,87,0.15)' }}>
                              预约
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs" style={{ color: '#B0AEA5' }}>
                          <span>{formatDate(o.created_at_timestamp ?? o.created_at)}</span>
                          {showCountdown && (
                            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg animate-pulse" style={{ color: '#D97757', background: 'rgba(217,119,87,0.08)' }}>
                              <i className="fas fa-clock text-[10px]"></i>
                              <span className="font-mono font-bold">{formatRemain(remainSec)}</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 进度条 */}
                      <div className="mb-6">
                        <OrderProgress status={us} />
                      </div>

                      {/* 订单内容摘要 */}
                      <div className="flex flex-col sm:flex-row gap-5 items-start sm:items-center justify-between rounded-2xl p-4" style={{ background: '#FAF9F5', border: '1px solid #F5F2ED' }}>
                        <div className="flex-1 space-y-1">
                          <div className="flex items-baseline gap-2">
                            <span className="text-xl sm:text-2xl font-bold tracking-tight" style={{ color: '#C96442', fontFamily: "'Lora', serif" }}>¥{o.total_amount}</span>
                            <span className="text-xs sm:text-sm" style={{ color: '#6B6860' }}>共 {o.items?.reduce((acc, i) => acc + (Number(i.quantity)||0), 0)} 件</span>
                          </div>
                          {o.discount_amount > 0 && (
                            <div className="text-xs font-medium flex items-center gap-1" style={{ color: '#D97757' }}>
                              <i className="fas fa-tag text-[10px]"></i>
                              已优惠 ¥{Number(o.discount_amount).toFixed(2)}
                            </div>
                          )}
                        </div>

                        {/* 操作按钮组 */}
                        <div className="flex items-center gap-3 w-full sm:w-auto mt-2 sm:mt-0">
                          <button
                            onClick={() => setViewingOrder(o)}
                            className="flex-1 sm:flex-none px-5 py-2 rounded-xl text-sm font-medium transition-all"
                            style={{ background: '#FFFFFF', border: '1px solid #E8E2D8', color: '#6B6860' }}
                          >
                            详情
                          </button>
                          {us === '未付款' && (
                            <button
                              onClick={() => handleShowPayModal(o.id)}
                              className="flex-1 sm:flex-none px-6 py-2 rounded-xl text-white text-sm font-medium transition-all shadow-lg transform active:scale-95 flex items-center justify-center gap-2"
                              style={{ background: '#141413' }}
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
          <div className="absolute inset-0 backdrop-blur-sm transition-opacity" style={{ background: 'rgba(20,20,19,0.3)' }} onClick={() => { setPayOrderId(null); setPaymentQr(null); }}></div>
          <div className="relative w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden transform transition-all animate-fade-in-up" style={{ background: '#FFFFFF' }}>
            <div className="p-6 text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(107,143,71,0.08)' }}>
                <i className="fab fa-weixin text-3xl" style={{ color: '#6B8F47' }}></i>
              </div>
              <h3 className="text-xl font-bold mb-1" style={{ color: '#141413', fontFamily: "'LXGW WenKai', 'Songti SC', serif" }}>微信支付</h3>
              <p className="text-sm mb-6" style={{ color: '#B0AEA5' }}>请使用微信扫一扫完成支付</p>

              <div className="p-4 rounded-2xl mb-6" style={{ background: '#F5F2ED', border: '1px solid #E8E2D8' }}>
                {paymentQr ? (
                  paymentQr.owner_type === 'default' ? (
                    <div className="h-64 flex flex-col items-center justify-center" style={{ color: '#B0AEA5' }}>
                      <i className="fas fa-exclamation-triangle text-2xl mb-2"></i>
                      <span className="text-sm">暂无收款码</span>
                    </div>
                  ) : (
                    <img src={paymentQr.image_path} alt="Payment QR" className="w-full h-64 object-contain rounded-lg mix-blend-multiply" />
                  )
                ) : (
                  <div className="h-64 flex items-center justify-center">
                    <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: '#E8E2D8', borderTopColor: '#6B8F47' }}></div>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => handleMarkPaid(payOrderId)}
                  disabled={paymentQr && paymentQr.owner_type === 'default'}
                  className="w-full py-3 text-white rounded-xl font-medium transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: '#6B8F47' }}
                >
                  我已完成支付
                </button>
                <button
                  onClick={() => { setPayOrderId(null); setPaymentQr(null); }}
                  className="w-full py-3 font-medium text-sm"
                  style={{ color: '#B0AEA5' }}
                >
                  稍后支付
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 订单详情 - 桌面端侧边抽屉 / 移动端底部弹出 */}
      <AnimatePresence>
        {viewingOrder && (
          <>
            {/* Desktop: Side drawer */}
            <div className="hidden md:block">
              <motion.div
                className="fixed inset-0 z-[60]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="absolute inset-0 backdrop-blur-[2px]" style={{ background: 'rgba(20,20,19,0.2)' }} onClick={() => setViewingOrder(null)}></div>
                <motion.div
                  className="absolute right-0 top-0 h-full w-full max-w-lg shadow-2xl flex flex-col"
                  style={{ background: '#FDFBF7' }}
                  initial={{ x: '100%' }}
                  animate={{ x: 0 }}
                  exit={{ x: '100%' }}
                  transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                >
                  <OrderDetailContent
                    order={viewingOrder}
                    onClose={() => setViewingOrder(null)}
                    copiedOrderId={copiedOrderId}
                    onCopy={copyToClipboard}
                  />
                </motion.div>
              </motion.div>
            </div>

            {/* Mobile: Bottom sheet */}
            <div className="md:hidden">
              <motion.div
                className="fixed inset-0 z-[60] flex items-end"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <motion.div
                  className="absolute inset-0 backdrop-blur-[2px]"
                  style={{ background: 'rgba(20,20,19,0.3)' }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setViewingOrder(null)}
                />
                <motion.div
                  className="relative w-full rounded-t-3xl shadow-2xl flex flex-col z-10"
                  style={{ background: '#FDFBF7', maxHeight: '90vh' }}
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                  drag="y"
                  dragConstraints={{ top: 0, bottom: 0 }}
                  dragElastic={{ top: 0.05, bottom: 0.5 }}
                  onDragEnd={handleDrawerDragEnd}
                >
                  {/* Drag handle */}
                  <div className="flex justify-center pt-3 pb-1 cursor-grab active:cursor-grabbing">
                    <div className="w-10 h-1 rounded-full" style={{ background: '#DDD8D0' }}></div>
                  </div>
                  {/* Extended background for bounce-up */}
                  <div className="absolute top-[calc(100%-1px)] left-0 right-0 h-[200vh]" style={{ background: '#FDFBF7' }} />
                  <div onPointerDown={(e) => e.stopPropagation()} className="flex flex-col flex-1 overflow-hidden">
                    <OrderDetailContent
                      order={viewingOrder}
                      onClose={() => setViewingOrder(null)}
                      copiedOrderId={copiedOrderId}
                      onCopy={copyToClipboard}
                    />
                  </div>
                </motion.div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* 抽奖弹窗 */}
      {lotteryOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 backdrop-blur-sm transition-opacity" style={{ background: 'rgba(20,20,19,0.3)' }} onClick={() => { setLotteryOpen(false); setLotteryPrize(null); }}></div>
          <div className="relative w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden transform transition-all animate-fade-in-up" style={{ background: '#FFFFFF' }}>
            <div className="p-8 text-center">
              <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 animate-bounce-slow" style={{ background: 'linear-gradient(135deg, rgba(201,148,58,0.12), rgba(217,119,87,0.12))' }}>
                <i className="fas fa-gift text-4xl" style={{ color: '#D97757' }}></i>
              </div>

              <h3 className="text-2xl font-bold mb-2" style={{ color: '#141413', fontFamily: "'LXGW WenKai', 'Songti SC', serif" }}>幸运抽奖</h3>
              <p className="text-sm mb-8" style={{ color: '#B0AEA5' }}>订单满 {formattedLotteryThreshold} 元即可参与</p>

              <div className="rounded-2xl p-6 mb-8" style={{ background: '#F5F2ED', border: '1px solid #E8E2D8' }}>
                <div className={`text-2xl font-bold ${spinning ? 'animate-pulse' : ''}`} style={{ color: spinning ? '#D97757' : '#141413' }}>
                  {lotteryDisplay}
                </div>
                {!spinning && lotteryResult && (
                  <div className="mt-2 text-sm font-medium" style={{ color: '#B0AEA5' }}>
                    {lotteryResult === '谢谢参与' ? '下次好运！' : '恭喜中奖！'}
                  </div>
                )}
              </div>

              {!spinning && (
                <div className="space-y-4 animate-fade-in-up">
                  {lotteryPrize && (
                    <div className="text-sm p-3 rounded-xl" style={{ background: 'rgba(217,119,87,0.06)', border: '1px solid rgba(217,119,87,0.15)', color: '#6B6860' }}>
                      <p className="font-medium mb-1" style={{ color: '#D97757' }}>奖品详情</p>
                      <p>{lotteryPrize.product_name || '未命名奖品'}</p>
                      {lotteryPrize.variant_name && <p className="text-xs mt-0.5 opacity-75">({lotteryPrize.variant_name})</p>}
                      <p className="text-xs mt-2" style={{ color: 'rgba(217,119,87,0.7)' }}>将在下次满额订单中随单配送</p>
                    </div>
                  )}

                  <button
                    onClick={() => { setLotteryOpen(false); setLotteryPrize(null); }}
                    className="w-full py-3 text-white rounded-xl font-medium transition-all shadow-lg"
                    style={{ background: '#141413' }}
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
