import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import { useProducts, useCart, useAuth, useUserAgentStatus, useApi } from '../hooks/useAuth';
import { useLocation } from '../hooks/useLocation';
import RetryImage from '../components/RetryImage';
import InfiniteMenu from '../components/InfiniteMenu';
import Nav from '../components/Nav';
import { getProductImage } from '../utils/urls';
import FloatingCart from '../components/FloatingCart';
import SimpleMarkdown from '../components/SimpleMarkdown';
import { getShopName, getApiBaseUrl, getLogo } from '../utils/runtimeConfig';
import PastelBackground from '../components/ModalCard';
import ProductDetailModal from '../components/ProductDetailModal';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';

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

const getPricingMeta = (product = {}) => {
  const basePrice = typeof product.price === 'number' ? product.price : parseFloat(product.price || '0');
  const rawDiscount = product.discount;
  const discountZhe =
    typeof rawDiscount === 'number'
      ? rawDiscount
      : rawDiscount
        ? parseFloat(rawDiscount)
        : 10;
  const hasDiscount = Boolean(discountZhe && discountZhe > 0 && discountZhe < 10);
  const finalPrice = hasDiscount ? Math.round(basePrice * (discountZhe / 10) * 100) / 100 : basePrice;
  return { discountZhe, hasDiscount, finalPrice };
};

const isProductDown = (product = {}) => product.is_active === 0 || product.is_active === false;

const isVariantProduct = (product = {}) => Boolean(product.has_variants);

const isProductOutOfStock = (product = {}) => {
  if (product.is_not_for_sale) {
    return false;
  }
  if (isVariantProduct(product)) {
    if (Array.isArray(product.variants) && product.variants.length > 0) {
      return product.variants.every(v => (v?.stock || 0) <= 0);
    }
    if (typeof product.total_variant_stock === 'number') {
      return product.total_variant_stock === 0;
    }
    return false;
  }
  return (product.stock || 0) === 0;
};

const formatPriceDisplay = (value) => {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return '0';
  return Number.isInteger(amount) ? amount.toString() : amount.toFixed(2);
};

const normalizeDescription = (value, maxLength = 48) => {
  if (!value) return '';
  const plain = String(value).replace(/\s+/g, ' ').trim();
  if (plain.length <= maxLength) return plain;
  return `${plain.slice(0, maxLength)}…`;
};

const buildSphereSubtitle = (product = {}) => {
  const { finalPrice, hasDiscount, discountZhe } = getPricingMeta(product);
  const parts = [`¥${formatPriceDisplay(finalPrice)}`];
  if (hasDiscount) {
    parts.push(`${discountZhe}折`);
  }
  if (product.category) {
    parts.push(product.category);
  }
  if (product.reservation_required) {
    parts.push('需预约');
  }
  if (product.is_hot) {
    parts.push('热销');
  }
  return parts.join(' · ');
};

// 简洁的头部动画变体
const headerVariants = {
  hidden: { opacity: 0 },
  visible: { 
    opacity: 1,
    transition: { duration: 0.2 }
  }
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
  const isVariant = isVariantProduct(product);
  const cartQuantity = isVariant
    ? 0 // 有规格的商品不在卡片中显示数量调整
    : (itemsMap[`${product.id}`] || 0);
  // 是否在购物车中
  const isInCart = cartQuantity > 0;
  // 是否下架/缺货
  const isDown = isProductDown(product);
  const isOutOfStock = isProductOutOfStock(product);
  const imageSrc = getProductImage(product) || getLogo();
  const { discountZhe, hasDiscount, finalPrice } = getPricingMeta(product);
  const requiresReservation = Boolean(product.reservation_required);
  const reservationCutoff = product.reservation_cutoff;
  const reservationNote = (product.reservation_note || '').trim();
  const isNonSellable = Boolean(product.is_not_for_sale);
  const rawStockValue = typeof product.stock === 'number'
    ? product.stock
    : (typeof product.stock === 'string' && product.stock.trim() !== ''
      ? parseFloat(product.stock)
      : NaN);
  const normalizedStock = Number.isFinite(rawStockValue) ? rawStockValue : null;
  const effectiveStock = isNonSellable ? null : normalizedStock;
  const limitReached = effectiveStock !== null && effectiveStock > 0 && cartQuantity >= effectiveStock;

  return (
    <div 
      className={`card-modern group overflow-hidden h-[420px] flex flex-col animate-card-fade-in ${
        (isOutOfStock || isDown)
          ? 'opacity-60 grayscale cursor-not-allowed'
          : 'cursor-pointer'
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
            className={`h-full w-full object-cover object-center transition-transform duration-500 ${
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
            <div className="text-xs flex items-center justify-between gap-2">
              <div className={`flex items-center gap-1 ${
                isOutOfStock ? 'text-red-500 font-medium' : 'text-gray-500'
              }`}>
                <i className="fas fa-box-open"></i>
                <span>
                  {isNonSellable
                    ? '库存 ∞'
                    : (isVariant
                        ? (product.total_variant_stock !== undefined ? `库存 ${product.total_variant_stock}` : '多规格')
                        : `库存 ${normalizedStock ?? 0}`)}
                </span>
              </div>
              {isNonSellable && (
                <span className="px-2 py-0.5 text-[10px] font-semibold text-purple-600 bg-purple-50 border border-purple-200 rounded-full flex-shrink-0">
                  非卖品
                </span>
              )}
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
                    isLoading || limitReached
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
const CategoryFilter = ({
  categories,
  selectedCategory,
  onCategoryChange,
  hasHotProducts = false,
  viewMode = 'grid',
  onToggleView,
  disableSphereToggle = false
}) => {
  const isActive = (value) => selectedCategory === value;
  const isSphere = viewMode === 'sphere';
  const toggleAriaLabel = isSphere ? '切换为网格视图' : '切换为球形视图';
  const toggleButtonIcon = isSphere ? 'fa-border-all' : 'fa-globe';
  const toggleButtonLabel = isSphere ? '网格视图' : '球形视图';

  // 容器动画：控制子元素交错出现
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.06,
        delayChildren: 0.1
      }
    }
  };

  // 标签动画：弹性上浮
  const itemVariants = {
    hidden: { opacity: 0, y: 20, scale: 0.8 },
    visible: { 
      opacity: 1, 
      y: 0, 
      scale: 1,
      transition: {
        type: "spring",
        stiffness: 400,
        damping: 25,
        mass: 0.8
      }
    }
  };

  return (
    <div className="mb-8">
      {/* 标题栏 */}
      <motion.div 
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="flex flex-wrap items-center gap-3 mb-4"
      >
        <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center shadow-md">
          <i className="fas fa-layer-group text-white text-sm"></i>
        </div>
        <h3 className="text-lg font-semibold text-gray-900">商品分类</h3>
        {onToggleView && (
          <div className="ml-auto mt-3 sm:mt-0">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              type="button"
              onClick={onToggleView}
              disabled={disableSphereToggle}
              aria-pressed={isSphere}
              aria-label={toggleAriaLabel}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-colors duration-200 text-sm font-medium ${
                isSphere
                  ? 'bg-gradient-to-r from-sky-500 to-cyan-500 text-white border-transparent shadow-lg'
                  : 'bg-white/90 text-gray-700 border-gray-200 hover:bg-white hover:border-gray-300 shadow-sm'
              } ${disableSphereToggle ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
              title={toggleAriaLabel}
            >
              <i className={`fas ${toggleButtonIcon}`}></i>
              <span className="hidden sm:inline">{toggleButtonLabel}</span>
            </motion.button>
          </div>
        )}
      </motion.div>

      {/* 分类标签列表 */}
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="flex flex-wrap gap-3"
      >
        {hasHotProducts && (
          <motion.button
            variants={itemVariants}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onCategoryChange('hot')}
            className={`px-4 py-2 text-sm font-medium rounded-xl border-2 transition-colors duration-200 ${
              isActive('hot')
                ? 'bg-gradient-to-r from-rose-500 to-orange-500 text-white border-transparent shadow-lg'
                : 'bg-white/90 text-gray-700 border-gray-200 hover:bg-white hover:border-gray-300 shadow-sm'
            }`}
          >
            <div className="flex items-center gap-2">
              <i className="fas fa-fire"></i>
              <span>热销</span>
            </div>
          </motion.button>
        )}
        <motion.button
          variants={itemVariants}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => onCategoryChange('all')}
          className={`px-4 py-2 text-sm font-medium rounded-xl border-2 transition-colors duration-200 ${
            isActive('all')
              ? 'bg-gradient-to-r from-orange-500 to-pink-600 text-white border-transparent shadow-lg'
              : 'bg-white/90 text-gray-700 border-gray-200 hover:bg-white hover:border-gray-300 shadow-sm'
          }`}
        >
          <div className="flex items-center gap-2">
            <i className="fas fa-th-large"></i>
            <span>全部</span>
          </div>
        </motion.button>
        {categories.map((category, index) => {
          const value = `category:${category.name}`;
          return (
            <motion.button
              key={category.id}
              variants={itemVariants}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onCategoryChange(value)}
              className={`px-4 py-2 text-sm font-medium rounded-xl border-2 transition-colors duration-200 ${
                isActive(value)
                  ? 'bg-gradient-to-r from-emerald-500 to-cyan-600 text-white border-transparent shadow-lg'
                  : 'bg-white/90 text-gray-700 border-gray-200 hover:bg-white hover:border-gray-300 shadow-sm'
              }`}
            >
              <div className="flex items-center gap-2">
                <i className="fas fa-tag"></i>
                <span>{category.name}</span>
              </div>
            </motion.button>
          );
        })}
      </motion.div>
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
    <motion.div 
      variants={headerVariants}
      initial="hidden"
      animate="visible"
      className="mb-8"
    >
      <form onSubmit={handleSubmit} className="relative max-w-2xl mx-auto">
        <motion.div 
          whileHover={{ scale: 1.02 }}
          className="relative group"
        >
           {/* 背景光晕 */}
           <div className="absolute -inset-1 bg-gradient-to-r from-orange-500 to-pink-600 rounded-2xl blur opacity-30 group-hover:opacity-50 transition-opacity duration-300"></div>
          
          {/* 搜索框主体 */}
          <div className="relative flex items-center bg-white/95 backdrop-blur-xl border border-gray-200/60 rounded-2xl shadow-lg hover:shadow-xl transition-shadow pr-2">
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
             <motion.button
               whileHover={{ scale: 1.05 }}
               whileTap={{ scale: 0.95 }}
               type="submit"
               className="flex-shrink-0 w-10 h-10 my-auto bg-gradient-to-r from-orange-500 to-pink-600 text-white font-medium rounded-xl hover:from-orange-600 hover:to-pink-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 shadow-lg flex items-center justify-center"
             >
              <i className="fas fa-search"></i>
            </motion.button>
          </div>
        </motion.div>
      </form>
    </motion.div>
  );
};

export default function Shop() {
  const router = useRouter();
  const { user } = useAuth();
  const { getProducts, searchProducts, getCategories, getShopStatus } = useProducts();
  const { addToCart, getCart, updateCart } = useCart();
  const { location, openLocationModal, revision: locationRevision, isLoading: locationLoading, forceSelection } = useLocation();
  const { getStatus: getUserAgentStatus } = useUserAgentStatus();
  const { apiRequest } = useApi();
  const navActive = user && (user.type === 'admin' || user.type === 'agent') ? 'staff-shop' : 'shop';
  const shopName = getShopName();
  
  const cartWidgetRef = useRef(null);
  const [allProducts, setAllProducts] = useState([]); // 所有商品（用于前端过滤）
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('hot');
  const [initialCategorySet, setInitialCategorySet] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [cartLoading, setCartLoading] = useState(false);
  const [error, setError] = useState('');
  const [cart, setCart] = useState({ items: [], total_quantity: 0, total_price: 0 });
  const [checkingOut, setCheckingOut] = useState(false);
  const [cartItemsMap, setCartItemsMap] = useState({}); // 商品ID到数量的映射
  const [prevQty, setPrevQty] = useState(0);
  const [shopOpen, setShopOpen] = useState(true);
  const [shopNote, setShopNote] = useState('');
  const [cycleLocked, setCycleLocked] = useState(false);
  const [isAgent, setIsAgent] = useState(false); // 是否为代理区域
  const [hasGlobalHotProducts, setHasGlobalHotProducts] = useState(false); // 全局是否有热销商品
  const [freeDeliveryThreshold, setFreeDeliveryThreshold] = useState(10); // 免配送费门槛
  const [baseDeliveryFee, setBaseDeliveryFee] = useState(1); // 基础配送费
  const [viewMode, setViewMode] = useState('grid'); // grid | sphere
  const [showCartDrawer, setShowCartDrawer] = useState(false); // 购物车浮窗状态
  const [isClosingDrawer, setIsClosingDrawer] = useState(false); // 购物车浮窗关闭动画状态
  const [coupons, setCoupons] = useState([]); // 用户的优惠券列表
  const [applyCoupon, setApplyCoupon] = useState(false); // 是否使用优惠券
  const [selectedCouponId, setSelectedCouponId] = useState(null); // 选中的优惠券ID
  const [showCouponDropdown, setShowCouponDropdown] = useState(false); // 优惠券下拉框状态
  const couponAutoSelectedRef = useRef(false); // 追踪是否已自动选择过优惠券
  const { toast, showToast, hideToast } = useToast();
  
  const displayLocation = location
    ? `${location.dormitory || ''}${location.building ? '·' + location.building : ''}`.trim() || '已选择地址'
    : '请选择配送地址';
  const isSphereView = viewMode === 'sphere';
  const normalizeStockValue = useCallback((item) => {
    if (!item || item.is_not_for_sale) return Number.POSITIVE_INFINITY;
    const rawStock = item.stock;
    if (rawStock === '∞') return Number.POSITIVE_INFINITY;
    const numeric = Number(rawStock);
    if (Number.isFinite(numeric)) return numeric;
    const parsed = typeof rawStock === 'string' ? Number.parseFloat(rawStock) : 0;
    return Number.isFinite(parsed) ? parsed : 0;
  }, []);

  const findOutOfStockItems = useCallback((items = []) => {
    return (items || [])
      .filter((it) => {
        const stockVal = normalizeStockValue(it);
        if (!Number.isFinite(stockVal)) return false;
        return stockVal <= 0 || (stockVal > 0 && Number(it.quantity || 0) > stockVal);
      })
      .map((it) => (it.variant_name ? `${it.name}（${it.variant_name}）` : it.name));
  }, [normalizeStockValue]);

  const sphereItems = useMemo(() => {
    if (!products || products.length === 0) {
      return [];
    }
    const visibleProducts = products.filter(product => !product.is_not_for_sale);
    return visibleProducts.map(product => {
      const productImage = getProductImage(product) || getLogo();
      const subtitle = buildSphereSubtitle(product);
      const rawDescription = product.description || product.short_description || product.tagline || '';
      const fallbackDescription = product.category ? `分类：${product.category}` : '精选好物';
      const description = normalizeDescription(rawDescription || fallbackDescription);
      const isVariant = isVariantProduct(product);
      const productKey = product?.id !== undefined && product?.id !== null
        ? `${product.id}`
        : String(product?.name ?? '');
      const cartQuantity = cartItemsMap[productKey] || 0;
      const stockValue = typeof product.stock === 'number'
        ? product.stock
        : (typeof product.stock === 'string' && product.stock.trim() !== '')
          ? parseFloat(product.stock)
          : NaN;
      const normalizedStock = Number.isFinite(stockValue) ? stockValue : null;

      let ctaLabel = '+';
      let disabled = false;
      let visualState = 'normal';
      let statusText = '';
      const supportsQuantity = !isVariant && !!user && !isProductDown(product) && !isProductOutOfStock(product);
      const quantity = supportsQuantity ? cartQuantity : 0;
      const limitReached = supportsQuantity && normalizedStock !== null && normalizedStock > 0 && cartQuantity >= normalizedStock;

      if (!user) {
        ctaLabel = '需登录';
        disabled = true;
        visualState = 'login_required';
        statusText = ctaLabel;
      } else if (isProductDown(product)) {
        ctaLabel = '下架';
        disabled = true;
        visualState = 'down';
        statusText = ctaLabel;
      } else if (isProductOutOfStock(product)) {
        ctaLabel = '缺货';
        disabled = true;
        visualState = 'out_of_stock';
        statusText = ctaLabel;
      } else if (isVariant) {
        ctaLabel = '选规格';
      } else if (limitReached) {
        visualState = 'limit_reached';
        statusText = '已达库存上限';
      }

      return {
        id: product.id ?? product.name,
        image: productImage,
        title: product.name,
        description,
        subtitle,
        ctaLabel,
        disabled,
        payload: product,
        reservationRequired: Boolean(product.reservation_required),
        visualState,
        statusText,
        supportsQuantity,
        quantity,
        limitReached,
        stock: normalizedStock
      };
    });
  }, [products, user, cartItemsMap]);

  const hasSphereItems = sphereItems.length > 0;
  const sphereToggleDisabled = isLoading || !hasSphereItems;

  useEffect(() => {
    if (viewMode === 'sphere' && !hasSphereItems) {
      setViewMode('grid');
    }
  }, [viewMode, hasSphereItems]);

  // 监听购物车总价变化，自动检查优惠券可用性
  useEffect(() => {
    if (!applyCoupon || !selectedCouponId || !coupons.length) return;
    
    const cartTotal = cart?.total_price || 0;
    const selectedCoupon = coupons.find(c => c.id === selectedCouponId);
    
    if (selectedCoupon) {
      const couponAmount = parseFloat(selectedCoupon.amount) || 0;
      // 如果购物车总价不再满足优惠券使用条件，自动取消选择
      if (cartTotal <= couponAmount) {
        setApplyCoupon(false);
        setSelectedCouponId(null);
      }
    }
  }, [cart?.total_price, applyCoupon, selectedCouponId, coupons]);

  // 当优惠券和购物车都加载完成时，自动选择最佳优惠券（仅首次）
  useEffect(() => {
    // 如果弹窗关闭，重置自动选择标志
    if (!showCartDrawer) {
      couponAutoSelectedRef.current = false;
      return;
    }
    
    // 如果已经自动选择过，或者没有优惠券，或者用户已经手动操作过，则不再自动选择
    if (couponAutoSelectedRef.current || !coupons.length || applyCoupon || !cart?.total_price) return;
    
    const cartTotal = cart.total_price;
    const usableCoupons = coupons.filter(c => cartTotal > (parseFloat(c.amount) || 0));
    
    if (usableCoupons.length > 0) {
      usableCoupons.sort((a, b) => (parseFloat(b.amount) || 0) - (parseFloat(a.amount) || 0));
      setSelectedCouponId(usableCoupons[0].id);
      setApplyCoupon(true);
      couponAutoSelectedRef.current = true; // 标记已自动选择过
    }
  }, [showCartDrawer, coupons, cart?.total_price]);

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

  const handleToggleView = () => {
    if (viewMode === 'sphere') {
      setViewMode('grid');
      return;
    }
    if (sphereToggleDisabled) return;
    setViewMode('sphere');
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
      
      // 重新计算总价，排除非卖品
      const recalculatedTotalPrice = (cartResult.items || []).reduce((sum, item) => {
        const isActive = !(item.is_active === 0 || item.is_active === false);
        const isNonSellable = Boolean(item.is_not_for_sale);
        // 只计算上架且非非卖品的商品价格
        return sum + (isActive && !isNonSellable ? parseFloat(item.subtotal || 0) : 0);
      }, 0);
      
      // 重新计算配送费（排除非卖品后）
      const deliveryFee = cartResult.delivery_fee || 0;
      const freeThreshold = cartResult.free_delivery_threshold || freeDeliveryThreshold;
      const isFreeShipping = (deliveryFee === 0 || freeThreshold === 0);
      const recalculatedShippingFee = isFreeShipping ? 0 : (recalculatedTotalPrice >= freeThreshold ? 0 : deliveryFee);
      const recalculatedPayableTotal = recalculatedTotalPrice + recalculatedShippingFee;
      
      // 使用重新计算的值
      setCart({
        ...cartResult,
        total_price: parseFloat(recalculatedTotalPrice.toFixed(2)),
        shipping_fee: recalculatedShippingFee,
        payable_total: parseFloat(recalculatedPayableTotal.toFixed(2))
      });
      
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

  // 加载用户优惠券
  const loadCoupons = async () => {
    if (!user) {
      setCoupons([]);
      return;
    }
    
    try {
      const resp = await apiRequest('/coupons/my');
      const list = resp?.data?.coupons || [];
      setCoupons(list);
      
      // 注意：不在这里自动选择优惠券，而是等cart数据加载完成后
      // 通过useEffect来处理自动选择逻辑
    } catch (err) {
      console.error('加载优惠券失败:', err);
      setCoupons([]);
    }
  };

  // 商品排序函数 - 可购(上架且有货)优先按价格升序；“下架”或“无货”统一放到最后并按价格升序
  const sortProductsByPrice = (products) => {
    const available = [];
    const deferred = [];

    products.forEach(p => {
      if (isProductDown(p) || isProductOutOfStock(p)) {
        deferred.push(p);
      } else {
        available.push(p);
      }
    });

    const sortByPriority = (arr) => {
      const hotItems = [];
      const normalItems = [];
      arr.forEach(item => (Boolean(item.is_hot) ? hotItems : normalItems).push(item));
      const byPrice = (a, b) => getPricingMeta(a).finalPrice - getPricingMeta(b).finalPrice;
      hotItems.sort(byPrice);
      normalItems.sort(byPrice);
      return [...hotItems, ...normalItems];
    };

    return [...sortByPriority(available), ...sortByPriority(deferred)];
  };

  // 加载商品和分类（只在首次加载或位置变化时调用）
  const loadData = async () => {
    if (user && user.type === 'user' && (!location || !location.address_id || !location.building_id)) {
      setAllProducts([]);
      setProducts([]);
      setCategories([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      // 加载所有商品和分类
      const [allProductsData, categoriesData] = await Promise.all([
        getProducts({ hotOnly: false }),
        getCategories()
      ]);
      
      const fetchedProducts = allProductsData.data.products || [];
      const hasHotProducts = fetchedProducts.some(p => Boolean(p.is_hot));
      setHasGlobalHotProducts(hasHotProducts);

      // 首次加载时，如果选择了热销但没有热销商品，切换到全部
      if (!initialCategorySet && selectedCategory === 'hot') {
        if (!hasHotProducts) {
          setSelectedCategory('all');
        }
        setInitialCategorySet(true);
      }

      // 排序所有商品
      const sortedAllProducts = sortProductsByPrice([...fetchedProducts]);
      setAllProducts(sortedAllProducts);

      // 分类按拼音/英文排序
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
        if (!ch) return 2;
        return /[A-Za-z]/.test(ch) ? 0 : 1;
      };
      const bucket = (s, collator) => {
        const name = String(s || '');
        if (!/[A-Za-z\u4e00-\u9fff]/.test(name)) return 26;
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
          if (ab !== bb) return ab - bb;
          const ar = typeRank(aName);
          const br = typeRank(bName);
          if (ar !== br) return ar - br;
          return collator.compare(aName, bName);
        });
      } catch (e) {
        cats.sort((a, b) => {
          const aName = String(a.name || '');
          const bName = String(b.name || '');
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
      setCategories(cats);
    } catch (err) {
      setError(err.message || '加载数据失败');
    } finally {
      setIsLoading(false);
    }
  };

  // 前端过滤商品（根据分类/搜索）- 不触发loading状态
  useEffect(() => {
    if (allProducts.length === 0) {
      setProducts([]);
      return;
    }

    let filtered = [...allProducts];

    // 搜索过滤
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(p => 
        (p.name && p.name.toLowerCase().includes(query)) ||
        (p.description && p.description.toLowerCase().includes(query)) ||
        (p.category && p.category.toLowerCase().includes(query))
      );
    } else {
      // 分类过滤
      if (selectedCategory === 'hot') {
        filtered = filtered.filter(p => Boolean(p.is_hot));
      } else if (selectedCategory && selectedCategory.startsWith('category:')) {
        const categoryName = selectedCategory.slice('category:'.length);
        filtered = filtered.filter(p => p.category === categoryName);
      }
      // 'all' 不过滤
    }

    // 重新排序过滤后的结果
    const sortedFiltered = sortProductsByPrice(filtered);
    setProducts(sortedFiltered);
  }, [allProducts, selectedCategory, searchQuery]);

  // 搜索商品（现在只需要触发前端过滤，不需要请求后端）
  const handleSearch = () => {
    // 搜索由 useEffect 自动处理，这里只需确保分类被清除
    if (searchQuery.trim()) {
      setSelectedCategory('all');
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

  const handleSphereAction = (item, sourceElement) => {
    const product = item?.payload;
    if (!product) return;

    if (!user) {
      alert('请先登录才能添加商品到购物车');
      return;
    }

    if (isProductDown(product)) {
      alert('该商品已下架');
      return;
    }

    if (isProductOutOfStock(product)) {
      alert('该商品暂时缺货');
      return;
    }

    if (isVariantProduct(product)) {
      openSpecModal(product);
      return;
    }

    const productKey = product?.id !== undefined && product?.id !== null
      ? `${product.id}`
      : String(product?.name ?? '');
    const cartQuantity = cartItemsMap[productKey] || 0;
    const stockValue = typeof product.stock === 'number'
      ? product.stock
      : (typeof product.stock === 'string' && product.stock.trim() !== '')
        ? parseFloat(product.stock)
        : NaN;
    const normalizedStock = Number.isFinite(stockValue) ? stockValue : null;
    if (normalizedStock !== null && normalizedStock > 0 && cartQuantity >= normalizedStock) {
      alert('该商品已达到库存上限');
      return;
    }

    if (sourceElement && typeof sourceElement.getBoundingClientRect === 'function') {
      flyToCart(sourceElement);
    }
    handleAddToCart(product.id, null);
  };

  const handleSphereDecrement = (item) => {
    const product = item?.payload;
    if (!product || !user) return;
    if (isVariantProduct(product)) return;

    const productKey = product?.id !== undefined && product?.id !== null
      ? `${product.id}`
      : String(product?.name ?? '');
    const cartQuantity = cartItemsMap[productKey] || 0;
    const nextQuantity = Math.max(0, cartQuantity - 1);
    handleUpdateQuantity(product.id, nextQuantity, null);
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
      // 成功后重新加载购物车，确保价格和配送费正确（排除非卖品）
      await loadCart();
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
      
      // 从 cart.items 中移除
      const updatedItems = cart.items.filter(item => {
        const itemKey = item.variant_id ? `${item.product_id}@@${item.variant_id}` : `${item.product_id}`;
        return itemKey !== key;
      });
      
      setCart(prev => ({
        ...prev,
        items: updatedItems,
        total_quantity: Math.max(0, (prev.total_quantity || 0) + qtyDiff)
      }));
    } else {
      setCartItemsMap(prev => ({
        ...prev,
        [key]: newQuantity
      }));
      
      // 更新 cart.items 中的数量
      const updatedItems = cart.items.map(item => {
        const itemKey = item.variant_id ? `${item.product_id}@@${item.variant_id}` : `${item.product_id}`;
        if (itemKey === key) {
          // 非卖品的价格始终为0
          const isNonSellable = Boolean(item.is_not_for_sale);
          const newSubtotal = isNonSellable ? '0.00' : (newQuantity * item.unit_price).toFixed(2);
          return { ...item, quantity: newQuantity, subtotal: newSubtotal };
        }
        return item;
      });
      
      // 重新计算总价（排除非卖品和下架商品）
      const newTotalPrice = updatedItems.reduce((sum, item) => {
        const isActive = !(item.is_active === 0 || item.is_active === false);
        const isNonSellable = Boolean(item.is_not_for_sale);
        // 只计算上架且非非卖品的商品价格
        return sum + (isActive && !isNonSellable ? parseFloat(item.subtotal) : 0);
      }, 0);
      
      // 重新计算配送费
      // 从后端获取配送费配置（这里使用缓存的配送费规则）
      const deliveryFee = cart.delivery_fee || 0;
      const freeThreshold = cart.free_delivery_threshold || freeDeliveryThreshold;
      const isFreeShipping = (deliveryFee === 0 || freeThreshold === 0);
      const newShippingFee = isFreeShipping ? 0 : (newTotalPrice >= freeThreshold ? 0 : deliveryFee);
      const newPayableTotal = newTotalPrice + newShippingFee;
      
      setCart(prev => ({
        ...prev,
        items: updatedItems,
        total_quantity: Math.max(0, (prev.total_quantity || 0) + qtyDiff),
        total_price: parseFloat(newTotalPrice.toFixed(2)),
        shipping_fee: newShippingFee,
        payable_total: parseFloat(newPayableTotal.toFixed(2))
      }));
    }
    
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

  const handleDrawerCheckout = async () => {
    if (!user) {
      router.push('/login');
      return;
    }
    if (cycleLocked) {
      showToast('暂时无法结算，请联系管理员');
      return;
    }
    if (checkingOut) return;
    setCheckingOut(true);
    try {
      const resp = await getCart();
      const data = resp?.data;
      if (data) {
        const recalculatedTotalPrice = (data.items || []).reduce((sum, item) => {
          const isActive = !(item.is_active === 0 || item.is_active === false);
          const isNonSellable = Boolean(item.is_not_for_sale);
          return sum + (isActive && !isNonSellable ? parseFloat(item.subtotal || 0) : 0);
        }, 0);
        const deliveryFee = data.delivery_fee || 0;
        const freeThreshold = data.free_delivery_threshold || freeDeliveryThreshold;
        const isFreeShipping = (deliveryFee === 0 || freeThreshold === 0);
        const recalculatedShippingFee = isFreeShipping ? 0 : (recalculatedTotalPrice >= freeThreshold ? 0 : deliveryFee);
        const recalculatedPayableTotal = recalculatedTotalPrice + recalculatedShippingFee;
        setCart({
          ...data,
          total_price: parseFloat(recalculatedTotalPrice.toFixed(2)),
          shipping_fee: recalculatedShippingFee,
          payable_total: parseFloat(recalculatedPayableTotal.toFixed(2))
        });
        const itemsMap = {};
        (data.items || []).forEach(item => {
          const key = item.variant_id ? `${item.product_id}@@${item.variant_id}` : `${item.product_id}`;
          itemsMap[key] = item.quantity;
        });
        setCartItemsMap(itemsMap);
      }
      const outOfStockNames = findOutOfStockItems(data?.items || cart.items || []);
      if (outOfStockNames.length > 0) {
        showToast(`以下商品缺货：${outOfStockNames.join('、')}`);
        return;
      }
      setIsClosingDrawer(true);
      setTimeout(() => {
        setShowCartDrawer(false);
        setIsClosingDrawer(false);
        setShowCouponDropdown(false); // 重置优惠券下拉框状态
        if (applyCoupon && selectedCouponId) {
          router.push(`/checkout?apply=1&coupon_id=${encodeURIComponent(selectedCouponId)}`);
        } else {
          router.push('/checkout?apply=0');
        }
      }, 200);
    } catch (err) {
      showToast(err.message || '检查库存失败，请稍后重试');
    } finally {
      setCheckingOut(false);
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

  // 初始化时加载数据（位置或用户变化时重新加载）
  useEffect(() => {
    loadData();
  }, [
    locationRevision,
    user,
    forceSelection,
    location?.address_id,
    location?.building_id,
  ]);

  // 用户登录状态变化时加载购物车
  useEffect(() => {
    loadCart();
  }, [user, locationRevision]);

  // 加载店铺/代理状态（打烊提示）和配送费设置
  useEffect(() => {
    (async () => {
      try {
        const addressId = location?.address_id;
        const buildingId = location?.building_id;
        const res = await getUserAgentStatus(addressId, buildingId);

        const locked = !!res.data?.cycle_locked;
        const open = !!res.data?.is_open && !locked;
        setCycleLocked(locked);
        setShopOpen(open);
        setIsAgent(!!res.data?.is_agent);

        if (locked) {
          setShopNote('暂时无法结算，请联系管理员');
        } else if (res.data?.is_open) {
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
        setCycleLocked(false);
      }
    })();
  }, [location]);

  // 加载配送费设置
  useEffect(() => {
    (async () => {
      try {
        const API_BASE = getApiBaseUrl();
        const response = await fetch(`${API_BASE}/delivery-config`, {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json'
          }
        });
        const result = await response.json();
        if (result.success && result.data && result.data.delivery_config) {
          const threshold = result.data.delivery_config.free_delivery_threshold;
          const fee = result.data.delivery_config.delivery_fee;
          // 使用 ?? 而不是 ||，这样 0 也是有效值
          setFreeDeliveryThreshold(threshold !== undefined && threshold !== null ? parseFloat(threshold) : 10);
          setBaseDeliveryFee(fee !== undefined && fee !== null ? parseFloat(fee) : 1);
        }
      } catch (e) {
        console.warn('获取配送费设置失败，使用默认值:', e);
      }
    })();
  }, []);

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
          <motion.div 
            variants={headerVariants}
            initial="hidden"
            animate="visible"
            className="mb-12 text-center"
          >
            <div className="flex justify-center mb-6">
              <motion.div 
                whileHover={{ rotate: 10, scale: 1.1 }}
                transition={{ type: "spring", stiffness: 300 }}
                className="relative"
              >
                <div className="absolute -inset-4 bg-gradient-to-r from-orange-500 to-pink-600 rounded-3xl blur-2xl opacity-30"></div>
                <div className="relative w-20 h-20 bg-gradient-to-br from-orange-500 via-pink-600 to-purple-500 rounded-3xl flex items-center justify-center shadow-2xl">
                  <i className="fas fa-store text-white text-2xl"></i>
                </div>
              </motion.div>
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
                <span>{
                  baseDeliveryFee === 0 || freeDeliveryThreshold === 0
                    ? '免费配送'
                    : freeDeliveryThreshold >= 999999999
                      ? `配送费 ¥${baseDeliveryFee}`
                      : `满${freeDeliveryThreshold}免费配送`
                }</span>
              </div>
              <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
              <div className="flex items-center gap-2">
                <i className="fas fa-clock text-blue-500"></i>
                <span>急速送达</span>
              </div>
              <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
              <div className="flex items-center gap-2">
                <i className="fas fa-star text-yellow-500"></i>
                <span>商品优质保证</span>
              </div>
            </div>

            {user?.type === 'user' && (
              <div className="mt-6 flex justify-center">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
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
                </motion.button>
              </div>
            )}

            {user?.type === 'user' && forceSelection && (
              <div className="mt-3 text-sm text-orange-600 flex justify-center">
                为了展示可售商品，请先选择您的配送地址。
              </div>
            )}
          </motion.div>

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
              viewMode={viewMode}
              onToggleView={handleToggleView}
              disableSphereToggle={sphereToggleDisabled}
            />
          )}

          {/* 错误提示 */}
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {/* 商品列表 - 加载时显示空白背景，加载完成后卡片淡入 */}
          {!isLoading && (
            <>
              {/* 商品列表 */}
              {products.length > 0 ? (
                isSphereView ? (
                  <>
                    <div className="relative w-full h-[480px] sm:h-[580px] lg:h-[620px]">
                      <InfiniteMenu
                        key={`sphere-${selectedCategory}-${searchQuery}-${products.length}`}
                        items={sphereItems}
                        onAddToCart={handleSphereAction}
                        onDecrement={handleSphereDecrement}
                      />
                    </div>
                    <div className="mt-8 mb-16 text-center text-sm text-gray-500">
                      拖拽页面以浏览商品，点击中心按钮即可加入购物车。
                    </div>
                  </>
                ) : (
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={`grid-${selectedCategory}-${searchQuery}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15, ease: "easeInOut" }}
                    >
                      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 product-grid-stagger">
                        {products.map((product, index) => (
                          <ProductCard
                              key={product.id}
                              product={product}
                              onAddToCart={(pid, variantId=null) => handleAddToCart(pid, variantId)}
                              onUpdateQuantity={(pid, qty, variantId=null) => handleUpdateQuantity(pid, qty, variantId)}
                              onStartFly={(el) => flyToCart(el)}
                              onOpenSpecModal={openSpecModal}
                              onOpenDetailModal={openDetailModal}
                              itemsMap={cartItemsMap}
                              isLoading={cartLoading}
                            />
                        ))}
                      </div>
                    
                      {/* 底部提示线 */}
                      <div className="flex items-center justify-center gap-4 mt-12 mb-20">
                        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-400 to-gray-400"></div>
                        <span className="text-sm text-gray-500 font-medium">到底了</span>
                        <div className="flex-1 h-px bg-gradient-to-l from-transparent via-gray-400 to-gray-400"></div>
                      </div>
                    </motion.div>
                  </AnimatePresence>
                )
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
        <FloatingCart 
          ref={cartWidgetRef} 
          count={cart?.total_quantity ?? 0}
          onClick={async () => {
            // 点击时重新加载购物车数据和优惠券
            await loadCart();
            await loadCoupons();
            setShowCartDrawer(true);
          }}
        />

        {/* 购物车浮窗 */}
        {showCartDrawer && (
          <>
            {/* 背景遮罩 - 无模糊效果 */}
            <div 
              className={`fixed inset-0 bg-black/20 z-50 ${isClosingDrawer ? 'animate-fade-out' : 'animate-apple-fade-in'}`}
              onClick={() => {
                setIsClosingDrawer(true);
                setTimeout(() => {
                  setShowCartDrawer(false);
                  setIsClosingDrawer(false);
                  setShowCouponDropdown(false); // 重置优惠券下拉框状态
                }, 200);
              }}
            />
            
            {/* 浮窗主体 - 在按钮上方右对齐显示 */}
            <div 
              className={`fixed bottom-24 right-6 z-50 w-full sm:w-[420px] max-w-[calc(100vw-3rem)] max-h-[70vh] bg-white rounded-2xl shadow-2xl flex flex-col ${
                isClosingDrawer ? 'animate-scale-out' : 'animate-scale-in'
              }`}
              style={{ transformOrigin: 'bottom right' }}
            >
              {/* 商品列表区域（可滚动） */}
              <div className="flex-1 overflow-y-auto px-5 py-4 cart-drawer-scroll custom-scrollbar">
                {!cart?.items || cart.items.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <div className="w-20 h-20 bg-gradient-to-br from-gray-100 to-gray-200 rounded-full flex items-center justify-center mb-4">
                      <i className="fas fa-shopping-cart text-gray-400 text-2xl"></i>
                    </div>
                    <p className="text-gray-500 text-sm mb-2">购物车是空的</p>
                    <p className="text-gray-400 text-xs">快去添加喜欢的商品吧</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {cart.items.map((item, index) => {
                      const isDown = item.is_active === 0 || item.is_active === false;
                      const isNonSellable = Boolean(item.is_not_for_sale);
                      const rawStock = item.stock;
                      const normalizedStock = isNonSellable
                        ? null
                        : (typeof rawStock === 'number'
                            ? rawStock
                            : (typeof rawStock === 'string' && rawStock.trim() !== ''
                              ? parseFloat(rawStock)
                              : 0));
                      const isStockLimitReached = normalizedStock !== null && (normalizedStock <= 0 || item.quantity >= normalizedStock);
                      
                      return (
                        <div
                          key={`${item.product_id}-${item.variant_id || 'no-variant'}`}
                          className={`bg-gradient-to-br from-gray-50 to-white rounded-xl p-3 border border-gray-200 hover:shadow-md transition-all duration-200 cart-item-enter ${isDown ? 'opacity-60' : ''}`}
                          style={{ animationDelay: `${index * 0.05}s` }}
                        >
                          <div className="flex gap-3">
                            {/* 商品图片 */}
                            <div className="flex-shrink-0 w-16 h-16 bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg overflow-hidden">
                              {item.img_path ? (
                                <RetryImage
                                  src={getProductImage(item)}
                                  alt={item.name}
                                  className="w-full h-full object-cover"
                                  maxRetries={2}
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <i className="fas fa-image text-gray-400 text-sm"></i>
                                </div>
                              )}
                            </div>

                            {/* 商品信息 */}
                            <div className="flex-1 min-w-0">
                              <h4 className="text-sm font-semibold text-gray-900 line-clamp-1 mb-1">
                                {item.name}
                              </h4>
                              {item.variant_name && (
                                <span className="inline-block text-xs px-2 py-0.5 bg-cyan-50 text-cyan-700 rounded-full border border-cyan-200 mb-1">
                                  {item.variant_name}
                                </span>
                              )}
                              <div className="flex items-center justify-between mt-2">
                                <span className="text-sm font-bold text-emerald-600">
                                  ¥{isNonSellable ? '0.00' : item.subtotal}
                                </span>
                                {/* 数量调整按钮 */}
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => handleUpdateQuantity(item.product_id, item.quantity - 1, item.variant_id || null)}
                                    disabled={isDown}
                                    className="w-7 h-7 flex items-center justify-center bg-white border-2 border-gray-300 hover:border-red-400 hover:bg-red-50 text-gray-700 hover:text-red-600 rounded-full disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm"
                                    aria-label="减少"
                                  >
                                    <i className="fas fa-minus text-xs"></i>
                                  </button>
                                  <span className="min-w-[28px] text-center text-sm font-semibold text-gray-900">
                                    {item.quantity}
                                  </span>
                                  <button
                                    onClick={() => handleUpdateQuantity(item.product_id, item.quantity + 1, item.variant_id || null)}
                                    disabled={isDown || isStockLimitReached}
                                    className="w-7 h-7 flex items-center justify-center bg-white border-2 border-gray-300 hover:border-emerald-400 hover:bg-emerald-50 text-gray-700 hover:text-emerald-600 rounded-full disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm"
                                    aria-label="增加"
                                    title={isStockLimitReached ? '已达库存上限' : ''}
                                  >
                                    <i className="fas fa-plus text-xs"></i>
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 底部结算区域 */}
              {cart?.items && cart.items.length > 0 && (
                <div className="border-t border-gray-200 px-5 py-4 bg-gradient-to-br from-gray-50 to-white rounded-b-2xl">
                  {/* 价格明细 */}
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">商品金额</span>
                      <span className="text-gray-900 font-medium">¥{cart.total_price?.toFixed(2) || '0.00'}</span>
                    </div>
                    {cart.shipping_fee !== undefined && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">配送费</span>
                        <span className={`font-medium ${cart.shipping_fee > 0 ? 'text-gray-900' : 'text-emerald-600'}`}>
                          {cart.shipping_fee > 0 ? `¥${cart.shipping_fee?.toFixed(2)}` : '免费'}
                        </span>
                      </div>
                    )}
                    
                    {/* 优惠券选择 */}
                    {(() => {
                      const totalCoupons = (coupons || []).length;
                      const usableCoupons = (coupons || []).filter(c => (cart?.total_price || 0) > (parseFloat(c.amount) || 0));
                      const hasUsableCoupons = usableCoupons.length > 0;
                      
                      return (
                        <>
                          <div className="relative z-20 flex items-center justify-between text-sm pt-2 border-t border-gray-200">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={applyCoupon}
                                disabled={!hasUsableCoupons}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setApplyCoupon(checked);
                                  if (!checked) setShowCouponDropdown(false);
                                  if (checked && !selectedCouponId && usableCoupons.length > 0) {
                                    // 自动选择最佳优惠券
                                    usableCoupons.sort((a, b) => (parseFloat(b.amount) || 0) - (parseFloat(a.amount) || 0));
                                    setSelectedCouponId(usableCoupons[0].id);
                                  }
                                }}
                                className="w-4 h-4 text-pink-600 rounded focus:ring-2 focus:ring-pink-300 disabled:opacity-50 disabled:cursor-not-allowed"
                              />
                              <i className={`fas fa-ticket-alt ${hasUsableCoupons ? 'text-pink-600' : 'text-gray-400'}`}></i>
                              <span className={`font-medium ${hasUsableCoupons ? 'text-gray-900' : 'text-gray-400'}`}>
                                使用优惠券
                                {totalCoupons > 0 && (
                                  <span className="ml-1 text-xs">
                                    ({usableCoupons.length}/{totalCoupons})
                                  </span>
                                )}
                              </span>
                            </label>
                            <span className="text-pink-600 font-bold">
                              {applyCoupon && selectedCouponId ? (
                                <>-¥{(parseFloat(coupons.find(c => c.id === selectedCouponId)?.amount) || 0).toFixed(2)}</>
                              ) : hasUsableCoupons ? (
                                '可用'
                              ) : totalCoupons > 0 ? (
                                <span className="text-xs text-gray-400">不满足条件</span>
                              ) : (
                                <span className="text-xs text-gray-400">无券</span>
                              )}
                            </span>
                          </div>
                          
                          {/* 优惠券自定义下拉选择 */}
                          <AnimatePresence>
                            {applyCoupon && usableCoupons.length > 1 && (
                              <motion.div 
                                initial={{ opacity: 0, height: 0, marginTop: 0, overflow: "hidden" }}
                                animate={{ opacity: 1, height: "auto", marginTop: "0.5rem", transitionEnd: { overflow: "visible" } }}
                                exit={{ opacity: 0, height: 0, marginTop: 0, overflow: "hidden" }}
                                transition={{ duration: 0.2, ease: "easeInOut" }}
                                className="relative"
                              >
                              {/* 点击外部关闭遮罩 */}
                              {showCouponDropdown && (
                                <div 
                                  className="fixed inset-0 z-10" 
                                  onClick={() => setShowCouponDropdown(false)}
                                ></div>
                              )}

                              <button
                                type="button"
                                onClick={() => setShowCouponDropdown(!showCouponDropdown)}
                                className="relative z-20 w-full flex items-center justify-between bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 hover:border-pink-300 hover:shadow-sm transition-all duration-200"
                              >
                                <span className="truncate">
                                  {selectedCouponId 
                                    ? (() => {
                                        const c = usableCoupons.find(c => c.id === selectedCouponId);
                                        return c ? `${parseFloat(c.amount).toFixed(2)}元优惠券${c.expires_at ? ` (${new Date(c.expires_at).toLocaleDateString()})` : ''}` : '请选择优惠券';
                                      })()
                                    : '请选择优惠券'}
                                </span>
                                <i className={`fas fa-chevron-down text-gray-400 transition-transform duration-300 ${showCouponDropdown ? 'rotate-180' : ''}`}></i>
                              </button>

                              <AnimatePresence>
                                {showCouponDropdown && (
                                  <motion.div
                                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                    animate={{ opacity: 1, y: -8, scale: 1 }}
                                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                                    className="absolute bottom-full left-0 right-0 mb-1 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-30"
                                  >
                                    <div className="max-h-48 overflow-y-auto custom-scrollbar p-1.5 space-y-1">
                                      {usableCoupons
                                        .sort((a, b) => (parseFloat(b.amount) || 0) - (parseFloat(a.amount) || 0))
                                        .map(c => (
                                          <button
                                            key={c.id}
                                            onClick={() => {
                                              setSelectedCouponId(c.id);
                                              setShowCouponDropdown(false);
                                            }}
                                            className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-colors duration-200 flex items-center justify-between group ${
                                              selectedCouponId === c.id
                                                ? 'bg-pink-50 text-pink-700 font-medium'
                                                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                                            }`}
                                          >
                                            <span className="truncate">
                                              {parseFloat(c.amount).toFixed(2)}元优惠券
                                              <span className={`text-xs ml-2 ${selectedCouponId === c.id ? 'text-pink-500' : 'text-gray-400 group-hover:text-gray-500'}`}>
                                                {c.expires_at ? `有效期至 ${new Date(c.expires_at.replace(' ', 'T') + 'Z').toLocaleDateString()}` : ''}
                                              </span>
                                            </span>
                                            {selectedCouponId === c.id && (
                                              <i className="fas fa-check text-pink-500"></i>
                                            )}
                                          </button>
                                        ))}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </>
                      );
                    })()}
                    
                    <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                      <span className="text-base font-bold text-gray-900">总计</span>
                      <span className="text-2xl font-black text-emerald-600">
                        ¥{(() => {
                          const baseTotal = (cart.payable_total || cart.total_price) || 0;
                          const discount = (applyCoupon && selectedCouponId) 
                            ? (parseFloat(coupons.find(c => c.id === selectedCouponId)?.amount) || 0) 
                            : 0;
                          return Math.max(0, baseTotal - discount).toFixed(2);
                        })()}
                      </span>
                    </div>
                  </div>

                  {/* 去结算按钮 */}
                  <button
                    onClick={handleDrawerCheckout}
                    disabled={checkingOut || cycleLocked}
                    aria-busy={checkingOut}
                    className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white py-3.5 rounded-xl font-bold text-base shadow-lg hover:shadow-xl hover:from-emerald-600 hover:to-teal-700 transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 touch-manipulation disabled:from-slate-300 disabled:to-slate-400 disabled:cursor-not-allowed disabled:shadow-none"
                  >
                    <i className="fas fa-credit-card"></i>
                    <span>{cycleLocked ? '暂时无法结算，请联系管理员' : (checkingOut ? '正在检查库存...' : '去结算')}</span>
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </PastelBackground>

      {/* 规格选择弹窗 */}
      {showSpecModal && specModalProduct && (() => {
        const isModalNonSellable = Boolean(specModalProduct.is_not_for_sale);
        return (
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
                .map((variant, index) => {
                  const isVariantOutOfStock = isModalNonSellable ? false : (variant.stock === 0);
                  return (
                <label 
                  key={variant.id} 
                  className={`block transform transition-all duration-200 opacity-0 animate-apple-slide-up ${
                    isVariantOutOfStock 
                      ? 'cursor-not-allowed' 
                      : 'cursor-pointer hover:scale-105'
                  }`}
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  <div className={`p-4 rounded-xl border-2 transition-all duration-200 ${
                    isVariantOutOfStock
                      ? 'border-gray-200 bg-gray-50'
                      : selectedVariant === variant.id 
                      ? 'border-blue-500 bg-blue-50 shadow-md' 
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          isVariantOutOfStock
                            ? 'border-gray-300 bg-gray-100'
                            : selectedVariant === variant.id 
                            ? 'border-blue-500 bg-blue-500' 
                            : 'border-gray-300'
                        }`}>
                          {selectedVariant === variant.id && !isVariantOutOfStock && (
                            <i className="fas fa-check text-white text-xs"></i>
                          )}
                          {isVariantOutOfStock && (
                            <i className="fas fa-times text-gray-400 text-xs"></i>
                          )}
                        </div>
                        <div>
                          <span className={`text-sm font-medium ${
                            isVariantOutOfStock ? 'text-gray-500' : 'text-gray-900'
                          }`}>{variant.name}</span>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`text-xs flex items-center gap-1 ${
                              (isModalNonSellable || variant.stock > 0) ? 'text-green-600' : 'text-red-500'
                            }`}>
                              <i className="fas fa-box-open"></i>
                              库存 {isModalNonSellable ? '∞' : variant.stock}
                            </span>
                            {isVariantOutOfStock && (
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
                      onChange={() => !isVariantOutOfStock && setSelectedVariant(variant.id)}
                      disabled={isVariantOutOfStock}
                      className="sr-only"
                    />
                  </div>
                </label>
                  );
                })}
            </div>

            {/* 操作区域 */}
            <div className="pt-4 border-t border-gray-200/50">
              {selectedVariant ? (
                (() => {
                  const qty = cartItemsMap[`${specModalProduct.id}@@${selectedVariant}`] || 0;
                  const stock = (specModalProduct.variants || []).find(v => v.id === selectedVariant)?.stock ?? 0;
                  const hasStock = isModalNonSellable || stock > 0;
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
                          disabled={!isModalNonSellable && qty >= stock}
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
                      disabled={!hasStock}
                      className={`w-10 h-10 rounded-full flex items-center justify-center mx-auto transition-all duration-200 ${
                        !hasStock
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                          : (modalRequiresReservation
                              ? 'bg-gradient-to-br from-cyan-400 to-blue-500 hover:from-cyan-500 hover:to-blue-600 text-white shadow-lg hover:shadow-xl transform hover:scale-105'
                              : 'bg-gradient-to-br from-orange-500 to-pink-600 hover:from-pink-600 hover:to-purple-500 text-white shadow-lg hover:shadow-xl transform hover:scale-105')
                      }`}
                      title={!hasStock ? '库存不足' : '添加到购物车'}
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
        );
      })()}

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

      <Toast message={toast.message} show={toast.visible} onClose={hideToast} />
    </>
  );
}
