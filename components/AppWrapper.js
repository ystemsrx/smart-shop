import { useState, useEffect } from 'react';
import { AuthProvider } from '../hooks/useAuth';
import { LocationProvider } from '../hooks/useLocation';

// 应用包装器组件 - 只在客户端渲染
export default function AppWrapper({ Component, pageProps }) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // 确保只在客户端渲染
  if (!isClient) {
    return (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        height: '100vh',
        fontSize: '16px'
      }}>
        正在初始化...
      </div>
    );
  }

  return (
    <AuthProvider>
      <LocationProvider>
        <Component {...pageProps} />
      </LocationProvider>
    </AuthProvider>
  );
}
