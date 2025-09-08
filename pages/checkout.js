import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useAuth, useCart, useApi } from '../hooks/useAuth';
import { useProducts } from '../hooks/useAuth';
import { useRouter } from 'next/router';
import Nav from '../components/Nav';

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
  const [eligibleRewards, setEligibleRewards] = useState([]);
  // 抽奖弹窗
  const [lotteryOpen, setLotteryOpen] = useState(false);
  const [lotteryNames, setLotteryNames] = useState([]);
  const [lotteryResult, setLotteryResult] = useState('');
  const [lotteryDisplay, setLotteryDisplay] = useState('');
  const [spinning, setSpinning] = useState(false);
  
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
      // 加载可用抽奖奖品
      try {
        const rw = await apiRequest('/rewards/eligible');
        setEligibleRewards(rw?.data?.rewards || []);
      } catch (e) {
        setEligibleRewards([]);
      }
      
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
        // 触发抽奖动画
        try {
          const draw = await apiRequest(`/orders/${createdOrderId}/lottery/draw`, { method: 'POST' });
          if (draw.success) {
            const names = (draw.data?.names && draw.data.names.length > 0)
              ? draw.data.names
              : [draw.data?.prize_name];
            setLotteryNames(names);
            setLotteryResult(draw.data?.prize_name || '');
            setLotteryDisplay(names[0] || '');
            setLotteryOpen(true);
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
              setLotteryDisplay(draw.data?.prize_name || names[0]);
            }, duration);
          }
        } catch (e) {
          // 忽略
        }
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

       <div className="min-h-screen" style={{
         background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.15) 0%, rgba(236, 72, 153, 0.12) 25%, rgba(168, 85, 247, 0.1) 50%, rgba(6, 182, 212, 0.12) 75%, rgba(16, 185, 129, 0.15) 100%), #fafafa'
       }}>
        {/* 背景装饰 */}
         <div className="absolute inset-0 overflow-hidden">
           <div className="absolute -top-20 -left-20 w-80 h-80 rounded-full bg-orange-400/8 backdrop-blur-3xl animate-pulse"></div>
           <div className="absolute top-40 -right-32 w-96 h-96 rounded-full bg-pink-400/6 backdrop-blur-3xl"></div>
           <div className="absolute -bottom-20 left-1/2 transform -translate-x-1/2 w-72 h-72 rounded-full bg-cyan-400/8 backdrop-blur-3xl"></div>
           <div className="absolute bottom-32 right-1/4 w-56 h-56 rounded-full bg-emerald-400/6 backdrop-blur-3xl"></div>
         </div>

        {/* 统一导航栏 */}
        <Nav active="checkout" />

        {/* 主要内容 */}
        <main className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pt-24">
          {/* 页面标题 */}
          <div className="text-center mb-12 animate-apple-fade-in">
            <div className="flex justify-center mb-6">
              <div className="relative">
                <div className="absolute -inset-2 bg-gradient-to-r from-purple-500 to-pink-600 rounded-2xl blur opacity-60"></div>
                <div className="relative w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-600 rounded-2xl flex items-center justify-center shadow-2xl">
                  <i className="fas fa-credit-card text-white text-xl"></i>
                </div>
              </div>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">确认订单</h1>
            <p className="text-gray-700">请确认您的订单信息和收货地址</p>
          </div>
          
          {!shopOpen && (
            <div className="mb-6 card-glass p-4 border border-orange-200/50 text-orange-100 animate-apple-fade-in">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-orange-500/20 rounded-full flex items-center justify-center">
                  <i className="fas fa-exclamation-triangle text-orange-300"></i>
                </div>
                <div>
                  <p className="font-medium text-orange-200">店铺提醒</p>
                  <p className="text-sm text-orange-300">{shopNote}</p>
                </div>
              </div>
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
            <div className="lg:grid lg:grid-cols-3 lg:gap-8 animate-apple-fade-in animate-delay-200">
              {/* 订单表单 */}
              <div className="lg:col-span-2 space-y-8">
                {/* 收货信息 */}
                <div className="card-glass p-8 border border-white/30 animate-apple-slide-up">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-cyan-600 rounded-xl flex items-center justify-center">
                      <i className="fas fa-map-marker-alt text-white"></i>
                    </div>
                    <h2 className="text-xl font-semibold text-gray-900">收货信息</h2>
                  </div>
                  
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div>
                        <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                          <i className="fas fa-user mr-2"></i>姓名 *
                        </label>
                        <input
                          type="text"
                          id="name"
                          name="name"
                          required
                          value={formData.name}
                          onChange={handleInputChange}
                          className="input-glass w-full text-gray-900 placeholder-gray-500"
                          placeholder="请输入您的姓名"
                        />
                      </div>
                      
                      <div>
                        <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
                          <i className="fas fa-phone mr-2"></i>手机号 *
                        </label>
                        <input
                          type="tel"
                          id="phone"
                          name="phone"
                          required
                          value={formData.phone}
                          onChange={handleInputChange}
                          className="input-glass w-full text-gray-900 placeholder-gray-500"
                          placeholder="请输入手机号码"
                        />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                      <div>
                        <label htmlFor="dormitory" className="block text-sm font-medium text-gray-700 mb-2">
                          <i className="fas fa-building mr-2"></i>宿舍区 *
                        </label>
                        <select
                          id="dormitory"
                          name="dormitory"
                          required
                          value={formData.dormitory}
                          onChange={handleInputChange}
                          className="input-glass w-full text-gray-900"
                        >
                          <option value="" className="text-gray-900">{addrLoading ? '加载中...' : '请选择'}</option>
                          {addressOptions.map(a => (
                            <option key={a.id || a.name} value={a.name} className="text-gray-900">{a.name}</option>
                          ))}
                        </select>
                      </div>
                      
                      <div>
                        <label htmlFor="building" className="block text-sm font-medium text-gray-700 mb-2">
                          <i className="fas fa-home mr-2"></i>楼栋 *
                        </label>
                        <select
                          id="building"
                          name="building"
                          required
                          value={formData.building}
                          onChange={handleInputChange}
                          className="input-glass w-full text-gray-900"
                        >
                          <option value="" className="text-gray-900">{bldLoading ? '加载中...' : '请选择'}</option>
                          {buildingOptions.map(b => (
                            <option key={b.id || b.name} value={b.name} className="text-gray-900">{b.name}</option>
                          ))}
                        </select>
                      </div>
                      
                      <div>
                        <label htmlFor="room" className="block text-sm font-medium text-gray-700 mb-2">
                          <i className="fas fa-door-open mr-2"></i>房间号 *
                        </label>
                        <input
                          type="text"
                          id="room"
                          name="room"
                          required
                          value={formData.room}
                          onChange={handleInputChange}
                          className="input-glass w-full text-gray-900 placeholder-gray-500"
                          placeholder="如：101"
                        />
                      </div>
                    </div>
                    
                    <div>
                      <label htmlFor="note" className="block text-sm font-medium text-gray-700 mb-2">
                        <i className="fas fa-comment mr-2"></i>备注信息
                      </label>
                      <textarea
                        id="note"
                        name="note"
                        rows={3}
                        value={formData.note}
                        onChange={handleInputChange}
                        className="input-glass w-full text-gray-900 placeholder-gray-500 resize-none"
                        placeholder="有什么特别要求可以在这里说明..."
                      />
                    </div>
                  </form>
                </div>

                {/* 支付方式说明 */}
                <div className="card-glass p-6 border border-white/30 animate-apple-slide-up animate-delay-100">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center">
                      <i className="fas fa-credit-card text-white"></i>
                    </div>
                    <h2 className="text-xl font-semibold text-gray-900">支付方式</h2>
                  </div>

                  <div className="bg-green-500/20 border border-green-400/30 backdrop-blur-sm rounded-xl p-4">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                          <i className="fas fa-check text-white text-sm"></i>
                        </div>
                      </div>
                      <div className="ml-4">
                        <div className="flex items-center gap-2 mb-1">
                          <i className="fab fa-weixin text-green-400 text-lg"></i>
                          <span className="text-sm font-medium text-gray-900">微信扫码支付</span>
                        </div>
                        <p className="text-xs text-gray-700">创建支付后会弹出收款码，请使用微信长按扫码付款</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 订单摘要 */}
              <div className="lg:col-span-1">
                <div className="card-glass p-6 border border-white/30 sticky top-8 animate-apple-scale-in animate-delay-300">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center">
                      <i className="fas fa-file-invoice-dollar text-white"></i>
                    </div>
                    <h3 className="text-xl font-semibold text-gray-900">订单摘要</h3>
                  </div>
                  
                  {/* 商品列表 */}
                  <div className="space-y-4 mb-6">
                    {cart.items && cart.items.map((item, index) => {
                      const isDown = item.is_active === 0 || item.is_active === false;
                      return (
                        <div 
                          key={(item.product_id + (item.variant_id || ''))} 
                          className={`bg-white/10 backdrop-blur-sm rounded-xl p-3 border border-white/20 animate-apple-fade-in ${isDown ? 'opacity-60 grayscale' : ''}`}
                          style={{ animationDelay: `${index * 0.1}s` }}
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex-1 min-w-0">
                              <p className={`truncate text-sm font-medium ${isDown ? 'text-gray-500' : 'text-gray-900'}`}>
                                {item.name}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                {item.variant_name && (
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200">
                                    {item.variant_name}
                                  </span>
                                )}
                                {isDown && (
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200">
                                    暂时下架
                                  </span>
                                )}
                              </div>
                              <p className="text-gray-600 text-xs mt-1">
                                数量: {item.quantity} {isDown && <span className="text-gray-500">（不计入金额）</span>}
                              </p>
                            </div>
                            <div className="text-right ml-3">
                              <span className={`text-sm font-semibold ${isDown ? 'text-gray-500' : 'text-gray-900'}`}>
                                ¥{item.subtotal}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  
                  {/* 费用明细 */}
                  <div className="space-y-4 mb-6 border-t border-white/20 pt-4">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-600 flex items-center gap-2">
                        <i className="fas fa-shopping-bag"></i>
                        商品金额
                      </span>
                      <span className="text-gray-900 font-medium">¥{cart.total_price}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-600 flex items-center gap-2">
                        <i className="fas fa-truck"></i>
                        配送费
                      </span>
                      <span className="text-gray-900 font-medium">
                        {cart.shipping_fee > 0 ? `¥${cart.shipping_fee}` : (
                          <span className="text-green-400">免费</span>
                        )}
                      </span>
                    </div>
                    <div className="bg-white/10 rounded-xl p-4 border border-white/20">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-900 font-semibold flex items-center gap-2">
                          <i className="fas fa-calculator"></i>
                          总计
                        </span>
                        <span className="text-xl font-bold text-gray-900">¥{cart.payable_total ?? cart.total_price}</span>
                      </div>
                    </div>
                  </div>
                  {/* 抽奖奖品（仅展示，不计入金额；达标则自动随单配送）*/}
                  {eligibleRewards && eligibleRewards.length > 0 && (
                    <div className="mb-6 border-t border-white/20 pt-4">
                      <div className="flex items-center gap-2 mb-2">
                        <i className="fas fa-gift text-pink-500"></i>
                        <span className="text-sm font-medium text-gray-900">抽奖奖品</span>
                      </div>
                      <div className="space-y-1">
                        {eligibleRewards.map((r) => (
                          <div key={r.id} className={`flex justify-between text-sm ${cart.total_price >= 10 ? 'text-gray-900' : 'text-gray-400'}`}>
                            <span>{r.prize_name} × {r.prize_quantity || 1}</span>
                            <span>¥0.00</span>
                          </div>
                        ))}
                      </div>
                      <p className={`mt-2 text-xs ${cart.total_price >= 10 ? 'text-green-600' : 'text-gray-500'}`}>
                        {cart.total_price >= 10 ? '本单满10元，将自动随单配送抽奖奖品（免费）' : '订单满10元将自动随下单配送抽奖奖品（免费）'}
                      </p>
                    </div>
                  )}
                  
                  {/* 支付按钮 */}
                  <button
                    onClick={handleCreatePayment}
                    disabled={isCreatingPayment || !shopOpen}
                    className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none transform hover:scale-105 transition-all duration-300 text-white shadow-2xl flex items-center justify-center gap-2"
                  >
                    {isCreatingPayment ? (
                      <>
                        <div className="loading-dots text-white"></div>
                        <span>创建支付中...</span>
                      </>
                    ) : (
                      <>
                        <i className="fas fa-credit-card"></i>
                        <span>
                          {shopOpen ? `立即支付 ¥${cart.payable_total ?? cart.total_price}` : '打烊中 · 暂停结算'}
                        </span>
                      </>
                    )}
                  </button>
                  
                  <div className="mt-4 text-center">
                    <p className="text-xs text-gray-600 leading-relaxed">
                      点击支付即表示您同意我们的
                      <span className="text-gray-700 underline cursor-pointer"> 服务条款</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
      {/* 微信收款码弹窗 */}
      {showPayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-apple-fade-in">
          <div className="absolute inset-0" onClick={() => setShowPayModal(false)}></div>
          <div className="relative card-glass max-w-sm w-full mx-4 p-8 border border-white/30 shadow-2xl animate-apple-scale-in z-10">
            {/* 弹窗标题 */}
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                <i className="fab fa-weixin text-white text-2xl"></i>
              </div>
              <h4 className="text-xl font-semibold text-gray-900 mb-2">长按图片扫描二维码支付</h4>
            </div>

            {/* 二维码区域 */}
            <div className="mb-6 text-center">
              <img 
                src="/1_wx.png" 
                alt="微信收款码" 
                className="mx-auto w-64 h-64 object-contain" 
              />
            </div>


            {/* 操作按钮 */}
            <div className="flex gap-3">
              <button
                onClick={handleMarkPaid}
                className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600 text-white py-3 px-3 rounded-xl font-medium hover:from-green-600 hover:to-emerald-700 transform hover:scale-105 transition-all duration-300 shadow-lg flex items-center justify-center gap-2 text-sm"
              >
                <i className="fas fa-check-circle"></i>
                <span>我已完成付款</span>
              </button>
              
              <button
                onClick={handlePayLater}
                className="flex-1 bg-gray-100 text-gray-900 py-3 px-3 rounded-xl font-medium hover:bg-gray-200 border border-gray-300 transition-all duration-300 flex items-center justify-center gap-2 text-sm"
              >
                <i className="fas fa-clock"></i>
                <span>稍后支付</span>
              </button>
            </div>

            {/* 底部链接 */}
            <div className="mt-6 text-center">
              <Link 
                href="/orders" 
                className="text-gray-600 hover:text-gray-900 text-sm underline transition-colors flex items-center justify-center gap-1"
              >
                <i className="fas fa-external-link-alt"></i>
                <span>查看我的订单状态</span>
              </Link>
            </div>

            {/* 关闭按钮 */}
            <button
              onClick={() => setShowPayModal(false)}
              className="absolute top-4 right-4 w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center text-gray-600 hover:text-gray-900 transition-all duration-200"
            >
              <i className="fas fa-times"></i>
            </button>
          </div>
        </div>
      )}

      {/* 抽奖弹窗 */}
      {lotteryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={() => { setLotteryOpen(false); router.push('/orders'); }}></div>
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
              <button onClick={() => { setLotteryOpen(false); router.push('/orders'); }} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-xl">知道了</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
