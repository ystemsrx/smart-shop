import React, { useState, useEffect, useRef, useMemo } from 'react';
import RetryImage from './RetryImage';
import { getProductImage } from '../utils/urls';
import { getLogo } from '../utils/runtimeConfig';
import { getEdgeColor, extractEdgeColorAsync } from '../utils/edgeColorCache';
import { formatPriceDisplay, formatReservationCutoff } from '../utils/formatters';

const ProductDetailSlide = ({
  product,
  onClose,
  onRequestClose,
  onAddToCart,
  onUpdateQuantity,
  cartItemsMap = {},
  onStartFly,
  isLoading = false,
  user,
  desktopMode = false
}) => {
  // 图片 src
  const imageSrc = (product ? getProductImage(product) : '') || getLogo();

  // 1. 初始化背景色：直接从缓存同步读取，避免背景黑屏闪烁
  const [bgColor, setBgColor] = useState(() => {
    if (!imageSrc) return '#111';
    const cached = getEdgeColor(imageSrc);
    return cached || '#111';
  });

  // 帮助函数：获取默认选中规格
  const getDefaultVariant = (prod) => {
    if (prod?.has_variants && prod?.variants?.length > 0) {
      const isNonSellable = prod.is_not_for_sale;
      // 如果是非卖品，选中第一个；如果是售卖品，选中第一个有库存的
      const firstAvailable = isNonSellable 
        ? prod.variants[0]
        : prod.variants.find(v => v.stock > 0);
      return firstAvailable?.id || null;
    }
    return null;
  };

  // 2. 初始化选中规格：同步计算，避免按钮和规格选中状态闪烁
  const [selectedVariant, setSelectedVariant] = useState(() => getDefaultVariant(product));

  const [imageError, setImageError] = useState(false);
  const [ready, setReady] = useState(false);

  // 颜色提取逻辑
  useEffect(() => {
    if (!imageSrc) return;

    // 再次检查缓存（防止初始化后缓存刚更新）
    const cached = getEdgeColor(imageSrc);
    if (cached && cached !== bgColor) {
      setBgColor(cached);
      setReady(true);
      return;
    }
    
    if (cached) {
      setReady(true);
      return;
    }

    // 缓存未命中，开始异步提取
    let cancelled = false;
    // 兜底定时器减少等待焦虑
    const safetyTimer = setTimeout(() => {
      if (!cancelled) setReady(true);
    }, 600);

    extractEdgeColorAsync(imageSrc).then((color) => {
      if (cancelled) return;
      setBgColor(color);
      requestAnimationFrame(() => {
        if (!cancelled) setReady(true);
      });
    });

    return () => { cancelled = true; clearTimeout(safetyTimer); };
  }, [imageSrc]); // 移除 bgColor 依赖

  // 监听 product.id 变化以更新规格（用于组件未卸载但 props 更新的情况，虽然父组件加了 key 一般会重置）
  useEffect(() => {
    const newDefault = getDefaultVariant(product);
    // 只有当当前选中项不在新产品的规格列表中，或者之前为null而现在有值时才重置
    // 简单起见，且为了保证逻辑一致性，当ID变化时我们总是重置为默认逻辑
    // 但为了避免死循环或冲突，我们检查一下是否已经一致
    if (selectedVariant !== newDefault) {
       setSelectedVariant(newDefault);
    }
    setImageError(false);
  }, [product?.id]);

  if (!product) return null;

  // 计算商品信息
  const isVariant = !!product.has_variants;
  const isDown = product.is_active === 0 || product.is_active === false;
  const isNonSellable = product.is_not_for_sale;
  const isOutOfStock = isNonSellable ? false : (isVariant 
    ? ((product.total_variant_stock || 0) === 0) 
    : (product.stock === 0));
  
  const discountZhe = typeof product.discount === 'number' 
    ? product.discount 
    : (product.discount ? parseFloat(product.discount) : 10);
  const hasDiscount = discountZhe && discountZhe > 0 && discountZhe < 10;
  const finalPrice = hasDiscount 
    ? (Math.round(product.price * (discountZhe / 10) * 100) / 100) 
    : product.price;
  
  const requiresReservation = Boolean(product.reservation_required);
  const reservationCutoff = product.reservation_cutoff;
  const reservationNote = (product.reservation_note || '').trim();

  // 获取购物车中的数量
  const getCartQuantity = (variantId = null) => {
    // 确保 variantId 存在时才使用组合键，否则使用产品ID
    // 注意：如果商品是多规格，但这里没传 variantId，通常意味着逻辑错误，或者在这个上下文中我们只关心总数？
    // 这里我们严格按照：是多规格就必须有 variantId 才能查到准确数量
    if (isVariant && !variantId) return 0;
    
    const key = variantId ? `${product.id}@@${variantId}` : `${product.id}`;
    return cartItemsMap[key] || 0;
  };

  // 获取当前选中规格的库存
  const getCurrentStock = () => {
    if (isNonSellable) return Infinity;
    if (!isVariant) return product.stock;
    if (!selectedVariant) return 0;
    const variant = product.variants?.find(v => v.id === selectedVariant);
    return variant?.stock || 0;
  };

  const handleAddToCart = (e) => {
    if (!user) {
      alert('请先登录才能添加商品到购物车');
      return;
    }
    if (isDown || isOutOfStock) return;
    
    if (isVariant && !selectedVariant) {
      alert('请先选择商品规格');
      return;
    }

    onStartFly && onStartFly(e.currentTarget, product);
    onAddToCart(product.id, isVariant ? selectedVariant : null);
  };

  const handleQuantityChange = (newQuantity, e) => {
    if (!user) return;
    if (e && newQuantity > getCartQuantity(isVariant ? selectedVariant : null)) {
      onStartFly && onStartFly(e.currentTarget, product);
    }
    onUpdateQuantity(product.id, newQuantity, isVariant ? selectedVariant : null);
  };

  const handleMobileClosePress = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (onRequestClose) {
      onRequestClose();
      return;
    }
    onClose && onClose();
  };

  const currentQuantity = getCartQuantity(isVariant ? selectedVariant : null);
  const currentStock = getCurrentStock();
  const isInCart = currentQuantity > 0;
  const showQuantityControl = isInCart && !isVariant;
  const showVariantQuantityControl = isVariant && !!selectedVariant && currentQuantity > 0;
  const canIncreaseCurrentSelection = isNonSellable || currentQuantity < currentStock;
  const ratingValue = typeof product.rating === 'number' ? product.rating.toFixed(1) : null;
  const tagList = Array.isArray(product.tags) ? product.tags.filter(Boolean) : [];

  if (desktopMode) {
    return (
      <div className="w-full bg-white flex flex-col md:grid md:grid-cols-2">
        <div className="w-full aspect-square relative bg-stone-100">
          <RetryImage
            key={imageSrc}
            src={imageSrc}
            alt={product.name}
            className={`w-full h-full object-cover ${
              (isOutOfStock || isDown) ? 'filter grayscale opacity-75' : ''
            }`}
            maxRetries={3}
            onFinalError={() => setImageError(true)}
          />

          {(isOutOfStock || isDown) && (
            <div className="absolute inset-0 bg-black/35 flex items-center justify-center">
              <div className={`px-6 py-3 rounded-2xl text-sm font-medium text-white border ${
                isDown ? 'bg-gray-800/90 border-white/20' : 'bg-red-600/90 border-white/20'
              }`}>
                {isDown ? '暂时下架' : '缺货'}
              </div>
            </div>
          )}
        </div>

        <div className="w-full aspect-square min-w-0 flex flex-col">
          <div className="flex-1 overflow-y-auto no-scrollbar p-8 md:p-6 pb-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {product.category && (
                <span className="px-3 py-1 bg-orange-100 text-primary text-xs font-bold rounded-full">
                  {product.category}
                </span>
              )}
              {ratingValue && (
                <span className="inline-flex items-center gap-1 text-amber-500 text-sm font-bold">
                  <i className="fas fa-star text-[12px]"></i>
                  {ratingValue}
                </span>
              )}
              {requiresReservation && (
                <span className="px-3 py-1 bg-blue-100 text-blue-600 text-xs font-bold rounded-full">预约商品</span>
              )}
            </div>

            <h2 className="text-3xl font-bold text-[#1c1917] mb-4 break-words">{product.name}</h2>

            <div className="flex items-end gap-3 mb-6">
              <div className="text-3xl font-bold text-primary">¥{formatPriceDisplay(finalPrice)}</div>
              {hasDiscount && (
                <span className="text-base text-stone-400 line-through">¥{formatPriceDisplay(product.price)}</span>
              )}
            </div>

            {product.description && (
              <p className="text-stone-500 leading-relaxed mb-6 whitespace-pre-line">
                {product.description}
              </p>
            )}

            {requiresReservation && (
              <div className="mb-6 space-y-2">
                <div className="text-xs text-blue-600 flex items-center gap-1.5">
                  <i className="fas fa-clock text-[11px]"></i>
                  <span>{formatReservationCutoff(reservationCutoff)}</span>
                </div>
                {reservationNote && (
                  <div className="text-xs text-blue-600">{reservationNote}</div>
                )}
              </div>
            )}

            {isVariant && product.variants && product.variants.length > 0 && (
              <div className="mb-3">
                <p className="text-xs text-stone-500 uppercase tracking-wider font-semibold mb-2">选择规格</p>
                <div className="flex flex-wrap gap-2">
                  {product.variants
                    .sort((a, b) => (b.stock || 0) - (a.stock || 0))
                    .map((variant) => {
                      const isVariantOutOfStock = isNonSellable ? false : (variant.stock === 0);
                      const isSelected = selectedVariant === variant.id;
                      return (
                        <button
                          key={variant.id}
                          onClick={() => !isVariantOutOfStock && setSelectedVariant(variant.id)}
                          disabled={isVariantOutOfStock}
                          className={`px-4 py-2 rounded-full text-xs font-medium transition-all duration-200 border ${
                            isVariantOutOfStock
                              ? 'bg-stone-100 text-stone-400 border-stone-200 cursor-not-allowed line-through'
                              : isSelected
                                ? 'bg-primary text-white border-primary ring-1 ring-inset ring-primary/90'
                                : 'bg-white text-stone-600 border-stone-200 hover:border-stone-300'
                          }`}
                        >
                          {variant.name}
                          {!isNonSellable && (
                            <span className={`ml-1.5 text-[10px] ${
                              isVariantOutOfStock ? 'text-stone-400' : isSelected ? 'text-white/80' : 'text-stone-400'
                            }`}>
                              {isVariantOutOfStock ? '售罄' : `库存${variant.stock}`}
                            </span>
                          )}
                        </button>
                      );
                    })}
                </div>
              </div>
            )}

            {!!tagList.length && (
              <div className="flex gap-2 mb-2 flex-wrap">
                {tagList.map((tag) => (
                  <span
                    key={tag}
                    className="px-3 py-1 border border-stone-200 text-stone-500 text-xs rounded-full"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="shrink-0 px-6 md:px-6 pb-3 md:pb-3 pt-0">
            <div className="flex items-center gap-4 min-h-[48px]">
            {!user ? (
              <button
                disabled
                className="flex-1 bg-stone-200 text-stone-500 rounded-full font-bold py-3 cursor-not-allowed"
              >
                请先登录
              </button>
            ) : (isOutOfStock || isDown) ? (
              <button
                disabled
                className={`flex-1 rounded-full font-bold py-3 cursor-not-allowed ${
                  isDown ? 'bg-gray-200 text-gray-500' : 'bg-red-100 text-red-500'
                }`}
              >
                {isDown ? '暂时下架' : '缺货'}
              </button>
            ) : isVariant && !selectedVariant ? (
              <div className="text-sm text-stone-400 font-medium">请选择规格</div>
            ) : showVariantQuantityControl ? (
              <div className="flex-1 flex items-center gap-3">
                <div className="h-12 flex items-center border border-stone-200 rounded-full px-3 gap-3 bg-stone-50/80">
                  <button
                    onClick={(e) => handleQuantityChange(currentQuantity - 1, e)}
                    disabled={isLoading}
                    className="text-stone-500 hover:text-stone-800 transition-colors disabled:opacity-40"
                    aria-label="减少"
                  >
                    <i className="fas fa-minus text-sm"></i>
                  </button>
                  <span className="font-bold min-w-[20px] text-center">{currentQuantity}</span>
                  <button
                    onClick={(e) => handleQuantityChange(currentQuantity + 1, e)}
                    disabled={isLoading || !canIncreaseCurrentSelection}
                    className="text-stone-500 hover:text-stone-800 transition-colors disabled:opacity-40"
                    aria-label="增加"
                  >
                    <i className="fas fa-plus text-sm"></i>
                  </button>
                </div>
                <button
                  onClick={handleAddToCart}
                  disabled={isLoading || !canIncreaseCurrentSelection}
                  className="flex-1 h-12 bg-[#1c1917] text-white rounded-full font-bold hover:bg-primary transition-colors flex items-center justify-center gap-2 shadow-lg hover:shadow-orange-500/30 disabled:opacity-50"
                  aria-label="加入购物车"
                >
                  <i className="fas fa-shopping-bag text-base"></i>
                  加入购物车
                </button>
              </div>
            ) : showQuantityControl ? (
              <div className="flex-1 h-12 flex items-center justify-center">
                <div className="h-12 flex items-center border border-stone-200 rounded-full px-3 gap-3">
                  <button
                    onClick={(e) => handleQuantityChange(currentQuantity - 1, e)}
                    disabled={isLoading}
                    className="text-stone-500 hover:text-stone-800 transition-colors disabled:opacity-40"
                    aria-label="减少"
                  >
                    <i className="fas fa-minus text-sm"></i>
                  </button>
                  <span className="font-bold min-w-[20px] text-center">{currentQuantity}</span>
                  <button
                    onClick={(e) => handleQuantityChange(currentQuantity + 1, e)}
                    disabled={isLoading || (!isNonSellable && currentQuantity >= currentStock)}
                    className="text-stone-500 hover:text-stone-800 transition-colors disabled:opacity-40"
                    aria-label="增加"
                  >
                    <i className="fas fa-plus text-sm"></i>
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={handleAddToCart}
                disabled={isLoading}
                className="flex-1 h-12 bg-[#1c1917] text-white rounded-full font-bold hover:bg-primary transition-colors flex items-center justify-center gap-2 shadow-lg hover:shadow-orange-500/30 disabled:opacity-50"
                aria-label="加入购物车"
              >
                <i className="fas fa-shopping-bag text-base"></i>
                加入购物车
              </button>
            )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="w-full h-full relative"
      // 使用 key 确保背景色变化时也是平滑的或者直接切换
      style={{ backgroundColor: bgColor }}
    >
      {/* ============ 全屏沉浸式背景 ============ */}
      <div className="absolute inset-0 z-0">
        <RetryImage
          // 这里的 Key 加上是双保险，确保切商品时图片组件一定重置
          key={imageSrc}
          src={imageSrc}
          alt={product.name}
          className={`w-full h-full object-contain object-[center_38%] ${
            (isOutOfStock || isDown) ? 'filter grayscale opacity-75' : ''
          }`}
          maxRetries={3}
          onFinalError={() => setImageError(true)}
        />
        {/* 底部渐变遮罩 */}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent"></div>
      </div>

      {/* ============ 顶部操作栏 ============ */}
      <div className="absolute top-0 left-0 right-0 z-20 px-5 pt-12 pb-6 flex justify-between items-center bg-gradient-to-b from-black/50 to-transparent">
        <button 
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={handleMobileClosePress}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-black/30 backdrop-blur-md border border-white/20 text-white hover:bg-black/50 active:scale-95 transition-all"
          aria-label="关闭"
        >
          <i className="fas fa-arrow-left text-base"></i>
        </button>

        {/* 折扣角标 */}
        <div className="flex items-center gap-2">
          {hasDiscount && (
            <span className="px-3 py-1 bg-primary/90 backdrop-blur-md text-white text-xs font-bold rounded-full">
              {discountZhe}折
            </span>
          )}
        </div>
      </div>

      {/* ============ 缺货/下架浮层 ============ */}
      {(isOutOfStock || isDown) && (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          {isDown ? (
            <div className="bg-gray-800/90 text-white px-6 py-3 rounded-2xl text-sm font-medium border border-white/20 backdrop-blur-md">
              暂时下架
            </div>
          ) : (
            <div className="bg-red-600/90 text-white px-6 py-3 rounded-2xl text-sm font-medium border border-white/20 backdrop-blur-md">
              缺货
            </div>
          )}
        </div>
      )}

      {/* ============ 底部内容叠加层 ============ */}
      <div className="absolute bottom-0 left-0 right-0 z-20 px-6 pb-10 text-white">
        
        {/* 标签行 */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {requiresReservation && (
            <span className="px-3 py-1 bg-blue-500/80 backdrop-blur-md border border-blue-400/30 rounded-full text-xs font-semibold flex items-center gap-1">
              <i className="fas fa-clock text-[10px]"></i>
              预约商品
            </span>
          )}
          {isVariant && (
            <span className="px-3 py-1 bg-white/10 backdrop-blur-md border border-white/20 rounded-full text-xs font-semibold">
              多规格
            </span>
          )}
        </div>

        {/* 商品名称 & 热销标签 */}
        <div className="mb-2 flex items-center gap-3">
          <h2 className="text-3xl font-extrabold leading-tight tracking-tight font-display">
            {product.name}
          </h2>
          {Boolean(product.is_hot) && (
            <span className="flex-shrink-0 px-2.5 py-1 border border-orange-500/40 bg-orange-500/10 text-orange-500 text-[10px] font-bold rounded-full transform translate-y-1 opacity-80">
              🔥 热销
            </span>
          )}
        </div>

        {/* 商品描述 */}
        {product.description && (
          <p className="text-gray-300 text-sm mb-4 leading-relaxed max-w-[90%] line-clamp-3">
            {product.description}
          </p>
        )}

        {/* 预约信息 */}
        {requiresReservation && (
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-black/40 backdrop-blur rounded border border-white/10">
              <i className="fas fa-clock text-xs text-blue-400"></i>
              <span className="text-xs font-medium">{formatReservationCutoff(reservationCutoff)}</span>
            </div>
            {reservationNote && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-black/40 backdrop-blur rounded border border-white/10">
                <span className="text-xs font-medium">{reservationNote}</span>
              </div>
            )}
          </div>
        )}

        {/* 规格选择（如果有多规格） */}
        {isVariant && product.variants && product.variants.length > 0 && (
          <div className="mb-5">
            <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-2">选择规格</p>
            <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto no-scrollbar py-1 pr-1">
              {product.variants
                .sort((a, b) => (b.stock || 0) - (a.stock || 0))
                .map((variant) => {
                  const isVariantOutOfStock = isNonSellable ? false : (variant.stock === 0);
                  const isSelected = selectedVariant === variant.id;
                  return (
                    <button
                      key={variant.id}
                      onClick={() => !isVariantOutOfStock && setSelectedVariant(variant.id)}
                      disabled={isVariantOutOfStock}
                      className={`px-4 py-2 rounded-full text-xs font-medium transition-all duration-200 border ${
                        isVariantOutOfStock
                          ? 'bg-white/5 text-gray-500 border-white/10 cursor-not-allowed line-through'
                          : isSelected
                            ? 'bg-primary text-white border-primary ring-1 ring-inset ring-primary/90'
                            : 'bg-black/40 text-white border-white/20 hover:border-white/40 backdrop-blur'
                      }`}
                    >
                      {variant.name}
                      {!isNonSellable && (
                        <span className={`ml-1.5 text-[10px] ${
                          isVariantOutOfStock ? 'text-gray-500' : isSelected ? 'text-white/70' : 'text-gray-400'
                        }`}>
                          {isVariantOutOfStock ? '售罄' : `库存${variant.stock}`}
                        </span>
                      )}
                    </button>
                  );
                })}
            </div>
          </div>
        )}

        {/* ============ 底部操作栏 ============ */}
        <div className="flex items-center justify-between">
          {/* 价格 */}
          <div className="flex flex-col">
            <span className="text-xs text-gray-400 uppercase tracking-widest">价格</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">¥{formatPriceDisplay(finalPrice)}</span>
              {hasDiscount && (
                <span className="text-sm text-gray-400 line-through">¥{product.price}</span>
              )}
            </div>
          </div>

          {/* 操作按钮 */}
          {!user ? (
            <button
              disabled
              className="h-12 bg-white/20 backdrop-blur-md text-white/60 pl-5 pr-3 rounded-full flex items-center gap-3 cursor-not-allowed border border-white/10"
            >
              <span className="font-bold text-sm">请先登录</span>
              <div className="bg-white/20 w-8 h-8 rounded-full flex items-center justify-center">
                <i className="fas fa-lock text-sm"></i>
              </div>
            </button>
          ) : (isOutOfStock || isDown) ? (
            <button
              disabled
              className={`h-12 pl-5 pr-3 rounded-full flex items-center gap-3 cursor-not-allowed border ${
                isDown 
                  ? 'bg-gray-600/60 text-gray-300 border-gray-500/30' 
                  : 'bg-red-600/60 text-red-200 border-red-500/30'
              }`}
            >
              <span className="font-bold text-sm">{isDown ? '暂时下架' : '缺货'}</span>
              <div className="bg-white/20 w-8 h-8 rounded-full flex items-center justify-center">
                <i className={`fas ${isDown ? 'fa-pause' : 'fa-exclamation-triangle'} text-sm`}></i>
              </div>
            </button>
          ) : isVariant && !selectedVariant ? (
            <div className="text-sm text-gray-400 font-medium flex items-center gap-1">
              <i className="fas fa-hand-pointer text-xs"></i>
              请选择规格
            </div>
          ) : showVariantQuantityControl ? (
            <div className="flex items-center gap-3">
              <div className="h-12 px-1.5 flex items-center gap-2 bg-black/40 backdrop-blur-md rounded-full border border-white/20">
                <button
                  onClick={(e) => handleQuantityChange(currentQuantity - 1, e)}
                  disabled={isLoading}
                  className="w-9 h-9 flex items-center justify-center rounded-full text-white hover:bg-white/20 transition-colors disabled:opacity-50"
                  aria-label="减少"
                >
                  <i className="fas fa-minus text-sm"></i>
                </button>
                <span className="w-6 text-center font-bold text-white text-sm">{currentQuantity}</span>
                <button
                  onClick={(e) => handleQuantityChange(currentQuantity + 1, e)}
                  disabled={isLoading || !canIncreaseCurrentSelection}
                  className="w-9 h-9 flex items-center justify-center rounded-full text-white hover:bg-white/20 transition-colors disabled:opacity-50"
                  aria-label="增加"
                >
                  <i className="fas fa-plus text-sm"></i>
                </button>
              </div>
              <button
                onClick={handleAddToCart}
                disabled={isLoading || !canIncreaseCurrentSelection}
                className={`${
                  requiresReservation 
                    ? 'bg-blue-500 hover:bg-blue-600 shadow-blue-500/30' 
                    : 'bg-primary hover:bg-orange-600 shadow-primary/30'
                } h-12 text-white pl-6 pr-2 rounded-full flex items-center gap-3 transition-all shadow-lg active:scale-95 duration-200 disabled:opacity-50`}
                aria-label="加入购物车"
              >
                <span className="font-bold text-sm">加入购物车</span>
                <div className={`${
                  requiresReservation ? 'bg-blue-600' : 'bg-white text-primary'
                } w-8 h-8 rounded-full flex items-center justify-center`}>
                  <i className={`fas fa-plus text-sm ${requiresReservation ? 'text-white' : ''}`}></i>
                </div>
              </button>
            </div>
          ) : showQuantityControl ? (
            <div className="h-12 flex items-center gap-3">
              <div className="h-12 px-1.5 flex items-center gap-2 bg-black/40 backdrop-blur-md rounded-full border border-white/20">
                <button
                  onClick={(e) => handleQuantityChange(currentQuantity - 1, e)}
                  disabled={isLoading}
                  className="w-9 h-9 flex items-center justify-center rounded-full text-white hover:bg-white/20 transition-colors disabled:opacity-50"
                  aria-label="减少"
                >
                  <i className="fas fa-minus text-sm"></i>
                </button>
                <span className="w-6 text-center font-bold text-white text-sm">{currentQuantity}</span>
                <button
                  onClick={(e) => handleQuantityChange(currentQuantity + 1, e)}
                  disabled={isLoading || (!isNonSellable && currentQuantity >= currentStock)}
                  className="w-9 h-9 flex items-center justify-center rounded-full text-white hover:bg-white/20 transition-colors disabled:opacity-50"
                  aria-label="增加"
                >
                  <i className="fas fa-plus text-sm"></i>
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={handleAddToCart}
              disabled={isLoading}
              className={`${
                requiresReservation 
                  ? 'bg-blue-500 hover:bg-blue-600 shadow-blue-500/30' 
                  : 'bg-primary hover:bg-orange-600 shadow-primary/30'
              } h-12 text-white pl-6 pr-2 rounded-full flex items-center gap-3 transition-all shadow-lg active:scale-95 duration-200 disabled:opacity-50`}
              aria-label="加入购物车"
            >
              <span className="font-bold text-sm">加入购物车</span>
              <div className={`${
                requiresReservation ? 'bg-blue-600' : 'bg-white text-primary'
              } w-8 h-8 rounded-full flex items-center justify-center`}>
                <i className={`fas fa-plus text-sm ${requiresReservation ? 'text-white' : ''}`}></i>
              </div>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProductDetailSlide;
