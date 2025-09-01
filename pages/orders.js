import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
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
  '待配送': { color: 'blue' },
  '配送中': { color: 'purple' },
  '已完成': { color: 'green' },
};

const UNIFIED_STATUS_ORDER = ['全部', '未付款', '待确认', '待配送', '配送中', '已完成'];

const colorClasses = {
  yellow: 'bg-yellow-100 text-yellow-800',
  blue: 'bg-blue-100 text-blue-800',
  purple: 'bg-purple-100 text-purple-800',
  green: 'bg-green-100 text-green-800',
  red: 'bg-red-100 text-red-800',
  gray: 'bg-gray-100 text-gray-800'
};

function StatusBadge({ status }) {
  const meta = UNIFIED_STATUS_MAP[status] || { color: 'gray' };
  return (
    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${colorClasses[meta.color]}`}>
      {status}
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

  const handleMarkPaid = async (orderId) => {
    try {
      const res = await apiRequest(`/orders/${orderId}/mark-paid`, { method: 'POST' });
      if (res.success) {
        try { await clearCart(); } catch (e) {}
        setPayOrderId(null);
        router.push('/orders');
      } else {
        alert(res.message || '操作失败');
      }
    } catch (err) {
      alert(err.message || '操作失败');
    }
  };

  if (!user) return null;

  const filteredOrders = filter === '全部' ? orders : orders.filter(o => getUnifiedStatus(o) === filter);

  const formatDate = (dateString) => new Date(dateString).toLocaleString('zh-CN');

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
        <title>我的订单 - 宿舍智能小商城</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>

      <div className="min-h-screen bg-gray-50">
        {/* 顶部导航 */}
        <nav className="bg-white shadow-sm border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center">
                <Link href="/" className="flex items-center">
                  <div className="h-8 w-8 bg-indigo-600 rounded-full flex items-center justify-center">
                    <span className="text-white font-bold text-sm">L</span>
                  </div>
                  <span className="ml-2 text-xl font-bold text-gray-900">智能小商城</span>
                </Link>
              </div>
              <div className="flex items-center space-x-4">
                <Link href="/" className="text-gray-700 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium">
                  AI助手
                </Link>
                <Link href="/shop" className="text-gray-700 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium">商品商城</Link>
                <Link href="/cart" className="text-gray-700 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium">购物车</Link>
                <Link href="/orders" className="bg-indigo-600 text-white px-3 py-2 rounded-md text-sm font-medium">我的订单</Link>
                <span className="text-sm text-gray-600">{user.name}</span>
              </div>
            </div>
          </div>
        </nav>

        <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">我的订单</h1>
            <p className="text-gray-600 mt-1">查看订单状态</p>
          </div>

          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div>
          )}

          {loading ? (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">加载中...</div>
          ) : orders.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">您还没有订单</p>
              <Link href="/shop" className="inline-flex mt-4 items-center px-4 py-2 bg-indigo-600 text-white font-medium rounded-md hover:bg-indigo-700">去购物</Link>
            </div>
          ) : (
            <div className="space-y-4">
              {/* 筛选器 */}
              <div className="flex flex-wrap gap-2 mb-2">
                {UNIFIED_STATUS_ORDER.map((label) => (
                  <button
                    key={label}
                    onClick={() => setFilter(label)}
                    className={`px-3 py-1 rounded-md text-sm border ${filter === label ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {filteredOrders.map((o) => {
                const us = getUnifiedStatus(o);
                const isOpen = !!expanded[o.id];
                return (
                  <div key={o.id} className="bg-white rounded-lg shadow-sm border border-gray-200">
                    {/* header */}
                    <div className="px-4 py-3 flex items-center justify-between border-b border-gray-100">
                      <div className="flex items-center gap-3">
                        <StatusBadge status={us} />
                        <div className="text-sm text-gray-500">下单时间：{formatDate(o.created_at)}</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-sm text-gray-900 font-medium">总计 ¥{o.total_amount}</div>
                        <button
                          onClick={() => { setExpanded(prev => ({ ...prev, [o.id]: !isOpen })); }}
                          className="text-sm text-indigo-600 hover:underline"
                        >{isOpen ? '收起' : '查看详情'}</button>
                      </div>
                    </div>

                    {/* body */}
                    <div className="px-4 py-3">
                      <div className="flex flex-wrap justify-between items-start gap-4">
                        <div className="text-sm text-gray-600">
                          <div className="flex items-center gap-2">
                            <span className="text-gray-500">订单号：</span>
                            <span className="font-mono">{o.id}</span>
                            <button
                              className="text-xs text-indigo-600 hover:underline"
                              onClick={() => copyToClipboard(o.id)}
                            >复制</button>
                          </div>
                          <div className="mt-1 text-gray-500">支付方式：{o.payment_method === 'wechat' ? '微信支付' : (o.payment_method || '—')}</div>
                        </div>

                        <div className="flex items-center gap-2">
                          {us === '未付款' && (
                            <button onClick={() => setPayOrderId(o.id)} className="text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-md hover:bg-indigo-700">
                              {o.payment_status === 'failed' ? '重新付款' : '去付款'}
                            </button>
                          )}
                          {us !== '未付款' && (
                            <span className="text-sm text-gray-500">我们会尽快处理您的订单</span>
                          )}
                        </div>
                      </div>

                      {isOpen && (
                        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <div className="text-sm font-medium text-gray-900 mb-2">商品明细</div>
                            <div className="divide-y divide-gray-100 border rounded-md">
                              {o.items?.map((it) => (
                                <div key={it.product_id + String(it.unit_price)} className="flex justify-between items-center px-3 py-2 text-sm">
                                  <div className="truncate">
                                    <div className="text-gray-900 truncate">{it.name}</div>
                                    <div className="text-gray-500">x{it.quantity}</div>
                                  </div>
                                  <div className="text-gray-900">¥{it.subtotal}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div>
                            <div className="text-sm font-medium text-gray-900 mb-2">收货信息</div>
                            <div className="text-sm text-gray-600 space-y-1 border rounded-md px-3 py-2">
                              <div>姓名：{o.shipping_info?.name}</div>
                              <div>电话：{o.shipping_info?.phone}</div>
                              <div>地址：{o.shipping_info?.full_address}</div>
                              {o.note && <div>备注：{o.note}</div>}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black bg-opacity-60" onClick={() => setPayOrderId(null)}></div>
          <div className="relative bg-white rounded-lg shadow-xl p-6 w-96 z-10">
            <h3 className="text-lg font-medium text-gray-900 mb-4 text-center">请使用微信扫码付款</h3>
            <div className="w-full flex justify-center mb-4">
              <img src="/1_wx.png" alt="微信收款码" className="rounded-md w-64 h-64 object-contain border" />
            </div>
            <p className="text-sm text-gray-600 mb-4 text-center">付款完成后点击下方“已付款”按钮，我们会尽快核验。</p>
            <div className="flex gap-3">
              <button onClick={() => handleMarkPaid(payOrderId)} className="flex-1 bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700">已付款</button>
              <button onClick={() => setPayOrderId(null)} className="flex-1 bg-gray-100 text-gray-800 py-2 px-4 rounded-md hover:bg-gray-200">稍后支付</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
