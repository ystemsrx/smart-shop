import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { getApiBaseUrl, getShopName } from "../utils/runtimeConfig";
import TextType from './TextType';
import { ChevronDown, Check, Pencil, Plus, User2, Loader2, PanelLeftClose, PanelLeft } from "lucide-react";
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
const SIDEBAR_EXPANDED_WIDTH = 240;
const SIDEBAR_COLLAPSED_WIDTH = 64;
const buildPreview = (text = "") =>
  text.trim().replace(/\s+/g, " ").slice(0, 8);

// 格式化相对时间，使用本地时区
const formatRelativeTime = (dateString) => {
  if (!dateString) return "未知时间";
  
  try {
    // 处理SQLite返回的时间戳格式（可能是UTC）
    // 确保正确解析为本地时间
    let date;
    if (typeof dateString === 'string' && !dateString.includes('Z') && !dateString.includes('+')) {
      // 如果没有时区标识，假定为UTC时间并转换为本地时间
      date = new Date(dateString + 'Z');
    } else {
      date = new Date(dateString);
    }
    
    // 检查日期是否有效
    if (isNaN(date.getTime())) return "未知时间";
    
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return "刚刚";
    if (diffMins < 60) return `${diffMins}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    if (diffDays < 7) return `${diffDays}天前`;
    
    // 超过7天显示具体日期（使用本地时区）
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const currentYear = now.getFullYear();
    
    if (year === currentYear) {
      return `${month}-${day}`;
    }
    return `${year}-${month}-${day}`;
  } catch (error) {
    console.error('时间格式化错误:', error, dateString);
    return "未知时间";
  }
};

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
  return useCallback(() => ++r.current, []);
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

const BLOCK_MATH_PLACEHOLDER_CLASS = 'block-math-placeholder';
const INLINE_MATH_PLACEHOLDER_CLASS = 'inline-math-placeholder';
const STREAM_FADE_EXEMPT_CLASS = 'stream-fade-exempt';
const QUOTE_REPLACEMENTS = {
  '“': '"',
  '”': '"',
  '„': '"',
  '‟': '"',
  '«': '"',
  '»': '"',
  '﹁': '"',
  '﹂': '"',
  '﹃': '"',
  '﹄': '"',
  '「': '"',
  '」': '"',
  '『': '"',
  '』': '"',
  '〝': '"',
  '〞': '"',
  '＂': '"',
  '‘': "'",
  '’': "'",
  '‚': "'",
  '‛': "'",
  '‹': "'",
  '›': "'",
  '﹇': "'",
  '﹈': "'",
  '＇': "'"
};
const QUOTE_TEST_REGEX = /[“”„‟«»﹁﹂﹃﹄「」『』〝〞＂‘’‚‛‹›﹇﹈＇]/;
const QUOTE_REGEX = /[“”„‟«»﹁﹂﹃﹄「」『』〝〞＂‘’‚‛‹›﹇﹈＇]/g;

const shouldSkipQuoteNormalization = (node) => {
  if (!node?.parentElement) return false;
  return Boolean(
    node.parentElement.closest('code, pre, kbd, samp, script, style, .katex')
  );
};

const normalizeQuotesInString = (text = '') => {
  if (!text || !QUOTE_TEST_REGEX.test(text)) return text;
  QUOTE_REGEX.lastIndex = 0;
  return text.replace(QUOTE_REGEX, (char) => QUOTE_REPLACEMENTS[char] || char);
};

const normalizeQuotesInElement = (root) => {
  if (!root || typeof document === 'undefined') return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
  const nodes = [];
  while (walker.nextNode()) {
    nodes.push(walker.currentNode);
  }
  nodes.forEach((node) => {
    if (shouldSkipQuoteNormalization(node)) return;
    const text = node?.textContent || '';
    if (!text || !QUOTE_TEST_REGEX.test(text)) return;
    node.textContent = normalizeQuotesInString(text);
  });
};


const isEscapedDelimiter = (text, index) => {
  let slashCount = 0;
  for (let i = index - 1; i >= 0; i--) {
    if (text[i] !== '\\') break;
    slashCount++;
  }
  return Boolean(slashCount % 2);
};

const findNextBlockMathStart = (text, fromIndex) => {
  const locate = (token) => {
    let idx = text.indexOf(token, fromIndex);
    while (idx !== -1 && isEscapedDelimiter(text, idx)) {
      idx = text.indexOf(token, idx + token.length);
    }
    return idx;
  };

  const dollarIndex = locate('$$');
  const bracketIndex = locate('\\[');

  if (dollarIndex === -1 && bracketIndex === -1) return null;
  if (bracketIndex === -1 || (dollarIndex !== -1 && dollarIndex < bracketIndex)) {
    return { index: dollarIndex, open: '$$', close: '$$' };
  }
  return { index: bracketIndex, open: '\\[', close: '\\]' };
};

const findClosingDelimiter = (text, delimiter, startIndex) => {
  let searchIndex = startIndex;
  while (searchIndex <= text.length - delimiter.length) {
    const idx = text.indexOf(delimiter, searchIndex);
    if (idx === -1) return -1;
    if (!isEscapedDelimiter(text, idx)) {
      return idx;
    }
    searchIndex = idx + delimiter.length;
  }
  return -1;
};

const shouldSkipMathParsing = (element) => {
  if (!element) return false;
  return Boolean(
    element.closest('code, pre, kbd, samp, script, style, .code-block-container, .code-block-content')
  );
};

const normalizeInlineMathDelimiters = (text = '') => {
  if (!text || (text.indexOf('\\(') === -1 && text.indexOf('\\)') === -1)) {
    return text;
  }
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '\\' && i + 1 < text.length) {
      const nextChar = text[i + 1];
      if ((nextChar === '(' || nextChar === ')') && !isEscapedDelimiter(text, i)) {
        result += '$';
        i++;
        continue;
      }
    }
    result += char;
  }
  return result;
};

const normalizeBlockMathDelimiters = (text = '') => {
  if (!text || (text.indexOf('\\[') === -1 && text.indexOf('\\]') === -1)) {
    return text;
  }
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '\\' && i + 1 < text.length) {
      const nextChar = text[i + 1];
      if ((nextChar === '[' || nextChar === ']') && !isEscapedDelimiter(text, i)) {
        result += '$$';
        i++;
        continue;
      }
    }
    result += char;
  }
  return result;
};

const replaceBlockMathWithPlaceholders = (root) => {
  if (!root || typeof document === 'undefined') return [];
  const segments = [];
  
  // 首先处理受保护的 LaTeX 块（带有 data-latex-protected 属性的）
  const protectedBlocks = root.querySelectorAll('[data-latex-protected="true"]');
  protectedBlocks.forEach((block) => {
    const textContent = block.textContent || '';
    
    // 提取 LaTeX 内容（去掉外层的 $$ 定界符）
    let latex = '';
    if (textContent.startsWith('$$') && textContent.endsWith('$$')) {
      latex = textContent.slice(2, -2).trim();
    } else {
      latex = textContent.trim();
    }
    
    if (!latex) return;
    
    const segmentIndex = segments.length;
    const cacheKey = `block-${segmentIndex}`;
    const placeholder = document.createElement('span');
    placeholder.className = `${BLOCK_MATH_PLACEHOLDER_CLASS} ${STREAM_FADE_EXEMPT_CLASS}`;
    placeholder.dataset.blockMathId = String(segmentIndex);
    placeholder.dataset.blockMathKey = cacheKey;
    
    // 替换原始节点
    block.parentNode.replaceChild(placeholder, block);
    
    segments.push({
      id: segmentIndex,
      key: cacheKey,
      latex: latex,
      raw: `$$${latex}$$`,
      complete: true,
      closing: '$$'
    });
  });
  
  // 然后处理普通文本节点中的 LaTeX（用于流式渲染中的新内容）
  const textNodes = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
  while (walker.nextNode()) {
    textNodes.push(walker.currentNode);
  }

  textNodes.forEach((node) => {
    const originalText = node?.textContent || '';
    const text = normalizeBlockMathDelimiters(originalText);
    if ((!text.includes('$$') && !text.includes('\\[')) || shouldSkipMathParsing(node.parentElement)) {
      if (text !== originalText) {
        node.textContent = text;
      }
      return;
    }

    const length = text.length;
    const frag = document.createDocumentFragment();
    let pointer = 0;
    let mutated = false;

    while (pointer < length) {
      const next = findNextBlockMathStart(text, pointer);
      if (!next) break;

      mutated = true;
      const { index, open, close } = next;

      if (index > pointer) {
        frag.appendChild(document.createTextNode(text.slice(pointer, index)));
      }

      const closeIndex = findClosingDelimiter(text, close, index + open.length);
      const complete = closeIndex !== -1;
      const contentStart = index + open.length;
      const contentEnd = complete ? closeIndex : length;
      const latex = text.slice(contentStart, contentEnd).replace(/\r/g, '');
      const raw = complete ? text.slice(index, closeIndex + close.length) : text.slice(index);

      const segmentIndex = segments.length;
      const cacheKey = `block-${segmentIndex}`;
      const placeholder = document.createElement('span');
      placeholder.className = `${BLOCK_MATH_PLACEHOLDER_CLASS} ${STREAM_FADE_EXEMPT_CLASS}`;
      placeholder.dataset.blockMathId = String(segmentIndex);
      placeholder.dataset.blockMathKey = cacheKey;
      frag.appendChild(placeholder);

      segments.push({
        id: segmentIndex,
        key: cacheKey,
        latex,
        raw,
        complete,
        closing: close
      });

      pointer = complete ? closeIndex + close.length : length;

      if (!complete) break;
    }

    if (mutated) {
      if (pointer < length) {
        frag.appendChild(document.createTextNode(text.slice(pointer)));
      }
      node.replaceWith(frag);
    } else if (text !== originalText) {
      node.textContent = text;
    }
  });

  return segments;
};

const shouldSkipInlineMath = (element) => {
  if (!element) return false;
  return Boolean(
    element.closest('code, pre, kbd, samp, script, style, .katex, .block-math-placeholder, .inline-math-placeholder, .code-block-container, .code-block-content')
  );
};

const findClosingInlineDollar = (text, startIndex) => {
  for (let i = startIndex; i < text.length; i++) {
    if (text[i] !== '$') continue;
    if (text[i + 1] === '$') {
      i++;
      continue;
    }
    if (!isEscapedDelimiter(text, i)) {
      return i;
    }
  }
  return -1;
};

const findClosingInlineParen = (text, startIndex) => {
  for (let i = startIndex; i < text.length - 1; i++) {
    if (text[i] === '\\' && text[i + 1] === ')' && !isEscapedDelimiter(text, i)) {
      return i;
    }
  }
  return -1;
};

const findNextInlineMathToken = (text, fromIndex) => {
  for (let i = fromIndex; i < text.length; i++) {
    const char = text[i];
    if (char === '$' && !isEscapedDelimiter(text, i)) {
      if (text[i + 1] === '$') {
        i++;
        continue;
      }
      const closeIndex = findClosingInlineDollar(text, i + 1);
      const complete = closeIndex !== -1;
      const end = complete ? closeIndex + 1 : text.length;
      const latex = text.slice(i + 1, complete ? closeIndex : text.length);
      return {
        start: i,
        end,
        latex,
        raw: text.slice(i, end),
        complete,
        closing: '$'
      };
    }
    if (char === '\\' && text[i + 1] === '(' && !isEscapedDelimiter(text, i)) {
      const closeIndex = findClosingInlineParen(text, i + 2);
      const complete = closeIndex !== -1;
      const end = complete ? closeIndex + 2 : text.length;
      const latex = text.slice(i + 2, complete ? closeIndex : text.length);
      return {
        start: i,
        end,
        latex,
        raw: text.slice(i, end),
        complete,
        closing: '\\)'
      };
    }
  }
  return null;
};

const replaceInlineMathWithPlaceholders = (root) => {
  if (!root || typeof document === 'undefined') return [];
  const segments = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
  const nodes = [];
  while (walker.nextNode()) {
    nodes.push(walker.currentNode);
  }

  nodes.forEach((node) => {
    if (shouldSkipInlineMath(node.parentElement)) return;
    let text = node.textContent || '';
    const normalizedText = normalizeInlineMathDelimiters(text);
    if (normalizedText !== text) {
      text = normalizedText;
      node.textContent = normalizedText;
    }
    if ((!text.includes('$') && !text.includes('\\(')) || !text.trim()) return;

    let cursor = 0;
    let mutated = false;
    const frag = document.createDocumentFragment();

    while (cursor < text.length) {
      const match = findNextInlineMathToken(text, cursor);
      if (!match) break;

      if (match.start > cursor) {
        frag.appendChild(document.createTextNode(text.slice(cursor, match.start)));
      }

      const raw = match.raw || text.slice(match.start, match.end);
      const trimmedLatex = match.latex?.trim() ?? '';
      if (!trimmedLatex) {
        frag.appendChild(document.createTextNode(raw));
      } else {
        const cacheKey = `inline-${segments.length}`;
        const placeholder = document.createElement('span');
        placeholder.className = `${INLINE_MATH_PLACEHOLDER_CLASS} ${STREAM_FADE_EXEMPT_CLASS}`;
        placeholder.setAttribute('data-inline-math-key', cacheKey);
        frag.appendChild(placeholder);

        segments.push({
          key: cacheKey,
          latex: trimmedLatex.replace(/\r/g, ''),
          raw,
          complete: match.complete,
          closing: match.closing
        });
      }

      cursor = match.end;
      mutated = true;
    }

    if (mutated) {
      if (cursor < text.length) {
        frag.appendChild(document.createTextNode(text.slice(cursor)));
      }
      node.replaceWith(frag);
    }
  });

  return segments;
};

const renderInlineMathSegments = (root, segments, cacheRef) => {
  if (!root || !segments?.length) return;
  const katex = (typeof window !== 'undefined' && window.katex) ? window.katex : null;
  const cache = cacheRef?.current;
  const segmentMap = new Map();
  segments.forEach((segment) => segmentMap.set(segment.key, segment));

  const placeholders = root.querySelectorAll(`.${INLINE_MATH_PLACEHOLDER_CLASS}`);
  placeholders.forEach((placeholder) => {
    const key = placeholder.getAttribute('data-inline-math-key');
    const segment = key ? segmentMap.get(key) : null;
    if (!segment) return;

    const cacheEntry = cache?.get(key);
    let htmlToUse = cacheEntry?.html || '';
    let rendered = false;

    if (katex) {
      try {
        htmlToUse = katex.renderToString(segment.latex, {
          displayMode: false,
          throwOnError: true,
          strict: 'warn'
        });
        rendered = true;
      } catch (err) {
        console.debug('Inline LaTeX渲染等待中（表达式可能未完成）:', err?.message || err);
        if (cacheEntry?.html) {
          htmlToUse = cacheEntry.html;
        } else {
          htmlToUse = '';
        }
      }
      if (rendered && htmlToUse) {
        cache?.set(key, { html: htmlToUse, latex: segment.latex });
      }
    } else if (cacheEntry?.html) {
      htmlToUse = cacheEntry.html;
    }

    if (htmlToUse) {
      if (placeholder.innerHTML !== htmlToUse) {
        placeholder.innerHTML = htmlToUse;
      }
    } else {
      placeholder.textContent = segment.raw || '';
    }
  });
};

const renderBlockMathSegments = (root, segments, cacheRef) => {
  if (!root || !segments?.length) return;
  const katex = (typeof window !== 'undefined' && window.katex) ? window.katex : null;
  const cache = cacheRef?.current;
  const segmentMap = new Map();
  segments.forEach((segment) => segmentMap.set(segment.key, segment));

  const ensureBody = (placeholder) => {
    placeholder.classList.add('block-math-placeholder', STREAM_FADE_EXEMPT_CLASS);
    let body = placeholder.querySelector('.block-math-body');
    if (!body) {
      body = document.createElement('div');
      body.className = 'block-math-body';
      placeholder.prepend(body);
    }
    return body;
  };

  const placeholders = root.querySelectorAll(`.${BLOCK_MATH_PLACEHOLDER_CLASS}`);
  placeholders.forEach((placeholder) => {
    const key = placeholder.getAttribute('data-block-math-key');
    const segment = key ? segmentMap.get(key) : null;
    if (!segment) return;

    const normalizedLatex = segment.latex.replace(/\r/g, '');
    const cacheEntry = cache?.get(key);
    let htmlToUse = cacheEntry?.html || '';
    let rendered = false;

    if (katex && normalizedLatex.trim()) {
      try {
        htmlToUse = katex.renderToString(normalizedLatex, {
          displayMode: true,
          throwOnError: true,
          strict: 'warn'
        });
        rendered = true;
      } catch (err) {
        console.debug('Block LaTeX渲染等待中（表达式可能未完成）:', err?.message || err);
        if (cacheEntry?.html) {
          htmlToUse = cacheEntry.html;
        } else {
          htmlToUse = '';
        }
      }
      if (rendered && htmlToUse) {
        cache?.set(key, { html: htmlToUse, latex: normalizedLatex });
      }
    } else if (cacheEntry?.html) {
      htmlToUse = cacheEntry.html;
    }

    const body = ensureBody(placeholder);

    if (htmlToUse) {
      if (body.innerHTML !== htmlToUse) {
        body.innerHTML = htmlToUse;
      }
    } else {
      body.textContent = segment.raw || '';
    }
  });
};

const STREAM_FADE_DURATION = 600;

// Markdown渲染器组件
const MarkdownRenderer = ({ content }) => {
  const containerRef = useRef(null);
  const lastTextLengthRef = useRef(0);
  const chunkMetaRef = useRef([]);
  const blockMathCacheRef = useRef(new Map());
  const inlineMathCacheRef = useRef(new Map());

  const finalizeFadeSpan = useCallback((span) => {
    if (!span?.isConnected) return;
    const textNode = document.createTextNode(span.textContent || '');
    span.replaceWith(textNode);
  }, []);

  const applyFadeToRange = useCallback((rangeStart, rangeEnd, insertedAt) => {
    const container = containerRef.current;
    if (!container || rangeStart >= rangeEnd) return;

    const totalText = container.textContent || '';
    if (!totalText) return;

    const clampedStart = Math.max(0, Math.min(rangeStart, totalText.length));
    const clampedEnd = Math.max(clampedStart, Math.min(rangeEnd, totalText.length));
    if (clampedStart === clampedEnd) return;

    const now = (typeof performance !== 'undefined' && performance.now)
      ? performance.now()
      : Date.now();
    const elapsed = Math.max(now - insertedAt, 0);
    if (elapsed >= STREAM_FADE_DURATION) return;

    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
    let traversed = 0;
    const nodesToProcess = [];

    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.parentElement?.classList?.contains('stream-fade-chunk')) {
        traversed += node.textContent?.length || 0;
        continue;
      }
      if (node.parentElement?.closest(`.${STREAM_FADE_EXEMPT_CLASS}`)) {
        traversed += node.textContent?.length || 0;
        continue;
      }

      const nodeText = node.textContent || '';
      const nodeLength = nodeText.length;
      const nodeStart = traversed;
      const nodeEnd = nodeStart + nodeLength;

      if (nodeEnd <= clampedStart) {
        traversed = nodeEnd;
        continue;
      }
      if (nodeStart >= clampedEnd) {
        break;
      }

      const sliceStart = Math.max(clampedStart - nodeStart, 0);
      const sliceEnd = Math.min(clampedEnd - nodeStart, nodeLength);
      if (sliceStart === sliceEnd) {
        traversed = nodeEnd;
        continue;
      }

      nodesToProcess.push({ node, sliceStart, sliceEnd });
      traversed = nodeEnd;
    }

    nodesToProcess.forEach(({ node, sliceStart, sliceEnd }) => {
      const text = node.textContent || '';
      const before = text.slice(0, sliceStart);
      const target = text.slice(sliceStart, sliceEnd);
      const after = text.slice(sliceEnd);
      const frag = document.createDocumentFragment();
      if (before) {
        frag.appendChild(document.createTextNode(before));
      }
      if (target) {
        const span = document.createElement('span');
        span.textContent = target;
        span.classList.add('stream-fade-chunk');
        span.style.animationDuration = `${STREAM_FADE_DURATION}ms`;
        span.style.animationDelay = `-${elapsed}ms`;
        span.addEventListener('animationend', () => finalizeFadeSpan(span), { once: true });
        frag.appendChild(span);
      }
      if (after) {
        frag.appendChild(document.createTextNode(after));
      }
      node.replaceWith(frag);
    });
  }, [finalizeFadeSpan]);

  // 使用ref来保存mermaid图表的transform状态（scale和translate）
  const mermaidStatesRef = useRef(new Map()); // key: mermaid块序号, value: {scale, translate}
  // 记录每个支持预览的代码块当前的展示模式（预览 or 代码），以便流式刷新时保持用户选择
  const previewViewModeRef = useRef(new Map()); // key: 代码块序号, value: 'preview' | 'code'
  // 缓存每个Mermaid和SVG代码块最近一次成功渲染的快照，避免失效片段导致闪烁
  const mermaidSnapshotRef = useRef(new Map()); // key: mermaid块序号, value: svg string
  const svgSnapshotRef = useRef(new Map()); // key: svg块序号, value: svg string

  const togglePreviewMode = useCallback((blockKey, forcedMode) => {
    if (!blockKey || !containerRef.current) return;
    const blockContainer = containerRef.current.querySelector(`.code-block-container[data-block-key="${blockKey}"]`);
    if (!blockContainer) return;
    const previewContainer = blockContainer.querySelector('.mermaid-preview, .svg-preview');
    if (!previewContainer) return;
    const codeBlock = blockContainer.querySelector(`pre[data-code-block="${blockKey}"]`) ||
      blockContainer.querySelector('pre');
    if (!codeBlock) return;
    const toggleButton = blockContainer.querySelector(`[data-preview-toggle="${blockKey}"]`);

    const currentMode = previewContainer.dataset.viewMode === 'code' ? 'code'
      : (previewContainer.style.display === 'none' ? 'code' : 'preview');
    const nextMode = forcedMode || (currentMode === 'preview' ? 'code' : 'preview');
    const showPreview = nextMode === 'preview';
    const preferredDisplay = previewContainer.dataset.previewDisplay || 'block';

    previewContainer.style.display = showPreview ? preferredDisplay : 'none';
    previewContainer.dataset.viewMode = nextMode;
    codeBlock.style.display = showPreview ? 'none' : 'block';
    previewViewModeRef.current.set(blockKey, nextMode);

    if (toggleButton) {
      toggleButton.innerHTML = showPreview ? BUTTON_CONTENT.PREVIEW_ON : BUTTON_CONTENT.PREVIEW_OFF;
      toggleButton.setAttribute('data-mode', nextMode);
    }
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const root = containerRef.current;
    const handlePointerDown = (event) => {
      const button = event.target.closest('[data-preview-toggle]');
      if (!button || !root.contains(button)) return;
      const blockKey = button.getAttribute('data-preview-toggle');
      if (!blockKey) return;
      event.preventDefault();
      togglePreviewMode(blockKey);
    };
    root.addEventListener('pointerdown', handlePointerDown);
    return () => {
      root.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [togglePreviewMode]);

  useEffect(() => {
    if (!containerRef.current || typeof window === 'undefined' || !window.markdownit) return;

    // 处理 content 为 null 或空的情况（assistant 消息可能只有 tool_calls 而没有文本内容）
    if (!content || content === null) {
      containerRef.current.innerHTML = '';
      lastTextLengthRef.current = 0;
      chunkMetaRef.current = [];
      blockMathCacheRef.current.clear();
      inlineMathCacheRef.current.clear();
      mermaidStatesRef.current.clear();
      previewViewModeRef.current.clear();
      mermaidSnapshotRef.current.clear();
      svgSnapshotRef.current.clear();
      return;
    }
    
    // 在重新渲染前，保存所有预览容器的当前状态
    const existingPreviews = containerRef.current.querySelectorAll('.mermaid-preview, .svg-preview');
    existingPreviews.forEach(preview => {
      const blockKey = preview.getAttribute('data-block-key');
      if (!blockKey) return;

      if (preview.classList.contains('mermaid-preview') && preview._transformState) {
        mermaidStatesRef.current.set(blockKey, {
          scale: preview._transformState.scale || 1,
          translate: preview._transformState.translate || { x: 0, y: 0 }
        });
      }

      const recordedMode = preview.dataset.viewMode || (preview.style.display === 'none' ? 'code' : 'preview');
      previewViewModeRef.current.set(blockKey, recordedMode);

      if (preview.classList.contains('mermaid-preview')) {
        const snapshotSvg = preview.querySelector('svg');
        if (snapshotSvg) {
          mermaidSnapshotRef.current.set(blockKey, snapshotSvg.outerHTML);
        }
      } else if (preview.classList.contains('svg-preview')) {
        const snapshotSvg = preview.querySelector('svg');
        if (snapshotSvg) {
          svgSnapshotRef.current.set(blockKey, snapshotSvg.outerHTML);
        }
      }
    });

    // 配置Prism自动加载器
    if (window.Prism?.plugins?.autoloader) {
      window.Prism.plugins.autoloader.languages_path =
        'https://cdn.jsdelivr.net/npm/prismjs/components/';
      // 禁用 worker 以避免跨域安全错误
      window.Prism.plugins.autoloader.use_worker = false;
    }

    // 配置markdown-it
    const md = window.markdownit({ html: true, linkify: true, typographer: false });
    
    if (window.markdownitFootnote) {
      md.use(window.markdownitFootnote);
    }
    if (window.markdownitTaskLists) {
      md.use(window.markdownitTaskLists, { enabled: true, label: true });
    }

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

    // 在 Markdown 渲染前保护 LaTeX 代码块，防止 Markdown 处理器破坏换行符
    const protectLatexBlocks = (text) => {
      const protectedBlocks = [];
      let result = text;
      let blockIndex = 0;
      
      // 保护 $$ ... $$ 块 - 使用 HTML 注释作为占位符，Markdown 不会处理它们
      result = result.replace(/\$\$([\s\S]*?)\$\$/g, (match, latex) => {
        const id = `latex-block-${blockIndex}`;
        protectedBlocks.push({ id, latex: latex.trim(), type: 'block' });
        blockIndex++;
        // 使用 HTML 注释 + 特殊 div，Markdown 会原样保留
        return `<!-- ${id} --><div class="latex-block-protected" data-latex-id="${id}"></div><!-- /${id} -->`;
      });
      
      // 保护 \[ ... \] 块
      result = result.replace(/\\\[([\s\S]*?)\\\]/g, (match, latex) => {
        const id = `latex-block-${blockIndex}`;
        protectedBlocks.push({ id, latex: latex.trim(), type: 'block' });
        blockIndex++;
        return `<!-- ${id} --><div class="latex-block-protected" data-latex-id="${id}"></div><!-- /${id} -->`;
      });
      
      return { text: result, protectedBlocks };
    };

    // 渲染Markdown（先保护 LaTeX）
    const normalizedContent = normalizeQuotesInString(content);
    const inlineReadyContent = normalizeInlineMathDelimiters(normalizedContent);
    const latexReadyContent = normalizeBlockMathDelimiters(inlineReadyContent);
    const dedentedContent = dedent(latexReadyContent);
    
    // 保护 LaTeX 块
    const { text: protectedContent, protectedBlocks } = protectLatexBlocks(dedentedContent);
    
    // 渲染 Markdown
    const renderedHtml = md.render(protectedContent);
    
    // 设置 HTML
    containerRef.current.innerHTML = renderedHtml;
    
    // 在 DOM 中恢复受保护的 LaTeX 块（在后续的 replaceBlockMathWithPlaceholders 中处理）
    // 将 LaTeX 内容存储到 DOM 元素的 dataset 中
    protectedBlocks.forEach(({ id, latex }) => {
      const element = containerRef.current.querySelector(`[data-latex-id="${id}"]`);
      if (element) {
        // 直接设置 textContent 为完整的 LaTeX 表达式，包含定界符
        element.textContent = `$$${latex}$$`;
        element.setAttribute('data-latex-protected', 'true');
      }
    });

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
    const activeMermaidKeys = new Set();
    const activePreviewKeys = new Set();
    let mermaidBlockIndex = 0;
    let svgBlockIndex = 0;
    pres.forEach(pre => {
      if (pre.closest('.code-block-container')) return;

      const code = pre.querySelector('code');
      if (!code) return;

      const languageMatch = /language-(\w+)/.exec(code.className || '');
      const language = languageMatch ? languageMatch[1] : '';
      const isMermaid = language === 'mermaid';
      const isSvg = language === 'svg';
      const supportsPreview = isMermaid || isSvg;
      let blockKey = null;
      if (isMermaid) {
        blockKey = `mermaid-${mermaidBlockIndex++}`;
        activeMermaidKeys.add(blockKey);
      } else if (isSvg) {
        blockKey = `svg-${svgBlockIndex++}`;
      }
      if (supportsPreview && blockKey) {
        activePreviewKeys.add(blockKey);
      }
      
      // 克隆 pre 元素
      const preClone = pre.cloneNode(true);
      const codeClone = preClone.querySelector('code');
      const codeContent = codeClone?.textContent || '';
      if (blockKey) {
        preClone.setAttribute('data-code-block', blockKey);
      }
      
      // 创建容器结构
      const container = document.createElement('div');
      container.className = 'code-block-container';
      if (supportsPreview && blockKey) {
        container.setAttribute('data-block-key', blockKey);
      }
      
      const header = document.createElement('div');
      header.className = 'code-block-header';

      const langSpan = document.createElement('span');
      langSpan.textContent = language || 'code';
      
      const contentArea = document.createElement('div');
      contentArea.className = 'code-block-content';
      
      // 为支持预览的代码块添加预览按钮
      let previewButton = null;
      let showPreview = true; // 默认开启预览
      
      if (supportsPreview && blockKey) {
        const savedViewMode = previewViewModeRef.current.get(blockKey);
        showPreview = savedViewMode !== 'code';

        previewButton = document.createElement('button');
        previewButton.className = 'code-copy-button mermaid-preview-toggle';
        previewButton.innerHTML = showPreview ? BUTTON_CONTENT.PREVIEW_ON : BUTTON_CONTENT.PREVIEW_OFF;
        previewButton.setAttribute('aria-label', 'Toggle Preview');
        previewButton.setAttribute('data-preview-toggle', blockKey);
        previewButton.setAttribute('data-mode', showPreview ? 'preview' : 'code');
      }
      
      const copyButton = document.createElement('button');
      copyButton.className = 'code-copy-button';
      copyButton.innerHTML = BUTTON_CONTENT.COPY;
      copyButton.setAttribute('aria-label', 'Copy');

      // 创建Mermaid预览容器（仅对Mermaid图表）
      let mermaidContainer = null;
      if (isMermaid) {
        // 计算代码块高度
        let codeBlockHeight = pre.offsetHeight;
        if (!codeBlockHeight || codeBlockHeight < 40) codeBlockHeight = 200;
        
        // 创建Mermaid预览容器，直接作为内容显示
        mermaidContainer = document.createElement('div');
        mermaidContainer.className = 'mermaid-preview';
        mermaidContainer.setAttribute('data-block-key', blockKey);
        mermaidContainer.dataset.viewMode = showPreview ? 'preview' : 'code';
        mermaidContainer.dataset.previewDisplay = 'block';
        previewViewModeRef.current.set(blockKey, showPreview ? 'preview' : 'code');
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
        mermaidContainer.style.display = showPreview ? 'block' : 'none';
        
        // 创建缩放控制按钮
        const zoomControls = document.createElement('div');
        zoomControls.className = 'mermaid-zoom-controls';
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

        // 缩放和拖拽状态 - 尝试从之前保存的状态恢复
        const savedState = mermaidStatesRef.current.get(blockKey);
        let scale = savedState ? savedState.scale : 1;
        let translate = savedState ? { ...savedState.translate } : { x: 0, y: 0 };
        let isDragging = false;
        let dragStart = { x: 0, y: 0 };
        
        // 初始化状态对象并保存到容器上
        mermaidContainer._transformState = { scale, translate };
        
        // 缩放功能 - 直接对mermaidContainer内的内容进行变换
        const updateTransform = () => {
          const svgElement = mermaidContainer.querySelector('svg');
          if (svgElement) {
            svgElement.style.transform = `translate(${translate.x}px, ${translate.y}px) scale(${scale})`;
          }
          // 同步更新保存的状态
          mermaidContainer._transformState = { scale, translate: { ...translate } };
        };

        const replaceSvgContent = (svgElement) => {
          if (!svgElement) return;
          svgElement.style.maxWidth = '100%';
          svgElement.style.height = 'auto';
          svgElement.style.maxHeight = '100%';
          svgElement.style.display = 'block';
          svgElement.style.transformOrigin = 'center center';
          const existingSvg = mermaidContainer.querySelector('svg');
          const controlsNode = mermaidContainer.querySelector('.mermaid-zoom-controls');
          if (existingSvg) {
            existingSvg.replaceWith(svgElement);
          } else if (controlsNode) {
            mermaidContainer.insertBefore(svgElement, controlsNode);
          } else {
            mermaidContainer.appendChild(svgElement);
          }
          updateTransform();
        };

        const applyMermaidSnapshot = () => {
          const snapshot = mermaidSnapshotRef.current.get(blockKey);
          if (!snapshot) return;
          const temp = document.createElement('div');
          temp.innerHTML = snapshot;
          const snapshotSvg = temp.querySelector('svg');
          if (snapshotSvg) {
            replaceSvgContent(snapshotSvg);
            mermaidContainer.setAttribute('data-render-success', 'true');
          }
        };

        // 恢复上一次成功渲染，避免在新chunk尚未合法时闪烁
        applyMermaidSnapshot();
        
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
              
              const result = await window.mermaid.render(mermaidId + '-svg', codeContent);
              
              // 渲染后立即清理
              setTimeout(cleanupErrors, 50);
              
              if (result && result.svg) {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = result.svg;
                const svg = tempDiv.querySelector('svg');
                
                if (svg) {
                  replaceSvgContent(svg);
                  mermaidSnapshotRef.current.set(blockKey, svg.outerHTML);
                  mermaidContainer.setAttribute('data-render-success', 'true');
                  
                  // 应用保存的transform状态（如果有）
                  updateTransform();
                  
                  // 延迟清理，确保渲染完成
                  setTimeout(cleanupErrors, 200);
                }
              }
            } catch (err) {
              // 流式显示时代码可能不完整，导致语法错误
              // 如果已经有成功渲染的内容，保持不变，避免闪烁
              const hasSuccessRender = mermaidContainer.getAttribute('data-render-success') === 'true';
              
              if (!hasSuccessRender) {
                // 首次渲染失败，静默等待，不显示错误信息，避免流式显示时的闪烁
                // 只在控制台输出调试信息
                console.debug('Mermaid渲染等待中（代码可能未完整接收）:', err.message);
              } else {
                applyMermaidSnapshot();
              }
              
              // 错误时也清理DOM中的错误信息
              cleanupErrors();
              setTimeout(cleanupErrors, 100);
            }
          };
          
          // 执行渲染
          renderChart();
        } else {
          if (!mermaidSnapshotRef.current.get(blockKey)) {
            const errorDiv = document.createElement('div');
            errorDiv.style.cssText = 'color: #ef4444; padding: 10px; text-align: center;';
            errorDiv.textContent = 'Mermaid库未加载';
            mermaidContainer.appendChild(errorDiv);
          } else {
            applyMermaidSnapshot();
          }
        }
        
      }

      // SVG 预览容器
      let svgContainer = null;
      if (isSvg && blockKey) {
        let codeBlockHeight = pre.offsetHeight;
        if (!codeBlockHeight || codeBlockHeight < 40) codeBlockHeight = 200;
        const normalizedHeight = Math.min(Math.max(codeBlockHeight, 120), 400);

        svgContainer = document.createElement('div');
        svgContainer.className = 'svg-preview';
        svgContainer.setAttribute('data-block-key', blockKey);
        svgContainer.dataset.viewMode = showPreview ? 'preview' : 'code';
        svgContainer.dataset.previewDisplay = 'flex';
        previewViewModeRef.current.set(blockKey, showPreview ? 'preview' : 'code');
        svgContainer.style.cssText = `
          padding: 16px;
          background: white;
          border-radius: 12px;
          border: 1px solid #f1f5f9;
          display: ${showPreview ? 'flex' : 'none'};
          align-items: center;
          justify-content: center;
          min-height: ${normalizedHeight}px;
          max-height: 400px;
          overflow: auto;
        `;

        const sanitizeSvgNode = (node) => {
          if (!node) return;
          if (node.attributes) {
            Array.from(node.attributes).forEach((attr) => {
              const name = (attr.name || '').toLowerCase();
              const value = (attr.value || '').toLowerCase();
              if (name.startsWith('on') || value.includes('javascript:')) {
                node.removeAttribute(attr.name);
              }
            });
          }
          Array.from(node.children || []).forEach((child) => {
            const tag = (child.tagName || '').toLowerCase();
            if (tag === 'script' || tag === 'foreignobject') {
              child.remove();
            } else {
              sanitizeSvgNode(child);
            }
          });
        };

        const applySnapshotToContainer = (snapshot) => {
          if (!snapshot) return;
          const tempWrapper = document.createElement('div');
          tempWrapper.innerHTML = snapshot;
          const snapshotSvg = tempWrapper.querySelector('svg');
          if (snapshotSvg) {
            svgContainer.replaceChildren(snapshotSvg);
          }
        };

        // 先恢复上一次成功渲染的内容，避免空白闪烁
        applySnapshotToContainer(svgSnapshotRef.current.get(blockKey));

        const renderSvgPreview = () => {
          if (!codeContent?.trim()) return;
          const hasOpening = /<svg[\s\S]*?>/i.test(codeContent);
          const hasClosing = /<\/svg>/i.test(codeContent);
          if (!hasOpening) {
            console.debug('SVG渲染等待中（尚未检测到<svg>起始标签）');
            return;
          }
          const svgMarkup = hasClosing ? codeContent : `${codeContent}</svg>`;
          try {
            const parser = new DOMParser();
            const parsed = parser.parseFromString(svgMarkup, 'image/svg+xml');
            const parserError = parsed.querySelector('parsererror');
            if (parserError) {
              throw new Error(parserError.textContent || 'SVG语法错误');
            }
            const svgElement = parsed.documentElement;
            if (!svgElement || svgElement.nodeName.toLowerCase() !== 'svg') {
              throw new Error('SVG代码需要以<svg>开头');
            }
            sanitizeSvgNode(svgElement);
            const sanitizedSvg = document.importNode(svgElement, true);
            sanitizedSvg.style.maxWidth = '100%';
            sanitizedSvg.style.height = 'auto';
            sanitizedSvg.setAttribute('role', sanitizedSvg.getAttribute('role') || 'img');
            sanitizedSvg.setAttribute('focusable', 'false');
            sanitizedSvg.setAttribute('aria-hidden', 'false');

            svgContainer.replaceChildren(sanitizedSvg);
            svgSnapshotRef.current.set(blockKey, sanitizedSvg.outerHTML);
            svgContainer.setAttribute('data-render-success', 'true');
          } catch (err) {
            console.debug('SVG渲染等待中（代码可能未完整接收）:', err.message);
            applySnapshotToContainer(svgSnapshotRef.current.get(blockKey));
          }
        };

        renderSvgPreview();
      }
      if (supportsPreview && blockKey) {
        preClone.style.display = showPreview ? 'none' : 'block';
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
      if (svgContainer) {
        contentArea.appendChild(svgContainer);
      }
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

      // 然后对克隆的代码元素进行高亮（非Mermaid的情况）
      if (window.Prism && codeClone && !isMermaid) {
        window.Prism.highlightElement(codeClone, false);
      }
    });

    // 清理已经不存在的Mermaid状态，避免ref无限增长
    mermaidStatesRef.current.forEach((_, key) => {
      if (!activeMermaidKeys.has(key)) {
        mermaidStatesRef.current.delete(key);
      }
    });
    mermaidSnapshotRef.current.forEach((_, key) => {
      if (!activeMermaidKeys.has(key)) {
        mermaidSnapshotRef.current.delete(key);
      }
    });
    previewViewModeRef.current.forEach((_, key) => {
      if (!activePreviewKeys.has(key)) {
        previewViewModeRef.current.delete(key);
      }
    });
    svgSnapshotRef.current.forEach((_, key) => {
      if (!activePreviewKeys.has(key)) {
        svgSnapshotRef.current.delete(key);
      }
    });

    // 流式块级公式渲染（先替换占位，再手动渲染，防止未闭合内容闪烁）
    const blockMathSegments = replaceBlockMathWithPlaceholders(containerRef.current);
    renderBlockMathSegments(containerRef.current, blockMathSegments, blockMathCacheRef);
    const activeBlockKeys = new Set(blockMathSegments.map((segment) => segment.key));
    blockMathCacheRef.current.forEach((_, key) => {
      if (!activeBlockKeys.has(key)) {
        blockMathCacheRef.current.delete(key);
      }
    });

    const inlineMathSegments = replaceInlineMathWithPlaceholders(containerRef.current);
    renderInlineMathSegments(containerRef.current, inlineMathSegments, inlineMathCacheRef);
    const activeInlineKeys = new Set(inlineMathSegments.map((segment) => segment.key));
    inlineMathCacheRef.current.forEach((_, key) => {
      if (!activeInlineKeys.has(key)) {
        inlineMathCacheRef.current.delete(key);
      }
    });

    // 引号统一为英文格式，避免中英文混排导致的符号跳变
    normalizeQuotesInElement(containerRef.current);

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
    const textContent = containerRef.current.textContent || '';
    const totalLength = textContent.length;
    const prevLength = lastTextLengthRef.current || 0;
    const now = (typeof performance !== 'undefined' && performance.now)
      ? performance.now()
      : Date.now();

    if (totalLength < prevLength) {
      chunkMetaRef.current = [];
    }

    if (totalLength > prevLength) {
      chunkMetaRef.current.push({ start: prevLength, end: totalLength, insertedAt: now });
    }

    lastTextLengthRef.current = totalLength;

    chunkMetaRef.current = chunkMetaRef.current.filter(chunk => (now - chunk.insertedAt) < STREAM_FADE_DURATION);
    chunkMetaRef.current.forEach(chunk => applyFadeToRange(chunk.start, chunk.end, chunk.insertedAt));

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
  }, [content, applyFadeToRange]);

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
          "max-w-[80%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed shadow-sm whitespace-pre-wrap",
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
      <div className="pl-2 pt-1">
        <span className="sr-only">AI 正在回复</span>
        <div className="loading-breath-dot" aria-hidden="true"></div>
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
        // 分类结果（包含商品搜索旧格式和分类查询）
        if (Array.isArray(parsed.categories)) {
          const count = typeof parsed.count === 'number' ? parsed.count : parsed.categories.length;
          const names = parsed.categories
            .map((c) => (typeof c === 'string' ? c : (c?.name || '')))
            .filter(Boolean);
          
          // 单个分类的情况，显示为商品搜索格式（兼容旧数据）
          if (names.length === 1) {
            return `${names[0]} · 找到 ${count} 个商品`;
          }
          
          // 多个分类的情况，显示为分类列表格式
          const display = names.slice(0, 6).join(', ');
          const more = names.length > 6 ? ', ...' : '';
          return `[${display}${more}] · 找到 ${count} 个商品`;
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

export default function ChatModern({ user, initialConversationId = null }) {
  const router = useRouter();
  const [msgs, setMsgs] = useState([]);
  const [inp, setInp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showThinking, setShowThinking] = useState(false);
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const [modelError, setModelError] = useState("");
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const [chats, setChats] = useState([]);
  
  // 从 localStorage 读取侧边栏状态，桌面端默认展开，移动端默认关闭
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('ai_sidebar_open');
      if (saved !== null) {
        return saved === 'true';
      }
      // 移动端默认关闭，桌面端默认打开
      return window.innerWidth >= 1024;
    }
    return true;
  });
  const [isLoadingChats, setIsLoadingChats] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [chatError, setChatError] = useState("");
  const [renamingChatId, setRenamingChatId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [originalRenameValue, setOriginalRenameValue] = useState(""); // 记录重命名前的原始标题
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const first = msgs.length === 0;
  const genId = useId();
  const { endRef, containerRef } = useSmartAutoScroll(msgs);
  const abortControllerRef = useRef(null);
  const thinkingMsgIdRef = useRef(null);
  const pendingChatTitleRef = useRef(null); // 保存待创建对话的标题（用户消息）
  const pendingChatIdRef = useRef(null); // 保存新创建但未激活的对话ID
  const isCreatingNewChatRef = useRef(false); // 标记正在创建新对话，防止被derivedChatId覆盖
  const skipNextLoadRef = useRef(false); // 标记跳过下一次loadConversation（当前msgs已是最新）
  const apiBase = useMemo(() => getApiBaseUrl().replace(/\/$/, ""), []);
  const historyEnabled = Boolean(user);
  const routeChatId = router?.query?.chatId ? String(router.query.chatId) : null;
  const derivedChatId = initialConversationId || routeChatId || null;
  const [activeChatId, setActiveChatId] = useState(derivedChatId);
  const activeChatIdRef = useRef(activeChatId);
  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);
  const sidebarWidth = historyEnabled
    ? isSidebarOpen
      ? SIDEBAR_EXPANDED_WIDTH
      : SIDEBAR_COLLAPSED_WIDTH
    : 0;
  // 对话准备就绪的条件：
  // 1. 未启用历史记录功能，或
  // 2. 已选择对话，或  
  // 3. 处于新对话状态（activeChatId为null但msgs为空，说明是准备开始新对话）
  const conversationReady = !historyEnabled || Boolean(activeChatId) || (activeChatId === null && msgs.length === 0);

  const selectedModelMeta = useMemo(
    () => models.find((item) => item.model === selectedModel) || null,
    [models, selectedModel]
  );

  // 保存侧边栏状态到 localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('ai_sidebar_open', String(isSidebarOpen));
    }
  }, [isSidebarOpen]);

  useEffect(() => {
    // 判断是否是新对话URL
    const isNewChatUrl = router?.query?.chat === 'true' && !router?.query?.chatId;
    
    // 如果是新对话URL，保持标志为true，防止activeChatId被derivedChatId覆盖
    if (isNewChatUrl) {
      isCreatingNewChatRef.current = true;
      return;
    }
    
    // 如果正在创建新对话，不要被derivedChatId覆盖
    if (isCreatingNewChatRef.current) {
      return;
    }
    
    if (derivedChatId !== activeChatId) {
      setActiveChatId(derivedChatId || null);
    }
  }, [derivedChatId, activeChatId, router?.query?.chat, router?.query?.chatId]);

  useEffect(() => {
    if (!historyEnabled) {
      setChats([]);
      setActiveChatId(null);
    }
  }, [historyEnabled]);

  useEffect(() => {
    if (!historyEnabled || !activeChatId) {
      setIsLoadingHistory(false);
    }
  }, [historyEnabled, activeChatId]);

  const mapHistoryToMessages = useCallback(
    (entries = []) => {
      const normalized = [];
      
      // 第一步：构建 tool_call_id 到 tool 消息的映射
      const toolResultsMap = new Map();
      const processedToolIndices = new Set(); // 跟踪已处理的 tool 消息索引
      
      entries.forEach((entry, index) => {
        if (entry && entry.role === "tool" && entry.tool_call_id) {
          toolResultsMap.set(entry.tool_call_id, entry.content || "");
        }
      });
      
      // 第二步：从工具结果推断工具名称和参数（用于旧数据兼容）
      const inferToolInfo = (resultContent) => {
        let toolName = "unknown_tool";
        let toolArgs = "{}";
        
        try {
          const resultJson = JSON.parse(resultContent);
          // 根据结果特征推断工具名称
          if (resultJson.categories !== undefined) {
            toolName = "get_category";
          } else if (resultJson.items !== undefined || resultJson.multi_query !== undefined) {
            // search_products: 单查询有 items 字段，多查询有 multi_query 字段
            toolName = "search_products";
            if (resultJson.multi_query && resultJson.queries) {
              // 多查询：提取 queries 数组
              toolArgs = JSON.stringify({ query: resultJson.queries });
            } else if (resultJson.query) {
              // 单查询：提取 query
              toolArgs = JSON.stringify({ query: [resultJson.query] });
            }
          } else if (resultJson.action !== undefined || resultJson.details !== undefined) {
            toolName = "update_cart";
          } else if (resultJson.total_price !== undefined || resultJson.total_quantity !== undefined) {
            toolName = "get_cart";
          }
        } catch {
          // 非JSON结果，保持默认
        }
        
        return { name: toolName, arguments: toolArgs };
      };
      
      // 第三步：处理消息并创建工具卡片
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        if (!entry || !entry.role) continue;
        
        const baseId = entry.id || genId();
        const role = entry.role;
        
        if (role === "user") {
          normalized.push({
            id: baseId,
            role: "user",
            content: entry.content || "",
          });
        } else if (role === "assistant") {
          // 查找紧跟在这个 assistant 消息后面的所有 tool 消息
          const followingToolCalls = [];
          
          // 如果 assistant 有 tool_calls，则收集对应数量的 tool 消息（即使 tool_call_id 为 null）
          const expectedToolCount = entry.tool_calls?.length || 0;
          
          for (let j = i + 1; j < entries.length; j++) {
            const nextEntry = entries[j];
            if (nextEntry.role === "tool") {
              // 如果 assistant 有 tool_calls，收集紧随的 tool 消息
              if (expectedToolCount > 0 && followingToolCalls.length < expectedToolCount) {
                followingToolCalls.push(nextEntry);
                processedToolIndices.add(j); // 标记为已处理
              } 
              // 如果 assistant 没有 tool_calls 但有 tool_call_id，也收集
              else if (expectedToolCount === 0 && nextEntry.tool_call_id) {
                followingToolCalls.push(nextEntry);
                processedToolIndices.add(j); // 标记为已处理
              }
            } else if (nextEntry.role === "assistant" || nextEntry.role === "user") {
              break;
            }
          }
          
          // 构建 tool_calls 数据
          let toolCallsForApi = entry.tool_calls || [];
          
          // 如果没有 tool_calls 但有后续的 tool 消息（旧数据），从 tool 消息反推
          if (!toolCallsForApi.length && followingToolCalls.length > 0) {
            toolCallsForApi = followingToolCalls.map(tc => {
              const resultContent = tc.content || "";
              const info = inferToolInfo(resultContent);
              return {
                id: tc.tool_call_id || genId(),
                type: "function",
                function: {
                  name: info.name,
                  arguments: info.arguments
                }
              };
            });
          }
          
          // 添加 assistant 消息（用于API调用的消息历史）
          const assistantPayload = {
            id: baseId,
            role: "assistant",
            content: entry.content || "",
          };
          if (toolCallsForApi.length > 0) {
            assistantPayload.tool_calls = toolCallsForApi;
          }
          normalized.push(assistantPayload);
          
          // 为每个工具调用创建UI卡片
          if (toolCallsForApi.length > 0) {
            toolCallsForApi.forEach((tc, tcIndex) => {
              const toolCallId = tc.id || tc.tool_call_id;
              if (!toolCallId) return;
              
              const fn = tc.function || {};
              const fnName = fn.name || "";
              const argsText = typeof fn.arguments === 'string' ? fn.arguments : JSON.stringify(fn.arguments || {});
              
              // 获取工具执行结果
              // 优先从 toolResultsMap 获取（新数据），如果没有则从 followingToolCalls 按顺序获取（旧数据）
              let resultContent = toolResultsMap.get(toolCallId);
              if (!resultContent && followingToolCalls[tcIndex]) {
                resultContent = followingToolCalls[tcIndex].content || "";
              }
              
              let resultSummary = "";
              let errorMessage = "";
              let status = "success";
              
              if (resultContent) {
                try {
                  const resultJson = JSON.parse(resultContent);
                  if (resultJson.ok === false) {
                    status = "error";
                    errorMessage = resultJson.error || "工具执行出错";
                    resultSummary = errorMessage;
                  } else {
                    // 不截断结果，传递完整内容给 ToolCallCard 让它自己格式化
                    resultSummary = resultContent;
                  }
                } catch {
                  // 非 JSON 结果，仍然截断避免显示过长
                  resultSummary = resultContent.slice(0, 140);
                }
              }
              
              // 创建工具调用UI卡片
              normalized.push({
                id: genId(),
                role: "tool_call",
                tool_call_id: toolCallId,
                status: status,
                function_name: fnName,
                arguments_text: argsText,
                result_summary: resultSummary,
                error_message: errorMessage,
              });
              
              // 添加 tool 消息（用于API调用的消息历史）
              if (resultContent) {
                normalized.push({
                  id: genId(),
                  role: "tool",
                  tool_call_id: toolCallId,
                  content: resultContent,
                });
              }
            });
          }
        } else if (role === "tool") {
          // 处理孤立的 tool 消息（旧数据中 tool_call_id 为 null 的情况）
          if (!processedToolIndices.has(i)) {
            const resultContent = entry.content || "";
            const info = inferToolInfo(resultContent);
            
            let resultSummary = "";
            let errorMessage = "";
            let status = "success";
            
            try {
              const resultJson = JSON.parse(resultContent);
              if (resultJson.ok === false) {
                status = "error";
                errorMessage = resultJson.error || "工具执行出错";
                resultSummary = errorMessage;
              } else {
                resultSummary = resultContent;
              }
            } catch {
              resultSummary = resultContent.slice(0, 140);
            }
            
            // 为孤立的 tool 消息创建工具卡片
            normalized.push({
              id: genId(),
              role: "tool_call",
              tool_call_id: entry.tool_call_id || genId(),
              status: status,
              function_name: info.name,
              arguments_text: info.arguments,
              result_summary: resultSummary,
              error_message: errorMessage,
            });
            
            // 添加 tool 消息（用于API调用的消息历史）
            normalized.push({
              id: genId(),
              role: "tool",
              tool_call_id: entry.tool_call_id || genId(),
              content: resultContent,
            });
          }
        }
      }
      
      return normalized;
    },
    [genId]
  );

  const fetchChats = useCallback(async () => {
    if (!historyEnabled) return;
    setIsLoadingChats(true);
    setChatError("");
    try {
      const response = await fetch(`${apiBase}/ai/chats?limit=100`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("聊天历史加载失败");
      }
      const data = await response.json();
      const list = Array.isArray(data?.chats) ? data.chats : [];
      setChats(list);
      
      // 判断是否是新对话状态：URL是/?chat=true（没有chatId参数）
      const isNewChatUrl = router?.query?.chat === 'true' && !router?.query?.chatId;
      
      // 只有在不是正在创建新对话的情况下，才自动选择第一个对话
      if (!activeChatIdRef.current && list.length > 0 && !isCreatingNewChatRef.current && !isNewChatUrl) {
        const fallbackId = list[0].id;
        setActiveChatId(fallbackId);
        if (router && router.isReady) {
          const targetPath = `/c/${fallbackId}`;
          if (router.asPath !== targetPath) {
            router.replace(targetPath);
          }
        }
      }
    } catch (err) {
      setChatError(err.message || "聊天历史加载失败");
    } finally {
      setIsLoadingChats(false);
    }
  }, [historyEnabled, apiBase]);

  const loadConversation = useCallback(
    async (chatId) => {
      if (!historyEnabled || !chatId) {
        setMsgs([]);
        setIsLoadingHistory(false);
        return;
      }
      setIsLoadingHistory(true);
      setChatError("");
      try {
        const response = await fetch(`${apiBase}/ai/chats/${chatId}`, {
          credentials: "include",
        });
        if (response.status === 401) {
          setChatError("无权访问该对话");
          setMsgs([]);
          return;
        }
        if (!response.ok) {
          throw new Error("加载对话失败");
        }
        const data = await response.json();
        const historyMessages = Array.isArray(data?.messages) ? data.messages : [];
        setMsgs(mapHistoryToMessages(historyMessages));
      } catch (err) {
        setChatError(err.message || "加载对话失败");
        setMsgs([]);
      } finally {
        setIsLoadingHistory(false);
      }
    },
    [historyEnabled, apiBase, mapHistoryToMessages]
  );

  useEffect(() => {
    if (!historyEnabled) return;
    fetchChats();
  }, [historyEnabled, fetchChats]);

  useEffect(() => {
    if (!historyEnabled) return;
    if (!activeChatId) return;
    
    // 检查是否有pending的消息需要处理
    try {
      const pendingKey = `chat_pending_${activeChatId}`;
      const pendingData = sessionStorage.getItem(pendingKey);
      if (pendingData) {
        const { text, model } = JSON.parse(pendingData);
        sessionStorage.removeItem(pendingKey);
        
        // 跳过加载历史，直接发送消息
        skipNextLoadRef.current = true;
        
        // 设置模型
        if (model) {
          setSelectedModel(model);
        }
        
        // 立即添加用户消息并发送
        setTimeout(() => {
          handleStop();
          setIsLoading(true);
          setShowThinking(true);
          setChatError("");
          thinkingMsgIdRef.current = null;
          push("user", text);
          
          // 更新对话列表预览
          setChats((prev) => {
            const target = prev.find((chat) => chat.id === activeChatId);
            if (!target) return prev;
            const updatedChat = {
              ...target,
              preview: text.slice(0, 8) || target.preview,
            };
            const others = prev.filter((chat) => chat.id !== activeChatId);
            return [updatedChat, ...others];
          });
          
          // 构建消息并发送
          const apiMessages = [{ role: "user", content: text }];
          sendMessage(apiMessages, model, activeChatId).finally(() => {
            setIsLoading(false);
            setShowThinking(false);
            abortControllerRef.current = null;
          });
        }, 100);
        return;
      }
    } catch (err) {
      console.error('恢复pending消息失败:', err);
    }
    
    // 如果标记为跳过，则不加载对话历史（因为当前msgs已经是最新的）
    if (skipNextLoadRef.current) {
      skipNextLoadRef.current = false;
      return;
    }
    
    loadConversation(activeChatId);
  }, [historyEnabled, activeChatId, loadConversation]);

  const handleChatSelect = useCallback(
    (chatId) => {
      if (!historyEnabled || !chatId || chatId === activeChatId) return;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      setShowThinking(false);
      
      // 重置新对话标志
      isCreatingNewChatRef.current = false;
      pendingChatIdRef.current = null;
      pendingChatTitleRef.current = null;
      
      setActiveChatId(chatId);
      
      // 移动端关闭侧边栏
      if (typeof window !== 'undefined' && window.innerWidth < 1024) {
        setIsSidebarOpen(false);
      }
      
      if (router) {
        router.push(`/c/${chatId}`);
      }
    },
    [historyEnabled, activeChatId, router]
  );

  const handleCreateChat = useCallback(() => {
    if (!historyEnabled) return;
    
    // 检查当前是否已经在空白新对话中
    if (!activeChatId && msgs.length === 0 && isCreatingNewChatRef.current) {
      // 当前已经是准备新对话的状态，不需要重复操作
      return;
    }
    
    // 设置标志，防止被derivedChatId覆盖和fetchChats自动跳转
    isCreatingNewChatRef.current = true;
    
    // 清空状态，准备新对话
    setActiveChatId(null);
    setMsgs([]);
    setChatError("");
    pendingChatIdRef.current = null;
    pendingChatTitleRef.current = null;
    
    // 移动端关闭侧边栏
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setIsSidebarOpen(false);
    }
    
    // 跳转到聊天根目录
    if (router) {
      router.push('/?chat=true');
    }
  }, [historyEnabled, activeChatId, msgs, router]);

  // 实际创建对话的内部函数（不激活）
  const createNewChatSilent = useCallback(async (title = "") => {
    try {
      const response = await fetch(`${apiBase}/ai/chats`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title: title.trim() }),
      });
      if (!response.ok) {
        throw new Error("创建对话失败");
      }
      const data = await response.json();
      const chat = data?.chat;
      if (chat?.id) {
        // 添加到列表但不激活
        setChats((prev) => [chat, ...prev.filter((item) => item.id !== chat.id)]);
        return chat.id;
      }
      return null;
    } catch (err) {
      console.error("创建对话失败:", err);
      setChatError(err.message || "创建对话失败");
      return null;
    }
  }, [apiBase]);

  // 激活pending的对话
  const activatePendingChat = useCallback(() => {
    if (!historyEnabled || !pendingChatIdRef.current) {
      return;
    }
    
    const chatId = pendingChatIdRef.current;
    pendingChatIdRef.current = null;
    pendingChatTitleRef.current = null;
    
    // 重置新对话标志
    isCreatingNewChatRef.current = false;
    
    // 不跳转路由，避免页面组件切换导致状态丢失
    // 只更新activeChatId，让侧边栏显示当前对话为激活状态
    setActiveChatId(chatId);
    
    // 注意：不调用 router.replace，保持在当前URL
    // 用户可以从侧边栏看到新创建的对话，体验更流畅
  }, [historyEnabled]);

  // 计算聊天标题的显示文本
  const getDisplayTitle = useCallback((chat) => {
    if (!chat) return "新对话";
    
    const customTitle = (chat.title || "").trim();
    const preview = (chat.preview || "").trim();
    
    // 如果有自定义标题
    if (customTitle) {
      // 如果标题超过8个字符，显示前7个字符 + "..."
      if (customTitle.length > 8) {
        return customTitle.slice(0, 7) + "...";
      }
      return customTitle;
    }
    
    // 否则使用预览（已经是前8个字符）
    return preview || "新对话";
  }, []);

  const applyRenameLocally = useCallback((chatId, title) => {
    if (!chatId) return;
    const normalized = (title || "").trim();
    setChats((prev) =>
      prev.map((chat) => {
        if (chat.id !== chatId) return chat;
        return {
          ...chat,
          title: normalized || null,  // 存储完整标题或null
        };
      })
    );
  }, [setChats]);

  const startRenaming = useCallback((chat) => {
    if (!chat) return;
    setRenamingChatId(chat.id);
    // 编辑时显示完整的自定义标题（不截断），如果没有自定义标题则显示预览
    const currentTitle = (chat.title || "").trim() || (chat.preview || "").trim() || "";
    setRenameValue(currentTitle);
    setOriginalRenameValue(currentTitle); // 记录原始值用于后续比较
  }, []);

  const cancelRename = useCallback(() => {
    setRenamingChatId(null);
    setRenameValue("");
    setOriginalRenameValue("");
  }, []);

  const submitRename = useCallback(async () => {
    if (!renamingChatId) {
      cancelRename();
      return;
    }
    const chatId = renamingChatId;
    const payload = (renameValue || "").trim();
    
    // 检查标题是否真的有变化，如果没有变化就不发送请求
    if (payload === originalRenameValue) {
      // 没有变化，直接取消重命名状态，不做任何更新
      cancelRename();
      return;
    }
    
    applyRenameLocally(chatId, payload);
    cancelRename();
    if (!historyEnabled) {
      return;
    }
    setChatError("");
    try {
      const response = await fetch(`${apiBase}/ai/chats/${chatId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title: payload }),
      });
      if (!response.ok) {
        throw new Error("更新聊天名称失败");
      }
      const data = await response.json();
      if (data?.chat) {
        setChats((prev) =>
          prev.map((item) => (item.id === data.chat.id ? { ...item, ...data.chat } : item))
        );
      }
    } catch (err) {
      setChatError(err.message || "更新聊天名称失败");
    }
  }, [renamingChatId, renameValue, originalRenameValue, applyRenameLocally, cancelRename, historyEnabled, apiBase]);

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
    if (!modelSelectorOpen) return;
    
    const handleClickOutside = (event) => {
      // 检查点击是否在模型选择器容器内
      const modelSelector = event.target.closest('.model-selector-container');
      if (!modelSelector) {
        setModelSelectorOpen(false);
      }
    };

    // 使用 click 而不是 mousedown，避免干扰按钮的 onClick 事件
    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
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
      // 从后往前查找最后一条assistant消息并更新
      for (let i = newMsgs.length - 1; i >= 0; i--) {
        if (newMsgs[i].role === "assistant") {
          newMsgs[i] = { ...newMsgs[i], content: newContent };
          break;
        }
      }
      return newMsgs;
    });
  };

  // SSE客户端实现
  const sendMessage = async (messages, modelValue, chatId = null) => {
    const API_URL = `${apiBase}/ai/chat`;
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
        body: JSON.stringify({
          messages,
          model: modelValue,
          conversation_id: historyEnabled && (chatId || activeChatId) ? (chatId || activeChatId) : undefined,
        }),
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
                  const thinkingMessage = { id: newId, role: "assistant_thinking", content: reasoningDelta, isComplete: false };
                  setMsgs((s) => {
                    if (assistantMessageAdded) {
                      const next = [...s];
                      for (let i = next.length - 1; i >= 0; i--) {
                        if (next[i].role === "assistant") {
                          next.splice(i, 0, thinkingMessage);
                          return next;
                        }
                      }
                    }
                    return [...s, thinkingMessage];
                  });
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
                let thinkingIdForOrdering = null;
                if (thinkingMsgIdRef.current != null) {
                  const thinkingId = thinkingMsgIdRef.current;
                  setMsgs((s) => s.map((m) => m.id === thinkingId && m.role === "assistant_thinking"
                    ? { ...m, isComplete: true }
                    : m
                  ));
                  thinkingIdForOrdering = thinkingId;
                  thinkingMsgIdRef.current = null;
                }
                
                // 累加内容
                assistantContent += data.delta;
                
                // 关键修复：在单个setState中完成添加或更新，避免竞争条件
                if (!assistantMessageAdded) {
                  // 第一次delta：添加新的assistant消息（带初始内容）
                  const assistantId = genId();
                  const assistantMessage = { id: assistantId, role: "assistant", content: assistantContent };
                  setMsgs((s) => {
                    if (thinkingIdForOrdering != null) {
                      const next = [...s];
                      const idx = next.findIndex((m) => m.id === thinkingIdForOrdering);
                      if (idx !== -1) {
                        next.splice(idx + 1, 0, assistantMessage);
                        return next;
                      }
                    }
                    return [...s, assistantMessage];
                  });
                  assistantMessageAdded = true;
                } else {
                  // 后续delta：更新最后一条assistant消息
                  updateLastMessage(assistantContent);
                }

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

    let chatIdToUse = activeChatId;

    // 如果启用了历史记录且当前没有activeChatId，立刻创建对话并跳转
    if (historyEnabled && !activeChatId) {
      setIsCreatingChat(true);
      const title = txt.slice(0, 8);
      const newChatId = await createNewChatSilent(title);
      setIsCreatingChat(false);
      
      if (!newChatId) {
        setChatError("创建对话失败，请重试");
        return;
      }
      
      // 将待发送的消息存储到sessionStorage
      try {
        sessionStorage.setItem(`chat_pending_${newChatId}`, JSON.stringify({
          text: txt,
          model: selectedModel,
          skipLoad: true
        }));
      } catch (err) {
        console.error('存储pending消息失败:', err);
      }
      
      // 立即跳转到新对话URL
      if (router) {
        router.push(`/c/${newChatId}`);
      }
      return;
    }

    handleStop();
    setIsLoading(true);
    setShowThinking(true);
    setChatError("");
    thinkingMsgIdRef.current = null;
    push("user", txt);
    setInp("");
    
    // 更新对话列表中的预览
    if (historyEnabled && chatIdToUse) {
      setChats((prev) => {
        const target = prev.find((chat) => chat.id === chatIdToUse);
        if (!target) return prev;
        const updatedChat = {
          ...target,
          preview: buildPreview(txt) || target.preview,
        };
        const others = prev.filter((chat) => chat.id !== chatIdToUse);
        return [updatedChat, ...others];
      });
    }

    try {
      // 构建消息历史
      const newMessages = [...msgs, { role: "user", content: txt }];
      // 过滤 UI 专用消息，仅传 user/assistant/tool，并保留必要的字段
      const apiMessages = newMessages
        .filter((m) => m.role === "user" || m.role === "assistant" || m.role === "tool")
        .map((msg) => {
          const apiMsg = { role: msg.role, content: msg.content };
          // tool 消息必须包含 tool_call_id（严格模型要求）
          if (msg.role === "tool" && msg.tool_call_id) {
            apiMsg.tool_call_id = msg.tool_call_id;
          }
          // assistant 消息如果有 tool_calls，需要包含
          if (msg.role === "assistant" && msg.tool_calls) {
            apiMsg.tool_calls = msg.tool_calls;
          }
          return apiMsg;
        });

      await sendMessage(apiMessages, selectedModel, chatIdToUse);
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
    const getSelectedModelLabel = () => {
      if (isLoadingModels) return "加载中...";
      if (models.length === 0) return "无可用模型";
      if (!selectedModel) return "选择模型";
      const model = models.find((m) => m.model === selectedModel);
      return model ? `${model.name}${model.supports_thinking ? " · Reasoning" : ""}` : "选择模型";
    };

    const actionHandler = historyEnabled ? handleCreateChat : clear;
    const actionDisabled = historyEnabled ? isCreatingChat : isLoading;
    const actionLabel = historyEnabled
      ? isCreatingChat
        ? "创建中..."
        : "新对话"
      : "清空";

    return (
      <header className="fixed top-16 z-50 bg-white left-0 right-0 lg:left-[var(--sidebar-width)]" style={{ '--sidebar-width': historyEnabled ? `${sidebarWidth}px` : '0px' }}>
        <div className="flex h-14 items-center justify-between px-4">
          {/* 移动端侧边栏切换按钮 */}
          {historyEnabled && (
            <button
              onClick={() => setIsSidebarOpen((prev) => !prev)}
              className="lg:hidden flex items-center justify-center rounded-lg border border-gray-200 p-2 text-gray-600 hover:bg-gray-50 mr-2"
              title={isSidebarOpen ? "收起侧边栏" : "展开侧边栏"}
            >
              {isSidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
            </button>
          )}
          <div className="flex items-center">
            <div className="relative inline-block text-left model-selector-container">
              <button
                onClick={() => setModelSelectorOpen(!modelSelectorOpen)}
                disabled={isLoading || isLoadingModels || models.length === 0}
                className="flex items-center justify-start gap-2 bg-transparent text-gray-900 rounded-xl px-3 py-1.5 hover:bg-gray-100 transition disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap"
              >
                <span className="font-semibold text-sm text-gray-900">{getSelectedModelLabel()}</span>
                <ChevronDown
                  className={`h-3.5 w-3.5 flex-shrink-0 transition-transform ${
                    modelSelectorOpen ? "rotate-180" : "rotate-0"
                  }`}
                />
              </button>

              <AnimatePresence>
                {modelSelectorOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.15 }}
                    className="absolute z-10 mt-2 min-w-full rounded-xl bg-white border border-gray-200 shadow-lg backdrop-blur-md overflow-hidden whitespace-nowrap"
                  >
                    {models.map((m) => {
                      const modelLabel = `${m.name}${m.supports_thinking ? " · Reasoning" : ""}`;
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
          <button
            onClick={actionHandler}
            className="rounded-xl border border-gray-200 bg-white p-2 text-gray-700 hover:bg-gray-50 disabled:opacity-60 flex items-center justify-center flex-shrink-0"
            disabled={actionDisabled}
            title={actionLabel}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0" aria-hidden="true">
              <path d="M2.6687 11.333V8.66699C2.6687 7.74455 2.66841 7.01205 2.71655 6.42285C2.76533 5.82612 2.86699 5.31731 3.10425 4.85156L3.25854 4.57617C3.64272 3.94975 4.19392 3.43995 4.85229 3.10449L5.02905 3.02149C5.44666 2.84233 5.90133 2.75849 6.42358 2.71582C7.01272 2.66769 7.74445 2.66797 8.66675 2.66797H9.16675C9.53393 2.66797 9.83165 2.96586 9.83179 3.33301C9.83179 3.70028 9.53402 3.99805 9.16675 3.99805H8.66675C7.7226 3.99805 7.05438 3.99834 6.53198 4.04102C6.14611 4.07254 5.87277 4.12568 5.65601 4.20313L5.45581 4.28906C5.01645 4.51293 4.64872 4.85345 4.39233 5.27149L4.28979 5.45508C4.16388 5.7022 4.08381 6.01663 4.04175 6.53125C3.99906 7.05373 3.99878 7.7226 3.99878 8.66699V11.333C3.99878 12.2774 3.99906 12.9463 4.04175 13.4688C4.08381 13.9833 4.16389 14.2978 4.28979 14.5449L4.39233 14.7285C4.64871 15.1465 5.01648 15.4871 5.45581 15.7109L5.65601 15.7969C5.87276 15.8743 6.14614 15.9265 6.53198 15.958C7.05439 16.0007 7.72256 16.002 8.66675 16.002H11.3337C12.2779 16.002 12.9461 16.0007 13.4685 15.958C13.9829 15.916 14.2976 15.8367 14.5447 15.7109L14.7292 15.6074C15.147 15.3511 15.4879 14.9841 15.7117 14.5449L15.7976 14.3447C15.8751 14.128 15.9272 13.8546 15.9587 13.4688C16.0014 12.9463 16.0017 12.2774 16.0017 11.333V10.833C16.0018 10.466 16.2997 10.1681 16.6667 10.168C17.0339 10.168 17.3316 10.4659 17.3318 10.833V11.333C17.3318 12.2555 17.3331 12.9879 17.2849 13.5771C17.2422 14.0993 17.1584 14.5541 16.9792 14.9717L16.8962 15.1484C16.5609 15.8066 16.0507 16.3571 15.4246 16.7412L15.1492 16.8955C14.6833 17.1329 14.1739 17.2354 13.5769 17.2842C12.9878 17.3323 12.256 17.332 11.3337 17.332H8.66675C7.74446 17.332 7.01271 17.3323 6.42358 17.2842C5.90135 17.2415 5.44665 17.1577 5.02905 16.9785L4.85229 16.8955C4.19396 16.5601 3.64271 16.0502 3.25854 15.4238L3.10425 15.1484C2.86697 14.6827 2.76534 14.1739 2.71655 13.5771C2.66841 12.9879 2.6687 12.2555 2.6687 11.333ZM13.4646 3.11328C14.4201 2.334 15.8288 2.38969 16.7195 3.28027L16.8865 3.46485C17.6141 4.35685 17.6143 5.64423 16.8865 6.53613L16.7195 6.7207L11.6726 11.7686C11.1373 12.3039 10.4624 12.6746 9.72827 12.8408L9.41089 12.8994L7.59351 13.1582C7.38637 13.1877 7.17701 13.1187 7.02905 12.9707C6.88112 12.8227 6.81199 12.6134 6.84155 12.4063L7.10132 10.5898L7.15991 10.2715C7.3262 9.53749 7.69692 8.86241 8.23218 8.32715L13.2791 3.28027L13.4646 3.11328ZM15.7791 4.2207C15.3753 3.81702 14.7366 3.79124 14.3035 4.14453L14.2195 4.2207L9.17261 9.26856C8.81541 9.62578 8.56774 10.0756 8.45679 10.5654L8.41772 10.7773L8.28296 11.7158L9.22241 11.582L9.43433 11.543C9.92426 11.432 10.3749 11.1844 10.7322 10.8271L15.7791 5.78027L15.8552 5.69629C16.185 5.29194 16.1852 4.708 15.8552 4.30371L15.7791 4.2207Z"></path>
            </svg>
          </button>
        </div>
        {modelError && (
          <div className="px-4 pb-2 text-xs text-red-500">
            {modelError}
          </div>
        )}
      </header>
    );
  }, [
    selectedModel,
    isLoading,
    isLoadingModels,
    models,
    selectedModelMeta,
    modelError,
    modelSelectorOpen,
    historyEnabled,
    sidebarWidth,
    handleCreateChat,
    isCreatingChat,
    clear,
  ]);

  const inputPlaceholder = "继续提问…";
  const shouldShowPlaceholder = !conversationReady;
  const shouldShowHero = conversationReady && first;
  const shouldShowChat = conversationReady && !first;
  
  // 根据是否显示输入框动态调整底部padding，让滚动条延伸到底部但内容不被遮挡
  const mainPaddingBottom = shouldShowChat ? "pb-[120px]" : "pb-4";

  return (
    <div className="relative flex h-screen bg-white text-gray-900 overflow-hidden">
      {historyEnabled && (
        <>
          {/* 移动端遮罩层 */}
          <AnimatePresence>
            {isSidebarOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={() => setIsSidebarOpen(false)}
                className="fixed top-[120px] left-0 right-0 bottom-0 z-[60] bg-black/20 backdrop-blur-sm lg:hidden"
              />
            )}
          </AnimatePresence>

          {/* 侧边栏 */}
          <motion.aside
            animate={{ 
              width: isSidebarOpen ? SIDEBAR_EXPANDED_WIDTH : SIDEBAR_COLLAPSED_WIDTH
            }}
            initial={false}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className={cx(
              "flex h-full flex-col border-r border-gray-100",
              "bg-gray-50 lg:bg-gray-50/70 lg:backdrop-blur",
              "lg:relative",
              "fixed left-0 top-[120px] lg:top-0 transition-transform duration-300",
              "h-[calc(100vh-120px)] lg:h-full",
              isSidebarOpen ? "translate-x-0 z-[70] lg:z-20" : "-translate-x-full lg:translate-x-0 z-20"
            )}
          >
          <div className={cx(
            "flex items-center gap-2",
            "pt-6 lg:pt-20",
            isSidebarOpen ? "justify-between px-4" : "justify-center px-2"
          )}>
            {isSidebarOpen ? (
              <>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <img 
                    src="/logo.png" 
                    alt={SHOP_NAME} 
                    className="h-10 w-10 rounded-full object-cover flex-shrink-0 border-2 border-gray-200 shadow-sm"
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900 truncate">{SHOP_NAME}</div>
                    <div className="text-xs text-gray-500">AI Assistant</div>
                  </div>
                </div>
                {/* 桌面端折叠按钮 */}
                <button
                  onClick={() => setIsSidebarOpen((prev) => !prev)}
                  className="hidden lg:flex items-center justify-center rounded-lg border border-gray-200 p-2 text-gray-600 hover:bg-white flex-shrink-0 w-9 h-9"
                  title="收起侧边栏"
                >
                  <PanelLeftClose className="h-4 w-4" />
                </button>
              </>
            ) : (
              <button
                onClick={() => setIsSidebarOpen((prev) => !prev)}
                className="hidden lg:flex items-center justify-center rounded-lg border border-gray-200 p-2 text-gray-600 hover:bg-white w-9 h-9"
                title="展开侧边栏"
              >
                <PanelLeft className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="mt-4 flex items-center justify-between px-4 text-xs font-semibold uppercase tracking-wide text-gray-500">
            {isSidebarOpen && <span>Chats</span>}
          </div>
          <div className={cx(
            "mt-2 flex-1 overflow-y-auto px-2 pb-4",
            !isSidebarOpen && "[&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
          )}>
            {isSidebarOpen && (
              <>
                {isLoadingChats ? (
                  <div className="flex h-full items-center justify-center text-xs text-gray-500">
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    正在加载
                  </div>
                ) : chats.length === 0 ? (
                  <div className="mt-8 px-2 text-center text-xs text-gray-500">
                    还没有聊天，点击上方按钮开始
                  </div>
                ) : (
                  <div className="space-y-2">
                    {chats.map((chat) => {
                      const isActive = chat.id === activeChatId;
                      const displayName = getDisplayTitle(chat);
                      return (
                        <button
                          key={chat.id}
                          onClick={() => handleChatSelect(chat.id)}
                          className={cx(
                            "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left transition",
                            isActive ? "bg-white shadow-sm" : "hover:bg-white/70"
                          )}
                        >
                          <div className="flex-1 min-w-0">
                            {renamingChatId === chat.id ? (
                              <input
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                onBlur={submitRename}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") submitRename();
                                  if (e.key === "Escape") cancelRename();
                                }}
                                autoFocus
                                className="w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-sm text-gray-900 outline-none focus:border-gray-400"
                              />
                            ) : (
                              <>
                                <p className="text-sm font-medium text-gray-900">
                                  {displayName}
                                </p>
                                <p className="text-xs text-gray-400">
                                  {formatRelativeTime(chat.updated_at)}
                                </p>
                              </>
                            )}
                          </div>
                          {renamingChatId !== chat.id && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                startRenaming(chat);
                              }}
                              className="text-gray-400 hover:text-gray-700"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
          <div className="border-t border-gray-100 p-4 mb-[120px] lg:mb-0">
            <div className={cx(
              "flex items-center gap-2",
              !isSidebarOpen && "justify-center"
            )}>
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gray-200 text-gray-600">
                <User2 className="h-4 w-4" />
              </div>
              {isSidebarOpen && (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-900">{user?.name || "未登录"}</p>
                  {user?.id && <p className="truncate text-xs text-gray-500">{user.id}</p>}
                </div>
              )}
            </div>
          </div>
        </motion.aside>
        </>
      )}
      <div className="relative flex flex-1 flex-col">
        {Header}
        <main ref={containerRef} className={cx("absolute left-0 right-0 top-[120px] bottom-0 overflow-y-auto z-40", mainPaddingBottom)}>
          <div className="mx-auto w-full max-w-4xl px-4 pt-4">
            {chatError && (
              <div className="mb-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600">
                {chatError}
              </div>
            )}
            {historyEnabled && isLoadingHistory && conversationReady && first && (
              <div className="mb-4 flex items-center gap-2 text-xs text-gray-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                正在同步历史...
              </div>
            )}
            {shouldShowPlaceholder && (
              <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
                <p className="text-base font-semibold text-gray-900">请选择一个聊天</p>
                <p className="text-sm text-gray-500">点击侧边栏的历史记录或创建一个新的对话即可开始。</p>
                <button
                  onClick={handleCreateChat}
                  disabled={isCreatingChat}
                  className="rounded-full border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                >
                  {isCreatingChat ? "创建中..." : "创建新对话"}
                </button>
              </div>
            )}
            {shouldShowHero && (
              <section className="flex min-h-[calc(100vh-220px)] flex-col items-center justify-center gap-8 text-center">
                <div className="text-3xl font-semibold text-gray-900 h-12 flex items-center justify-center">{welcomeTextComponent}</div>
                <div className="w-full max-w-2xl px-4">
                  <InputBar
                    value={inp}
                    onChange={setInp}
                    onSend={handleSend}
                    onStop={handleStop}
                    placeholder="问我任何问题…"
                    autoFocus
                    isLoading={isLoading}
                  />
                </div>
              </section>
            )}
            {shouldShowChat && (
              <div className="mx-auto flex max-w-3xl flex-col gap-4">
                {msgs.map((m) => {
                  if (m.role === "assistant") {
                    if ((!m.content || m.content === null) && m.tool_calls) {
                      return null;
                    }
                    return <MarkdownRenderer key={m.id} content={m.content} />;
                  } else if (m.role === "assistant_thinking") {
                    return (
                      <ThinkingBubble
                        key={m.id}
                        content={m.content}
                        isComplete={m.isComplete}
                        isStopped={m.isStopped}
                      />
                    );
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
                    return (
                      <Bubble key={m.id} role={m.role}>
                        {m.content}
                      </Bubble>
                    );
                  } else if (m.role === "error") {
                    return <ErrorBubble key={m.id} message={m.content} />;
                  }
                  return null;
                })}
                {showThinking && <LoadingIndicator />}
                <div ref={endRef} />
              </div>
            )}
          </div>
        </main>
        {shouldShowChat && (
          <div
            className="fixed bottom-0 z-50"
            style={
              historyEnabled
                ? { left: sidebarWidth, right: 0 }
                : { left: 0, right: 0 }
            }
          >
            <div className="mx-auto max-w-4xl px-4 pb-4 bg-white/95 backdrop-blur-sm">
              <InputBar
                value={inp}
                onChange={setInp}
                onSend={handleSend}
                onStop={handleStop}
                placeholder={inputPlaceholder}
                isLoading={isLoading}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
