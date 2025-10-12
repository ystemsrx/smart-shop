import React, { useState, useEffect } from 'react';
import RetryImage from './RetryImage';
import { getProductImage } from '../utils/urls';

// 格式化预约截止时间显示
const formatReservationCutoff = (cutoffTime) => {
  if (!cutoffTime) return '需提前预约';
  
  const now = new Date();
  const [hours, minutes] = cutoffTime.split(':').map(Number);
  
  const todayCutoff = new Date();
  todayCutoff.setHours(hours, minutes, 0, 0);
  
  if (now > todayCutoff) {
    return `明日 ${cutoffTime} 后配送`;
  }
  
  return `今日 ${cutoffTime} 后配送`;
};

/**
 * 商品详情弹窗组件
 * @param {Object} props
 * @param {Object} props.product - 商品信息
 * @param {boolean} props.isOpen - 是否显示弹窗
 * @param {Function} props.onClose - 关闭弹窗回调
 * @param {Function} props.onAddToCart - 加入购物车回调 (productId, variantId)
 * @param {Function} props.onUpdateQuantity - 更新数量回调 (productId, newQuantity, variantId)
 * @param {Object} props.cartItemsMap - 购物车商品数量映射 {productId: quantity, "productId@@variantId": quantity}
 * @param {Function} props.onStartFly - 飞入动画回调 (element)
 * @param {boolean} props.isLoading - 是否加载中
 * @param {Object} props.user - 用户信息
 */
const ProductDetailModal = ({
  product,
  isOpen,
  onClose,
  onAddToCart,
  onUpdateQuantity,
  cartItemsMap = {},
  onStartFly,
  isLoading = false,
  user
}) => {
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [imageError, setImageError] = useState(false);

  // 重置选中的规格当商品变化时
  useEffect(() => {
    if (product?.has_variants && product?.variants?.length > 0) {
      // 默认选择第一个有库存的规格
      const firstAvailable = product.variants.find(v => v.stock > 0);
      setSelectedVariant(firstAvailable?.id || null);
    } else {
      setSelectedVariant(null);
    }
    setImageError(false);
  }, [product?.id]);

  // 阻止背景滚动
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen || !product) return null;

  // 计算商品信息
  const isVariant = !!product.has_variants;
  const isDown = product.is_active === 0 || product.is_active === false;
  const isOutOfStock = isVariant 
    ? ((product.total_variant_stock || 0) === 0) 
    : (product.stock === 0);
  
  const imageSrc = getProductImage(product);
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
    const key = variantId ? `${product.id}@@${variantId}` : `${product.id}`;
    return cartItemsMap[key] || 0;
  };

  // 获取当前选中规格的库存
  const getCurrentStock = () => {
    if (!isVariant) return product.stock;
    if (!selectedVariant) return 0;
    const variant = product.variants?.find(v => v.id === selectedVariant);
    return variant?.stock || 0;
  };

  // 处理加入购物车
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

    onStartFly && onStartFly(e.currentTarget);
    onAddToCart(product.id, isVariant ? selectedVariant : null);
  };

  // 处理数量变化
  const handleQuantityChange = (newQuantity, e) => {
    if (!user) return;
    
    if (e && newQuantity > getCartQuantity(isVariant ? selectedVariant : null)) {
      onStartFly && onStartFly(e.currentTarget);
    }
    
    onUpdateQuantity(product.id, newQuantity, isVariant ? selectedVariant : null);
  };

  const currentQuantity = getCartQuantity(isVariant ? selectedVariant : null);
  const currentStock = getCurrentStock();
  const isInCart = currentQuantity > 0;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 opacity-0 animate-apple-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      {/* 外层容器 - 用于放置关闭按钮，不受弹窗圆角影响 */}
      <div className="relative w-full max-w-4xl">
        {/* 关闭按钮 - 1/4在弹窗内，3/4在弹窗外 */}
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 z-50 w-12 h-12 flex items-center justify-center rounded-full bg-white text-gray-600 hover:text-gray-900 shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:scale-110 hover:rotate-90"
          aria-label="关闭"
        >
          <i className="fas fa-times text-xl"></i>
        </button>

        {/* 弹窗主体 */}
        <div className="relative w-full max-h-[65vh] sm:max-h-[70vh] lg:max-h-[75vh] overflow-y-auto overflow-x-hidden custom-scrollbar bg-white rounded-3xl shadow-2xl opacity-0 animate-apple-scale-in">
          {/* 内容区域 - 响应式布局 */}
          <div className="flex flex-col lg:flex-row">
          {/* 左侧/上方：商品图片 */}
          <div className="relative lg:w-1/2 bg-gradient-to-br from-gray-50 to-gray-100">
            {/* 正方形容器 */}
            <div className="relative aspect-square w-full overflow-hidden">
              {/* 折扣角标 */}
              {hasDiscount && (
                <div className="absolute left-4 top-4 z-20">
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-br from-red-500 to-pink-600 rounded-xl blur opacity-30"></div>
                    <div className="relative z-10 w-16 h-16 bg-gradient-to-br from-red-500 to-pink-600 rounded-xl flex items-center justify-center shadow-xl transform rotate-12">
                      <div className="text-center">
                        <div className="text-white text-sm font-bold drop-shadow-sm">{discountZhe}折</div>
                        <div className="text-white text-xs font-medium drop-shadow-sm">特惠</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 热销标签 - 在图片内部右上角，关闭按钮左侧 */}
              {Boolean(product.is_hot) && (
                <div className="absolute right-4 top-4 z-20">
                  <span className="inline-flex items-center gap-1 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-orange-500 to-red-500 rounded-full shadow-lg">
                    <i className="fas fa-fire"></i>
                    热销中
                  </span>
                </div>
              )}

              {/* 商品图片 */}
              {imageSrc && !imageError ? (
                <RetryImage
                  src={imageSrc}
                  alt={product.name}
                  className={`h-full w-full object-cover object-center ${
                    (isOutOfStock || isDown) ? 'filter grayscale opacity-75' : ''
                  }`}
                  maxRetries={3}
                  onFinalError={() => setImageError(true)}
                />
              ) : (
                <div className="h-full w-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                  <div className="text-center">
                    <i className="fas fa-image text-gray-400 text-6xl mb-4"></i>
                    <span className="text-gray-400 text-lg">暂无图片</span>
                  </div>
                </div>
              )}

              {/* 缺货/下架遮罩 */}
              {(isOutOfStock || isDown) && (
                <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center">
                  {isDown ? (
                    <div className="bg-gray-800/90 text-white px-6 py-3 rounded-2xl text-base font-medium backdrop-blur-sm border border-white/20">
                      <i className="fas fa-pause mr-2"></i>暂时下架
                    </div>
                  ) : (
                    <div className="bg-red-600/90 text-white px-6 py-3 rounded-2xl text-base font-medium backdrop-blur-sm border border-white/20">
                      <i className="fas fa-exclamation-triangle mr-2"></i>缺货
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 右侧/下方：商品信息 */}
          <div className="lg:w-1/2 p-6 lg:p-8 flex flex-col min-w-0">
            {/* 商品标题和分类 */}
            <div className="mb-6">
              {/* 桌面端：左侧标题+标签，右侧价格；移动端：堆叠布局 */}
              <div className="flex flex-col lg:flex-row lg:items-stretch lg:justify-between lg:gap-6">
                {/* 左侧：标题和标签 */}
                <div className="flex flex-col justify-between flex-1 min-w-0">
                  {/* 商品标题 */}
                  <h2 className={`text-2xl lg:text-2xl font-bold leading-tight break-words mb-3 ${
                    (isOutOfStock || isDown) ? 'text-gray-500' : 'text-gray-900'
                  }`}>
                    {product.name}
                  </h2>
                  
                  {/* 分类标签 */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${
                      (isOutOfStock || isDown) 
                        ? 'bg-gray-100 text-gray-500 border border-gray-200' 
                        : 'bg-gradient-to-r from-blue-50 to-cyan-50 text-blue-700 border border-blue-200/50'
                    }`}>
                      <i className="fas fa-tag"></i>
                      <span className="break-all">{product.category}</span>
                    </span>
                    
                    {requiresReservation && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold bg-gradient-to-r from-cyan-50 to-blue-50 text-blue-700 border border-blue-200/50">
                        <i className="fas fa-calendar-check"></i>
                        预约商品
                      </span>
                    )}
                  </div>
                </div>
                
                {/* 右侧：价格区域 - 桌面端垂直居中，移动端顶部显示 */}
                <div className="mt-3 lg:mt-0 lg:flex-shrink-0 lg:flex lg:items-center">
                  <div className="inline-flex flex-col items-start lg:items-end justify-center gap-1">
                    <div className="flex items-baseline gap-2">
                      <span className={`text-3xl lg:text-4xl font-black leading-none ${
                        (isOutOfStock || isDown) ? 'text-gray-500' : 'text-orange-600'
                      }`}>
                        ¥{finalPrice}
                      </span>
                    </div>
                    {hasDiscount && (
                      <span className="text-base lg:text-sm text-gray-400 line-through">¥{product.price}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 库存和预约信息同行 */}
            {!isDown && (
              <div className="mb-6 flex items-center justify-between gap-2 flex-wrap">
                {/* 左侧：库存信息 */}
                <div className="flex items-center gap-2 min-w-0">
                  <i className={`fas fa-box-open flex-shrink-0 ${
                    isOutOfStock ? 'text-red-500' : 'text-green-600'
                  }`}></i>
                  <span className={`text-sm font-medium ${
                    isOutOfStock ? 'text-red-500' : 'text-gray-700'
                  }`}>
                    {isVariant 
                      ? (product.total_variant_stock !== undefined 
                          ? `总库存 ${product.total_variant_stock}` 
                          : '多规格商品') 
                      : `库存 ${product.stock}`}
                  </span>
                </div>
                
                {/* 右侧：预约信息（仅在需要预约时显示） */}
                {requiresReservation && (
                  <div className="flex items-center gap-2 text-sm font-medium text-blue-600 min-w-0">
                    <i className="fas fa-calendar-check flex-shrink-0"></i>
                    <span className="break-words">{formatReservationCutoff(reservationCutoff)}</span>
                  </div>
                )}
              </div>
            )}

            {/* 预约说明（如果有额外说明文字） */}
            {requiresReservation && reservationNote && (
              <div className="mb-6 -mt-4 text-sm text-blue-600 text-right break-words">
                {reservationNote}
              </div>
            )}

            {/* 商品描述 */}
            {product.description && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  商品描述
                </h3>
                <p className={`text-base leading-relaxed break-words ${
                  (isOutOfStock || isDown) ? 'text-gray-400' : 'text-gray-700'
                }`}>
                  {product.description}
                </p>
              </div>
            )}

            {/* 规格选择 */}
            {isVariant && product.variants && product.variants.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                  <i className="fas fa-list-ul mr-2 text-gray-500"></i>
                  选择规格
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {product.variants
                    .sort((a, b) => (b.stock || 0) - (a.stock || 0))
                    .map((variant) => {
                      const isSelected = selectedVariant === variant.id;
                      const isUnavailable = variant.stock === 0;
                      
                      return (
                        <button
                          key={variant.id}
                          onClick={() => !isUnavailable && setSelectedVariant(variant.id)}
                          disabled={isUnavailable}
                          className={`relative p-3 rounded-xl border-2 text-left transition-all duration-200 min-w-0 ${
                            isUnavailable
                              ? 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-60'
                              : isSelected
                              ? 'border-blue-500 bg-blue-50 shadow-md'
                              : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                          }`}
                        >
                          <div className="text-sm font-medium text-gray-900 mb-1 break-words pr-6">
                            {variant.name}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <i className={`fas fa-box-open text-xs flex-shrink-0 ${
                              variant.stock > 0 ? 'text-green-600' : 'text-red-500'
                            }`}></i>
                            <span className="text-xs text-gray-600">
                              库存 {variant.stock}
                            </span>
                          </div>
                          {isSelected && !isUnavailable && (
                            <div className="absolute top-2 right-2 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                              <i className="fas fa-check text-white text-xs"></i>
                            </div>
                          )}
                          {isUnavailable && (
                            <div className="absolute inset-0 flex items-center justify-center bg-white/80 rounded-xl">
                              <span className="text-xs text-red-500 font-semibold">已售罄</span>
                            </div>
                          )}
                        </button>
                      );
                    })}
                </div>
              </div>
            )}

            {/* 操作按钮区域 */}
            <div className="mt-auto pt-6 border-t border-gray-200">
              {!user ? (
                <button
                  disabled
                  className="w-full py-3 sm:py-4 rounded-xl bg-gray-300 text-gray-600 font-semibold text-base sm:text-lg cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <i className="fas fa-sign-in-alt flex-shrink-0"></i>
                  <span>请先登录</span>
                </button>
              ) : (isOutOfStock || isDown) ? (
                <button
                  disabled
                  className={`w-full py-3 sm:py-4 rounded-xl font-semibold text-base sm:text-lg cursor-not-allowed flex items-center justify-center gap-2 ${
                    isDown 
                      ? 'bg-gray-200 text-gray-600 border-2 border-gray-300' 
                      : 'bg-red-100 text-red-600 border-2 border-red-200'
                  }`}
                >
                  <i className={`flex-shrink-0 ${isDown ? 'fas fa-pause' : 'fas fa-exclamation-triangle'}`}></i>
                  <span>{isDown ? '暂时下架' : '缺货'}</span>
                </button>
              ) : isVariant && !selectedVariant ? (
                <button
                  disabled
                  className="w-full py-3 sm:py-4 rounded-xl bg-gray-200 text-gray-600 font-semibold text-base sm:text-lg cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <i className="fas fa-hand-pointer flex-shrink-0"></i>
                  <span>请选择规格</span>
                </button>
              ) : isInCart ? (
                <div className="flex items-center justify-center gap-3 sm:gap-4">
                  <button
                    onClick={(e) => handleQuantityChange(currentQuantity - 1, e)}
                    disabled={isLoading}
                    className="w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm hover:shadow-md flex-shrink-0"
                    aria-label="减少"
                  >
                    <i className="fas fa-minus text-base sm:text-lg"></i>
                  </button>
                  <div className="px-4 sm:px-6 py-2 sm:py-3 bg-gray-50 rounded-xl min-w-[60px] sm:min-w-[80px] text-center">
                    <span className="text-xl sm:text-2xl font-bold text-gray-900">{currentQuantity}</span>
                  </div>
                  <button
                    onClick={(e) => handleQuantityChange(currentQuantity + 1, e)}
                    disabled={isLoading || currentQuantity >= currentStock}
                    className={`w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center ${
                      requiresReservation 
                        ? 'bg-gradient-to-br from-cyan-400 to-blue-500 hover:from-cyan-500 hover:to-blue-600' 
                        : 'bg-gradient-to-br from-orange-500 to-pink-600 hover:from-pink-600 hover:to-purple-500'
                    } text-white rounded-full disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105 flex-shrink-0`}
                    aria-label="增加"
                  >
                    <i className="fas fa-plus text-base sm:text-lg"></i>
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleAddToCart}
                  disabled={isLoading}
                  className={`w-full py-3 sm:py-4 rounded-xl font-bold text-base sm:text-lg shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2 ${
                    requiresReservation
                      ? 'bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-500 hover:to-blue-600 text-white'
                      : 'bg-gradient-to-r from-orange-500 to-pink-600 hover:from-pink-600 hover:to-purple-500 text-white'
                  }`}
                >
                  <i className="fas fa-cart-plus flex-shrink-0"></i>
                  <span>加入购物车</span>
                </button>
              )}
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
};

export default ProductDetailModal;

