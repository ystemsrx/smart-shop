import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { getApiBaseUrl } from '../utils/runtimeConfig';

// 创建认证上下文
const AuthContext = createContext(null);

// 检查是否为客户端环境
const isClient = typeof window !== 'undefined' && typeof document !== 'undefined';

// API基础URL
const API_BASE = getApiBaseUrl();

// 认证提供者组件
export function AuthProvider({ children }) {
  // 简化状态初始化 - 由于现在只在客户端运行，可以直接初始化
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isInitialized, setIsInitialized] = useState(false);

  const normalizeAccount = (payload) => {
    if (!payload) return null;
    if (payload.user) {
      return { ...payload.user, type: payload.user.type || 'user' };
    }
    if (payload.agent) {
      const agentInfo = payload.agent;
      return { ...agentInfo, type: agentInfo.type || 'agent' };
    }
    if (payload.admin) {
      const adminInfo = payload.admin;
      let accountType = adminInfo.type;
      if (!accountType) {
        const role = (adminInfo.role || '').toLowerCase();
        accountType = role === 'agent' ? 'agent' : 'admin';
      }
      return { ...adminInfo, type: accountType };
    }
    if (payload.type) {
      return { ...payload };
    }
    return { ...payload, type: 'user' };
  };

  // 检查用户登录状态
  const checkAuth = async () => {
    try {
      const response = await fetch(`${API_BASE}/auth/me`, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          const account = normalizeAccount(data.data);
          if (account) {
            setUser(account);
          }
        }
      }
    } catch (err) {
      console.log('认证检查失败:', err.message);
    } finally {
      setIsInitialized(true);
    }
  };

  // 用户登录
  const login = async (accountId, password) => {
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ student_id: accountId, password }),
      });

      const data = await response.json();

      if (data.success) {
        const account = normalizeAccount(data.data);
        if (!account) {
          throw new Error('无法识别登录身份');
        }
        setUser(account);
        return account;
      } else {
        throw new Error(data.message || '登录失败');
      }
    } catch (err) {
      const errorMessage = err.message || '网络错误，请稍后重试';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // 用户登出
  const logout = async () => {
    setIsLoading(true);
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (err) {
      // 即使请求失败也要清除本地状态
      console.log('登出请求失败:', err.message);
    } finally {
      setUser(null);
      setIsLoading(false);
    }
  };

  // 刷新令牌
  const refreshToken = async () => {
    try {
      const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          return true;
        }
      }
      return false;
    } catch (err) {
      return false;
    }
  };

  // 初始化时检查登录状态
  useEffect(() => {
    checkAuth();
  }, []);

  const value = {
    user,
    isLoading,
    error,
    isInitialized,
    login,
    logout,
    refreshToken,
    checkAuth
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// 使用认证的hook
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// API请求hook
export function useApi() {
  const { user, refreshToken } = useAuth();

  const apiRequest = useCallback(async (endpoint, options = {}) => {
    const url = `${API_BASE}${endpoint}`;
    const isFormData = (options && options.body && typeof FormData !== 'undefined' && options.body instanceof FormData);
    const headers = isFormData ? { ...(options.headers || {}) } : { 'Content-Type': 'application/json', ...(options.headers || {}) };
    const config = {
      credentials: 'include',
      headers,
      ...options,
    };

    try {
      let response = await fetch(url, config);

      // 如果401，尝试刷新令牌
      if (response.status === 401) {
        const refreshed = await refreshToken();
        if (refreshed) {
          response = await fetch(url, config);
        }
      }

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || `HTTP ${response.status}`);
      }

      return data;
    } catch (err) {
      throw new Error(err.message || '请求失败');
    }
  }, [refreshToken]); // 添加依赖数组，只有在 refreshToken 变化时才重新创建函数

  return { apiRequest };
}

// 商品相关API hooks
export function useProducts() {
  const { apiRequest } = useApi();

  const getProducts = async ({ category = null, hotOnly = false } = {}) => {
    const params = new URLSearchParams();
    if (category) {
      params.append('category', category);
    }
    if (hotOnly) {
      params.append('hot_only', '1');
    }
    const query = params.toString();
    const url = query ? `/products?${query}` : '/products';
    return await apiRequest(url);
  };

  const searchProducts = async (query) => {
    return await apiRequest(`/products/search?q=${encodeURIComponent(query)}`);
  };

  const getCategories = async () => {
    return await apiRequest('/products/categories');
  };

  const getShopStatus = async () => {
    return await apiRequest('/shop/status');
  };

  return {
    getProducts,
    searchProducts,
    getCategories,
    getShopStatus
  };
}

// 购物车相关API hooks
export function useCart() {
  const { apiRequest } = useApi();

  const getCart = async () => {
    return await apiRequest('/cart');
  };

  const updateCart = async (action, productId = null, quantity = null, variantId = null) => {
    return await apiRequest('/cart/update', {
      method: 'POST',
      body: JSON.stringify({
        action,
        product_id: productId,
        quantity,
        variant_id: variantId || undefined
      })
    });
  };

  const addToCart = async (productId, quantity = 1, variantId = null) => {
    return await updateCart('add', productId, quantity, variantId);
  };

  const removeFromCart = async (productId, variantId = null) => {
    return await updateCart('remove', productId, null, variantId);
  };

  const clearCart = async () => {
    return await updateCart('clear');
  };

  return {
    getCart,
    updateCart,
    addToCart,
    removeFromCart,
    clearCart
  };
}

// 管理端 - 店铺状态
export function useAdminShop() {
  const { apiRequest } = useApi();
  const getStatus = async () => apiRequest('/shop/status');
  const updateStatus = async (isOpen, note = '') => apiRequest('/admin/shop/status', {
    method: 'PATCH',
    body: JSON.stringify({ is_open: !!isOpen, note })
  });
  return { getStatus, updateStatus };
}

// 代理状态管理 hook
export function useAgentStatus() {
  const { apiRequest } = useApi();
  
  const getStatus = async () => apiRequest('/agent/status');
  
  const updateStatus = async (isOpen, closedNote = '') => apiRequest('/agent/status', {
    method: 'PATCH',
    body: JSON.stringify({ is_open: !!isOpen, closed_note: closedNote })
  });
  
  return { getStatus, updateStatus };
}

// 用户获取所属代理状态的 hook
export function useUserAgentStatus() {
  const { apiRequest } = useApi();
  
  const getStatus = async (addressId = null, buildingId = null) => {
    const params = new URLSearchParams();
    if (addressId) params.append('address_id', addressId);
    if (buildingId) params.append('building_id', buildingId);
    const queryString = params.toString();
    const url = `/shop/agent-status${queryString ? '?' + queryString : ''}`;
    return apiRequest(url);
  };
  
  return { getStatus };
}
