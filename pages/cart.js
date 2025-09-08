import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useAuth, useCart, useApi } from '../hooks/useAuth';
import { useProducts } from '../hooks/useAuth';
import { useRouter } from 'next/router';
import Nav from '../components/Nav';
import RetryImage from '../components/RetryImage';
import { getProductImage } from '../utils/urls';

// 购物车商品项组件
const CartItem = ({ item, onUpdateQuantity, onRemove, isLoading }) => {
  const [quantity, setQuantity] = useState(item.quantity);
  const isDown = item.is_active === 0 || item.is_active === false;

  const handleQuantityChange = (newQuantity) => {
    if (newQuantity < 1) {
      setQuantity(0);
      onUpdateQuantity(item.product_id, 0, item.variant_id || null);
      return;
    }
    setQuantity(newQuantity);
    onUpdateQuantity(item.product_id, newQuantity, item.variant_id || null);
  };

  return (
    <div className={`bg-white border border-gray-200 p-6 mb-3 ${isDown ? 'opacity-60 grayscale' : ''}`}>
      <div className="flex items-start gap-4">
        {/* 商品图片 */}
        <div className="flex-shrink-0 w-20 h-20 bg-gray-50 border border-gray-100 overflow-hidden">
          {item.img_path ? (
            <RetryImage
              src={getProductImage(item)}
              alt={item.name}
              className="h-full w-full object-cover object-center"
              maxRetries={3}
              onFinalError={() => {
                console.log(`购物车商品图片最终加载失败: ${item.name}`);
              }}
            />
          ) : (
            <div className="h-full w-full bg-gray-50 flex items-center justify-center">
              <span className="text-gray-400 text-xs">暂无图片</span>
            </div>
          )}
        </div>
        
        {/* 商品信息 */}
        <div className="flex-1 min-w-0">
          <h3 className={`text-base font-medium leading-tight mb-2 ${isDown ? 'text-gray-500' : 'text-gray-900'}`}>
            {item.name}
          </h3>
          
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {item.variant_name && (
              <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 border border-gray-200">
                {item.variant_name}
              </span>
            )}
            {isDown && (
              <span className="text-xs px-2 py-1 bg-gray-100 text-gray-500 border border-gray-200">
                暂时下架
              </span>
            )}
          </div>
          
          <div className="text-sm text-gray-600">
            单价 ¥{item.unit_price}
            {isDown && <span className="ml-2 text-xs text-gray-400">（不计入金额）</span>}
          </div>
        </div>
        
        {/* 右侧操作区 */}
        <div className="flex flex-col items-end gap-4">
          {/* 小计 */}
          <div className="text-right">
            <div className="text-lg font-medium text-gray-900">¥{item.subtotal}</div>
          </div>
          
          {/* 数量控制 */}
          <div className="flex items-center border border-gray-200">
            <button
              onClick={() => handleQuantityChange(quantity - 1)}
              disabled={isLoading || isDown}
              className="w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed border-r border-gray-200"
            >
              <i className="fas fa-minus text-xs"></i>
            </button>
            <span className="w-12 h-8 flex items-center justify-center text-sm font-medium bg-gray-50">{quantity}</span>
            <button
              onClick={() => handleQuantityChange(quantity + 1)}
              disabled={isLoading || isDown}
              className="w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed border-l border-gray-200"
            >
              <i className="fas fa-plus text-xs"></i>
            </button>
          </div>
          
          {/* 移除按钮 */}
          <button
            onClick={() => onRemove(item.product_id, item.variant_id || null)}
            disabled={isLoading}
            className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50"
          >
            移除
          </button>
        </div>
      </div>
    </div>
  );
};

// 订单摘要组件
const OrderSummary = ({ cart, onCheckout, isLoading, isClosed }) => {
  return (
    <div className="bg-white border border-gray-200 p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-6 pb-3 border-b border-gray-100">订单摘要</h3>
      
      <div className="space-y-4 mb-6">
        <div className="flex justify-between items-center">
          <span className="text-gray-600">商品数量</span>
          <span className="text-gray-900 font-medium">{cart.total_quantity} 件</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-600">商品金额</span>
          <span className="text-gray-900 font-medium">¥{cart.total_price}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-600">配送费</span>
          <span className="text-gray-900 font-medium">{cart.shipping_fee > 0 ? `¥${cart.shipping_fee}` : '免费'}</span>
        </div>
        
        {cart.total_quantity > 0 && cart.total_price < 10 && (
          <div className="bg-gray-50 border border-gray-200 p-3 text-sm text-gray-700">
            还差 <span className="font-semibold text-gray-900">¥{(10 - cart.total_price).toFixed(2)}</span> 
            <span className="font-semibold text-red-500"> 免运费</span>
            和
            <span className="font-semibold text-red-500">抽奖资格</span>
            <a href="/shop" className="ml-2 text-gray-900 underline hover:no-underline">去凑单</a>
          </div>
        )}
        
        <div className="border-t border-gray-200 pt-4 mt-4">
          <div className="flex justify-between items-center">
            <span className="text-lg font-medium text-gray-900">总计</span>
            <span className="text-xl font-medium text-gray-900">¥{cart.payable_total ?? cart.total_price}</span>
          </div>
        </div>
      </div>
      
      <button
        onClick={onCheckout}
        disabled={isLoading || cart.total_quantity === 0 || isClosed}
        className="w-full bg-gray-900 text-white py-3 px-4 font-medium hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
      >
        {isLoading ? '处理中...' : (isClosed ? '打烊中 · 暂停结算' : '去结算')}
      </button>
    </div>
  );
};

export default function Cart() {
  const router = useRouter();
  const { user } = useAuth();
  const { getCart, updateCart, removeFromCart, clearCart } = useCart();
  const { getShopStatus } = useProducts();
  const { apiRequest } = useApi();
  
  const [cart, setCart] = useState({ items: [], total_quantity: 0, total_price: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [shopOpen, setShopOpen] = useState(true);
  const [shopNote, setShopNote] = useState('');
  const [eligibleRewards, setEligibleRewards] = useState([]);

  // 检查登录状态
  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
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
    } catch (err) {
      setError(err.message || '加载购物车失败');
    } finally {
      setIsLoading(false);
    }
  };

  // 更新商品数量
  const handleUpdateQuantity = async (productId, quantity, variantId = null) => {
    setActionLoading(true);
    try {
      await updateCart('update', productId, quantity, variantId);
      await loadCart(); // 重新加载购物车
    } catch (err) {
      alert(err.message || '更新失败');
    } finally {
      setActionLoading(false);
    }
  };

  // 删除商品
  const handleRemoveItem = async (productId, variantId = null) => {
    if (!confirm('确定要删除这个商品吗？')) return;
    
    setActionLoading(true);
    try {
      await removeFromCart(productId, variantId);
      await loadCart(); // 重新加载购物车
    } catch (err) {
      alert(err.message || '删除失败');
    } finally {
      setActionLoading(false);
    }
  };

  // 清空购物车
  const handleClearCart = async () => {
    if (!confirm('确定要清空购物车吗？')) return;
    
    setActionLoading(true);
    try {
      await clearCart();
      await loadCart(); // 重新加载购物车
    } catch (err) {
      alert(err.message || '清空失败');
    } finally {
      setActionLoading(false);
    }
  };

  // 去结算
  const handleCheckout = () => {
    if (!shopOpen) {
      alert(shopNote || '当前打烊，暂不支持结算，仅可加入购物车');
      return;
    }
    router.push('/checkout');
  };

  // 初始化加载
  useEffect(() => {
    if (user) {
      loadCart();
    }
  }, [user]);

  // 加载店铺状态
  useEffect(() => {
    (async () => {
      try {
        const s = await getShopStatus();
        setShopOpen(!!s.data?.is_open);
        setShopNote(s.data?.note || '当前打烊，暂不支持结算，仅可加入购物车');
      } catch (e) {}
    })();
  }, []);

  // 如果用户未登录，不渲染内容
  if (!user) {
    return null;
  }

  return (
    <>
      <Head>
        <title>购物车 - [商店名称]</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>

      {/* 顶部导航（移动端优化） */}
      <Nav active="cart" />

      <div className="min-h-screen bg-white pt-16">
        {/* 主要内容 */}
        <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-8 pb-6 border-b border-gray-200 flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-medium text-gray-900">购物车</h1>
              <p className="text-gray-600 mt-2">管理您的购物车商品</p>
            </div>
            
            {cart.items && cart.items.length > 0 && (
              <button
                onClick={handleClearCart}
                disabled={actionLoading}
                className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50 border border-gray-300 px-3 py-2 hover:border-gray-400 transition-colors"
              >
                清空购物车
              </button>
            )}
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="mb-6 bg-gray-50 border border-gray-200 text-gray-700 px-4 py-3">
              {error}
            </div>
          )}

          {/* 加载状态 */}
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="bg-white border border-gray-200 p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-20 h-20 bg-gray-100 animate-pulse"></div>
                    <div className="flex-1">
                      <div className="h-4 bg-gray-100 animate-pulse mb-3"></div>
                      <div className="h-3 bg-gray-100 animate-pulse w-1/2 mb-2"></div>
                      <div className="h-3 bg-gray-100 animate-pulse w-1/3"></div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <div className="w-16 h-6 bg-gray-100 animate-pulse"></div>
                      <div className="w-20 h-8 bg-gray-100 animate-pulse"></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              {cart.items && cart.items.length > 0 ? (
                <div className="lg:grid lg:grid-cols-3 lg:gap-8">
                  {/* 购物车商品列表 */}
                  <div className="lg:col-span-2 space-y-0">
                    {cart.items.map((item) => (
                      <CartItem
                        key={item.product_id}
                        item={item}
                        onUpdateQuantity={handleUpdateQuantity}
                        onRemove={handleRemoveItem}
                        isLoading={actionLoading}
                      />
                    ))}

                    {/* 抽奖奖品展示（不计入金额，满10自动附带）*/}
                    {eligibleRewards.length > 0 && (
                      <div className="mt-4">
                        <div className="mb-2 flex items-center gap-2">
                          <div className="w-6 h-6 bg-amber-100 rounded flex items-center justify-center">
                            <i className="fas fa-gift text-amber-600 text-xs"></i>
                          </div>
                          <h3 className="text-sm font-semibold text-gray-900">我的抽奖奖品</h3>
                        </div>

                        {eligibleRewards.map((r) => {
                          const meet = (cart?.total_price ?? 0) >= 10;
                          return (
                            <div
                              key={r.id}
                              className={`border p-4 mb-3 ${meet ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-200 opacity-80'}`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] ${meet ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-600 border border-gray-200'}`}>
                                      抽奖奖品
                                    </span>
                                    <span className={`text-sm font-medium ${meet ? 'text-emerald-800' : 'text-gray-700'}`}>{r.prize_name || '奖品'}</span>
                                    <span className={`text-xs ${meet ? 'text-emerald-700' : 'text-gray-600'}`}>× {r.prize_quantity || 1}</span>
                                  </div>
                                  <p className={`mt-1 text-xs ${meet ? 'text-emerald-700' : 'text-gray-600'}`}>
                                    {meet ? '已满足满10，本单将自动附带并随单配送' : '未达满10，本单结算不会附带；满10自动附带并配送'}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <span className={`text-sm font-semibold ${meet ? 'text-emerald-700' : 'text-gray-600'}`}>¥0.00</span>
                                  <p className={`text-xs ${meet ? 'text-emerald-600' : 'text-gray-500'}`}>赠品</p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  
                  {/* 订单摘要 */}
                  <div className="lg:col-span-1 mt-6 lg:mt-0">
                    <div className="lg:sticky lg:top-24">
                      <OrderSummary
                        cart={cart}
                        onCheckout={handleCheckout}
                        isLoading={actionLoading}
                        isClosed={!shopOpen}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-20">
                  <div className="max-w-sm mx-auto">
                    <div className="w-16 h-16 bg-gray-100 mx-auto mb-6 flex items-center justify-center">
                      <i className="fas fa-shopping-cart text-gray-400 text-xl"></i>
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">购物车是空的</h3>
                    <p className="text-gray-600 mb-8">快去商城逛逛，发现喜欢的商品吧！</p>
                    <Link href="/shop" className="inline-flex items-center px-6 py-3 bg-gray-900 text-white font-medium hover:bg-gray-800 transition-colors">
                      去购物
                    </Link>
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </>
  );
}
