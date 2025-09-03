import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useAuth, useCart, useApi } from '../hooks/useAuth';
import { useProducts } from '../hooks/useAuth';
import { useRouter } from 'next/router';

export default function Checkout() {
  const router = useRouter();
  const { user } = useAuth();
  const { getCart, clearCart } = useCart();
  const { apiRequest } = useApi();
  const { getShopStatus } = useProducts();
  
  const [cart, setCart] = useState({ items: [], total_quantity: 0, total_price: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    dormitory: '',
    building: '',
    room: '',
    note: ''
  });
  const [addressOptions, setAddressOptions] = useState([]);
  const [addrLoading, setAddrLoading] = useState(false);
  const [buildingOptions, setBuildingOptions] = useState([]);
  const [bldLoading, setBldLoading] = useState(false);
  const [orderId, setOrderId] = useState(null);
  const [isCreatingPayment, setIsCreatingPayment] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [shopOpen, setShopOpen] = useState(true);
  const [shopNote, setShopNote] = useState('');
  
  // 稍后支付：仅在点击按钮时创建订单（未付款），清空购物车并跳转到我的订单
  const handlePayLater = async () => {
    try {
      const shippingInfo = {
        name: formData.name,
        phone: formData.phone,
        dormitory: formData.dormitory,
        building: formData.building,
        room: formData.room,
        full_address: `${formData.dormitory} ${formData.building} ${formData.room}`
      };
      const orderResponse = await apiRequest('/orders', {
        method: 'POST',
        body: JSON.stringify({
          shipping_info: shippingInfo,
          payment_method: 'wechat',
          note: formData.note
        })
      });
      if (!orderResponse.success) throw new Error(orderResponse.message || '订单创建失败');
      try { await clearCart(); } catch (e) {}
      router.push('/orders');
    } catch (e) {
      alert(e.message || '创建订单失败');
    }
  };

  // 检查登录状态
  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    // 同步店铺状态
    (async () => {
      try {
        const s = await getShopStatus();
        setShopOpen(!!s.data?.is_open);
        setShopNote(s.data?.note || '当前打烊，暂不支持结算');
      } catch (e) {}
    })();
  }, [user, router]);

  // 加载购物车数据
  const loadCart = async () => {
    setIsLoading(true);
    setError('');
    
    try {
      const data = await getCart();
      setCart(data.data);
      
      // 如果购物车为空，跳转到购物车页面
      if (!data.data.items || data.data.items.length === 0) {
        router.push('/cart');
        return;
      }
      
      // 自动填充用户信息
      if (user) {
        setFormData(prev => ({
          ...prev,
          name: user.name || ''
        }));
      }
    } catch (err) {
      setError(err.message || '加载购物车失败');
    } finally {
      setIsLoading(false);
    }
  };

  // 表单输入处理
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name === 'dormitory') {
      // 切换园区时清空已选楼栋
      setFormData({ ...formData, dormitory: value, building: '' });
    } else {
      setFormData({
        ...formData,
        [name]: value
      });
    }
  };

  // 表单提交处理
  const handleSubmit = (e) => {
    e.preventDefault(); // 防止默认表单提交行为
    // 当用户按回车或点击提交时，触发支付创建
    if (!isCreatingPayment && shopOpen) handleCreatePayment();
  };

  // 加载可选地址（宿舍区）
  const loadAddresses = async () => {
    setAddrLoading(true);
    try {
      const res = await apiRequest('/addresses');
      const addrs = res?.data?.addresses || [];
      setAddressOptions(addrs);
      // 如果当前未选择，默认选第一个
      if (!formData.dormitory && addrs.length > 0) {
        setFormData(prev => ({ ...prev, dormitory: addrs[0].name }));
      }
    } catch (e) {
      // 回退一个默认值：桃园
      const fallback = [{ id: 'addr_default_taoyuan', name: '桃园' }];
      setAddressOptions(fallback);
      if (!formData.dormitory) {
        setFormData(prev => ({ ...prev, dormitory: '桃园' }));
      }
    } finally {
      setAddrLoading(false);
    }
  };

  // 根据选中的园区加载楼栋
  const loadBuildings = async (addrName, addrId) => {
    setBldLoading(true);
    try {
      const query = addrId ? `?address_id=${encodeURIComponent(addrId)}` : (addrName ? `?address_name=${encodeURIComponent(addrName)}` : '');
      const res = await apiRequest(`/buildings${query}`);
      const blds = res?.data?.buildings || [];
      setBuildingOptions(blds);
      if (!formData.building && blds.length > 0) {
        setFormData(prev => ({ ...prev, building: blds[0].name }));
      }
    } catch (e) {
      const fallback = [{ id: 'bld_default_6she', name: '六舍' }];
      setBuildingOptions(fallback);
      if (!formData.building) {
        setFormData(prev => ({ ...prev, building: '六舍' }));
      }
    } finally {
      setBldLoading(false);
    }
  };

  // 打开支付弹窗（不创建订单，直到点击按钮）
  const handleCreatePayment = async () => {
    // 验证必填字段
    if (!formData.name || !formData.phone || !formData.dormitory || !formData.building || !formData.room) {
      alert('请填写完整的收货信息');
      return;
    }
    
    // 简单的手机号验证
    const phoneRegex = /^1[3-9]\d{9}$/;
    if (!phoneRegex.test(formData.phone)) {
      alert('请输入正确的手机号');
      return;
    }

    setIsCreatingPayment(true);
    setError('');
    try {
      setShowPayModal(true);
    } finally {
      setIsCreatingPayment(false);
    }
  };

  // 用户点击“已付款”：创建订单并标记为待验证，清空购物车并跳转订单页
  const handleMarkPaid = async () => {
    try {
      const shippingInfo = {
        name: formData.name,
        phone: formData.phone,
        dormitory: formData.dormitory,
        building: formData.building,
        room: formData.room,
        full_address: `${formData.dormitory} ${formData.building} ${formData.room}`
      };
      const orderResponse = await apiRequest('/orders', {
        method: 'POST',
        body: JSON.stringify({
          shipping_info: shippingInfo,
          payment_method: 'wechat',
          note: formData.note
        })
      });
      if (!orderResponse.success) throw new Error(orderResponse.message || '订单创建失败');
      const createdOrderId = orderResponse.data.order_id;
      setOrderId(createdOrderId);
      const res = await apiRequest(`/orders/${createdOrderId}/mark-paid`, { method: 'POST' });
      if (res.success) {
        try { await clearCart(); } catch (e) {}
        router.push('/orders');
      } else {
        alert(res.message || '操作失败');
      }
    } catch (err) {
      alert(err.message || '操作失败');
    }
  };

  // 初始化加载
  useEffect(() => {
    if (user) {
      loadCart();
      loadAddresses();
      // 读取最近一次成功付款的收货信息
      (async () => {
        try {
          const res = await apiRequest('/profile/shipping');
          const ship = res?.data?.shipping;
          if (ship) {
            setFormData(prev => ({
              ...prev,
              name: ship.name || prev.name,
              phone: ship.phone || prev.phone,
              dormitory: ship.dormitory || prev.dormitory,
              building: ship.building || prev.building,
              room: ship.room || prev.room,
            }));
          }
        } catch (e) {
          // 忽略
        }
      })();
    }
  }, [user]);

  // 当园区变化时，刷新楼栋
  useEffect(() => {
    if (!formData.dormitory) return;
    const addr = addressOptions.find(a => a.name === formData.dormitory);
    loadBuildings(formData.dormitory, addr?.id);
  }, [formData.dormitory, addressOptions]);

  // 如果用户未登录，不渲染内容
  if (!user) {
    return null;
  }

  return (
    <>
      <Head>
        <title>结算 - [商店名称]</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>

      <div className="min-h-screen bg-gray-50">
        {/* 导航栏 */}
        <nav className="bg-white shadow-sm border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center">
                <Link 
                  href="/"
                  className="flex items-center"
                >
                  <div className="h-8 w-8 bg-indigo-600 rounded-full flex items-center justify-center">
                    <span className="text-white font-bold text-sm">L</span>
                  </div>
                  <span className="ml-2 text-xl font-bold text-gray-900">智能小商城</span>
                </Link>
              </div>
              
              <div className="flex items-center space-x-4">
                <Link href="/shop" className="text-gray-700 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium">商品商城</Link>
                <Link href="/cart" className="text-gray-700 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium">购物车</Link>
                <Link href="/orders" className="text-gray-700 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium">我的订单</Link>
                <span className="text-sm text-gray-600">{user.name}</span>
              </div>
            </div>
          </div>
        </nav>

        {/* 主要内容 */}
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900">确认订单</h1>
            <p className="text-gray-600 mt-1">请确认您的订单信息和收货地址</p>
          </div>
          {!shopOpen && (
            <div className="mb-4 rounded-md bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3">
              {shopNote}
            </div>
          )}

          {/* 错误提示 */}
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {/* 加载状态 */}
          {isLoading ? (
            <div className="space-y-6">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="animate-pulse space-y-4">
                  <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                  <div className="space-y-3">
                    <div className="h-4 bg-gray-200 rounded"></div>
                    <div className="h-4 bg-gray-200 rounded w-5/6"></div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="lg:grid lg:grid-cols-3 lg:gap-8">
              {/* 订单表单 */}
              <div className="lg:col-span-2 space-y-6">
                {/* 收货信息 */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <h2 className="text-lg font-medium text-gray-900 mb-4">收货信息</h2>
                  
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                          姓名 *
                        </label>
                        <input
                          type="text"
                          id="name"
                          name="name"
                          required
                          value={formData.name}
                          onChange={handleInputChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                          placeholder="请输入姓名"
                        />
                      </div>
                      
                      <div>
                        <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                          手机号 *
                        </label>
                        <input
                          type="tel"
                          id="phone"
                          name="phone"
                          required
                          value={formData.phone}
                          onChange={handleInputChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                          placeholder="请输入手机号"
                        />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label htmlFor="dormitory" className="block text-sm font-medium text-gray-700 mb-1">
                          宿舍区 *
                        </label>
                        <select
                          id="dormitory"
                          name="dormitory"
                          required
                          value={formData.dormitory}
                          onChange={handleInputChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                        >
                          <option value="">{addrLoading ? '加载中...' : '请选择'}</option>
                          {addressOptions.map(a => (
                            <option key={a.id || a.name} value={a.name}>{a.name}</option>
                          ))}
                        </select>
                      </div>
                      
                      <div>
                        <label htmlFor="building" className="block text-sm font-medium text-gray-700 mb-1">
                          楼栋 *
                        </label>
                        <select
                          id="building"
                          name="building"
                          required
                          value={formData.building}
                          onChange={handleInputChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                        >
                          <option value="">{bldLoading ? '加载中...' : '请选择'}</option>
                          {buildingOptions.map(b => (
                            <option key={b.id || b.name} value={b.name}>{b.name}</option>
                          ))}
                        </select>
                      </div>
                      
                      <div>
                        <label htmlFor="room" className="block text-sm font-medium text-gray-700 mb-1">
                          房间号 *
                        </label>
                        <input
                          type="text"
                          id="room"
                          name="room"
                          required
                          value={formData.room}
                          onChange={handleInputChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                          placeholder="如：101"
                        />
                      </div>
                    </div>
                    
                    <div>
                      <label htmlFor="note" className="block text-sm font-medium text-gray-700 mb-1">
                        备注信息
                      </label>
                      <textarea
                        id="note"
                        name="note"
                        rows={3}
                        value={formData.note}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                        placeholder="有什么特别要求可以在这里说明..."
                      />
                    </div>
                  </form>
                </div>

                {/* 支付方式说明 */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <h2 className="text-lg font-medium text-gray-900 mb-4">支付方式</h2>

                  <div className="flex items-center p-3 border-2 border-green-200 bg-green-50 rounded-lg">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <span className="text-sm font-medium text-green-900">微信扫码支付</span>
                      <p className="text-xs text-green-700 mt-1">创建支付后会弹出收款码，请使用长按扫码付款</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* 订单摘要 */}
              <div className="lg:col-span-1">
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 sticky top-8">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">订单摘要</h3>
                  
                  {/* 商品列表 */}
                  <div className="space-y-3 mb-6">
                    {cart.items && cart.items.map((item) => (
                      <div key={(item.product_id + (item.variant_id || ''))} className="flex justify-between text-sm">
                        <div className="flex-1">
                          <p className="text-gray-900 truncate">
                            {item.name}
                            {item.variant_name && (
                              <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{item.variant_name}</span>
                            )}
                          </p>
                          <p className="text-gray-500">x{item.quantity}</p>
                        </div>
                        <span className="text-gray-900 ml-2">¥{item.subtotal}</span>
                      </div>
                    ))}
                  </div>
                  
                  {/* 费用明细 */}
                  <div className="space-y-3 mb-6 border-t border-gray-200 pt-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">商品金额</span>
                      <span className="text-gray-900">¥{cart.total_price}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">配送费</span>
                      <span className="text-gray-900">{cart.shipping_fee > 0 ? `¥${cart.shipping_fee}` : '免费'}</span>
                    </div>
                    <div className="flex justify-between text-base font-medium border-t border-gray-200 pt-3">
                      <span className="text-gray-900">总计</span>
                      <span className="text-gray-900">¥{cart.payable_total ?? cart.total_price}</span>
                    </div>
                  </div>
                  
                  {/* 支付按钮 */}
                  <button
                    onClick={handleCreatePayment}
                    disabled={isCreatingPayment || !shopOpen}
                    className="w-full bg-indigo-600 text-white py-3 px-4 rounded-md font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isCreatingPayment ? (
                      <div className="flex items-center justify-center">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                        创建支付中...
                      </div>
                    ) : (
                      (shopOpen ? `创建支付 ¥${cart.payable_total ?? cart.total_price}` : '打烊中 · 暂停结算')
                    )}
                  </button>
                  
                  <p className="text-xs text-gray-500 text-center mt-3">
                    点击支付即表示您同意我们的服务条款
                  </p>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
      {/* 微信收款码弹窗 */}
      {showPayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black bg-opacity-60" onClick={() => setShowPayModal(false)}></div>
          <div className="relative bg-white rounded-lg shadow-xl p-6 w-96 z-10">
            <h3 className="text-lg font-medium text-gray-900 mb-4 text-center">请长按图片扫码付款</h3>
            <div className="w-full flex justify-center mb-4">
              <img src="/1_wx.png" alt="微信收款码" className="rounded-md w-64 h-64 object-contain border" />
            </div>
            <p className="text-sm text-gray-600 mb-4 text-center">付款完成后点击下方“已付款”按钮，我们会尽快核验。</p>
            <div className="flex gap-3">
              <button
                onClick={handleMarkPaid}
                className="flex-1 bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700"
              >已付款</button>
              <button
                onClick={handlePayLater}
                className="flex-1 bg-gray-100 text-gray-800 py-2 px-4 rounded-md hover:bg-gray-200"
              >稍后支付</button>
            </div>
            <div className="mt-3 text-center text-sm">
              <Link href="/orders" className="text-indigo-600 hover:underline">查看我的订单状态</Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
