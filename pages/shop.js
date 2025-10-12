import React, { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
// Link 不再使用，导航由通用组件处理
import { useProducts, useCart, useAuth, useUserAgentStatus } from '../hooks/useAuth';
import { useLocation } from '../hooks/useLocation';
import RetryImage from '../components/RetryImage';
import Nav from '../components/Nav';
import { getProductImage } from '../utils/urls';
import FloatingCart from '../components/FloatingCart';
import SimpleMarkdown from '../components/SimpleMarkdown';
import { getShopName } from '../utils/runtimeConfig';
import PastelBackground from '../components/ModalCard';
import ProductDetailModal from '../components/ProductDetailModal';

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

// 商品卡片组件
const ProductCard = ({ product, onAddToCart, onUpdateQuantity, onStartFly, onOpenSpecModal, onOpenDetailModal, itemsMap = {}, isLoading }) => {
  const { user } = useAuth();
  const [showReservationInfo, setShowReservationInfo] = useState(true);
  
  const handleAddToCart = (e) => {
    if (!user) {
      alert('请先登录才能添加商品到购物车');
      return;
    }
    // 有规格时需先选择
    if (product.has_variants) {
      onOpenSpecModal(product);
      return;
    }
    // 点击加号时隐藏预约信息
    setShowReservationInfo(false);
    // 触发飞入动画（从按钮位置）
    onStartFly && onStartFly(e.currentTarget, product, { type: 'add' });
    onAddToCart(product.id, null);
  };

  const handleQuantityChange = (newQuantity, e, variantId = null) => {
    if (!user) return;
    // 仅在增加数量时触发飞入动画
    const currentQty = variantId ? (itemsMap[`${product.id}@@${variantId}`] || 0) : (itemsMap[`${product.id}`] || 0);
    if (e && newQuantity > currentQty) {
      // 点击加号时隐藏预约信息
      setShowReservationInfo(false);
      onStartFly && onStartFly(e.currentTarget, product, { type: 'increment' });
    } else if (newQuantity < currentQty) {
      // 减少数量时恢复显示预约信息
      setShowReservationInfo(true);
    }
    onUpdateQuantity(product.id, newQuantity, variantId);
  };

  // 规格与数量
  const isVariant = !!product.has_variants;
  const cartQuantity = isVariant
    ? 0 // 有规格的商品不在卡片中显示数量调整
    : (itemsMap[`${product.id}`] || 0);
  // 是否在购物车中
  const isInCart = cartQuantity > 0;
  // 是否下架/缺货
  const isDown = product.is_active === 0 || product.is_active === false;
  const isOutOfStock = isVariant ? ((product.total_variant_stock || 0) === 0) : (product.stock === 0);
  const imageSrc = getProductImage(product);
  const discountZhe = typeof product.discount === 'number' ? product.discount : (product.discount ? parseFloat(product.discount) : 10);
  const hasDiscount = discountZhe && discountZhe > 0 && discountZhe < 10;
  const finalPrice = hasDiscount ? (Math.round(product.price * (discountZhe / 10) * 100) / 100) : product.price;
  const requiresReservation = Boolean(product.reservation_required);
  const reservationCutoff = product.reservation_cutoff;
  const reservationNote = (product.reservation_note || '').trim();

  return (
    <div 
      className={`card-modern group overflow-hidden transform transition-all duration-300 ease-out h-[420px] flex flex-col ${
        (isOutOfStock || isDown)
          ? 'opacity-60 grayscale cursor-not-allowed'
          : 'hover:scale-105 cursor-pointer'
      }`}
      onClick={(e) => {
        // 如果点击的是按钮或其子元素，不打开详情
        if (e.target.closest('button')) return;
        // 打开详情弹窗
        onOpenDetailModal && onOpenDetailModal(product);
      }}
    >
      <div className="aspect-square w-full overflow-hidden relative bg-gradient-to-br from-gray-50 to-gray-100">
        {/* 折扣角标 */}
        {hasDiscount && (
          <div className="absolute left-3 top-3 z-20">
            <div className="relative">
              {/* 模糊背景层 */}
              <div className="absolute inset-0 bg-gradient-to-br from-red-500 to-pink-600 rounded-xl blur opacity-30"></div>
              {/* 主要角标 */}
              <div className="relative z-10 w-12 h-12 bg-gradient-to-br from-red-500 to-pink-600 rounded-xl flex items-center justify-center shadow-xl transform rotate-12 group-hover:rotate-6 transition-transform duration-300">
                <div className="text-center relative z-10">
                  <div className="text-white text-xs font-bold drop-shadow-sm">{discountZhe}折</div>
                  <div className="text-white text-xs font-medium drop-shadow-sm">特惠</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {Boolean(product.is_hot) && (
          <div className="absolute right-3 top-3 z-20">
            <span className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold text-white bg-gradient-to-r from-orange-500 to-red-500 rounded-full shadow-lg">
              <i className="fas fa-fire"></i>
              热销中
            </span>
          </div>
        )}

        {imageSrc ? (
          <RetryImage
            src={imageSrc}
            alt={product.name}
            className={`h-full w-full object-cover object-center group-hover:scale-110 transition-transform duration-500 ${
              (isOutOfStock || isDown) ? 'filter grayscale opacity-75' : ''
            }`}
            maxRetries={3}
            onFinalError={() => {
              console.log(`商品图片最终加载失败: ${product.name}`);
            }}
          />
        ) : (
          <div className={`h-full w-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center ${
            (isOutOfStock || isDown) ? 'opacity-50' : ''
          }`}>
            <div className="text-center">
              <i className="fas fa-image text-gray-400 text-2xl mb-2"></i>
              <span className="text-gray-400 text-sm">暂无图片</span>
            </div>
          </div>
        )}
        
        {/* 缺货/下架遮罩 */}
        {(isOutOfStock || isDown) && (
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center">
            {isDown ? (
              <div className="bg-gray-800/90 text-white px-4 py-2 rounded-xl text-sm font-medium backdrop-blur-sm border border-white/20">
                <i className="fas fa-pause mr-2"></i>暂时下架
              </div>
            ) : (
              <div className="bg-red-600/90 text-white px-4 py-2 rounded-xl text-sm font-medium backdrop-blur-sm border border-white/20">
                <i className="fas fa-exclamation-triangle mr-2"></i>缺货
              </div>
            )}
          </div>
        )}
      </div>
      
      <div className="p-4 bg-gradient-to-t from-gray-50/50 to-transparent flex-1 flex flex-col">
        {/* 商品信息区域 */}
        <div className="flex-1 flex flex-col mb-4">
          {/* 标题、分类和价格行 */}
          <div className="flex items-start justify-between gap-3 mb-2">
            {/* 左侧：标题和分类 */}
            <div className="flex-1 min-w-0">
              {/* 商品标题 */}
              <h3 className={`text-sm font-semibold leading-tight line-clamp-2 mb-2 ${
                (isOutOfStock || isDown) ? 'text-gray-500' : 'text-gray-900'
              }`}>
                {product.name}
              </h3>
              
              {/* 分类标签 */}
              <div className="flex items-center gap-2">
                <span className={`tag-modern text-xs ${
                  (isOutOfStock || isDown) ? 'text-gray-400' : 'text-gray-600'
                }`}>
                  <i className="fas fa-tag mr-1"></i>{product.category}
                </span>
              </div>
            </div>
            
            {/* 右侧：价格信息 */}
            <div className="flex flex-col items-end text-right shrink-0">
              {/* 当前价格 */}
              <div className="mb-1 flex items-center gap-1.5">
                {requiresReservation && (
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-500 text-white text-[10px] font-bold shadow-sm flex-shrink-0">
                    预
                  </span>
                )}
                <span className={`text-lg font-bold whitespace-nowrap ${
                  (isOutOfStock || isDown) ? 'text-gray-500' : 'text-gray-900'
                }`}>
                  ¥{finalPrice}
                </span>
              </div>
              
              {/* 原价 */}
              {hasDiscount && (
                <span className="text-xs text-gray-400 line-through whitespace-nowrap">¥{product.price}</span>
              )}
            </div>
          </div>
          
          {/* 商品描述 - 独占一行，不被价格挤压 */}
          {product.description && (
            <p className={`text-xs line-clamp-2 leading-relaxed mb-2 break-words overflow-hidden ${
              (isOutOfStock || isDown) ? 'text-gray-400' : 'text-gray-600'
            }`}>
              {product.description}
            </p>
          )}
          
          {/* 库存信息 */}
          {!isDown && (
            <div className={`text-xs flex items-center gap-1 ${
              isOutOfStock ? 'text-red-500 font-medium' : 'text-gray-500'
            }`}>
              <i className="fas fa-box-open"></i>
              <span>
                {isVariant ? (product.total_variant_stock !== undefined ? `库存 ${product.total_variant_stock}` : '多规格') : `库存 ${product.stock}`}
              </span>
            </div>
          )}
        </div>
        
        {/* 操作按钮区域 */}
        <div className="flex flex-col gap-2">
          {/* 预约信息 */}
          {requiresReservation && reservationNote && showReservationInfo && (
            <div className="text-[11px] text-blue-500 leading-snug break-words">
              {reservationNote}
            </div>
          )}
          
          <div className="flex items-center gap-2">
          {/* 预约时间信息 */}
          {requiresReservation && showReservationInfo && (
            <div className="flex-1 text-[11px] text-blue-600 flex items-center gap-1">
              <i className="fas fa-calendar-check"></i>
              <span className="truncate">{formatReservationCutoff(reservationCutoff)}</span>
            </div>
          )}
          
          {!user ? (
            <button
              disabled
              className="flex-1 btn-secondary opacity-50 cursor-not-allowed flex items-center justify-center gap-2"
            >
              <i className="fas fa-sign-in-alt"></i>
              <span>需登录</span>
            </button>
          ) : (isOutOfStock || isDown) ? (
            <button
              disabled
              className={`flex-1 cursor-not-allowed flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-medium ${
                isDown 
                  ? 'bg-gray-100 text-gray-600 border border-gray-200' 
                  : 'bg-red-100 text-red-600 border border-red-200'
              }`}
            >
              <i className={isDown ? 'fas fa-pause' : 'fas fa-exclamation-triangle'}></i>
              <span>{isDown ? '暂时下架' : '缺货'}</span>
            </button>
          ) : isVariant ? (
            <button
              onClick={() => onOpenSpecModal(product)}
              disabled={isLoading}
              className="flex-1 btn-glass hover:bg-blue-50 text-blue-600 border-blue-200 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <i className="fas fa-list-ul"></i>
              {/* 如果有规格且是预约商品，在手机端只显示图标 */}
              <span className={requiresReservation ? "hidden sm:inline" : ""}>选规格</span>
            </button>
          ) : isInCart ? (
            // 购物车中商品的数量调整控件
            <div className="flex items-center justify-center sm:justify-end gap-2 flex-1">
              <div className="flex items-center gap-3 bg-gray-50 rounded-xl p-1">
                <button
                  onClick={(e) => handleQuantityChange(cartQuantity - 1, e)}
                  disabled={isLoading}
                  className="w-8 h-8 flex items-center justify-center bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-full disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                  aria-label="减少"
                >
                  <i className="fas fa-minus text-xs"></i>
                </button>
                <span className="min-w-6 text-center text-sm font-semibold text-gray-900">
                  {cartQuantity}
                </span>
                <button
                  onClick={(e) => handleQuantityChange(cartQuantity + 1, e)}
                  disabled={
                    isLoading || cartQuantity >= product.stock
                  }
                  className={`w-8 h-8 flex items-center justify-center ${requiresReservation ? 'bg-gradient-to-br from-cyan-400 to-blue-500 hover:from-cyan-500 hover:to-blue-600' : 'bg-gradient-to-br from-orange-500 to-pink-600 hover:from-pink-600 hover:to-purple-500'} text-white rounded-full disabled:opacity-50 disabled:cursor-not-allowed shadow-sm`}
                  aria-label="增加"
                >
                  <i className="fas fa-plus text-xs"></i>
                </button>
              </div>
            </div>
          ) : (
            // 未在购物车中的商品显示添加按钮
            <button
              onClick={handleAddToCart}
              disabled={isLoading}
              aria-label="加入购物车"
              className={`w-10 h-10 rounded-full flex-shrink-0 ml-auto ${requiresReservation ? 'bg-gradient-to-br from-cyan-400 to-blue-500 hover:from-cyan-500 hover:to-blue-600' : 'bg-gradient-to-br from-orange-500 to-pink-600 hover:from-pink-600 hover:to-purple-500'} text-white shadow-lg hover:shadow-xl transform transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center`}
            >
              <i className="fas fa-plus"></i>
            </button>
          )}
          </div>
        </div>
      </div>
    </div>
  );
};

// 分类过滤器组件
const CategoryFilter = ({ categories, selectedCategory, onCategoryChange, hasHotProducts = false }) => {
  const isActive = (value) => selectedCategory === value;

  return (
    <div className="mb-8 opacity-0 animate-apple-slide-up animate-delay-200">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center">
          <i className="fas fa-layer-group text-white text-sm"></i>
        </div>
        <h3 className="text-lg font-semibold text-gray-900">商品分类</h3>
      </div>
      <div className="flex flex-wrap gap-3">
        {hasHotProducts && (
          <button
            onClick={() => onCategoryChange('hot')}
            className={`px-4 py-2 text-sm font-medium rounded-xl border-2 transition-all duration-300 transform hover:scale-105 ${
              isActive('hot')
                ? 'bg-gradient-to-r from-rose-500 to-orange-500 text-white border-transparent shadow-lg'
                : 'bg-white/90 text-gray-700 border-gray-200 hover:bg-white hover:border-gray-300 shadow-sm'
            }`}
          >
            <div className="flex items-center gap-2">
              <i className="fas fa-fire"></i>
              <span>热销</span>
            </div>
          </button>
        )}
        <button
          onClick={() => onCategoryChange('all')}
          className={`px-4 py-2 text-sm font-medium rounded-xl border-2 transition-all duration-300 transform hover:scale-105 ${
            isActive('all')
              ? 'bg-gradient-to-r from-orange-500 to-pink-600 text-white border-transparent shadow-lg'
              : 'bg-white/90 text-gray-700 border-gray-200 hover:bg-white hover:border-gray-300 shadow-sm'
          }`}
        >
          <div className="flex items-center gap-2">
            <i className="fas fa-th-large"></i>
            <span>全部</span>
          </div>
        </button>
        {categories.map((category, index) => {
          const value = `category:${category.name}`;
          return (
            <button
              key={category.id}
              onClick={() => onCategoryChange(value)}
              className={`px-4 py-2 text-sm font-medium rounded-xl border-2 transition-all duration-300 transform hover:scale-105 opacity-0 animate-apple-fade-in ${
                isActive(value)
                  ? 'bg-gradient-to-r from-emerald-500 to-cyan-600 text-white border-transparent shadow-lg'
                  : 'bg-white/90 text-gray-700 border-gray-200 hover:bg-white hover:border-gray-300 shadow-sm'
              }`}
              style={{ animationDelay: `${index * 0.05}s` }}
            >
              <div className="flex items-center gap-2">
                <i className="fas fa-tag"></i>
                <span>{category.name}</span>
              </div>
            </button>
          );
        })}
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
    <div className="mb-8 opacity-0 animate-apple-fade-in animate-delay-100">
      <form onSubmit={handleSubmit} className="relative max-w-2xl mx-auto">
        <div className="relative group">
           {/* 背景光晕 */}
           <div className="absolute -inset-1 bg-gradient-to-r from-orange-500 to-pink-600 rounded-2xl blur opacity-30 group-hover:opacity-50 transition-opacity duration-300"></div>
          
          {/* 搜索框主体 */}
          <div className="relative flex items-center bg-white/95 backdrop-blur-xl border border-gray-200/60 rounded-2xl shadow-lg hover:shadow-xl transition-shadow">
            {/* 搜索图标 */}
            <div className="absolute left-4 text-gray-400 group-focus-within:text-orange-500 transition-colors">
              <i className="fas fa-search"></i>
            </div>
            
            {/* 输入框 */}
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="搜索您喜欢的商品..."
              className="flex-1 pl-12 pr-4 py-4 bg-transparent text-gray-900 placeholder-gray-400 outline-none text-lg"
            />
            
            {/* 搜索按钮 */}
             <button
               type="submit"
               className="absolute right-2 top-1/2 transform -translate-y-1/2 px-6 py-2 bg-gradient-to-r from-orange-500 to-pink-600 text-white font-medium rounded-xl hover:from-orange-600 hover:to-pink-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 transition-all duration-300 transform hover:scale-105 shadow-lg"
             >
              <div className="flex items-center gap-2">
                <i className="fas fa-search"></i>
                <span className="hidden sm:inline">搜索</span>
              </div>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default function Shop() {
  const { user } = useAuth();
  const { getProducts, searchProducts, getCategories, getShopStatus } = useProducts();
  const { addToCart, getCart, updateCart } = useCart();
  const { location, openLocationModal, revision: locationRevision, isLoading: locationLoading, forceSelection } = useLocation();
  const { getStatus: getUserAgentStatus } = useUserAgentStatus();
  const navActive = user && (user.type === 'admin' || user.type === 'agent') ? 'staff-shop' : 'shop';
  const shopName = getShopName();
  
  const cartWidgetRef = useRef(null);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('hot');
  const [initialCategorySet, setInitialCategorySet] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [cartLoading, setCartLoading] = useState(false);
  const [error, setError] = useState('');
  const [cart, setCart] = useState({ items: [], total_quantity: 0, total_price: 0 });
  const [cartItemsMap, setCartItemsMap] = useState({}); // 商品ID到数量的映射
  const [prevQty, setPrevQty] = useState(0);
  const [shopOpen, setShopOpen] = useState(true);
  const [shopNote, setShopNote] = useState('');
  const [isAgent, setIsAgent] = useState(false); // 是否为代理区域
  const [hasGlobalHotProducts, setHasGlobalHotProducts] = useState(false); // 全局是否有热销商品
  
  const displayLocation = location
    ? `${location.dormitory || ''}${location.building ? '·' + location.building : ''}`.trim() || '已选择地址'
    : '请选择配送地址';

  // 规格选择弹窗状态
  const [showSpecModal, setShowSpecModal] = useState(false);
  const [specModalProduct, setSpecModalProduct] = useState(null);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const modalRequiresReservation = Boolean(specModalProduct?.reservation_required);
  const modalReservationCutoff = specModalProduct?.reservation_cutoff;
  const modalReservationNote = (specModalProduct?.reservation_note || '').trim();

  // 商品详情弹窗状态
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailModalProduct, setDetailModalProduct] = useState(null);

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
      
      // 创建商品ID/规格 到 数量 的映射
      const itemsMap = {};
      cartResult.items.forEach(item => {
        const key = item.variant_id ? `${item.product_id}@@${item.variant_id}` : `${item.product_id}`;
        itemsMap[key] = item.quantity;
      });
      setCartItemsMap(itemsMap);
    } catch (err) {
      console.error('加载购物车失败:', err);
      setCart({ items: [], total_quantity: 0, total_price: 0 });
      setCartItemsMap({});
    }
  };

  // 商品排序函数 - 可购(上架且有货)优先按价格升序；“下架”或“无货”统一放到最后并按价格升序
  const sortProductsByPrice = (products) => {
    const available = [];
    const deferred = [];

    const isDown = (p) => (p.is_active === 0 || p.is_active === false);
    const isOut = (p) => {
      const isVariant = !!p.has_variants;
      if (isVariant) {
        const tvs = (p.total_variant_stock !== undefined && p.total_variant_stock !== null) ? p.total_variant_stock : null;
        if (Array.isArray(p.variants) && p.variants.length > 0) {
          return p.variants.every(v => (v.stock || 0) <= 0);
        }
        return tvs !== null ? (tvs === 0) : false;
      }
      return (p.stock === 0);
    };

    const getPriceWithDiscount = (product) => {
      const discountZhe = typeof product.discount === 'number' ? product.discount : (product.discount ? parseFloat(product.discount) : 10);
      const hasDiscount = discountZhe && discountZhe > 0 && discountZhe < 10;
      return hasDiscount ? (Math.round(product.price * (discountZhe / 10) * 100) / 100) : product.price;
    };

    products.forEach(p => {
      if (isDown(p) || isOut(p)) {
        deferred.push(p);
      } else {
        available.push(p);
      }
    });

    const sortByPriority = (arr) => {
      const hotItems = [];
      const normalItems = [];
      arr.forEach(item => (Boolean(item.is_hot) ? hotItems : normalItems).push(item));
      const byPrice = (a, b) => getPriceWithDiscount(a) - getPriceWithDiscount(b);
      hotItems.sort(byPrice);
      normalItems.sort(byPrice);
      return [...hotItems, ...normalItems];
    };

    return [...sortByPriority(available), ...sortByPriority(deferred)];
  };

  // 加载商品和分类
  const loadData = async () => {
    if (user && user.type === 'user' && (!location || !location.address_id || !location.building_id)) {
      setProducts([]);
      setCategories([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      // 首先检查全局是否有热销商品（用于控制热销分类按钮的显示）
      const allProductsData = await getProducts({ hotOnly: false });
      const allProducts = allProductsData.data.products || [];
      const hasHotProducts = allProducts.some(p => Boolean(p.is_hot));
      setHasGlobalHotProducts(hasHotProducts);

      // 首次加载时，如果选择了热销但没有热销商品，切换到全部
      if (!initialCategorySet && selectedCategory === 'hot') {
        if (!hasHotProducts) {
          setSelectedCategory('all');
          setInitialCategorySet(true);
          return; // 返回，让useEffect重新触发loadData
        }
        setInitialCategorySet(true);
      }

      const productFilters = {
        category: selectedCategory && selectedCategory.startsWith('category:')
          ? selectedCategory.slice('category:'.length)
          : null,
        hotOnly: selectedCategory === 'hot'
      };

      const [productsData, categoriesData] = await Promise.all([
        getProducts(productFilters),
        getCategories()
      ]);
      
      const products = productsData.data.products || [];
      const sortedProducts = sortProductsByPrice([...products]);
      // 分类按拼音/英文排序：基于首个有效字母（忽略数字与符号）决定分桶。
      // 规则：按 a..z 桶整体排序；同桶时，英文字母优先于中文拼音；仅有数字或无字母中文的放最后。
      const cats = categoriesData.data.categories || [];
      const letters = Array.from({ length: 26 }, (_, i) => String.fromCharCode(97 + i));
      const firstSigChar = (s) => {
        const str = String(s || '');
        for (let i = 0; i < str.length; i++) {
          const ch = str[i];
          if (/[A-Za-z\u4e00-\u9fff]/.test(ch)) return ch;
        }
        return '';
      };
      const typeRank = (s) => {
        const ch = firstSigChar(s);
        if (!ch) return 2; // others/digits-only
        return /[A-Za-z]/.test(ch) ? 0 : 1; // 0: english, 1: chinese
      };
      const bucket = (s, collator) => {
        const name = String(s || '');
        // if no letter/chinese at all -> last bucket 26
        if (!/[A-Za-z\u4e00-\u9fff]/.test(name)) return 26;
        // Find bucket i where name in [letters[i], letters[i+1]) under collator
        let b = 25;
        for (let i = 0; i < 26; i++) {
          const cur = letters[i];
          const next = i < 25 ? letters[i + 1] : null;
          if (collator.compare(name, cur) < 0) { b = 0; break; }
          if (!next || (collator.compare(name, cur) >= 0 && collator.compare(name, next) < 0)) { b = i; break; }
        }
        return b;
      };
      try {
        const collator = new Intl.Collator(
          ['zh-Hans-u-co-pinyin', 'zh-Hans', 'zh', 'en', 'en-US'],
          { sensitivity: 'base', numeric: true }
        );
        cats.sort((a, b) => {
          const aName = String(a.name || '');
          const bName = String(b.name || '');
          const ab = bucket(aName, collator);
          const bb = bucket(bName, collator);
          if (ab !== bb) return ab - bb; // a..z 分桶优先
          const ar = typeRank(aName);
          const br = typeRank(bName);
          if (ar !== br) return ar - br; // 同字母桶时：英文优先于中文
          return collator.compare(aName, bName);
        });
      } catch (e) {
        cats.sort((a, b) => {
          const aName = String(a.name || '');
          const bName = String(b.name || '');
          // 简化回退：英文桶按首字母，其它放最后
          const aCh = firstSigChar(aName).toLowerCase();
          const bCh = firstSigChar(bName).toLowerCase();
          const aIsEn = /^[a-z]$/.test(aCh);
          const bIsEn = /^[a-z]$/.test(bCh);
          const ab = aIsEn ? (aCh.charCodeAt(0) - 97) : 26;
          const bb = bIsEn ? (bCh.charCodeAt(0) - 97) : 26;
          if (ab !== bb) return ab - bb;
          const ar = aIsEn ? 0 : 1;
          const br = bIsEn ? 0 : 1;
          if (ar !== br) return ar - br;
          return aName.localeCompare(bName, 'en', { sensitivity: 'base', numeric: true });
        });
      }
      setProducts(sortedProducts);
      setCategories(cats);
    } catch (err) {
      setError(err.message || '加载数据失败');
    } finally {
      setIsLoading(false);
    }
  };

  // 搜索商品
  const handleSearch = async () => {
    if (user && user.type === 'user' && (!location || !location.address_id || !location.building_id)) {
      setError('请先选择配送地址');
      return;
    }

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
      setSelectedCategory('all'); // 清除分类过滤
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

  // 打开规格选择弹窗
  const openSpecModal = (product) => {
    setSpecModalProduct(product);
    setSelectedVariant(null);
    setShowSpecModal(true);
  };

  // 关闭规格选择弹窗
  const closeSpecModal = () => {
    setShowSpecModal(false);
    setSpecModalProduct(null);
    setSelectedVariant(null);
  };

  // 打开商品详情弹窗
  const openDetailModal = (product) => {
    setDetailModalProduct(product);
    setShowDetailModal(true);
  };

  // 关闭商品详情弹窗
  const closeDetailModal = () => {
    setShowDetailModal(false);
    setDetailModalProduct(null);
  };

  // 添加到购物车（乐观更新）
  const handleAddToCart = async (productId, variantId = null) => {
    if (!user) return;
    
    // 保存当前状态用于回滚
    const previousCart = { ...cart };
    const previousItemsMap = { ...cartItemsMap };
    
    // 立即更新UI
    const key = variantId ? `${productId}@@${variantId}` : `${productId}`;
    const currentQty = cartItemsMap[key] || 0;
    const newQty = currentQty + 1;
    
    setCartItemsMap(prev => ({
      ...prev,
      [key]: newQty
    }));
    
    setCart(prev => ({
      ...prev,
      total_quantity: (prev.total_quantity || 0) + 1
    }));
    
    // 后台调用API（静默执行，不重新加载）
    try {
      await addToCart(productId, 1, variantId);
      // 成功：不做任何事，UI已经更新
    } catch (err) {
      // 失败时回滚
      setCart(previousCart);
      setCartItemsMap(previousItemsMap);
      alert(err.message || '添加失败，请重试');
    }
  };

  // 更新商品数量（乐观更新）
  const handleUpdateQuantity = async (productId, newQuantity, variantId = null) => {
    if (!user) return;
    
    // 保存当前状态用于回滚
    const previousCart = { ...cart };
    const previousItemsMap = { ...cartItemsMap };
    
    // 立即更新UI
    const key = variantId ? `${productId}@@${variantId}` : `${productId}`;
    const currentQty = cartItemsMap[key] || 0;
    const qtyDiff = newQuantity - currentQty;
    
    if (newQuantity <= 0) {
      // 从映射中移除
      const newMap = { ...cartItemsMap };
      delete newMap[key];
      setCartItemsMap(newMap);
    } else {
      setCartItemsMap(prev => ({
        ...prev,
        [key]: newQuantity
      }));
    }
    
    setCart(prev => ({
      ...prev,
      total_quantity: Math.max(0, (prev.total_quantity || 0) + qtyDiff)
    }));
    
    // 后台调用API（静默执行，不重新加载）
    try {
      if (newQuantity <= 0) {
        // 数量为0时从购物车移除
        await updateCart('remove', productId, null, variantId);
      } else {
        // 更新数量
        await updateCart('update', productId, newQuantity, variantId);
      }
      // 成功：不做任何事，UI已经更新
    } catch (err) {
      // 失败时回滚
      setCart(previousCart);
      setCartItemsMap(previousItemsMap);
      alert(err.message || '更新失败，请重试');
    }
  };

  // 预加载支付成功动画,避免结算时卡顿
  useEffect(() => {
    if (typeof window !== 'undefined' && window.customElements) {
      const preloadAnimation = () => {
        try {
          // 创建一个隐藏的 dotlottie-wc 元素来预加载动画
          const tempElement = document.createElement('dotlottie-wc');
          tempElement.setAttribute('src', 'https://lottie.host/f3c97f35-f5a9-4cf8-9afa-d6084a659237/2S8UtFVgcc.lottie');
          tempElement.style.cssText = 'position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none;';
          document.body.appendChild(tempElement);
          
          // 10秒后移除预加载元素
          setTimeout(() => {
            if (tempElement && tempElement.parentNode) {
              tempElement.parentNode.removeChild(tempElement);
            }
          }, 10000);
        } catch (e) {
          console.warn('预加载支付成功动画失败:', e);
        }
      };
      
      // 等待 Web Component 注册完成后预加载
      if (window.customElements.get('dotlottie-wc')) {
        preloadAnimation();
      } else {
        window.customElements.whenDefined('dotlottie-wc').then(preloadAnimation).catch(() => {});
      }
    }
  }, []);

  // 初始化和分类变化时加载数据
  useEffect(() => {
    loadData();
  }, [
    selectedCategory,
    locationRevision,
    user,
    forceSelection,
    location?.address_id,
    location?.building_id,
    initialCategorySet,
  ]);

  // 用户登录状态变化时加载购物车
  useEffect(() => {
    loadCart();
  }, [user, locationRevision]);

  // 加载店铺/代理状态（打烊提示）
  useEffect(() => {
    (async () => {
      try {
        const addressId = location?.address_id;
        const buildingId = location?.building_id;
        const res = await getUserAgentStatus(addressId, buildingId);
        
        setShopOpen(!!res.data?.is_open);
        setIsAgent(!!res.data?.is_agent);
        
        if (res.data?.is_open) {
          setShopNote('');
        } else {
          const defaultNote = res.data?.is_agent 
            ? '店铺已暂停营业，暂不支持结算，仅可加入购物车' 
            : '店铺已暂停营业，暂不支持结算，仅可加入购物车';
          setShopNote(res.data?.note || defaultNote);
        }
      } catch (e) {
        // 出错时默认为营业状态
        setShopOpen(true);
        setShopNote('');
        setIsAgent(false);
      }
    })();
  }, [location]);

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
        <title>{shopName} - 智能小超市</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>

      {/* 顶部导航（移动端优化） */}
      <Nav active={navActive} />

      <PastelBackground className="pt-16">
        {/* 主要内容 */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {!shopOpen && (
            <div className="mb-6 card-glass p-4 border border-orange-300/50 shadow-sm opacity-0 animate-apple-fade-in">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <i className="fas fa-exclamation-triangle text-orange-600"></i>
                </div>
                <div className="flex-1">
                  <p className="font-medium mb-1 text-orange-900">{isAgent ? '店铺提醒' : '店铺提醒'}</p>
                  <SimpleMarkdown className="text-sm text-orange-800">
                    {shopNote || '当前打烊，暂不支持结算，仅可加入购物车'}
                  </SimpleMarkdown>
                </div>
              </div>
            </div>
          )}
          
          {/* 页面标题区域 */}
          <div className="mb-12 text-center opacity-0 animate-apple-fade-in">
            <div className="flex justify-center mb-6">
              <div className="relative">
                <div className="absolute -inset-4 bg-gradient-to-r from-orange-500 to-pink-600 rounded-3xl blur-2xl opacity-30"></div>
                <div className="relative w-20 h-20 bg-gradient-to-br from-orange-500 via-pink-600 to-purple-500 rounded-3xl flex items-center justify-center shadow-2xl">
                  <i className="fas fa-store text-white text-2xl"></i>
                </div>
              </div>
            </div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 via-gray-800 to-gray-700 bg-clip-text text-transparent mb-3">
              {shopName}
            </h1>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              精选优质零食，为您提供贴心配送服务，让美味触手可及
            </p>
            
              {/* 统计信息 */}
            <div className="flex justify-center items-center gap-8 mt-8 text-sm text-gray-700">
              <div className="flex items-center gap-2">
                <i className="fas fa-truck text-green-500"></i>
                <span>满10免费配送</span>
              </div>
              <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
              <div className="flex items-center gap-2">
                <i className="fas fa-clock text-blue-500"></i>
                <span>最快3分钟送达</span>
              </div>
              <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
              <div className="flex items-center gap-2">
                <i className="fas fa-star text-yellow-500"></i>
                <span>商品优质保证</span>
              </div>
            </div>

            {user?.type === 'user' && (
              <div className="mt-6 flex justify-center">
                <button
                  onClick={openLocationModal}
                  className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-white/90 text-gray-700 border border-gray-200/60 shadow-md hover:shadow-lg transition-all duration-300 hover:bg-white"
                >
                  <span className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-100 text-emerald-600">
                    <i className="fas fa-location-dot"></i>
                  </span>
                  <div className="text-left">
                    <div className="text-xs text-gray-500">当前配送地址</div>
                    <div className="text-sm font-semibold text-gray-900 mt-0.5">{displayLocation}</div>
                  </div>
                  <span className="text-xs text-emerald-600 font-medium ml-2">更改</span>
                </button>
              </div>
            )}

            {user?.type === 'user' && forceSelection && (
              <div className="mt-3 text-sm text-orange-600 flex justify-center">
                为了展示可售商品，请先选择您的配送地址。
              </div>
            )}
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
              hasHotProducts={hasGlobalHotProducts}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="card-modern overflow-hidden animate-pulse">
                  <div className="aspect-square bg-gradient-to-br from-gray-200 to-gray-300"></div>
                  <div className="p-4 bg-gradient-to-t from-gray-50/50 to-transparent">
                    <div className="space-y-3">
                      <div className="h-4 bg-gray-200 rounded-lg w-3/4"></div>
                      <div className="h-3 bg-gray-200 rounded-lg w-1/2"></div>
                      <div className="h-3 bg-gray-200 rounded-lg w-full"></div>
                      <div className="flex justify-between items-center mt-4">
                        <div className="h-6 bg-gray-200 rounded-lg w-1/3"></div>
                        <div className="h-10 bg-gray-200 rounded-xl w-24"></div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              {/* 商品列表 */}
              {products.length > 0 ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {products.map((product, index) => (
                      <div 
                        key={product.id}
                        className="opacity-0 animate-apple-fade-in"
                        style={{ animationDelay: `${index * 0.05}s` }}
                      >
                        <ProductCard
                          product={product}
                          onAddToCart={(pid, variantId=null) => handleAddToCart(pid, variantId)}
                          onUpdateQuantity={(pid, qty, variantId=null) => handleUpdateQuantity(pid, qty, variantId)}
                          onStartFly={(el) => flyToCart(el)}
                          onOpenSpecModal={openSpecModal}
                          onOpenDetailModal={openDetailModal}
                          itemsMap={cartItemsMap}
                          isLoading={cartLoading}
                        />
                      </div>
                    ))}
                  </div>
                  
                  {/* 底部提示线 */}
                  <div className="flex items-center justify-center gap-4 mt-12 mb-20">
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-400 to-gray-400"></div>
                    <span className="text-sm text-gray-500 font-medium">到底了</span>
                    <div className="flex-1 h-px bg-gradient-to-l from-transparent via-gray-400 to-gray-400"></div>
                  </div>
                </>
              ) : (
                <div className="text-center py-20 opacity-0 animate-apple-fade-in">
                  <div className="max-w-md mx-auto">
                    <div className="w-24 h-24 bg-gradient-to-br from-gray-100 to-gray-200 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-sm">
                      <i className="fas fa-shopping-basket text-gray-400 text-3xl"></i>
                    </div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">
                      {searchQuery ? '未找到相关商品' : '暂无商品'}
                    </h3>
                    <p className="text-gray-600 mb-6">
                      {searchQuery 
                        ? '尝试调整搜索关键词，或浏览其他分类商品' 
                        : '该分类下暂时没有商品，请查看其他分类'
                      }
                    </p>
                    {searchQuery && (
                      <button
                        onClick={() => {setSearchQuery(''); loadData();}}
                        className="btn-secondary"
                      >
                        <i className="fas fa-undo mr-2"></i>
                        清除搜索条件
                      </button>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </main>

        {/* 右下角悬浮购物车 */}
        <FloatingCart ref={cartWidgetRef} count={cart?.total_quantity ?? 0} />
      </PastelBackground>

      {/* 规格选择弹窗 */}
      {showSpecModal && specModalProduct && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm opacity-0 animate-apple-fade-in"
          onClick={(e) => {
            // 点击背景关闭弹窗
            if (e.target === e.currentTarget) {
              closeSpecModal();
            }
          }}
        >
          <div className="card-glass max-w-md w-full mx-4 p-6 shadow-2xl border border-gray-200/50 opacity-0 animate-apple-scale-in">
            {/* 弹窗头部 */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h4 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <i className="fas fa-list-ul text-blue-500"></i>
                  选择规格
                </h4>
                <p className="text-sm text-gray-600 mt-1">{specModalProduct.name}</p>
                {modalRequiresReservation && (
                  <div className="mt-2 text-xs text-blue-600 flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-500 text-white text-[10px] font-bold shadow-sm">预</span>
                    <span>{formatReservationCutoff(modalReservationCutoff)}</span>
                  </div>
                )}
                {modalRequiresReservation && modalReservationNote && (
                  <div className="text-[11px] text-blue-500 mt-1 leading-snug break-words">{modalReservationNote}</div>
                )}
              </div>
              <button 
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-colors" 
                onClick={closeSpecModal}
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            {/* 规格选项 */}
            <div className="space-y-3 max-h-60 overflow-y-auto mb-6">
              {(specModalProduct.variants || [])
                .sort((a, b) => (b.stock || 0) - (a.stock || 0)) // 按库存倒序排列，库存高的在前
                .map((variant, index) => (
                <label 
                  key={variant.id} 
                  className={`block transform transition-all duration-200 opacity-0 animate-apple-slide-up ${
                    variant.stock === 0 
                      ? 'cursor-not-allowed' 
                      : 'cursor-pointer hover:scale-105'
                  }`}
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  <div className={`p-4 rounded-xl border-2 transition-all duration-200 ${
                    variant.stock === 0
                      ? 'border-gray-200 bg-gray-50'
                      : selectedVariant === variant.id 
                      ? 'border-blue-500 bg-blue-50 shadow-md' 
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          variant.stock === 0
                            ? 'border-gray-300 bg-gray-100'
                            : selectedVariant === variant.id 
                            ? 'border-blue-500 bg-blue-500' 
                            : 'border-gray-300'
                        }`}>
                          {selectedVariant === variant.id && variant.stock > 0 && (
                            <i className="fas fa-check text-white text-xs"></i>
                          )}
                          {variant.stock === 0 && (
                            <i className="fas fa-times text-gray-400 text-xs"></i>
                          )}
                        </div>
                        <div>
                          <span className={`text-sm font-medium ${
                            variant.stock === 0 ? 'text-gray-500' : 'text-gray-900'
                          }`}>{variant.name}</span>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`text-xs flex items-center gap-1 ${
                              variant.stock > 0 ? 'text-green-600' : 'text-red-500'
                            }`}>
                              <i className="fas fa-box-open"></i>
                              库存 {variant.stock}
                            </span>
                            {variant.stock === 0 && (
                              <span className="text-xs text-red-500 font-medium">已售罄</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    <input 
                      type="radio" 
                      name={`spec_${specModalProduct.id}`} 
                      value={variant.id} 
                      checked={selectedVariant === variant.id}
                      onChange={() => variant.stock > 0 && setSelectedVariant(variant.id)}
                      disabled={variant.stock === 0}
                      className="sr-only"
                    />
                  </div>
                </label>
              ))}
            </div>

            {/* 操作区域 */}
            <div className="pt-4 border-t border-gray-200/50">
              {selectedVariant ? (
                (() => {
                  const qty = cartItemsMap[`${specModalProduct.id}@@${selectedVariant}`] || 0;
                  const stock = (specModalProduct.variants || []).find(v => v.id === selectedVariant)?.stock ?? 0;
                  if (qty > 0) {
                    return (
                      <div className="flex items-center justify-center gap-4">
                        <button
                          onClick={() => handleUpdateQuantity(specModalProduct.id, qty - 1, selectedVariant)}
                          className="w-10 h-10 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full transition-colors"
                          aria-label="减少"
                        >
                          <i className="fas fa-minus text-sm"></i>
                        </button>
                        <div className="px-4 py-2 bg-gray-50 rounded-xl">
                          <span className="text-lg font-semibold text-gray-900">{qty}</span>
                        </div>
                        <button
                          onClick={(e) => { flyToCart(e.currentTarget); handleUpdateQuantity(specModalProduct.id, qty + 1, selectedVariant); }}
                          disabled={qty >= stock}
                          className={`w-10 h-10 flex items-center justify-center ${modalRequiresReservation ? 'bg-gradient-to-br from-cyan-400 to-blue-500 hover:from-cyan-500 hover:to-blue-600' : 'bg-blue-500 hover:bg-blue-600'} text-white rounded-full disabled:opacity-50 disabled:cursor-not-allowed transition-colors`}
                          aria-label="增加"
                        >
                          <i className="fas fa-plus text-sm"></i>
                        </button>
                      </div>
                    );
                  }
                  return (
                    <button
                      onClick={(e) => { flyToCart(e.currentTarget); handleAddToCart(specModalProduct.id, selectedVariant); }}
                      disabled={stock === 0}
                      className={`w-10 h-10 rounded-full flex items-center justify-center mx-auto transition-all duration-200 ${
                        stock === 0
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                          : (modalRequiresReservation
                              ? 'bg-gradient-to-br from-cyan-400 to-blue-500 hover:from-cyan-500 hover:to-blue-600 text-white shadow-lg hover:shadow-xl transform hover:scale-105'
                              : 'bg-gradient-to-br from-orange-500 to-pink-600 hover:from-pink-600 hover:to-purple-500 text-white shadow-lg hover:shadow-xl transform hover:scale-105')
                      }`}
                      title={stock === 0 ? '库存不足' : '添加到购物车'}
                    >
                      <i className="fas fa-plus"></i>
                    </button>
                  );
                })()
              ) : (
                <div className="text-center py-4">
                  <i className="fas fa-hand-pointer text-gray-400 text-2xl mb-2"></i>
                  <p className="text-sm text-gray-500">请选择一个规格</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 商品详情弹窗 */}
      <ProductDetailModal
        product={detailModalProduct}
        isOpen={showDetailModal}
        onClose={closeDetailModal}
        onAddToCart={handleAddToCart}
        onUpdateQuantity={handleUpdateQuantity}
        cartItemsMap={cartItemsMap}
        onStartFly={flyToCart}
        isLoading={cartLoading}
        user={user}
      />
    </>
  );
}
