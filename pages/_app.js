import '../styles/globals.css'
import dynamic from 'next/dynamic'

// 动态导入整个应用包装器，完全禁用SSR
const AppWrapper = dynamic(() => import('../components/AppWrapper'), {
  ssr: false,
  loading: () => (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', 
      height: '100vh',
      fontSize: '16px'
    }}>
      正在加载应用...
    </div>
  )
})

export default function App({ Component, pageProps }) {
  return <AppWrapper Component={Component} pageProps={pageProps} />
}
