import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useAuth } from '../hooks/useAuth';
import { getShopName, getApiBaseUrl } from '../utils/runtimeConfig';

export default function Register() {
  const router = useRouter();
  const { user } = useAuth();
  const shopName = getShopName();
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    confirmPassword: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [registrationEnabled, setRegistrationEnabled] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);

  // 如果已登录，重定向到首页
  useEffect(() => {
    if (user) {
      router.push('/');
    }
  }, [user, router]);

  // 检查注册功能是否启用
  useEffect(() => {
    const checkRegistrationStatus = async () => {
      try {
        const response = await fetch(`${getApiBaseUrl()}/auth/registration-status`);
        const result = await response.json();
        if (result.success) {
          setRegistrationEnabled(result.data.enabled);
          if (!result.data.enabled) {
            // 如果注册未启用，3秒后跳转到登录页
            setTimeout(() => {
              router.push('/login');
            }, 3000);
          }
        } else {
          router.push('/login');
        }
      } catch (e) {
        console.error('获取注册状态失败:', e);
        router.push('/login');
      } finally {
        setCheckingStatus(false);
      }
    };
    checkRegistrationStatus();
  }, [router]);

  const validateForm = () => {
    const { username, password, confirmPassword } = formData;

    // 用户名验证
    if (username.trim().length < 2) {
      setError('用户名至少需要2个字符');
      return false;
    }

    // 密码长度验证
    if (password.length < 6) {
      setError('密码至少需要6个字符');
      return false;
    }

    // 密码复杂度验证
    const hasLetter = /[a-zA-Z]/.test(password);
    const hasDigit = /\d/.test(password);
    
    if (!hasLetter || !hasDigit) {
      setError('密码必须包含数字和字母');
      return false;
    }

    // 确认密码验证
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`${getApiBaseUrl()}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          username: formData.username.trim(),
          password: formData.password
        }),
      });

      const result = await response.json();

      if (result.success) {
        // 注册成功，跳转到首页
        router.push('/');
      } else {
        setError(result.message || '注册失败，请稍后重试');
      }
    } catch (err) {
      console.error('注册失败:', err);
      setError('注册失败，请稍后重试');
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    // 清除错误信息
    if (error) {
      setError('');
    }
  };

  // 检查状态中的加载页面
  if (checkingStatus) {
    return (
      <>
        <Head>
          <title>注册 - {shopName}</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        </Head>
        <div className="min-h-screen flex items-center justify-center" style={{
          background: 'linear-gradient(135deg, #f97316 0%, #ec4899 25%, #a855f7 50%, #06b6d4 75%, #10b981 100%)'
        }}>
          <div className="text-center text-white">
            <div className="loading-dots text-white mb-4"></div>
            <p>检查注册状态中...</p>
          </div>
        </div>
      </>
    );
  }

  // 注册未启用的提示页面
  if (!registrationEnabled) {
    return (
      <>
        <Head>
          <title>注册 - {shopName}</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        </Head>
        <div className="min-h-screen flex items-center justify-center" style={{
          background: 'linear-gradient(135deg, #f97316 0%, #ec4899 25%, #a855f7 50%, #06b6d4 75%, #10b981 100%)'
        }}>
          <div className="text-center text-white max-w-md mx-auto px-4">
            <div className="mb-6">
              <i className="fas fa-exclamation-triangle text-6xl text-yellow-300 mb-4"></i>
            </div>
            <h1 className="text-2xl font-bold mb-4">注册功能未启用</h1>
            <p className="text-white/80 mb-6">
              管理员暂未开放用户注册功能，请联系管理员或使用现有账号登录。
            </p>
            <p className="text-sm text-white/60 mb-4">
              3秒后自动跳转到登录页面...
            </p>
            <button
              onClick={() => router.push('/login')}
              className="btn-primary text-white px-6 py-2 rounded-lg"
            >
              立即前往登录
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>注册 - {shopName}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>
      
      <div className="min-h-screen relative overflow-hidden" style={{
        background: 'linear-gradient(135deg, #f97316 0%, #ec4899 25%, #a855f7 50%, #06b6d4 75%, #10b981 100%)'
      }}>
        {/* 动态背景装饰 */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-20 -left-20 w-80 h-80 rounded-full bg-white/15 backdrop-blur-3xl animate-pulse"></div>
          <div className="absolute top-40 -right-32 w-96 h-96 rounded-full bg-orange-400/20 backdrop-blur-3xl"></div>
          <div className="absolute -bottom-20 left-1/2 transform -translate-x-1/2 w-72 h-72 rounded-full bg-pink-400/20 backdrop-blur-3xl"></div>
          <div className="absolute top-20 left-1/4 w-64 h-64 rounded-full bg-purple-400/15 backdrop-blur-3xl animate-bounce" style={{animationDuration: '3s'}}></div>
          <div className="absolute bottom-32 right-1/4 w-56 h-56 rounded-full bg-cyan-400/20 backdrop-blur-3xl"></div>
        </div>

        {/* 网格背景 */}
        <div className="absolute inset-0 opacity-10">
          <div style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.1'%3E%3Ccircle cx='7' cy='7' r='1'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            backgroundSize: '60px 60px'
          }} className="w-full h-full"></div>
        </div>

        <div className="relative z-10 min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8">
          {/* 顶部Logo和标题 */}
          <div className="sm:mx-auto sm:w-full sm:max-w-md animate-apple-fade-in">
            <div className="flex justify-center mb-8">
              <div className="relative group">
                <div className="absolute -inset-2 bg-gradient-to-r from-pink-500 to-violet-500 rounded-2xl blur opacity-60 group-hover:opacity-100 transition duration-1000 group-hover:duration-200"></div>
                <div className="relative w-20 h-20 bg-gradient-to-br from-blue-500 via-purple-600 to-pink-500 rounded-2xl flex items-center justify-center shadow-2xl">
                  <i className="fas fa-user-plus text-white text-2xl"></i>
                  <div className="absolute -top-2 -right-2 w-6 h-6 bg-green-400 rounded-full flex items-center justify-center">
                    <i className="fas fa-sparkles text-white text-xs"></i>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="text-center animate-apple-slide-up animate-delay-200">
              <h1 className="text-4xl font-bold text-white mb-2">
                创建账户
              </h1>
              <p className="text-lg text-white/80 mb-2">
                {shopName}
              </p>
              <p className="text-sm text-white/60">
                填写信息创建您的专属账户
              </p>
            </div>
          </div>

          {/* 注册表单 */}
          <div className="sm:mx-auto sm:w-full sm:max-w-md mt-8 animate-apple-scale-in animate-delay-400">
            <div className="card-glass p-8 shadow-2xl border border-white/20">
              <form className="space-y-6" onSubmit={handleSubmit}>
                {error && (
                  <div className="bg-red-500/90 border-2 border-red-400/60 text-white px-4 py-3 rounded-xl text-sm shadow-xl animate-apple-fade-in relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-red-500/80 to-red-600/80 rounded-xl"></div>
                    <div className="relative z-10 flex items-center gap-2 font-medium">
                      <i className="fas fa-exclamation-triangle text-yellow-200"></i>
                      <span className="text-white drop-shadow-sm">{error}</span>
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <label htmlFor="username" className="block text-sm font-medium text-gray-800 mb-2">
                      <i className="fas fa-user mr-2"></i>用户名
                    </label>
                    <div className="relative">
                      <input
                        id="username"
                        name="username"
                        type="text"
                        required
                        value={formData.username}
                        onChange={handleInputChange}
                        className="input-glass w-full pl-4 pr-12 text-gray-800 placeholder-gray-500"
                        placeholder="至少2个字符"
                      />
                      <div className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-500">
                        <i className="fas fa-id-card"></i>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="password" className="block text-sm font-medium text-gray-800 mb-2">
                      <i className="fas fa-lock mr-2"></i>密码
                    </label>
                    <div className="relative">
                      <input
                        id="password"
                        name="password"
                        type="password"
                        required
                        value={formData.password}
                        onChange={handleInputChange}
                        className="input-glass w-full pl-4 pr-12 text-gray-800 placeholder-gray-500"
                        placeholder="至少6位，包含数字和字母"
                      />
                      <div className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-500">
                        <i className="fas fa-key"></i>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-800 mb-2">
                      <i className="fas fa-lock mr-2"></i>确认密码
                    </label>
                    <div className="relative">
                      <input
                        id="confirmPassword"
                        name="confirmPassword"
                        type="password"
                        required
                        value={formData.confirmPassword}
                        onChange={handleInputChange}
                        className="input-glass w-full pl-4 pr-12 text-gray-800 placeholder-gray-500"
                        placeholder="再次输入密码"
                      />
                      <div className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-500">
                        <i className="fas fa-check-circle"></i>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-4">
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full btn-primary text-white shadow-2xl transform hover:scale-105 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                  >
                    {isLoading ? (
                      <div className="flex items-center justify-center">
                        <div className="loading-dots text-white mr-2"></div>
                        注册中...
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-2">
                        <i className="fas fa-user-plus"></i>
                        立即注册
                      </div>
                    )}
                  </button>
                </div>
              </form>

              {/* 返回登录 */}
              <div className="mt-8">
                <div className="flex items-center">
                  <div className="flex-1 border-t border-gray-700/40" />
                  <span className="px-4 text-sm text-gray-700">已有账户？</span>
                  <div className="flex-1 border-t border-gray-700/40" />
                </div>

                <div className="mt-6">
                  <button
                    onClick={() => router.push('/login')}
                    className="w-full btn-glass text-white/90 hover:text-white hover:bg-white/20 transform hover:scale-105 transition-all duration-300 flex items-center justify-center gap-2"
                  >
                    <i className="fas fa-sign-in-alt"></i>
                    返回登录
                  </button>
                </div>
              </div>

              {/* 底部提示 */}
              <div className="mt-8 text-center">
                <p className="text-xs text-gray-600 leading-relaxed">
                  注册即表示您同意我们的
                  <span className="text-gray-700 hover:text-gray-900 cursor-pointer underline">服务条款</span>
                  和
                  <span className="text-gray-700 hover:text-gray-900 cursor-pointer underline">隐私政策</span>
                </p>
              </div>
            </div>
          </div>

          {/* 底部装饰 */}
          <div className="text-center mt-8 animate-apple-fade-in animate-delay-600">
            <div className="flex justify-center items-center gap-4 text-white/40 text-sm">
              <div className="flex items-center gap-1">
                <i className="fas fa-shield-alt"></i>
                <span>安全注册</span>
              </div>
              <div className="w-1 h-1 bg-white/30 rounded-full"></div>
              <div className="flex items-center gap-1">
                <i className="fas fa-user-check"></i>
                <span>快速验证</span>
              </div>
              <div className="w-1 h-1 bg-white/30 rounded-full"></div>
              <div className="flex items-center gap-1">
                <i className="fas fa-mobile-alt"></i>
                <span>响应式设计</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
