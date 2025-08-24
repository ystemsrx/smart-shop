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

        {/* KaTeX for math */}
        <link rel='stylesheet' href='https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css'/>
        <script src='https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js'></script>
        <script src='https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js'></script>
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
