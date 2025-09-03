import React, { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
// Link 不再使用，导航由通用组件处理
import { useProducts, useCart, useAuth } from '../hooks/useAuth';
import RetryImage from '../components/RetryImage';
import Nav from '../components/Nav';
import { getProductImage } from '../utils/urls';
import FloatingCart from '../components/FloatingCart';

// 商品卡片组件
const ProductCard = ({ product, onAddToCart, onUpdateQuantity, onStartFly, cartQuantity = 0, isLoading }) => {
  const { user } = useAuth();
  
  const handleAddToCart = (e) => {
    if (!user) {
      alert('请先登录才能添加商品到购物车');
      return;
    }
    // 触发飞入动画（从按钮位置）
    onStartFly && onStartFly(e.currentTarget, product, { type: 'add' });
    onAddToCart(product.id);
  };

  const handleQuantityChange = (newQuantity, e) => {
    if (!user) return;
    // 仅在增加数量时触发飞入动画
    if (e && newQuantity > cartQuantity) {
      onStartFly && onStartFly(e.currentTarget, product, { type: 'increment' });
    }
    onUpdateQuantity(product.id, newQuantity);
  };

  // 是否在购物车中
  const isInCart = cartQuantity > 0;
  // 是否缺货
  const isOutOfStock = product.stock === 0;
  const imageSrc = getProductImage(product);
  const discountZhe = typeof product.discount === 'number' ? product.discount : (product.discount ? parseFloat(product.discount) : 10);
  const hasDiscount = discountZhe && discountZhe > 0 && discountZhe < 10;
  const finalPrice = hasDiscount ? (Math.round(product.price * (discountZhe / 10) * 100) / 100) : product.price;

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden transition-all ${
      isOutOfStock 
        ? 'opacity-60 grayscale hover:shadow-sm cursor-not-allowed' 
        : 'hover:shadow-md'
    }`}>
      <div className="aspect-square w-full overflow-hidden bg-gray-200 relative">
        {/* 折扣角标 */}
        {hasDiscount && (
          <div className="absolute left-2 top-2 z-10">
            <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-600 text-white text-sm font-bold ring-4 ring-white shadow">
              {discountZhe}折
            </span>
          </div>
        )}
        {imageSrc ? (
          <RetryImage
            src={imageSrc}
            alt={product.name}
            className={`h-full w-full object-cover object-center ${
              isOutOfStock ? 'filter grayscale opacity-75' : ''
            }`}
            maxRetries={3}
            onFinalError={() => {
              console.log(`商品图片最终加载失败: ${product.name}`);
            }}
          />
        ) : (
          <div className={`h-full w-full bg-gray-100 flex items-center justify-center ${
            isOutOfStock ? 'opacity-50' : ''
          }`}>
            <span className="text-gray-400 text-sm">暂无图片</span>
          </div>
        )}
        {/* 缺货遮罩 */}
        {isOutOfStock && (
          <div className="absolute inset-0 bg-gray-500 bg-opacity-40 flex items-center justify-center">
            <span className="bg-red-600 text-white px-3 py-1 rounded-full text-sm font-bold">
              缺货
            </span>
          </div>
        )}
      </div>
      
      <div className="p-4">
        <h3 className={`text-sm font-medium mb-1 line-clamp-2 ${
          isOutOfStock ? 'text-gray-500' : 'text-gray-900'
        }`}>
          {product.name}
        </h3>
        
        <p className={`text-xs mb-2 ${
          isOutOfStock ? 'text-gray-400' : 'text-gray-500'
        }`}>
          {product.category}
        </p>
        
        {product.description && (
          <p className={`text-xs mb-3 line-clamp-2 ${
            isOutOfStock ? 'text-gray-400' : 'text-gray-600'
          }`}>
            {product.description}
          </p>
        )}
        
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <div className="flex items-baseline gap-2">
              <span className={`text-lg font-bold ${
                isOutOfStock ? 'text-gray-500' : 'text-gray-900'
              }`}>
                ¥{finalPrice}
              </span>
              {hasDiscount && (
                <span className="text-xs text-gray-400 line-through">¥{product.price}</span>
              )}
            </div>
            <span className={`text-xs ${
              isOutOfStock ? 'text-red-500 font-medium' : 'text-gray-500'
            }`}>
              库存: {product.stock}
            </span>
          </div>
          
          {/* 根据是否在购物车中显示不同的控件 */}
          {!user ? (
            <button
              disabled
              className="px-3 py-1.5 bg-gray-300 text-gray-500 text-sm font-medium rounded-md cursor-not-allowed"
            >
              需登录
            </button>
          ) : isOutOfStock ? (
            <button
              disabled
              className="px-3 py-1.5 bg-red-200 text-red-600 text-sm font-medium rounded-md cursor-not-allowed"
            >
              缺货
            </button>
          ) : isInCart ? (
            // 购物车中商品的数量调整控件
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => handleQuantityChange(cartQuantity - 1, e)}
                disabled={isLoading}
                className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                -
              </button>
              <span className="w-8 text-center text-sm font-medium text-gray-900">
                {cartQuantity}
              </span>
              <button
                onClick={(e) => handleQuantityChange(cartQuantity + 1, e)}
                disabled={isLoading || cartQuantity >= product.stock}
                className="w-8 h-8 flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                +
              </button>
            </div>
          ) : (
            // 未在购物车中的商品显示添加按钮
            <button
              onClick={handleAddToCart}
              disabled={isLoading}
              className="px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? '添加中...' : '加入购物车'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// 分类过滤器组件
const CategoryFilter = ({ categories, selectedCategory, onCategoryChange }) => {
  return (
    <div className="mb-6">
      <h3 className="text-sm font-medium text-gray-900 mb-3">商品分类</h3>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onCategoryChange(null)}
          className={`px-3 py-1.5 text-sm font-medium rounded-full border transition-colors ${
            selectedCategory === null
              ? 'bg-indigo-600 text-white border-indigo-600'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
          }`}
        >
          全部
        </button>
        {categories.map((category) => (
          <button
            key={category.id}
            onClick={() => onCategoryChange(category.name)}
            className={`px-3 py-1.5 text-sm font-medium rounded-full border transition-colors ${
              selectedCategory === category.name
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            {category.name}
          </button>
        ))}
      </div>
    </div>
  );
};

// 搜索栏组件
const SearchBar = ({ searchQuery, onSearchChange, onSearch }) => {
  const handleSubmit = (e) => {
    e.preventDefault();
    onSearch();
  };

  return (
    <form onSubmit={handleSubmit} className="mb-6">
      <div className="flex gap-2">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="搜索商品..."
          className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
        />
        <button
          type="submit"
          className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          搜索
        </button>
      </div>
    </form>
  );
};

export default function Shop() {
  const { user } = useAuth();
  const { getProducts, searchProducts, getCategories } = useProducts();
  const { addToCart, getCart, updateCart } = useCart();
  
  const cartWidgetRef = useRef(null);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [cartLoading, setCartLoading] = useState(false);
  const [error, setError] = useState('');
  const [cart, setCart] = useState({ items: [], total_quantity: 0, total_price: 0 });
  const [cartItemsMap, setCartItemsMap] = useState({}); // 商品ID到数量的映射
  const [prevQty, setPrevQty] = useState(0);

  // 飞入购物车动画（从元素飞到右下角悬浮购物车）
  const flyToCart = (startEl) => {
    if (typeof window === 'undefined') return;
    if (!startEl || !cartWidgetRef.current?.getIconRect) return;
    const startRect = startEl.getBoundingClientRect();
    const endRect = cartWidgetRef.current.getIconRect();
    if (!startRect || !endRect) return;

    const startX = startRect.left + startRect.width / 2;
    const startY = startRect.top + startRect.height / 2;
    const endX = endRect.left + endRect.width / 2;
    const endY = endRect.top + endRect.height / 2;

    const ball = document.createElement('div');
    ball.className = 'cart-fly-ball';
    document.body.appendChild(ball);

    const size = 12;
    ball.style.width = `${size}px`;
    ball.style.height = `${size}px`;

    const duration = 600; // ms
    const cpX = (startX + endX) / 2;
    const cpY = Math.min(startY, endY) - 120; // 控制点，形成弧线
    const startTime = performance.now();

    const animate = (now) => {
      const t = Math.min(1, (now - startTime) / duration);
      const oneMinusT = 1 - t;
      // 二次贝塞尔曲线公式
      const x = oneMinusT * oneMinusT * startX + 2 * oneMinusT * t * cpX + t * t * endX;
      const y = oneMinusT * oneMinusT * startY + 2 * oneMinusT * t * cpY + t * t * endY;
      ball.style.transform = `translate3d(${x - size / 2}px, ${y - size / 2}px, 0)`;
      ball.style.opacity = String(1 - t * 0.2);
      if (t < 1) {
        requestAnimationFrame(animate);
      } else {
        // 到达后触发购物车抖动
        try { cartWidgetRef.current?.shake(); } catch (e) {}
        document.body.removeChild(ball);
      }
    };
    requestAnimationFrame(animate);
  };

  // 加载购物车数据
  const loadCart = async () => {
    if (!user) {
      setCart({ items: [], total_quantity: 0, total_price: 0 });
      setCartItemsMap({});
      return;
    }
    
    try {
      const cartData = await getCart();
      const cartResult = cartData.data;
      setCart(cartResult);
      
      // 创建商品ID到数量的映射
      const itemsMap = {};
      cartResult.items.forEach(item => {
        itemsMap[item.product_id] = item.quantity;
      });
      setCartItemsMap(itemsMap);
    } catch (err) {
      console.error('加载购物车失败:', err);
      setCart({ items: [], total_quantity: 0, total_price: 0 });
      setCartItemsMap({});
    }
  };

  // 商品排序函数 - 按价格升序
  const sortProductsByPrice = (products) => {
    return products.sort((a, b) => {
      // 计算最终价格（考虑折扣）
      const getPriceWithDiscount = (product) => {
        const discountZhe = typeof product.discount === 'number' ? product.discount : (product.discount ? parseFloat(product.discount) : 10);
        const hasDiscount = discountZhe && discountZhe > 0 && discountZhe < 10;
        return hasDiscount ? (Math.round(product.price * (discountZhe / 10) * 100) / 100) : product.price;
      };
      
      const priceA = getPriceWithDiscount(a);
      const priceB = getPriceWithDiscount(b);
      
      return priceA - priceB; // 升序排列
    });
  };

  // 加载商品和分类
  const loadData = async () => {
    setIsLoading(true);
    setError('');
    
    try {
      const [productsData, categoriesData] = await Promise.all([
        getProducts(selectedCategory),
        getCategories()
      ]);
      
      const products = productsData.data.products || [];
      const sortedProducts = sortProductsByPrice([...products]);
      
      setProducts(sortedProducts);
      setCategories(categoriesData.data.categories || []);
    } catch (err) {
      setError(err.message || '加载数据失败');
    } finally {
      setIsLoading(false);
    }
  };

  // 搜索商品
  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      loadData();
      return;
    }

    setIsLoading(true);
    setError('');
    
    try {
      const data = await searchProducts(searchQuery);
      const products = data.data.products || [];
      const sortedProducts = sortProductsByPrice([...products]);
      
      setProducts(sortedProducts);
      setSelectedCategory(null); // 清除分类过滤
    } catch (err) {
      setError(err.message || '搜索失败');
    } finally {
      setIsLoading(false);
    }
  };

  // 分类变化
  const handleCategoryChange = (category) => {
    setSelectedCategory(category);
    setSearchQuery(''); // 清除搜索
  };

  // 添加到购物车
  const handleAddToCart = async (productId) => {
    if (!user) return;
    
    setCartLoading(true);
    try {
      await addToCart(productId, 1);
      // 重新加载购物车数据
      await loadCart();
    } catch (err) {
      alert(err.message || '添加失败');
    } finally {
      setCartLoading(false);
    }
  };

  // 更新商品数量
  const handleUpdateQuantity = async (productId, newQuantity) => {
    if (!user) return;
    
    setCartLoading(true);
    try {
      if (newQuantity <= 0) {
        // 数量为0时从购物车移除
        await updateCart('remove', productId);
      } else {
        // 更新数量
        await updateCart('update', productId, newQuantity);
      }
      // 重新加载购物车数据
      await loadCart();
    } catch (err) {
      alert(err.message || '更新失败');
    } finally {
      setCartLoading(false);
    }
  };

  // 初始化和分类变化时加载数据
  useEffect(() => {
    loadData();
  }, [selectedCategory]);

  // 用户登录状态变化时加载购物车
  useEffect(() => {
    loadCart();
  }, [user]);

  // 购物车数量变化时，角标弹跳（仅在数量增加时）
  useEffect(() => {
    const qty = cart?.total_quantity ?? 0;
    if (qty > prevQty) {
      try { cartWidgetRef.current?.bounceBadge?.(); } catch (e) {}
    }
    setPrevQty(qty);
  }, [cart?.total_quantity]);

  return (
    <>
      <Head>
        <title>[商店名称] - 宿舍智能小超市</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>

      {/* 顶部导航（移动端优化） */}
      <Nav active="shop" />

      <div className="min-h-screen bg-gray-50 pt-16">
        {/* 主要内容 */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">[商店名称]</h1>
            <p className="text-gray-600">为您提供上门配送服务</p>
          </div>

          {/* 搜索栏 */}
          <SearchBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onSearch={handleSearch}
          />

          {/* 分类过滤器 */}
          {categories.length > 0 && (
            <CategoryFilter
              categories={categories}
              selectedCategory={selectedCategory}
              onCategoryChange={handleCategoryChange}
            />
          )}

          {/* 错误提示 */}
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {/* 加载状态 */}
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                  <div className="aspect-square bg-gray-200 animate-pulse"></div>
                  <div className="p-4">
                    <div className="h-4 bg-gray-200 rounded animate-pulse mb-2"></div>
                    <div className="h-3 bg-gray-200 rounded animate-pulse mb-3 w-2/3"></div>
                    <div className="flex justify-between items-center">
                      <div className="h-5 bg-gray-200 rounded animate-pulse w-1/3"></div>
                      <div className="h-8 bg-gray-200 rounded animate-pulse w-20"></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              {/* 商品列表 */}
              {products.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
                  {products.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      onAddToCart={handleAddToCart}
                      onUpdateQuantity={handleUpdateQuantity}
                      onStartFly={(el) => flyToCart(el)}
                      cartQuantity={cartItemsMap[product.id] || 0}
                      isLoading={cartLoading}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="text-gray-400 text-lg mb-2">暂无商品</div>
                  <p className="text-gray-500">
                    {searchQuery ? '没有找到相关商品，请尝试其他关键词' : '该分类下暂无商品'}
                  </p>
                </div>
              )}
            </>
          )}
        </main>

        {/* 右下角悬浮购物车 */}
        <FloatingCart ref={cartWidgetRef} count={cart?.total_quantity ?? 0} />
      </div>
    </>
  );
}
