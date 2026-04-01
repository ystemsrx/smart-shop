import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import Head from "next/head";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth, useCart, useApi, useUserAgentStatus } from "../hooks/useAuth";
import { useProducts } from "../hooks/useAuth";
import { useLocation } from "../hooks/useLocation";
import { usePaymentQr } from "../hooks/usePaymentQr";
import { useRouter } from "next/router";

import AnimatedPrice from "../components/AnimatedPrice";
import CheckoutPageSkeleton from "../components/CheckoutPageSkeleton";
import { getShopName } from "../utils/runtimeConfig";
import { getProductImage } from "../utils/urls";
import LegalModal from "../components/LegalModal";

// 格式化预约截止时间显示
const formatReservationCutoff = (cutoffTime) => {
  if (!cutoffTime) return "需提前预约";

  // 获取当前时间
  const now = new Date();
  const [hours, minutes] = cutoffTime.split(":").map(Number);

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
  message: "",
  should_force_reselect: false,
});

/* ═══════════════════════════════════════
   Anthropic Warm-Style UI Primitives
═══════════════════════════════════════ */

const Card = ({ children, style }) => (
  <div
    className="warm-card"
    style={{
      background: "#ffffff",
      border: "1px solid rgba(0,0,0,0.06)",
      borderRadius: 20,
      padding: "20px 18px",
      marginBottom: 14,
      boxShadow: "0 1px 6px rgba(0,0,0,0.04)",
      ...style,
    }}
  >
    {children}
  </div>
);

const SectionLabel = ({ icon, title, extra }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 16,
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 15 }}>{icon}</span>
      <span
        style={{
          fontFamily: "'Poppins', 'Noto Sans SC', 'PingFang SC', sans-serif",
          fontSize: 15,
          fontWeight: 600,
          color: "#141413",
          letterSpacing: ".02em",
        }}
      >
        {title}
      </span>
    </div>
    {extra}
  </div>
);

const WarmInput = ({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  id,
  name,
  required,
  error,
  flex,
  readOnly,
  children,
}) => {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ flex: flex || "1 1 100%", minWidth: 0 }}>
      <label
        style={{
          display: "block",
          fontSize: 12,
          fontWeight: 500,
          color: "#6B6860",
          fontFamily: "'Poppins', 'Noto Sans SC', sans-serif",
          letterSpacing: ".04em",
          marginBottom: 6,
        }}
      >
        {label}
        {required && <span style={{ color: "#D97757" }}> *</span>}
      </label>
      {children || (
        <input
          id={id}
          name={name}
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          readOnly={readOnly}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            width: "100%",
            padding: "11px 14px",
            fontSize: 14,
            fontFamily: "'Poppins', 'Noto Sans SC', sans-serif",
            border: `1.5px solid ${error ? "#C0453A" : focused ? "#D97757" : "#e5e5e5"}`,
            borderRadius: 12,
            outline: "none",
            color: "#141413",
            background: readOnly ? "#f5f5f5" : focused ? "#fff" : "#fafafa",
            transition: "all .2s cubic-bezier(.16,1,.3,1)",
            boxSizing: "border-box",
          }}
        />
      )}
      {error && (
        <p
          style={{
            marginTop: 4,
            fontSize: 12,
            color: "#C0453A",
            fontFamily: "'Poppins', 'Noto Sans SC', sans-serif",
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
};

const ProgressBar = ({ current, target }) => {
  const pct = Math.min((current / target) * 100, 100);
  return (
    <div
      style={{
        width: "100%",
        height: 4,
        borderRadius: 2,
        background: "#f0f0f0",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${pct}%`,
          height: "100%",
          borderRadius: 2,
          background: pct >= 100 ? "#6B8F47" : "#D97757",
          transition: "width .6s cubic-bezier(.16,1,.3,1)",
        }}
      />
    </div>
  );
};

export default function Checkout() {
  const router = useRouter();
  const { user, isInitialized } = useAuth();
  const { getCart, clearCart } = useCart();
  const { apiRequest } = useApi();
  const { getShopStatus } = useProducts();
  const { getStatus: getUserAgentStatus } = useUserAgentStatus();
  const { getCachedPaymentQr, getPaymentQr, preloadPaymentQr } = usePaymentQr();
  const shopName = getShopName();
  const pageTitle = `结算 - ${shopName}`;

  const [cart, setCart] = useState({
    items: [],
    total_quantity: 0,
    total_price: 0,
    lottery_threshold: 10,
  });
  const [deliveryConfig, setDeliveryConfig] = useState({
    delivery_fee: 1.0,
    free_delivery_threshold: 10.0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    dormitory: "",
    building: "",
    room: "",
    note: "",
  });
  const [fieldErrors, setFieldErrors] = useState({
    name: "",
    phone: "",
    room: "",
  });
  const {
    location,
    openLocationModal,
    revision: locationRevision,
    isLoading: locationLoading,
    forceReselectAddress,
  } = useLocation();
  const [orderId, setOrderId] = useState(null);
  const [isCreatingPayment, setIsCreatingPayment] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [shopOpen, setShopOpen] = useState(true);
  const [shopNote, setShopNote] = useState("");
  const [reservationAllowed, setReservationAllowed] = useState(false);
  const [cycleLocked, setCycleLocked] = useState(false);
  const [legalModal, setLegalModal] = useState({ open: false, tab: "terms" });
  const [eligibleRewards, setEligibleRewards] = useState([]);
  const [autoGifts, setAutoGifts] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [selectedCouponId, setSelectedCouponId] = useState(null);
  const [applyCoupon, setApplyCoupon] = useState(false);
  const [showCouponDropdown, setShowCouponDropdown] = useState(false);
  const [couponDropdownDirection, setCouponDropdownDirection] =
    useState("down");
  const couponDropdownRef = useRef(null);
  const [addressValidation, setAddressValidation] = useState(
    createDefaultValidation(),
  );
  const [lotteryOpen, setLotteryOpen] = useState(false);
  const [lotteryNames, setLotteryNames] = useState([]);
  const [paymentQr, setPaymentQr] = useState(null);
  const [lotteryResult, setLotteryResult] = useState("");
  const [lotteryDisplay, setLotteryDisplay] = useState("");
  const [lotteryPrize, setLotteryPrize] = useState(null);
  const [spinning, setSpinning] = useState(false);
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);
  const [showNote, setShowNote] = useState(false);

  const normalizeValidation = useCallback((raw) => {
    if (!raw) {
      return createDefaultValidation();
    }
    return {
      is_valid: raw.is_valid !== false,
      reason: raw.reason || null,
      message: raw.message || "",
      should_force_reselect: !!raw.should_force_reselect,
    };
  }, []);

  // 验证个人信息字段，失败时聚焦到第一个错误字段
  const validatePersonalInfo = () => {
    const errors = {
      name: "",
      phone: "",
      room: "",
    };

    if (!formData.name) {
      errors.name = "请输入昵称";
    }

    if (!formData.phone) {
      errors.phone = "请输入手机号";
    } else {
      const phoneRegex = /^1[3-9]\d{9}$/;
      if (!phoneRegex.test(formData.phone)) {
        errors.phone = "请输入正确的手机号";
      }
    }

    if (!formData.room) {
      errors.room = "请输入房间号";
    }

    setFieldErrors(errors);

    const firstError = errors.name || errors.phone || errors.room;
    if (firstError) {
      const firstErrorField = errors.name
        ? "name"
        : errors.phone
          ? "phone"
          : "room";
      const input = document.getElementById(firstErrorField);
      if (input) {
        input.focus();
        input.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return false;
    }

    return true;
  };

  const locationReady =
    user?.type !== "user" ||
    (location && location.address_id && location.building_id);
  const displayLocation = location
    ? `${location.dormitory || ""}${location.building ? "·" + location.building : ""}`.trim() ||
      "已选择地址"
    : "未选择地址";

  const lotteryThreshold = useMemo(() => {
    const raw = cart?.lottery_threshold;
    const value =
      typeof raw === "string" ? Number.parseFloat(raw) : Number(raw);
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
    return 10;
  }, [cart?.lottery_threshold]);

  const formattedLotteryThreshold = useMemo(
    () =>
      Number.isInteger(lotteryThreshold)
        ? lotteryThreshold.toString()
        : lotteryThreshold.toFixed(2),
    [lotteryThreshold],
  );

  const hasReservationItems = useMemo(
    () => !!cart?.has_reservation_items,
    [cart?.has_reservation_items],
  );
  const allReservationItems = useMemo(() => {
    if (cart?.all_reservation_items !== undefined) {
      return !!cart.all_reservation_items;
    }
    const activeItems = (cart?.items || []).filter((item) => {
      const isActive = !(item.is_active === 0 || item.is_active === false);
      const qty = Number(item.quantity || 0);
      return isActive && qty > 0;
    });
    if (activeItems.length === 0) return false;
    return activeItems.every((item) => item.reservation_required);
  }, [cart?.all_reservation_items, cart?.items]);
  const closedReservationOnly = useMemo(
    () => !shopOpen && allReservationItems && (cart?.total_quantity || 0) > 0,
    [shopOpen, allReservationItems, cart?.total_quantity],
  );
  const canReserveWhileClosed = useMemo(
    () => closedReservationOnly,
    [closedReservationOnly],
  );
  const reservationFromClosure = useMemo(
    () => canReserveWhileClosed,
    [canReserveWhileClosed],
  );
  const shouldReserve = useMemo(
    () => hasReservationItems || canReserveWhileClosed,
    [hasReservationItems, canReserveWhileClosed],
  );

  const addressInvalid = useMemo(
    () =>
      locationReady &&
      addressValidation &&
      addressValidation.is_valid === false,
    [locationReady, addressValidation],
  );

  const addressAlertMessage = useMemo(
    () =>
      addressInvalid
        ? addressValidation?.message || "配送地址不可用，请重新选择"
        : "",
    [addressInvalid, addressValidation],
  );

  const couponDiscountAmount = useMemo(() => {
    if (!(applyCoupon && selectedCouponId)) return 0;
    const coupon = coupons.find((c) => c.id === selectedCouponId);
    return coupon ? parseFloat(coupon.amount) || 0 : 0;
  }, [applyCoupon, selectedCouponId, coupons]);
  const payableAmount = useMemo(() => {
    const baseTotal = (cart?.payable_total ?? cart?.total_price) || 0;
    return Math.max(0, baseTotal - couponDiscountAmount);
  }, [cart?.payable_total, cart?.total_price, couponDiscountAmount]);
  const closedBlocked =
    !shopOpen && !reservationAllowed && !allReservationItems;
  const checkoutButtonLabel = useMemo(() => {
    if (!locationReady) return "请选择配送地址";
    if (addressInvalid)
      return addressAlertMessage || "配送地址不可用，请重新选择";
    if (cycleLocked) return "暂时无法结算，请联系管理员";
    if (closedBlocked) {
      return "打烊中 · 仅限预约商品";
    }
    if (closedReservationOnly) return `预约购买 ¥${payableAmount.toFixed(2)}`;
    if (!shopOpen && reservationAllowed)
      return `预约购买 ¥${payableAmount.toFixed(2)}`;
    if (hasReservationItems && shouldReserve)
      return `提交预约 ¥${payableAmount.toFixed(2)}`;
    return `立即支付 ¥${payableAmount.toFixed(2)}`;
  }, [
    locationReady,
    addressInvalid,
    addressAlertMessage,
    cycleLocked,
    closedBlocked,
    shopOpen,
    reservationAllowed,
    closedReservationOnly,
    payableAmount,
    hasReservationItems,
    shouldReserve,
  ]);

  const closedBlockedMessage = useMemo(() => {
    if (cycleLocked) {
      return "暂时无法结算，请联系管理员";
    }
    if (!shopOpen) {
      if (!reservationAllowed && !allReservationItems) {
        return "当前打烊期间仅支持预约商品，请移除非预约商品后再试";
      }
      return shopNote ? `店铺已打烊：${shopNote}` : "店铺已打烊，暂不支持下单";
    }
    return "当前暂无法提交订单";
  }, [
    cycleLocked,
    shopOpen,
    reservationAllowed,
    allReservationItems,
    shopNote,
  ]);

  const lastInvalidKeyRef = useRef(null);
  const reselectInFlightRef = useRef(false);

  useEffect(() => {
    const shouldForce = !!(
      addressValidation && addressValidation.should_force_reselect
    );
    if (!shouldForce) {
      reselectInFlightRef.current = false;
      lastInvalidKeyRef.current = null;
      return;
    }

    if (!addressInvalid) {
      return;
    }

    const key = `${addressValidation.reason || "unknown"}|${location?.address_id || ""}|${location?.building_id || ""}`;
    if (lastInvalidKeyRef.current === key || reselectInFlightRef.current) {
      return;
    }
    lastInvalidKeyRef.current = key;
    reselectInFlightRef.current = true;
    forceReselectAddress();
  }, [addressInvalid, addressValidation, location, forceReselectAddress]);

  // 稍后支付
  const handlePayLater = async () => {
    if (cycleLocked || closedBlocked) {
      alert(closedBlockedMessage);
      return;
    }
    if (!locationReady) {
      alert("请先选择配送地址");
      openLocationModal();
      return;
    }
    if (addressInvalid) {
      alert(addressAlertMessage || "配送地址不可用，请重新选择");
      openLocationModal();
      return;
    }

    if (!validatePersonalInfo()) {
      return;
    }

    try {
      const shippingInfo = {
        name: formData.name,
        phone: formData.phone,
        dormitory: location?.dormitory || formData.dormitory,
        building: location?.building || formData.building,
        room: formData.room,
        full_address:
          `${location?.dormitory || formData.dormitory} ${location?.building || formData.building} ${formData.room}`.trim(),
        address_id: location?.address_id || "",
        building_id: location?.building_id || "",
        agent_id: location?.agent_id || "",
      };

      const orderResponse = await apiRequest("/orders", {
        method: "POST",
        body: JSON.stringify({
          shipping_info: shippingInfo,
          payment_method: "wechat",
          note: formData.note,
          coupon_id: applyCoupon ? selectedCouponId || null : null,
          apply_coupon: !!applyCoupon,
          reservation_requested: shouldReserve,
        }),
      });

      if (!orderResponse.success) {
        throw new Error(orderResponse.message || "订单创建失败");
      }

      try {
        await clearCart();
      } catch (e) {}
      setShowPayModal(false);
      setPaymentQr(null);
      router.push("/orders");
    } catch (e) {
      alert(e.message || "创建订单失败");
    }
  };

  // 检查登录状态
  useEffect(() => {
    if (!router.isReady || !isInitialized) return;
    if (!user) {
      const redirect = encodeURIComponent(router.asPath || "/checkout");
      router.replace(`/login?redirect=${redirect}`);
      return;
    }
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
          setShopNote("暂时无法结算，请联系管理员");
        } else if (open) {
          setShopNote("");
        } else {
          const defaultNote = res.data?.is_agent
            ? "当前区域代理已暂停营业，暂不支持结算"
            : "店铺已暂停营业，暂不支持结算";
          setShopNote(res.data?.note || defaultNote);
        }
      } catch (e) {
        setShopOpen(true);
        setShopNote("");
        setReservationAllowed(false);
        setCycleLocked(false);
      }
    })();
  }, [
    user,
    isInitialized,
    router,
    router.asPath,
    router.isReady,
    location,
    getUserAgentStatus,
  ]);

  // 加载购物车数据
  const loadCart = async () => {
    setIsLoading(true);
    setError("");

    if (
      user &&
      user.type === "user" &&
      (!location || !location.address_id || !location.building_id)
    ) {
      setIsLoading(false);
      setCart({
        items: [],
        total_quantity: 0,
        total_price: 0,
        lottery_threshold: 10,
      });
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
      try {
        const rw = await apiRequest("/rewards/eligible");
        setEligibleRewards(rw?.data?.rewards || []);
      } catch (e) {
        setEligibleRewards([]);
      }
      try {
        const giftsResp = await apiRequest("/gift-thresholds");
        setAutoGifts(giftsResp?.data?.thresholds || []);
      } catch (e) {
        setAutoGifts([]);
      }
      try {
        const resp = await apiRequest("/coupons/my");
        const list = resp?.data?.coupons || [];
        setCoupons(list);
        const sub = data?.data?.total_price || 0;
        const fromQuery = (router?.query?.coupon_id || "").toString();
        const applyParam = (
          router?.query?.apply ||
          router?.query?.apply_coupon ||
          ""
        )
          .toString()
          .toLowerCase();
        if (applyParam === "0" || applyParam === "false") {
          setSelectedCouponId(null);
          setApplyCoupon(false);
        } else if (
          fromQuery &&
          list.some((x) => x.id === fromQuery) &&
          sub > (parseFloat(list.find((x) => x.id === fromQuery).amount) || 0)
        ) {
          setSelectedCouponId(fromQuery);
          setApplyCoupon(true);
        } else {
          const applicable = list.filter(
            (x) => sub > (parseFloat(x.amount) || 0),
          );
          if (applicable.length > 0) {
            applicable.sort((a, b) => {
              const amtDiff =
                (parseFloat(b.amount) || 0) - (parseFloat(a.amount) || 0);
              if (amtDiff !== 0) return amtDiff;
              const aExp = a.expires_at
                ? new Date(a.expires_at.replace(" ", "T") + "Z").getTime()
                : Infinity;
              const bExp = b.expires_at
                ? new Date(b.expires_at.replace(" ", "T") + "Z").getTime()
                : Infinity;
              return aExp - bExp;
            });
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

      if (!data.data.items || data.data.items.length === 0) {
        router.push("/cart");
        return;
      }

      if (user) {
        setFormData((prev) => ({
          ...prev,
          name: user.name || "",
        }));
      }
    } catch (err) {
      setError(err.message || "加载购物车失败");
      setAddressValidation(createDefaultValidation());
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;

    if (fieldErrors[name]) {
      setFieldErrors((prev) => ({ ...prev, [name]: "" }));
    }

    if (name === "dormitory") {
      setFormData({ ...formData, dormitory: value, building: "" });
    } else {
      setFormData({
        ...formData,
        [name]: value,
      });
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!isCreatingPayment && shopOpen && !cycleLocked) handleCreatePayment();
  };

  const handleCreatePayment = async () => {
    if (cycleLocked || closedBlocked) {
      alert(closedBlockedMessage);
      return;
    }
    if (addressInvalid) {
      alert(addressAlertMessage || "配送地址不可用，请重新选择");
      openLocationModal();
      return;
    }

    if (!validatePersonalInfo()) {
      return;
    }

    if (!location || !location.address_id || !location.building_id) {
      alert("请填写完整的收货信息并选择配送地址");
      openLocationModal();
      return;
    }

    setIsCreatingPayment(true);
    setError("");

    try {
      const buildingId = location?.building_id;
      const addressId = location?.address_id;

      let qr = getCachedPaymentQr(addressId, buildingId);

      if (!qr) {
        qr = await getPaymentQr(addressId, buildingId);
      }

      if (qr) {
        setPaymentQr(qr);
      } else {
        setPaymentQr({
          owner_type: "default",
          name: "无收款码",
        });
      }

      setShowPayModal(true);
    } catch (error) {
      const message = error?.message || "获取收款码失败";
      if (/地址不存在|未启用/.test(message)) {
        alert("地址不存在或未启用，请联系管理员");
        setShowPayModal(false);
        setPaymentQr(null);
        return;
      }
      console.warn("Failed to load payment QR:", error);
      setPaymentQr({
        owner_type: "default",
        name: "无收款码",
      });
      setShowPayModal(true);
    } finally {
      setIsCreatingPayment(false);
    }
  };

  const handleMarkPaid = async () => {
    if (cycleLocked || closedBlocked) {
      alert(closedBlockedMessage);
      return;
    }
    if (!locationReady) {
      alert("请先选择配送地址");
      openLocationModal();
      return;
    }
    if (addressInvalid) {
      alert(addressAlertMessage || "配送地址不可用，请重新选择");
      openLocationModal();
      return;
    }

    if (!validatePersonalInfo()) {
      return;
    }

    try {
      const shippingInfo = {
        name: formData.name,
        phone: formData.phone,
        dormitory: location?.dormitory || formData.dormitory,
        building: location?.building || formData.building,
        room: formData.room,
        full_address:
          `${location?.dormitory || formData.dormitory} ${location?.building || formData.building} ${formData.room}`.trim(),
        address_id: location?.address_id || "",
        building_id: location?.building_id || "",
        agent_id: location?.agent_id || "",
      };

      const orderResponse = await apiRequest("/orders", {
        method: "POST",
        body: JSON.stringify({
          shipping_info: shippingInfo,
          payment_method: "wechat",
          note: formData.note,
          coupon_id: applyCoupon ? selectedCouponId || null : null,
          apply_coupon: !!applyCoupon,
          reservation_requested: shouldReserve,
        }),
      });

      if (!orderResponse.success) {
        throw new Error(orderResponse.message || "订单创建失败");
      }

      const createdOrderId = orderResponse.data.order_id;
      setOrderId(createdOrderId);

      const res = await apiRequest(`/orders/${createdOrderId}/mark-paid`, {
        method: "POST",
      });
      if (res.success) {
        try {
          await clearCart();
        } catch (e) {}
        setShowPayModal(false);
        setPaymentQr(null);

        let hasLottery = false;
        const lotteryEnabled = cart?.lottery_enabled !== false;
        if (lotteryEnabled) {
          try {
            const draw = await apiRequest(
              `/orders/${createdOrderId}/lottery/draw`,
              { method: "POST" },
            );
            if (draw.success) {
              const resultName = draw.data?.prize_name || "";
              const names =
                draw.data?.names && draw.data.names.length > 0
                  ? draw.data.names
                  : resultName
                    ? [resultName]
                    : ["谢谢参与"];
              setLotteryPrize(draw.data?.prize || null);
              setLotteryNames(names);
              setLotteryResult(resultName);
              setLotteryDisplay(names[0] || "");
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
              }, duration + 200);
            }
          } catch (e) {
            setLotteryPrize(null);
          }
        }
        if (!hasLottery) {
          setShowSuccessAnimation(true);
        }
      } else {
        alert(res.message || "操作失败");
      }
    } catch (err) {
      alert(err.message || "操作失败");
    }
  };

  // 初始化加载
  useEffect(() => {
    if (!user) return;
    loadCart();
    (async () => {
      try {
        const res = await apiRequest("/profile/shipping");
        const ship = res?.data?.shipping;
        if (ship) {
          setFormData((prev) => ({
            ...prev,
            name: ship.name || prev.name,
            phone: ship.phone || prev.phone,
            room: ship.room || prev.room,
          }));
        }
      } catch (e) {
        // ignore
      }

      try {
        const deliveryRes = await apiRequest("/delivery-config");
        const config = deliveryRes?.data?.delivery_config;
        if (config) {
          setDeliveryConfig(config);
        }
      } catch (e) {
        console.warn("Failed to fetch delivery fee config:", e);
      }
    })();
  }, [user, locationRevision, location?.address_id, location?.building_id]);

  useEffect(() => {
    if (location) {
      setFormData((prev) => ({
        ...prev,
        dormitory: location.dormitory || "",
        building: location.building || "",
      }));
    }
  }, [location]);

  useEffect(() => {
    const sub = cart?.total_price || 0;
    const usable = (coupons || []).filter(
      (c) => sub > (parseFloat(c.amount) || 0),
    );
    if (applyCoupon) {
      if (!selectedCouponId || !usable.some((x) => x.id === selectedCouponId)) {
        if (usable.length > 0) {
          usable.sort((a, b) => {
            const amtDiff =
              (parseFloat(b.amount) || 0) - (parseFloat(a.amount) || 0);
            if (amtDiff !== 0) return amtDiff;
            const aExp = a.expires_at
              ? new Date(a.expires_at.replace(" ", "T") + "Z").getTime()
              : Infinity;
            const bExp = b.expires_at
              ? new Date(b.expires_at.replace(" ", "T") + "Z").getTime()
              : Infinity;
            return aExp - bExp;
          });
          setSelectedCouponId(usable[0].id);
        } else {
          setSelectedCouponId(null);
        }
      }
    }
  }, [applyCoupon, coupons, cart?.total_price]);

  if (!isInitialized) {
    return (
      <>
        <Head>
          <title>{pageTitle}</title>
          <meta
            name="viewport"
            content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
          />
        </Head>
        <CheckoutPageSkeleton />
      </>
    );
  }

  if (!user) {
    return null;
  }

  if (isLoading) {
    return (
      <>
        <Head>
          <title>{pageTitle}</title>
          <meta
            name="viewport"
            content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
          />
        </Head>
        <CheckoutPageSkeleton />
      </>
    );
  }

  /* ═══════════════════════════════════════
     Inline style constants
  ═══════════════════════════════════════ */
  const fontUI =
    "'Poppins', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif";
  const fontDisplay = "'Lora', 'LXGW WenKai', 'Songti SC', serif";
  const accent = "#D97757";
  const accentWarm = "#C96442";
  const bgBase = "#fafafa";
  const bgRaised = "#ffffff";
  const bgOverlay = "#ffffff";
  const textPrimary = "#1a1a1a";
  const textSecondary = "#6B6860";
  const textMuted = "#B0AEA5";
  const borderDefault = "#e5e5e5";
  const borderSubtle = "#f0f0f0";
  const colorError = "#C0453A";
  const colorSuccess = "#6B8F47";

  const usableCoupons = (coupons || []).filter(
    (c) => (cart?.total_price || 0) > (parseFloat(c.amount) || 0),
  );

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&family=Lora:wght@300;400;500;600;700&family=Noto+Sans+SC:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </Head>

      <div
        style={{
          minHeight: "100vh",
          background: `radial-gradient(ellipse 80% 50% at 30% 0%, rgba(217,119,87,0.04) 0%, transparent 55%), ${bgBase}`,
          fontFamily: fontUI,
          WebkitFontSmoothing: "antialiased",
        }}
      >

        {/* ── Nav ── */}
        <nav
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "14px 16px",
            position: "sticky",
            top: 0,
            zIndex: 10,
            background: "rgba(250,250,250,.88)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            borderBottom: `1px solid ${borderSubtle}`,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 1080,
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                router.back();
              }}
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke={textPrimary}
              strokeWidth="2"
              strokeLinecap="round"
              style={{ position: "absolute", left: 0, cursor: "pointer" }}
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
            <span
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: textPrimary,
                letterSpacing: ".01em",
              }}
            >
              确认订单
            </span>
          </div>
        </nav>

        {/* ── Main ── */}
        <div
          className="checkout-main"
          style={{
            maxWidth: 1080,
            margin: "0 auto",
            padding: "20px 16px 84px",
          }}
        >
          {/* Error banner */}
          {error && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "12px 16px",
                marginBottom: 14,
                background: "rgba(192,69,58,0.08)",
                border: "1px solid rgba(192,69,58,0.25)",
                borderRadius: 14,
                fontSize: 13,
                color: colorError,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle
                  cx="8"
                  cy="8"
                  r="7"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <path
                  d="M8 5v4M8 11v.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
              <span style={{ flex: 1 }}>{error}</span>
            </div>
          )}

          {
            <>
              <div className="checkout-grid">
                {/* ── Left Column ── */}
                <div className="checkout-col-left">
                  {/* ═══ 收货信息 ═══ */}
                  <Card>
                    <SectionLabel icon="📍" title="收货信息" />
                    <form onSubmit={handleSubmit}>
                      <div
                        style={{ display: "flex", flexWrap: "wrap", gap: 10 }}
                      >
                        <WarmInput
                          label="昵称"
                          id="name"
                          name="name"
                          value={formData.name}
                          onChange={handleInputChange}
                          placeholder="怎么称呼您"
                          flex="1 1 calc(50% - 5px)"
                          required
                          error={fieldErrors.name}
                        />
                        <WarmInput
                          label="手机号"
                          id="phone"
                          name="phone"
                          type="tel"
                          value={formData.phone}
                          onChange={handleInputChange}
                          placeholder="联系手机号"
                          flex="1 1 calc(50% - 5px)"
                          required
                          error={fieldErrors.phone}
                        />
                      </div>

                      {/* 地址行 */}
                      {user?.type === "user" && (
                        <div style={{ marginTop: 12 }}>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "12px 14px",
                              borderRadius: 14,
                              border: `1.5px solid ${borderSubtle}`,
                              background: bgRaised,
                              cursor: "pointer",
                            }}
                            onClick={openLocationModal}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                              }}
                            >
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke={accent}
                                strokeWidth="2"
                                strokeLinecap="round"
                              >
                                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                                <circle cx="12" cy="10" r="3" />
                              </svg>
                              <div
                                style={{
                                  fontSize: 13,
                                  fontWeight: 500,
                                  color: textPrimary,
                                }}
                              >
                                {locationLoading
                                  ? "加载中..."
                                  : displayLocation}
                              </div>
                            </div>
                            <span
                              style={{
                                fontSize: 12,
                                color: accent,
                                fontWeight: 500,
                              }}
                            >
                              {location ? "修改" : "选择"}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* 地址警告 */}
                      {addressInvalid && (
                        <div
                          style={{
                            marginTop: 10,
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "10px 14px",
                            borderRadius: 14,
                            background: "rgba(192,69,58,0.08)",
                            border: "1px solid rgba(192,69,58,0.2)",
                            fontSize: 12,
                            color: colorError,
                          }}
                        >
                          <span style={{ flex: 1 }}>{addressAlertMessage}</span>
                          <span
                            onClick={openLocationModal}
                            style={{
                              color: colorError,
                              fontWeight: 600,
                              cursor: "pointer",
                              textDecoration: "underline",
                              flexShrink: 0,
                            }}
                          >
                            重新选择
                          </span>
                        </div>
                      )}

                      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                        <WarmInput
                          label="配送区"
                          flex="1 1 calc(33% - 7px)"
                          readOnly
                        >
                          <div
                            style={{
                              padding: "11px 14px",
                              fontSize: 14,
                              borderRadius: 12,
                              border: `1.5px solid ${borderSubtle}`,
                              background: bgBase,
                              color: textSecondary,
                            }}
                          >
                            {locationLoading
                              ? "..."
                              : location?.dormitory || "未选择"}
                          </div>
                        </WarmInput>
                        <WarmInput
                          label="楼栋"
                          flex="1 1 calc(33% - 7px)"
                          readOnly
                        >
                          <div
                            style={{
                              padding: "11px 14px",
                              fontSize: 14,
                              borderRadius: 12,
                              border: `1.5px solid ${borderSubtle}`,
                              background: bgBase,
                              color: textSecondary,
                            }}
                          >
                            {locationLoading
                              ? "..."
                              : location?.building || "未选择"}
                          </div>
                        </WarmInput>
                        <WarmInput
                          label="房间号"
                          id="room"
                          name="room"
                          value={formData.room}
                          onChange={handleInputChange}
                          placeholder="如 502"
                          flex="1 1 calc(33% - 7px)"
                          required
                          error={fieldErrors.room}
                        />
                      </div>

                      {/* 备注 */}
                      {!showNote ? (
                        <button
                          type="button"
                          onClick={() => setShowNote(true)}
                          style={{
                            marginTop: 14,
                            fontSize: 13,
                            color: accent,
                            fontWeight: 500,
                            border: "none",
                            background: "none",
                            cursor: "pointer",
                            padding: 0,
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                            fontFamily: fontUI,
                          }}
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                          >
                            <path d="M12 5v14M5 12h14" />
                          </svg>
                          添加备注
                        </button>
                      ) : (
                        <div style={{ marginTop: 12 }}>
                          <WarmInput
                            label="备注"
                            id="note"
                            name="note"
                            value={formData.note}
                            onChange={handleInputChange}
                            placeholder="口味偏好、送达时间等"
                          >
                            <textarea
                              id="note"
                              name="note"
                              value={formData.note}
                              onChange={handleInputChange}
                              placeholder="口味偏好、送达时间等"
                              rows={2}
                              style={{
                                width: "100%",
                                padding: "11px 14px",
                                fontSize: 14,
                                fontFamily: fontUI,
                                border: `1.5px solid ${borderSubtle}`,
                                borderRadius: 12,
                                outline: "none",
                                color: textPrimary,
                                background: bgRaised,
                                resize: "vertical",
                                boxSizing: "border-box",
                                minHeight: 60,
                                transition: "all .2s ease",
                              }}
                              onFocus={(e) => {
                                e.target.style.borderColor = accent;
                                e.target.style.background = bgOverlay;
                              }}
                              onBlur={(e) => {
                                e.target.style.borderColor = borderSubtle;
                                e.target.style.background = bgRaised;
                              }}
                            />
                          </WarmInput>
                        </div>
                      )}
                    </form>
                  </Card>

                  {/* ═══ 预约 / 锁定提示 — 桌面端在左栏 ═══ */}
                  <div className="checkout-notices-desktop">
                    {shouldReserve && (
                      <div style={{ margin: '0 0 14px', padding: '12px 14px', borderRadius: 16, background: 'rgba(106,155,204,0.06)', border: '1px solid rgba(106,155,204,0.18)', fontSize: 12, color: '#5A89B8' }}>
                        <div style={{ fontWeight: 500, marginBottom: 4 }}>
                          {reservationFromClosure ? '店铺当前打烊，本单将以预约方式提交' : '本单包含预约商品，将以预约订单处理'}
                        </div>
                        {hasReservationItems && (
                          <div style={{ color: 'rgba(90,137,184,0.8)', lineHeight: 1.5 }}>请确认预约说明，配送时间将根据预约安排。</div>
                        )}
                      </div>
                    )}
                    {cycleLocked && (
                      <div style={{ margin: '0 0 14px', padding: '12px 14px', borderRadius: 16, background: 'rgba(201,148,58,0.06)', border: '1px solid rgba(201,148,58,0.18)', fontSize: 12, color: '#C9943A', fontWeight: 500 }}>
                        暂时无法结算，请联系管理员
                      </div>
                    )}
                  </div>

                  {/* ═══ 支付方式 — 桌面端显示在左栏内 ═══ */}
                  <div className="checkout-payment-desktop">
                    <Card style={{ marginBottom: 0 }}>
                      <SectionLabel icon="💳" title="支付方式" />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 14, background: 'rgba(107,143,71,0.06)', border: '1px solid rgba(107,143,71,0.15)' }}>
                        <div style={{ width: 32, height: 32, borderRadius: 10, flexShrink: 0, background: '#2DC100', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg width="18" height="18" viewBox="0 0 1024 1024" fill="#fff"><path d="M690.1 377.4c5.9 0 11.8.2 17.6.5-24.4-128.7-158.3-227.3-313.4-227.3C209 150.6 56.7 281.3 56.7 443.8c0 93.3 51.4 169.9 137 227.3l-34.2 102.6 119.6-59.8c42.8 8.6 77 17.1 119.6 17.1 5.6 0 11.1-.2 16.6-.5a245 245 0 0 1-10.6-72.2c0-150.2 130-280.9 285.4-280.9zM487.7 319.8c25.7 0 42.8 17.1 42.8 42.8s-17.1 42.8-42.8 42.8-51.4-17.1-51.4-42.8 25.7-42.8 51.4-42.8zm-213.8 85.6c-25.7 0-51.4-17.1-51.4-42.8s25.7-42.8 51.4-42.8 42.8 17.1 42.8 42.8-17.1 42.8-42.8 42.8zm678.4 252.3c0-136.8-128.4-247.5-273.6-247.5-153.9 0-274.2 110.7-274.2 247.5s120.3 247.5 274.2 247.5c42.8 0 85.6-8.6 119.6-25.7l94.2 51.4-25.7-85.6c68.5-51.4 85.5-119.5 85.5-187.6zm-362.2-34.2c-17.1 0-34.2-17.1-34.2-34.2s17.1-34.2 34.2-34.2 42.8 17.1 42.8 34.2-25.7 34.2-42.8 34.2zm179.3 0c-17.1 0-34.2-17.1-34.2-34.2s17.1-34.2 34.2-34.2c25.7 0 42.8 17.1 42.8 34.2s-17.1 34.2-42.8 34.2z"/></svg>
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500, color: textPrimary }}>微信扫码支付</div>
                          <div style={{ fontSize: 11, color: textSecondary, marginTop: 1 }}>获取收款码后扫码付款</div>
                        </div>
                      </div>
                    </Card>
                  </div>
                </div>

                {/* ── Right Column ── */}
                <div className="checkout-col-right">
                  {/* ═══ 订单摘要 ═══ */}
                  <Card>
                    <SectionLabel
                      icon="📋"
                      title="订单摘要"
                      extra={
                        <span style={{ fontSize: 12, color: textMuted }}>
                          {cart.items?.reduce(
                            (a, p) => a + Number(p.quantity || 0),
                            0,
                          ) || 0}{" "}
                          件
                        </span>
                      }
                    />
                    <div style={{ maxHeight: 240, overflowY: "auto" }}>
                      {cart.items &&
                        cart.items
                          .sort((a, b) => {
                            const aIsNonSellable = Boolean(a.is_not_for_sale);
                            const bIsNonSellable = Boolean(b.is_not_for_sale);
                            if (aIsNonSellable && !bIsNonSellable) return 1;
                            if (!aIsNonSellable && bIsNonSellable) return -1;
                            return 0;
                          })
                          .map((item) => {
                            const isDown =
                              item.is_active === 0 || item.is_active === false;
                            const isNonSellable = Boolean(item.is_not_for_sale);
                            return (
                              <div
                                key={item.product_id + (item.variant_id || "")}
                                style={{
                                  display: "flex",
                                  gap: 12,
                                  padding: "12px 0",
                                  borderBottom: `1px solid ${borderSubtle}`,
                                  opacity: isDown ? 0.5 : 1,
                                }}
                              >
                                {getProductImage(item) ? (
                                  <img
                                    src={getProductImage(item)}
                                    alt={item.name || ""}
                                    style={{
                                      width: 44,
                                      height: 44,
                                      borderRadius: 10,
                                      flexShrink: 0,
                                      objectFit: "cover",
                                      background: bgBase,
                                      border: `1px solid ${borderSubtle}`,
                                    }}
                                  />
                                ) : (
                                  <div
                                    style={{
                                      width: 44,
                                      height: 44,
                                      borderRadius: 10,
                                      flexShrink: 0,
                                      background: bgBase,
                                      border: `1px solid ${borderSubtle}`,
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      fontSize: 18,
                                      color: textSecondary,
                                    }}
                                  >
                                    {item.name?.charAt(0) || "?"}
                                  </div>
                                )}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div
                                    style={{
                                      display: "flex",
                                      justifyContent: "space-between",
                                      alignItems: "flex-start",
                                    }}
                                  >
                                    <div
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 6,
                                        flexWrap: "wrap",
                                      }}
                                    >
                                      <span
                                        style={{
                                          fontSize: 14,
                                          fontWeight: 500,
                                          color: textPrimary,
                                        }}
                                      >
                                        {item.name}
                                      </span>
                                      {item.variant_name && (
                                        <span
                                          style={{
                                            fontSize: 11,
                                            padding: "1px 6px",
                                            borderRadius: 4,
                                            background: "rgba(217,119,87,0.1)",
                                            color: accent,
                                          }}
                                        >
                                          {item.variant_name}
                                        </span>
                                      )}
                                      {item.reservation_required && (
                                        <span
                                          style={{
                                            fontSize: 11,
                                            padding: "1px 6px",
                                            borderRadius: 4,
                                            background: "rgba(106,155,204,0.1)",
                                            color: "#5A89B8",
                                          }}
                                        >
                                          预约
                                        </span>
                                      )}
                                      {isNonSellable && (
                                        <span
                                          style={{
                                            fontSize: 11,
                                            padding: "1px 6px",
                                            borderRadius: 4,
                                            background: "rgba(217,119,87,0.1)",
                                            color: accent,
                                          }}
                                        >
                                          非卖品
                                        </span>
                                      )}
                                      {isDown && (
                                        <span
                                          style={{
                                            fontSize: 11,
                                            padding: "1px 6px",
                                            borderRadius: 4,
                                            background: `${bgBase}`,
                                            color: textMuted,
                                          }}
                                        >
                                          已下架
                                        </span>
                                      )}
                                    </div>
                                    <span
                                      style={{
                                        fontSize: 14,
                                        fontWeight: 600,
                                        color: textPrimary,
                                        fontVariantNumeric: "tabular-nums",
                                        flexShrink: 0,
                                        marginLeft: 8,
                                      }}
                                    >
                                      ¥{item.subtotal}
                                    </span>
                                  </div>
                                  <div
                                    style={{
                                      display: "flex",
                                      justifyContent: "space-between",
                                      marginTop: 3,
                                    }}
                                  >
                                    <span
                                      style={{ fontSize: 12, color: textMuted }}
                                    >
                                      ×{item.quantity}{" "}
                                      {(isDown || isNonSellable) && (
                                        <span>（不计入金额）</span>
                                      )}
                                    </span>
                                    {item.reservation_required && (
                                      <span
                                        style={{
                                          fontSize: 11,
                                          color: "#5A89B8",
                                          textAlign: "right",
                                          flexShrink: 0,
                                        }}
                                      >
                                        {formatReservationCutoff(
                                          item.reservation_cutoff,
                                        )}
                                        {item.reservation_note
                                          ? ` · ${item.reservation_note}`
                                          : ""}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                    </div>

                    {/* 费用明细 */}
                    <div
                      style={{
                        borderTop: `1px solid ${borderSubtle}`,
                        paddingTop: 14,
                        marginTop: 4,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          fontSize: 13,
                          marginBottom: 8,
                        }}
                      >
                        <span style={{ color: textSecondary }}>商品金额</span>
                        <span
                          style={{
                            color: textPrimary,
                            fontWeight: 500,
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          ¥{cart.total_price}
                        </span>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          fontSize: 13,
                          marginBottom: 8,
                        }}
                      >
                        <span style={{ color: textSecondary }}>配送费</span>
                        <span
                          style={{
                            color:
                              cart.shipping_fee > 0
                                ? textPrimary
                                : colorSuccess,
                            fontWeight: 500,
                          }}
                        >
                          {cart.shipping_fee > 0
                            ? `¥${cart.shipping_fee}`
                            : "免费"}
                        </span>
                      </div>
                      {cart.shipping_fee > 0 &&
                        deliveryConfig.free_delivery_threshold < 999999999 && (
                          <div
                            style={{
                              fontSize: 11,
                              color: textMuted,
                              textAlign: "right",
                              marginBottom: 8,
                            }}
                          >
                            满 ¥{deliveryConfig.free_delivery_threshold}{" "}
                            免配送费
                          </div>
                        )}
                    </div>
                  </Card>

                  {/* ═══ 优惠券 — 开关样式 ═══ */}
                  {usableCoupons.length > 0 && (
                    <label
                      className="warm-card"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "16px 18px",
                        background: bgRaised,
                        borderRadius: 20,
                        border: `1px solid ${borderSubtle}`,
                        cursor: "pointer",
                        marginBottom: 14,
                        transition: "all .2s ease",
                        ...(applyCoupon
                          ? {
                              borderColor: "rgba(217,119,87,0.25)",
                              background: "rgba(217,119,87,0.04)",
                            }
                          : {}),
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                        }}
                      >
                        <span style={{ fontSize: 18 }}>🎟️</span>
                        <div>
                          <div
                            style={{
                              fontSize: 14,
                              fontWeight: 500,
                              color: textPrimary,
                            }}
                          >
                            使用优惠券
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              color: textMuted,
                              marginTop: 2,
                            }}
                          >
                            {applyCoupon && selectedCouponId
                              ? (() => {
                                  const c = coupons.find(
                                    (x) => x.id === selectedCouponId,
                                  );
                                  return c
                                    ? `已选 ${parseFloat(c.amount).toFixed(2)}元券${c.expires_at ? `，${new Date(c.expires_at.replace(" ", "T") + "Z").toLocaleDateString()} 到期` : ""}`
                                    : "已选推荐优惠";
                                })()
                              : "已选推荐最优组合"}
                          </div>
                        </div>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        {applyCoupon && couponDiscountAmount > 0 && (
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: accent,
                            }}
                          >
                            -¥{couponDiscountAmount.toFixed(2)}
                          </span>
                        )}
                        {/* Toggle switch */}
                        <div
                          onClick={(e) => {
                            e.preventDefault();
                            setApplyCoupon(!applyCoupon);
                          }}
                          style={{
                            position: "relative",
                            width: 44,
                            height: 24,
                            flexShrink: 0,
                          }}
                        >
                          <div
                            style={{
                              width: 44,
                              height: 24,
                              borderRadius: 12,
                              background: applyCoupon ? accent : borderDefault,
                              transition: "background .2s ease",
                            }}
                          />
                          <div
                            style={{
                              position: "absolute",
                              top: 3,
                              left: applyCoupon ? 23 : 3,
                              width: 18,
                              height: 18,
                              borderRadius: 9,
                              background: "#fff",
                              boxShadow: "0 1px 4px rgba(20,20,19,0.2)",
                              transition: "left .2s cubic-bezier(.4,0,.2,1)",
                            }}
                          />
                        </div>
                      </div>
                    </label>
                  )}

                  {/* ═══ 满额活动 ═══ */}
                  {cart.items &&
                    cart.items.length > 0 &&
                    autoGifts.length > 0 && (
                      <Card>
                        <SectionLabel icon="🎁" title="满赠活动" />
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 10,
                          }}
                        >
                          {autoGifts.map((threshold, index) => {
                            const thresholdAmount =
                              threshold.threshold_amount || 0;
                            const cartTotal = cart?.total_price || 0;
                            const unlocked = cartTotal >= thresholdAmount;
                            const diff = Math.max(
                              thresholdAmount - cartTotal,
                              0,
                            );

                            const rewardParts = [];
                            if (
                              threshold.gift_products &&
                              threshold.selected_product_name
                            )
                              rewardParts.push(threshold.selected_product_name);
                            if (
                              threshold.gift_coupon &&
                              threshold.coupon_amount > 0
                            )
                              rewardParts.push(
                                `${threshold.coupon_amount}元优惠券`,
                              );
                            const rewardText =
                              rewardParts.length > 0
                                ? rewardParts.join(" + ")
                                : "暂无奖励";

                            return (
                              <div
                                key={threshold.threshold_amount || index}
                                style={{
                                  padding: "14px 14px 12px",
                                  borderRadius: 14,
                                  background: unlocked
                                    ? "rgba(107,143,71,0.06)"
                                    : bgBase,
                                  border: `1px solid ${unlocked ? "rgba(107,143,71,0.2)" : borderSubtle}`,
                                  transition: "all .3s ease",
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    marginBottom: 8,
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: 13,
                                      fontWeight: 500,
                                      color: textPrimary,
                                    }}
                                  >
                                    满 ¥{thresholdAmount} 赠{" "}
                                    <span style={{ color: accent }}>
                                      {rewardText}
                                    </span>
                                  </span>
                                  <span
                                    style={{
                                      fontSize: 12,
                                      fontWeight: 500,
                                      color: unlocked ? colorSuccess : accent,
                                    }}
                                  >
                                    {unlocked
                                      ? "✓ 已达标"
                                      : `差 ¥${diff.toFixed(2)}`}
                                  </span>
                                </div>
                                <ProgressBar
                                  current={cartTotal}
                                  target={thresholdAmount}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </Card>
                    )}

                  {/* ═══ 抽奖奖品 ═══ */}
                  {eligibleRewards &&
                    eligibleRewards.length > 0 &&
                    cart?.lottery_enabled !== false && (
                      <Card>
                        <SectionLabel icon="🎰" title="抽奖奖品" />
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                          }}
                        >
                          {eligibleRewards.map((r) => {
                            const meet =
                              (cart?.total_price ?? 0) >= lotteryThreshold;
                            return (
                              <div
                                key={r.id}
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "baseline",
                                  fontSize: 13,
                                  color: meet ? textPrimary : textMuted,
                                  padding: "6px 0",
                                }}
                              >
                                <span>
                                  <span>
                                    {r.prize_name || "奖品"} ×{" "}
                                    {r.prize_quantity || 1}
                                  </span>
                                  {(r.prize_product_name ||
                                    r.prize_variant_name) && (
                                    <span
                                      style={{
                                        fontSize: 11,
                                        color: textMuted,
                                        marginLeft: 6,
                                      }}
                                    >
                                      {r.prize_product_name || ""}
                                      {r.prize_variant_name
                                        ? `（${r.prize_variant_name}）`
                                        : ""}
                                    </span>
                                  )}
                                </span>
                                <span
                                  style={{ fontSize: 11, color: textMuted }}
                                >
                                  赠品
                                </span>
                              </div>
                            );
                          })}
                        </div>
                        {(() => {
                          const meet =
                            (cart?.total_price ?? 0) >= lotteryThreshold;
                          return (
                            <p
                              style={{
                                marginTop: 8,
                                fontSize: 12,
                                color: meet ? colorSuccess : textMuted,
                              }}
                            >
                              {meet
                                ? `本单满${formattedLotteryThreshold}元，将自动参与抽奖`
                                : `订单满${formattedLotteryThreshold}元可参与抽奖`}
                            </p>
                          );
                        })()}
                      </Card>
                    )}

                  {/* ═══ 预约 / 锁定提示 — 移动端在右栏底部 ═══ */}
                  <div className="checkout-notices-mobile">
                    {shouldReserve && (
                      <div style={{ margin: '0 0 14px', padding: '12px 14px', borderRadius: 16, background: 'rgba(106,155,204,0.06)', border: '1px solid rgba(106,155,204,0.18)', fontSize: 12, color: '#5A89B8' }}>
                        <div style={{ fontWeight: 500, marginBottom: 4 }}>
                          {reservationFromClosure ? '店铺当前打烊，本单将以预约方式提交' : '本单包含预约商品，将以预约订单处理'}
                        </div>
                        {hasReservationItems && (
                          <div style={{ color: 'rgba(90,137,184,0.8)', lineHeight: 1.5 }}>请确认预约说明，配送时间将根据预约安排。</div>
                        )}
                      </div>
                    )}
                    {cycleLocked && (
                      <div style={{ margin: '0 0 14px', padding: '12px 14px', borderRadius: 16, background: 'rgba(201,148,58,0.06)', border: '1px solid rgba(201,148,58,0.18)', fontSize: 12, color: '#C9943A', fontWeight: 500 }}>
                        暂时无法结算，请联系管理员
                      </div>
                    )}
                  </div>
                </div>

                {/* ═══ 支付方式 — 移动端显示在最后 ═══ */}
                <div className="checkout-payment-mobile">
                  <Card style={{ marginBottom: 0 }}>
                    <SectionLabel icon="💳" title="支付方式" />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 14, background: 'rgba(107,143,71,0.06)', border: '1px solid rgba(107,143,71,0.15)' }}>
                      <div style={{ width: 32, height: 32, borderRadius: 10, flexShrink: 0, background: '#2DC100', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="18" height="18" viewBox="0 0 1024 1024" fill="#fff"><path d="M690.1 377.4c5.9 0 11.8.2 17.6.5-24.4-128.7-158.3-227.3-313.4-227.3C209 150.6 56.7 281.3 56.7 443.8c0 93.3 51.4 169.9 137 227.3l-34.2 102.6 119.6-59.8c42.8 8.6 77 17.1 119.6 17.1 5.6 0 11.1-.2 16.6-.5a245 245 0 0 1-10.6-72.2c0-150.2 130-280.9 285.4-280.9zM487.7 319.8c25.7 0 42.8 17.1 42.8 42.8s-17.1 42.8-42.8 42.8-51.4-17.1-51.4-42.8 25.7-42.8 51.4-42.8zm-213.8 85.6c-25.7 0-51.4-17.1-51.4-42.8s25.7-42.8 51.4-42.8 42.8 17.1 42.8 42.8-17.1 42.8-42.8 42.8zm678.4 252.3c0-136.8-128.4-247.5-273.6-247.5-153.9 0-274.2 110.7-274.2 247.5s120.3 247.5 274.2 247.5c42.8 0 85.6-8.6 119.6-25.7l94.2 51.4-25.7-85.6c68.5-51.4 85.5-119.5 85.5-187.6zm-362.2-34.2c-17.1 0-34.2-17.1-34.2-34.2s17.1-34.2 34.2-34.2 42.8 17.1 42.8 34.2-25.7 34.2-42.8 34.2zm179.3 0c-17.1 0-34.2-17.1-34.2-34.2s17.1-34.2 34.2-34.2c25.7 0 42.8 17.1 42.8 34.2s-17.1 34.2-42.8 34.2z"/></svg>
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: textPrimary }}>微信扫码支付</div>
                        <div style={{ fontSize: 11, color: textSecondary, marginTop: 1 }}>获取收款码后扫码付款</div>
                      </div>
                    </div>
                  </Card>
                </div>
              </div>
            </>
          }
        </div>

        {/* ── Bottom Bar ── */}
        {!isLoading && (
          <div
            className="checkout-bottom-bar"
            style={{
              position: "fixed",
              bottom: 12,
              left: "50%",
              transform: "translateX(-50%)",
              width: "calc(100% - 24px)",
              maxWidth: 1080,
              zIndex: 20,
              padding:
                "14px 20px calc(14px + env(safe-area-inset-bottom, 4px)) 20px",
              background: "rgba(255,255,255,.92)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              border: `1px solid ${borderSubtle}`,
              borderRadius: 20,
              boxShadow: "0 4px 24px rgba(20,20,19,0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 14,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 11,
                  color: textMuted,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  flexWrap: "wrap",
                }}
              >
                <span>合计</span>
                {couponDiscountAmount > 0 && (
                  <span
                    style={{
                      fontSize: 10,
                      color: accent,
                      fontWeight: 600,
                      padding: "1px 6px",
                      background: "rgba(217,119,87,0.08)",
                      borderRadius: 4,
                    }}
                  >
                    已减 ¥{couponDiscountAmount.toFixed(2)}
                  </span>
                )}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  marginTop: 2,
                }}
              >
                <AnimatedPrice
                  value={payableAmount}
                  className=""
                  style={{
                    fontSize: 26,
                    fontWeight: 700,
                    color: accent,
                    fontVariantNumeric: "tabular-nums",
                    lineHeight: 1.2,
                    fontFamily: fontUI,
                  }}
                />
              </div>
            </div>
            <button
              onClick={handleCreatePayment}
              disabled={
                isCreatingPayment ||
                cycleLocked ||
                closedBlocked ||
                !locationReady ||
                addressInvalid
              }
              style={{
                padding: "13px 28px",
                fontSize: 14,
                fontWeight: 600,
                fontFamily: fontUI,
                border: "none",
                borderRadius: 14,
                cursor:
                  isCreatingPayment ||
                  cycleLocked ||
                  closedBlocked ||
                  !locationReady ||
                  addressInvalid
                    ? "not-allowed"
                    : "pointer",
                background:
                  isCreatingPayment ||
                  cycleLocked ||
                  closedBlocked ||
                  !locationReady ||
                  addressInvalid
                    ? borderDefault
                    : accent,
                color:
                  isCreatingPayment ||
                  cycleLocked ||
                  closedBlocked ||
                  !locationReady ||
                  addressInvalid
                    ? textMuted
                    : "#FAF9F5",
                boxShadow:
                  isCreatingPayment ||
                  cycleLocked ||
                  closedBlocked ||
                  !locationReady ||
                  addressInvalid
                    ? "none"
                    : "0 4px 16px rgba(217,119,87,0.35)",
                transition: "all .25s cubic-bezier(.16,1,.3,1)",
                letterSpacing: ".03em",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {isCreatingPayment ? "获取中..." : checkoutButtonLabel}
            </button>
          </div>
        )}
      </div>

      <LegalModal
        open={legalModal.open}
        initialTab={legalModal.tab}
        onClose={() => setLegalModal({ open: false, tab: "terms" })}
      />

      {/* ═══ 微信收款码弹窗 ═══ */}
      {showPayModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(20,20,19,0.5)",
            backdropFilter: "blur(4px)",
            padding: 24,
            animation: "fadeIn .2s ease",
          }}
        >
          <div
            style={{ position: "absolute", inset: 0 }}
            onClick={() => {
              setShowPayModal(false);
              setPaymentQr(null);
            }}
          />
          <div
            style={{
              position: "relative",
              width: "100%",
              maxWidth: 400,
              background: bgOverlay,
              border: `1px solid ${borderDefault}`,
              borderRadius: 24,
              boxShadow: "0 24px 80px rgba(20,20,19,0.25)",
              animation: "modalUp .25s cubic-bezier(.16,1,.3,1)",
              zIndex: 1,
              overflow: "hidden",
            }}
          >
            {/* Close */}
            <button
              onClick={() => {
                setShowPayModal(false);
                setPaymentQr(null);
              }}
              style={{
                position: "absolute",
                top: 16,
                right: 16,
                width: 32,
                height: 32,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 8,
                border: "none",
                cursor: "pointer",
                background: bgRaised,
                color: textMuted,
                zIndex: 2,
                transition: "all .15s ease",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path
                  d="M3 3l10 10M13 3L3 13"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>

            {/* Header */}
            <div style={{ padding: "28px 24px 0", textAlign: "center" }}>
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 14,
                  margin: "0 auto 16px",
                  background: colorSuccess,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#fff"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
              </div>
              <h4
                style={{
                  fontFamily: fontDisplay,
                  fontSize: 20,
                  fontWeight: 400,
                  color: textPrimary,
                  marginBottom: 4,
                }}
              >
                长按图片扫描二维码
              </h4>
              <p style={{ fontSize: 13, color: textMuted }}>
                使用微信扫码完成支付
              </p>
            </div>

            {/* QR */}
            <div style={{ padding: "20px 24px" }}>
              {paymentQr ? (
                paymentQr.owner_type === "default" ? (
                  <div
                    style={{
                      width: "100%",
                      aspectRatio: "1",
                      maxWidth: 280,
                      margin: "0 auto",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: bgBase,
                      borderRadius: 16,
                      border: `2px dashed ${borderDefault}`,
                    }}
                  >
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
                      <p
                        style={{
                          fontSize: 14,
                          fontWeight: 500,
                          color: textSecondary,
                        }}
                      >
                        暂不可付款
                      </p>
                      <p
                        style={{ fontSize: 12, color: textMuted, marginTop: 4 }}
                      >
                        请联系管理员
                      </p>
                    </div>
                  </div>
                ) : (
                  <img
                    src={paymentQr.image_path}
                    alt={paymentQr.name || "收款码"}
                    style={{
                      display: "block",
                      width: "100%",
                      maxWidth: 280,
                      margin: "0 auto",
                      borderRadius: 12,
                      objectFit: "contain",
                    }}
                  />
                )
              ) : (
                <div
                  style={{
                    width: "100%",
                    aspectRatio: "1",
                    maxWidth: 280,
                    margin: "0 auto",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: bgBase,
                    borderRadius: 16,
                  }}
                >
                  <div style={{ textAlign: "center" }}>
                    <div
                      style={{
                        width: 24,
                        height: 24,
                        margin: "0 auto 8px",
                        border: `2px solid ${accent}`,
                        borderTopColor: "transparent",
                        borderRadius: "50%",
                        animation: "spin 1s linear infinite",
                      }}
                    />
                    <p style={{ fontSize: 13, color: textMuted }}>
                      加载收款码...
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={{ padding: "0 24px 24px", display: "flex", gap: 10 }}>
              <button
                onClick={handleMarkPaid}
                disabled={
                  cycleLocked ||
                  (paymentQr && paymentQr.owner_type === "default") ||
                  addressInvalid
                }
                style={{
                  flex: 1,
                  padding: "13px 12px",
                  fontSize: 14,
                  fontWeight: 600,
                  fontFamily: fontUI,
                  border: "none",
                  borderRadius: 12,
                  cursor: "pointer",
                  background: colorSuccess,
                  color: "#fff",
                  boxShadow: "0 4px 12px rgba(107,143,71,0.3)",
                  opacity:
                    cycleLocked ||
                    (paymentQr && paymentQr.owner_type === "default") ||
                    addressInvalid
                      ? 0.5
                      : 1,
                  transition: "all .2s ease",
                }}
              >
                已完成付款
              </button>
              <button
                onClick={handlePayLater}
                disabled={cycleLocked || addressInvalid || !locationReady}
                style={{
                  flex: 1,
                  padding: "13px 12px",
                  fontSize: 14,
                  fontWeight: 500,
                  fontFamily: fontUI,
                  border: `1.5px solid ${borderDefault}`,
                  borderRadius: 12,
                  cursor: "pointer",
                  background: "transparent",
                  color: textPrimary,
                  opacity:
                    cycleLocked || addressInvalid || !locationReady ? 0.5 : 1,
                  transition: "all .2s ease",
                }}
              >
                稍后支付
              </button>
            </div>

            {/* Footer link */}
            <div style={{ textAlign: "center", paddingBottom: 20 }}>
              <Link
                href="/orders"
                style={{
                  fontSize: 13,
                  color: accentWarm,
                  textDecoration: "underline",
                  textDecorationColor: "rgba(201,100,66,0.3)",
                }}
              >
                查看我的订单
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ═══ 抽奖弹窗 ═══ */}
      {lotteryOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(20,20,19,0.5)",
            backdropFilter: "blur(4px)",
            padding: 24,
            animation: "fadeIn .2s ease",
          }}
        >
          <div
            style={{ position: "absolute", inset: 0 }}
            onClick={() => {
              setLotteryOpen(false);
              setLotteryPrize(null);
              setShowSuccessAnimation(true);
            }}
          />
          <div
            style={{
              position: "relative",
              maxWidth: 360,
              width: "100%",
              background: bgOverlay,
              borderRadius: 24,
              border: `1px solid ${borderDefault}`,
              boxShadow: "0 24px 80px rgba(20,20,19,0.25)",
              padding: 28,
              zIndex: 1,
              animation: "modalUp .25s cubic-bezier(.16,1,.3,1)",
            }}
          >
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <h3
                style={{
                  fontFamily: fontDisplay,
                  fontSize: 20,
                  fontWeight: 400,
                  color: textPrimary,
                }}
              >
                抽奖
              </h3>
              <p style={{ fontSize: 12, color: textMuted, marginTop: 4 }}>
                订单满{formattedLotteryThreshold}元即可参与
              </p>
            </div>
            <div
              style={{
                height: 72,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 16,
              }}
            >
              <span
                style={{
                  fontSize: 24,
                  fontWeight: 600,
                  fontFamily: fontUI,
                  color: spinning ? accent : textPrimary,
                  transition: "color .3s ease",
                }}
              >
                {lotteryDisplay}
              </span>
            </div>
            {!spinning && (
              <>
                <div style={{ textAlign: "center", marginBottom: 20 }}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "6px 16px",
                      borderRadius: 50,
                      fontSize: 13,
                      fontWeight: 500,
                      background:
                        lotteryResult === "谢谢参与"
                          ? bgBase
                          : "rgba(217,119,87,0.08)",
                      color:
                        lotteryResult === "谢谢参与" ? textSecondary : accent,
                      border: `1px solid ${lotteryResult === "谢谢参与" ? borderSubtle : "rgba(217,119,87,0.2)"}`,
                    }}
                  >
                    {lotteryResult === "谢谢参与"
                      ? "谢谢参与"
                      : `恭喜获得：${lotteryResult || "谢谢参与"}`}
                  </span>
                  {lotteryPrize ? (
                    <div
                      style={{
                        fontSize: 12,
                        color: textSecondary,
                        marginTop: 8,
                        lineHeight: 1.6,
                      }}
                    >
                      <div>
                        奖品：{lotteryPrize.product_name || "未命名奖品"}
                        {lotteryPrize.variant_name
                          ? `（${lotteryPrize.variant_name}）`
                          : ""}
                      </div>
                      <div style={{ color: textMuted }}>
                        将在下次满额订单随单配送
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{ fontSize: 12, color: textMuted, marginTop: 8 }}
                    >
                      本次未中奖，继续加油！
                    </div>
                  )}
                </div>
                <button
                  onClick={() => {
                    setLotteryOpen(false);
                    setLotteryPrize(null);
                    setShowSuccessAnimation(true);
                    setTimeout(() => router.push("/orders"), 1700);
                  }}
                  style={{
                    width: "100%",
                    padding: "13px 24px",
                    fontSize: 14,
                    fontWeight: 600,
                    fontFamily: fontUI,
                    border: "none",
                    borderRadius: 12,
                    cursor: "pointer",
                    background: accent,
                    color: "#fff",
                    boxShadow: "0 4px 16px rgba(217,119,87,0.3)",
                  }}
                >
                  我知道了
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ═══ 下单成功页 ═══ */}
      {showSuccessAnimation && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: `radial-gradient(ellipse 70% 50% at 50% 30%, rgba(217,119,87,0.06) 0%, transparent 60%), ${bgBase}`,
            padding: 32,
            textAlign: "center",
            fontFamily: fontUI,
          }}
        >
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: "50%",
              marginBottom: 24,
              background: accent,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 8px 32px rgba(217,119,87,0.3)",
              animation: "pop .5s cubic-bezier(.175,.885,.32,1.275) both",
            }}
          >
            <svg
              width="36"
              height="36"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#fff"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <path d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2
            style={{
              fontFamily: fontDisplay,
              fontSize: 22,
              fontWeight: 400,
              color: textPrimary,
              marginBottom: 8,
            }}
          >
            下单成功
          </h2>
          {orderId && (
            <p style={{ fontSize: 14, color: textSecondary, lineHeight: 1.8 }}>
              订单号{" "}
              <span
                style={{
                  fontWeight: 600,
                  color: accent,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {orderId}
              </span>
            </p>
          )}
          <p style={{ fontSize: 13, color: textMuted, marginTop: 4 }}>
            正在准备中，确认订单后我们将立即为您配送
          </p>

          {lotteryPrize && (
            <div
              style={{
                marginTop: 20,
                padding: "10px 20px",
                borderRadius: 14,
                background: "rgba(107,143,71,0.06)",
                border: "1px solid rgba(107,143,71,0.15)",
                fontSize: 13,
                color: colorSuccess,
              }}
            >
              🎁 恭喜获得：{lotteryPrize.product_name || "奖品"}
              {lotteryPrize.variant_name
                ? `（${lotteryPrize.variant_name}）`
                : ""}
            </div>
          )}

          <button
            onClick={() => router.push("/orders")}
            style={{
              marginTop: 32,
              padding: "14px 52px",
              fontSize: 15,
              fontWeight: 600,
              fontFamily: fontUI,
              border: "none",
              borderRadius: 14,
              cursor: "pointer",
              background: accent,
              color: "#fff",
              boxShadow: "0 4px 20px rgba(217,119,87,0.3)",
              transition: "all .2s ease",
            }}
          >
            查看订单
          </button>

          <button
            onClick={() => router.push("/")}
            style={{
              marginTop: 12,
              padding: "10px 32px",
              fontSize: 13,
              fontWeight: 500,
              fontFamily: fontUI,
              border: "none",
              borderRadius: 14,
              cursor: "pointer",
              background: "transparent",
              color: textSecondary,
              transition: "all .2s ease",
            }}
          >
            返回首页
          </button>
        </div>
      )}

      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        html { background: #fafafa; }
        input::placeholder, textarea::placeholder { color: #bbb; }
        body { overflow-x: hidden; background: #fafafa; overscroll-behavior: none; }
        button { font-family: inherit; }
        @keyframes shimmer { 0% { background-position: -600px 0; } 100% { background-position: 600px 0; } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes modalUp { from { opacity: 0; transform: translateY(20px) scale(0.97); } to { opacity: 1; transform: none; } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pop { from { transform: scale(0); opacity: 0; } to { transform: scale(1); opacity: 1; } }

        /* Desktop two-column layout */
        .checkout-grid {
          display: flex;
          flex-direction: column;
          gap: 0;
        }
        /* Mobile: left(1) → right(2) → payment-mobile(3) via order */
        .checkout-col-left   { order: 1; }
        .checkout-col-right  { order: 2; }
        .checkout-payment-mobile { order: 3; margin-top: 14px; }
        /* Desktop copies hidden on mobile, mobile copies hidden on desktop */
        .checkout-payment-desktop { display: none; }
        .checkout-notices-desktop { display: none; }

        @media (min-width: 720px) {
          .checkout-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            column-gap: 20px;
            align-items: start;
          }
          .checkout-col-right {
            position: sticky; top: 68px;
            align-self: start;
          }
          .checkout-notices-desktop { display: block; margin-top: 14px; }
          .checkout-payment-desktop { display: block; }
          .checkout-payment-mobile { display: none; }
          .checkout-notices-mobile { display: none; }
        }
        @media (min-width: 960px) {
          .checkout-grid {
            grid-template-columns: 1.15fr 1fr;
            column-gap: 32px;
          }
        }

        /* Desktop: enlarge cards & spacing */
        @media (min-width: 720px) {
          .checkout-main {
            padding-top: 28px !important;
            padding-left: 24px !important;
            padding-right: 24px !important;
          }
          .warm-card {
            padding: 24px 22px !important;
            border-radius: 22px !important;
          }
          .checkout-payment-desktop > .warm-card {
            margin-bottom: 0 !important;
          }
          .checkout-grid input,
          .checkout-grid textarea {
            padding: 13px 16px !important;
            font-size: 15px !important;
          }
        }

        /* Bottom bar mobile full-width on very small screens */
        @media (max-width: 480px) {
          .checkout-bottom-bar {
            bottom: 0 !important;
            width: 100% !important;
            border-radius: 20px 20px 0 0 !important;
            border-bottom: none !important;
          }
        }

        /* Scrollbar */
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #ddd; border-radius: 2px; }
        ::-webkit-scrollbar-thumb:hover { background: #bbb; }
      `}</style>
    </>
  );
}
