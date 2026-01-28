import '../styles/globals.css'
import dynamic from 'next/dynamic'

// 骨架屏加载组件 - 使用纯CSS动画，无需JavaScript
const LoadingSkeleton = () => (
  <div style={{
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #fafafa 0%, #f0f0f0 100%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '24px',
  }}>
    {/* Logo 骨架 */}
    <div style={{
      width: '64px',
      height: '64px',
      borderRadius: '16px',
      background: 'linear-gradient(90deg, #e0e0e0 25%, #f0f0f0 50%, #e0e0e0 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.5s infinite',
    }} />
    
    {/* 加载指示器 */}
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    }}>
      <div style={{
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        background: '#6366f1',
        animation: 'pulse 1s ease-in-out infinite',
      }} />
      <div style={{
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        background: '#6366f1',
        animation: 'pulse 1s ease-in-out 0.2s infinite',
      }} />
      <div style={{
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        background: '#6366f1',
        animation: 'pulse 1s ease-in-out 0.4s infinite',
      }} />
    </div>

    {/* 内联CSS动画关键帧 */}
    <style jsx global>{`
      @keyframes shimmer {
        0% { background-position: -200% 0; }
        100% { background-position: 200% 0; }
      }
      @keyframes pulse {
        0%, 100% { opacity: 0.4; transform: scale(0.8); }
        50% { opacity: 1; transform: scale(1); }
      }
    `}</style>
  </div>
)

// 动态导入整个应用包装器，完全禁用SSR
// 使用 webpackChunkName 优化chunk名称便于调试
const AppWrapper = dynamic(
  () => import(/* webpackChunkName: "app-wrapper" */ '../components/AppWrapper'),
  {
    ssr: false,
    loading: LoadingSkeleton,
  }
)

export default function App({ Component, pageProps }) {
  return <AppWrapper Component={Component} pageProps={pageProps} />
}
