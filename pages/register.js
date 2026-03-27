import React, { useState, useEffect, useCallback, useMemo } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { useAuth } from "../hooks/useAuth";
import { getShopName, getApiBaseUrl } from "../utils/runtimeConfig";
import PastelBackground from "../components/ModalCard";
import SliderCaptchaModal from "../components/SliderCaptchaModal";
import { getDeviceId } from "../utils/deviceId";
import LegalModal from "../components/LegalModal";
import Toast from "../components/Toast";
import { useToast } from "../hooks/useToast";

const DEFAULT_USERNAME_PLACEHOLDER = "登录名";

function PasswordStrength({ password }) {
  const { score, label, color } = useMemo(() => {
    if (!password) return { score: 0, label: "未设置", color: "bg-gray-200" };
    let s = 0;
    if (password.length >= 6) s++;
    if (password.length >= 10) s++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) s++;
    if (/\d/.test(password)) s++;
    if (/[^a-zA-Z\d]/.test(password)) s++;

    if (s <= 1) return { score: 1, label: "弱", color: "bg-red-400" };
    if (s <= 2) return { score: 2, label: "一般", color: "bg-orange-400" };
    if (s <= 3) return { score: 3, label: "中等", color: "bg-yellow-400" };
    if (s <= 4) return { score: 4, label: "强", color: "bg-emerald-400" };
    return { score: 5, label: "很强", color: "bg-emerald-500" };
  }, [password]);

  return (
    <div className="mt-2 flex items-center gap-2">
      <div className="flex-1 flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-all duration-300 ${
              i <= score ? color : "bg-gray-200"
            }`}
          />
        ))}
      </div>
      <span className="text-[11px] text-gray-400 min-w-[28px] text-right">
        {label}
      </span>
    </div>
  );
}

export default function Register() {
  const router = useRouter();
  const { user, checkAuth } = useAuth();
  const shopName = getShopName();
  const pageTitle = `注册 - ${shopName}`;
  const [formData, setFormData] = useState({
    username: "",
    password: "",
    confirmPassword: "",
    nickname: "",
  });
  const [usernamePlaceholder, setUsernamePlaceholder] = useState(
    DEFAULT_USERNAME_PLACEHOLDER,
  );
  const { toast, showToast, hideToast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [registrationEnabled, setRegistrationEnabled] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [captchaOpen, setCaptchaOpen] = useState(false);
  const [pendingRegisterPayload, setPendingRegisterPayload] = useState(null);
  const [legalModal, setLegalModal] = useState({ open: false, tab: "terms" });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [focusedField, setFocusedField] = useState(null);

  useEffect(() => {
    if (user) {
      router.push("/c");
    }
  }, [user, router]);

  useEffect(() => {
    const checkRegistrationStatus = async () => {
      try {
        const response = await fetch(
          `${getApiBaseUrl()}/auth/registration-status`,
        );
        const result = await response.json();
        if (result.success) {
          setRegistrationEnabled(result.data.enabled);
          if (typeof result.data.username_placeholder === "string") {
            const nextPlaceholder = result.data.username_placeholder.trim();
            setUsernamePlaceholder(
              nextPlaceholder || DEFAULT_USERNAME_PLACEHOLDER,
            );
          }
          if (!result.data.enabled) {
            setTimeout(() => {
              router.push("/login");
            }, 3000);
          }
        } else {
          router.push("/login");
        }
      } catch (e) {
        console.error("Failed to fetch registration status:", e);
        router.push("/login");
      } finally {
        setCheckingStatus(false);
      }
    };
    checkRegistrationStatus();
  }, [router]);

  const validateForm = useCallback(() => {
    const { username, password, confirmPassword } = formData;

    if (!username.trim()) {
      showToast("请输入账号");
      return false;
    }

    if (password.length < 6) {
      showToast("密码至少需要6个字符");
      return false;
    }

    const hasLetter = /[a-zA-Z]/.test(password);
    const hasDigit = /\d/.test(password);
    if (!hasLetter || !hasDigit) {
      showToast("密码必须包含数字和字母");
      return false;
    }

    if (password !== confirmPassword) {
      showToast("两次输入的密码不一致");
      return false;
    }

    return true;
  }, [formData, showToast]);

  const submitRegistration = useCallback(
    async (payload, captchaToken) => {
      setIsLoading(true);
      try {
        const response = await fetch(`${getApiBaseUrl()}/auth/register`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Device-ID": getDeviceId(),
          },
          credentials: "include",
          body: JSON.stringify({
            ...payload,
            captcha_token: captchaToken,
          }),
        });

        const result = await response.json();

        if (result.success) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          await checkAuth();
          await new Promise((resolve) => setTimeout(resolve, 200));
          router.push("/c");
          return { ok: true };
        } else {
          showToast(result.message || "注册失败，请稍后重试");
          return {
            ok: false,
            message: result.message || "注册失败，请稍后重试",
          };
        }
      } catch (err) {
        console.error("Registration failed:", err);
        showToast("注册失败，请稍后重试");
        return { ok: false, message: "注册失败，请稍后重试" };
      } finally {
        setIsLoading(false);
      }
    },
    [checkAuth, router, showToast],
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    hideToast();

    if (!validateForm()) {
      return;
    }

    const payload = {
      username: formData.username.trim(),
      password: formData.password,
      nickname: formData.nickname.trim() || null,
    };

    setPendingRegisterPayload(payload);
    setCaptchaOpen(true);
  };

  const handleCaptchaSuccess = (captchaToken) => {
    const payload = pendingRegisterPayload;
    if (!payload) {
      return;
    }
    void submitRegistration(payload, captchaToken);
  };

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    hideToast();
  };

  if (checkingStatus) {
    return (
      <>
        <Head>
          <title>{pageTitle}</title>
          <meta
            name="viewport"
            content="width=device-width, initial-scale=1.0"
          />
        </Head>
        <PastelBackground>
          <div className="min-h-screen flex flex-col justify-center px-4 py-8 sm:px-6 lg:px-8">
            {/* Header skeleton */}
            <div className="sm:mx-auto sm:w-full sm:max-w-[400px] mb-8">
              <div className="flex flex-col items-center gap-2.5">
                <div className="auth-static-skeleton rounded-full h-6 w-32" />
                <div className="auth-static-skeleton rounded-full h-4 w-48 opacity-80" />
              </div>
            </div>

            {/* Card skeleton */}
            <div className="sm:mx-auto sm:w-full sm:max-w-[400px]">
              <div className="auth-card p-6 sm:p-8 space-y-5">
                {/* Username + Nickname row */}
                <div className="flex gap-3">
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="auth-static-skeleton rounded-full h-3.5 w-14" />
                    <div className="auth-static-skeleton rounded-full h-11 w-full opacity-80" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="auth-static-skeleton rounded-full h-3.5 w-10" />
                    <div className="auth-static-skeleton rounded-full h-11 w-full opacity-80" />
                  </div>
                </div>

                {/* Password */}
                <div className="space-y-2">
                  <div className="auth-static-skeleton rounded-full h-3.5 w-16" />
                  <div className="auth-static-skeleton rounded-full h-11 w-full opacity-80" />
                  {/* strength bar */}
                  <div className="flex gap-1 mt-1">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div
                        key={i}
                        className="auth-static-skeleton rounded-full h-1 flex-1"
                      />
                    ))}
                  </div>
                </div>

                {/* Confirm Password */}
                <div className="space-y-2">
                  <div className="auth-static-skeleton rounded-full h-3.5 w-20" />
                  <div className="auth-static-skeleton rounded-full h-11 w-full opacity-80" />
                </div>

                {/* Submit button */}
                <div className="auth-static-skeleton rounded-full h-11 w-full mt-2 bg-[#dcc9c0]" />

                {/* Divider */}
                <div className="flex items-center gap-3 pt-1">
                  <div className="flex-1 h-px bg-black/5" />
                  <div className="auth-static-skeleton rounded-full h-3 w-16" />
                  <div className="flex-1 h-px bg-black/5" />
                </div>

                {/* Back button */}
                <div className="auth-static-skeleton rounded-full h-11 w-full opacity-80" />

                {/* Legal */}
                <div className="flex justify-center gap-1 pt-1">
                  <div className="auth-static-skeleton rounded-full h-3 w-56" />
                </div>
              </div>
            </div>
          </div>
        </PastelBackground>
      </>
    );
  }

  if (!registrationEnabled) {
    return (
      <>
        <Head>
          <title>{pageTitle}</title>
          <meta
            name="viewport"
            content="width=device-width, initial-scale=1.0"
          />
        </Head>
        <PastelBackground>
          <div className="min-h-screen flex items-center justify-center px-4">
            <div className="auth-card p-8 text-center max-w-sm w-full">
              <div className="w-14 h-14 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-5">
                <i className="fas fa-exclamation-triangle text-xl text-amber-400"></i>
              </div>
              <h1 className="text-xl font-semibold text-gray-800 mb-2">
                注册功能未启用
              </h1>
              <p className="text-sm text-gray-400 mb-6 leading-relaxed">
                管理员暂未开放注册，请联系管理员或使用现有账号登录。
              </p>
              <p className="text-xs text-gray-400 mb-4">
                3秒后自动跳转到登录页面...
              </p>
              <button
                type="button"
                onClick={() => router.push("/login")}
                className="auth-submit-btn"
              >
                前往登录
              </button>
            </div>
          </div>
        </PastelBackground>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>

      <PastelBackground>
        <div className="min-h-screen flex flex-col justify-center px-4 py-8 sm:px-6 lg:px-8">
          {/* Logo & Header */}
          <div className="sm:mx-auto sm:w-full sm:max-w-[400px] opacity-0 animate-apple-fade-in">
            <div className="text-center opacity-0 animate-apple-slide-up animate-delay-200">
              <h1 className="text-2xl font-semibold text-gray-800 tracking-tight">
                创建账户
              </h1>
              <p className="text-[14px] text-gray-400 mt-1.5">
                注册 {shopName} 开始购物
              </p>
            </div>
          </div>

          {/* Register Form */}
          <div className="sm:mx-auto sm:w-full sm:max-w-[400px] mt-8 opacity-0 animate-apple-scale-in animate-delay-400">
            <div className="auth-card relative p-6 sm:p-8">
              <Toast
                message={toast.message}
                show={toast.visible}
                onClose={hideToast}
                position="top-right"
                inline
              />
              <form className="space-y-5" onSubmit={handleSubmit}>
                <div className="space-y-4">
                  <div>
                    <label htmlFor="username" className="auth-label">
                      账号 <span className="text-red-400">*</span>
                    </label>
                    <div
                      className={`auth-input-wrapper ${focusedField === "username" ? "auth-input-focused" : ""}`}
                    >
                      <div className="auth-input-icon">
                        <i className="fas fa-user"></i>
                      </div>
                      <input
                        id="username"
                        name="username"
                        type="text"
                        required
                        autoComplete="username"
                        autoCapitalize="none"
                        spellCheck={false}
                        value={formData.username}
                        onChange={handleInputChange}
                        onFocus={() => setFocusedField("username")}
                        onBlur={() => setFocusedField(null)}
                        className="auth-input"
                        placeholder={usernamePlaceholder}
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="nickname" className="auth-label">
                      昵称
                    </label>
                    <div
                      className={`auth-input-wrapper ${focusedField === "nickname" ? "auth-input-focused" : ""}`}
                    >
                      <div className="auth-input-icon">
                        <i className="fas fa-smile"></i>
                      </div>
                      <input
                        id="nickname"
                        name="nickname"
                        type="text"
                        autoComplete="nickname"
                        spellCheck={false}
                        value={formData.nickname}
                        onChange={handleInputChange}
                        onFocus={() => setFocusedField("nickname")}
                        onBlur={() => setFocusedField(null)}
                        className="auth-input"
                        placeholder="选填"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex gap-3">
                      <div className="flex-1 min-w-0">
                        <label htmlFor="password" className="auth-label">
                          密码 <span className="text-red-400">*</span>
                        </label>
                        <div
                          className={`auth-input-wrapper ${focusedField === "password" ? "auth-input-focused" : ""}`}
                        >
                          <div className="auth-input-icon">
                            <i className="fas fa-lock"></i>
                          </div>
                          <input
                            id="password"
                            name="password"
                            type={showPassword ? "text" : "password"}
                            required
                            autoComplete="new-password"
                            value={formData.password}
                            onChange={handleInputChange}
                            onFocus={() => setFocusedField("password")}
                            onBlur={() => setFocusedField(null)}
                            className="auth-input pr-11"
                            placeholder="至少6位"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="auth-toggle-password"
                            tabIndex={-1}
                          >
                            <i
                              className={`fas ${showPassword ? "fa-eye-slash" : "fa-eye"}`}
                            ></i>
                          </button>
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <label htmlFor="confirmPassword" className="auth-label">
                          确认密码 <span className="text-red-400">*</span>
                        </label>
                        <div
                          className={`auth-input-wrapper ${focusedField === "confirmPassword" ? "auth-input-focused" : ""}`}
                        >
                          <div className="auth-input-icon">
                            <i
                              className={`fas ${
                                formData.confirmPassword &&
                                formData.password === formData.confirmPassword
                                  ? "fa-check-circle text-emerald-400"
                                  : "fa-lock"
                              }`}
                            ></i>
                          </div>
                          <input
                            id="confirmPassword"
                            name="confirmPassword"
                            type={showConfirmPassword ? "text" : "password"}
                            required
                            autoComplete="new-password"
                            value={formData.confirmPassword}
                            onChange={handleInputChange}
                            onFocus={() => setFocusedField("confirmPassword")}
                            onBlur={() => setFocusedField(null)}
                            className="auth-input pr-11"
                            placeholder="再次输入"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setShowConfirmPassword(!showConfirmPassword)
                            }
                            className="auth-toggle-password"
                            tabIndex={-1}
                          >
                            <i
                              className={`fas ${showConfirmPassword ? "fa-eye-slash" : "fa-eye"}`}
                            ></i>
                          </button>
                        </div>
                      </div>
                    </div>
                    <PasswordStrength password={formData.password} />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="auth-submit-btn auth-submit-btn-teal mt-2"
                >
                  {isLoading ? (
                    <div className="flex items-center justify-center gap-2">
                      <svg
                        className="animate-spin h-4 w-4"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="3"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                      <span>注册中...</span>
                    </div>
                  ) : (
                    "创建账户"
                  )}
                </button>
              </form>

              {/* Back to Login */}
              <div className="mt-6">
                <div className="auth-divider">
                  <span>已有账户？</span>
                </div>

                <div className="mt-5">
                  <button
                    type="button"
                    onClick={() => router.push("/login")}
                    className="auth-alt-btn"
                  >
                    <i className="fas fa-arrow-left text-[13px]"></i>
                    <span>返回登录</span>
                  </button>
                </div>
              </div>

              {/* Legal */}
              <p className="mt-6 text-center text-[11px] text-gray-400 leading-relaxed">
                注册即表示您同意
                <span
                  className="text-gray-500 font-bold underline decoration-2 hover:text-stone-600 cursor-pointer transition-colors"
                  onClick={() => setLegalModal({ open: true, tab: "terms" })}
                >
                  服务条款
                </span>
                和
                <span
                  className="text-gray-500 font-bold underline decoration-2 hover:text-stone-600 cursor-pointer transition-colors"
                  onClick={() => setLegalModal({ open: true, tab: "privacy" })}
                >
                  隐私政策
                </span>
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center mt-6 opacity-0 animate-apple-fade-in animate-delay-600">
            <div className="flex justify-center items-center gap-3 text-gray-400 text-[11px]">
              <div className="flex items-center gap-1">
                <i className="fas fa-shield-alt text-[10px]"></i>
                <span>安全加密</span>
              </div>
              <span className="text-gray-300">·</span>
              <div className="flex items-center gap-1">
                <i className="fas fa-user-check text-[10px]"></i>
                <span>快速验证</span>
              </div>
            </div>
          </div>
        </div>
      </PastelBackground>

      <LegalModal
        open={legalModal.open}
        initialTab={legalModal.tab}
        onClose={() => setLegalModal({ open: false, tab: "terms" })}
      />

      <SliderCaptchaModal
        open={captchaOpen}
        scene="register"
        title="注册安全验证"
        description="请先完成验证"
        onClose={(reason) => {
          setCaptchaOpen(false);
          if (reason !== "success") {
            setPendingRegisterPayload(null);
          }
        }}
        onSuccess={handleCaptchaSuccess}
      />
    </>
  );
}
