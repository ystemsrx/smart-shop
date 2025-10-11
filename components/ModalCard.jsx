import React from "react";

/**
 * PastelBackground — 仅保留淡彩色背景效果，无任何文字与弹窗逻辑。
 * 使用：
 *   import PastelBackground from "./ModalCard.jsx";
 *   export default function Page(){ 
 *     return <PastelBackground>页面内容</PastelBackground> 
 *   }
 */
export default function PastelBackground({ children, className = "" }) {
  return (
    <div
      className={`relative min-h-screen w-full overflow-hidden bg-[radial-gradient(40%_50%_at_20%_10%,rgba(255,255,255,0.9),rgba(255,255,255,0)),radial-gradient(40%_50%_at_80%_30%,rgba(125,211,252,0.35),rgba(255,255,255,0)),radial-gradient(60%_60%_at_50%_90%,rgba(244,114,182,0.25),rgba(255,255,255,0))] dark:bg-[radial-gradient(40%_50%_at_20%_10%,rgba(17,24,39,0.9),rgba(17,24,39,0)),radial-gradient(40%_50%_at_80%_30%,rgba(2,132,199,0.25),rgba(17,24,39,0)),radial-gradient(60%_60%_at_50%_90%,rgba(147,51,234,0.2),rgba(17,24,39,0))] ${className}`}
    >
      {children}
    </div>
  );
}