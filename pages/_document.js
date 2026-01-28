import { Html, Head, Main, NextScript } from 'next/document'

export default function Document() {
  return (
    <Html lang="zh">
      <Head>
        {/* DNS 预解析和预连接 - 加速后续资源加载 */}
        <link rel="dns-prefetch" href="https://cdn.jsdelivr.net" />
        <link rel="dns-prefetch" href="https://cdnjs.cloudflare.com" />
        <link rel="dns-prefetch" href="https://unpkg.com" />
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://cdnjs.cloudflare.com" crossOrigin="anonymous" />

        {/* 关键 CSS - Font Awesome (用于图标，需要尽早加载) */}
        <link 
          rel='stylesheet' 
          href='https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css' 
          crossOrigin="anonymous" 
          referrerPolicy="no-referrer" 
        />

        {/* KaTeX CSS - 数学公式样式 */}
        <link 
          rel='stylesheet' 
          href='https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css'
        />

        {/* 延迟加载的脚本 - 使用 defer 避免阻塞渲染 */}
        {/* markdown-it & plugins */}
        <script defer src='https://cdn.jsdelivr.net/npm/markdown-it/dist/markdown-it.min.js'></script>
        <script defer src='https://cdn.jsdelivr.net/npm/markdown-it-footnote/dist/markdown-it-footnote.min.js'></script>
        <script defer src='https://cdn.jsdelivr.net/npm/markdown-it-task-lists/dist/markdown-it-task-lists.min.js'></script>

        {/* KaTeX for math - defer 加载 */}
        <script defer src='https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js'></script>
        <script defer src='https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js'></script>

        {/* Mermaid for diagrams - defer 加载 */}
        <script defer src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>

        {/* Lottie 动画 - type="module" 已经是延迟加载 */}
        <script src="https://unpkg.com/@lottiefiles/dotlottie-wc@0.8.1/dist/dotlottie-wc.js" type="module"></script>
      </Head>
      <body>
        <Main />
        <NextScript />
        
        {/* 将初始化脚本移到 body 末尾，页面内容已经渲染后再执行 */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // 等待 DOM 和脚本都加载完成后再初始化
              if (typeof window !== 'undefined') {
                window.addEventListener('load', function() {
                  // Mermaid 初始化
                  if (window.mermaid) {
                    window.mermaid.initialize({
                      startOnLoad: false,
                      theme: 'default',
                      securityLevel: 'loose',
                      fontFamily: 'system-ui, sans-serif',
                      suppressErrors: true,
                      logLevel: 'error'
                    });
                    
                    // 覆盖错误显示方法以减少DOM污染
                    if (window.mermaid.parseError) {
                      const originalParseError = window.mermaid.parseError;
                      window.mermaid.parseError = function(err, hash) {
                        console.error('Mermaid parse error:', err);
                        return originalParseError ? originalParseError.call(this, err, hash) : null;
                      };
                    }
                    
                    // 轻量级错误清理 - 延迟执行，低优先级
                    const lightweightCleanup = () => {
                      requestIdleCallback ? requestIdleCallback(() => {
                        const bodyChildren = document.body.children;
                        for (let i = bodyChildren.length - 1; i >= 0; i--) {
                          const element = bodyChildren[i];
                          const text = element.textContent || '';
                          if (text.includes('Syntax error in text') && 
                              text.includes('mermaid version') &&
                              !element.closest('.mermaid-preview')) {
                            element.remove();
                          }
                        }
                      }) : setTimeout(() => {
                        const bodyChildren = document.body.children;
                        for (let i = bodyChildren.length - 1; i >= 0; i--) {
                          const element = bodyChildren[i];
                          const text = element.textContent || '';
                          if (text.includes('Syntax error in text') && 
                              text.includes('mermaid version') &&
                              !element.closest('.mermaid-preview')) {
                            element.remove();
                          }
                        }
                      }, 0);
                    };
                    
                    setInterval(lightweightCleanup, 2000);
                  }
                });
              }
            `
          }}
        />
      </body>
    </Html>
  )
}
