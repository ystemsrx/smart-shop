import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useAuth, useApi, useCart } from '../hooks/useAuth';
import { useRouter } from 'next/router';

const PAYMENT_STATUS_TEXT = {
  pending: '未付款',
  processing: '待验证',
  succeeded: '已支付',
  failed: '付款错误'
};

export default function Orders() {
  const router = useRouter();
  const { user } = useAuth();
  const { apiRequest } = useApi();
  const { clearCart } = useCart();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payOrderId, setPayOrderId] = useState(null);

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
            <p className="text-gray-600 mt-1">查看订单状态和付款情况</p>
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
              {orders.map((o) => (
                <div key={o.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="text-sm text-gray-500">订单号</div>
                      <div className="font-mono text-gray-900 text-sm">{o.id}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-500">金额</div>
                      <div className="text-gray-900 font-medium">¥{o.total_amount}</div>
                    </div>
                  </div>
                  <div className="mt-3 flex justify-between items-center">
                    <div className="text-sm text-gray-600">支付状态：{PAYMENT_STATUS_TEXT[o.payment_status] || '未知'}</div>
                    {(o.payment_status === 'pending' || o.payment_status === 'failed') && (
                      <button onClick={() => setPayOrderId(o.id)} className="text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-md hover:bg-indigo-700">
                        {o.payment_status === 'failed' ? '重新付款' : '去付款'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
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
