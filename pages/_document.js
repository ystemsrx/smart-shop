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
                
                // 覆盖错误显示方法以防止错误信息显示在DOM中
                const originalParseError = window.mermaid.parseError;
                if (originalParseError) {
                  window.mermaid.parseError = function(err, hash) {
                    console.error('Mermaid parse error:', err);
                    // 不在DOM中显示错误
                    return;
                  };
                }
                
                // 清理可能出现的错误信息
                const observer = new MutationObserver(function(mutations) {
                  mutations.forEach(function(mutation) {
                    mutation.addedNodes.forEach(function(node) {
                      if (node.nodeType === 1) { // Element node
                        // 查找并移除Mermaid错误信息
                        const errorDivs = node.querySelectorAll ? 
                          node.querySelectorAll('div[id^="dmermaid"], div[style*="font-size: 64px"]') : [];
                        errorDivs.forEach(div => {
                          if (div.textContent && div.textContent.includes('Syntax error in text')) {
                            div.remove();
                          }
                        });
                        
                        // 如果节点本身是错误信息
                        if (node.textContent && node.textContent.includes('Syntax error in text')) {
                          node.remove();
                        }
                      }
                    });
                  });
                });
                
                // 监听整个document的变化
                observer.observe(document.body || document.documentElement, {
                  childList: true,
                  subtree: true
                });
              }
            `
          }}
        />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
