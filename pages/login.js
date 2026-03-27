import React, { useState, useEffect, useCallback } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { useAuth } from "../hooks/useAuth";
import { getShopName } from "../utils/runtimeConfig";
import PastelBackground from "../components/ModalCard";
import SliderCaptchaModal from "../components/SliderCaptchaModal";
import LegalModal from "../components/LegalModal";

const isCaptchaRequiredError = (err) => {
  const status = Number(err?.status || 0);
  const code = Number(err?.code || 0);
  const message = String(err?.message || "").toLowerCase();
  if (status === 429 || code === 429) return true;
  return ["验证码", "captcha", "频繁", "too many", "rate"].some((keyword) =>
    message.includes(keyword),
  );
};

export default function Login() {
  const router = useRouter();
  const { login, isLoading, user, error, isInitialized } = useAuth();
  const shopName = getShopName();
  const pageTitle = `登录 - ${shopName}`;
  const [formData, setFormData] = useState({
    student_id: "",
    password: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [registrationEnabled, setRegistrationEnabled] = useState(false);
  const [captchaOpen, setCaptchaOpen] = useState(false);
  const [pendingLoginPayload, setPendingLoginPayload] = useState(null);
  const [legalModal, setLegalModal] = useState({ open: false, tab: "terms" });
  const [focusedField, setFocusedField] = useState(null);

  const getSafeRedirect = useCallback(() => {
    if (!router.isReady) return null;
    const redirectPath = router.query?.redirect;
    if (
      typeof redirectPath === "string" &&
      redirectPath.startsWith("/") &&
      !redirectPath.startsWith("//")
    ) {
      return redirectPath;
    }
    return null;
  }, [router]);

  const redirectAfterLogin = useCallback(
    (account) => {
      const redirectPath = getSafeRedirect();
      if (account?.type === "admin") {
        router.push("/admin/dashboard");
        return;
      }
      if (account?.type === "agent") {
        router.push("/agent/dashboard");
        return;
      }
      if (redirectPath) {
        router.push(redirectPath);
        return;
      }
      router.push("/c");
    },
    [router, getSafeRedirect],
  );

  const processLogin = useCallback(
    async (payload, captchaToken = "") => {
      try {
        const account = await login(payload.accountId, payload.password, {
          captchaToken,
          suppressErrorStatuses: [429],
        });
        setPendingLoginPayload(null);
        redirectAfterLogin(account);
        return { ok: true, needsCaptcha: false };
      } catch (err) {
        if (isCaptchaRequiredError(err)) {
          setPendingLoginPayload(payload);
          setCaptchaOpen(true);
          return {
            ok: false,
            needsCaptcha: true,
            message: err?.message || "需要验证码",
          };
        }
        setPendingLoginPayload(null);
        return {
          ok: false,
          needsCaptcha: false,
          message: err?.message || "登录失败",
        };
      }
    },
    [login, redirectAfterLogin],
  );

  useEffect(() => {
    if (!router.isReady || !isInitialized || !user) return;
    const redirectPath = getSafeRedirect();
    if (user?.type === "admin") {
      router.replace("/admin/dashboard");
      return;
    }
    if (user?.type === "agent") {
      router.replace("/agent/dashboard");
      return;
    }
    if (redirectPath) {
      router.replace(redirectPath);
      return;
    }
    router.replace("/c");
  }, [user, isInitialized, router, getSafeRedirect]);

  useEffect(() => {
    const checkRegistrationStatus = async () => {
      try {
        const { getApiBaseUrl } = await import("../utils/runtimeConfig");
        const response = await fetch(
          `${getApiBaseUrl()}/auth/registration-status`,
        );
        const result = await response.json();
        if (result.success) {
          setRegistrationEnabled(result.data.enabled);
        }
      } catch (e) {
        console.error("Failed to fetch registration status:", e);
      }
    };
    checkRegistrationStatus();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      accountId: formData.student_id.trim(),
      password: formData.password,
    };

    if (!payload.accountId || !payload.password) return;
    setPendingLoginPayload(payload);
    await processLogin(payload);
  };

  const handleCaptchaSuccess = (captchaToken) => {
    const payload = pendingLoginPayload;
    if (!payload) {
      return;
    }
    void processLogin(payload, captchaToken);
  };

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  if (!isInitialized) {
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
                <div className="skeleton-shimmer bg-[#e8e3e0] rounded-full h-6 w-28" />
                <div className="skeleton-shimmer bg-[#ede9e6] rounded-full h-4 w-44" />
              </div>
            </div>

            {/* Card skeleton */}
            <div className="sm:mx-auto sm:w-full sm:max-w-[400px]">
              <div className="auth-card p-6 sm:p-8 space-y-5">
                {/* Account input */}
                <div className="space-y-2">
                  <div className="skeleton-shimmer bg-[#ede9e6] rounded-full h-3.5 w-10" />
                  <div className="skeleton-shimmer bg-[#f0ece9] rounded-full h-11 w-full" />
                </div>

                {/* Password input */}
                <div className="space-y-2">
                  <div className="skeleton-shimmer bg-[#ede9e6] rounded-full h-3.5 w-10" />
                  <div className="skeleton-shimmer bg-[#f0ece9] rounded-full h-11 w-full" />
                </div>

                {/* Login button */}
                <div className="skeleton-shimmer bg-[#d9ccc7] rounded-full h-11 w-full mt-2" />

                {/* Divider */}
                <div className="flex items-center gap-3 pt-1">
                  <div className="flex-1 h-px bg-black/5" />
                  <div className="skeleton-shimmer bg-[#ede9e6] rounded-full h-3 w-4" />
                  <div className="flex-1 h-px bg-black/5" />
                </div>

                {/* Alt buttons */}
                <div className="flex gap-3">
                  <div className="skeleton-shimmer bg-[#f0ece9] rounded-full h-11 flex-1" />
                  <div className="skeleton-shimmer bg-[#f0ece9] rounded-full h-11 flex-1" />
                </div>

                {/* Legal */}
                <div className="flex justify-center gap-1 pt-1">
                  <div className="skeleton-shimmer bg-[#ede9e6] rounded-full h-3 w-52" />
                </div>
              </div>
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
                欢迎回来
              </h1>
              <p className="text-[14px] text-gray-400 mt-1.5">
                登录 {shopName} 继续购物
              </p>
            </div>
          </div>

          {/* Login Form */}
          <div className="sm:mx-auto sm:w-full sm:max-w-[400px] mt-8 opacity-0 animate-apple-scale-in animate-delay-400">
            <div className="auth-card p-6 sm:p-8">
              <form className="space-y-5" onSubmit={handleSubmit}>
                {error && (
                  <div className="auth-error animate-apple-fade-in">
                    <div className="flex items-center gap-2.5">
                      <i className="fas fa-info-circle text-red-300 text-sm"></i>
                      <span className="text-[13px] text-red-400 font-medium leading-snug">
                        {error}
                      </span>
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  {/* Account Field */}
                  <div>
                    <label htmlFor="student_id" className="auth-label">
                      账号
                    </label>
                    <div
                      className={`auth-input-wrapper ${focusedField === "student_id" ? "auth-input-focused" : ""}`}
                    >
                      <div className="auth-input-icon">
                        <i className="fas fa-user"></i>
                      </div>
                      <input
                        id="student_id"
                        name="student_id"
                        type="text"
                        required
                        value={formData.student_id}
                        onChange={handleInputChange}
                        onFocus={() => setFocusedField("student_id")}
                        onBlur={() => setFocusedField(null)}
                        className="auth-input"
                        placeholder="请输入账号"
                      />
                    </div>
                  </div>

                  {/* Password Field */}
                  <div>
                    <label htmlFor="password" className="auth-label">
                      密码
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
                        value={formData.password}
                        onChange={handleInputChange}
                        onFocus={() => setFocusedField("password")}
                        onBlur={() => setFocusedField(null)}
                        className="auth-input pr-11"
                        placeholder="请输入密码"
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
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="auth-submit-btn mt-2"
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
                      <span>登录中...</span>
                    </div>
                  ) : (
                    "登录"
                  )}
                </button>
              </form>

              {/* Divider & Actions */}
              <div className="mt-6">
                <div className="auth-divider">
                  <span>或</span>
                </div>

                <div
                  className={`mt-5 ${registrationEnabled ? "flex gap-3" : ""}`}
                >
                  {registrationEnabled && (
                    <button
                      type="button"
                      onClick={() => router.push("/register")}
                      className="auth-alt-btn auth-alt-btn-accent flex-1"
                    >
                      <i className="fas fa-user-plus text-[13px]"></i>
                      <span>创建账户</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => router.push("/c")}
                    className={`auth-alt-btn ${registrationEnabled ? "flex-1" : "w-full"}`}
                  >
                    <i className="fas fa-comments text-[13px]"></i>
                    <span>先试用</span>
                  </button>
                </div>
              </div>

              {/* Legal */}
              <p className="mt-6 text-center text-[11px] text-gray-400 leading-relaxed">
                登录即表示您同意
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
                <i className="fas fa-lock text-[10px]"></i>
                <span>数据保护</span>
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
        scene="login"
        title="登录安全验证"
        description="请完成滑块验证后继续登录"
        onClose={(reason) => {
          setCaptchaOpen(false);
          if (reason !== "success") {
            setPendingLoginPayload(null);
          }
        }}
        onSuccess={handleCaptchaSuccess}
      />
    </>
  );
}
