import React from "react";

/**
 * 使用：
 *   import PastelBackground from "./ModalCard.jsx";
 *   export default function Page(){
 *     return <PastelBackground>页面内容</PastelBackground>
 *   }
 *
 * 登录/注册页共用的抽象艺术背景：
 * 暖象牙底 + 陶土/鼠尾草色有机色块 + 细线圆环 + 微噪点纹理。
 * 所有装饰层 transform-only 动画，prefers-reduced-motion 下由全局规则静止。
 */

// 微噪点纹理（SVG fractalNoise 转 data-uri，平铺，几乎不可见但能消除大色块的"数码感"）
const NOISE_URI =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")";

export default function PastelBackground({ children, className = "" }) {
  return (
    <div
      className={`relative min-h-[100dvh] w-full overflow-x-clip bg-[#FAF6F0] ${className}`}
    >
      {/* 装饰层 */}
      <div aria-hidden="true" className="absolute inset-0 overflow-hidden pointer-events-none select-none">
        {/* 底部微渐变，让页面上暖下沉 */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#FAF6F0] via-[#F8F3EA] to-[#F3EBDE]" />

        {/* 陶土色块 — 右上 */}
        <div
          className="absolute -top-[18%] -right-[12%] w-[55vw] max-w-[720px] aspect-square rounded-full blur-3xl opacity-[0.32] bg-anthropic-blob-a"
          style={{
            background: "radial-gradient(circle at 38% 42%, #E1937A 0%, #D97757 42%, transparent 72%)",
          }}
        />

        {/* 鼠尾草色块 — 左下 */}
        <div
          className="absolute -bottom-[22%] -left-[14%] w-[48vw] max-w-[640px] aspect-square rounded-full blur-3xl opacity-[0.26] bg-anthropic-blob-b"
          style={{
            background: "radial-gradient(circle at 55% 45%, #B3BC9C 0%, #93A47E 45%, transparent 74%)",
          }}
        />

        {/* 沙色点缀 — 左中偏上 */}
        <div
          className="absolute top-[16%] -left-[6%] w-[26vw] max-w-[360px] aspect-square rounded-full blur-2xl opacity-[0.3] bg-anthropic-blob-c"
          style={{
            background: "radial-gradient(circle at 50% 50%, #EBCFA4 0%, #E4BE8A 48%, transparent 75%)",
          }}
        />

        {/* 细线圆环 — 右下，缓慢旋转的手绘感线条 */}
        <svg
          viewBox="0 0 400 400"
          fill="none"
          className="absolute -bottom-[10%] right-[4%] w-[34vw] max-w-[440px] aspect-square bg-anthropic-ring"
        >
          <circle cx="200" cy="200" r="168" stroke="#C96442" strokeOpacity="0.16" strokeWidth="1.5" />
          <circle cx="200" cy="200" r="128" stroke="#C96442" strokeOpacity="0.10" strokeWidth="1" />
          <path
            d="M 200 24 A 176 176 0 0 1 376 200"
            stroke="#C96442"
            strokeOpacity="0.30"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>

        {/* 噪点纹理 */}
        <div className="absolute inset-0 opacity-[0.05] mix-blend-multiply" style={{ backgroundImage: NOISE_URI }} />
      </div>

      {/* 内容层 */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}
