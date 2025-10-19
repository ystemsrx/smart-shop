import React, { useEffect, useMemo, useRef, useState } from "react";
import { getApiBaseUrl, getShopName } from "../utils/runtimeConfig";
import TextType from './TextType';
import { ChevronDown, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * Modern AI Chat UI – Flat White, Smart Stadium Composer (React + Tailwind)
 * 2025‑08‑23 • v14 (Markdown & LaTeX support) - Next.js版
 * --------------------------------------------------
 * • 助手消息支持Markdown和LaTeX渲染，不使用气泡样式
 * • 用户消息继续使用气泡样式
 * • 适配Next.js环境变量和SSR
 * --------------------------------------------------
 */

const cx = (...xs) => xs.filter(Boolean).join(" ");
const SHOP_NAME = getShopName();

// TextType组件的props常量，避免每次渲染时创建新对象
const WELCOME_TEXTS = ["你需要什么？", "让我帮你查询", "我可以怎么帮你？", "有什么需要帮忙的？", "需要我帮你找点什么吗？", "请告诉我你的需求", "我能为你做些什么？", "想了解点什么？", "需要帮忙吗？", "我在这里帮你"];
const TEXTTYPE_PROPS = {
  text: WELCOME_TEXTS,
  typingSpeed: 75,
  pauseDuration: 1500,
  deletingSpeed: 50,
  cursorBlinkDuration: 0.5,
  showCursor: true,
  cursorCharacter: "_",
  randomOrder: true
};

// 消息容器引用 Hook - 仅提供手动滚动所需的 ref
const useSmartAutoScroll = () => {
  const endRef = useRef(null);
  const containerRef = useRef(null);
  return { endRef, containerRef };
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
  PREVIEW_ON: `
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" class="icon-xs">
      <path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/>
      <path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd"/>
    </svg>
    <span>预览</span>
  `,
  PREVIEW_OFF: `
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" class="icon-xs">
      <path fill-rule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clip-rule="evenodd"/>
      <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z"/>
    </svg>
    <span>代码</span>
  `,
};

// Markdown渲染器组件
const MarkdownRenderer = ({ content }) => {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || typeof window === 'undefined' || !window.markdownit) return;
    
    // 处理 content 为 null 或空的情况（assistant 消息可能只有 tool_calls 而没有文本内容）
    if (!content || content === null) {
      containerRef.current.innerHTML = '';
      return;
    }

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

    // 保留有序列表原始编号：
    // - 不对数字进行重新格式化（避免 2. 被渲染为 1.）
    // - 支持多级嵌套列表
    // 实现方式：
    // 1) 先从原始 Markdown 文本中按出现顺序提取每个有序列表的每一项的“原始编号+分隔符（. 或 )）”；
    // 2) 再与渲染后的每个 <ol> 顺序对应，为其中的 <li> 写入 data-ol-num / data-ol-suffix 属性；
    // 3) 由 CSS 使用 ::before 基于 data-ol-num 渲染前缀，实现视觉编号但不改动数字。
    const extractOrderedLists = (text) => {
      const lines = text.split('\n');
      const lists = []; // 收集到的有序列表（按出现顺序）
      const stack = []; // 嵌套栈：{ indent, type: 'ordered'|'bullet', items?: [{num, sep}] }

      const detab = (s) => s.replace(/\t/g, '    ');
      const getIndent = (s) => detab(s).match(/^\s*/)[0].length;

      let inFence = false;
      let fenceChar = '';
      let fenceLen = 0;

      const maybeCloseToIndent = (indent) => {
        while (stack.length && indent < stack[stack.length - 1].indent) {
          const top = stack.pop();
          if (top.type === 'ordered' && top.items?.length) lists.push(top);
        }
      };

      for (let rawLine of lines) {
        const line = rawLine; // 已经 dedent，所以直接使用

        // 代码围栏检测 ``` 或 ~~~
        const fenceMatch = line.match(/^(\s*)(`{3,}|~{3,})/);
        if (fenceMatch) {
          const marker = fenceMatch[2][0];
          const len = fenceMatch[2].length;
          if (!inFence) {
            inFence = true; fenceChar = marker; fenceLen = len; continue;
          } else if (inFence && marker === fenceChar && line.trim().startsWith(fenceChar.repeat(fenceLen))) {
            inFence = false; fenceChar = ''; fenceLen = 0; continue;
          }
        }
        if (inFence) continue;

        // 去除前缀引用符号 > ... 仅用于匹配，不作为缩进计算的一部分
        const quoteStripped = line.replace(/^(?:\s*>\s*)+/, (m) => ''.padStart(m.length, ' '));

        // 匹配 有序/无序 列表项
        const mOrdered = quoteStripped.match(/^(\s*)(\d+)([\.)])\s+/);
        const mBullet = quoteStripped.match(/^(\s*)([\-*+])\s+/);

        if (mOrdered) {
          const indent = getIndent(mOrdered[1]);
          const num = mOrdered[2];
          const sep = mOrdered[3] || '.';

          maybeCloseToIndent(indent);

          const top = stack[stack.length - 1];
          if (!top || top.indent < indent || top.type !== 'ordered') {
            // 新的有序列表层级
            stack.push({ indent, type: 'ordered', items: [] });
          } else if (top.indent > indent) {
            // 已在 maybeCloseToIndent 处理
          }
          // 追加当前项
          stack[stack.length - 1].items.push({ num, sep });
          continue;
        }

        if (mBullet) {
          const indent = getIndent(mBullet[1]);
          maybeCloseToIndent(indent);
          const top = stack[stack.length - 1];
          if (!top || top.indent < indent || top.type !== 'bullet') {
            stack.push({ indent, type: 'bullet' });
          }
          continue;
        }

        // 普通行：不立即关闭列表，等到下一个更小缩进或文末处理
      }

      // 关闭所有未收敛的层级
      while (stack.length) {
        const top = stack.pop();
        if (top.type === 'ordered' && top.items?.length) lists.push(top);
      }
      return lists;
    };

    const orderedLists = extractOrderedLists(dedentedContent);

    // 将原始编号写入渲染后的 DOM
    try {
      const ols = Array.from(containerRef.current.querySelectorAll('ol'));
      let k = 0;
      for (const ol of ols) {
        const spec = orderedLists[k++];
        if (!spec || !Array.isArray(spec.items)) continue;
        const items = Array.from(ol.children).filter((n) => n.tagName === 'LI');
        items.forEach((li, i) => {
          const rec = spec.items[i];
          if (!rec) return;
          li.setAttribute('data-ol-num', String(rec.num));
          li.setAttribute('data-ol-suffix', rec.sep || '.');
        });
        // 标记该 <ol> 已由自定义编号渲染
        ol.classList.add('preserve-ol-number');
      }
    } catch (e) {
      // 静默失败，避免影响其他渲染
    }

    // 代码高亮和DOM操作
    const pres = Array.from(containerRef.current.querySelectorAll('pre'));
    pres.forEach(pre => {
      if (pre.closest('.code-block-container')) return;

      const code = pre.querySelector('code');
      if (!code) return;

      const languageMatch = /language-(\w+)/.exec(code.className || '');
      const language = languageMatch ? languageMatch[1] : '';
      const isMermaid = language === 'mermaid';
      
      // 创建容器结构
      const container = document.createElement('div');
      container.className = 'code-block-container';
      
      const header = document.createElement('div');
      header.className = 'code-block-header';

      const langSpan = document.createElement('span');
      langSpan.textContent = language || 'code';
      
      const contentArea = document.createElement('div');
      contentArea.className = 'code-block-content';
      
      // 为Mermaid添加预览按钮
      let previewButton = null;
      let showPreview = true; // 默认开启预览
      
      if (isMermaid) {
        previewButton = document.createElement('button');
        previewButton.className = 'code-copy-button';
        previewButton.innerHTML = BUTTON_CONTENT.PREVIEW_ON;
        previewButton.setAttribute('aria-label', 'Toggle Preview');
      }
      
      const copyButton = document.createElement('button');
      copyButton.className = 'code-copy-button';
      copyButton.innerHTML = BUTTON_CONTENT.COPY;
      copyButton.setAttribute('aria-label', 'Copy');
      
      // 克隆 pre 元素
      const preClone = pre.cloneNode(true);
      const codeClone = preClone.querySelector('code');
      const mermaidCode = codeClone.textContent;

      // 创建Mermaid预览容器（仅对Mermaid图表）
      let mermaidContainer = null;
      if (isMermaid) {
        // 计算代码块高度
        let codeBlockHeight = pre.offsetHeight;
        if (!codeBlockHeight || codeBlockHeight < 40) codeBlockHeight = 200;
        
        // 创建Mermaid预览容器，直接作为内容显示
        mermaidContainer = document.createElement('div');
        mermaidContainer.className = 'mermaid-preview';
        mermaidContainer.style.cssText = `
          padding: 20px;
          background: white;
          text-align: center;
          transform-origin: center center;
          transition: transform 0.2s ease;
          cursor: grab;
          user-select: none;
          position: relative;
          height: ${codeBlockHeight}px;
          min-height: 120px;
          max-height: 400px;
          overflow: hidden;
        `;
        
        // 创建缩放控制按钮
        const zoomControls = document.createElement('div');
        zoomControls.style.cssText = `
          position: absolute;
          top: 10px;
          right: 10px;
          display: flex;
          gap: 4px;
          background: rgba(0,0,0,0.1);
          border-radius: 4px;
          padding: 4px;
          z-index: 10;
        `;
        
        const zoomInBtn = document.createElement('button');
        zoomInBtn.textContent = '+';
        zoomInBtn.style.cssText = 'width: 24px; height: 24px; border: none; background: white; cursor: pointer; border-radius: 2px;';
        
        const zoomOutBtn = document.createElement('button');
        zoomOutBtn.textContent = '-';
        zoomOutBtn.style.cssText = 'width: 24px; height: 24px; border: none; background: white; cursor: pointer; border-radius: 2px;';
        
        const resetBtn = document.createElement('button');
        resetBtn.textContent = '◎';
        resetBtn.style.cssText = 'width: 24px; height: 24px; border: none; background: white; cursor: pointer; border-radius: 2px;';
        
        zoomControls.appendChild(zoomOutBtn);
        zoomControls.appendChild(resetBtn);
        zoomControls.appendChild(zoomInBtn);
        
        // 将缩放控制按钮添加到Mermaid容器
        mermaidContainer.appendChild(zoomControls);
        
        // 缩放和拖拽状态
        let scale = 1;
        let isDragging = false;
        let dragStart = { x: 0, y: 0 };
        let translate = { x: 0, y: 0 };
        
        // 缩放功能 - 直接对mermaidContainer内的内容进行变换
        const updateTransform = () => {
          const svgElement = mermaidContainer.querySelector('svg');
          if (svgElement) {
            svgElement.style.transform = `translate(${translate.x}px, ${translate.y}px) scale(${scale})`;
          }
        };
        
        zoomInBtn.addEventListener('click', () => {
          scale = Math.min(scale * 1.2, 3);
          updateTransform();
        });
        
        zoomOutBtn.addEventListener('click', () => {
          scale = Math.max(scale / 1.2, 0.3);
          updateTransform();
        });
        
        resetBtn.addEventListener('click', () => {
          scale = 1;
          translate = { x: 0, y: 0 };
          updateTransform();
        });
        
        // 拖拽功能 - 使用闭包确保每个图表的事件处理独立
        const handleMouseDown = (e) => {
          if (e.target.closest('button')) return;
          isDragging = true;
          dragStart = { x: e.clientX - translate.x, y: e.clientY - translate.y };
          mermaidContainer.style.cursor = 'grabbing';
        };
        
        const handleMouseMove = (e) => {
          if (!isDragging) return;
          e.preventDefault();
          translate.x = e.clientX - dragStart.x;
          translate.y = e.clientY - dragStart.y;
          updateTransform();
        };
        
        const handleMouseUp = () => {
          if (isDragging) {
            isDragging = false;
            mermaidContainer.style.cursor = 'grab';
          }
        };
        
        mermaidContainer.addEventListener('mousedown', handleMouseDown);
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        
        // 鼠标滚轮缩放
        const handleWheel = (e) => {
          e.preventDefault();
          const delta = e.deltaY > 0 ? 0.9 : 1.1;
          scale = Math.max(0.3, Math.min(3, scale * delta));
          updateTransform();
        };
        
        mermaidContainer.addEventListener('wheel', handleWheel);
        
        // 存储清理函数以便后续使用
        const cleanupEventListeners = () => {
          mermaidContainer.removeEventListener('mousedown', handleMouseDown);
          document.removeEventListener('mousemove', handleMouseMove);
          document.removeEventListener('mouseup', handleMouseUp);
          mermaidContainer.removeEventListener('wheel', handleWheel);
        };
        
        // 将清理函数绑定到容器，以便在组件卸载时清理
        mermaidContainer._cleanupEventListeners = cleanupEventListeners;
        
        // 渲染Mermaid图表
        if (window.mermaid) {
          // 生成唯一ID
          const mermaidId = 'mermaid-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
          
          // 为当前容器设置唯一标识，方便后续识别
          mermaidContainer.setAttribute('data-mermaid-id', mermaidId);
          
          // 简化的错误清理函数 - 只清理明显的错误信息
          const cleanupErrors = () => {
            // 只清理body直接子元素中的错误信息，避免清理预览容器内的内容
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
          };
          
          // 异步渲染函数
          const renderChart = async () => {
            try {
              // 渲染前清理一次
              cleanupErrors();
              
              const result = await window.mermaid.render(mermaidId + '-svg', mermaidCode);
              
              // 渲染后立即清理
              setTimeout(cleanupErrors, 50);
              
              if (result && result.svg) {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = result.svg;
                const svg = tempDiv.querySelector('svg');
                
                if (svg) {
                  svg.style.maxWidth = '100%';
                  svg.style.height = 'auto';
                  svg.style.maxHeight = '100%';
                  svg.style.display = 'block';
                  svg.style.transformOrigin = 'center center';
                  
                  // 保存控制按钮
                  const controls = mermaidContainer.querySelector('div[style*="position: absolute"]');
                  
                  // 清空容器并重新构建
                  mermaidContainer.innerHTML = '';
                  
                  // 先添加SVG，再添加控制按钮
                  mermaidContainer.appendChild(svg);
                  if (controls) {
                    mermaidContainer.appendChild(controls);
                  }
                  
                  // 延迟清理，确保渲染完成
                  setTimeout(cleanupErrors, 200);
                }
              }
            } catch (err) {
              console.error('Mermaid渲染失败:', err);
              
              // 错误时也清理
              cleanupErrors();
              
              // 保存控制按钮
              const controls = mermaidContainer.querySelector('div[style*="position: absolute"]');
              mermaidContainer.innerHTML = '';
              
              const errorDiv = document.createElement('div');
              errorDiv.style.cssText = 'color: #ef4444; padding: 10px; text-align: center;';
              errorDiv.textContent = 'Mermaid图表语法错误';
              mermaidContainer.appendChild(errorDiv);
              
              if (controls) {
                mermaidContainer.appendChild(controls);
              }
            }
          };
          
          // 执行渲染
          renderChart();
        } else {
          const errorDiv = document.createElement('div');
          errorDiv.style.cssText = 'color: #ef4444; padding: 10px; text-align: center;';
          errorDiv.textContent = 'Mermaid库未加载';
          mermaidContainer.appendChild(errorDiv);
        }
        
        // 初始隐藏代码
        preClone.style.display = 'none';
      }

      // 组装结构
      header.appendChild(langSpan);
      
      // 创建按钮容器
      const buttonContainer = document.createElement('div');
      buttonContainer.style.cssText = 'display: flex; gap: 4px;';
      
      if (previewButton) {
        buttonContainer.appendChild(previewButton);
      }
      buttonContainer.appendChild(copyButton);
      header.appendChild(buttonContainer);
      
      if (mermaidContainer) {
        contentArea.appendChild(mermaidContainer);
      }
      contentArea.appendChild(preClone);
      container.appendChild(header);
      container.appendChild(contentArea);

      // 预览切换功能（仅Mermaid）
      if (previewButton && mermaidContainer) {
        previewButton.addEventListener('click', () => {
          showPreview = !showPreview;
          if (showPreview) {
            mermaidContainer.style.display = 'block';
            preClone.style.display = 'none';
            previewButton.innerHTML = BUTTON_CONTENT.PREVIEW_ON;
          } else {
            mermaidContainer.style.display = 'none';
            preClone.style.display = 'block';
            previewButton.innerHTML = BUTTON_CONTENT.PREVIEW_OFF;
          }
        });
      }

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

      // 然后对克隆的代码元素进行高亮（非Mermaid的情况）
      if (window.Prism && codeClone && !isMermaid) {
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

    // 简化的Mermaid错误清理
    const simpleCleanup = () => {
      // 只清理body直接子元素中的错误信息
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
    };
    
    // 立即执行一次清理
    simpleCleanup();
    
    // 设置低频清理
    const cleanupInterval = setInterval(simpleCleanup, 3000);
    
    // 清理函数
    return () => {
      clearInterval(cleanupInterval);
      
      // 清理Mermaid容器的事件监听器
      const mermaidContainers = containerRef.current?.querySelectorAll('.mermaid-preview') || [];
      mermaidContainers.forEach(container => {
        if (container._cleanupEventListeners) {
          container._cleanupEventListeners();
        }
      });
    };
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

const ThinkingBubble = ({ content, isComplete = false, isStopped = false }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [startTime] = useState(Date.now());
  const [elapsedTime, setElapsedTime] = useState(0);
  
  // 计算思考时长
  useEffect(() => {
    if (isComplete || isStopped) {
      // 思考完成或被停止时记录最终时长
      setElapsedTime((Date.now() - startTime) / 1000);
    } else {
      // 思考进行中，每100ms更新一次时长
      const timer = setInterval(() => {
        setElapsedTime((Date.now() - startTime) / 1000);
      }, 100);
      return () => clearInterval(timer);
    }
  }, [isComplete, isStopped, startTime]);

  const containerClassName = cx(
    "inline-flex max-w-[80%] flex-col items-start rounded-2xl border border-gray-100 bg-gray-50 text-sm leading-relaxed text-gray-500 shadow-sm transition-all",
    isExpanded ? "w-full px-4 py-3" : "px-3 py-2"
  );

  // 点击处理：未展开时整个区域可点击展开，已展开时只有标题区域可点击收起
  const handleContainerClick = (e) => {
    // 未展开时，点击容器的任何地方都展开
    if (!isExpanded) {
      e.stopPropagation();
      setIsExpanded(true);
    }
  };

  const handleHeaderClick = (e) => {
    // 已展开时，点击标题区域收起
    if (isExpanded) {
      e.stopPropagation();
      setIsExpanded(false);
    }
  };
  
  return (
    <div className="flex w-full justify-start">
      <div 
        className={containerClassName}
        onClick={handleContainerClick}
        style={{ cursor: isExpanded ? 'default' : 'pointer' }}
      >
        <div
          onClick={handleHeaderClick}
          className={cx(
            "inline-flex items-center gap-2 text-[11px] font-semibold tracking-wide text-gray-400 transition-colors w-full",
            isExpanded ? "hover:text-gray-600 cursor-pointer" : ""
          )}
        >
          {!isComplete && !isStopped && (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="flex-shrink-0"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
              </svg>
            </motion.div>
          )}
          <span className="normal-case">
            {isStopped 
              ? "Stopped thinking" 
              : (isComplete ? `Thought for ${elapsedTime.toFixed(1)}s` : "Thinking")}
          </span>
          <motion.span
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="flex items-center"
          >
            <ChevronDown size={14} strokeWidth={2.5} />
          </motion.span>
        </div>
        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              key="thinking-details"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <div className="mt-2 whitespace-pre-wrap text-sm text-gray-500">{content || "…"}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

const ErrorBubble = ({ message }) => (
  <div className="flex w-full justify-start">
    <div className="max-w-[80%] rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-relaxed text-red-700 shadow-sm">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-red-500">Error</div>
      <div className="whitespace-pre-wrap">{message}</div>
    </div>
  </div>
);

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
      'get_cart': '查看购物车',
      'get_category': '分类列表'
    };
    return nameMap[name] || name;
  };

  // 简化结果显示 - 只显示关键信息
  const formatSimpleResult = (content) => {
    if (!content) return "";
    
    try {
      const parsed = JSON.parse(content);
      if (typeof parsed === 'object') {
        // 分类结果（不包含商品）
        if (Array.isArray(parsed.categories)) {
          const count = typeof parsed.count === 'number' ? parsed.count : parsed.categories.length;
          const names = parsed.categories
            .map((c) => (typeof c === 'string' ? c : (c?.name || '')))
            .filter(Boolean);
          const display = names.slice(0, 6).join(', ');
          const more = names.length > 6 ? ', ...' : '';
          return `找到 ${count} 类 · [${display}${more}]`;
        }
        // 多查询搜索结果
        if (parsed.multi_query && parsed.queries && parsed.results) {
          const totalCount = parsed.count || 0;
          const qs = Array.isArray(parsed.queries) ? parsed.queries.filter(Boolean).join(', ') : '';
          return `[${qs}] · 找到 ${totalCount} 个商品`;
        }
        // 单个商品搜索结果
        if (parsed.count !== undefined && Array.isArray(parsed.items)) {
          const q = typeof parsed.query === 'string' ? parsed.query : '';
          return q ? `${q} · 找到 ${parsed.count} 个商品` : `找到 ${parsed.count} 个商品`;
        }
        // 购物车信息
        if (parsed.total_quantity !== undefined || parsed.total_price !== undefined) {
          const qty = parsed.total_quantity ?? 0;
          const price = parsed.total_price ?? 0;
          return `共 ${qty} 件商品 · ¥${price}`;
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
    
    // 解析失败则直接返回（避免关键信息被截断）
    return content;
  };

  return (
    <div className="flex w-full justify-start">
      <div className={cx("max-w-[80%] w-full", cardClass)}>
        <div className="tool-card-body">
          <div className="tool-card-header">
            <div className="tool-card-title">
              {getStatusIndicator()}
              <span className="tool-name">{getDisplayName(function_name)}</span>
              <span className="tool-status">{getStatusText()}</span>
            </div>
          </div>

          {/* 运行中展示关键信息：例如搜索关键词 */}
          {isRunning && function_name === 'search_products' && (() => {
            try {
              const args = JSON.parse(arguments_text || '{}');
              const q = args?.query;
              const qs = Array.isArray(q) ? q.filter(Boolean).join(', ') : (typeof q === 'string' ? q : '');
              return qs ? <div className="tool-meta">关键词：{qs}</div> : null;
            } catch { return null; }
          })()}

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

  // 检测是否为移动端
  const isMobile = () => {
    if (typeof window === 'undefined') return false;
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
           window.innerWidth <= 768;
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      // 在移动端，回车键只换行，不发送消息
      if (isMobile()) {
        return; // 允许默认的换行行为
      }
      // 在桌面端，回车键发送消息
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
          title={isLoading ? "停止生成" : (isMobile() ? "点击发送" : "发送 (Enter)\n换行 (Shift+Enter)")}
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
        {isLoading ? "AI 正在响应..." : (isMobile() ? "点击发送按钮发送消息" : "Enter 发送 · Shift+Enter 换行")}
      </p>
    </div>
  );
}

export default function ChatModern({ user }) {
  const [msgs, setMsgs] = useState([]);
  const [inp, setInp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showThinking, setShowThinking] = useState(false);
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const [modelError, setModelError] = useState("");
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const first = msgs.length === 0;
  const genId = useId();
  const { endRef, containerRef } = useSmartAutoScroll(msgs);
  const abortControllerRef = useRef(null);
  const thinkingMsgIdRef = useRef(null);

  const selectedModelMeta = useMemo(
    () => models.find((item) => item.model === selectedModel) || null,
    [models, selectedModel]
  );

  useEffect(() => {
    let cancelled = false;

    const loadModels = async () => {
      try {
        const baseUrl = getApiBaseUrl();
        const apiUrl = `${baseUrl.replace(/\/$/, '')}/ai/models`;
        const response = await fetch(apiUrl, { credentials: 'include' });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        const list = Array.isArray(data?.models) ? data.models : [];
        if (cancelled) return;
        setModels(list);
        setModelError("");
        if (list.length > 0) {
          setSelectedModel((prev) => {
            if (prev && list.some((item) => item.model === prev)) {
              return prev;
            }
            return list[0].model;
          });
        } else {
          setSelectedModel("");
          setModelError("未配置可用模型");
        }
      } catch (err) {
        console.error("加载模型列表失败:", err);
        if (!cancelled) {
          setModelError("模型列表加载失败，请稍后重试");
          setModels([]);
          setSelectedModel("");
        }
      } finally {
        if (!cancelled) {
          setIsLoadingModels(false);
        }
      }
    };

    loadModels();

    return () => {
      cancelled = true;
    };
  }, []);

  // 点击外部关闭模型选择器
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (modelSelectorOpen && !event.target.closest('.relative.inline-block')) {
        setModelSelectorOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [modelSelectorOpen]);


  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    // 如果有正在进行的thinking消息,将其标记为stopped
    if (thinkingMsgIdRef.current != null) {
      const thinkingId = thinkingMsgIdRef.current;
      setMsgs((s) => s.map((m) => m.id === thinkingId && m.role === "assistant_thinking"
        ? { ...m, isStopped: true }
        : m
      ));
    }
    thinkingMsgIdRef.current = null;
    setShowThinking(false);
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
  const sendMessage = async (messages, modelValue) => {
    const baseUrl = getApiBaseUrl();
    const API_URL = `${baseUrl.replace(/\/$/, '')}/ai/chat`;
    if (!modelValue) {
      throw new Error("缺少有效模型配置");
    }
    
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "text/event-stream",
        },
        credentials: 'include', // 包含Cookie认证
        body: JSON.stringify({ messages, model: modelValue }),
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
      let collectedToolCalls = []; // 收集所有的 tool_calls（用于构建 assistant 消息）
      let assistantWithToolCallsAdded = false; // 标记是否已添加包含 tool_calls 的 assistant 消息

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

              if (data.type === "reasoning") {
                if (!streamHasStarted) {
                  streamHasStarted = true;
                  setShowThinking(false);
                }
                const reasoningDelta = data.delta || "";
                if (thinkingMsgIdRef.current == null) {
                  const newId = genId();
                  thinkingMsgIdRef.current = newId;
                  setMsgs((s) => [...s, { id: newId, role: "assistant_thinking", content: reasoningDelta, isComplete: false }]);
                } else {
                  const currentId = thinkingMsgIdRef.current;
                  setMsgs((s) => s.map((m) => m.id === currentId
                    ? { ...m, content: (m.content || "") + reasoningDelta }
                    : m
                  ));
                }
                continue;
              }
              
              if (data.type === "delta" && data.role === "assistant") {
                if (!streamHasStarted) {
                  streamHasStarted = true;
                  setShowThinking(false);
                }
                
                // 当 assistant 开始回复时，标记 thinking 完成
                if (thinkingMsgIdRef.current != null) {
                  const thinkingId = thinkingMsgIdRef.current;
                  setMsgs((s) => s.map((m) => m.id === thinkingId && m.role === "assistant_thinking"
                    ? { ...m, isComplete: true }
                    : m
                  ));
                  thinkingMsgIdRef.current = null;
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
                
                // 当工具调用开始时，标记 thinking 完成
                if (thinkingMsgIdRef.current != null) {
                  const thinkingId = thinkingMsgIdRef.current;
                  setMsgs((s) => s.map((m) => m.id === thinkingId && m.role === "assistant_thinking"
                    ? { ...m, isComplete: true }
                    : m
                  ));
                  thinkingMsgIdRef.current = null;
                }
                
                // 将工具调用ID加入进行中的集合
                toolCallsInProgress.add(data.tool_call_id);
                
                const fn = data.function || {};
                let argsTextRaw = fn.arguments;
                let argsText = "";
                if (argsTextRaw === undefined || argsTextRaw === null) {
                  argsText = "{}";
                } else {
                  argsText = String(argsTextRaw).trim();
                  if (!argsText) {
                    argsText = "{}";
                  }
                }
                
                // 收集 tool_call 信息（用于构建 assistant 消息）
                collectedToolCalls.push({
                  id: data.tool_call_id,
                  type: "function",
                  function: {
                    name: fn.name || "",
                    arguments: argsText
                  }
                });
                
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
                // 传递原始JSON结果给卡片，由卡片内统一格式化摘要（可展示搜索关键词等）
                updateToolCallCard(data.tool_call_id, {
                  status: isError ? 'error' : 'success',
                  result_summary: textVal,
                  error_message: isError ? (textVal || '工具执行出错') : '',
                });

                // 第一次工具完成时，添加包含 tool_calls 的 assistant 消息（用于严格模型的历史记录）
                if (!assistantWithToolCallsAdded && collectedToolCalls.length > 0) {
                  setMsgs((s) => {
                    // 检查最后一条消息是否是空的 assistant 消息（通过 delta 添加的）
                    const lastMsg = s.length > 0 ? s[s.length - 1] : null;
                    const shouldRemoveLastMsg = lastMsg && 
                                                lastMsg.role === 'assistant' && 
                                                (!lastMsg.content || lastMsg.content === '') && 
                                                !lastMsg.tool_calls;
                    
                    // 如果最后一条是空的 assistant 消息，移除它
                    const filteredMsgs = shouldRemoveLastMsg ? s.slice(0, -1) : s;
                    
                    return [
                      ...filteredMsgs,
                      { 
                        id: genId(), 
                        role: 'assistant', 
                        content: assistantContent || null,
                        tool_calls: collectedToolCalls
                      }
                    ];
                  });
                  assistantWithToolCallsAdded = true;
                }
                
                // 从进行中的集合移除该工具调用
                toolCallsInProgress.delete(data.tool_call_id);
                
                // 当所有工具调用都完成时，重置助手消息状态以接收后续回复
                if (toolCallsInProgress.size === 0) {
                  assistantMessageAdded = false;
                  assistantContent = "";
                  thinkingMsgIdRef.current = null;
                  collectedToolCalls = []; // 清空收集的 tool_calls
                  assistantWithToolCallsAdded = false;
                }

                // 以 role:tool 写入消息历史（必须包含 tool_call_id 用于严格模型）
                setMsgs((s) => ([
                  ...s,
                  { id: genId(), role: 'tool', tool_call_id: data.tool_call_id, content: resultType === 'json' ? stringify(result) : textVal },
                ]));

              } else if (data.type === "completed") {
                // 对话完成 - 标记任何未完成的 thinking 为完成
                if (thinkingMsgIdRef.current != null) {
                  const thinkingId = thinkingMsgIdRef.current;
                  setMsgs((s) => s.map((m) => m.id === thinkingId && m.role === "assistant_thinking"
                    ? { ...m, isComplete: true }
                    : m
                  ));
                }
                thinkingMsgIdRef.current = null;
                setShowThinking(false);
                break;
              } else if (data.type === "error") {
                // 处理后端错误 - 标记任何未完成的 thinking 为完成
                if (thinkingMsgIdRef.current != null) {
                  const thinkingId = thinkingMsgIdRef.current;
                  setMsgs((s) => s.map((m) => m.id === thinkingId && m.role === "assistant_thinking"
                    ? { ...m, isComplete: true }
                    : m
                  ));
                }
                setShowThinking(false);
                thinkingMsgIdRef.current = null;
                assistantMessageAdded = false;
                assistantContent = "";
                const errorText = data.error || "生成失败，请稍后重试。";
                setMsgs((s) => ([
                  ...s,
                  { id: genId(), role: 'error', content: errorText }
                ]));
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
      setShowThinking(false);
      thinkingMsgIdRef.current = null;
      // 添加错误消息
      push("error", `抱歉，发生了错误：${error.message}\n\n请检查网络连接或稍后重试。`);
    }
  };

  const handleSend = async () => {
    const txt = inp.trim();
    if (!txt || isLoading) return;
    if (!selectedModel) {
      push("error", modelError || "模型未就绪，请稍后重试。");
      return;
    }
    
    setIsLoading(true);
    setShowThinking(true);
    thinkingMsgIdRef.current = null;
    push("user", txt);
    setInp("");
    
    try {
      // 构建消息历史
      const newMessages = [...msgs, { role: "user", content: txt }];
      // 过滤 UI 专用消息，仅传 user/assistant/tool，并保留必要的字段
      const apiMessages = newMessages
        .filter(m => m.role === 'user' || m.role === 'assistant' || m.role === 'tool')
        .map(msg => {
          const apiMsg = { role: msg.role, content: msg.content };
          // tool 消息必须包含 tool_call_id（严格模型要求）
          if (msg.role === 'tool' && msg.tool_call_id) {
            apiMsg.tool_call_id = msg.tool_call_id;
          }
          // assistant 消息如果有 tool_calls，需要包含
          if (msg.role === 'assistant' && msg.tool_calls) {
            apiMsg.tool_calls = msg.tool_calls;
          }
          return apiMsg;
        });
      
      await sendMessage(apiMessages, selectedModel);
    } finally {
      setIsLoading(false);
      setShowThinking(false);
      abortControllerRef.current = null;
    }
  };
  const clear = () => {
    handleStop();
    thinkingMsgIdRef.current = null;
    setMsgs([]);
  };
  const PAD = "pb-40";

  // 使用useMemo确保TextType组件稳定性
  const welcomeTextComponent = useMemo(() => (
    <TextType {...TEXTTYPE_PROPS} />
  ), []);

  // Header组件 - 提取为共享组件
  const Header = useMemo(() => {
    // 获取当前选中模型的显示名称
    const getSelectedModelLabel = () => {
      if (isLoadingModels) return "加载中...";
      if (models.length === 0) return "无可用模型";
      if (!selectedModel) return "选择模型";
      const model = models.find((m) => m.model === selectedModel);
      return model ? `${model.name}${model.supports_thinking ? ' · Reasoning' : ''}` : "选择模型";
    };

    return (
      <header className="fixed top-14 left-0 right-0 z-30 bg-white">
        <div className="flex h-14 items-center justify-between px-4">
          <div className="flex items-center">
            <div className="relative inline-block text-left">
              <button
                onClick={() => setModelSelectorOpen(!modelSelectorOpen)}
                disabled={isLoading || isLoadingModels || models.length === 0}
                className="flex items-center justify-start gap-2 bg-transparent text-gray-900 rounded-xl px-3 py-1.5 hover:bg-gray-100 transition disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap"
              >
                <span className="font-semibold text-sm text-gray-900">{getSelectedModelLabel()}</span>
                <ChevronDown 
                  className={`h-3.5 w-3.5 flex-shrink-0 transition-transform ${modelSelectorOpen ? "rotate-180" : "rotate-0"}`} 
                />
              </button>

              <AnimatePresence>
                {modelSelectorOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.15 }}
                    className="absolute z-[35] mt-2 min-w-full rounded-xl bg-white border border-gray-200 shadow-lg backdrop-blur-md overflow-hidden whitespace-nowrap"
                  >
                    {models.map((m) => {
                      const modelLabel = `${m.name}${m.supports_thinking ? ' · Reasoning' : ''}`;
                      const isSelected = selectedModel === m.model;
                      
                      return (
                        <button
                          key={m.model}
                          onClick={() => {
                            setSelectedModel(m.model);
                            setModelSelectorOpen(false);
                            if (m.model) {
                              setModelError("");
                            }
                          }}
                          className={`w-full flex items-center justify-between px-3 py-2 text-left hover:bg-gray-100 transition whitespace-nowrap ${
                            isSelected ? "bg-gray-50" : ""
                          }`}
                        >
                          <div className="font-medium text-sm text-gray-900">{modelLabel}</div>
                          {isSelected && <Check className="h-3.5 w-3.5 flex-shrink-0 text-green-500 ml-2" />}
                        </button>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
          <button onClick={clear} className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50" disabled={isLoading}>
            清空
          </button>
        </div>
        {modelError && (
          <div className="px-4 pb-2 text-xs text-red-500">
            {modelError}
          </div>
        )}
      </header>
    );
  }, [selectedModel, isLoading, isLoadingModels, models, selectedModelMeta, modelError, modelSelectorOpen]);

  return (
    <div className="relative flex h-screen flex-col bg-white text-gray-900 overflow-hidden">
      {first ? (
        <>
          {Header}
          <main className="flex flex-1 items-center justify-center px-6 pt-28">
            <section className="w-full max-w-3xl space-y-8">
              <div className="text-center">
                {welcomeTextComponent}
              </div>
              <InputBar
                value={inp}
                onChange={setInp}
                onSend={handleSend}
                onStop={handleStop}
                placeholder="问我任何问题…"
                autoFocus
                isLoading={isLoading}
              />
            </section>
          </main>
        </>
      ) : (
        <>
          {Header}

          <main ref={containerRef} className={cx("flex-1 overflow-y-auto pt-28", PAD)}>
            <div className="mx-auto w-full max-w-4xl px-4 pt-6">
              <div className="mx-auto flex max-w-3xl flex-col gap-4">
                {msgs.map((m) => {
                  if (m.role === "assistant") {
                    // 跳过只有 tool_calls 而没有文本内容的 assistant 消息（它们只用于历史记录）
                    if ((!m.content || m.content === null) && m.tool_calls) {
                      return null;
                    }
                    return <MarkdownRenderer key={m.id} content={m.content} />;
                  } else if (m.role === "assistant_thinking") {
                    return <ThinkingBubble key={m.id} content={m.content} isComplete={m.isComplete} isStopped={m.isStopped} />;
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
                  } else if (m.role === "error") {
                    return <ErrorBubble key={m.id} message={m.content} />;
                  }
                  // 跳过其他角色的消息（如 tool 角色，已经在卡片中显示）
                  return null;
                })}
                {showThinking && <LoadingIndicator />}
                <div ref={endRef} />
              </div>
            </div>
          </main>

          <div className="fixed inset-x-0 bottom-0 z-30 bg-white">
            <div className="mx-auto max-w-4xl px-4 pb-4">
              <InputBar
                value={inp}
                onChange={setInp}
                onSend={handleSend}
                onStop={handleStop}
                placeholder="继续提问…"
                isLoading={isLoading}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
