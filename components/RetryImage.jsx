import React, { useState, useRef, useEffect } from 'react';

const RetryImage = ({ 
  src, 
  alt, 
  className, 
  maxRetries = 3,
  onFinalError,
  ...props 
}) => {
  const [retryCount, setRetryCount] = useState(0);
  const [currentSrc, setCurrentSrc] = useState(src);
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // 使用 ref 来跟踪当前的重试次数，避免闭包问题
  const retryCountRef = useRef(0);

  const handleError = () => {
    // blob URL 失败后重试没有意义（blob 被释放就不会恢复），直接标记失败
    if (src && src.startsWith('blob:')) {
      console.log('blob URL 加载失败，不重试:', src);
      setHasError(true);
      setIsLoading(false);
      if (onFinalError) {
        onFinalError();
      }
      return;
    }

    retryCountRef.current += 1;
    setRetryCount(retryCountRef.current);
    
    console.log(`图片加载失败，重试第 ${retryCountRef.current} 次:`, currentSrc);
    
    if (retryCountRef.current < maxRetries) {
      // 重试原始图片
      setTimeout(() => {
        setCurrentSrc(src + '?retry=' + retryCountRef.current);
      }, 1000); // 延迟1秒后重试
    } else {
      // 达到最大重试次数，停止重试
      console.log(`图片加载失败，已达到最大重试次数 ${maxRetries}，停止重试:`, src);
      setHasError(true);
      setIsLoading(false);
      
      if (onFinalError) {
        onFinalError();
      }
    }
  };

  const handleLoad = () => {
    setIsLoading(false);
    setHasError(false);
    // 重置重试计数
    retryCountRef.current = 0;
    setRetryCount(0);
  };

  // 当外部传入的 src 变化时，重置内部状态并使用新的地址
  useEffect(() => {
    setCurrentSrc(src);
    setHasError(false);
    setIsLoading(true);
    retryCountRef.current = 0;
    setRetryCount(0);
  }, [src]);

  // 如果最终失败，显示默认占位符
  if (hasError) {
    return (
      <div 
        className={`bg-gray-100 flex items-center justify-center text-gray-400 text-sm ${className}`}
        {...props}
      >
        <div className="text-center">
          <div className="text-2xl mb-1">📷</div>
          <div>暂无图片</div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <img
        src={currentSrc}
        alt={alt}
        className={className}
        onError={handleError}
        onLoad={handleLoad}
        {...props}
      />
      
      {/* 加载指示器 */}
      {isLoading && retryCount > 0 && (
        <div className="absolute inset-0 bg-gray-100 bg-opacity-75 flex items-center justify-center">
          <div className="text-center text-gray-500 text-xs">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-500 mx-auto mb-1"></div>
            <div>重试中 ({retryCount}/{maxRetries})</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RetryImage;
