import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useAuth } from '../hooks/useAuth';
import { getShopName } from '../utils/runtimeConfig';
import PastelBackground from '../components/ModalCard';

export default function Login() {
  const router = useRouter();
  const { login, isLoading, user, error } = useAuth();
  const shopName = getShopName();
  const [formData, setFormData] = useState({
    student_id: '',
    password: ''
  });
  const [registrationEnabled, setRegistrationEnabled] = useState(false);

  // 如果已登录，重定向到聊天页面
  useEffect(() => {
    if (user) {
      router.push('/');
    }
  }, [user, router]);

  // 检查注册功能是否启用
  useEffect(() => {
    const checkRegistrationStatus = async () => {
      try {
        const { getApiBaseUrl } = await import('../utils/runtimeConfig');
        const response = await fetch(`${getApiBaseUrl()}/auth/registration-status`);
        const result = await response.json();
        if (result.success) {
          setRegistrationEnabled(result.data.enabled);
        }
      } catch (e) {
        console.error('获取注册状态失败:', e);
      }
    };
    checkRegistrationStatus();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const account = await login(formData.student_id.trim(), formData.password);

      if (account?.type === 'admin') {
        router.push('/admin/dashboard');
      } else if (account?.type === 'agent') {
        router.push('/agent/dashboard');
      } else {
        router.push('/');
      }
    } catch (err) {
      // 错误处理在useAuth中完成
    }
  };

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  return (
    <>
      <Head>
        <title>登录 - {shopName}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>
      
      <PastelBackground>
        <div className="min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8">
          {/* 顶部Logo和标题 */}
          <div className="sm:mx-auto sm:w-full sm:max-w-md opacity-0 animate-apple-fade-in">
            <div className="flex justify-center mb-8">
              <div className="relative group">
                <div className="absolute -inset-2 bg-gradient-to-r from-pink-500 to-violet-500 rounded-2xl blur opacity-60 group-hover:opacity-100 transition duration-1000 group-hover:duration-200"></div>
                <div className="relative w-20 h-20 bg-gradient-to-br from-blue-500 via-purple-600 to-pink-500 rounded-2xl flex items-center justify-center shadow-2xl">
                  <i className="fas fa-shopping-bag text-white text-2xl"></i>
                  <div className="absolute -top-2 -right-2 w-6 h-6 bg-orange-400 rounded-full flex items-center justify-center">
                    <i className="fas fa-sparkles text-white text-xs"></i>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="text-center opacity-0 animate-apple-slide-up animate-delay-200">
              <h1 className="text-4xl font-bold text-gray-800 mb-2">
                欢迎回来
              </h1>
              <p className="text-lg text-gray-700 mb-2">
                {shopName}
              </p>
              <p className="text-sm text-gray-600">
                使用学号和密码登录您的账户
              </p>
            </div>
          </div>

          {/* 登录表单 */}
          <div className="sm:mx-auto sm:w-full sm:max-w-md mt-8 opacity-0 animate-apple-scale-in animate-delay-400">
            <div className="card-glass p-8 shadow-2xl border border-gray-200/50">
              <form className="space-y-6" onSubmit={handleSubmit}>
                {error && (
                  <div className="bg-red-500/90 border-2 border-red-400/60 text-white px-4 py-3 rounded-xl text-sm shadow-xl animate-apple-fade-in relative overflow-hidden">
                    {/* 背景光效 */}
                    <div className="absolute inset-0 bg-gradient-to-r from-red-500/80 to-red-600/80 rounded-xl"></div>
                    <div className="relative z-10 flex items-center gap-2 font-medium">
                      <i className="fas fa-exclamation-triangle text-yellow-200"></i>
                      <span className="text-white drop-shadow-sm">{error}</span>
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <label htmlFor="student_id" className="block text-sm font-medium text-gray-800 mb-2">
                      <i className="fas fa-user mr-2"></i>账号
                    </label>
                    <div className="relative">
                      <input
                        id="student_id"
                        name="student_id"
                        type="text"
                        required
                        value={formData.student_id}
                        onChange={handleInputChange}
                        className="input-glass w-full pl-4 pr-12 text-gray-800 placeholder-gray-500"
                        placeholder="请输入学号"
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
                        placeholder="请输入办事大厅密码"
                      />
                      <div className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-500">
                        <i className="fas fa-key"></i>
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
                        登录中...
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-2">
                        <i className="fas fa-sign-in-alt"></i>
                        立即登录
                      </div>
                    )}
                  </button>
                </div>
              </form>

              {/* 分隔线和其他选项 */}
              <div className="mt-8">
                <div className="flex items-center">
                  <div className="flex-1 border-t border-gray-300/60" />
                  <span className="px-4 text-sm text-gray-600">或者</span>
                  <div className="flex-1 border-t border-gray-300/60" />
                </div>

                {/* 注册按钮 - 仅在启用时显示 */}
                {registrationEnabled && (
                  <div className="mt-6">
                    <button
                      onClick={() => router.push('/register')}
                      className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white shadow-lg transform hover:scale-105 transition-all duration-300 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-medium"
                    >
                      <i className="fas fa-user-plus"></i>
                      立即注册
                    </button>
                  </div>
                )}

                <div className={registrationEnabled ? "mt-4" : "mt-6"}>
                  <button
                    onClick={() => router.push('/')}
                    className="w-full btn-glass text-gray-700 hover:text-gray-900 transform hover:scale-105 transition-all duration-300 flex items-center justify-center gap-2"
                  >
                    <i className="fas fa-comments"></i>
                    先试用聊天功能（仅限商品搜索）
                  </button>
                </div>
              </div>

              {/* 底部提示 */}
              <div className="mt-8 text-center">
                <p className="text-xs text-gray-600 leading-relaxed">
                  登录即表示您同意我们的
                  <span className="text-gray-700 hover:text-gray-900 cursor-pointer underline">服务条款</span>
                  和
                  <span className="text-gray-700 hover:text-gray-900 cursor-pointer underline">隐私政策</span>
                </p>
              </div>
            </div>
          </div>

          {/* 底部装饰 */}
          <div className="text-center mt-8 opacity-0 animate-apple-fade-in animate-delay-600">
            <div className="flex justify-center items-center gap-4 text-gray-500 text-sm">
              <div className="flex items-center gap-1">
                <i className="fas fa-shield-alt"></i>
                <span>安全登录</span>
              </div>
              <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
              <div className="flex items-center gap-1">
                <i className="fas fa-clock"></i>
                <span>24/7 服务</span>
              </div>
              <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
              <div className="flex items-center gap-1">
                <i className="fas fa-mobile-alt"></i>
                <span>响应式设计</span>
              </div>
            </div>
          </div>
        </div>
      </PastelBackground>
    </>
  );
}
