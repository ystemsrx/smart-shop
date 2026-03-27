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
      className={`relative min-h-screen w-full overflow-hidden bg-[#f8f6f4] ${className}`}
    >
      {children}
    </div>
  );
}