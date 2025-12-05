import React from "react";

/**
 * 使用：
 *   import PastelBackground from "./ModalCard.jsx";
 *   export default function Page(){ 
 *     return <PastelBackground>页面内容</PastelBackground> 
 *   }
 */
export default function PastelBackground({ children, className = "" }) {
  return (
    <div
      className={`relative min-h-screen w-full overflow-hidden bg-[linear-gradient(135deg,rgba(125,211,252,0.15)_0%,rgba(255,255,255,0.9)_40%,rgba(244,114,182,0.2)_100%)] dark:bg-[linear-gradient(135deg,rgba(2,132,199,0.2)_0%,rgba(17,24,39,0.95)_40%,rgba(147,51,234,0.15)_100%)] ${className}`}
    >
      {children}
    </div>
  );
}