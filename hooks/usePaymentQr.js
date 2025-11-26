import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useAuth, useApi } from './useAuth';
import { useLocation } from './useLocation';

const PaymentQrContext = createContext(null);

// sessionStorage 的 key
const STORAGE_KEY = 'payment_qr_cache';

// 从 sessionStorage 读取缓存
const loadCacheFromStorage = () => {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // 检查是否过期（缓存有效期 30 分钟）
      if (parsed.timestamp && Date.now() - parsed.timestamp < 30 * 60 * 1000) {
        return parsed.data || {};
      }
    }
  } catch (e) {
    // ignore
  }
  return {};
};

// 保存缓存到 sessionStorage
const saveCacheToStorage = (cache) => {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      data: cache,
      timestamp: Date.now()
    }));
  } catch (e) {
    // ignore
  }
};

/**
 * 收款码预加载提供者
 * 在用户进入网站后，根据地址信息预加载收款码
 * 以便在结算和订单页面能够立即显示
 */
export function PaymentQrProvider({ children }) {
  const { user, isInitialized } = useAuth();
  const { apiRequest } = useApi();
  const { location, revision: locationRevision } = useLocation();
  
  // 收款码缓存 - key 为 `${addressId}_${buildingId}`，初始从 sessionStorage 读取
  const [qrCache, setQrCache] = useState(() => loadCacheFromStorage());
  const [isLoading, setIsLoading] = useState(false);
  const [lastFetchKey, setLastFetchKey] = useState('');
  
  // 使用 ref 避免闭包问题
  const qrCacheRef = useRef(qrCache);
  useEffect(() => {
    qrCacheRef.current = qrCache;
  }, [qrCache]);

  // 生成缓存 key
  const getCacheKey = useCallback((addressId, buildingId) => {
    return `${addressId || ''}_${buildingId || ''}`;
  }, []);

  // 预加载收款码
  const preloadPaymentQr = useCallback(async (addressId, buildingId, force = false) => {
    if (!addressId || !buildingId) return null;
    
    const cacheKey = getCacheKey(addressId, buildingId);
    
    // 如果缓存中已有且不强制刷新，直接返回
    if (!force && qrCacheRef.current[cacheKey]) {
      return qrCacheRef.current[cacheKey];
    }
    
    // 避免重复请求
    if (isLoading && lastFetchKey === cacheKey) {
      return qrCacheRef.current[cacheKey] || null;
    }
    
    setIsLoading(true);
    setLastFetchKey(cacheKey);
    
    try {
      const qrResponse = await apiRequest(`/payment-qr?building_id=${buildingId}&address_id=${addressId}`);
      
      let paymentQr;
      if (qrResponse.success && qrResponse.data?.payment_qr) {
        paymentQr = qrResponse.data.payment_qr;
        
        // 预加载图片到浏览器缓存
        if (paymentQr.image_path && paymentQr.owner_type !== 'default') {
          const img = new Image();
          img.src = paymentQr.image_path;
        }
      } else {
        // 没有收款码
        paymentQr = {
          owner_type: 'default',
          name: "无收款码"
        };
      }
      
      // 更新缓存
      setQrCache(prev => {
        const next = { ...prev, [cacheKey]: paymentQr };
        saveCacheToStorage(next);
        return next;
      });
      
      return paymentQr;
    } catch (error) {
      console.warn('预加载收款码失败:', error);
      const fallbackQr = {
        owner_type: 'default',
        name: "无收款码"
      };
      setQrCache(prev => {
        const next = { ...prev, [cacheKey]: fallbackQr };
        saveCacheToStorage(next);
        return next;
      });
      return fallbackQr;
    } finally {
      setIsLoading(false);
    }
  }, [apiRequest, getCacheKey, isLoading, lastFetchKey]);

  // 获取缓存的收款码（不触发新请求）
  const getCachedPaymentQr = useCallback((addressId, buildingId) => {
    const cacheKey = getCacheKey(addressId, buildingId);
    return qrCacheRef.current[cacheKey] || null;
  }, [getCacheKey]);

  // 获取收款码（优先返回缓存，没有则触发加载）
  const getPaymentQr = useCallback(async (addressId, buildingId) => {
    const cached = getCachedPaymentQr(addressId, buildingId);
    if (cached) return cached;
    return await preloadPaymentQr(addressId, buildingId);
  }, [getCachedPaymentQr, preloadPaymentQr]);

  // 清除缓存
  const clearCache = useCallback(() => {
    setQrCache({});
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      // ignore
    }
  }, []);

  // 清除特定地址的缓存
  const invalidateCache = useCallback((addressId, buildingId) => {
    const cacheKey = getCacheKey(addressId, buildingId);
    setQrCache(prev => {
      const next = { ...prev };
      delete next[cacheKey];
      saveCacheToStorage(next);
      return next;
    });
  }, [getCacheKey]);

  // 当用户登录且有地址信息时，自动预加载收款码
  useEffect(() => {
    if (!isInitialized || !user || user.type !== 'user') {
      return;
    }
    
    const addressId = location?.address_id;
    const buildingId = location?.building_id;
    
    if (addressId && buildingId) {
      // 检查是否已有缓存
      const cacheKey = getCacheKey(addressId, buildingId);
      if (qrCacheRef.current[cacheKey]) {
        return;
      }
      
      // 静默预加载，不阻塞 UI
      preloadPaymentQr(addressId, buildingId).catch(() => {});
    }
  }, [isInitialized, user, location?.address_id, location?.building_id, locationRevision, preloadPaymentQr, getCacheKey]);

  // 用户登出时清除缓存
  useEffect(() => {
    if (!user) {
      clearCache();
    }
  }, [user, clearCache]);

  const value = {
    // 状态
    isLoading,
    qrCache,
    
    // 方法
    preloadPaymentQr,      // 预加载收款码
    getCachedPaymentQr,    // 获取缓存的收款码（同步）
    getPaymentQr,          // 获取收款码（异步，优先缓存）
    clearCache,            // 清除所有缓存
    invalidateCache,       // 清除特定缓存
  };

  return (
    <PaymentQrContext.Provider value={value}>
      {children}
    </PaymentQrContext.Provider>
  );
}

export function usePaymentQr() {
  const context = useContext(PaymentQrContext);
  if (!context) {
    throw new Error('usePaymentQr must be used within a PaymentQrProvider');
  }
  return context;
}
