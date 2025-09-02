import { useState, useEffect, createContext, useContext } from 'react';

// 创建认证上下文
const AuthContext = createContext(null);

// 检查是否为客户端环境
const isClient = typeof window !== 'undefined' && typeof document !== 'undefined';

// API基础URL
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 
  (process.env.NODE_ENV === 'development' 
    ? "http://localhost:9099"
  : "https://chatapi.your_domain.com");

// 认证提供者组件
export function AuthProvider({ children }) {
  // 简化状态初始化 - 由于现在只在客户端运行，可以直接初始化
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isInitialized, setIsInitialized] = useState(false);

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
          setUser(data.data);
        }
      }
    } catch (err) {
      // 静默失败，用户未登录
      console.log('认证检查失败:', err.message);
    } finally {
      setIsInitialized(true);
    }
  };

  // 用户登录
  const login = async (studentId, password, isAdmin = false) => {
    setIsLoading(true);
    setError('');

    try {
      const endpoint = isAdmin ? '/auth/admin-login' : '/auth/login';
      const payload = isAdmin 
        ? { admin_id: studentId, password }
        : { student_id: studentId, password };

      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (data.success) {
        // 登录成功，设置用户信息
        const userData = isAdmin ? data.data.admin : data.data.user;
        setUser({
          ...userData,
          type: isAdmin ? 'admin' : 'user'
        });
        return userData;
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

  const apiRequest = async (endpoint, options = {}) => {
    const url = `${API_BASE}${endpoint}`;
    const config = {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
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
  };

  return { apiRequest };
}

// 商品相关API hooks
export function useProducts() {
  const { apiRequest } = useApi();

  const getProducts = async (category = null) => {
    const url = category ? `/products?category=${encodeURIComponent(category)}` : '/products';
    return await apiRequest(url);
  };

  const searchProducts = async (query) => {
    return await apiRequest(`/products/search?q=${encodeURIComponent(query)}`);
  };

  const getCategories = async () => {
    return await apiRequest('/products/categories');
  };

  return {
    getProducts,
    searchProducts,
    getCategories
  };
}

// 购物车相关API hooks
export function useCart() {
  const { apiRequest } = useApi();

  const getCart = async () => {
    return await apiRequest('/cart');
  };

  const updateCart = async (action, productId = null, quantity = null) => {
    return await apiRequest('/cart/update', {
      method: 'POST',
      body: JSON.stringify({
        action,
        product_id: productId,
        quantity
      })
    });
  };

  const addToCart = async (productId, quantity = 1) => {
    return await updateCart('add', productId, quantity);
  };

  const removeFromCart = async (productId) => {
    return await updateCart('remove', productId);
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
