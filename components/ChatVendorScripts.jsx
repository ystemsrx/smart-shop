import Head from 'next/head';
import Script from 'next/script';

const VENDOR_SCRIPTS = [
  {
    id: 'markdown-it',
    src: 'https://cdn.jsdelivr.net/npm/markdown-it/dist/markdown-it.min.js',
  },
  {
    id: 'markdown-it-footnote',
    src: 'https://cdn.jsdelivr.net/npm/markdown-it-footnote/dist/markdown-it-footnote.min.js',
  },
  {
    id: 'markdown-it-task-lists',
    src: 'https://cdn.jsdelivr.net/npm/markdown-it-task-lists/dist/markdown-it-task-lists.min.js',
  },
  {
    id: 'katex',
    src: 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js',
  },
  {
    id: 'katex-auto-render',
    src: 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js',
  },
  {
    id: 'mermaid',
    src: 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js',
  },
];

const notifyVendorsReady = () => {
  if (typeof window === 'undefined') return;
  if (window.__CHAT_VENDORS_READY__) return;
  window.__CHAT_VENDORS_READY__ = true;
  try {
    window.dispatchEvent(new Event('chat-vendors-ready'));
  } catch (err) {
    // Fallback for older browsers.
    const evt = document.createEvent('Event');
    evt.initEvent('chat-vendors-ready', true, true);
    window.dispatchEvent(evt);
  }
};

const initMermaid = () => {
  if (typeof window === 'undefined') return;
  if (!window.mermaid || window.__MERMAID_INITIALIZED__) return;

  window.mermaid.initialize({
    startOnLoad: false,
    theme: 'default',
    securityLevel: 'loose',
    fontFamily: 'system-ui, sans-serif',
    suppressErrors: true,
    logLevel: 'error',
  });

  if (window.mermaid.parseError && !window.__MERMAID_PARSE_ERROR_PATCHED__) {
    const originalParseError = window.mermaid.parseError;
    window.mermaid.parseError = function mermaidParseError(err, hash) {
      console.error('Mermaid parse error:', err);
      return originalParseError ? originalParseError.call(this, err, hash) : null;
    };
    window.__MERMAID_PARSE_ERROR_PATCHED__ = true;
  }

  if (!window.__MERMAID_CLEANUP_INTERVAL__) {
    const cleanup = () => {
      const bodyChildren = document.body.children;
      for (let i = bodyChildren.length - 1; i >= 0; i -= 1) {
        const element = bodyChildren[i];
        const text = element.textContent || '';
        if (
          text.includes('Syntax error in text') &&
          text.includes('mermaid version') &&
          !element.closest('.mermaid-preview')
        ) {
          element.remove();
        }
      }
    };

    const scheduleCleanup = () => {
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(cleanup);
      } else {
        setTimeout(cleanup, 0);
      }
    };

    scheduleCleanup();
    window.__MERMAID_CLEANUP_INTERVAL__ = window.setInterval(scheduleCleanup, 2000);
  }

  window.__MERMAID_INITIALIZED__ = true;
};

export default function ChatVendorScripts() {
  const handleScriptLoad = () => {
    initMermaid();
    notifyVendorsReady();
  };

  return (
    <>
      <Head>
        <link rel="dns-prefetch" href="https://cdn.jsdelivr.net" />
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css"
        />
      </Head>

      {VENDOR_SCRIPTS.map((script) => (
        <Script
          key={script.id}
          id={`chat-vendor-${script.id}`}
          src={script.src}
          strategy="afterInteractive"
          onLoad={handleScriptLoad}
        />
      ))}
      <Script
        id="chat-vendor-ready-check"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            try {
              if (window.markdownit && !window.__CHAT_VENDORS_READY__) {
                window.__CHAT_VENDORS_READY__ = true;
                window.dispatchEvent(new Event('chat-vendors-ready'));
              }
            } catch (e) {
              try {
                if (window.markdownit && !window.__CHAT_VENDORS_READY__) {
                  window.__CHAT_VENDORS_READY__ = true;
                  var evt = document.createEvent('Event');
                  evt.initEvent('chat-vendors-ready', true, true);
                  window.dispatchEvent(evt);
                }
              } catch (ignore) {}
            }
          `,
        }}
      />
    </>
  );
}
