import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useAuth } from '../hooks/useAuth';

export default function Login() {
  const router = useRouter();
  const { login, isLoading, user, error } = useAuth();
  const [formData, setFormData] = useState({
    student_id: '',
    password: ''
  });

  // 如果已登录，重定向到聊天页面
  useEffect(() => {
    if (user) {
      router.push('/');
    }
  }, [user, router]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      // 自动识别管理员账号（仅支持 ADMIN_USERNAME1 / ADMIN_USERNAME2）
      const isAdmin = ['ADMIN_USERNAME1', 'ADMIN_USERNAME2'].includes(formData.student_id);
      await login(formData.student_id, formData.password, isAdmin);
      
      // 根据用户类型跳转到不同页面
      if (isAdmin) {
        router.push('/admin');
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
        <title>登录 - [商店名称]</title>
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
                  <i className="fas fa-shopping-bag text-white text-2xl"></i>
                  <div className="absolute -top-2 -right-2 w-6 h-6 bg-orange-400 rounded-full flex items-center justify-center">
                    <i className="fas fa-sparkles text-white text-xs"></i>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="text-center animate-apple-slide-up animate-delay-200">
              <h1 className="text-4xl font-bold text-white mb-2">
                欢迎回来
              </h1>
              <p className="text-lg text-white/80 mb-2">
                LaZy智能零食商城
              </p>
              <p className="text-sm text-white/60">
                使用学号和密码登录您的账户
              </p>
            </div>
          </div>

          {/* 登录表单 */}
          <div className="sm:mx-auto sm:w-full sm:max-w-md mt-8 animate-apple-scale-in animate-delay-400">
            <div className="card-glass p-8 shadow-2xl border border-white/20">
              <form className="space-y-6" onSubmit={handleSubmit}>
                {error && (
                  <div className="bg-red-500/10 border border-red-500/20 text-red-300 px-4 py-3 rounded-xl text-sm backdrop-blur-sm animate-apple-fade-in">
                    <div className="flex items-center gap-2">
                      <i className="fas fa-exclamation-triangle"></i>
                      {error}
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

              {/* 分隔线和试用选项 */}
              <div className="mt-8">
                <div className="flex items-center">
                  <div className="flex-1 border-t border-gray-700/40" />
                  <span className="px-4 text-sm text-gray-700">或者</span>
                  <div className="flex-1 border-t border-gray-700/40" />
                </div>

                <div className="mt-6">
                  <button
                    onClick={() => router.push('/')}
                    className="w-full btn-glass text-white/90 hover:text-white hover:bg-white/20 transform hover:scale-105 transition-all duration-300 flex items-center justify-center gap-2"
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
          <div className="text-center mt-8 animate-apple-fade-in animate-delay-600">
            <div className="flex justify-center items-center gap-4 text-white/40 text-sm">
              <div className="flex items-center gap-1">
                <i className="fas fa-shield-alt"></i>
                <span>安全登录</span>
              </div>
              <div className="w-1 h-1 bg-white/30 rounded-full"></div>
              <div className="flex items-center gap-1">
                <i className="fas fa-clock"></i>
                <span>24/7 服务</span>
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
