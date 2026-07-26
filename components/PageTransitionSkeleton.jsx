import React from 'react';

// 页面切换过渡层 - 无专属骨架屏路由的通用兜底：仅铺全站奶油底色，
// 不渲染通用灰条，避免闪现与目标页面不符的假内容
export default function PageTransitionSkeleton() {
  return (
    <div className="fixed inset-0 z-[40] bg-[#FDFBF7] pt-16 overflow-hidden" aria-hidden="true" />
  );
}
