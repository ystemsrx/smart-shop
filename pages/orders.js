import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Nav from '../components/Nav';
import { useAuth, useApi, useCart } from '../hooks/useAuth';
import { useRouter } from 'next/router';

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

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payOrderId, setPayOrderId] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [filter, setFilter] = useState('全部');
  const [tick, setTick] = useState(0); // 用于每秒刷新倒计时
  const [lotteryOpen, setLotteryOpen] = useState(false);
  const [lotteryNames, setLotteryNames] = useState([]);
  const [lotteryResult, setLotteryResult] = useState('');
  const [lotteryDisplay, setLotteryDisplay] = useState('');
  const [spinning, setSpinning] = useState(false);

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
        const names = (resp.data?.names && resp.data.names.length > 0)
          ? resp.data.names
          : [resp.data?.prize_name];
        setLotteryNames(names);
        setLotteryResult(resp.data?.prize_name || '');
        setLotteryDisplay(names[0] || '');
        setLotteryOpen(true);
        // 简单滚动动画：2秒内循环高亮，最终停留在结果
        setSpinning(true);
        const duration = 2000;
        const interval = 80;
        let idx = 0;
        const timer = setInterval(() => {
          idx = (idx + 1) % names.length;
          setLotteryDisplay(names[idx]);
        }, interval);
        setTimeout(() => {
          clearInterval(timer);
          setSpinning(false);
          setLotteryDisplay(resp.data?.prize_name || names[0]);
        }, duration);
      }
    } catch (e) {
      // 安静失败
    }
  };

  const handleMarkPaid = async (orderId) => {
    try {
      const res = await apiRequest(`/orders/${orderId}/mark-paid`, { method: 'POST' });
      if (res.success) {
        try { await clearCart(); } catch (e) {}
        setPayOrderId(null);
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

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      alert('已复制订单号');
    } catch (e) {
      // ignore
    }
  };

  return (
    <>
      <Head>
        <title>我的订单 - [商店名称]</title>
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
          <div className="text-center mb-12 animate-apple-fade-in">
            <div className="flex justify-center mb-6">
              <div className="relative">
                <div className="absolute -inset-4 bg-gradient-to-r from-amber-500 to-orange-600 rounded-3xl blur-2xl opacity-30"></div>
                <div className="relative w-20 h-20 bg-gradient-to-br from-amber-500 via-orange-600 to-red-500 rounded-3xl flex items-center justify-center shadow-2xl">
                  <i className="fas fa-receipt text-white text-2xl"></i>
                </div>
              </div>
            </div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 via-gray-800 to-gray-700 bg-clip-text text-transparent mb-3">
              我的订单
            </h1>
            <p className="text-lg text-gray-600">
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
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl flex items-center justify-center">
                    <i className="fas fa-filter text-white text-sm"></i>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">订单筛选</h3>
                </div>
                <div className="flex flex-wrap gap-3">
                  {UNIFIED_STATUS_ORDER.map((label, index) => (
                    <button
                      key={label}
                      onClick={() => setFilter(label)}
                      className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 transform hover:scale-105 animate-apple-fade-in ${
                         filter === label 
                           ? 'bg-gradient-to-r from-emerald-500 to-cyan-600 text-white shadow-lg' 
                           : 'card-modern text-gray-700 hover:shadow-md border border-gray-200'
                      }`}
                      style={{ animationDelay: `${index * 0.05}s` }}
                    >
                      <div className="flex items-center gap-2">
                        <i className={`fas ${
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

              {filteredOrders.map((o, index) => {
                const us = getUnifiedStatus(o);
                const isOpen = !!expanded[o.id];
                const showCountdown = us === '未付款' && (o.payment_status === 'pending' || !o.payment_status);
                const remainSec = showCountdown ? getRemainSeconds(o) : 0;
                return (
                  <div 
                    key={o.id} 
                    className="card-modern overflow-hidden transform transition-all duration-300 ease-out animate-apple-fade-in hover:scale-102"
                    style={{ animationDelay: `${index * 0.1}s` }}
                  >
                    {/* header */}
                    <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <StatusBadge status={us} />
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
                            <p className="text-xs text-gray-500">订单总额</p>
                          </div>
                          <button
                            onClick={() => { setExpanded(prev => ({ ...prev, [o.id]: !isOpen })); }}
                            className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
                          >
                            <i className={`fas ${isOpen ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>
                            <span>{isOpen ? '收起详情' : '查看详情'}</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* body */}
                    <div className="px-6 py-4">
                      <div className="flex flex-wrap justify-between items-start gap-6">
                        <div className="flex-1 min-w-0">
                          <div className="bg-gray-50 rounded-xl p-4 mb-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
                                  <i className="fas fa-hashtag text-emerald-600 text-sm"></i>
                                </div>
                                <div>
                                  <p className="text-xs text-gray-500 mb-1">订单号码</p>
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono text-sm text-gray-900">{o.id}</span>
                                    <button
                                      className="px-2 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-600 text-xs rounded-md transition-colors"
                                      onClick={() => copyToClipboard(o.id)}
                                    >
                                      <i className="fas fa-copy mr-1"></i>复制
                                    </button>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                                  <i className="fas fa-credit-card text-green-600 text-sm"></i>
                                </div>
                                <div>
                                  <p className="text-xs text-gray-500 mb-1">支付方式</p>
                                  <div className="flex items-center gap-2">
                                    {o.payment_method === 'wechat' && <i className="fab fa-weixin text-green-500"></i>}
                                    <span className="text-sm text-gray-900">
                                      {o.payment_method === 'wechat' ? '微信支付' : (o.payment_method || '—')}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col gap-3">
                          {us === '未付款' && (
                            <button 
                              onClick={() => setPayOrderId(o.id)} 
                              className="btn-primary px-6 py-2 text-sm flex items-center gap-2 transform hover:scale-105 transition-all duration-300"
                            >
                              <i className="fas fa-credit-card"></i>
                              <span>{o.payment_status === 'failed' ? '重新付款' : '立即付款'}</span>
                            </button>
                          )}
                          {us !== '未付款' && (() => {
                            const meta = {
                              '待确认': {
                                box: 'bg-amber-50 border-amber-200',
                                text: 'text-amber-700',
                                sub: 'text-amber-600',
                                icon: 'fas fa-clock',
                                title: '待确认',
                                desc: '已提交付款，正在核验，请耐心等待'
                              },
                              '待配送': {
                                box: 'bg-cyan-50 border-cyan-200',
                                text: 'text-cyan-700',
                                sub: 'text-cyan-600',
                                icon: 'fas fa-box',
                                title: '待配送',
                                desc: '付款已确认，正在备货与安排配送'
                              },
                              '配送中': {
                                box: 'bg-purple-50 border-purple-200',
                                text: 'text-purple-700',
                                sub: 'text-purple-600',
                                icon: 'fas fa-truck',
                                title: '配送中',
                                desc: '配送员正在路上，请保持手机畅通'
                              },
                              '已完成': {
                                box: 'bg-green-50 border-green-200',
                                text: 'text-green-700',
                                sub: 'text-green-600',
                                icon: 'fas fa-check-circle',
                                title: '已完成',
                                desc: '订单已送达，感谢您的购买'
                              }
                            }[us] || {
                              box: 'bg-gray-50 border-gray-200',
                              text: 'text-gray-700',
                              sub: 'text-gray-600',
                              icon: 'fas fa-info-circle',
                              title: us || '状态更新',
                              desc: '订单状态已更新'
                            };
                            return (
                              <div className={`${meta.box} rounded-xl p-3 border`}>
                                <div className={`flex items-center gap-2 ${meta.text}`}>
                                  <i className={meta.icon}></i>
                                  <span className="text-sm font-medium">{meta.title}</span>
                                </div>
                                <p className={`text-xs mt-1 ${meta.sub}`}>{meta.desc}</p>
                              </div>
                            );
                          })()}
                        </div>
                      </div>

                      {isOpen && (
                        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6 animate-apple-slide-up">
                          {/* 商品明细 */}
                          <div>
                            <div className="flex items-center gap-2 mb-4">
                              <div className="w-6 h-6 bg-orange-100 rounded-lg flex items-center justify-center">
                                <i className="fas fa-shopping-basket text-orange-600 text-xs"></i>
                              </div>
                              <h4 className="text-sm font-semibold text-gray-900">商品明细</h4>
                            </div>
                            <div className="space-y-3">
                              {o.items?.map((it, idx) => (
                                <div 
                                  key={(it.product_id + (it.variant_id || '')) + '_' + idx} 
                                  className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow"
                                >
                                  <div className="flex justify-between items-start gap-3">
                                    <div className="flex-1 min-w-0">
                                      <h5 className="font-medium text-gray-900 truncate text-sm flex items-center gap-2">
                                        {it.name}
                                        {it.is_lottery && (
                                          <span className="px-2 py-0.5 text-[10px] rounded-full bg-pink-100 text-pink-700 border border-pink-200">抽奖</span>
                                        )}
                                      </h5>
                                      {it.variant_name && (
                                        <span className="inline-block mt-1 px-2 py-0.5 bg-cyan-100 text-cyan-600 text-xs rounded-full border border-cyan-200">
                                          {it.variant_name}
                                        </span>
                                      )}
                                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                                        <span className="flex items-center gap-1">
                                          <i className="fas fa-cubes"></i>
                                          数量: {it.quantity}
                                        </span>
                                        <span className="flex items-center gap-1">
                                          <i className="fas fa-tag"></i>
                                          单价: ¥{it.unit_price}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="text-right">
                                      <p className="font-semibold text-gray-900">¥{it.subtotal}</p>
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
                                  <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
                                    <i className="fas fa-user text-emerald-600 text-sm"></i>
                                  </div>
                                  <div>
                                    <p className="text-xs text-gray-500">收件人</p>
                                    <p className="text-sm font-medium text-gray-900">{o.shipping_info?.name}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                                    <i className="fas fa-phone text-green-600 text-sm"></i>
                                  </div>
                                  <div>
                                    <p className="text-xs text-gray-500">联系电话</p>
                                    <p className="text-sm font-medium text-gray-900">{o.shipping_info?.phone}</p>
                                  </div>
                                </div>
                                <div className="flex items-start gap-3">
                                  <div className="w-8 h-8 bg-cyan-100 rounded-lg flex items-center justify-center">
                                    <i className="fas fa-home text-cyan-600 text-sm"></i>
                                  </div>
                                  <div>
                                    <p className="text-xs text-gray-500">收货地址</p>
                                    <p className="text-sm font-medium text-gray-900">{o.shipping_info?.full_address}</p>
                                  </div>
                                </div>
                                {o.note && (
                                  <div className="flex items-start gap-3">
                                    <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
                                      <i className="fas fa-comment text-orange-600 text-sm"></i>
                                    </div>
                                    <div>
                                      <p className="text-xs text-gray-500">订单备注</p>
                                      <p className="text-sm font-medium text-gray-900">{o.note}</p>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-apple-fade-in">
          <div className="absolute inset-0" onClick={() => setPayOrderId(null)}></div>
          <div className="relative card-glass max-w-sm w-full mx-4 p-8 border border-white/30 shadow-2xl animate-apple-scale-in z-10">
            {/* 弹窗标题 */}
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                <i className="fab fa-weixin text-white text-2xl"></i>
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">微信扫码支付</h3>
              <p className="text-white/80 text-sm">请使用微信扫描下方二维码完成支付</p>
            </div>

            {/* 二维码区域 */}
            <div className="bg-white rounded-2xl p-4 mb-6 shadow-lg">
              <img 
                src="/1_wx.png" 
                alt="微信收款码" 
                className="w-full h-64 object-contain rounded-xl" 
              />
            </div>

            {/* 操作按钮 */}
            <div className="space-y-3">
              <button
                onClick={() => handleMarkPaid(payOrderId)}
                className="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white py-3 px-4 rounded-xl font-medium hover:from-green-600 hover:to-emerald-700 transform hover:scale-105 transition-all duration-300 shadow-lg flex items-center justify-center gap-2"
              >
                <i className="fas fa-check-circle"></i>
                <span>我已完成付款</span>
              </button>
              
              <button
                onClick={() => setPayOrderId(null)}
                className="w-full bg-white/20 backdrop-blur-sm text-white py-3 px-4 rounded-xl font-medium hover:bg-white/30 border border-white/30 transition-all duration-300 flex items-center justify-center gap-2"
              >
                <i className="fas fa-clock"></i>
                <span>稍后支付</span>
              </button>
            </div>

            {/* 关闭按钮 */}
            <button
              onClick={() => setPayOrderId(null)}
              className="absolute top-4 right-4 w-8 h-8 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center text-white/80 hover:text-white transition-all duration-200"
            >
              <i className="fas fa-times"></i>
            </button>
          </div>
        </div>
      )}

      {/* 抽奖弹窗 */}
      {lotteryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={() => setLotteryOpen(false)}></div>
          <div className="relative max-w-sm w-full mx-4 p-6 rounded-2xl bg-white shadow-2xl z-10">
            <div className="text-center mb-4">
              <h3 className="text-lg font-semibold">抽奖中</h3>
              <p className="text-gray-500 text-sm">订单满10元即可参与抽奖</p>
            </div>
            <div className="h-20 flex items-center justify-center mb-4">
              <span className={`text-2xl font-bold ${spinning ? 'animate-pulse' : ''}`}>{lotteryDisplay}</span>
            </div>
            {!spinning && (
              <div className="text-center mb-4">
                <span className="inline-flex items-center px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-sm font-medium">恭喜获得：{lotteryResult}</span>
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => setLotteryOpen(false)} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-xl">知道了</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
