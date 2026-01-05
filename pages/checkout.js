import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth, useCart, useApi, useUserAgentStatus } from '../hooks/useAuth';
import { useProducts } from '../hooks/useAuth';
import { useLocation } from '../hooks/useLocation';
import { usePaymentQr } from '../hooks/usePaymentQr';
import { useRouter } from 'next/router';
import Nav from '../components/Nav';
import AnimatedPrice from '../components/AnimatedPrice';
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

export default function Checkout() {
  const router = useRouter();
  const { user, isInitialized } = useAuth();
  const { getCart, clearCart } = useCart();
  const { apiRequest } = useApi();
  const { getShopStatus } = useProducts();
  const { getStatus: getUserAgentStatus } = useUserAgentStatus();
  const { getCachedPaymentQr, getPaymentQr, preloadPaymentQr } = usePaymentQr();
  const shopName = getShopName();
  
  const [cart, setCart] = useState({ items: [], total_quantity: 0, total_price: 0, lottery_threshold: 10 });
  const [deliveryConfig, setDeliveryConfig] = useState({ delivery_fee: 1.0, free_delivery_threshold: 10.0 });
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    dormitory: '',
    building: '',
    room: '',
    note: ''
  });
  const [fieldErrors, setFieldErrors] = useState({
    name: '',
    phone: '',
    room: ''
  });
  const { location, openLocationModal, revision: locationRevision, isLoading: locationLoading, forceReselectAddress } = useLocation();
  const [orderId, setOrderId] = useState(null);
  const [isCreatingPayment, setIsCreatingPayment] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [shopOpen, setShopOpen] = useState(true);
  const [shopNote, setShopNote] = useState('');
  const [reservationAllowed, setReservationAllowed] = useState(false);
  const [cycleLocked, setCycleLocked] = useState(false);
  const [eligibleRewards, setEligibleRewards] = useState([]);
  const [autoGifts, setAutoGifts] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [selectedCouponId, setSelectedCouponId] = useState(null);
  const [applyCoupon, setApplyCoupon] = useState(false);
  const [showCouponDropdown, setShowCouponDropdown] = useState(false);
  const [couponDropdownDirection, setCouponDropdownDirection] = useState('down'); // 'up' 或 'down'
  const couponDropdownRef = useRef(null);
  const [addressValidation, setAddressValidation] = useState(createDefaultValidation());
  // 抽奖弹窗
  const [lotteryOpen, setLotteryOpen] = useState(false);
  const [lotteryNames, setLotteryNames] = useState([]);
  // 支付收款码
  const [paymentQr, setPaymentQr] = useState(null);
  const [lotteryResult, setLotteryResult] = useState('');
  const [lotteryDisplay, setLotteryDisplay] = useState('');
  const [lotteryPrize, setLotteryPrize] = useState(null);
  const [spinning, setSpinning] = useState(false);
  // 成功动画弹窗
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);

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

  // 验证个人信息字段，失败时聚焦到第一个错误字段
  const validatePersonalInfo = () => {
    const errors = {
      name: '',
      phone: '',
      room: ''
    };

    if (!formData.name) {
      errors.name = '请输入昵称';
    }

    if (!formData.phone) {
      errors.phone = '请输入手机号';
    } else {
      // 简单的手机号验证
      const phoneRegex = /^1[3-9]\d{9}$/;
      if (!phoneRegex.test(formData.phone)) {
        errors.phone = '请输入正确的手机号';
      }
    }

    if (!formData.room) {
      errors.room = '请输入房间号';
    }

    setFieldErrors(errors);

    // 如果有错误，聚焦到第一个错误字段
    const firstError = errors.name || errors.phone || errors.room;
    if (firstError) {
      const firstErrorField = errors.name ? 'name' : (errors.phone ? 'phone' : 'room');
      const input = document.getElementById(firstErrorField);
      if (input) {
        input.focus();
        input.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return false;
    }

    return true;
  };

  const locationReady = user?.type !== 'user' || (location && location.address_id && location.building_id);
  const displayLocation = location
    ? `${location.dormitory || ''}${location.building ? '·' + location.building : ''}`.trim() || '已选择地址'
    : '未选择地址';

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
    const activeItems = (cart?.items || []).filter(item => {
      const isActive = !(item.is_active === 0 || item.is_active === false);
      const qty = Number(item.quantity || 0);
      return isActive && qty > 0;
    });
    if (activeItems.length === 0) return false;
    return activeItems.every(item => item.reservation_required);
  }, [cart?.all_reservation_items, cart?.items]);
  const closedReservationOnly = useMemo(
    () => !shopOpen && allReservationItems && ((cart?.total_quantity || 0) > 0),
    [shopOpen, allReservationItems, cart?.total_quantity]
  );
  const canReserveWhileClosed = useMemo(() => closedReservationOnly, [closedReservationOnly]);
  const reservationFromClosure = useMemo(() => canReserveWhileClosed, [canReserveWhileClosed]);
  const shouldReserve = useMemo(() => hasReservationItems || canReserveWhileClosed, [hasReservationItems, canReserveWhileClosed]);
  
  const addressInvalid = useMemo(() => (
    locationReady && addressValidation && addressValidation.is_valid === false
  ), [locationReady, addressValidation]);
  
  const addressAlertMessage = useMemo(() => (
    addressInvalid ? (addressValidation?.message || '配送地址不可用，请重新选择') : ''
  ), [addressInvalid, addressValidation]);

  const couponDiscountAmount = useMemo(() => {
    if (!(applyCoupon && selectedCouponId)) return 0;
    const coupon = coupons.find(c => c.id === selectedCouponId);
    return coupon ? (parseFloat(coupon.amount) || 0) : 0;
  }, [applyCoupon, selectedCouponId, coupons]);
  const payableAmount = useMemo(() => {
    const baseTotal = (cart?.payable_total ?? cart?.total_price) || 0;
    return Math.max(0, baseTotal - couponDiscountAmount);
  }, [cart?.payable_total, cart?.total_price, couponDiscountAmount]);
  // 打烊逻辑：开启预约时允许所有商品，未开启时仅允许预约商品
  const closedBlocked = !shopOpen && !reservationAllowed && !allReservationItems;
  const checkoutButtonLabel = useMemo(() => {
    if (!locationReady) return '请选择配送地址';
    if (addressInvalid) return addressAlertMessage || '配送地址不可用，请重新选择';
    if (cycleLocked) return '暂时无法结算，请联系管理员';
    if (closedBlocked) {
      return '打烊中 · 仅限预约商品';
    }
    if (closedReservationOnly) return `预约购买 ¥${payableAmount.toFixed(2)}`;
    if (!shopOpen && reservationAllowed) return `预约购买 ¥${payableAmount.toFixed(2)}`;
    if (hasReservationItems && shouldReserve) return `提交预约 ¥${payableAmount.toFixed(2)}`;
    return `立即支付 ¥${payableAmount.toFixed(2)}`;
  }, [locationReady, addressInvalid, addressAlertMessage, cycleLocked, closedBlocked, shopOpen, reservationAllowed, closedReservationOnly, payableAmount, hasReservationItems, shouldReserve]);

  const closedBlockedMessage = useMemo(() => {
    if (cycleLocked) {
      return '暂时无法结算，请联系管理员';
    }
    if (!shopOpen) {
      // 打烊时：未开启预约且不是全预约商品
      if (!reservationAllowed && !allReservationItems) {
        return '当前打烊期间仅支持预约商品，请移除非预约商品后再试';
      }
      // 其他情况显示打烊提示
      return shopNote ? `店铺已打烊：${shopNote}` : '店铺已打烊，暂不支持下单';
    }
    return '当前暂无法提交订单';
  }, [cycleLocked, shopOpen, reservationAllowed, allReservationItems, shopNote]);

  const lastInvalidKeyRef = useRef(null);
  const reselectInFlightRef = useRef(false);

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

  // 稍后支付：创建未支付订单，清空购物车并跳转到我的订单
  const handlePayLater = async () => {
    if (cycleLocked || closedBlocked) {
      alert(closedBlockedMessage);
      return;
    }
    if (!locationReady) {
      alert('请先选择配送地址');
      openLocationModal();
      return;
    }
    if (addressInvalid) {
      alert(addressAlertMessage || '配送地址不可用，请重新选择');
      openLocationModal();
      return;
    }
    
    // 验证个人信息字段
    if (!validatePersonalInfo()) {
      return;
    }

    try {
      // 创建订单（但不标记为已付款）
      const shippingInfo = {
        name: formData.name,
        phone: formData.phone,
        dormitory: location?.dormitory || formData.dormitory,
        building: location?.building || formData.building,
        room: formData.room,
        full_address: `${location?.dormitory || formData.dormitory} ${location?.building || formData.building} ${formData.room}`.trim(),
        address_id: location?.address_id || '',
        building_id: location?.building_id || '',
        agent_id: location?.agent_id || ''
      };
      
      const orderResponse = await apiRequest('/orders', {
        method: 'POST',
        body: JSON.stringify({
          shipping_info: shippingInfo,
          payment_method: 'wechat',
          note: formData.note,
          coupon_id: applyCoupon ? (selectedCouponId || null) : null,
          apply_coupon: !!applyCoupon,
          reservation_requested: shouldReserve
        })
      });
      
      if (!orderResponse.success) {
        throw new Error(orderResponse.message || '订单创建失败');
      }
      
      // 清空购物车并跳转
      try { await clearCart(); } catch (e) {}
      setShowPayModal(false);
      setPaymentQr(null);
      router.push('/orders');
      
    } catch (e) {
      alert(e.message || '创建订单失败');
    }
  };

  // 检查登录状态
  useEffect(() => {
    if (!router.isReady || !isInitialized) return;
    if (!user) {
      const redirect = encodeURIComponent(router.asPath || '/checkout');
      router.replace(`/login?redirect=${redirect}`);
      return;
    }
    // 同步店铺/代理状态
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
            ? '当前区域代理已暂停营业，暂不支持结算' 
            : '店铺已暂停营业，暂不支持结算';
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
  }, [user, isInitialized, router, router.asPath, router.isReady, location, getUserAgentStatus]);

  // 加载购物车数据
  const loadCart = async () => {
    setIsLoading(true);
    setError('');

    if (user && user.type === 'user' && (!location || !location.address_id || !location.building_id)) {
      setIsLoading(false);
      setCart({ items: [], total_quantity: 0, total_price: 0, lottery_threshold: 10 });
      setEligibleRewards([]);
      setAutoGifts([]);
      setCoupons([]);
      setSelectedCouponId(null);
      setApplyCoupon(false);
      setAddressValidation(createDefaultValidation());
      return;
    }

    try {
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
      // 加载我的优惠券并默认选择
      try {
        const resp = await apiRequest('/coupons/my');
        const list = resp?.data?.coupons || [];
        setCoupons(list);
        const sub = data?.data?.total_price || 0;
        const fromQuery = (router?.query?.coupon_id || '').toString();
        const applyParam = (router?.query?.apply || router?.query?.apply_coupon || '').toString().toLowerCase();
        if (applyParam === '0' || applyParam === 'false') {
          setSelectedCouponId(null);
          setApplyCoupon(false);
        } else if (fromQuery && list.some(x => x.id === fromQuery) && sub > (parseFloat(list.find(x => x.id === fromQuery).amount) || 0)) {
          setSelectedCouponId(fromQuery);
          setApplyCoupon(true);
        } else {
          const applicable = list.filter(x => sub > (parseFloat(x.amount) || 0));
          if (applicable.length > 0) {
            applicable.sort((a, b) => (parseFloat(b.amount) || 0) - (parseFloat(a.amount) || 0));
            setSelectedCouponId(applicable[0].id);
            setApplyCoupon(true);
          } else {
            setSelectedCouponId(null);
            setApplyCoupon(false);
          }
        }
      } catch (e) {
        setCoupons([]);
        setSelectedCouponId(null);
        setApplyCoupon(false);
      }
      
      // 如果购物车为空，跳转到购物车页面
      if (!data.data.items || data.data.items.length === 0) {
        router.push('/cart');
        return;
      }
      
      // 自动填充用户信息
      if (user) {
        setFormData(prev => ({
          ...prev,
          name: user.name || ''
        }));
      }
    } catch (err) {
      setError(err.message || '加载购物车失败');
      setAddressValidation(createDefaultValidation());
    } finally {
      setIsLoading(false);
    }
  };

  // 表单输入处理
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    
    // 清除该字段的错误信息
    if (fieldErrors[name]) {
      setFieldErrors(prev => ({ ...prev, [name]: '' }));
    }
    
    if (name === 'dormitory') {
      // 切换园区时清空已选楼栋
      setFormData({ ...formData, dormitory: value, building: '' });
    } else {
      setFormData({
        ...formData,
        [name]: value
      });
    }
  };

  // 表单提交处理
  const handleSubmit = (e) => {
    e.preventDefault(); // 防止默认表单提交行为
    // 当用户按回车或点击提交时，触发支付创建
    if (!isCreatingPayment && shopOpen && !cycleLocked) handleCreatePayment();
  };

  // 获取收款码并打开支付弹窗（不创建订单）
  const handleCreatePayment = async () => {
    if (cycleLocked || closedBlocked) {
      alert(closedBlockedMessage);
      return;
    }
    if (addressInvalid) {
      alert(addressAlertMessage || '配送地址不可用，请重新选择');
      openLocationModal();
      return;
    }
    
    // 验证个人信息字段
    if (!validatePersonalInfo()) {
      return;
    }
    
    // 验证配送地址（这时才弹出配送地址设置）
    if (!location || !location.address_id || !location.building_id) {
      alert('请填写完整的收货信息并选择配送地址');
      openLocationModal();
      return;
    }

    setIsCreatingPayment(true);
    setError('');
    
    try {
      // 优先使用预加载的收款码，否则实时获取
      const buildingId = location?.building_id;
      const addressId = location?.address_id;
      
      // 先尝试获取缓存的收款码（同步，无等待）
      let qr = getCachedPaymentQr(addressId, buildingId);
      
      if (!qr) {
        // 如果缓存中没有，则异步获取
        qr = await getPaymentQr(addressId, buildingId);
      }
      
      if (qr) {
        setPaymentQr(qr);
      } else {
        // 没有收款码
        setPaymentQr({
          owner_type: 'default',
          name: "无收款码"
        });
      }
      
      // 显示支付弹窗
      setShowPayModal(true);

    } catch (error) {
      const message = error?.message || '获取收款码失败';
      if (/地址不存在|未启用/.test(message)) {
        alert('地址不存在或未启用，请联系管理员');
        setShowPayModal(false);
        setPaymentQr(null);
        return;
      }
      console.warn('获取收款码失败:', error);
      setPaymentQr({
        owner_type: 'default',
        name: "无收款码"
      });
      setShowPayModal(true);
    } finally {
      setIsCreatingPayment(false);
    }
  };

  // 用户点击"已付款"：创建订单并标记为已确认，清空购物车并跳转订单页
  const handleMarkPaid = async () => {
    if (cycleLocked || closedBlocked) {
      alert(closedBlockedMessage);
      return;
    }
    if (!locationReady) {
      alert('请先选择配送地址');
      openLocationModal();
      return;
    }
    if (addressInvalid) {
      alert(addressAlertMessage || '配送地址不可用，请重新选择');
      openLocationModal();
      return;
    }
    
    // 验证个人信息字段
    if (!validatePersonalInfo()) {
      return;
    }

    try {
      // 创建订单
      const shippingInfo = {
        name: formData.name,
        phone: formData.phone,
        dormitory: location?.dormitory || formData.dormitory,
        building: location?.building || formData.building,
        room: formData.room,
        full_address: `${location?.dormitory || formData.dormitory} ${location?.building || formData.building} ${formData.room}`.trim(),
        address_id: location?.address_id || '',
        building_id: location?.building_id || '',
        agent_id: location?.agent_id || ''
      };
      
      const orderResponse = await apiRequest('/orders', {
        method: 'POST',
        body: JSON.stringify({
          shipping_info: shippingInfo,
          payment_method: 'wechat',
          note: formData.note,
          coupon_id: applyCoupon ? (selectedCouponId || null) : null,
          apply_coupon: !!applyCoupon,
          reservation_requested: shouldReserve
        })
      });
      
      if (!orderResponse.success) {
        throw new Error(orderResponse.message || '订单创建失败');
      }
      
      const createdOrderId = orderResponse.data.order_id;
      setOrderId(createdOrderId);
      
      // 标记订单为已付款
      const res = await apiRequest(`/orders/${createdOrderId}/mark-paid`, { method: 'POST' });
      if (res.success) {
        try { await clearCart(); } catch (e) {}
        setShowPayModal(false);
        setPaymentQr(null);
        
        // 触发抽奖动画并自动跳转到订单页（仅在抽奖启用时）
        let hasLottery = false;
        const lotteryEnabled = cart?.lottery_enabled !== false;
        if (lotteryEnabled) {
          try {
            const draw = await apiRequest(`/orders/${createdOrderId}/lottery/draw`, { method: 'POST' });
          if (draw.success) {
            const resultName = draw.data?.prize_name || '';
            const names = (draw.data?.names && draw.data.names.length > 0)
              ? draw.data.names
              : (resultName ? [resultName] : ['谢谢参与']);
            setLotteryPrize(draw.data?.prize || null);
            setLotteryNames(names);
            setLotteryResult(resultName);
            setLotteryDisplay(names[0] || '');
            setLotteryOpen(true);
            setSpinning(true);
            hasLottery = true;
            const duration = 2000;
            const interval = 80;
            let idx = 0;
            const timer = setInterval(() => {
              idx = (idx + 1) % names.length;
              setLotteryDisplay(names[idx]);
            }, interval);
            setTimeout(() => {
              clearInterval(timer);
              setSpinning(false);
              setLotteryDisplay(resultName || names[0]);
              // 不再自动跳转，让用户看到抽奖结果
            }, duration + 200);
          }
          } catch (e) {
            setLotteryPrize(null);
          }
        }
        // 如果没有抽奖，直接显示成功动画
        if (!hasLottery) {
          setShowSuccessAnimation(true);
          // 动画播放完成前跳转，让过渡更流畅
          setTimeout(() => {
            router.push('/orders');
          }, 1700);
        }
      } else {
        alert(res.message || '操作失败');
      }
    } catch (err) {
      alert(err.message || '操作失败');
    }
  };

  // 预加载 Lottie 动画
  useEffect(() => {
    // 在页面加载时预加载动画,避免点击付款时卡顿
    if (typeof window !== 'undefined' && window.customElements) {
      const preloadAnimation = () => {
        try {
          // 创建一个隐藏的 dotlottie-wc 元素来预加载动画
          const tempElement = document.createElement('dotlottie-wc');
          tempElement.setAttribute('src', 'https://lottie.host/f3c97f35-f5a9-4cf8-9afa-d6084a659237/2S8UtFVgcc.lottie');
          tempElement.style.cssText = 'position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none;';
          document.body.appendChild(tempElement);
          
          // 5秒后移除预加载元素
          setTimeout(() => {
            if (tempElement && tempElement.parentNode) {
              tempElement.parentNode.removeChild(tempElement);
            }
          }, 5000);
        } catch (e) {
          console.warn('预加载动画失败:', e);
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

  // 初始化加载
  useEffect(() => {
    if (!user) return;
    loadCart();
    (async () => {
      try {
        const res = await apiRequest('/profile/shipping');
        const ship = res?.data?.shipping;
        if (ship) {
          setFormData(prev => ({
            ...prev,
            name: ship.name || prev.name,
            phone: ship.phone || prev.phone,
            room: ship.room || prev.room,
          }));
        }
      } catch (e) {
        // ignore
      }
      
      // 获取配送费配置
      try {
        const deliveryRes = await apiRequest('/delivery-config');
        const config = deliveryRes?.data?.delivery_config;
        if (config) {
          setDeliveryConfig(config);
        }
      } catch (e) {
        console.warn('获取配送费配置失败:', e);
      }
    })();
  }, [user, locationRevision, location?.address_id, location?.building_id]);

  useEffect(() => {
    if (location) {
      setFormData(prev => ({
        ...prev,
        dormitory: location.dormitory || '',
        building: location.building || '',
      }));
    }
  }, [location]);

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

  // 如果用户未登录，不渲染内容
  if (!user) {
    return null;
  }

  return (
    <>
      <Head>
        <title>结算 - {shopName}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>

       <div className="min-h-screen" style={{
         background: 'linear-gradient(135deg, rgba(147, 197, 253, 0.2) 0%, rgba(252, 231, 243, 0.25) 50%, rgba(191, 219, 254, 0.2) 100%), #fafafa'
       }}>

        {/* 统一导航栏 */}
        <Nav active="checkout" />

        {/* 主要内容 */}
        <main className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pt-24">
          {/* 页面标题 */}
          <div className="text-center mb-12 animate-fade-in-up">
            <div className="flex justify-center mb-6">
              <div className="relative">
                <div className="absolute -inset-2 bg-gradient-to-r from-purple-500 to-pink-600 rounded-2xl blur opacity-60"></div>
                <div className="relative w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-600 rounded-2xl flex items-center justify-center shadow-2xl">
                  <i className="fas fa-credit-card text-white text-xl"></i>
                </div>
              </div>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">确认订单</h1>
            <p className="text-gray-700">请确认您的订单信息和收货地址</p>
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {/* 加载状态 */}
          {isLoading ? (
            <div className="space-y-6">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="animate-pulse space-y-4">
                  <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                  <div className="space-y-3">
                    <div className="h-4 bg-gray-200 rounded"></div>
                    <div className="h-4 bg-gray-200 rounded w-5/6"></div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="lg:grid lg:grid-cols-3 lg:gap-8">
              {/* 订单表单 */}
              <div className="lg:col-span-2 space-y-8">
                {/* 收货信息 */}
                <div className="card-glass p-8 border border-white/30 animate-fade-in-up" style={{ animationDelay: '0.1s', animationFillMode: 'both' }}>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-cyan-600 rounded-xl flex items-center justify-center">
                      <i className="fas fa-map-marker-alt text-white"></i>
                    </div>
                    <h2 className="text-xl font-semibold text-gray-900">收货信息</h2>
                  </div>
                  
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div>
                        <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                          <i className="fas fa-user mr-2"></i>昵称 *
                        </label>
                        <input
                          type="text"
                          id="name"
                          name="name"
                          required
                          value={formData.name}
                          onChange={handleInputChange}
                          className={`input-glass w-full text-gray-900 placeholder-gray-500 ${fieldErrors.name ? 'border-red-300 ring-2 ring-red-100' : ''}`}
                          placeholder="请输入您的昵称"
                        />
                        {fieldErrors.name && (
                          <p className="mt-2 text-sm text-red-600 flex items-center gap-1">
                            <i className="fas fa-exclamation-circle text-xs"></i>
                            {fieldErrors.name}
                          </p>
                        )}
                      </div>
                      
                      <div>
                        <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
                          <i className="fas fa-phone mr-2"></i>手机号 *
                        </label>
                        <input
                          type="tel"
                          id="phone"
                          name="phone"
                          required
                          value={formData.phone}
                          onChange={handleInputChange}
                          className={`input-glass w-full text-gray-900 placeholder-gray-500 ${fieldErrors.phone ? 'border-red-300 ring-2 ring-red-100' : ''}`}
                          placeholder="请输入手机号码"
                        />
                        {fieldErrors.phone && (
                          <p className="mt-2 text-sm text-red-600 flex items-center gap-1">
                            <i className="fas fa-exclamation-circle text-xs"></i>
                            {fieldErrors.phone}
                          </p>
                        )}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      {/* 配送区和楼栋容器 */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            <i className="fas fa-building mr-2"></i>配送区 *
                          </label>
                          <div className="input-glass w-full text-gray-900">
                            {locationLoading ? '加载中...' : (location?.dormitory || '未选择')}
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            <i className="fas fa-home mr-2"></i>楼栋 *
                          </label>
                          <div className="input-glass w-full text-gray-900">
                            {locationLoading ? '加载中...' : (location?.building || '未选择')}
                          </div>
                        </div>
                      </div>

                      {/* 房间号 */}
                      <div>
                        <label htmlFor="room" className="block text-sm font-medium text-gray-700 mb-2">
                          <i className="fas fa-door-open mr-2"></i>房间号 *
                        </label>
                        <input
                          type="text"
                          id="room"
                          name="room"
                          required
                          value={formData.room}
                          onChange={handleInputChange}
                          className={`input-glass w-full text-gray-900 placeholder-gray-500 ${fieldErrors.room ? 'border-red-300 ring-2 ring-red-100' : ''}`}
                          placeholder="如：101"
                        />
                        {fieldErrors.room && (
                          <p className="mt-2 text-sm text-red-600 flex items-center gap-1">
                            <i className="fas fa-exclamation-circle text-xs"></i>
                            {fieldErrors.room}
                          </p>
                        )}
                      </div>
                    </div>

                    {user?.type === 'user' && (
                      <div className="mt-3 flex items-center justify-between text-xs text-gray-500 bg-gray-50 border border-gray-200 px-4 py-3 rounded-xl">
                        <span>若需修改园区或楼栋，请先更新配送地址。</span>
                    <button
                      type="button"
                      onClick={openLocationModal}
                      className="text-indigo-600 hover:text-indigo-800"
                    >
                      修改地址
                    </button>
                  </div>
                )}

                {addressInvalid && (
                  <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    <i className="fas fa-exclamation-triangle mt-0.5"></i>
                    <span className="flex-1">{addressAlertMessage}</span>
                    <button
                      type="button"
                      onClick={openLocationModal}
                      className="ml-3 text-rose-600 hover:text-rose-800 underline"
                    >
                      重新选择
                    </button>
                  </div>
                )}

                <div>
                  <label htmlFor="note" className="block text-sm font-medium text-gray-700 mb-2">
                    <i className="fas fa-comment mr-2"></i>备注信息
                  </label>
                      <textarea
                        id="note"
                        name="note"
                        rows={3}
                        value={formData.note}
                        onChange={handleInputChange}
                        className="input-glass w-full text-gray-900 placeholder-gray-500 resize-none"
                        placeholder="有什么特别要求可以在这里说明..."
                      />
                    </div>
                  </form>
                </div>

                {/* 支付方式说明 */}
                <div className="card-glass p-6 border border-white/30 animate-fade-in-up" style={{ animationDelay: '0.3s', animationFillMode: 'both' }}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center">
                      <i className="fas fa-credit-card text-white"></i>
                    </div>
                    <h2 className="text-xl font-semibold text-gray-900">支付方式</h2>
                  </div>

                  <div className="bg-green-500/20 border border-green-400/30 backdrop-blur-sm rounded-xl p-4">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                          <i className="fas fa-check text-white text-sm"></i>
                        </div>
                      </div>
                      <div className="ml-4">
                        <div className="flex items-center gap-2 mb-1">
                          <i className="fab fa-weixin text-green-400 text-lg"></i>
                          <span className="text-sm font-medium text-gray-900">微信扫码支付</span>
                        </div>
                        <p className="text-xs text-gray-700">点击立即支付获取收款码，扫码付款后点击"已完成付款"</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 订单摘要 */}
              <div className="lg:col-span-1">
                <div className="card-glass p-6 border border-white/30 sticky top-8 animate-fade-in-up" style={{ animationDelay: '0.2s', animationFillMode: 'both' }}>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center">
                      <i className="fas fa-file-invoice-dollar text-white"></i>
                    </div>
                    <h3 className="text-xl font-semibold text-gray-900">订单摘要</h3>
                  </div>
                  
                  {/* 商品列表 */}
                  <div className="space-y-4 mb-6 max-h-60 overflow-y-auto custom-scrollbar pr-1">
                    {cart.items && cart.items
                      .sort((a, b) => {
                        // 非卖品排到最后
                        const aIsNonSellable = Boolean(a.is_not_for_sale);
                        const bIsNonSellable = Boolean(b.is_not_for_sale);
                        if (aIsNonSellable && !bIsNonSellable) return 1;
                        if (!aIsNonSellable && bIsNonSellable) return -1;
                        return 0;
                      })
                      .map((item, index) => {
                      const isDown = item.is_active === 0 || item.is_active === false;
                      const isNonSellable = Boolean(item.is_not_for_sale);
                      return (
                        <div 
                          key={(item.product_id + (item.variant_id || ''))} 
                          className={`bg-white/10 backdrop-blur-sm rounded-xl p-3 border border-white/20 animate-fade-in-up ${isDown ? 'opacity-60 grayscale' : ''}`}
                          style={{ animationDelay: `${index * 0.05 + 0.3}s`, animationFillMode: 'both' }}
                        >
                          <div className="flex justify-between items-start gap-3">
                            <div className="flex-1 min-w-0">
                              {/* 商品名和标识同行显示 */}
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className={`text-sm font-medium ${isDown ? 'text-gray-500' : 'text-gray-900'}`}>
                                  {item.name}
                                </p>
                                {item.variant_name && (
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200 flex-shrink-0">
                                    {item.variant_name}
                                  </span>
                                )}
                                {item.reservation_required && (
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200 flex-shrink-0">
                                    预约
                                  </span>
                                )}
                                {isNonSellable && (
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200 flex-shrink-0">
                                    非卖品
                                  </span>
                                )}
                                {isDown && (
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200 flex-shrink-0">
                                    暂时下架
                                  </span>
                                )}
                              </div>
                            </div>
                            {/* 价格区域 - 始终显示在右上角 */}
                            <div className="text-right flex-shrink-0">
                              <span className={`text-sm font-semibold ${isDown ? 'text-gray-500' : 'text-gray-900'}`}>
                                ¥{item.subtotal}
                              </span>
                              {isNonSellable && (
                                <div className="text-[11px] text-purple-200">非卖品免计价</div>
                              )}
                            </div>
                          </div>
                          {/* 数量和预约信息行 */}
                          <div className="flex justify-between items-baseline gap-2 mt-1">
                            <p className="text-gray-600 text-xs">
                              数量: {item.quantity} {(isDown || isNonSellable) && <span className="text-gray-500">（不计入金额）</span>}
                            </p>
                            {item.reservation_required && (
                              <p className="text-blue-600 text-[11px] leading-snug text-right flex-shrink-0">
                                {formatReservationCutoff(item.reservation_cutoff)}
                                {item.reservation_note ? ` · ${item.reservation_note}` : ''}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  
                  {/* 费用明细 */}
                  <div className="space-y-4 mb-6 border-t border-white/20 pt-4">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-600 flex items-center gap-2">
                        <i className="fas fa-shopping-bag"></i>
                        商品金额
                      </span>
                      <span className="text-gray-900 font-medium">¥{cart.total_price}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-600 flex items-center gap-2">
                        <i className="fas fa-truck"></i>
                        配送费
                      </span>
                      <span className="text-gray-900 font-medium">
                        {cart.shipping_fee > 0 ? `¥${cart.shipping_fee}` : (
                          <span className="text-green-400">免费</span>
                        )}
                      </span>
                    </div>
                    {cart.shipping_fee > 0 && deliveryConfig.free_delivery_threshold < 999999999 && (
                      <div className="text-xs text-gray-500 flex justify-end">
                        满 ¥{deliveryConfig.free_delivery_threshold} 免配送费
                      </div>
                    )}
                    {/* 优惠券选择（结算区域） */}
                    <div className="flex items-center justify-between text-sm">
                      <label className="flex items-center gap-2">
                        <input 
                          type="checkbox" 
                          checked={applyCoupon} 
                          disabled={(() => {
                            const usable = (coupons || []).filter(c => ((cart?.total_price || 0) > ((parseFloat(c.amount) || 0))));
                            return usable.length === 0;
                          })()} 
                          onChange={(e) => {
                            const checked = !!e.target.checked;
                            setApplyCoupon(checked);
                            if (checked && !selectedCouponId) {
                              // 如果勾选使用优惠券但没有选中券，自动选择最佳券
                              const usable = (coupons || []).filter(c => ((cart?.total_price || 0) > ((parseFloat(c.amount) || 0))));
                              if (usable.length > 0) {
                                usable.sort((a, b) => (parseFloat(b.amount) || 0) - (parseFloat(a.amount) || 0));
                                setSelectedCouponId(usable[0].id);
                              }
                            }
                          }} 
                        />
                        <span className="text-gray-900">使用优惠券</span>
                      </label>
                      <span className="text-gray-900 font-medium">
                        {applyCoupon && selectedCouponId ? (() => {
                          const c = coupons.find(x => x.id === selectedCouponId);
                          return c ? `-¥${(parseFloat(c.amount) || 0).toFixed(2)}` : '—';
                        })() : '—'}
                      </span>
                    </div>
                    {/* 优惠券自定义下拉选择 */}
                    {(() => {
                      const usableCoupons = (coupons || []).filter(c => ((cart?.total_price || 0) > ((parseFloat(c.amount) || 0))));
                      if (usableCoupons.length === 0) return null;
                      
                      // 计算弹出方向
                      const handleToggleDropdown = () => {
                        if (!showCouponDropdown && couponDropdownRef.current) {
                          const rect = couponDropdownRef.current.getBoundingClientRect();
                          const viewportHeight = window.innerHeight;
                          const spaceBelow = viewportHeight - rect.bottom;
                          const spaceAbove = rect.top;
                          const dropdownHeight = 200; // 预估下拉框高度
                          
                          // 默认向下弹出，只有当下方空间不足且上方空间充足时才向上
                          if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
                            setCouponDropdownDirection('up');
                          } else {
                            setCouponDropdownDirection('down');
                          }
                        }
                        setShowCouponDropdown(!showCouponDropdown);
                      };
                      
                      return (
                        <>
                          {/* 点击外部关闭遮罩 - 放在最外层确保全屏覆盖 */}
                          {showCouponDropdown && (
                            <div 
                              className="fixed inset-0 z-[100]" 
                              onClick={() => setShowCouponDropdown(false)}
                            ></div>
                          )}
                          <AnimatePresence>
                            {applyCoupon && usableCoupons.length > 0 && (
                              <motion.div 
                                initial={{ opacity: 0, height: 0, marginTop: 0, overflow: "hidden" }}
                                animate={{ opacity: 1, height: "auto", marginTop: "0.5rem", transitionEnd: { overflow: "visible" } }}
                                exit={{ opacity: 0, height: 0, marginTop: 0, overflow: "hidden" }}
                                transition={{ duration: 0.2, ease: "easeInOut" }}
                                className="relative z-[101]"
                              >
                                <button
                                ref={couponDropdownRef}
                                type="button"
                                onClick={handleToggleDropdown}
                                className="relative z-20 w-full flex items-center justify-between bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 hover:border-pink-300 hover:shadow-sm transition-all duration-200"
                              >
                                <span className="truncate">
                                  {selectedCouponId 
                                    ? (() => {
                                        const c = usableCoupons.find(c => c.id === selectedCouponId);
                                        return c ? `${parseFloat(c.amount).toFixed(2)}元优惠券${c.expires_at ? ` (${new Date(c.expires_at.replace(' ', 'T') + 'Z').toLocaleDateString()})` : ''}` : '请选择优惠券';
                                      })()
                                    : '请选择优惠券'}
                                </span>
                                <i className={`fas fa-chevron-down text-gray-400 transition-transform duration-300 ${showCouponDropdown ? (couponDropdownDirection === 'up' ? 'rotate-180' : '-rotate-180') : ''}`}></i>
                              </button>

                              <AnimatePresence>
                                {showCouponDropdown && (
                                  <motion.div
                                    initial={{ opacity: 0, y: couponDropdownDirection === 'up' ? 10 : -10, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: couponDropdownDirection === 'up' ? 10 : -10, scale: 0.95 }}
                                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                                    className={`absolute left-0 right-0 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-30 ${
                                      couponDropdownDirection === 'up' 
                                        ? 'bottom-full mb-1' 
                                        : 'top-full mt-1'
                                    }`}
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
                                                {c.expires_at ? `有效期至 ${new Date(c.expires_at.replace(' ', 'T') + 'Z').toLocaleDateString()}` : '永久有效'}
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
                    <div className="bg-white/10 rounded-xl p-4 border border-white/20">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-900 font-semibold flex items-center gap-2">
                          <i className="fas fa-calculator"></i>
                          总计
                        </span>
                        {(() => {
                          const base = (cart?.payable_total ?? cart.total_price) || 0;
                          const disc = (applyCoupon && selectedCouponId) ? (parseFloat((coupons.find(x => x.id === selectedCouponId)?.amount) || 0)) : 0;
                          const total = Math.max(0, base - disc);
                          return <AnimatedPrice value={total} className="text-2xl font-bold text-gray-900" />;
                        })()}
                      </div>
                    </div>
                    {shouldReserve && (
                      <div className="mb-6 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                        <div className="flex items-center gap-2 font-medium">
                          <i className="fas fa-calendar-day"></i>
                          <span>{reservationFromClosure ? '店铺当前打烊，本单将以预约方式提交，我们会在营业后优先处理。' : '本单包含预约商品，将以预约订单处理。'}</span>
                        </div>
                        {hasReservationItems && (
                          <div className="mt-1 text-blue-600/90 leading-relaxed">
                            请确认预约说明，配送时间将根据预约安排。
                          </div>
                        )}
                        {!shopOpen && !reservationAllowed && !allReservationItems && (
                          <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
                            当前打烊期间仅支持预约商品，请移除非预约商品后再尝试提交。
                          </div>
                        )}
                      </div>
                    )}
                    {cycleLocked && (
                      <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 font-medium">
                        暂时无法结算，请联系管理员
                      </div>
                    )}
                  </div>
                  {/* 抽奖奖品（仅展示，不计入金额；达标则自动随单配送）*/}
                  {eligibleRewards && eligibleRewards.length > 0 && cart?.lottery_enabled !== false && (
                    <div className="mb-6 border-t border-white/20 pt-4">
                      <div className="flex items-center gap-2 mb-2">
                        <i className="fas fa-gift text-pink-500"></i>
                        <span className="text-sm font-medium text-gray-900">抽奖奖品</span>
                      </div>
                      <div className="space-y-1">
                        {eligibleRewards.map((r) => {
                          const meet = (cart?.total_price ?? 0) >= lotteryThreshold;
                          return (
                            <div key={r.id} className={`flex justify-between items-baseline text-sm ${meet ? 'text-gray-900' : 'text-gray-400'}`}>
                              <span className="flex flex-col">
                                <span>{r.prize_name || '奖品'} × {r.prize_quantity || 1}</span>
                                {(r.prize_product_name || r.prize_variant_name) && (
                                  <span className="text-[11px] text-gray-500">
                                    {r.prize_product_name || ''}{r.prize_variant_name ? `（${r.prize_variant_name}）` : ''}
                                  </span>
                                )}
                              </span>
                              <span className="text-right text-xs">
                                <span className="text-sm">¥0.00</span>
                                <span className="text-[11px] text-gray-500">赠品</span>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      {(() => {
                        const meet = (cart?.total_price ?? 0) >= lotteryThreshold;
                        return (
                          <p className={`mt-2 text-xs ${meet ? 'text-green-600' : 'text-gray-500'}`}>
                            {meet
                              ? `本单满${formattedLotteryThreshold}元，将自动随单配送抽奖奖品（免费）`
                              : `订单满${formattedLotteryThreshold}元将自动随下单配送抽奖奖品（免费）`}
                          </p>
                        );
                      })()}
                    </div>
                  )}
                  {cart.items && cart.items.length > 0 && autoGifts.length > 0 && (
                    <div className="mb-8 border-t border-white/20 pt-6">
                      <div className="flex items-center gap-2 mb-2">
                        <i className="fas fa-gifts text-pink-500"></i>
                        <span className="text-sm font-medium text-gray-900">满额门槛</span>
                      </div>
                      <div className="space-y-1">
                        {autoGifts.map((threshold, index) => {
                          const thresholdAmount = threshold.threshold_amount || 0;
                          const cartTotal = cart?.total_price || 0;
                          const unlocked = cartTotal >= thresholdAmount;
                          const rowClass = unlocked ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-gray-200 border-gray-300 text-gray-600';
                          
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
                              className={`flex flex-col text-xs border rounded-md px-3 py-2 ${rowClass}`}
                            >
                              <span className="font-medium">满 ¥{thresholdAmount}</span>
                              <span className="mt-1 text-[11px] break-words">{rewardText} · {hint}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  
                  {/* 支付按钮 */}
                  <button
                    onClick={handleCreatePayment}
                    disabled={isCreatingPayment || cycleLocked || closedBlocked || !locationReady || addressInvalid}
                    className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none transform hover:scale-105 transition-all duration-300 text-white shadow-2xl flex items-center justify-center gap-2"
                  >
                    {isCreatingPayment ? (
                      <>
                        <div className="loading-dots text-white"></div>
                        <span>获取收款码中...</span>
                      </>
                    ) : (
                      <>
                        <i className="fas fa-credit-card"></i>
                        <span>{checkoutButtonLabel}</span>
                      </>
                    )}
                  </button>
                  
                  <div className="mt-4 text-center">
                    <p className="text-xs text-gray-600 leading-relaxed">
                      点击支付即表示您同意我们的
                      <span className="text-gray-700 underline cursor-pointer"> 服务条款</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
      {/* 微信收款码弹窗 */}
      {showPayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm transition-opacity duration-300">
          <div className="absolute inset-0" onClick={() => {
            setShowPayModal(false);
            setPaymentQr(null);
          }}></div>
          <div className="relative card-glass max-w-sm w-full mx-4 p-8 border border-white/30 shadow-2xl animate-fade-in-up z-10">
            {/* 弹窗标题 */}
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                <i className="fab fa-weixin text-white text-2xl"></i>
              </div>
              <h4 className="text-xl font-semibold text-gray-900 mb-2">长按图片扫描二维码支付</h4>
            </div>

            {/* 二维码区域 */}
            <div className="mb-6 text-center">
              {paymentQr ? (
                paymentQr.owner_type === 'default' ? (
                  <div className="mx-auto w-80 h-80 flex items-center justify-center bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                    <div className="text-center">
                      <div className="text-4xl mb-4">⚠️</div>
                      <p className="text-gray-600 text-lg font-medium">暂不可付款，请联系管理员</p>
                    </div>
                  </div>
                ) : (
                  <div>
                    <img 
                      src={paymentQr.image_path} 
                      alt={paymentQr.name || "收款码"} 
                      className="mx-auto w-80 h-80 object-contain" 
                    />
                  </div>
                )
              ) : (
                <div className="mx-auto w-80 h-80 flex items-center justify-center bg-gray-100 rounded">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-600 mx-auto mb-2"></div>
                    <p className="text-gray-600 text-sm">正在加载收款码...</p>
                  </div>
                </div>
              )}
            </div>


            {/* 操作按钮 */}
            <div className="flex gap-3">
              <button
                onClick={handleMarkPaid}
                disabled={cycleLocked || (paymentQr && paymentQr.owner_type === 'default') || addressInvalid}
                className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600 text-white py-3 px-3 rounded-xl font-medium hover:from-green-600 hover:to-emerald-700 transform hover:scale-105 transition-all duration-300 shadow-lg flex items-center justify-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              >
                <i className="fas fa-check-circle"></i>
                <span>我已完成付款</span>
              </button>
              
              <button
                onClick={handlePayLater}
                disabled={cycleLocked || addressInvalid || !locationReady}
                className="flex-1 bg-gray-100 text-black py-3 px-3 rounded-xl font-medium hover:bg-gray-200 border border-gray-300 transition-all duration-300 flex items-center justify-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <i className="fas fa-clock text-black"></i>
                <span>稍后支付</span>
              </button>
            </div>

            {/* 底部链接 */}
            <div className="mt-6 text-center">
              <Link 
                href="/orders" 
                className="text-gray-600 hover:text-gray-900 text-sm underline transition-colors flex items-center justify-center gap-1"
              >
                <i className="fas fa-external-link-alt"></i>
                <span>查看我的订单状态</span>
              </Link>
            </div>

            {/* 关闭按钮 */}
            <button
              onClick={() => {
                setShowPayModal(false);
                setPaymentQr(null);
              }}
              className="absolute top-4 right-4 w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center text-gray-600 hover:text-gray-900 transition-all duration-200"
            >
              <i className="fas fa-times"></i>
            </button>
          </div>
        </div>
      )}

      {/* 抽奖弹窗 */}
      {lotteryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm transition-opacity duration-300">
          <div className="absolute inset-0" onClick={() => { 
            setLotteryOpen(false); 
            setLotteryPrize(null); 
            // 关闭抽奖弹窗后显示成功动画
            setShowSuccessAnimation(true);
            setTimeout(() => {
              router.push('/orders');
            }, 1700);
          }}></div>
          <div className="relative max-w-sm w-full mx-4 p-6 rounded-2xl bg-white shadow-2xl animate-fade-in-up z-10">
            <div className="text-center mb-4">
              <h3 className="text-lg font-semibold">抽奖中</h3>
              <p className="text-gray-500 text-sm">订单满{formattedLotteryThreshold}元即可参与抽奖</p>
            </div>
            <div className="h-20 flex items-center justify-center mb-4">
              <span className={`text-2xl font-bold ${spinning ? 'animate-pulse' : ''}`}>{lotteryDisplay}</span>
            </div>
            {!spinning && (
              <>
                <div className="text-center mb-4 space-y-2">
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                    lotteryResult === '谢谢参与' 
                      ? 'bg-gray-100 text-gray-700' 
                      : 'bg-amber-100 text-amber-700'
                  }`}>
                    {lotteryResult === '谢谢参与' ? '谢谢参与' : `恭喜获得：${lotteryResult || '谢谢参与'}`}
                  </span>
                  {lotteryPrize ? (
                    <div className="text-xs text-gray-600 space-y-1">
                      <div>具体奖品：{lotteryPrize.product_name || '未命名奖品'}{lotteryPrize.variant_name ? `（${lotteryPrize.variant_name}）` : ''}</div>
                      <div className="text-gray-500">将在下次满额订单随单配送</div>
                    </div>
                  ) : (
                    <div className="text-xs text-gray-500">本次未中奖，继续加油！</div>
                  )}
                </div>
                <div className="flex">
                  <button onClick={() => { 
                    setLotteryOpen(false); 
                    setLotteryPrize(null); 
                    // 关闭抽奖弹窗后显示成功动画
                    setShowSuccessAnimation(true);
                    setTimeout(() => {
                      router.push('/orders');
                    }, 1700);
                  }} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-xl">我知道了</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 成功动画弹窗 */}
      {showSuccessAnimation && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm transition-opacity duration-300">
          <div className="relative bg-white rounded-3xl p-8 shadow-2xl animate-fade-in-up">
            <dotlottie-wc 
              src="https://lottie.host/f3c97f35-f5a9-4cf8-9afa-d6084a659237/2S8UtFVgcc.lottie" 
              style={{width: '300px', height: '300px'}}
              autoplay
            ></dotlottie-wc>
          </div>
        </div>
      )}
    </>
  );
}
