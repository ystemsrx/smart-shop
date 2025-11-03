import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useAuth, useCart, useApi, useUserAgentStatus } from '../hooks/useAuth';
import { useProducts } from '../hooks/useAuth';
import { useLocation } from '../hooks/useLocation';
import { useRouter } from 'next/router';
import Nav from '../components/Nav';
import AnimatedPrice from '../components/AnimatedPrice';
import RetryImage from '../components/RetryImage';
import SimpleMarkdown from '../components/SimpleMarkdown';
import { getProductImage } from '../utils/urls';
import { getShopName } from '../utils/runtimeConfig';

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

const createDefaultValidation = () => ({
  is_valid: true,
  reason: null,
  message: '',
  should_force_reselect: false,
});

const createMissingValidation = () => ({
  is_valid: false,
  reason: 'missing_address',
  message: '请选择配送地址',
  should_force_reselect: true,
});

// 购物车商品项组件
const CartItem = ({ item, onUpdateQuantity, onRemove }) => {
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
  const isStockLimitReached = normalizedStock !== null && normalizedStock > 0 && item.quantity >= normalizedStock;

  const handleQuantityChange = (newQuantity) => {
    if (newQuantity < 1) {
      onUpdateQuantity(item.product_id, 0, item.variant_id || null);
      return;
    }
    // 检查库存限制
    if (!isNonSellable && normalizedStock !== null && newQuantity > normalizedStock) {
      return;
    }
    onUpdateQuantity(item.product_id, newQuantity, item.variant_id || null);
  };

  return (
    <div className={`group bg-white rounded-2xl shadow-sm border border-slate-200/60 p-5 mb-4 transition-all duration-300 hover:shadow-lg hover:border-slate-300/80 ${isDown ? 'opacity-60 grayscale' : ''}`}>
      <div className="flex items-start gap-4">
        {/* 商品图片 */}
        <div className="flex-shrink-0 w-24 h-24 bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl overflow-hidden shadow-inner border border-slate-200/50 transition-transform duration-300 group-hover:scale-105">
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
            <div className="h-full w-full flex items-center justify-center">
              <span className="text-slate-400 text-xs">暂无图片</span>
            </div>
          )}
        </div>
        
        {/* 商品信息 */}
        <div className="flex-1 min-w-0">
          {/* 商品名和标识同行显示 */}
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <h3 className={`text-base font-semibold leading-tight ${isDown ? 'text-slate-500' : 'text-slate-900'}`}>
              {item.name}
            </h3>
            {item.variant_name && (
              <span className="text-xs px-2.5 py-1 bg-gradient-to-r from-cyan-50 to-teal-50 text-cyan-700 rounded-full border border-cyan-200/50 font-medium flex-shrink-0">
                {item.variant_name}
              </span>
            )}
            {item.reservation_required && (
              <span className="text-xs px-2.5 py-1 bg-gradient-to-r from-blue-50 to-sky-50 text-blue-700 rounded-full border border-blue-200/50 font-medium flex-shrink-0">
                预约
              </span>
            )}
            {isNonSellable && (
              <span className="text-xs px-2.5 py-1 bg-gradient-to-r from-purple-50 to-violet-50 text-purple-600 rounded-full border border-purple-200/60 font-medium flex-shrink-0">
                非卖品
              </span>
            )}
            {isDown && (
              <span className="text-xs px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full border border-slate-200 flex-shrink-0">
                暂时下架
              </span>
            )}
          </div>

          <div className="text-sm text-slate-600 font-medium">
            单价 <span className="text-slate-800">¥{item.unit_price}</span>
            {(isDown || isNonSellable) && (
              <span className="ml-2 text-xs text-slate-400">（不计入金额）</span>
            )}
            {!isDown && !isNonSellable && normalizedStock !== null && normalizedStock > 0 && (
              <span className="ml-2 text-xs text-slate-500">库存 {normalizedStock}</span>
            )}
            {isNonSellable && (
              <span className="ml-2 text-xs text-purple-600">库存 ∞</span>
            )}
          </div>
        </div>

        {/* 右侧操作区 */}
        <div className="flex flex-col items-end gap-3">
          {/* 小计 */}
          <div className="text-right">
            <div className="text-xl font-bold text-emerald-600">¥{item.subtotal}</div>
            {isNonSellable && (
              <div className="text-[11px] text-purple-500">非卖品免计价</div>
            )}
          </div>
          
          {/* 数量控制 */}
          <div className="flex items-center rounded-xl border border-slate-200 overflow-hidden shadow-sm bg-white">
            <button
              onClick={() => handleQuantityChange(item.quantity - 1)}
              disabled={isDown}
              className="w-9 h-9 flex items-center justify-center text-slate-600 hover:bg-gradient-to-r hover:from-rose-50 hover:to-pink-50 hover:text-rose-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              <i className="fas fa-minus text-xs"></i>
            </button>
            <span className="w-12 h-9 flex items-center justify-center text-sm font-semibold bg-slate-50 border-x border-slate-200">{item.quantity}</span>
            <button
              onClick={() => handleQuantityChange(item.quantity + 1)}
              disabled={isDown || isStockLimitReached}
              className="w-9 h-9 flex items-center justify-center text-slate-600 hover:bg-gradient-to-r hover:from-emerald-50 hover:to-teal-50 hover:text-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              title={isStockLimitReached ? '已达库存上限' : ''}
            >
              <i className="fas fa-plus text-xs"></i>
            </button>
          </div>
        </div>
      </div>
      
      {/* 底部：预约说明和移除按钮 */}
      <div className="flex items-center gap-3 mt-3">
        {item.reservation_required && (
          <div className="text-xs text-sky-700 border border-sky-200/50 bg-gradient-to-r from-sky-50 to-blue-50 rounded-full px-4 py-2 leading-snug inline-flex items-center gap-1.5">
            <i className="fas fa-calendar-check text-sky-600"></i>
            <span className="font-semibold">{formatReservationCutoff(item.reservation_cutoff)}</span>
            {item.reservation_note && (
              <>
                <span className="text-sky-400 mx-1">·</span>
                <span className="text-sky-600">{item.reservation_note}</span>
              </>
            )}
          </div>
        )}
        
        <div className="flex-1"></div>
        
        {/* 移除按钮 */}
        <button
          onClick={() => onRemove(item.product_id, item.variant_id || null)}
          className="text-sm text-slate-500 hover:text-rose-600 transition-colors duration-200 font-medium whitespace-nowrap"
        >
          <i className="fas fa-trash-alt mr-1"></i>移除
        </button>
      </div>
    </div>
  );
};

// 订单摘要组件
const OrderSummary = ({
  cart,
  onCheckout,
  isClosed,
  reservationAllowed = false,
  shouldReserve = false,
  reservationFromClosure = false,
  hasReservationItems = false,
  allReservationItems = false,
  coupons = [],
  selectedCouponId,
  setSelectedCouponId,
  applyCoupon,
  setApplyCoupon,
  addressValidation = createDefaultValidation(),
  onFixAddress,
  locationReady = true,
  lotteryThreshold = 10,
  lotteryEnabled = true,
  deliveryConfig = { free_delivery_threshold: 10 }
}) => {
  const selected = coupons.find(c => c.id === selectedCouponId);
  const discount = (applyCoupon && selected) ? (parseFloat(selected.amount) || 0) : 0;
  const base = (cart?.payable_total ?? cart.total_price) || 0;
  const total = Math.max(0, base - discount);
  const validLotteryThreshold = Number.isFinite(lotteryThreshold) && lotteryThreshold > 0 ? lotteryThreshold : 10;
  const shippingThreshold = deliveryConfig?.free_delivery_threshold || 10;
  // 只要基础配送费或免配送费门槛任意一个为0，就是免运费
  const isFreeShipping = (deliveryConfig?.delivery_fee === 0 || deliveryConfig?.free_delivery_threshold === 0);
  const needsShipping = cart.total_quantity > 0 && cart.total_price < shippingThreshold && (deliveryConfig?.delivery_fee > 0) && !isFreeShipping;
  const needsLottery = lotteryEnabled && cart.total_quantity > 0 && cart.total_price < validLotteryThreshold;
  const missingShipping = needsShipping ? Math.max(0, shippingThreshold - cart.total_price) : 0;
  const missingLottery = needsLottery ? Math.max(0, validLotteryThreshold - cart.total_price) : 0;
  const sameTarget = needsShipping && needsLottery && Math.abs(missingShipping - missingLottery) < 0.0001;
  const addressInvalid = locationReady && addressValidation && addressValidation.is_valid === false;
  const addressAlertMessage = addressInvalid
    ? (addressValidation.message || '配送地址不可用，请重新选择')
    : '';
  const closedReservationOnly = isClosed && allReservationItems && ((cart?.total_quantity || 0) > 0);
  // 打烊逻辑：开启预约时允许所有商品，未开启时仅允许预约商品
  const closedBlocked = isClosed && !reservationAllowed && !allReservationItems;
  const checkoutDisabled = cart.total_quantity === 0 || closedBlocked || !locationReady || addressInvalid;
  const buttonLabel = (() => {
    if (!locationReady) return '请选择配送地址';
    if (addressInvalid) return addressAlertMessage || '配送地址不可用，请重新选择';
    if (closedBlocked) {
      return '打烊中 · 仅限预约商品';
    }
    if (closedReservationOnly) return '预约购买';
    if (isClosed && reservationAllowed) return '预约购买';
    if (hasReservationItems && shouldReserve) return '提交预约';
    return '去结算';
  })();
  return (
    <div className="bg-white rounded-2xl shadow-lg border border-slate-200/60 p-6 sticky top-24 transition-all duration-300 hover:shadow-xl">
      <h3 className="text-xl font-bold text-slate-900 mb-6 pb-3 border-b border-slate-100 flex items-center gap-2">
        <i className="fas fa-receipt text-emerald-500"></i>
        订单摘要
      </h3>
      
      <div className="space-y-3 mb-6">
        <div className="flex justify-between items-center p-3 rounded-lg bg-slate-50/50 hover:bg-slate-100/50 transition-colors duration-200">
          <span className="text-slate-600 flex items-center gap-2">
            <i className="fas fa-cube text-slate-400 text-sm"></i>
            商品数量
          </span>
          <span className="text-slate-900 font-semibold">{cart.total_quantity} 件</span>
        </div>
        <div className="flex justify-between items-center p-3 rounded-lg bg-slate-50/50 hover:bg-slate-100/50 transition-colors duration-200">
          <span className="text-slate-600 flex items-center gap-2">
            <i className="fas fa-tags text-slate-400 text-sm"></i>
            商品金额
          </span>
          <span className="text-slate-900 font-semibold">
            <AnimatedPrice value={cart.total_price} />
          </span>
        </div>
        <div className="flex justify-between items-center p-3 rounded-lg bg-slate-50/50 hover:bg-slate-100/50 transition-colors duration-200">
          <span className="text-slate-600 flex items-center gap-2">
            <i className="fas fa-truck text-slate-400 text-sm"></i>
            配送费
          </span>
          <span className={`font-semibold ${cart.shipping_fee > 0 ? 'text-slate-900' : 'text-emerald-600'}`}>
            {cart.shipping_fee > 0 ? <AnimatedPrice value={cart.shipping_fee} /> : '免费'}
          </span>
        </div>
        
        {(needsShipping || needsLottery) && (
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/50 rounded-xl p-4 text-sm text-amber-900 shadow-sm">
            <div className="flex items-start gap-2">
              <i className="fas fa-fire text-orange-500 mt-0.5"></i>
              <div className="flex-1">
                <span className="font-medium">还差 </span>
                {sameTarget ? (
                  <>
                    <span className="font-bold text-orange-600">¥{missingShipping.toFixed(2)}</span>
                    <span className="font-semibold text-rose-600"> 免运费和抽奖资格</span>
                  </>
                ) : (
                  <>
                    {needsShipping && (
                      <>
                        <span className="font-bold text-orange-600">¥{missingShipping.toFixed(2)}</span>
                        <span className="font-semibold text-rose-600"> 免运费</span>
                      </>
                    )}
                    {needsShipping && needsLottery && <span className="text-amber-400 mx-1">·</span>}
                    {needsLottery && (
                      <>
                        <span className="font-bold text-orange-600">¥{missingLottery.toFixed(2)}</span>
                        <span className="font-semibold text-rose-600"> 抽奖资格</span>
                      </>
                    )}
                  </>
                )}
                <a href="/shop" className="ml-2 text-emerald-700 font-semibold hover:text-emerald-800 underline decoration-2 underline-offset-2 transition-colors">去凑单</a>
              </div>
            </div>
          </div>
        )}
        {/* 优惠券选择（靠近结算按钮） */}
        <div className="border-t border-slate-200 pt-4 mt-4">
          <div className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-pink-50 to-rose-50 border border-pink-200/50">
            <label className="flex items-center gap-2 text-slate-900 font-semibold cursor-pointer">
              <input
                type="checkbox"
                checked={!!applyCoupon}
                disabled={(() => {
                  const usable = (coupons || []).filter(c => ((cart?.total_price || 0) > ((parseFloat(c.amount) || 0))));
                  return usable.length === 0;
                })()}
                onChange={(e) => {
                  const checked = !!e.target.checked;
                  setApplyCoupon && setApplyCoupon(checked);
                  if (checked && !selectedCouponId && setSelectedCouponId) {
                    // 如果勾选使用优惠券但没有选中券，自动选择最佳券
                    const usable = (coupons || []).filter(c => ((cart?.total_price || 0) > ((parseFloat(c.amount) || 0))));
                    if (usable.length > 0) {
                      usable.sort((a, b) => (parseFloat(b.amount) || 0) - (parseFloat(a.amount) || 0));
                      setSelectedCouponId(usable[0].id);
                    }
                  }
                }}
                className="w-4 h-4 rounded border-pink-300 text-pink-600 focus:ring-pink-500"
              />
              <i className="fas fa-ticket-alt text-pink-600"></i>
              <span>使用优惠券</span>
            </label>
            <span className="text-sm font-bold text-rose-600">
              {applyCoupon && selected ? (
                <span className="inline-flex items-center">
                  <span className="mr-0.5">-</span>
                  <AnimatedPrice value={parseFloat(selected.amount)||0} />
                </span>
              ) : '—'}
            </span>
          </div>
          {/* 简单选择列表（若有多张） */}
          {(() => {
            const usable = (coupons || []).filter(c => ((cart?.total_price || 0) > ((parseFloat(c.amount) || 0))));
            if (usable.length === 0) return null;
            return (
            <div className="mt-3 text-sm">
              <select
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:border-pink-400 focus:ring-2 focus:ring-pink-200 transition-all duration-200"
                value={selectedCouponId || (usable[0]?.id || '')}
                onChange={(e) => setSelectedCouponId && setSelectedCouponId(e.target.value || null)}
              >
                {usable
                  .slice()
                  .sort((a, b) => (parseFloat(b.amount) || 0) - (parseFloat(a.amount) || 0))
                  .map(c => {
                    const amt = parseFloat(c.amount) || 0;
                    return (
                      <option key={c.id} value={c.id}>
                        {`¥${amt.toFixed(2)}${c.expires_at ? ` · 截止 ${new Date(c.expires_at).toLocaleDateString('zh-CN')}` : ' · 永久'}`}
                      </option>
                    );
                  })}
              </select>
            </div>
            );
          })()}
        </div>
        
      <div className="border-t-2 border-slate-200 pt-5 mt-4 bg-gradient-to-r from-slate-50 to-slate-100 -mx-6 px-6 py-4 rounded-b-2xl">
        <div className="flex justify-between items-center mb-1">
          <span className="text-lg font-bold text-slate-700 flex items-center gap-2">
            <i className="fas fa-calculator text-slate-500"></i>
            总计
          </span>
          <div className="text-3xl font-black text-emerald-600 leading-tight">
            <AnimatedPrice value={total} />
          </div>
        </div>
      </div>
    </div>

      {addressInvalid && (
        <div className="mt-4 mb-2 flex items-start gap-3 rounded-xl border border-rose-300/50 bg-gradient-to-r from-rose-50 to-pink-50 px-4 py-3 text-sm text-rose-700 shadow-sm">
          <i className="fas fa-exclamation-triangle mt-0.5 text-rose-500"></i>
          <span className="flex-1 font-medium">{addressAlertMessage}</span>
          {typeof onFixAddress === 'function' && (
            <button
              type="button"
              onClick={onFixAddress}
              className="ml-2 text-rose-600 hover:text-rose-800 font-semibold underline decoration-2 transition-colors"
            >
              重新选择
            </button>
          )}
        </div>
      )}

      {shouldReserve && (
        <div className="mb-4 rounded-xl border border-sky-300/50 bg-gradient-to-r from-sky-50 to-blue-50 px-4 py-3 text-xs text-sky-800 shadow-sm">
          <div className="flex items-center gap-2 font-semibold">
            <i className="fas fa-calendar-day text-sky-600"></i>
            <span>{reservationFromClosure ? '店铺当前打烊，提交后将转换为预约订单。' : '本单包含需预约商品，将以预约方式提交。'}</span>
          </div>
          {hasReservationItems && (
            <div className="mt-2 leading-relaxed text-sky-700">
              请关注预约说明，配送时间将以预约信息为准。
            </div>
          )}
          {isClosed && !reservationAllowed && !allReservationItems && (
            <div className="mt-3 rounded-lg border border-amber-300/50 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 font-medium">
              打烊期间仅支持预约商品，请移除非预约商品后再试。
            </div>
          )}
        </div>
      )}

      <button
        onClick={onCheckout}
        disabled={checkoutDisabled}
        className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white py-4 px-6 rounded-xl font-bold text-lg shadow-lg hover:shadow-xl hover:from-emerald-600 hover:to-teal-700 focus:outline-none focus:ring-4 focus:ring-emerald-300 disabled:from-slate-300 disabled:to-slate-400 disabled:cursor-not-allowed disabled:shadow-none transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98]"
      >
        {buttonLabel}
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
  const { getStatus: getUserAgentStatus } = useUserAgentStatus();
  const { location, openLocationModal, revision: locationRevision, isLoading: locationLoading, forceSelection, forceReselectAddress } = useLocation();

  const [cart, setCart] = useState({ items: [], total_quantity: 0, total_price: 0, lottery_threshold: 10 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [shopOpen, setShopOpen] = useState(true);
  const [shopNote, setShopNote] = useState('');
  const [reservationAllowed, setReservationAllowed] = useState(false);
  const [eligibleRewards, setEligibleRewards] = useState([]);
  const [autoGifts, setAutoGifts] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [couponExpanded, setCouponExpanded] = useState(false);
  const [selectedCouponId, setSelectedCouponId] = useState(null);
  const [applyCoupon, setApplyCoupon] = useState(false);
  const [infoMessage, setInfoMessage] = useState('');
  const [deliveryConfig, setDeliveryConfig] = useState({ delivery_fee: 1.0, free_delivery_threshold: 10.0 });
  const [addressValidation, setAddressValidation] = useState(createDefaultValidation());
  const [shopClosedModalOpen, setShopClosedModalOpen] = useState(false);
  const shopName = getShopName();

  const normalizeValidation = useCallback((raw) => {
    if (!raw) {
      return createDefaultValidation();
    }
    return {
      is_valid: raw.is_valid !== false,
      reason: raw.reason || null,
      message: raw.message || '',
      should_force_reselect: !!raw.should_force_reselect,
    };
  }, []);

  const locationReady = user?.type !== 'user' || (location && location.address_id && location.building_id);
  const displayLocation = location
    ? `${location.dormitory || ''}${location.building ? '·' + location.building : ''}`.trim() || '已选择地址'
    : '请选择配送地址';
  const locationRevisionRef = useRef(locationRevision);

  const lotteryThreshold = useMemo(() => {
    const raw = cart?.lottery_threshold;
    const value = typeof raw === 'string' ? Number.parseFloat(raw) : Number(raw);
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
    return 10;
  }, [cart?.lottery_threshold]);

  const formattedLotteryThreshold = useMemo(() => (
    Number.isInteger(lotteryThreshold)
      ? lotteryThreshold.toString()
      : lotteryThreshold.toFixed(2)
  ), [lotteryThreshold]);

  const hasReservationItems = useMemo(() => !!(cart?.has_reservation_items), [cart?.has_reservation_items]);
  const allReservationItems = useMemo(() => {
    if (cart?.all_reservation_items !== undefined) {
      return !!cart.all_reservation_items;
    }
    const activeItems = (cart.items || []).filter(item => {
      const isActive = !(item.is_active === 0 || item.is_active === false);
      const qty = Number(item.quantity || 0);
      return isActive && qty > 0;
    });
    if (activeItems.length === 0) {
      return false;
    }
    return activeItems.every(item => item.reservation_required);
  }, [cart?.all_reservation_items, cart.items]);
  const closedReservationOnly = useMemo(
    () => !shopOpen && allReservationItems && ((cart?.total_quantity || 0) > 0),
    [shopOpen, allReservationItems, cart?.total_quantity]
  );
  const canReserveWhileClosed = useMemo(() => closedReservationOnly, [closedReservationOnly]);
  const reservationFromClosure = useMemo(() => closedReservationOnly, [closedReservationOnly]);
  const shouldReserve = useMemo(() => hasReservationItems || closedReservationOnly, [hasReservationItems, closedReservationOnly]);

  const addressInvalid = useMemo(() => (
    locationReady && addressValidation && addressValidation.is_valid === false
  ), [locationReady, addressValidation]);

  const addressAlertMessage = useMemo(() => (
    addressInvalid ? (addressValidation?.message || '配送地址不可用，请重新选择') : ''
  ), [addressInvalid, addressValidation]);
  // 打烊逻辑：开启预约时允许所有商品，未开启时仅允许预约商品
  const closedBlocked = useMemo(
    () => !shopOpen && !reservationAllowed && !allReservationItems,
    [shopOpen, reservationAllowed, allReservationItems]
  );

  const lastInvalidKeyRef = useRef(null);
  const reselectInFlightRef = useRef(false);

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

  useEffect(() => {
    const shouldForce = !!(addressValidation && addressValidation.should_force_reselect);
    if (!shouldForce) {
      reselectInFlightRef.current = false;
      lastInvalidKeyRef.current = null;
      return;
    }

    if (!addressInvalid) {
      return;
    }

    const key = `${addressValidation.reason || 'unknown'}|${location?.address_id || ''}|${location?.building_id || ''}`;
    if (lastInvalidKeyRef.current === key || reselectInFlightRef.current) {
      return;
    }
    lastInvalidKeyRef.current = key;
    reselectInFlightRef.current = true;
    forceReselectAddress();
  }, [addressInvalid, addressValidation, location, forceReselectAddress]);

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
      if (!locationReady) {
        setCart({ items: [], total_quantity: 0, total_price: 0, payable_total: 0, shipping_fee: 0, lottery_threshold: 10 });
        setEligibleRewards([]);
        setAutoGifts([]);
        setCoupons([]);
        setSelectedCouponId(null);
        setApplyCoupon(false);
        setAddressValidation(createMissingValidation());
        setIsLoading(false);
        return;
      }

      const data = await getCart();
      setCart(data.data);
      setAddressValidation(normalizeValidation(data?.data?.address_validation));
      // 加载可用抽奖奖品
      try {
        const rw = await apiRequest('/rewards/eligible');
        setEligibleRewards(rw?.data?.rewards || []);
      } catch (e) {
        setEligibleRewards([]);
      }
      try {
        const giftsResp = await apiRequest('/gift-thresholds');
        setAutoGifts(giftsResp?.data?.thresholds || []);
      } catch (e) {
        setAutoGifts([]);
      }
      // 加载配送费配置
      try {
        const deliveryResp = await apiRequest('/delivery-config');
        const config = deliveryResp?.data?.delivery_config;
        if (config) {
          setDeliveryConfig(config);
        }
      } catch (e) {
        console.warn('获取配送费配置失败:', e);
      }
      // 加载我的优惠券 + 默认选择规则
      try {
        const resp = await apiRequest('/coupons/my');
        const list = resp?.data?.coupons || [];
        setCoupons(list);
        const sub = data?.data?.total_price || 0;
        const applicable = list.filter(x => sub > (parseFloat(x.amount) || 0));
        if (applicable.length > 0) {
          applicable.sort((a, b) => (parseFloat(b.amount) || 0) - (parseFloat(a.amount) || 0));
          setSelectedCouponId(applicable[0].id);
          setApplyCoupon(true);
        } else {
          setSelectedCouponId(null);
          setApplyCoupon(false);
        }
      } catch (e) {
        setCoupons([]);
        setSelectedCouponId(null);
        setApplyCoupon(false);
      }
    } catch (err) {
      setError(err.message || '加载购物车失败');
      setAddressValidation(createDefaultValidation());
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (locationRevisionRef.current === undefined) {
      locationRevisionRef.current = locationRevision;
      return;
    }
    if (locationRevisionRef.current !== locationRevision) {
      locationRevisionRef.current = locationRevision;
      if (user?.type === 'user' && locationReady) {
        setInfoMessage(`已切换至 ${displayLocation}，购物车已清空，请重新挑选商品。`);
      }
    }
  }, [locationRevision, user, locationReady, displayLocation]);

  useEffect(() => {
    if (user?.type === 'user' && !locationReady) {
      setInfoMessage('请选择配送地址以查看购物车。');
    }
  }, [user, locationReady]);

  // 更新商品数量（乐观更新）
  const handleUpdateQuantity = async (productId, quantity, variantId = null) => {
    // 保存当前状态用于回滚
    const previousCart = { ...cart, items: [...cart.items] };
    
    // 立即更新UI（乐观更新）
    const updatedItems = cart.items.map(item => {
      const matchesProduct = item.product_id === productId;
      const matchesVariant = variantId ? item.variant_id === variantId : !item.variant_id;
      
      if (matchesProduct && matchesVariant) {
        // 更新数量
        const newQuantity = quantity;
        const newSubtotal = (newQuantity * item.unit_price).toFixed(2);
        return { ...item, quantity: newQuantity, subtotal: newSubtotal };
      }
      return item;
    }).filter(item => item.quantity > 0); // 移除数量为0的商品

    // 重新计算总计
    const totalQuantity = updatedItems.reduce((sum, item) => {
      const isActive = !(item.is_active === 0 || item.is_active === false);
      return sum + (isActive ? item.quantity : 0);
    }, 0);
    
    const totalPrice = updatedItems.reduce((sum, item) => {
      const isActive = !(item.is_active === 0 || item.is_active === false);
      return sum + (isActive ? parseFloat(item.subtotal) : 0);
    }, 0);

    // 计算配送费：基础配送费或免配送费门槛任意一个为0则免费，否则达到门槛免费，否则收取基础配送费
    const isFreeShipping = (deliveryConfig?.delivery_fee === 0 || deliveryConfig?.free_delivery_threshold === 0);
    const shippingFee = isFreeShipping ? 0 : (totalPrice >= (deliveryConfig?.free_delivery_threshold || 10) ? 0 : (deliveryConfig?.delivery_fee || 0));
    const payableTotal = totalPrice + shippingFee;

    // 计算预约相关标志
    const activeItems = updatedItems.filter(item => {
      const isActive = !(item.is_active === 0 || item.is_active === false);
      const qty = Number(item.quantity || 0);
      return isActive && qty > 0;
    });
    const hasReservationItems = activeItems.some(item => item.reservation_required);
    const allReservationItems = activeItems.length > 0 && activeItems.every(item => item.reservation_required);

    // 立即更新状态
    setCart({
      ...cart,
      items: updatedItems,
      total_quantity: totalQuantity,
      total_price: parseFloat(totalPrice.toFixed(2)),
      shipping_fee: shippingFee,
      payable_total: parseFloat(payableTotal.toFixed(2)),
      has_reservation_items: hasReservationItems,
      all_reservation_items: allReservationItems
    });
    
    // 后台调用API（静默执行，不重新加载）
    try {
      await updateCart('update', productId, quantity, variantId);
      // 成功：不做任何事，UI已经更新
    } catch (err) {
      // 失败时回滚
      setCart(previousCart);
      alert(err.message || '更新失败，请重试');
    }
  };

  // 删除商品（乐观更新）
  const handleRemoveItem = async (productId, variantId = null) => {
    if (!confirm('确定要删除这个商品吗？')) return;
    
    // 保存当前状态用于回滚
    const previousCart = { ...cart, items: [...cart.items] };
    
    // 立即更新UI
    const updatedItems = cart.items.filter(item => {
      const matchesProduct = item.product_id === productId;
      const matchesVariant = variantId ? item.variant_id === variantId : !item.variant_id;
      return !(matchesProduct && matchesVariant);
    });

    // 重新计算总计
    const totalQuantity = updatedItems.reduce((sum, item) => {
      const isActive = !(item.is_active === 0 || item.is_active === false);
      return sum + (isActive ? item.quantity : 0);
    }, 0);
    
    const totalPrice = updatedItems.reduce((sum, item) => {
      const isActive = !(item.is_active === 0 || item.is_active === false);
      return sum + (isActive ? parseFloat(item.subtotal) : 0);
    }, 0);

    // 计算配送费：基础配送费或免配送费门槛任意一个为0则免费，否则达到门槛免费，否则收取基础配送费
    const isFreeShipping = (deliveryConfig?.delivery_fee === 0 || deliveryConfig?.free_delivery_threshold === 0);
    const shippingFee = isFreeShipping ? 0 : (totalPrice >= (deliveryConfig?.free_delivery_threshold || 10) ? 0 : (deliveryConfig?.delivery_fee || 0));
    const payableTotal = totalPrice + shippingFee;

    // 计算预约相关标志
    const activeItems = updatedItems.filter(item => {
      const isActive = !(item.is_active === 0 || item.is_active === false);
      const qty = Number(item.quantity || 0);
      return isActive && qty > 0;
    });
    const hasReservationItems = activeItems.some(item => item.reservation_required);
    const allReservationItems = activeItems.length > 0 && activeItems.every(item => item.reservation_required);

    // 立即更新状态
    setCart({
      ...cart,
      items: updatedItems,
      total_quantity: totalQuantity,
      total_price: parseFloat(totalPrice.toFixed(2)),
      shipping_fee: shippingFee,
      payable_total: parseFloat(payableTotal.toFixed(2)),
      has_reservation_items: hasReservationItems,
      all_reservation_items: allReservationItems
    });
    
    // 后台调用API（静默执行，不重新加载）
    try {
      await removeFromCart(productId, variantId);
      // 成功：不做任何事，UI已经更新
    } catch (err) {
      // 失败时回滚
      setCart(previousCart);
      alert(err.message || '删除失败，请重试');
    }
  };

  // 清空购物车（乐观更新）
  const handleClearCart = async () => {
    if (!confirm('确定要清空购物车吗？')) return;
    
    // 保存当前状态用于回滚
    const previousCart = { ...cart, items: [...cart.items] };
    
    // 立即清空UI
    setCart({
      items: [],
      total_quantity: 0,
      total_price: 0,
      payable_total: 0,
      shipping_fee: 0,
      lottery_threshold: cart.lottery_threshold || 10,
      has_reservation_items: false,
      all_reservation_items: false
    });
    
    // 后台调用API（静默执行，不重新加载）
    try {
      await clearCart();
      // 成功：不做任何事，UI已经更新
    } catch (err) {
      // 失败时回滚
      setCart(previousCart);
      alert(err.message || '清空失败，请重试');
    }
  };

  // 去结算
  const handleCheckout = () => {
    if (closedBlocked) {
      // closedBlocked 为 true 意味着：打烊且未开启预约且不是全预约商品
      alert('当前打烊期间仅支持预约商品，请先移除非预约商品后再试');
      return;
    }
    if (addressInvalid) {
      alert(addressAlertMessage || '配送地址不可用，请重新选择');
      openLocationModal();
      return;
    }
    if (!locationReady) {
      alert('请先选择配送地址以完成结算');
      openLocationModal();
      return;
    }
    const reservationFlag = shouldReserve ? '1' : '0';
    if (applyCoupon && selectedCouponId) {
      router.push(`/checkout?apply=1&coupon_id=${encodeURIComponent(selectedCouponId)}&reservation=${reservationFlag}`);
    } else {
      router.push(`/checkout?apply=0&reservation=${reservationFlag}`);
    }
  };

  // 初始化加载
  useEffect(() => {
    if (user) {
      loadCart();
    }
  }, [user, locationReady, locationRevision]);

  // 当勾选状态/购物车金额/券列表变化时，自动选择最大可用券
  useEffect(() => {
    const sub = cart?.total_price || 0;
    const usable = (coupons || []).filter(c => sub > (parseFloat(c.amount) || 0));
    if (applyCoupon) {
      if (!selectedCouponId || !usable.some(x => x.id === selectedCouponId)) {
        if (usable.length > 0) {
          usable.sort((a, b) => (parseFloat(b.amount) || 0) - (parseFloat(a.amount) || 0));
          setSelectedCouponId(usable[0].id);
        } else {
          setSelectedCouponId(null);
        }
      }
    }
  }, [applyCoupon, coupons, cart?.total_price]);

  // 加载店铺/代理状态
  useEffect(() => {
    (async () => {
      try {
        const addressId = location?.address_id;
        const buildingId = location?.building_id;
        const res = await getUserAgentStatus(addressId, buildingId);

        const open = !!res.data?.is_open;
        setShopOpen(open);
        setReservationAllowed(!!res.data?.allow_reservation);

        if (open) {
          setShopNote('');
        } else {
          const defaultNote = res.data?.is_agent
            ? '当前区域代理已暂停营业，暂不支持结算，仅可加入购物车'
            : '店铺已暂停营业，暂不支持结算，仅可加入购物车';
          setShopNote(res.data?.note || defaultNote);
        }
      } catch (e) {
        // 出错时默认为营业状态
        setShopOpen(true);
        setShopNote('');
        setReservationAllowed(false);
      }
    })();
  }, [location]);

  // 如果用户未登录，不渲染内容
  if (!user) {
    return null;
  }

  return (
    <>
      <Head>
        <title>购物车 - {shopName}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>

      {/* 顶部导航（移动端优化） */}
      <Nav active="cart" />

      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 pt-16">
        {/* 主要内容 */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-8 pb-6 flex justify-between items-center">
            <div className="animate-apple-fade-in">
              <h1 className="text-4xl font-black text-slate-900 mb-2 bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">
                购物车
              </h1>
              <p className="text-slate-600 mt-1 flex items-center gap-2">
                <i className="fas fa-shopping-bag text-emerald-500"></i>
                管理您的购物车商品
              </p>
            </div>
            
            {cart.items && cart.items.length > 0 && (
              <button
                onClick={handleClearCart}
                className="text-sm text-slate-600 hover:text-rose-600 border-2 border-slate-300 hover:border-rose-400 px-4 py-2.5 rounded-xl hover:bg-rose-50 transition-all duration-300 font-semibold transform hover:scale-105 active:scale-95 flex items-center gap-2"
              >
                <i className="fas fa-trash-alt"></i>
                清空购物车
              </button>
            )}
          </div>

          {/* 加载状态 */}
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 animate-pulse">
                  <div className="flex items-start gap-4">
                    <div className="w-24 h-24 bg-gradient-to-br from-slate-100 to-slate-200 rounded-xl"></div>
                    <div className="flex-1">
                      <div className="h-5 bg-gradient-to-r from-slate-100 to-slate-200 rounded-lg mb-3 w-3/4"></div>
                      <div className="h-4 bg-gradient-to-r from-slate-100 to-slate-200 rounded-lg w-1/2 mb-2"></div>
                      <div className="h-3 bg-gradient-to-r from-slate-100 to-slate-200 rounded-lg w-1/3"></div>
                    </div>
                    <div className="flex flex-col gap-3">
                      <div className="w-20 h-6 bg-gradient-to-r from-slate-100 to-slate-200 rounded-lg"></div>
                      <div className="w-24 h-9 bg-gradient-to-r from-slate-100 to-slate-200 rounded-xl"></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : cart.items && cart.items.length > 0 ? (
            <>
              {/* 整体网格布局：左侧内容 + 右侧订单摘要 */}
              <div className="lg:grid lg:grid-cols-3 lg:gap-8">
                {/* 左侧内容区域 */}
                <div className="lg:col-span-2 space-y-6">
                  {/* 地址和打烊提示 */}
                  {user?.type === 'user' && (
                    <div className="flex flex-col sm:flex-row gap-3 animate-apple-fade-in">
                      <button
                        onClick={openLocationModal}
                        className="group flex items-center gap-3 px-5 py-4 bg-white border-2 border-emerald-300/50 rounded-2xl text-emerald-700 hover:shadow-xl hover:border-emerald-400 transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] bg-gradient-to-r from-emerald-50/50 to-teal-50/50"
                      >
                        <span className="flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-lg group-hover:shadow-xl transition-shadow">
                          <i className="fas fa-location-dot"></i>
                        </span>
                        <div className="text-left flex-1">
                          <div className="text-xs text-emerald-600 font-semibold">当前配送地址</div>
                          <div className="text-base font-bold text-emerald-800 mt-0.5">{displayLocation}</div>
                        </div>
                        <span className="text-emerald-600 font-semibold flex items-center gap-1 group-hover:gap-2 transition-all">
                          修改
                          <i className="fas fa-chevron-right text-xs"></i>
                        </span>
                      </button>

                      {reservationFromClosure && (
                        <div className="rounded-2xl border-2 border-sky-300/50 bg-gradient-to-r from-sky-50 to-blue-50 px-5 py-4 text-sky-800 flex items-start gap-3 flex-1 shadow-sm">
                          <div className="w-10 h-10 bg-gradient-to-br from-sky-400 to-blue-500 rounded-full flex items-center justify-center flex-shrink-0 shadow-lg">
                            <i className="fas fa-calendar-check text-white"></i>
                          </div>
                          <div>
                            <p className="text-sm font-bold text-sky-900">店铺打烊中，支持预约下单</p>
                            <p className="text-xs text-sky-700 leading-snug mt-1">提交订单后将作为预约订单保存，我们会在营业后优先处理。</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 地址验证错误提示 */}
                  {addressInvalid && (
                    <div className="flex items-start gap-3 rounded-2xl border-2 border-rose-300/50 bg-gradient-to-r from-rose-50 to-pink-50 px-5 py-4 text-sm text-rose-800 shadow-sm animate-apple-fade-in">
                      <i className="fas fa-exclamation-triangle mt-0.5 text-rose-500 text-lg"></i>
                      <span className="flex-1 font-semibold">{addressAlertMessage}</span>
                      <button
                        onClick={openLocationModal}
                        className="ml-3 text-rose-600 hover:text-rose-800 font-bold underline decoration-2 underline-offset-2 transition-colors"
                      >
                        重新选择
                      </button>
                    </div>
                  )}

                  {/* 信息提示 */}
                  {infoMessage && (
                    <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border-2 border-emerald-200/50 text-emerald-800 px-5 py-4 rounded-2xl flex items-start gap-3 shadow-sm animate-apple-fade-in">
                      <i className="fas fa-info-circle mt-0.5 text-emerald-600 text-lg"></i>
                      <span className="flex-1 font-semibold">{infoMessage}</span>
                      <button
                        onClick={() => setInfoMessage('')}
                        className="ml-auto text-emerald-600 hover:text-emerald-800 transition-colors"
                        aria-label="关闭提示"
                      >
                        <i className="fas fa-times"></i>
                      </button>
                    </div>
                  )}

                  {/* 错误提示 */}
                  {error && (
                    <div className="bg-gradient-to-r from-red-50 to-rose-50 border-2 border-red-200/50 text-red-800 px-5 py-4 rounded-2xl shadow-sm font-semibold animate-apple-fade-in">
                      <i className="fas fa-exclamation-circle mr-2"></i>
                      {error}
                    </div>
                  )}

                  {/* 优惠券概览 */}
                  {coupons && coupons.length > 0 && (
                    <div className="border-2 border-pink-200/50 rounded-2xl overflow-hidden shadow-sm bg-white">
                      <button
                        className="w-full flex items-center justify-between px-5 py-4 bg-gradient-to-r from-pink-50 to-rose-50 hover:from-pink-100 hover:to-rose-100 transition-all duration-300"
                        onClick={() => setCouponExpanded(!couponExpanded)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-gradient-to-br from-pink-500 to-rose-600 rounded-full flex items-center justify-center text-white shadow-lg">
                            <i className="fas fa-ticket-alt"></i>
                          </div>
                          <span className="font-bold text-slate-900 text-lg">我的优惠券</span>
                          <span className="text-sm text-pink-600 font-semibold bg-white px-3 py-1 rounded-full shadow-sm">
                            {coupons.length} 张
                          </span>
                        </div>
                        <i className={`fas ${couponExpanded ? 'fa-chevron-up' : 'fa-chevron-down'} text-pink-500 transition-transform duration-300`}></i>
                      </button>
                      {couponExpanded && (() => {
                        const sub = cart?.total_price || 0;
                        const groups = {};
                        for (const c of coupons) {
                          const k = `${parseFloat(c.amount) || 0}|${c.expires_at || 'forever'}`;
                          if (!groups[k]) groups[k] = { list: [], amount: parseFloat(c.amount) || 0, expires_at: c.expires_at || null };
                          groups[k].list.push(c);
                        }
                        const keys = Object.keys(groups).sort((a, b) => (groups[b].amount - groups[a].amount));
                        return (
                          <div className="bg-gradient-to-br from-slate-50 to-slate-100 px-5 py-4">
                            {keys.map(k => {
                              const g = groups[k];
                              const usable = sub > g.amount;
                              return (
                                <div key={k} className={`flex items-center justify-between border-2 bg-white rounded-xl px-4 py-3 mb-3 shadow-sm transition-all duration-300 hover:shadow-md ${usable ? 'border-pink-300/50 hover:border-pink-400' : 'border-slate-200 opacity-60'}`}>
                                  <div className="flex items-center gap-4">
                                    <div className={`w-16 h-16 rounded-xl flex items-center justify-center font-black text-lg shadow-inner ${usable ? 'bg-gradient-to-br from-pink-500 to-rose-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                                      ¥{g.amount}
                                    </div>
                                    <div>
                                      <div className={`text-sm font-bold ${usable ? 'text-emerald-600' : 'text-slate-500'}`}>
                                        {usable ? '✓ 可用' : '✗ 不可用（需大于券额）'}
                                      </div>
                                      <div className="text-xs text-slate-600 mt-1">{g.expires_at ? `到期：${new Date(g.expires_at).toLocaleString('zh-CN')}` : '永久有效'}</div>
                                      <div className="text-xs text-slate-500">满 ¥{g.amount} 可用</div>
                                    </div>
                                  </div>
                                  <div className="text-base font-bold text-slate-700 bg-slate-100 px-3 py-1 rounded-full">
                                    ×{g.list.length}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* 商品列表容器 */}
                  <div className="space-y-0">
                    {cart.items.map((item) => (
                      <CartItem
                        key={item.product_id}
                        item={item}
                        onUpdateQuantity={handleUpdateQuantity}
                        onRemove={handleRemoveItem}
                      />
                    ))}
                  </div>

                  {/* 抽奖奖品展示（不计入金额，达抽奖门槛自动附带）*/}
                  {eligibleRewards.length > 0 && cart?.lottery_enabled !== false && (
                    <div className="mt-8">
                    <div className="mb-2 flex items-center gap-2">
                      <div className="w-6 h-6 bg-amber-100 rounded flex items-center justify-center">
                        <i className="fas fa-gift text-amber-600 text-xs"></i>
                      </div>
                      <h3 className="text-sm font-semibold text-gray-900">我的抽奖奖品</h3>
                    </div>

                    {eligibleRewards.map((r) => {
                      const meet = (cart?.total_price ?? 0) >= lotteryThreshold;
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
                              {(r.prize_product_name || r.prize_variant_name) && (
                                <p className={`mt-1 text-xs ${meet ? 'text-emerald-700' : 'text-gray-600'}`}>
                                  奖品：{r.prize_product_name || ''}{r.prize_variant_name ? `（${r.prize_variant_name}）` : ''}
                                </p>
                              )}
                              <p className={`mt-1 text-xs ${meet ? 'text-emerald-700' : 'text-gray-600'}`}>
                                {meet
                                  ? `满${formattedLotteryThreshold}元，本单将自动附带并随单配送`
                                  : `未满${formattedLotteryThreshold}元，本单结算不会附带；达标后自动附带并配送`}
                              </p>
                            </div>
                            <div className="text-right">
                              <span className={`text-sm font-semibold ${meet ? 'text-emerald-700' : 'text-gray-600'}`}>¥0.00</span>
                              <p className={`text-xs ${meet ? 'text-emerald-600' : 'text-gray-500'}`}>
                                赠品
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    </div>
                  )}

                  {/* 满额门槛 - 现在在space-y-0外面了 */}
                  {cart.items.length > 0 && autoGifts.length > 0 && (() => {
                    const cartTotal = cart?.total_price || 0;
                    const hasAnyUnlocked = autoGifts.some(threshold => cartTotal >= (threshold.threshold_amount || 0));
                    
                    // 根据是否有抽奖奖品来调整间距
                    const hasRewards = eligibleRewards.length > 0;
                    const topMargin = hasRewards ? 'mt-8' : 'mt-16'; // 有奖品时用正常间距，无奖品时用大间距
                    
                    const containerClass = hasAnyUnlocked 
                      ? `${topMargin} border border-dashed border-pink-200 rounded-lg bg-pink-50 p-4`
                      : `${topMargin} border border-dashed border-gray-200 rounded-lg bg-gray-50 p-4`;
                    const titleIconClass = hasAnyUnlocked ? 'text-pink-500' : 'text-gray-500';
                    const titleTextClass = hasAnyUnlocked ? 'text-pink-700' : 'text-gray-500';
                    
                    return (
                      <div className={containerClass}>
                        <div className="flex items-center gap-2 mb-3">
                          <i className={`fas fa-gift ${titleIconClass}`}></i>
                          <span className={`text-sm font-semibold ${titleTextClass}`}>满额门槛</span>
                        </div>
                        <div className="grid gap-2">
                          {autoGifts.map((threshold, index) => {
                            const thresholdAmount = threshold.threshold_amount || 0;
                            const unlocked = cartTotal >= thresholdAmount;
                            const cardClass = unlocked
                              ? 'border-pink-200 bg-pink-50 text-pink-700'
                              : 'border-gray-300 bg-gray-200 text-gray-600';
                            
                            const rewardParts = [];
                            if (threshold.gift_products && threshold.selected_product_name) {
                              rewardParts.push(threshold.selected_product_name);
                            }
                            if (threshold.gift_coupon && threshold.coupon_amount > 0) {
                              rewardParts.push(`${threshold.coupon_amount}元优惠券`);
                            }
                            const rewardText = rewardParts.length > 0 ? rewardParts.join(' + ') : '暂无奖励';
                            const hint = unlocked ? '已满足条件' : `还差 ¥${(thresholdAmount - cartTotal).toFixed(2)}`;
                            
                            return (
                              <div
                                key={threshold.threshold_amount || index}
                                className={`text-xs rounded-md px-3 py-2 border ${cardClass}`}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="min-w-0 flex-1">
                                    <div className="font-medium">满 ¥{thresholdAmount}</div>
                                    <div className="mt-1 text-[11px] break-words">{rewardText}</div>
                                  </div>
                                  <div className="text-[11px] ml-2 flex-shrink-0">
                                    {hint}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* 右侧订单摘要 */}
                <div className="lg:col-span-1 mt-6 lg:mt-0">
                  <div className="lg:sticky lg:top-24">
                    <OrderSummary
                      cart={cart}
                      onCheckout={handleCheckout}
                      isClosed={!shopOpen}
                      reservationAllowed={reservationAllowed}
                      shouldReserve={shouldReserve}
                      reservationFromClosure={reservationFromClosure}
                      hasReservationItems={hasReservationItems}
                      allReservationItems={allReservationItems}
                      coupons={coupons}
                      selectedCouponId={selectedCouponId}
                      setSelectedCouponId={setSelectedCouponId}
                      applyCoupon={applyCoupon}
                      setApplyCoupon={setApplyCoupon}
                      addressValidation={addressValidation}
                      onFixAddress={openLocationModal}
                      locationReady={locationReady}
                      lotteryThreshold={lotteryThreshold}
                      lotteryEnabled={cart?.lottery_enabled !== false}
                      deliveryConfig={deliveryConfig}
                    />
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* 购物车为空时的状态 - 完整宽度居中显示 */
            <div className="text-center py-20 animate-apple-fade-in">
              <div className="max-w-md mx-auto">
                <div className="w-24 h-24 bg-gradient-to-br from-slate-100 to-slate-200 rounded-full mx-auto mb-6 flex items-center justify-center shadow-inner">
                  <i className="fas fa-shopping-cart text-slate-400 text-3xl"></i>
                </div>
                <h3 className="text-2xl font-bold text-slate-900 mb-3">购物车是空的</h3>
                <p className="text-slate-600 mb-8 text-lg">快去商城逛逛，发现喜欢的商品吧！</p>
                <Link href="/shop" className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold text-lg rounded-xl hover:from-emerald-600 hover:to-teal-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95">
                  <i className="fas fa-store"></i>
                  去购物
                </Link>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* 打烊提示模态框 */}
      {shopClosedModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="absolute inset-0" onClick={() => setShopClosedModalOpen(false)}></div>
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-scaleIn">
            <div className="px-6 py-5 border-b border-slate-200 bg-gradient-to-r from-orange-50 to-amber-50">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-orange-400 to-amber-500 rounded-full flex items-center justify-center shadow-lg">
                  <i className="fas fa-exclamation-triangle text-white text-lg"></i>
                </div>
                <h3 className="text-xl font-black text-slate-900">店铺提醒</h3>
              </div>
            </div>
            <div className="px-6 py-6">
              <SimpleMarkdown className="text-slate-700 leading-relaxed text-base">
                {shopNote || '当前打烊，暂不支持结算，仅可加入购物车'}
              </SimpleMarkdown>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                onClick={() => setShopClosedModalOpen(false)}
                className="px-6 py-3 bg-gradient-to-r from-slate-800 to-slate-900 text-white font-bold rounded-xl hover:from-slate-900 hover:to-black transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95"
              >
                知道了
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
