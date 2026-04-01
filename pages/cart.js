import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Head from 'next/head';
import Script from 'next/script';
import Link from 'next/link';
import { useAuth, useCart, useApi, useUserAgentStatus } from '../hooks/useAuth';
import { motion, AnimatePresence } from 'framer-motion';
import { useProducts } from '../hooks/useAuth';
import { useLocation } from '../hooks/useLocation';
import { useRouter } from 'next/router';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';

import AnimatedPrice from '../components/AnimatedPrice';
import RetryImage from '../components/RetryImage';
import SimpleMarkdown from '../components/SimpleMarkdown';
import { getProductImage } from '../utils/urls';
import { getShopName, getLogo } from '../utils/runtimeConfig';

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



// 页面容器动效（仅整体淡入）
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }
  }
};

// 购物车商品项动效
const cartItemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: (custom) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1], delay: custom * 0.04 }
  }),
  exit: { opacity: 0, x: -20, transition: { duration: 0.2 } }
};

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
  const isStockLimitReached = normalizedStock !== null && (normalizedStock <= 0 || item.quantity >= normalizedStock);

  const handleQuantityChange = (newQuantity) => {
    if (newQuantity < 1) {
      onUpdateQuantity(item.product_id, 0, item.variant_id || null);
      return;
    }
    // 检查库存限制
    if (!isNonSellable && normalizedStock !== null && (normalizedStock <= 0 || newQuantity > normalizedStock)) {
      return;
    }
    onUpdateQuantity(item.product_id, newQuantity, item.variant_id || null);
  };

  return (
    <motion.div
      layout
      layoutId={`cart-item-${item.product_id}-${item.variant_id || 'default'}`}
      initial="hidden"
      animate="visible"
      exit="exit"
      variants={cartItemVariants}
      custom={0}
      className={`group relative flex gap-4 py-4 px-5 items-center cart-item-pad ${isDown ? 'opacity-50 grayscale' : ''}`}
      style={{ borderBottom: '1px solid #E8E2D8' }}
    >
      {/* 商品图片 */}
      <div className="cart-item-img flex-shrink-0 w-[68px] h-[68px] rounded-lg overflow-hidden border border-[#E8E2D8]" style={{ background: '#F5F2ED' }}>
        <RetryImage
          src={getProductImage(item) || getLogo()}
          alt={item.name}
          className="h-full w-full object-cover object-center"
          maxRetries={3}
        />
      </div>

      {/* 商品信息 */}
      <div className="flex-1 min-w-0">
        <h3 className={`text-[15px] font-medium leading-snug line-clamp-1 ${isDown ? 'text-[#B0AEA5]' : 'text-[#141413]'}`}>
          {item.name}
        </h3>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          {item.variant_name && (
            <span className="text-[12px] text-[#6B6860]">{item.variant_name}</span>
          )}
          {item.reservation_required && (
            <span className="text-[11px] text-[#D97757] bg-[#D97757]/8 px-1.5 py-px rounded">预约</span>
          )}
          {isNonSellable && (
            <span className="text-[11px] text-[#788C5D] bg-[#788C5D]/8 px-1.5 py-px rounded">非卖品</span>
          )}
          {isDown && (
            <span className="text-[11px] text-[#B0AEA5] bg-[#F5F2ED] px-1.5 py-px rounded">已下架</span>
          )}
        </div>
        {/* 预约说明 */}
        {item.reservation_required && (
          <div className="text-[12px] text-[#6B6860] mt-1 flex items-center gap-1">
            <i className="fas fa-calendar-check text-[10px] text-[#D97757]"></i>
            <span>{formatReservationCutoff(item.reservation_cutoff)}</span>
            {item.reservation_note && (
              <span className="text-[#B0AEA5] ml-1">{item.reservation_note}</span>
            )}
          </div>
        )}
        <div className="flex items-center gap-2 mt-1">
          {!isDown && !isNonSellable && normalizedStock !== null && normalizedStock > 0 && (
            <span className="text-[11px] text-[#B0AEA5]">库存 {normalizedStock}</span>
          )}
          {(isDown || isNonSellable) && (
            <span className="text-[11px] text-[#B0AEA5]">不计入金额</span>
          )}
        </div>
      </div>

      {/* 右侧：价格 + 数量 */}
      <div className="flex flex-col items-end gap-2.5 flex-shrink-0">
        <div className="text-right">
          <div className="text-[18px] font-semibold text-[#141413] tracking-tight" style={{ fontFamily: "'Lora', serif" }}>¥{item.subtotal}</div>
          {isNonSellable && (
            <div className="text-[11px] text-[#788C5D]">免计价</div>
          )}
        </div>

        {/* 数量控制 */}
        <div className="flex items-center border border-[#DDD8D0] rounded overflow-hidden">
          <button
            onClick={() => handleQuantityChange(item.quantity - 1)}
            disabled={isDown}
            className="w-[30px] h-[30px] flex items-center justify-center text-[#6B6860] hover:bg-[#F5F2ED] hover:text-[#D97757] disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-base"
          >
            −
          </button>
          <span className="w-9 h-[30px] flex items-center justify-center text-sm font-medium text-[#141413] border-x border-[#E8E2D8]">{item.quantity}</span>
          <button
            onClick={() => handleQuantityChange(item.quantity + 1)}
            disabled={isDown || isStockLimitReached}
            className="w-[30px] h-[30px] flex items-center justify-center text-[#6B6860] hover:bg-[#F5F2ED] hover:text-[#D97757] disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-base"
            title={isStockLimitReached ? '已达库存上限' : ''}
          >
            +
          </button>
        </div>
      </div>

    </motion.div>
  );
};

// 订单摘要组件
const OrderSummary = ({
  cart,
  onCheckout,
  isClosed,
  cycleLocked = false,
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
  deliveryConfig = { free_delivery_threshold: 10 },
  isProcessingCheckout = false
}) => {
  const selected = coupons.find(c => c.id === selectedCouponId);
  const discount = (applyCoupon && selected) ? (parseFloat(selected.amount) || 0) : 0;
  const base = (cart?.payable_total ?? cart.total_price) || 0;
  const total = Math.max(0, base - discount);
  const validLotteryThreshold = Number.isFinite(lotteryThreshold) && lotteryThreshold > 0 ? lotteryThreshold : 10;
  const shippingThreshold = deliveryConfig?.free_delivery_threshold || 10;
  // 只要基础配送费或免配送费门槛任意一个为0，就是免运费
  const isFreeShipping = (deliveryConfig?.delivery_fee === 0 || deliveryConfig?.free_delivery_threshold === 0);
  // 当门槛 >= 999999999 时，视为"始终收取配送费"，不显示免运费提示
  const isAlwaysChargeShipping = shippingThreshold >= 999999999;
  const needsShipping = cart.total_quantity > 0 && cart.total_price < shippingThreshold && (deliveryConfig?.delivery_fee > 0) && !isFreeShipping && !isAlwaysChargeShipping;
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
  const checkoutDisabled = cart.total_quantity === 0 || cycleLocked || closedBlocked || !locationReady || addressInvalid || isProcessingCheckout;
  const buttonLabel = (() => {
    if (!locationReady) return '请选择配送地址';
    if (addressInvalid) return addressAlertMessage || '配送地址不可用，请重新选择';
    if (cycleLocked) return '暂时无法结算，请联系管理员';
    if (closedBlocked) {
      return '打烊中 · 仅限预约商品';
    }
    if (closedReservationOnly) return '预约购买';
    if (isClosed && reservationAllowed) return '预约购买';
    if (hasReservationItems && shouldReserve) return '提交预约';
    return '去结算';
  })();
  return (
    <div className="cart-summary sticky top-24 rounded-2xl" style={{ background: '#FFFFFF', border: '1px solid #E8E2D8', overflow: 'visible' }}>
      {/* 标题 */}
      <h2 className="text-[20px] font-normal text-[#141413] px-6 pt-6 pb-0" style={{ fontFamily: "'LXGW WenKai', 'Songti SC', serif", letterSpacing: '-0.01em' }}>
        订单摘要
      </h2>

      {/* 基础信息 */}
      <div className="px-6 py-5" style={{ borderBottom: '1px solid #E8E2D8' }}>
        <div className="flex justify-between items-center text-[14px]">
          <span className="text-[#6B6860]">商品小计（{cart.total_quantity} 件）</span>
          <span className="font-medium text-[#141413]"><AnimatedPrice value={cart.total_price} /></span>
        </div>
        <div className="flex justify-between items-center text-[14px] mt-3">
          <span className="text-[#6B6860]">配送费</span>
          <span className={`font-medium ${cart.shipping_fee > 0 ? 'text-[#141413]' : 'text-[#6B8F47]'}`}>
            {cart.shipping_fee > 0 ? <AnimatedPrice value={cart.shipping_fee} /> : '免运费'}
          </span>
        </div>
        {cart.shipping_fee === 0 && cart.total_quantity > 0 && (
          <div className="text-[11px] text-[#6B8F47] text-right mt-1">已满额免运费</div>
        )}
      </div>

      {/* 优惠券（只读显示已选状态，平滑过渡） */}
      <AnimatePresence initial={false}>
        {applyCoupon && selected && (
          <motion.div
            key="coupon-row"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
            style={{ overflow: 'hidden', borderBottom: '1px solid #E8E2D8' }}
          >
            <div className="px-6 py-4 flex justify-between items-center text-[14px]">
              <span className="flex items-center gap-2 text-[#6B6860]">
                🏷️ 优惠券
              </span>
              <span className="font-medium text-[#D97757]">−¥{parseFloat(selected.amount)||0}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 总计 */}
      <div className="px-6 pt-5 pb-6" style={{ borderBottom: '1px solid #E8E2D8' }}>
        <div className="flex justify-between items-baseline">
          <span className="text-[15px] font-medium text-[#141413]">合计</span>
          <span className="text-[28px] font-bold text-[#C96442]" style={{ fontFamily: "'Lora', serif", letterSpacing: '-0.03em', lineHeight: 1.2 }}>
            <AnimatedPrice value={total} />
          </span>
        </div>
      </div>

      {/* 凑单提示 / 抽奖状态（平滑过渡） */}
      {(() => {
        const lotteryMet = lotteryEnabled && cart.total_quantity > 0 && cart.total_price >= validLotteryThreshold;
        const showPromo = needsShipping || needsLottery || lotteryMet;
        // 统一计算进度条目标
        const barTarget = needsShipping && needsLottery
          ? Math.max(shippingThreshold, validLotteryThreshold)
          : needsShipping ? shippingThreshold
          : needsLottery ? validLotteryThreshold
          : validLotteryThreshold;
        const barPct = Math.min(100, (cart.total_price / (barTarget || 10)) * 100);
        return (
          <AnimatePresence initial={false}>
            {showPromo && (
              <motion.div
                key="promo-section"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
                style={{ overflow: 'hidden', borderBottom: '1px solid #E8E2D8' }}
              >
                <div className="px-6 py-4 flex items-center gap-3 text-[13px] text-[#6B6860]" style={{ background: 'repeating-linear-gradient(-45deg, transparent, transparent 8px, rgba(217,119,87,0.02) 8px, rgba(217,119,87,0.02) 16px)' }}>
                  <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-base" style={{ background: lotteryMet && !needsShipping ? 'rgba(107,143,71,0.18)' : 'rgba(107,143,71,0.1)' }}>🎁</div>
                  <div className="flex-1 leading-snug">
                    {(needsShipping || needsLottery) ? (
                      <>
                        <span>还差 </span>
                        {sameTarget ? (
                          <><span className="font-semibold text-[#D97757]">¥{missingShipping.toFixed(2)}</span> 免运费和抽奖</>
                        ) : (
                          <>
                            {needsShipping && <><span className="font-semibold text-[#D97757]">¥{missingShipping.toFixed(2)}</span> 免运费</>}
                            {needsShipping && needsLottery && <span className="mx-1">·</span>}
                            {needsLottery && <><span className="font-semibold text-[#D97757]">¥{missingLottery.toFixed(2)}</span> 抽奖</>}
                          </>
                        )}
                        <a href="/shop" className="ml-1 text-[#D97757] font-medium">去凑单 →</a>
                      </>
                    ) : null}
                    {lotteryMet && !needsLottery && (
                      <span className="text-[#6B8F47] font-medium">🎉 已满 ¥{validLotteryThreshold}，获得抽奖资格</span>
                    )}
                    {/* 进度条 - 始终渲染，用 CSS transition 平滑变化 */}
                    <div className="w-full h-1 rounded-full mt-1.5 overflow-hidden" style={{ background: '#E8E2D8' }}>
                      <div className="h-full rounded-full" style={{ background: barPct >= 100 ? '#6B8F47' : '#788C5D', width: `${barPct}%`, transition: 'width 0.6s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.3s ease' }} />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        );
      })()}

      {/* 状态提示 */}
      {addressInvalid && (
        <div className="mx-6 mt-4 flex items-center gap-2 rounded-lg px-3 py-2.5 text-[12px] text-[#C0453A]" style={{ background: 'rgba(192,69,58,0.06)', border: '1px solid rgba(192,69,58,0.15)' }}>
          <span className="flex-1">{addressAlertMessage}</span>
          {typeof onFixAddress === 'function' && (
            <button onClick={onFixAddress} className="font-medium text-[#C0453A] underline">修改</button>
          )}
        </div>
      )}
      {shouldReserve && (
        <div className="mx-6 mt-3 rounded-lg px-3 py-2.5 text-[12px] text-[#6B6860]" style={{ background: 'rgba(120,140,93,0.06)', border: '1px solid rgba(120,140,93,0.15)' }}>
          <span className="font-medium">{reservationFromClosure ? '打烊中，将转为预约订单' : '含预约商品，将以预约方式提交'}</span>
          {hasReservationItems && (
            <div className="mt-1 text-[#788C5D]">配送时间以预约信息为准</div>
          )}
          {isClosed && !reservationAllowed && !allReservationItems && (
            <div className="mt-2 rounded px-2 py-1.5 text-[11px] text-[#C9943A]" style={{ background: 'rgba(201,148,58,0.06)', border: '1px solid rgba(201,148,58,0.15)' }}>
              打烊仅支持预约商品，请先移除非预约商品
            </div>
          )}
        </div>
      )}
      {cycleLocked && (
        <div className="mx-6 mt-3 rounded-lg px-3 py-2.5 text-[12px] text-[#C9943A]" style={{ background: 'rgba(201,148,58,0.06)', border: '1px solid rgba(201,148,58,0.15)' }}>
          暂时无法结算，请联系管理员
        </div>
      )}

      {/* 结算按钮 */}
      <div className="px-6 py-5">
        <button
          onClick={onCheckout}
          disabled={checkoutDisabled}
          aria-busy={isProcessingCheckout}
          className="w-full py-4 rounded-lg text-[15px] font-medium tracking-wide text-[#FAF9F5] disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 relative overflow-hidden"
          style={{
            background: checkoutDisabled ? '#DDD8D0' : '#141413',
            letterSpacing: '0.02em',
          }}
          onMouseEnter={e => { if (!checkoutDisabled) e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 32px rgba(20,20,19,0.10)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
        >
          {isProcessingCheckout ? '正在检查库存...' : `${buttonLabel}${!checkoutDisabled && total > 0 ? ` · ¥${total.toFixed(2)}` : ''}`}
        </button>
      </div>
    </div>
  );
};

export default function Cart() {
  const router = useRouter();
  const { user, isInitialized } = useAuth();
  const { getCart, updateCart, removeFromCart, clearCart } = useCart();
  const { getShopStatus } = useProducts();
  const { apiRequest } = useApi();
  const { getStatus: getUserAgentStatus } = useUserAgentStatus();
  const { location, openLocationModal, revision: locationRevision, isLoading: locationLoading, forceSelection, forceReselectAddress } = useLocation();
  const { toast, showToast, hideToast } = useToast();

  const [cart, setCart] = useState({ items: [], total_quantity: 0, total_price: 0, lottery_threshold: 10 });
  const [isLoading, setIsLoading] = useState(true);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [error, setError] = useState('');
  const [shopOpen, setShopOpen] = useState(true);
  const [shopNote, setShopNote] = useState('');
  const [reservationAllowed, setReservationAllowed] = useState(false);
  const [cycleLocked, setCycleLocked] = useState(false);
  const [eligibleRewards, setEligibleRewards] = useState([]);
  const [autoGifts, setAutoGifts] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [selectedCouponId, setSelectedCouponId] = useState(null);
  const [applyCoupon, setApplyCoupon] = useState(false);
  const [infoMessage, setInfoMessage] = useState('');
  const [deliveryConfig, setDeliveryConfig] = useState({ delivery_fee: 1.0, free_delivery_threshold: 10.0 });
  const [addressValidation, setAddressValidation] = useState(createDefaultValidation());
  const [shopClosedModalOpen, setShopClosedModalOpen] = useState(false);
  const shopName = getShopName();
  const pageTitle = `购物车 - ${shopName}`;

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

  const normalizeStockValue = useCallback((item) => {
    if (!item || item.is_not_for_sale) {
      return Number.POSITIVE_INFINITY;
    }
    const rawStock = item.stock;
    if (rawStock === '∞') {
      return Number.POSITIVE_INFINITY;
    }
    const numeric = Number(rawStock);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
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
    if (!router.isReady || !isInitialized) return;
    if (!user) {
      const redirect = encodeURIComponent(router.asPath || '/cart');
      router.replace(`/login?redirect=${redirect}`);
      return;
    }
  }, [user, isInitialized, router, router.asPath, router.isReady]);

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
        setAddressValidation(createDefaultValidation());
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
        console.warn('Failed to fetch delivery fee config:', e);
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
    // 只有当用户类型是 user、地址未准备好、且地址不在加载中时，才显示提示
    if (user?.type === 'user' && !locationReady && !locationLoading) {
      setInfoMessage('请选择配送地址以查看购物车。');
    } else if (user?.type === 'user' && locationReady) {
      // 地址准备好后，清除之前可能设置的提示消息
      setInfoMessage(prev => prev === '请选择配送地址以查看购物车。' ? '' : prev);
    }
  }, [user, locationReady, locationLoading]);

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
  const handleCheckout = async () => {
    if (isCheckingOut) return;
    if (cycleLocked) {
      showToast('暂时无法结算，请联系管理员');
      return;
    }
    if (closedBlocked) {
      showToast('当前打烊期间仅支持预约商品，请先移除非预约商品后再试');
      return;
    }
    if (addressInvalid) {
      showToast(addressAlertMessage || '配送地址不可用，请重新选择');
      openLocationModal();
      return;
    }
    if (!locationReady) {
      showToast('请先选择配送地址以完成结算');
      openLocationModal();
      return;
    }

    setIsCheckingOut(true);
    try {
      const latestCart = await getCart();
      if (latestCart?.data) {
        setCart(latestCart.data);
        setAddressValidation(normalizeValidation(latestCart?.data?.address_validation));
      }
      const latestItems = latestCart?.data?.items || cart.items || [];
      const outOfStockNames = findOutOfStockItems(latestItems);
      if (outOfStockNames.length > 0) {
        showToast(`以下商品缺货：${outOfStockNames.join('、')}`);
        return;
      }

      const reservationFlag = shouldReserve ? '1' : '0';
      if (applyCoupon && selectedCouponId) {
        router.push(`/checkout?apply=1&coupon_id=${encodeURIComponent(selectedCouponId)}&reservation=${reservationFlag}`);
      } else {
        router.push(`/checkout?apply=0&reservation=${reservationFlag}`);
      }
    } catch (err) {
      showToast(err.message || '检查库存失败，请稍后重试');
    } finally {
      setIsCheckingOut(false);
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

        const locked = !!res.data?.cycle_locked;
        const open = !!res.data?.is_open && !locked;
        setCycleLocked(locked);
        setShopOpen(open);
        setReservationAllowed(locked ? false : !!res.data?.allow_reservation);

        if (locked) {
          setShopNote('暂时无法结算，请联系管理员');
        } else if (open) {
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
        setCycleLocked(false);
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
        <title>{pageTitle}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>{`
          .cart-grid { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 32px; align-items: start; }
          @media (max-width: 960px) {
            .cart-grid { grid-template-columns: minmax(0, 1fr); gap: 20px; }
            .cart-grid .lg\\:hidden { display: block !important; }
            .cart-grid .hidden.lg\\:block { display: none !important; }
          }
          @media (min-width: 961px) {
            .cart-grid .lg\\:hidden { display: none !important; }
            .cart-grid .hidden.lg\\:block { display: block !important; }
          }
          @keyframes cartRevealUp {
            from { opacity: 0; transform: translateY(24px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .cart-reveal {
            animation: cartRevealUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
          }
          .cart-d0 { animation-delay: 0ms; }
          .cart-d1 { animation-delay: 60ms; }
          .cart-d2 { animation-delay: 120ms; }
          .cart-d3 { animation-delay: 180ms; }
          .cart-d4 { animation-delay: 240ms; }
          .cart-d5 { animation-delay: 300ms; }
          .cart-d6 { animation-delay: 360ms; }
          @media (prefers-reduced-motion: reduce) {
            .cart-reveal { animation: none !important; opacity: 1 !important; transform: none !important; }
          }
          .cart-coupon-scroll { scrollbar-width: thin; scrollbar-color: #DDD8D0 transparent; }
          .cart-coupon-scroll::-webkit-scrollbar { height: 6px; }
          .cart-coupon-scroll::-webkit-scrollbar-track { background: transparent; }
          .cart-coupon-scroll::-webkit-scrollbar-thumb { background: #DDD8D0; border-radius: 3px; }
          .cart-coupon-scroll::-webkit-scrollbar-thumb:hover { background: #B0AEA5; }
          @media (max-width: 640px) {
            .cart-coupon-scroll { scrollbar-width: none; }
            .cart-coupon-scroll::-webkit-scrollbar { display: none; }
            .cart-page-main { padding: 20px 16px 60px !important; }
            /* 所有卡片内 px-6 (24px) 缩为 16px */
            .cart-page-main [class*="px-6"] { padding-left: 16px !important; padding-right: 16px !important; }
            .cart-item-pad { padding-left: 12px !important; padding-right: 12px !important; gap: 12px !important; }
            .cart-item-img { width: 56px !important; height: 56px !important; }
            .cart-title-row { gap: 8px !important; }
            .cart-addr-btn { padding: 5px 8px !important; gap: 5px !important; }
            .cart-addr-btn span { max-width: 140px !important; font-size: 12px !important; }
            .cart-back-link { display: inline-flex !important; }
            /* 摘要内 mx-6 缩为 16px */
            .cart-page-main [class*="mx-6"] { margin-left: 16px !important; margin-right: 16px !important; }
          }
        `}</style>
      </Head>
      <Script
        id="dotlottie-wc"
        src="https://unpkg.com/@lottiefiles/dotlottie-wc@0.8.1/dist/dotlottie-wc.js"
        type="module"
        strategy="afterInteractive"
      />


      <div className={`min-h-screen pt-16 ${!isLoading && (!cart.items || cart.items.length === 0) ? 'overflow-hidden h-screen' : ''}`} style={{ background: '#FDFBF7', WebkitFontSmoothing: 'antialiased', overflowX: 'hidden' }}>
        <motion.main
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="pb-20 cart-page-main"
          style={{ maxWidth: 1200, margin: '0 auto', padding: '32px clamp(20px, 5vw, 64px) 80px' }}
        >
          {/* 页头 */}
          <div className="mb-1 cart-reveal cart-d0">
            <Link href="/shop" className="cart-back-link hidden items-center gap-1.5 text-[14px] text-[#6B6860] hover:text-[#D97757] transition-colors mb-4">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              继续购物
            </Link>
            <div className="cart-title-row flex items-center justify-between gap-4">
              <div className="flex items-baseline gap-4">
                <h1 className="text-[#141413]" style={{ fontFamily: "'LXGW WenKai', 'Songti SC', serif", fontSize: 'clamp(28px, 4vw, 38px)', fontWeight: 400, letterSpacing: '-0.01em', lineHeight: 1.3 }}>
                  购物车
                </h1>
                {cart.total_quantity > 0 && (
                  <span className="text-[14px] text-[#B0AEA5] font-medium px-3 py-0.5 rounded-full" style={{ background: 'rgba(217,119,87,0.1)' }}>
                    {cart.total_quantity} 件商品
                  </span>
                )}
              </div>
              {/* 地址（右侧紧凑） */}
              {user?.type === 'user' && (
                <button
                  onClick={openLocationModal}
                  className="cart-addr-btn flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors hover:border-[#D97757]"
                  style={{ background: '#FFFFFF', border: '1px solid #E8E2D8' }}
                >
                  <svg width="14" height="14" viewBox="0 0 18 18" fill="none" className="flex-shrink-0"><path d="M9 1.5C5.96 1.5 3.5 3.96 3.5 7c0 4.5 5.5 9.5 5.5 9.5s5.5-5 5.5-9.5c0-3.04-2.46-5.5-5.5-5.5z" stroke="#D97757" strokeWidth="1.4"/><circle cx="9" cy="7" r="2" stroke="#D97757" strokeWidth="1.4"/></svg>
                  <span className="text-[13px] font-medium text-[#141413] truncate max-w-[220px]">{displayLocation}</span>
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="flex-shrink-0 text-[#B0AEA5]"><path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
              )}
            </div>
          </div>

          {/* 加载骨架屏 */}
          {isLoading ? (
            <div className="mt-8 rounded-2xl overflow-hidden" style={{ background: '#FFFFFF', border: '1px solid #E8E2D8', maxWidth: '100%' }}>
              <div className="px-6 py-4 flex items-center gap-2 text-[15px] font-medium text-[#141413]" style={{ borderBottom: '1px solid #E8E2D8' }}>
                <span className="w-5 h-5 rounded bg-[#F5F2ED] animate-pulse"></span>
                <span className="w-16 h-4 rounded bg-[#F5F2ED] animate-pulse"></span>
              </div>
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center gap-4 py-4 px-6" style={{ borderBottom: i < 2 ? '1px solid #E8E2D8' : 'none' }}>
                  <div className="w-[68px] h-[68px] rounded-lg animate-pulse" style={{ background: '#F5F2ED' }} />
                  <div className="flex-1">
                    <div className="h-4 rounded w-3/4 mb-2 animate-pulse" style={{ background: '#E8E2D8' }} />
                    <div className="h-3 rounded w-1/2 animate-pulse" style={{ background: '#E8E2D8' }} />
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="h-5 rounded w-16 animate-pulse" style={{ background: '#E8E2D8' }} />
                    <div className="h-[30px] rounded w-24 animate-pulse" style={{ background: '#E8E2D8' }} />
                  </div>
                </div>
              ))}
            </div>
          ) : cart.items && cart.items.length > 0 ? (
            <div className="cart-grid mt-8">
              {/* ──── 左侧内容 ──── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0, maxWidth: '100%' }}>
                {/* 预约提示 */}
                {reservationFromClosure && (
                  <div className="rounded-lg px-4 py-3 text-[13px] text-[#788C5D] flex items-center gap-2" style={{ background: 'rgba(120,140,93,0.06)', border: '1px solid rgba(120,140,93,0.15)' }}>
                    <i className="fas fa-calendar-check text-[12px]"></i>
                    打烊中，支持预约下单
                  </div>
                )}

                {/* 提示信息 */}
                {addressInvalid && (
                  <div className="flex items-center gap-2 rounded-lg px-4 py-3 text-[13px] text-[#C0453A]" style={{ background: 'rgba(192,69,58,0.06)', border: '1px solid rgba(192,69,58,0.15)' }}>
                    <span className="flex-1">{addressAlertMessage}</span>
                    <button onClick={openLocationModal} className="font-medium text-[#C0453A] underline">修改</button>
                  </div>
                )}
                {infoMessage && (
                  <div className="flex items-center gap-2 rounded-lg px-4 py-3 text-[13px] text-[#788C5D]" style={{ background: 'rgba(120,140,93,0.06)', border: '1px solid rgba(120,140,93,0.15)' }}>
                    <span className="flex-1">{infoMessage}</span>
                    <button onClick={() => setInfoMessage('')} className="text-[#B0AEA5] hover:text-[#141413] transition-colors">
                      <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                    </button>
                  </div>
                )}
                {error && (
                  <div className="rounded-lg px-4 py-3 text-[13px] text-[#C0453A]" style={{ background: 'rgba(192,69,58,0.06)', border: '1px solid rgba(192,69,58,0.15)' }}>
                    {error}
                  </div>
                )}

                {/* 商品清单 */}
                <div className="rounded-2xl overflow-hidden cart-reveal cart-d1" style={{ background: '#FFFFFF', border: '1px solid #E8E2D8' }}>
                  <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #E8E2D8' }}>
                    <span className="flex items-center gap-2 text-[15px] font-medium text-[#141413]">
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M6.5 1.5L3 5.5v10a1 1 0 001 1h10a1 1 0 001-1v-10L11.5 1.5h-5z" stroke="#D97757" strokeWidth="1.3" strokeLinejoin="round"/><path d="M3 5.5h12" stroke="#D97757" strokeWidth="1.3"/><path d="M6.5 8.5a2.5 2.5 0 005 0" stroke="#D97757" strokeWidth="1.3" strokeLinecap="round"/></svg>
                      商品清单
                    </span>
                    {cart.items.length > 0 && (
                      <button onClick={handleClearCart} className="text-[13px] text-[#B0AEA5] hover:text-[#C0453A] transition-colors">清空</button>
                    )}
                  </div>
                  <div>
                    <AnimatePresence mode="popLayout">
                      {cart.items
                        .sort((a, b) => {
                          const aIsNonSellable = Boolean(a.is_not_for_sale);
                          const bIsNonSellable = Boolean(b.is_not_for_sale);
                          if (aIsNonSellable && !bIsNonSellable) return 1;
                          if (!aIsNonSellable && bIsNonSellable) return -1;
                          return 0;
                        })
                        .map((item, index) => (
                          <CartItem
                            key={`${item.product_id}-${item.variant_id || 'default'}`}
                            item={{...item, _animIndex: index}}
                            onUpdateQuantity={handleUpdateQuantity}
                            onRemove={handleRemoveItem}
                          />
                        ))}
                    </AnimatePresence>
                  </div>
                </div>

                {/* 优惠券横向滚动（点击选择/取消） */}
                {coupons && coupons.length > 0 && (
                  <div className="rounded-2xl overflow-hidden cart-reveal cart-d2" style={{ background: '#FFFFFF', border: '1px solid #E8E2D8' }}>
                    <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #E8E2D8' }}>
                      <span className="flex items-center gap-2 text-[15px] font-medium text-[#141413]">
                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="1.5" y="4" width="15" height="10" rx="2" stroke="#D97757" strokeWidth="1.3"/><circle cx="1.5" cy="9" r="2" fill="#F5F2ED" stroke="#D97757" strokeWidth="1.3"/><circle cx="16.5" cy="9" r="2" fill="#F5F2ED" stroke="#D97757" strokeWidth="1.3"/><path d="M7 4v10" stroke="#D97757" strokeWidth="1.3" strokeDasharray="2 2"/></svg>
                        可用优惠券
                      </span>
                      <span className="text-[12px] text-[#B0AEA5]">{coupons.length} 张</span>
                    </div>
                    {(() => {
                      const sub = cart?.total_price || 0;
                      // 按面额+有效期聚合
                      const groups = {};
                      for (const c of coupons) {
                        const k = `${parseFloat(c.amount) || 0}|${c.expires_at || 'forever'}`;
                        if (!groups[k]) groups[k] = { list: [], amount: parseFloat(c.amount) || 0, expires_at: c.expires_at || null };
                        groups[k].list.push(c);
                      }
                      const keys = Object.keys(groups).sort((a, b) => (groups[b].amount - groups[a].amount));
                      return (
                        <div className="cart-coupon-scroll flex gap-3 px-6 py-4 overflow-x-auto">
                          {keys.map((k) => {
                            const g = groups[k];
                            const usable = sub > g.amount;
                            // 选中状态：当前选中的券在这个组内
                            const isActive = applyCoupon && g.list.some(c => c.id === selectedCouponId);
                            return (
                              <div
                                key={k}
                                className="flex-shrink-0 relative flex items-center gap-3 px-4 py-3.5 rounded-lg min-w-[170px] cursor-pointer transition-all"
                                style={{
                                  border: isActive ? '1.5px solid #D97757' : `1.5px dashed ${usable ? '#DDD8D0' : '#E8E2D8'}`,
                                  background: isActive ? 'rgba(217,119,87,0.08)' : '#FAF8F4',
                                  opacity: usable ? 1 : 0.45,
                                  pointerEvents: usable ? 'auto' : 'none',
                                }}
                                onClick={() => {
                                  if (!usable) return;
                                  if (isActive) {
                                    setApplyCoupon && setApplyCoupon(false);
                                  } else {
                                    // 选这组里的第一张券
                                    setSelectedCouponId && setSelectedCouponId(g.list[0].id);
                                    setApplyCoupon && setApplyCoupon(true);
                                  }
                                }}
                              >
                                {isActive && (
                                  <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#D97757] text-white text-[11px] flex items-center justify-center">✓</span>
                                )}
                                <span className="text-[22px] font-semibold text-[#D97757] leading-none" style={{ fontFamily: "'Lora', serif" }}>¥{g.amount}</span>
                                <div>
                                  <div className="text-[12px] text-[#6B6860] leading-snug">{g.expires_at ? new Date(g.expires_at.replace(' ', 'T') + 'Z').toLocaleDateString() + ' 到期' : '永久有效'}</div>
                                  {g.list.length > 1 && (
                                    <div className="text-[11px] text-[#B0AEA5]">×{g.list.length}</div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* 抽奖奖品 */}
                {eligibleRewards.length > 0 && cart?.lottery_enabled !== false && (
                  <div className="rounded-2xl overflow-hidden cart-reveal cart-d3" style={{ background: '#FFFFFF', border: '1px solid #E8E2D8' }}>
                    <div className="flex items-center gap-2 px-6 py-4 text-[15px] font-medium text-[#141413]" style={{ borderBottom: '1px solid #E8E2D8' }}>🎁 抽奖奖品</div>
                    <div className="px-6 py-4">
                      {eligibleRewards.map((r) => {
                        const meet = (cart?.total_price ?? 0) >= lotteryThreshold;
                        return (
                          <div key={r.id} className="flex items-center justify-between py-2 text-[13px]" style={{ color: meet ? '#6B8F47' : '#B0AEA5' }}>
                            <div>
                              <span className="font-medium">{r.prize_name || '奖品'}</span> x{r.prize_quantity || 1}
                              {(r.prize_product_name || r.prize_variant_name) && <span className="text-[12px] ml-1">{r.prize_product_name || ''}{r.prize_variant_name ? `（${r.prize_variant_name}）` : ''}</span>}
                            </div>
                            <div className="text-right text-[12px]">{meet ? `满${formattedLotteryThreshold}元随单配送` : `差 ¥${Math.max(0, lotteryThreshold - (cart?.total_price ?? 0)).toFixed(2)}`}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 满额门槛 */}
                {cart.items.length > 0 && autoGifts.length > 0 && (() => {
                  const cartTotal = cart?.total_price || 0;
                  return (
                    <div className="rounded-2xl overflow-hidden cart-reveal cart-d4" style={{ background: '#FFFFFF', border: '1px dashed #DDD8D0' }}>
                      <div className="flex items-center gap-2 px-6 py-4 text-[15px] font-medium text-[#141413]" style={{ borderBottom: '1px solid #E8E2D8' }}>🎁 满额门槛</div>
                      <div className="px-6 py-4 space-y-2">
                        {autoGifts.map((threshold, index) => {
                          const thresholdAmount = threshold.threshold_amount || 0;
                          const unlocked = cartTotal >= thresholdAmount;
                          const rewardParts = [];
                          if (threshold.gift_products && threshold.selected_product_name) rewardParts.push(threshold.selected_product_name);
                          if (threshold.gift_coupon && threshold.coupon_amount > 0) rewardParts.push(`${threshold.coupon_amount}元券`);
                          const rewardText = rewardParts.length > 0 ? rewardParts.join(' + ') : '暂无奖励';
                          return (
                            <div key={threshold.threshold_amount || index} className="flex items-center justify-between text-[13px] py-1.5" style={{ color: unlocked ? '#6B8F47' : '#B0AEA5' }}>
                              <span className="font-medium">满 ¥{thresholdAmount} — {rewardText}</span>
                              <span className="text-[12px]">{unlocked ? '✓ 已达标' : `差 ¥${(thresholdAmount - cartTotal).toFixed(2)}`}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* ──── 右侧订单摘要 ──── */}
              <div className="hidden lg:block cart-reveal cart-d2" style={{ position: 'sticky', top: 24 }}>
                <OrderSummary
                  cart={cart} onCheckout={handleCheckout} isClosed={!shopOpen} cycleLocked={cycleLocked}
                  reservationAllowed={reservationAllowed} shouldReserve={shouldReserve}
                  reservationFromClosure={reservationFromClosure} hasReservationItems={hasReservationItems}
                  allReservationItems={allReservationItems} coupons={coupons}
                  selectedCouponId={selectedCouponId} setSelectedCouponId={setSelectedCouponId}
                  applyCoupon={applyCoupon} setApplyCoupon={setApplyCoupon}
                  addressValidation={addressValidation} onFixAddress={openLocationModal}
                  locationReady={locationReady} lotteryThreshold={lotteryThreshold}
                  lotteryEnabled={cart?.lottery_enabled !== false} deliveryConfig={deliveryConfig}
                  isProcessingCheckout={isCheckingOut}
                />
              </div>
              {/* 移动端摘要 */}
              <div className="lg:hidden cart-reveal cart-d5" style={{ gridColumn: '1 / -1' }}>
                <OrderSummary
                  cart={cart} onCheckout={handleCheckout} isClosed={!shopOpen} cycleLocked={cycleLocked}
                  reservationAllowed={reservationAllowed} shouldReserve={shouldReserve}
                  reservationFromClosure={reservationFromClosure} hasReservationItems={hasReservationItems}
                  allReservationItems={allReservationItems} coupons={coupons}
                  selectedCouponId={selectedCouponId} setSelectedCouponId={setSelectedCouponId}
                  applyCoupon={applyCoupon} setApplyCoupon={setApplyCoupon}
                  addressValidation={addressValidation} onFixAddress={openLocationModal}
                  locationReady={locationReady} lotteryThreshold={lotteryThreshold}
                  lotteryEnabled={cart?.lottery_enabled !== false} deliveryConfig={deliveryConfig}
                  isProcessingCheckout={isCheckingOut}
                />
              </div>
            </div>
          ) : (
            /* 空状态 */
            <div className="flex flex-col items-center justify-center cart-reveal cart-d1" style={{ height: 'calc(100dvh - 240px)' }}>
              <div className="w-20 h-20 mb-5 rounded-full flex items-center justify-center" style={{ background: '#F5F2ED' }}>
                <i className="fas fa-shopping-cart text-[28px] text-[#D97757] opacity-60"></i>
              </div>
              <p className="text-[18px] text-[#B0AEA5]" style={{ fontFamily: "'LXGW WenKai', 'Songti SC', serif" }}>购物车是空的</p>
              <Link href="/shop" className="inline-block mt-6 px-8 py-3 text-[15px] font-medium text-[#FAF9F5] rounded-full transition-all hover:-translate-y-px hover:shadow-lg" style={{ background: '#141413', letterSpacing: '0.02em' }}>
                去逛逛
              </Link>
            </div>
          )}
        </motion.main>
      </div>

      {/* 打烊提示模态框 */}
      {shopClosedModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-5" style={{ background: 'rgba(20,20,19,0.45)', backdropFilter: 'blur(6px)' }}>
          <div className="absolute inset-0" onClick={() => setShopClosedModalOpen(false)}></div>
          <div className="relative w-full max-w-[480px] rounded-3xl overflow-hidden" style={{ background: '#FFFFFF', boxShadow: '0 8px 32px rgba(20,20,19,0.10)' }}>
            <div className="flex items-center justify-between px-7 pt-6 pb-4">
              <h3 className="text-[20px] font-normal text-[#141413]" style={{ fontFamily: "'LXGW WenKai', 'Songti SC', serif" }}>店铺提醒</h3>
              <button onClick={() => setShopClosedModalOpen(false)} className="w-8 h-8 rounded-full flex items-center justify-center text-[#B0AEA5] hover:bg-[#F5F2ED] hover:text-[#141413] transition-colors">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </button>
            </div>
            <div className="px-7 pb-5">
              <SimpleMarkdown className="text-[14px] text-[#6B6860] leading-relaxed">
                {shopNote || '当前打烊，暂不支持结算，仅可加入购物车'}
              </SimpleMarkdown>
            </div>
            <div className="px-7 pb-6 flex gap-3 justify-end">
              <button onClick={() => setShopClosedModalOpen(false)} className="px-6 py-2.5 rounded-lg text-[14px] font-medium text-[#6B6860]" style={{ background: '#F5F2ED', border: '1px solid #DDD8D0' }}>
                取消
              </button>
              <button onClick={() => setShopClosedModalOpen(false)} className="px-6 py-2.5 rounded-lg text-[14px] font-medium text-[#FAF9F5]" style={{ background: '#141413' }}>
                知道了
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast message={toast.message} show={toast.visible} onClose={hideToast} />
    </>
  );
}
