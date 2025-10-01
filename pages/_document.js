import { Html, Head, Main, NextScript } from 'next/document'

export default function Document() {
  return (
    <Html lang="zh">
      <Head>
        {/* markdown-it & plugins */}
        <script src='https://cdn.jsdelivr.net/npm/markdown-it/dist/markdown-it.min.js'></script>
        <script src='https://cdn.jsdelivr.net/npm/markdown-it-footnote/dist/markdown-it-footnote.min.js'></script>
        <script src='https://cdn.jsdelivr.net/npm/markdown-it-task-lists/dist/markdown-it-task-lists.min.js'></script>

        {/* Prism (语法高亮) */}
        <link rel='stylesheet' href='https://cdn.jsdelivr.net/npm/prismjs/themes/prism.css'/>
        <script src='https://cdn.jsdelivr.net/npm/prismjs/prism.js'></script>
        <script src='https://cdn.jsdelivr.net/npm/prismjs/components/prism-core.min.js'></script>
        <script src='https://cdn.jsdelivr.net/npm/prismjs/plugins/autoloader/prism-autoloader.min.js'></script>

        {/* Font Awesome */}
        <link rel='stylesheet' href='https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css' crossOrigin="anonymous" referrerPolicy="no-referrer" />

        {/* KaTeX for math */}
        <link rel='stylesheet' href='https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css'/>
        <script src='https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js'></script>
        <script src='https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js'></script>

        {/* Mermaid for diagrams */}
        <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if (typeof window !== 'undefined' && window.mermaid) {
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
                    // 尝试不在DOM中显示错误，但保持兼容性
                    return originalParseError ? originalParseError.call(this, err, hash) : null;
                  };
                }
                
                // 轻量级错误清理 - 只监听明显的错误节点
                const lightweightCleanup = () => {
                  // 只清理body的直接子元素中明显的错误信息
                  const bodyChildren = document.body.children;
                  for (let i = bodyChildren.length - 1; i >= 0; i--) {
                    const element = bodyChildren[i];
                    const text = element.textContent || '';
                    // 只清理明显的错误信息且不在预览容器内的
                    if (text.includes('Syntax error in text') && 
                        text.includes('mermaid version') &&
                        !element.closest('.mermaid-preview')) {
                      element.remove();
                    }
                  }
                };
                
                // 设置低频率的清理
                setInterval(lightweightCleanup, 2000);
              }
            `
          }}
        />

        {/* Lottie 动画 */}
        <script src="https://unpkg.com/@lottiefiles/dotlottie-wc@0.8.1/dist/dotlottie-wc.js" type="module"></script>
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
