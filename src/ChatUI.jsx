import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * Modern AI Chat UI – Flat White, Smart Stadium Composer (React + Tailwind)
 * 2025‑08‑23 • v14 (Markdown & LaTeX support)
 * --------------------------------------------------
 * • 助手消息支持Markdown和LaTeX渲染，不使用气泡样式
 * • 用户消息继续使用气泡样式
 * --------------------------------------------------
 */

const cx = (...xs) => xs.filter(Boolean).join(" ");
const useAutoScroll = (dep) => {
  const end = useRef(null);
  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth", block: "end" }), [dep]);
  return end;
};
const useId = () => {
  const r = useRef(0);
  return () => ++r.current;
};

// HTML 转义函数
const escapeHtml = (text) => {
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
};

const BUTTON_CONTENT = {
  COPY: `
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" class="icon-xs">
      <path d="M12.668 10.667C12.668 9.95614 12.668 9.46258 12.6367 9.0791C12.6137 8.79732 12.5758 8.60761 12.5244 8.46387L12.4688 8.33399C12.3148 8.03193 12.0803 7.77885 11.793 7.60254L11.666 7.53125C11.508 7.45087 11.2963 7.39395 10.9209 7.36328C10.5374 7.33197 10.0439 7.33203 9.33301 7.33203H6.5C5.78896 7.33203 5.29563 7.33195 4.91211 7.36328C4.63016 7.38632 4.44065 7.42413 4.29688 7.47559L4.16699 7.53125C3.86488 7.68518 3.61186 7.9196 3.43555 8.20703L3.36524 8.33399C3.28478 8.49198 3.22795 8.70352 3.19727 9.0791C3.16595 9.46259 3.16504 9.95611 3.16504 10.667V13.5C3.16504 14.211 3.16593 14.7044 3.19727 15.0879C3.22797 15.4636 3.28473 15.675 3.36524 15.833L3.43555 15.959C3.61186 16.2466 3.86474 16.4807 4.16699 16.6348L4.29688 16.6914C4.44063 16.7428 4.63025 16.7797 4.91211 16.8027C5.29563 16.8341 5.78896 16.835 6.5 16.835H9.33301C10.0439 16.835 10.5374 16.8341 10.9209 16.8027C11.2965 16.772 11.508 16.7152 11.666 16.6348L11.793 16.5645C12.0804 16.3881 12.3148 16.1351 12.4688 15.833L12.5244 15.7031C12.5759 15.5594 12.6137 15.3698 12.6367 15.0879C12.6681 14.7044 12.668 14.211 12.668 13.5V10.667ZM13.998 12.665C14.4528 12.6634 14.8011 12.6602 15.0879 12.6367C15.4635 12.606 15.675 12.5492 15.833 12.4688L15.959 12.3975C16.2466 12.2211 16.4808 11.9682 16.6348 11.666L16.6914 11.5361C16.7428 11.3924 16.7797 11.2026 16.8027 10.9209C16.8341 10.5374 16.835 10.0439 16.835 9.33301V6.5C16.835 5.78896 16.8341 5.29563 16.8027 4.91211C16.7797 4.63025 16.7428 4.44063 16.6914 4.29688L16.6348 4.16699C16.4807 3.86474 16.2466 3.61186 15.959 3.43555L15.833 3.36524C15.675 3.28473 15.4636 3.22797 15.0879 3.19727C14.7044 3.16593 14.211 3.16504 13.5 3.16504H10.667C9.9561 3.16504 9.46259 3.16595 9.0791 3.19727C8.79739 3.22028 8.6076 3.2572 8.46387 3.30859L8.33399 3.36524C8.03176 3.51923 7.77886 3.75343 7.60254 4.04102L7.53125 4.16699C7.4508 4.32498 7.39397 4.53655 7.36328 4.91211C7.33985 5.19893 7.33562 5.54719 7.33399 6.00195H9.33301C10.022 6.00195 10.5791 6.00131 11.0293 6.03809C11.4873 6.07551 11.8937 6.15471 12.2705 6.34668L12.4883 6.46875C12.984 6.7728 13.3878 7.20854 13.6533 7.72949L13.7197 7.87207C13.8642 8.20859 13.9292 8.56974 13.9619 8.9707C13.9987 9.42092 13.998 9.97799 13.998 10.667V12.665ZM18.165 9.33301C18.165 10.022 18.1657 10.5791 18.1289 11.0293C18.0961 11.4302 18.0311 11.7914 17.8867 12.1279L17.8203 12.2705C17.5549 12.7914 17.1509 13.2272 16.6553 13.5313L16.4365 13.6533C16.0599 13.8452 15.6541 13.9245 15.1963 13.9619C14.8593 13.9895 14.4624 13.9935 13.9951 13.9951C13.9935 14.4624 13.9895 14.8593 13.9619 15.1963C13.9292 15.597 13.864 15.9576 13.7197 16.2939L13.6533 16.4365C13.3878 16.9576 12.9841 17.3941 12.4883 17.6982L12.2705 17.8203C11.8937 18.0123 11.4873 18.0915 11.0293 18.1289C10.5791 18.1657 10.022 18.165 9.33301 18.165H6.5C5.81091 18.165 5.25395 18.1657 4.80371 18.1289C4.40306 18.0962 4.04235 18.031 3.70606 17.8867L3.56348 17.8203C3.04244 17.5548 2.60585 17.151 2.30176 16.6553L2.17969 16.4365C1.98788 16.0599 1.90851 15.6541 1.87109 15.1963C1.83431 14.746 1.83496 14.1891 1.83496 13.5V10.667C1.83496 9.978 1.83432 9.42091 1.87109 8.9707C1.90851 8.5127 1.98772 8.10625 2.17969 7.72949L2.30176 7.51172C2.60586 7.0159 3.04236 6.6122 3.56348 6.34668L3.70606 6.28027C4.04237 6.136 4.40303 6.07083 4.80371 6.03809C5.14051 6.01057 5.53708 6.00551 6.00391 6.00391C6.00551 5.53708 6.01057 5.14051 6.03809 4.80371C6.0755 4.34588 6.15483 3.94012 6.34668 3.56348L6.46875 3.34473C6.77282 2.84912 7.20856 2.44514 7.72949 2.17969L7.87207 2.11328C8.20855 1.96886 8.56979 1.90385 8.9707 1.87109C9.42091 1.83432 9.978 1.83496 10.667 1.83496H13.5C14.1891 1.83496 14.746 1.83431 15.1963 1.87109C15.6541 1.90851 16.0599 1.98788 16.4365 2.17969L16.6553 2.30176C17.151 2.60585 17.5548 3.04244 17.8203 3.56348L17.8867 3.70606C18.031 4.04235 18.0962 4.40306 18.1289 4.80371C18.1657 5.25395 18.165 5.81091 18.165 6.5V9.33301Z"></path>
    </svg>
    <span>Copy</span>
  `,
  COPIED: `
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" class="icon-xs">
      <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/>
    </svg>
    <span>Copied!</span>
  `,
};

// Markdown渲染器组件
const MarkdownRenderer = ({ content }) => {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || !window.markdownit) return;

    // 配置Prism自动加载器
    if (window.Prism?.plugins?.autoloader) {
      window.Prism.plugins.autoloader.languages_path =
        'https://cdn.jsdelivr.net/npm/prismjs/components/';
      // 禁用 worker 以避免跨域安全错误
      window.Prism.plugins.autoloader.use_worker = false;
    }

    // 配置markdown-it
    const md = window.markdownit({ html: true, linkify: true, typographer: true });
    
    if (window.markdownitFootnote) {
      md.use(window.markdownitFootnote);
    }
    if (window.markdownitTaskLists) {
      md.use(window.markdownitTaskLists, { enabled: true, label: true });
    }

    // 为支持 \[...\] 语法，在 Markdown 处理前进行转换。
    // 通过将 \[...\] 块包裹在 <div> 中，可以确保 markdown-it 将其作为
    // 独立的块级元素处理，从而避免被错误地渲染为行内模式。
    const processedContent = content.replace(
      /\\\[([\s\S]*?)\\\]/g,
      '<div>$$$$$1$$$$</div>'
    );

    // 去除公共缩进
    const dedent = (text) => {
      const lines = text.split('\n');
      let minIndent = Infinity;
      lines.forEach(line => {
        if (line.trim()) {
          const indent = line.match(/^(\s*)/)[1].length;
          if (indent < minIndent) minIndent = indent;
        }
      });
      return (isFinite(minIndent) && minIndent > 0)
        ? lines.map(line => line.slice(minIndent)).join('\n')
        : text;
    };

    // 渲染Markdown
    const dedentedContent = dedent(processedContent);
    containerRef.current.innerHTML = md.render(dedentedContent);

    // 代码高亮和DOM操作
    const pres = Array.from(containerRef.current.querySelectorAll('pre'));
    pres.forEach(pre => {
      if (pre.closest('.code-block-container')) return;

      const code = pre.querySelector('code');
      if (!code) return;

      const languageMatch = /language-(\w+)/.exec(code.className || '');
      const language = languageMatch ? languageMatch[1] : '';
      
      // 创建容器结构
      const container = document.createElement('div');
      container.className = 'code-block-container';
      
      const header = document.createElement('div');
      header.className = 'code-block-header';

      const langSpan = document.createElement('span');
      langSpan.textContent = language || 'code';
      
      const contentArea = document.createElement('div');
      contentArea.className = 'code-block-content';
      
      const copyButton = document.createElement('button');
      copyButton.className = 'code-copy-button';
      copyButton.innerHTML = BUTTON_CONTENT.COPY;
      copyButton.setAttribute('aria-label', 'Copy');
      
      // 克隆 pre 元素
      const preClone = pre.cloneNode(true);
      const codeClone = preClone.querySelector('code');

      // 组装结构
      header.appendChild(langSpan);
      header.appendChild(copyButton);
      contentArea.appendChild(preClone);
      container.appendChild(header);
      container.appendChild(contentArea);

      // 复制功能
      copyButton.addEventListener('click', async () => {
        if (codeClone) {
          try {
            await navigator.clipboard.writeText(codeClone.textContent);
            copyButton.innerHTML = BUTTON_CONTENT.COPIED;
            setTimeout(() => {
              copyButton.innerHTML = BUTTON_CONTENT.COPY;
            }, 2000);
          } catch (err) {
            console.error('复制失败:', err);
          }
        }
      });

      // 先替换DOM结构
      if (pre.parentNode) {
        pre.parentNode.replaceChild(container, pre);
      }

      // 然后对克隆的代码元素进行高亮
      if (window.Prism && codeClone) {
        window.Prism.highlightElement(codeClone, false);
      }
    });

    // 数学公式渲染
    if (window.renderMathInElement) {
      window.renderMathInElement(containerRef.current, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$',  right: '$',  display: false }
        ]
      });
    }
  }, [content]);

  return (
    <div className="w-full">
      <div 
        ref={containerRef}
        className="markdown-content text-[15px] leading-relaxed py-2"
      />
    </div>
  );
};

const Bubble = ({ role, children }) => {
  const me = role === "user";
  return (
    <div className={cx("flex w-full", me ? "justify-end" : "justify-start")}>      
      <div
        className={cx(
          "max-w-[80%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed shadow-sm",
          me ? "bg-gray-100 text-gray-900" : "bg-gray-50 text-gray-900 border border-gray-200"
        )}
      >
        {children}
      </div>
    </div>
  );
};

// 加载指示器组件
const LoadingIndicator = () => {
  return (
    <div className="flex w-full justify-start">      
      <div className="max-w-[80%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed shadow-sm bg-gray-50 text-gray-900 border border-gray-200">
        <div className="flex space-x-1">
          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
        </div>
      </div>
    </div>
  );
};

// 工具调用卡片组件 - 简约版
const ToolCallCard = ({ 
  tool_call_id, 
  status = "running", 
  function_name = "", 
  arguments_text = "", 
  result_summary = "", 
  error_message = "",
  result_details = ""
}) => {
  const isRunning = status === "running";
  const isSuccess = status === "success";
  const isError = status === "error";

  // 简化的状态指示器
  const getStatusIndicator = () => {
    if (isRunning) {
      return <div className="simple-spinner"></div>;
    }
    if (isSuccess) {
      return <span className="text-green-600">✓</span>;
    }
    if (isError) {
      return <span className="text-red-600">✗</span>;
    }
    return null;
  };

  const getStatusText = () => {
    if (isRunning) return "执行中";
    if (isSuccess) return "完成";
    if (isError) return "失败";
    return "";
  };

  const cardClass = cx(
    "tool-card",
    isRunning && "tool-card-running",
    isSuccess && "tool-card-success", 
    isError && "tool-card-error"
  );

  // 处理敏感数据 - 对外展示时隐藏具体参数
  const getDisplayName = (name) => {
    const nameMap = {
      'search_products': '商品搜索',
      'update_cart': '购物车操作', 
      'get_cart': '查看购物车'
    };
    return nameMap[name] || name;
  };

  // 简化结果显示 - 只显示关键信息
  const formatSimpleResult = (content) => {
    if (!content) return "";
    
    try {
      const parsed = JSON.parse(content);
      if (typeof parsed === 'object') {
        // 多查询搜索结果
        if (parsed.multi_query && parsed.queries && parsed.results) {
          const queryCount = parsed.queries.length;
          const totalCount = parsed.count || 0;
          return `搜索 ${queryCount} 个关键词，找到 ${totalCount} 个商品`;
        }
        // 单个商品搜索结果
        if (parsed.count !== undefined && Array.isArray(parsed.items)) {
          return `找到 ${parsed.count} 个商品`;
        }
        // 购物车信息
        if (parsed.total_quantity !== undefined || parsed.total_price !== undefined) {
          const qty = parsed.total_quantity ?? 0;
          const price = parsed.total_price ?? 0;
          return `共 ${qty} 件商品，总计 ¥${price}`;
        }
        // 购物车操作结果
        if (parsed.action && parsed.message) {
          return parsed.message;
        }
        // 批量操作结果
        if (parsed.action && parsed.processed !== undefined) {
          return `处理 ${parsed.processed} 项，成功 ${parsed.successful} 项`;
        }
        // 通用操作结果
        if (parsed.ok !== undefined) {
          return parsed.ok ? "操作成功" : (parsed.error || "操作失败");
        }
      }
    } catch {
      // 文本结果，简化显示
      if (content.includes('成功')) return "操作成功";
      if (content.includes('失败') || content.includes('错误')) return "操作失败";
    }
    
    // 通用简化 - 只显示前30个字符
    return content.length > 30 ? content.slice(0, 30) + '...' : content;
  };

  return (
    <div className="flex w-full justify-start mb-3">
      <div className={cx("max-w-[80%] w-full", cardClass)}>
        <div className="tool-card-body">
          <div className="tool-card-header">
            <div className="tool-card-title">
              {getStatusIndicator()}
              <span className="tool-name">{getDisplayName(function_name)}</span>
              <span className="tool-status">{getStatusText()}</span>
            </div>
          </div>

          {/* 执行进度 */}
          {isRunning && (
            <div className="tool-progress">
              <span>正在处理请求...</span>
            </div>
          )}

          {/* 简化的结果显示 */}
          {(isSuccess || isError) && (result_summary || error_message) && (
            <div className="tool-result-simple">
              {isError ? error_message : formatSimpleResult(result_summary)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

function InputBar({ value, onChange, onSend, onStop, placeholder, autoFocus, isLoading }) {
  const ta = useRef(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!ta.current) return;
    ta.current.style.height = "auto";
    const max = 240;
    const next = Math.min(ta.current.scrollHeight, max);
    ta.current.style.height = `${next}px`;
    ta.current.style.overflowY = ta.current.scrollHeight > max ? "auto" : "hidden";
    setExpanded(next > 64);
  }, [value]);

  const fire = async () => {
    const txt = value.trim();
    if (!txt || isLoading) return;
    await onSend();
  };

  const handleClick = () => {
    if (isLoading) {
      onStop();
    } else {
      fire();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading) {
        fire();
      }
    }
  };

  const radius = expanded ? "rounded-3xl" : "rounded-full";
  const minH = expanded ? "min-h-[44px]" : "min-h-[32px]";

  const sendIcon = (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" className="icon">
      <path d="M8.99992 16V6.41407L5.70696 9.70704C5.31643 10.0976 4.68342 10.0976 4.29289 9.70704C3.90237 9.31652 3.90237 8.6835 4.29289 8.29298L9.29289 3.29298L9.36907 3.22462C9.76184 2.90427 10.3408 2.92686 10.707 3.29298L15.707 8.29298L15.7753 8.36915C16.0957 8.76192 16.0731 9.34092 15.707 9.70704C15.3408 10.0732 14.7618 10.0958 14.3691 9.7754L14.2929 9.70704L10.9999 6.41407V16C10.9999 16.5523 10.5522 17 9.99992 17C9.44764 17 8.99992 16.5523 8.99992 16Z" />
    </svg>
  );

  const stopIcon = (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" className="icon">
      <path d="M4.5 5.75C4.5 5.05964 5.05964 4.5 5.75 4.5H14.25C14.9404 4.5 15.5 5.05964 15.5 5.75V14.25C15.5 14.9404 14.9404 15.5 14.25 15.5H5.75C5.05964 15.5 4.5 14.9404 4.5 14.25V5.75Z"></path>
    </svg>
  );

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div
        className={cx(
          "bg-white border border-gray-300 shadow-sm p-1.5 grid [grid-template-areas:'primary_trailing'] grid-cols-[1fr_auto] gap-2 items-center",
          radius
        )}
        aria-label="composer"
      >
        <div className={cx(minH, "max-h-60 overflow-hidden [grid-area:primary] flex flex-1 items-center")}>          
          <textarea
            ref={ta}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            rows={1}
            autoFocus={autoFocus}
            aria-label="chat input"
            onKeyDown={handleKeyDown}
            className={cx(
              "w-full resize-none bg-transparent px-3 py-0.5 text-[15px] text-gray-900 outline-none",
              "placeholder:text-gray-400 focus:ring-0"
            )}
          />
        </div>

        <button
          id="composer-submit-button"
          aria-label={isLoading ? "Stop generating" : "Send prompt"}
          data-testid={isLoading ? "stop-button" : "send-button"}
          onClick={handleClick}
          disabled={!isLoading && !value.trim()}
          title={isLoading ? "停止生成" : "发送 (Enter)\n换行 (Shift+Enter)"}
          className={cx(
            "h-9 w-9 flex items-center justify-center rounded-full transition-colors",
            isLoading
              ? "bg-white text-black border border-gray-300 hover:bg-gray-100"
              : "bg-black text-white hover:bg-black/80 disabled:opacity-40 disabled:cursor-not-allowed"
          )}
        >
          {isLoading ? stopIcon : sendIcon}
        </button>
      </div>
      <p className="mt-2 text-center text-xs text-gray-400">
        {isLoading ? "AI 正在响应..." : "Enter 发送 · Shift+Enter 换行"}
      </p>
    </div>
  );
}

export default function ChatModern() {
  const [msgs, setMsgs] = useState([]);
  const [inp, setInp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showThinking, setShowThinking] = useState(false);
  const first = msgs.length === 0;
  const genId = useId();
  const endRef = useAutoScroll(msgs);
  const abortControllerRef = useRef(null);


  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const push = (role, content) => setMsgs((s) => [...s, { id: genId(), role, content }]);
  const pushToolCallCard = (payload) => setMsgs((s) => [...s, { id: genId(), role: "tool_call", ...payload }]);
  const updateToolCallCard = (toolCallId, updater) => {
    setMsgs((s) => s.map((m) => {
      if (m.role === "tool_call" && m.tool_call_id === toolCallId) {
        const patch = typeof updater === 'function' ? updater(m) : updater;
        return { ...m, ...patch };
      }
      return m;
    }));
  };
  
  const updateLastMessage = (newContent) => {
    setMsgs((s) => {
      const newMsgs = [...s];
      if (newMsgs.length > 0 && newMsgs[newMsgs.length - 1].role === "assistant") {
        newMsgs[newMsgs.length - 1].content = newContent;
      }
      return newMsgs;
    });
  };

  // SSE客户端实现
  const sendMessage = async (messages) => {
    // 支持本地开发和生产环境
    // 可以通过设置 VITE_API_URL 环境变量来覆盖默认URL
    const API_URL = import.meta.env.VITE_API_URL || 
      (import.meta.env.MODE === 'development' 
        ? "https://chatapi.your_domain.com/v1/chat"
        : "https://chatapi.your_domain.com/v1/chat");
    
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "text/event-stream",
        },
        body: JSON.stringify({ messages }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";
      let assistantMessageAdded = false;
      let streamHasStarted = false;
      let toolCallsInProgress = new Set(); // 跟踪进行中的工具调用

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim();
            if (dataStr === '[DONE]') {
              continue;
            }
            
            try {
              const data = JSON.parse(dataStr);
              
              if (data.type === "delta" && data.role === "assistant") {
                if (!streamHasStarted) {
                  streamHasStarted = true;
                  setShowThinking(false);
                }
                if (!assistantMessageAdded) {
                  push("assistant", "");
                  assistantMessageAdded = true;
                }
                assistantContent += data.delta;
                updateLastMessage(assistantContent);

              } else if (data.type === "tool_status" && data.status === "started") {
                if (!streamHasStarted) {
                  streamHasStarted = true;
                  setShowThinking(false);
                }
                
                // 将工具调用ID加入进行中的集合
                toolCallsInProgress.add(data.tool_call_id);
                
                const fn = data.function || {};
                const argsText = (fn.arguments ?? "").toString();
                pushToolCallCard({
                  tool_call_id: data.tool_call_id,
                  status: "running",
                  tool_type: "function",
                  function_name: fn.name || "",
                  arguments_text: argsText,
                  result_summary: "",
                });

              } else if (data.type === "tool_status" && data.status === "finished") {
                const toolId = data.tool_call_id;
                const resultType = data.result_type || "text";
                const result = data.result;
                
                const stringify = (v) => { try { return typeof v === 'string' ? v : JSON.stringify(v); } catch { return String(v); } };
                const textVal = stringify(result);
                const isError = (() => {
                  if (resultType === 'json' && result && typeof result === 'object') {
                    if (typeof result.ok === 'boolean') return !result.ok;
                  }
                  const lower = (textVal || '').toLowerCase();
                  return /错误|error|不存在|非法|invalid/.test(textVal) || lower.startsWith('error:');
                })();
                const summarize = () => {
                  if (resultType === 'json' && result && typeof result === 'object') {
                    // 多查询搜索结果
                    if (result.multi_query && result.queries && result.results) {
                      const queryCount = result.queries.length;
                      const totalCount = result.count || 0;
                      return `搜索 ${queryCount} 个关键词，找到 ${totalCount} 个商品`;
                    }
                    // 单个商品搜索结果
                    if (typeof result.count === 'number' && Array.isArray(result.items)) {
                      const firstName = result.items[0]?.name;
                      return `找到 ${result.count} 个商品${firstName ? ` · ${firstName}` : ''}`;
                    }
                    // 购物车信息
                    if (typeof result.total_quantity === 'number' || typeof result.total_price === 'number') {
                      const qty = result.total_quantity ?? 0;
                      const price = result.total_price ?? 0;
                      return `共 ${qty} 件商品 · ¥${price}`;
                    }
                    // 购物车操作结果
                    if (result.action && result.message) {
                      return result.message;
                    }
                    // 批量操作结果
                    if (result.action && result.processed !== undefined) {
                      return `处理 ${result.processed} 项，成功 ${result.successful} 项`;
                    }
                    // 通用操作结果
                    if (typeof result.ok === 'boolean') {
                      return result.ok ? "操作成功" : (result.error || "操作失败");
                    }
                  }
                  return (textVal || '').slice(0, 140);
                };
                const summary = summarize();

                updateToolCallCard(data.tool_call_id, {
                  status: isError ? 'error' : 'success',
                  result_summary: summary,
                  error_message: isError ? (textVal || '工具执行出错') : '',
                });

                // 从进行中的集合移除该工具调用
                toolCallsInProgress.delete(data.tool_call_id);
                
                // 当所有工具调用都完成时，重置助手消息状态以接收后续回复
                if (toolCallsInProgress.size === 0) {
                  assistantMessageAdded = false;
                  assistantContent = "";
                }

                // 以 role:tool 写入消息历史
                setMsgs((s) => ([
                  ...s,
                  { id: genId(), role: 'tool', content: resultType === 'json' ? stringify(result) : textVal },
                ]));

              } else if (data.type === "completed") {
                // 对话完成
                break;
              } else if (data.type === "error") {
                // 处理后端错误
                // 添加错误消息给用户
                if (!assistantMessageAdded) {
                  push("assistant", "");
                  assistantMessageAdded = true;
                }
                assistantContent += `\n\n⚠️ 系统遇到问题：${data.error}`;
                updateLastMessage(assistantContent);
                break;
              }
            } catch (e) {
              // 静默跳过解析失败的数据
            }
          }
        }
      }
      
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('Stream generation stopped by user.');
        return; 
      }
      // 添加错误消息
      push("assistant", `抱歉，发生了错误：${error.message}\n\n请检查网络连接或稍后重试。`);
    }
  };

  const handleSend = async () => {
    const txt = inp.trim();
    if (!txt || isLoading) return;
    
    setIsLoading(true);
    setShowThinking(true);
    push("user", txt);
    setInp("");
    
    try {
      // 构建消息历史
      const newMessages = [...msgs, { role: "user", content: txt }];
      // 过滤 UI 专用消息，仅传 user/assistant/tool
      const apiMessages = newMessages
        .filter(m => m.role === 'user' || m.role === 'assistant' || m.role === 'tool')
        .map(msg => ({ role: msg.role, content: msg.content }));
      
      await sendMessage(apiMessages);
    } finally {
      setIsLoading(false);
      setShowThinking(false);
      abortControllerRef.current = null;
    }
  };
  const clear = () => {
    handleStop();
    setMsgs([]);
  };
  const PAD = "pb-40";

  const Header = useMemo(() => (
    <header className="sticky top-0 z-20 w-full border-b border-gray-200 bg-white">
      <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <div className="h-6 w-6 rounded-full bg-indigo-500" />
          <span>AI Chat</span>
        </div>
        <button onClick={clear} className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 shadow-sm hover:bg-gray-50">清空</button>
      </div>
    </header>
  ), []);

  return (
    <div className="relative flex min-h-screen flex-col bg-white text-gray-900">
      {first ? (
        <main className="grid flex-1 place-items-center p-6">
          <section className="w-full max-w-3xl space-y-8">
            <h1 className="text-center text-3xl font-semibold">准备好开始聊天</h1>
            <InputBar value={inp} onChange={setInp} onSend={handleSend} onStop={handleStop} placeholder="问我任何问题…" autoFocus isLoading={isLoading} />
          </section>
        </main>
      ) : (
        <>
          {Header}
          <main className={cx("flex-1 overflow-y-auto", PAD)}>
            <div className="mx-auto w-full max-w-4xl px-4 pt-6">
              <div className="mx-auto flex max-w-3xl flex-col gap-4">
                {msgs.map((m) => {
                  if (m.role === "assistant") {
                    return <MarkdownRenderer key={m.id} content={m.content} />;
                  } else if (m.role === "tool_call") {
                    return (
                      <ToolCallCard
                        key={m.id}
                        tool_call_id={m.tool_call_id}
                        status={m.status}
                        function_name={m.function_name}
                        arguments_text={m.arguments_text}
                        result_summary={m.result_summary}
                        error_message={m.error_message}
                      />
                    );
                  } else if (m.role === "user") {
                    return <Bubble key={m.id} role={m.role}>{m.content}</Bubble>;
                  }
                  // 跳过其他角色的消息（如 tool 角色，已经在卡片中显示）
                  return null;
                })}
                {showThinking && <LoadingIndicator />}
                <div ref={endRef} />
              </div>
            </div>
          </main>
          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white">
            <div className="mx-auto max-w-4xl px-4 py-4">
              <InputBar value={inp} onChange={setInp} onSend={handleSend} onStop={handleStop} placeholder="继续提问…" isLoading={isLoading} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
