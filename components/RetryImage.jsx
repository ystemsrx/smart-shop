import React, { useState, useRef, useEffect } from 'react';
import { getLogo } from '../utils/runtimeConfig';

const RetryImage = ({ 
  src, 
  alt, 
  className, 
  maxRetries = 3,
  onFinalError,
  ...props 
}) => {
  // 当前显示的图片源（可能是原图，也可能是Logo）
  const [displaySrc, setDisplaySrc] = useState(src);
  // 是否正在显示fallback Logo
  const [isFallback, setIsFallback] = useState(false);
  
  // 引用变量，用于在后台逻辑中跟踪
  const retryCountRef = useRef(0);
  const isMountedRef = useRef(true);

  // 组件卸载清理
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // 当外部 src 变化时重置
  useEffect(() => {
    setDisplaySrc(src);
    setIsFallback(false);
    retryCountRef.current = 0;
  }, [src]);

  // 后台静默重试逻辑
  const attemptRetry = (attempt) => {
    if (!isMountedRef.current) return;
    if (attempt > maxRetries) {
      if (onFinalError) onFinalError();
      return;
    }

    const nextSrc = `${src}${src.includes('?') ? '&' : '?'}retry=${attempt}`;
    const img = new Image();
    
    img.onload = () => {
      if (!isMountedRef.current) return;
      // 重试成功！切回原图（带参数版本以防缓存问题）
      setDisplaySrc(nextSrc);
      setIsFallback(false);
    };

    img.onerror = () => {
      if (!isMountedRef.current) return;
      // 失败了，延迟后继续下一次
      setTimeout(() => {
        attemptRetry(attempt + 1);
      }, 1500 + attempt * 500); // 渐进式延迟
    };

    img.src = nextSrc;
  };

  const handleError = () => {
    // 防止 Logo 也加载失败导致的死循环
    if (isFallback) return;

    // 第一次失败，立刻换上 Logo
    setDisplaySrc(getLogo());
    setIsFallback(true);
    
    // 开始后台静默重试 (从第1次开始)
    retryCountRef.current = 1;
    // 稍微延迟一点开始重试，给网络一点喘息时间
    setTimeout(() => {
      attemptRetry(1);
    }, 1000);
  };

  return (
    <img
      src={displaySrc}
      alt={alt}
      className={`${className} ${isFallback ? 'object-contain p-2 bg-gray-50' : ''}`}
      onError={handleError}
      {...props}
    />
  );
};

export default RetryImage;
