import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useAuth, useCart } from '../hooks/useAuth';
import { useRouter } from 'next/router';
import Nav from '../components/Nav';

// 购物车商品项组件
const CartItem = ({ item, onUpdateQuantity, onRemove, isLoading }) => {
  const [quantity, setQuantity] = useState(item.quantity);

  const handleQuantityChange = (newQuantity) => {
    if (newQuantity < 1) return;
    setQuantity(newQuantity);
    onUpdateQuantity(item.product_id, newQuantity);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
      <div className="flex items-center space-x-4">
        {/* 商品图片占位 */}
        <div className="flex-shrink-0 w-16 h-16 bg-gray-100 rounded-md flex items-center justify-center">
          <span className="text-gray-400 text-xs">图片</span>
        </div>
        
        {/* 商品信息 */}
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-gray-900 truncate">
            {item.name}
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            单价: ¥{item.unit_price}
          </p>
        </div>
        
        {/* 数量控制 */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => handleQuantityChange(quantity - 1)}
            disabled={isLoading || quantity <= 1}
            className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            -
          </button>
          <span className="w-8 text-center text-sm font-medium">{quantity}</span>
          <button
            onClick={() => handleQuantityChange(quantity + 1)}
            disabled={isLoading}
            className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            +
          </button>
        </div>
        
        {/* 小计和删除 */}
        <div className="flex flex-col items-end space-y-2">
          <span className="text-sm font-medium text-gray-900">
            ¥{item.subtotal}
          </span>
          <button
            onClick={() => onRemove(item.product_id)}
            disabled={isLoading}
            className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
          >
            删除
          </button>
        </div>
      </div>
    </div>
  );
};

// 订单摘要组件
const OrderSummary = ({ cart, onCheckout, isLoading }) => {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">订单摘要</h3>
      
      <div className="space-y-3 mb-6">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">商品数量</span>
          <span className="text-gray-900">{cart.total_quantity} 件</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">商品金额</span>
          <span className="text-gray-900">¥{cart.total_price}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">配送费</span>
          <span className="text-gray-900">{cart.shipping_fee > 0 ? `¥${cart.shipping_fee}` : '免费'}</span>
        </div>
        {cart.total_quantity > 0 && cart.total_price < 10 && (
          <div className="text-xs text-amber-600">
            还差 <span className="font-semibold">¥{(10 - cart.total_price).toFixed(2)}</span> 免运费。
            <a href="/shop" className="ml-1 text-indigo-600 hover:underline">去凑单</a>
          </div>
        )}
        <div className="border-t border-gray-200 pt-3">
          <div className="flex justify-between text-base font-medium">
            <span className="text-gray-900">总计</span>
            <span className="text-gray-900">¥{cart.payable_total ?? cart.total_price}</span>
          </div>
        </div>
      </div>
      
      <button
        onClick={onCheckout}
        disabled={isLoading || cart.total_quantity === 0}
        className="w-full bg-indigo-600 text-white py-2 px-4 rounded-md font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? '处理中...' : '去结算'}
      </button>
    </div>
  );
};

export default function Cart() {
  const router = useRouter();
  const { user } = useAuth();
  const { getCart, updateCart, removeFromCart, clearCart } = useCart();
  
  const [cart, setCart] = useState({ items: [], total_quantity: 0, total_price: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');

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
    } catch (err) {
      setError(err.message || '加载购物车失败');
    } finally {
      setIsLoading(false);
    }
  };

  // 更新商品数量
  const handleUpdateQuantity = async (productId, quantity) => {
    setActionLoading(true);
    try {
      await updateCart('update', productId, quantity);
      await loadCart(); // 重新加载购物车
    } catch (err) {
      alert(err.message || '更新失败');
    } finally {
      setActionLoading(false);
    }
  };

  // 删除商品
  const handleRemoveItem = async (productId) => {
    if (!confirm('确定要删除这个商品吗？')) return;
    
    setActionLoading(true);
    try {
      await removeFromCart(productId);
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
    router.push('/checkout');
  };

  // 初始化加载
  useEffect(() => {
    if (user) {
      loadCart();
    }
  }, [user]);

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

      <div className="min-h-screen bg-gray-50 pt-16">
        {/* 主要内容 */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-8 flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">购物车</h1>
              <p className="text-gray-600 mt-1">管理您的购物车商品</p>
            </div>
            
            {cart.items && cart.items.length > 0 && (
              <button
                onClick={handleClearCart}
                disabled={actionLoading}
                className="text-sm text-red-600 hover:text-red-800 disabled:opacity-50"
              >
                清空购物车
              </button>
            )}
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {/* 加载状态 */}
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                  <div className="flex items-center space-x-4">
                    <div className="w-16 h-16 bg-gray-200 rounded-md animate-pulse"></div>
                    <div className="flex-1">
                      <div className="h-4 bg-gray-200 rounded animate-pulse mb-2"></div>
                      <div className="h-3 bg-gray-200 rounded animate-pulse w-1/2"></div>
                    </div>
                    <div className="w-20 h-8 bg-gray-200 rounded animate-pulse"></div>
                    <div className="w-16 h-6 bg-gray-200 rounded animate-pulse"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              {cart.items && cart.items.length > 0 ? (
                <div className="lg:grid lg:grid-cols-3 lg:gap-8">
                  {/* 购物车商品列表 */}
                  <div className="lg:col-span-2">
                    {cart.items.map((item) => (
                      <CartItem
                        key={item.product_id}
                        item={item}
                        onUpdateQuantity={handleUpdateQuantity}
                        onRemove={handleRemoveItem}
                        isLoading={actionLoading}
                      />
                    ))}
                  </div>
                  
                  {/* 订单摘要 */}
                  <div className="lg:col-span-1">
                    <OrderSummary
                      cart={cart}
                      onCheckout={handleCheckout}
                      isLoading={actionLoading}
                    />
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="text-gray-400 text-lg mb-4">购物车是空的</div>
                  <p className="text-gray-500 mb-6">快去商城逛逛，发现喜欢的商品吧！</p>
                  <Link href="/shop" className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white font-medium rounded-md hover:bg-indigo-700">
                    去购物
                  </Link>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </>
  );
}
