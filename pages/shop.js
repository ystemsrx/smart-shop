import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Head from 'next/head';
import Script from 'next/script';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { useProducts, useCart, useAuth, useUserAgentStatus, useApi } from '../hooks/useAuth';
import { useLocation } from '../hooks/useLocation';
import RetryImage from '../components/RetryImage';
import Nav from '../components/Nav';
import { getProductImage } from '../utils/urls';
import SimpleMarkdown from '../components/SimpleMarkdown';
import { getShopName, getApiBaseUrl, getLogo } from '../utils/runtimeConfig';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';
import { preExtractEdgeColors } from '../utils/edgeColorCache';

// 延迟加载 InfiniteMenu (包含 WebGL 和 gl-matrix)
const InfiniteMenu = dynamic(
  () => import(/* webpackChunkName: "infinite-menu" */ '../components/InfiniteMenu'),
  { 
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse text-gray-400">加载3D菜单...</div>
      </div>
    )
  }
);

// 直接导入 FloatingCart（需要 ref 透传，dynamic 不支持）
import FloatingCart from '../components/FloatingCart';

// 延迟加载模态框组件
const ProductDetailModal = dynamic(
  () => import(/* webpackChunkName: "product-detail" */ '../components/ProductDetailModal'),
  { ssr: false }
);

import SpecSelectionModal from '../components/SpecSelectionModal';
import { formatPriceDisplay, getPricingMeta, formatReservationCutoff, normalizeDescription } from '../utils/formatters';

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

const sortProductsByPrice = (products = []) => {
  const available = [];
  const deferred = [];

  products.forEach((p) => {
    if (isProductDown(p) || isProductOutOfStock(p)) {
      deferred.push(p);
    } else {
      available.push(p);
    }
  });

  const sortByPriority = (arr) => {
    const hotItems = [];
    const normalItems = [];
    arr.forEach((item) => (Boolean(item.is_hot) ? hotItems : normalItems).push(item));
    const byPrice = (a, b) => getPricingMeta(a).finalPrice - getPricingMeta(b).finalPrice;
    hotItems.sort(byPrice);
    normalItems.sort(byPrice);
    return [...hotItems, ...normalItems];
  };

  return [...sortByPriority(available), ...sortByPriority(deferred)];
};

const sortCategoriesByLocale = (categories = []) => {
  const cats = Array.isArray(categories) ? [...categories] : [];
  const letters = Array.from({ length: 26 }, (_, i) => String.fromCharCode(97 + i));
  const firstSigChar = (s) => {
    const str = String(s || '');
    for (let i = 0; i < str.length; i += 1) {
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
    for (let i = 0; i < 26; i += 1) {
      const cur = letters[i];
      const next = i < 25 ? letters[i + 1] : null;
      if (collator.compare(name, cur) < 0) {
        b = 0;
        break;
      }
      if (!next || (collator.compare(name, cur) >= 0 && collator.compare(name, next) < 0)) {
        b = i;
        break;
      }
    }
    return b;
  };

  try {
    const collator = new Intl.Collator(
      ['zh-Hans-u-co-pinyin', 'zh-Hans', 'zh', 'en', 'en-US'],
      { sensitivity: 'base', numeric: true }
    );
    cats.sort((a, b) => {
      const aName = String(a?.name || '');
      const bName = String(b?.name || '');
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
      const aName = String(a?.name || '');
      const bName = String(b?.name || '');
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

  return cats;
};

const filterProducts = (allProducts = [], selectedCategory = 'all', searchQuery = '') => {
  if (!Array.isArray(allProducts) || allProducts.length === 0) return [];

  let filtered = [...allProducts];

  if (searchQuery.trim()) {
    const query = searchQuery.toLowerCase().trim();
    filtered = filtered.filter((p) =>
      (p.name && p.name.toLowerCase().includes(query)) ||
      (p.description && p.description.toLowerCase().includes(query)) ||
      (p.category && p.category.toLowerCase().includes(query))
    );
  } else if (selectedCategory === 'hot') {
    filtered = filtered.filter((p) => Boolean(p.is_hot));
  } else if (selectedCategory && selectedCategory.startsWith('category:')) {
    const categoryName = selectedCategory.slice('category:'.length);
    filtered = filtered.filter((p) => p.category === categoryName);
  }

  return sortProductsByPrice(filtered);
};

// 简洁的头部动画变体
const headerVariants = {
  hidden: { opacity: 0 },
  visible: { 
    opacity: 1,
    transition: { duration: 0.2 }
  }
};

// 商品卡片组件 —— examples/商品浏览页面 style
const ProductCard = ({ product, onAddToCart, onUpdateQuantity, onStartFly, onOpenSpecModal, onOpenDetailModal, itemsMap = {}, isLoading, enterIndex = 0 }) => {
  const { user } = useAuth();
  const [showReservationInfo, setShowReservationInfo] = useState(true);
  const touchTapRef = useRef({ active: false, x: 0, y: 0 });
  const suppressNextClickRef = useRef(false);

  const tryOpenDetail = (target) => {
    if (target?.closest?.('button')) return;
    onOpenDetailModal && onOpenDetailModal(product);
  };

  const handleAddToCart = (e) => {
    if (!user) {
      alert('请先登录才能添加商品到购物车');
      return;
    }
    if (product.has_variants) {
      onOpenSpecModal(product);
      return;
    }
    setShowReservationInfo(false);
    onStartFly && onStartFly(e.currentTarget, product, { type: 'add' });
    onAddToCart(product.id, null);
  };

  const handleQuantityChange = (newQuantity, e, variantId = null) => {
    if (!user) return;
    const currentQty = variantId ? (itemsMap[`${product.id}@@${variantId}`] || 0) : (itemsMap[`${product.id}`] || 0);
    if (e && newQuantity > currentQty) {
      setShowReservationInfo(false);
      onStartFly && onStartFly(e.currentTarget, product, { type: 'increment' });
    } else if (newQuantity < currentQty) {
      setShowReservationInfo(true);
    }
    onUpdateQuantity(product.id, newQuantity, variantId);
  };

  const isVariant = isVariantProduct(product);
  const cartQuantity = isVariant ? 0 : (itemsMap[`${product.id}`] || 0);
  const isInCart = cartQuantity > 0;
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
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      whileHover={{ y: -8 }}
      transition={{
        duration: 0.2,
        ease: 'easeOut',
        delay: Math.min(enterIndex * 0.015, 0.12),
      }}
      className={`shop-product-card group relative bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col ${
        (isOutOfStock || isDown)
          ? 'opacity-60 grayscale cursor-not-allowed'
          : 'cursor-pointer'
      }`}
      onPointerDown={(e) => {
        if (e.pointerType !== 'touch') return;
        touchTapRef.current = { active: true, x: e.clientX, y: e.clientY };
      }}
      onPointerMove={(e) => {
        if (e.pointerType !== 'touch' || !touchTapRef.current.active) return;
        if (Math.abs(e.clientX - touchTapRef.current.x) > 10 || Math.abs(e.clientY - touchTapRef.current.y) > 10) {
          touchTapRef.current.active = false;
        }
      }}
      onPointerCancel={() => {
        touchTapRef.current.active = false;
      }}
      onPointerUp={(e) => {
        if (e.pointerType !== 'touch') return;
        const isTap = touchTapRef.current.active;
        touchTapRef.current.active = false;
        if (!isTap) return;
        suppressNextClickRef.current = true;
        setTimeout(() => {
          suppressNextClickRef.current = false;
        }, 350);
        tryOpenDetail(e.target);
      }}
      onClick={(e) => {
        if (suppressNextClickRef.current) {
          suppressNextClickRef.current = false;
          return;
        }
        tryOpenDetail(e.target);
      }}
    >
      {/* 图片区域 — aspect-square, hover scale */}
      <div className="relative aspect-square overflow-hidden">
        <motion.div 
            className="w-full h-full"
            whileHover={{ scale: 1.1 }}
            transition={{ duration: 0.6 }}
        >
        {imageSrc ? (
          <RetryImage
            src={imageSrc}
            alt={product.name}
            className={`w-full h-full object-cover ${
              (isOutOfStock || isDown) ? 'filter grayscale opacity-75' : ''
            }`}
            maxRetries={3}
          />
        ) : (
          <div className={`h-full w-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center ${
            (isOutOfStock || isDown) ? 'opacity-50' : ''
          }`}>
            <span className="text-gray-400 text-sm">暂无图片</span>
          </div>
        )}
        </motion.div>

        {/* hover 渐变 */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>

        {/* 折扣 / 热销角标 */}
        {hasDiscount && (
          <div className="absolute top-3 left-3 bg-primary/90 text-white text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider z-10">
            {discountZhe}折
          </div>
        )}
        {Boolean(product.is_hot) && (
          <div className="absolute top-3 right-3 z-10">
            <span className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold text-white bg-gradient-to-r from-orange-500 to-red-500 rounded-full uppercase tracking-wider">
              🔥 热销
            </span>
          </div>
        )}

        {/* 缺货/下架遮罩 */}
        {(isOutOfStock || isDown) && (
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-20">
            {isDown ? (
              <div className="bg-gray-800/90 text-white px-4 py-2 rounded-xl text-sm font-medium backdrop-blur-sm border border-white/20">
                暂时下架
              </div>
            ) : (
              <div className="bg-red-600/90 text-white px-4 py-2 rounded-xl text-sm font-medium backdrop-blur-sm border border-white/20">
                缺货
              </div>
            )}
          </div>
        )}
      </div>

      {/* 信息区域 */}
      <div className="p-4 flex flex-col justify-between flex-grow">
        <div>
          {/* 商品名 — serif 字体 */}
          <h3 className={`font-serif text-lg font-semibold leading-tight mb-1 line-clamp-2 group-hover:text-primary transition-colors ${
            (isOutOfStock || isDown) ? 'text-gray-500' : 'text-gray-900'
          }`}>
            {product.name}
          </h3>
          {/* 描述/分类 */}
          <p className="text-xs text-gray-500 mb-2 line-clamp-1">
            {product.description || product.category || ''}
          </p>
        </div>

        {/* 底部 — 价格 + 按钮 */}
        <div className="flex items-center justify-between mt-auto">
          <div className="flex flex-col">
            <span className={`text-primary font-bold font-display ${
              (isOutOfStock || isDown) ? 'text-gray-500' : ''
            }`}>
              ¥{formatPriceDisplay(finalPrice)}
            </span>
            {hasDiscount && (
              <span className="text-[10px] text-gray-400 line-through">¥{product.price}</span>
            )}
          </div>

          {/* 操作按钮 */}
          {!user ? (
            <button
              disabled
              className="w-8 h-8 bg-gray-300 text-gray-500 rounded-full flex items-center justify-center cursor-not-allowed"
              title="需登录"
            >
              <i className="fas fa-lock text-sm"></i>
            </button>
          ) : (isOutOfStock || isDown) ? (
            null
          ) : isVariant ? (
            <button
              onClick={() => onOpenSpecModal(product)}
              disabled={isLoading}
              aria-label="选规格"
              className={`w-8 h-8 text-white rounded-full flex items-center justify-center shadow-md hover:scale-110 active:scale-95 transition-transform disabled:opacity-50 ${
                requiresReservation ? 'bg-blue-500 hover:bg-blue-600 shadow-blue-500/30' : 'bg-primary hover:bg-orange-600 shadow-primary/30'
              }`}
            >
              <i className="fas fa-list-ul text-sm"></i>
            </button>
          ) : isInCart ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={(e) => handleQuantityChange(cartQuantity - 1, e)}
                disabled={isLoading}
                className="w-7 h-7 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-full transition-colors"
                aria-label="减少"
              >
                <i className="fas fa-minus text-sm"></i>
              </button>
              <span className="min-w-[20px] text-center text-sm font-bold text-gray-900">{cartQuantity}</span>
              <button
                onClick={(e) => handleQuantityChange(cartQuantity + 1, e)}
                disabled={isLoading || limitReached}
                className={`w-7 h-7 flex items-center justify-center ${requiresReservation ? 'bg-blue-500 hover:bg-blue-600' : 'bg-primary hover:bg-orange-600'} text-white rounded-full shadow-md disabled:opacity-50 transition-all`}
                aria-label="增加"
              >
                <i className="fas fa-plus text-sm"></i>
              </button>
            </div>
          ) : (
            <button
              onClick={handleAddToCart}
              disabled={isLoading}
              aria-label="加入购物车"
              className={`w-8 h-8 ${requiresReservation ? 'bg-blue-500 hover:bg-blue-600' : 'bg-primary'} text-white rounded-full flex items-center justify-center shadow-md hover:scale-110 active:scale-95 transition-transform disabled:opacity-50`}
            >
              <i className="fas fa-plus text-sm"></i>
            </button>
          )}
        </div>

        {/* 预约信息 — 紧凑显示 */}
        {requiresReservation && showReservationInfo && (
          <div className="mt-2 text-[10px] text-blue-500 leading-snug flex items-center gap-1">
            <i className="fas fa-clock text-xs"></i>
            <span className="truncate">{formatReservationCutoff(reservationCutoff)}</span>
          </div>
        )}
        {requiresReservation && reservationNote && showReservationInfo && (
          <div className="text-[10px] text-blue-500 leading-snug break-words">{reservationNote}</div>
        )}
      </div>
    </motion.div>
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

  return (
    <div>
      <div className="flex overflow-x-auto hide-scrollbar space-x-2.5 md:justify-center px-1.5 py-1">
        {hasHotProducts && (
          <button
            onClick={() => onCategoryChange('hot')}
            className={`flex-shrink-0 px-5 py-2 rounded-full border whitespace-nowrap text-sm md:text-base transition-all duration-300 ${
              isActive('hot')
                ? 'bg-[#2D3436] text-white font-medium border-[#2D3436] shadow-md transform scale-[1.03]'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-stone-100 hover:scale-[1.03]'
            }`}
          >
            🔥 热销
          </button>
        )}
        <button
          onClick={() => onCategoryChange('all')}
          className={`flex-shrink-0 px-5 py-2 rounded-full border whitespace-nowrap text-sm md:text-base transition-all duration-300 ${
            isActive('all')
              ? 'bg-[#2D3436] text-white font-medium border-[#2D3436] shadow-md transform scale-[1.03]'
              : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-stone-100 hover:scale-[1.03]'
          }`}
        >
          全部
        </button>
        {categories.map((category) => {
          const value = `category:${category.name}`;
          return (
            <button
              key={category.id}
              onClick={() => onCategoryChange(value)}
              className={`flex-shrink-0 px-5 py-2 rounded-full border whitespace-nowrap text-sm md:text-base transition-all duration-300 ${
                isActive(value)
                  ? 'bg-[#2D3436] text-white font-medium border-[#2D3436] shadow-md transform scale-[1.03]'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-stone-100 hover:scale-[1.03]'
              }`}
            >
              {category.name}
            </button>
          );
        })}
        {onToggleView && (
          <button
            type="button"
            onClick={onToggleView}
            disabled={disableSphereToggle}
            aria-pressed={isSphere}
            aria-label={toggleAriaLabel}
            className={`flex-shrink-0 px-3.5 py-2 rounded-full border whitespace-nowrap text-xs md:text-sm transition-all duration-300 ${
              isSphere
                ? 'bg-[#2D3436] text-white font-medium border-[#2D3436] shadow-md transform scale-[1.03]'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:scale-[1.03]'
            } ${disableSphereToggle ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <i className={`fas ${toggleButtonIcon}`}></i>
          </button>
        )}
      </div>
    </div>
  );
};

// 搜索栏组件 —— examples/商品浏览页面 style
const SearchBar = ({ searchQuery, onSearchChange, onSearch }) => {
  const handleSubmit = (e) => {
    e.preventDefault();
    onSearch();
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.2, duration: 0.5 }}
      className="mb-6"
    >
      <form onSubmit={handleSubmit} className="relative w-full md:w-1/2 md:mx-auto">
        <div className="shop-search-shell flex items-center bg-white border border-gray-200 rounded-full px-4 py-3 shadow-sm focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all">
          <i className="fas fa-search text-gray-400 mr-3 text-lg"></i>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="搜索您喜欢的商品..."
            className="flex-1 bg-transparent outline-none text-gray-900 placeholder-gray-400 font-display text-sm"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="ml-2 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <i className="fas fa-times text-base"></i>
            </button>
          )}
        </div>
      </form>
    </motion.div>
  );
};

export async function getServerSideProps(context) {
  const API_BASE = getApiBaseUrl();
  const headers = { 'Content-Type': 'application/json' };
  const cookieHeader = context?.req?.headers?.cookie;
  if (cookieHeader) {
    headers.cookie = cookieHeader;
  }

  const parseJsonSafe = async (response) => {
    try {
      return await response.json();
    } catch (error) {
      return {};
    }
  };

  try {
    const [productsResponse, categoriesResponse] = await Promise.all([
      fetch(`${API_BASE}/products`, { method: 'GET', headers }),
      fetch(`${API_BASE}/products/categories`, { method: 'GET', headers })
    ]);

    const [productsPayload, categoriesPayload] = await Promise.all([
      parseJsonSafe(productsResponse),
      parseJsonSafe(categoriesResponse)
    ]);

    if (!productsResponse.ok || !categoriesResponse.ok) {
      throw new Error(productsPayload?.message || categoriesPayload?.message || 'SSR data fetch failed');
    }

    const allProducts = sortProductsByPrice(productsPayload?.data?.products || []);
    const categories = sortCategoriesByLocale(categoriesPayload?.data?.categories || []);
    const hasHotProducts = allProducts.some((p) => Boolean(p.is_hot));
    const selectedCategory = hasHotProducts ? 'hot' : 'all';
    const initialProducts = filterProducts(allProducts, selectedCategory, '');

    return {
      props: {
        initialShopData: {
          allProducts,
          categories,
          products: initialProducts,
          hasHotProducts,
          selectedCategory,
          ssrLoaded: true
        }
      }
    };
  } catch (error) {
    return {
      props: {
        initialShopData: {
          allProducts: [],
          categories: [],
          products: [],
          hasHotProducts: false,
          selectedCategory: 'hot',
          ssrLoaded: false
        }
      }
    };
  }
}

export default function Shop({ initialShopData }) {
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
  const ssrLoaded = Boolean(initialShopData?.ssrLoaded);
  const [allProducts, setAllProducts] = useState(initialShopData?.allProducts || []); // 所有商品（用于前端过滤）
  const [products, setProducts] = useState(initialShopData?.products || []);
  const [categories, setCategories] = useState(initialShopData?.categories || []);
  const [selectedCategory, setSelectedCategory] = useState(initialShopData?.selectedCategory || 'hot');
  const [initialCategorySet, setInitialCategorySet] = useState(ssrLoaded);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(!ssrLoaded);
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
  const [hasGlobalHotProducts, setHasGlobalHotProducts] = useState(Boolean(initialShopData?.hasHotProducts)); // 全局是否有热销商品
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
  const categorySectionRef = useRef(null);
  const productSectionAnchorRef = useRef(null);
  const skipFirstClientLoadRef = useRef(ssrLoaded);
  const loadDataRequestIdRef = useRef(0);
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
  const [slideDirection, setSlideDirection] = useState('up');

  // Handle switching products in detail modal
  const handleSwitchProduct = (direction) => {
    if (!products.length) return;

    setDetailModalProduct((currentProduct) => {
      if (!currentProduct) return currentProduct;
      const currentIndex = products.findIndex((p) => p.id === currentProduct.id);
      if (currentIndex === -1) return currentProduct;

      if (direction === 'next') {
        setSlideDirection('up');
        return products[(currentIndex + 1) % products.length];
      }

      setSlideDirection('down');
      return products[(currentIndex - 1 + products.length) % products.length];
    });
  };

  // 飞入购物车动画（从元素飞到右下角悬浮购物车）
  const flyToCart = (startEl) => {
    if (typeof window === 'undefined') return;
    
    // 获取购物车图标位置
    const cartIcon = document.getElementById('floating-cart-icon');
    if (!startEl || !cartIcon) {
      return;
    }
    
    const startRect = startEl.getBoundingClientRect();
    const endRect = cartIcon.getBoundingClientRect();
    if (!startRect || !endRect) return;

    const startX = startRect.left + startRect.width / 2;
    const startY = startRect.top + startRect.height / 2;
    const endX = endRect.left + endRect.width / 2;
    const endY = endRect.top + endRect.height / 2;

    // 创建飞行小球
    const ball = document.createElement('div');
    ball.className = 'cart-fly-ball';
    document.body.appendChild(ball);

    const size = 14;
    ball.style.width = `${size}px`;
    ball.style.height = `${size}px`;

    const duration = 500; // ms
    const cpX = (startX + endX) / 2;
    const cpY = Math.min(startY, endY) - 100; // 控制点，形成弧线
    const startTime = performance.now();

    const animate = (now) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      // 使用 easeOutQuad 缓动函数，让动画更自然
      const easeT = 1 - (1 - t) * (1 - t);
      const oneMinusT = 1 - easeT;
      // 二次贝塞尔曲线公式
      const x = oneMinusT * oneMinusT * startX + 2 * oneMinusT * easeT * cpX + easeT * easeT * endX;
      const y = oneMinusT * oneMinusT * startY + 2 * oneMinusT * easeT * cpY + easeT * easeT * endY;
      // 小球逐渐缩小
      const scale = 1 - easeT * 0.3;
      ball.style.transform = `translate3d(${x - size / 2}px, ${y - size / 2}px, 0) scale(${scale})`;
      ball.style.opacity = String(1 - easeT * 0.3);
      
      if (t < 1) {
        requestAnimationFrame(animate);
      } else {
        // 到达后触发购物车抖动
        try { 
          cartWidgetRef.current?.shake(); 
        } catch (e) {
          console.warn('[flyToCart] shake invocation failed:', e);
        }
        // 安全移除小球
        if (ball.parentNode) {
          ball.parentNode.removeChild(ball);
        }
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
      console.error('Failed to load cart:', err);
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
      console.error('Failed to load coupons:', err);
      setCoupons([]);
    }
  };

  // 加载商品和分类（只在首次加载或位置变化时调用）
  const loadData = async () => {
    const requestId = ++loadDataRequestIdRef.current;
    const hasRenderableData = allProducts.length > 0 || categories.length > 0;
    const scopedAddressId = user?.type === 'user' ? (location?.address_id || null) : null;
    const scopedBuildingId = user?.type === 'user' ? (location?.building_id || null) : null;

    if (user && user.type === 'user' && (!location || !location.address_id || !location.building_id)) {
      if (requestId !== loadDataRequestIdRef.current) return;
      // 地址相关信息尚未就绪或正在强制选址时，不清空当前列表，避免首屏二次闪烁
      if (!hasRenderableData) {
        setAllProducts([]);
        setProducts([]);
        setCategories([]);
      }
      setIsLoading(false);
      return;
    }

    // 已有可展示数据时，后台静默刷新，避免列表闪烁
    if (!hasRenderableData) {
      setIsLoading(true);
    }
    setError('');

    try {
      // 加载所有商品和分类
      const [allProductsData, categoriesData] = await Promise.all([
        getProducts({ hotOnly: false, addressId: scopedAddressId, buildingId: scopedBuildingId }),
        getCategories({ addressId: scopedAddressId, buildingId: scopedBuildingId })
      ]);
      
      const fetchedProducts = allProductsData.data.products || [];
      const hasHotProducts = fetchedProducts.some(p => Boolean(p.is_hot));
      if (requestId !== loadDataRequestIdRef.current) return;
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

      // 后台预处理所有商品图片的边缘颜色（用于详情页全屏背景）
      preExtractEdgeColors(sortedAllProducts);

      setCategories(sortCategoriesByLocale(categoriesData.data.categories || []));
    } catch (err) {
      if (requestId !== loadDataRequestIdRef.current) return;
      setError(err.message || '加载数据失败');
    } finally {
      if (requestId === loadDataRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  };

  // 前端过滤商品（根据分类/搜索）- 不触发loading状态
  useEffect(() => {
    if (allProducts.length === 0) {
      setProducts([]);
      return;
    }

    setProducts(filterProducts(allProducts, selectedCategory, searchQuery));
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

  const scrollToCategories = () => {
    if (typeof window === 'undefined') return;

    const navHeight = 64;
    const stickyOverlap = 1;
    const safeGap = 12;
    const categoryHeight = categorySectionRef.current?.getBoundingClientRect().height || 0;
    const anchorElement = productSectionAnchorRef.current || categorySectionRef.current;
    if (!anchorElement) return;
    const anchorRect = anchorElement.getBoundingClientRect();
    const anchorTop = window.scrollY + anchorRect.top;
    const stickyStackHeight = navHeight + Math.max(0, categoryHeight - stickyOverlap);

    // 以商品区首行为锚点滚动，避免被吸顶分类栏遮挡
    const targetTop = anchorTop - stickyStackHeight - safeGap;
    window.scrollTo({
      top: Math.max(0, targetTop),
      behavior: 'smooth',
    });
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
          console.warn('Failed to preload payment success animation:', e);
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
    if (skipFirstClientLoadRef.current) {
      skipFirstClientLoadRef.current = false;
      const shouldKeepSSRForFirstPaint = !user;
      if (shouldKeepSSRForFirstPaint) {
        return;
      }
    }
    loadData();
  }, [
    locationRevision,
    user?.id,
    user?.type,
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
        console.warn('Failed to fetch delivery settings, using defaults:', e);
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
        <title>{`${shopName} - 智能小超市`}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>
      <Script
        id="dotlottie-wc"
        src="https://unpkg.com/@lottiefiles/dotlottie-wc@0.8.1/dist/dotlottie-wc.js"
        type="module"
        strategy="afterInteractive"
      />

      {/* 顶部导航（移动端优化） */}
      <Nav active={navActive} />

      <div className="pt-16 min-h-screen bg-[#FDFBF7]">
        {/* 主要内容 */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 font-display">
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
          
          {/* 页面标题区域（对齐 examples/浏览页面顶部） */}
          <motion.div 
            variants={headerVariants}
            initial="hidden"
            animate="visible"
            className="mb-0 text-center px-4 pt-3 pb-0 md:pt-4 md:pb-0"
          >
            <h1
              className="text-4xl md:text-6xl font-bold mb-6 tracking-tight leading-tight text-gray-900 animate-snack-fade-in-up"
              style={{ animationDelay: '0.2s' }}
            >
              不止
              <span className="text-[#FF6B6B] relative inline-block">
                美味
                <svg className="absolute w-full h-3 bottom-1 left-0 text-[#FF6B6B] opacity-30 -z-10" viewBox="0 0 100 10" preserveAspectRatio="none">
                  <path d="M0 5 Q 50 10 100 5" stroke="currentColor" strokeWidth="8" fill="none" />
                </svg>
              </span>
            </h1>
            <p
              className="text-lg md:text-xl text-gray-500 mb-8 max-w-2xl mx-auto animate-snack-fade-in-up"
              style={{ animationDelay: '0.4s' }}
            >
              精选优质零食，为您提供贴心配送服务
              <br />
              让美味触手可及
            </p>

            <div className="mb-6 min-h-[52px] flex justify-center animate-snack-fade-in-up" style={{ animationDelay: '0.5s' }}>
              {user?.type === 'user' ? (
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={openLocationModal}
                  className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-white/90 text-gray-700 border border-gray-200/60 shadow-md hover:shadow-lg transition-all duration-300 hover:bg-white"
                >
                  <span className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-100 text-emerald-600">
                    <i className="fas fa-location-dot"></i>
                  </span>
                  <div className="text-sm font-semibold text-gray-900">{displayLocation}</div>
                </motion.button>
              ) : (
                <div aria-hidden="true" className="h-10" />
              )}
            </div>

            <div className="animate-snack-fade-in-up" style={{ animationDelay: '0.6s' }}>
              <button
                onClick={scrollToCategories}
                className="hero-explore-btn bg-[#2D3436] text-white px-8 py-4 rounded-full font-medium text-lg hover:bg-[#FF6B6B] hover:shadow-lg hover:shadow-[#FF6B6B]/40 transition-all duration-300 transform hover:-translate-y-1"
              >
                开始探索 <i className="fas fa-arrow-down ml-2 animate-bounce"></i>
              </button>
            </div>

            <div className="mt-1 min-h-[20px] text-sm flex justify-center">
              {user?.type === 'user' && forceSelection ? (
                <div className="text-orange-600">为了展示可售商品，请先选择您的配送地址。</div>
              ) : null}
            </div>
          </motion.div>

          {/* 搜索栏 */}
          <SearchBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onSearch={handleSearch}
          />

          {/* 分类过滤器（下滑后常驻顶部） */}
          {categories.length > 0 && (
            <div
              id="product-section"
              ref={categorySectionRef}
              className="shop-category-sticky shop-category-enter sticky z-30 bg-[#FDFBF7] py-3 mb-6"
              style={{ top: 'calc(64px - 1px)' }}
            >
              <CategoryFilter
                categories={categories}
                selectedCategory={selectedCategory}
                onCategoryChange={handleCategoryChange}
                hasHotProducts={hasGlobalHotProducts}
                viewMode={viewMode}
                onToggleView={handleToggleView}
                disableSphereToggle={sphereToggleDisabled}
              />
            </div>
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
              <div ref={productSectionAnchorRef} aria-hidden="true" className="h-0" />
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
                      <div className="shop-product-grid grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
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
                            enterIndex={index}
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
      </div>

      {/* 规格选择弹窗 — 桌面: 居中浮层卡片 / 移动: 底部上滑 */}
      <AnimatePresence>
        {showSpecModal && specModalProduct && (
          <SpecSelectionModal
            product={specModalProduct}
            onClose={closeSpecModal}
            onAddToCart={handleAddToCart}
            onUpdateQuantity={handleUpdateQuantity}
            cartItemsMap={cartItemsMap}
            onStartFly={flyToCart}
            user={user}
          />
        )}
      </AnimatePresence>

      {/* 商品详情弹窗 */}
      <ProductDetailModal
        product={detailModalProduct}
        products={products}
        isOpen={showDetailModal}
        onClose={closeDetailModal}
        onAddToCart={handleAddToCart}
        onUpdateQuantity={handleUpdateQuantity}
        cartItemsMap={cartItemsMap}
        onStartFly={flyToCart}
        isLoading={cartLoading}
        user={user}
        onSwitchProduct={handleSwitchProduct}
      />

      <Toast message={toast.message} show={toast.visible} onClose={hideToast} />
    </>
  );
}
