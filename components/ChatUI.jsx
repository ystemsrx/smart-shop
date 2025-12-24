import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { getApiBaseUrl, getShopName, getHeaderLogo } from "../utils/runtimeConfig";
import TextType from './TextType';
import { ChevronDown, Check, Pencil, Plus, User2, Loader2, PanelLeftClose, PanelLeft, Sparkles, Terminal, ChevronRight, Play, CheckCircle2, XCircle, Search, ShoppingCart, List, Package, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { updateDomSmartly } from './dom_utils';

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
const HEADER_LOGO = getHeaderLogo();
const SIDEBAR_EXPANDED_WIDTH = 240;
const SIDEBAR_COLLAPSED_WIDTH = 64;
const buildPreview = (text = "") =>
  text.trim().replace(/\s+/g, " ").slice(0, 8);
const MODEL_STORAGE_KEY = "ai_selected_model";
const getStoredModelSelection = () => {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(MODEL_STORAGE_KEY) || "";
  } catch {
    return "";
  }
};
const persistModelSelection = (value) => {
  if (typeof window === "undefined") return;
  try {
    if (value) {
      localStorage.setItem(MODEL_STORAGE_KEY, value);
    } else {
      localStorage.removeItem(MODEL_STORAGE_KEY);
    }
  } catch {
    // 忽略持久化失败
  }
};

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
  COPY: `<svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" class="icon-xs"><path d="M12.668 10.667C12.668 9.95614 12.668 9.46258 12.6367 9.0791C12.6137 8.79732 12.5758 8.60761 12.5244 8.46387L12.4688 8.33399C12.3148 8.03193 12.0803 7.77885 11.793 7.60254L11.666 7.53125C11.508 7.45087 11.2963 7.39395 10.9209 7.36328C10.5374 7.33197 10.0439 7.33203 9.33301 7.33203H6.5C5.78896 7.33203 5.29563 7.33195 4.91211 7.36328C4.63016 7.38632 4.44065 7.42413 4.29688 7.47559L4.16699 7.53125C3.86488 7.68518 3.61186 7.9196 3.43555 8.20703L3.36524 8.33399C3.28478 8.49198 3.22795 8.70352 3.19727 9.0791C3.16595 9.46259 3.16504 9.95611 3.16504 10.667V13.5C3.16504 14.211 3.16593 14.7044 3.19727 15.0879C3.22797 15.4636 3.28473 15.675 3.36524 15.833L3.43555 15.959C3.61186 16.2466 3.86474 16.4807 4.16699 16.6348L4.29688 16.6914C4.44063 16.7428 4.63025 16.7797 4.91211 16.8027C5.29563 16.8341 5.78896 16.835 6.5 16.835H9.33301C10.0439 16.835 10.5374 16.8341 10.9209 16.8027C11.2965 16.772 11.508 16.7152 11.666 16.6348L11.793 16.5645C12.0804 16.3881 12.3148 16.1351 12.4688 15.833L12.5244 15.7031C12.5759 15.5594 12.6137 15.3698 12.6367 15.0879C12.6681 14.7044 12.668 14.211 12.668 13.5V10.667ZM13.998 12.665C14.4528 12.6634 14.8011 12.6602 15.0879 12.6367C15.4635 12.606 15.675 12.5492 15.833 12.4688L15.959 12.3975C16.2466 12.2211 16.4808 11.9682 16.6348 11.666L16.6914 11.5361C16.7428 11.3924 16.7797 11.2026 16.8027 10.9209C16.8341 10.5374 16.835 10.0439 16.835 9.33301V6.5C16.835 5.78896 16.8341 5.29563 16.8027 4.91211C16.7797 4.63025 16.7428 4.44063 16.6914 4.29688L16.6348 4.16699C16.4807 3.86474 16.2466 3.61186 15.959 3.43555L15.833 3.36524C15.675 3.28473 15.4636 3.22797 15.0879 3.19727C14.7044 3.16593 14.211 3.16504 13.5 3.16504H10.667C9.9561 3.16504 9.46259 3.16595 9.0791 3.19727C8.79739 3.22028 8.6076 3.2572 8.46387 3.30859L8.33399 3.36524C8.03176 3.51923 7.77886 3.75343 7.60254 4.04102L7.53125 4.16699C7.4508 4.32498 7.39397 4.53655 7.36328 4.91211C7.33985 5.19893 7.33562 5.54719 7.33399 6.00195H9.33301C10.022 6.00195 10.5791 6.00131 11.0293 6.03809C11.4873 6.07551 11.8937 6.15471 12.2705 6.34668L12.4883 6.46875C12.984 6.7728 13.3878 7.20854 13.6533 7.72949L13.7197 7.87207C13.8642 8.20859 13.9292 8.56974 13.9619 8.9707C13.9987 9.42092 13.998 9.97799 13.998 10.667V12.665ZM18.165 9.33301C18.165 10.022 18.1657 10.5791 18.1289 11.0293C18.0961 11.4302 18.0311 11.7914 17.8867 12.1279L17.8203 12.2705C17.5549 12.7914 17.1509 13.2272 16.6553 13.5313L16.4365 13.6533C16.0599 13.8452 15.6541 13.9245 15.1963 13.9619C14.8593 13.9895 14.4624 13.9935 13.9951 13.9951C13.9935 14.4624 13.9895 14.8593 13.9619 15.1963C13.9292 15.597 13.864 15.9576 13.7197 16.2939L13.6533 16.4365C13.3878 16.9576 12.9841 17.3941 12.4883 17.6982L12.2705 17.8203C11.8937 18.0123 11.4873 18.0915 11.0293 18.1289C10.5791 18.1657 10.022 18.165 9.33301 18.165H6.5C5.81091 18.165 5.25395 18.1657 4.80371 18.1289C4.40306 18.0962 4.04235 18.031 3.70606 17.8867L3.56348 17.8203C3.04244 17.5548 2.60585 17.151 2.30176 16.6553L2.17969 16.4365C1.98788 16.0599 1.90851 15.6541 1.87109 15.1963C1.83431 14.746 1.83496 14.1891 1.83496 13.5V10.667C1.83496 9.978 1.83432 9.42091 1.87109 8.9707C1.90851 8.5127 1.98772 8.10625 2.17969 7.72949L2.30176 7.51172C2.60586 7.0159 3.04236 6.6122 3.56348 6.34668L3.70606 6.28027C4.04237 6.136 4.40303 6.07083 4.80371 6.03809C5.14051 6.01057 5.53708 6.00551 6.00391 6.00391C6.00551 5.53708 6.01057 5.14051 6.03809 4.80371C6.0755 4.34588 6.15483 3.94012 6.34668 3.56348L6.46875 3.34473C6.77282 2.84912 7.20856 2.44514 7.72949 2.17969L7.87207 2.11328C8.20855 1.96886 8.56979 1.90385 8.9707 1.87109C9.42091 1.83432 9.978 1.83496 10.667 1.83496H13.5C14.1891 1.83496 14.746 1.83431 15.1963 1.87109C15.6541 1.90851 16.0599 1.98788 16.4365 2.17969L16.6553 2.30176C17.151 2.60585 17.5548 3.04244 17.8203 3.56348L17.8867 3.70606C18.031 4.04235 18.0962 4.40306 18.1289 4.80371C18.1657 5.25395 18.165 5.81091 18.165 6.5V9.33301Z"></path></svg><span>Copy</span>`,
  COPIED: `<svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" class="icon-xs"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg><span>Copied!</span>`,
  PREVIEW_ON: `<svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" class="icon-xs"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/><path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd"/></svg><span>预览</span>`,
  PREVIEW_OFF: `<svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" class="icon-xs"><path fill-rule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clip-rule="evenodd"/><path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z"/></svg><span>代码</span>`,
  RUN_ON: `<svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" class="icon-xs"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"/></svg><span>运行</span>`,
  RUN_OFF: `<svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" class="icon-xs"><path fill-rule="evenodd" d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z" clip-rule="evenodd"/></svg><span>源码</span>`,
};

// Transform synchronous confirm/prompt/alert code patterns to async/await
// This function transforms JavaScript code so that confirm(), prompt() and alert() work correctly
// by making functions async and adding await before these calls
const transformSyncDialogsToAsync = (htmlContent) => {
  if (!htmlContent) return htmlContent;
  
  // Check if the code contains confirm, prompt or alert calls that need transformation
  if (!/\b(confirm|prompt|alert)\s*\(/.test(htmlContent)) {
    return htmlContent;
  }
  
  let result = htmlContent;
  
  // Transform inline onclick handlers: onclick="functionName()" -> onclick="(async()=>{await functionName()})()"
  // This ensures async functions called from onclick are properly awaited
  result = result.replace(
    /onclick\s*=\s*"([^"]+)"/gi,
    (match, handler) => {
      // If the handler already contains await or async, leave it alone
      if (/\bawait\b|\basync\b/.test(handler)) return match;
      // Wrap the handler in an async IIFE and await any function call
      // Add await before the function call if it looks like a function invocation
      let awaitedHandler = handler.trim();
      // If it's a simple function call like "functionName()" or "functionName(args)"
      if (/^\w+\s*\([^)]*\)\s*;?\s*$/.test(awaitedHandler)) {
        awaitedHandler = 'await ' + awaitedHandler;
      }
      return `onclick="(async()=>{${awaitedHandler}})()"`;
    }
  );
  result = result.replace(
    /onclick\s*=\s*'([^']+)'/gi,
    (match, handler) => {
      if (/\bawait\b|\basync\b/.test(handler)) return match;
      let awaitedHandler = handler.trim();
      if (/^\w+\s*\([^)]*\)\s*;?\s*$/.test(awaitedHandler)) {
        awaitedHandler = 'await ' + awaitedHandler;
      }
      return `onclick="(async()=>{${awaitedHandler}})()"`;
    }
  );
  
  // Transform script content: function declarations and confirm/prompt/alert calls
  result = result.replace(
    /(<script[^>]*>)([\s\S]*?)(<\/script>)/gi,
    (match, openTag, scriptContent, closeTag) => {
      if (!scriptContent.trim()) return match;
      
      let transformed = scriptContent;
      
      // Transform function declarations to async
      // Pattern: function name(...) { ... }
      transformed = transformed.replace(
        /function\s+(\w+)\s*\(([^)]*)\)\s*\{/g,
        (funcMatch, funcName, params) => {
          return `async function ${funcName}(${params}) {`;
        }
      );
      
      // Transform arrow functions assigned to variables
      // const/let/var name = (...) => { ... } -> const/let/var name = async (...) => { ... }
      transformed = transformed.replace(
        /(const|let|var)\s+(\w+)\s*=\s*(\([^)]*\)|[a-zA-Z_$][a-zA-Z0-9_$]*)\s*=>\s*\{/g,
        (arrowMatch, keyword, name, params) => {
          return `${keyword} ${name} = async ${params} => {`;
        }
      );
      
      // Transform arrow function callbacks in setTimeout, setInterval, etc.
      // setTimeout(() => { -> setTimeout(async () => {
      // setTimeout(function() { -> setTimeout(async function() {
      transformed = transformed.replace(
        /(setTimeout|setInterval|requestAnimationFrame)\s*\(\s*\(\s*\)\s*=>\s*\{/g,
        '$1(async () => {'
      );
      transformed = transformed.replace(
        /(setTimeout|setInterval|requestAnimationFrame)\s*\(\s*\(([^)]*)\)\s*=>\s*\{/g,
        '$1(async ($2) => {'
      );
      transformed = transformed.replace(
        /(setTimeout|setInterval|requestAnimationFrame)\s*\(\s*function\s*\(\s*\)\s*\{/g,
        '$1(async function() {'
      );
      transformed = transformed.replace(
        /(setTimeout|setInterval|requestAnimationFrame)\s*\(\s*function\s*\(([^)]*)\)\s*\{/g,
        '$1(async function($2) {'
      );
      
      // Transform .then() callbacks
      // .then(() => { -> .then(async () => {
      transformed = transformed.replace(
        /\.then\s*\(\s*\(\s*\)\s*=>\s*\{/g,
        '.then(async () => {'
      );
      transformed = transformed.replace(
        /\.then\s*\(\s*\(([^)]*)\)\s*=>\s*\{/g,
        '.then(async ($1) => {'
      );
      transformed = transformed.replace(
        /\.then\s*\(\s*function\s*\(\s*\)\s*\{/g,
        '.then(async function() {'
      );
      transformed = transformed.replace(
        /\.then\s*\(\s*function\s*\(([^)]*)\)\s*\{/g,
        '.then(async function($1) {'
      );
      
      // Add await before alert(), confirm() and prompt() calls
      // Match patterns like: = alert( or var x = confirm( or (prompt(
      // But not: window.alert = or function alert or .alert( or await alert
      transformed = transformed.replace(
        /([=\s(,!;])(?!await\s)(alert|confirm|prompt)\s*\(/g,
        '$1await $2('
      );
      
      // Handle cases at the start of a statement (beginning of line)
      transformed = transformed.replace(
        /^(\s*)(?!await\s)(alert|confirm|prompt)\s*\(/gm,
        '$1await $2('
      );
      
      // Handle if(confirm(...)) or if(prompt(...)) pattern
      transformed = transformed.replace(
        /if\s*\(\s*(?!await\s)(confirm|prompt)\s*\(/g,
        'if (await $1('
      );
      
      // Handle negation: if(!confirm(...)) or if(!prompt(...))
      transformed = transformed.replace(
        /if\s*\(\s*!\s*(?!await\s)(confirm|prompt)\s*\(/g,
        'if (!await $1('
      );
      
      return openTag + transformed + closeTag;
    }
  );
  
  return result;
};

const CUSTOM_ALERT_HTML = `
<!-- Custom Dialog Implementation (Alert, Confirm, Prompt) -->
<style>
  /* Force Reset to prevent unwanted scrolling */
  html, body { margin: 0; padding: 0; }
  /* Host wrapper should not take up space */
  #custom-dialog-host { position: absolute; width: 0; height: 0; overflow: hidden; }
  #custom-dialog-host * { box-sizing: border-box; font-family: system-ui, -apple-system, sans-serif; }
  .custom-dialog-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 2147483647; opacity: 0; pointer-events: none; transition: opacity 0.2s; backdrop-filter: blur(2px); margin: 0; padding: 0; }
  .custom-dialog-overlay.show { opacity: 1; pointer-events: auto; }
  .custom-dialog-box { background: white; padding: 24px; border-radius: 12px; box-shadow: 0 20px 40px -10px rgba(0,0,0,0.15), 0 10px 20px -5px rgba(0,0,0,0.1); width: 300px; text-align: center; transform: scale(0.9) translateY(-10px); transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1); min-width: 0; }
  .custom-dialog-overlay.show .custom-dialog-box { transform: scale(1) translateY(0); }
  .custom-dialog-title { margin-bottom: 8px; font-size: 16px; font-weight: 600; color: #111827; }
  .custom-dialog-msg { margin-bottom: 20px; font-size: 14px; color: #4b5563; line-height: 1.5; word-break: break-word; white-space: pre-wrap; }
  .custom-dialog-input { width: 100%; padding: 10px 14px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; margin-bottom: 16px; outline: none; transition: border-color 0.2s, box-shadow 0.2s; }
  .custom-dialog-input:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15); }
  .custom-dialog-buttons { display: flex; gap: 10px; justify-content: center; }
  .custom-dialog-btn { flex: 1; padding: 10px 16px; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.2s; -webkit-appearance: none; border: none; }
  .custom-dialog-btn-primary { background: linear-gradient(135deg, #1f2937 0%, #374151 100%); color: white; }
  .custom-dialog-btn-primary:hover { background: linear-gradient(135deg, #111827 0%, #1f2937 100%); transform: translateY(-1px); }
  .custom-dialog-btn-primary:active { transform: translateY(0); }
  .custom-dialog-btn-secondary { background: #f3f4f6; color: #374151; border: 1px solid #e5e7eb; }
  .custom-dialog-btn-secondary:hover { background: #e5e7eb; }
  .custom-dialog-icon { width: 48px; height: 48px; margin: 0 auto 16px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
  .custom-dialog-icon-alert { background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); color: #d97706; }
  .custom-dialog-icon-confirm { background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%); color: #2563eb; }
  .custom-dialog-icon-prompt { background: linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%); color: #4f46e5; }
</style>
<div id="custom-dialog-host">
  <div id="custom-dialog" class="custom-dialog-overlay">
    <div class="custom-dialog-box">
      <div id="custom-dialog-icon" class="custom-dialog-icon custom-dialog-icon-alert">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
      </div>
      <div id="custom-dialog-title" class="custom-dialog-title"></div>
      <div id="custom-dialog-msg" class="custom-dialog-msg"></div>
      <input type="text" id="custom-dialog-input" class="custom-dialog-input" style="display: none;" />
      <div class="custom-dialog-buttons">
        <button id="custom-dialog-cancel" class="custom-dialog-btn custom-dialog-btn-secondary" style="display: none;">取消</button>
        <button id="custom-dialog-ok" class="custom-dialog-btn custom-dialog-btn-primary">确定</button>
      </div>
    </div>
  </div>
</div>
<script>
(function() {
  // Dialog queue system to prevent overlapping dialogs
  const dialogQueue = [];
  let isDialogOpen = false;
  let currentDialogResolve = null;
  let currentType = 'alert';
  
  const overlay = document.getElementById('custom-dialog');
  const iconEl = document.getElementById('custom-dialog-icon');
  const titleEl = document.getElementById('custom-dialog-title');
  const msgEl = document.getElementById('custom-dialog-msg');
  const inputEl = document.getElementById('custom-dialog-input');
  const okBtn = document.getElementById('custom-dialog-ok');
  const cancelBtn = document.getElementById('custom-dialog-cancel');
  
  const icons = {
    alert: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>',
    confirm: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
    prompt: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>'
  };
  
  function processQueue() {
    if (isDialogOpen || dialogQueue.length === 0) return;
    
    const { type, message, defaultValue, resolve } = dialogQueue.shift();
    isDialogOpen = true;
    currentDialogResolve = resolve;
    currentType = type;
    
    // Update icon
    iconEl.innerHTML = icons[type];
    iconEl.className = 'custom-dialog-icon custom-dialog-icon-' + type;
    
    // Update title
    const titles = { alert: '提示', confirm: '确认', prompt: '输入' };
    titleEl.textContent = titles[type];
    
    // Update message
    msgEl.textContent = String(message);
    
    // Handle input field
    if (type === 'prompt') {
      inputEl.style.display = 'block';
      inputEl.value = defaultValue !== undefined ? String(defaultValue) : '';
      setTimeout(() => inputEl.focus(), 100);
    } else {
      inputEl.style.display = 'none';
    }
    
    // Handle cancel button
    cancelBtn.style.display = (type === 'alert') ? 'none' : 'block';
    
    // Show dialog
    overlay.classList.add('show');
  }
  
  function queueDialog(type, message, defaultValue) {
    return new Promise((resolve) => {
      dialogQueue.push({ type, message, defaultValue, resolve });
      processQueue();
    });
  }
  
  function closeDialog(result) {
    overlay.classList.remove('show');
    isDialogOpen = false;
    
    if (currentDialogResolve) {
      currentDialogResolve(result);
      currentDialogResolve = null;
    }
    
    // Process next dialog in queue after a brief delay for animation
    setTimeout(processQueue, 250);
  }
  
  okBtn.addEventListener('click', function() {
    if (currentType === 'prompt') {
      closeDialog(inputEl.value);
    } else if (currentType === 'confirm') {
      closeDialog(true);
    } else {
      closeDialog(undefined);
    }
  });
  
  cancelBtn.addEventListener('click', function() {
    if (currentType === 'prompt') {
      closeDialog(null);
    } else {
      closeDialog(false);
    }
  });
  
  // Handle Enter key for prompt
  inputEl.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      okBtn.click();
    } else if (e.key === 'Escape') {
      cancelBtn.click();
    }
  });
  
  // Handle keyboard for confirm/alert
  document.addEventListener('keydown', function(e) {
    if (!overlay.classList.contains('show')) return;
    if (e.key === 'Escape' && currentType !== 'alert') {
      cancelBtn.click();
    } else if (e.key === 'Enter' && currentType !== 'prompt') {
      okBtn.click();
    }
  });
  
  // Override native dialogs with queue-aware implementations
  // All dialogs go through the queue to prevent overlap
  
  window.alert = function(msg) {
    // Return a promise so that await alert() properly waits
    return queueDialog('alert', msg);
  };
  
  window.confirm = function(msg) {
    // Return a promise that will resolve with the user's choice
    return queueDialog('confirm', msg);
  };
  
  window.prompt = function(msg, defaultValue) {
    // Return a promise that will resolve with the user's input or null
    return queueDialog('prompt', msg, defaultValue);
  };
})();
</script>

<!-- Error Display Implementation -->
<style>
  .preview-error-box {
    position: fixed;
    bottom: 10px;
    left: 10px;
    background: rgba(220, 38, 38, 0.9);
    color: white;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 12px;
    font-family: system-ui, -apple-system, sans-serif;
    max-width: 80%;
    z-index: 2147483647;
    pointer-events: none;
    display: none;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    white-space: pre-wrap;
    word-break: break-word;
  }
  .preview-error-box.show {
    display: block;
    animation: slideIn 0.3s ease-out;
  }
  @keyframes slideIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
<div id="preview-error-box" class="preview-error-box"></div>
<script>
  (function() {
    const errorBox = document.getElementById('preview-error-box');
    let errorTimer;

    function showError(msg) {
      if (!errorBox) return;
      errorBox.textContent = msg;
      errorBox.classList.add('show');
      
      // Auto hide after 8 seconds
      clearTimeout(errorTimer);
      errorTimer = setTimeout(() => {
        errorBox.classList.remove('show');
      }, 8000);
    }

    // Capture console.error
    const originalConsoleError = console.error;
    console.error = function(...args) {
      originalConsoleError.apply(console, args);
      const msg = args.map(arg => {
        if (arg instanceof Error) return arg.message;
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg);
          } catch(e) {
            return String(arg);
          }
        }
        return String(arg);
      }).join(' ');
      showError(msg);
    };

    // Capture unhandled errors
    window.addEventListener('error', function(event) {
      showError(event.message || 'Unknown Error');
    });

    // Capture unhandled promise rejections
    window.addEventListener('unhandledrejection', function(event) {
      showError('Unhandled Rejection: ' + (event.reason?.message || event.reason || 'Unknown'));
    });
  })();
</script>
`;

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

// 检测是否为桌面端（宽度 > 640px）
const isDesktopViewport = () => typeof window !== 'undefined' && window.innerWidth > 640;

// 桌面端自动缩放公式的辅助函数
const autoScaleMathFormula = (body) => {
  if (!body || !isDesktopViewport()) return;
  
  const katexHtml = body.querySelector('.katex-html');
  if (!katexHtml) return;
  
  // 重置之前的缩放
  katexHtml.style.transform = '';
  katexHtml.style.transformOrigin = '';
  
  // 等待一帧让浏览器计算布局
  requestAnimationFrame(() => {
    const containerWidth = body.offsetWidth;
    const formulaWidth = katexHtml.scrollWidth;
    
    if (formulaWidth > containerWidth && containerWidth > 0) {
      // 计算缩放比例，最小不低于0.5
      const scale = Math.max(0.5, containerWidth / formulaWidth);
      katexHtml.style.transform = `scale(${scale})`;
      katexHtml.style.transformOrigin = 'center center';
      // 调整容器高度以适应缩放后的公式
      const katexDisplay = body.querySelector('.katex-display');
      if (katexDisplay) {
        katexDisplay.style.marginTop = '0.5em';
        katexDisplay.style.marginBottom = '0.5em';
      }
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
        // 【标记渲染成功,CSS会移除最小高度限制】
        placeholder.setAttribute('data-render-success', 'true');
      }
    } else if (cacheEntry?.html) {
      htmlToUse = cacheEntry.html;
      placeholder.setAttribute('data-render-success', 'true');
    }

    const body = ensureBody(placeholder);

    if (htmlToUse) {
      if (body.innerHTML !== htmlToUse) {
        body.innerHTML = htmlToUse;
        // 桌面端自动缩放公式
        autoScaleMathFormula(body);
      }
    } else {
      body.textContent = segment.raw || '';
    }
  });
};

const STREAM_FADE_DURATION = 600;

// Markdown渲染器组件 - 带高度缓冲的包裹层
const MarkdownRendererWrapper = ({ content, isStreaming }) => {
  const wrapperRef = useRef(null);
  const maxHeightRef = useRef(0);
  
  // 为整个 Markdown 渲染器添加外层高度缓冲
  useEffect(() => {
    if (!wrapperRef.current) return;
    
    const timeoutId = setTimeout(() => {
      if (!wrapperRef.current) return;
      
      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const currentHeight = entry.contentRect.height;
          
          if (currentHeight > 10 && currentHeight > maxHeightRef.current) {
            maxHeightRef.current = currentHeight;
            const bufferHeight = Math.floor(currentHeight * 0.97); // 3%缓冲区
            wrapperRef.current.style.minHeight = `${bufferHeight}px`;
          }
        }
      });
      
      if (wrapperRef.current) {
        resizeObserver.observe(wrapperRef.current);
      }
      
      return () => {
        resizeObserver.disconnect();
      };
    }, 80);
    
    return () => {
      clearTimeout(timeoutId);
    };
  }, [content]);
  
  return (
    <div 
      ref={wrapperRef}
      style={{
        transition: 'min-height 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        willChange: 'min-height',
        contain: 'layout'
      }}
    >
      <MarkdownRenderer content={content} isStreaming={isStreaming} />
    </div>
  );
};

const ICON_MAPPING = {
  'js': 'javascript',
  'javascript': 'javascript',
  'jsx': 'javascript-react',
  'ts': 'typescript',
  'typescript': 'typescript',
  'tsx': 'typescript-react',
  'py': 'python',
  'python': 'python', 
  'java': 'java',
  'c': 'c',
  'cpp': 'cpp',
  'c++': 'cpp',
  'cs': 'csharp',
  'csharp': 'csharp',
  'c#': 'csharp',
  'go': 'go',
  'rust': 'rust',
  'php': 'php',
  'ruby': 'ruby',
  'swift': 'swift',
  'kotlin': 'kotlin',
  'dart': 'dart',
  'r': 'r',
  'lua': 'lua',
  'perl': 'perl',
  'sql': 'sql',
  'html': 'html',
  'css': 'css',
  'scss': 'sass',
  'sass': 'sass',
  'less': 'css',
  'json': 'json',
  'yaml': 'yaml',
  'yml': 'yaml',
  'xml': 'xml',
  'md': 'markdown',
  'markdown': 'markdown',
  'sh': 'shell',
  'bash': 'shell', 
  'zsh': 'shell',
  'shell': 'shell',
  'dockerfile': 'docker',
  'docker': 'docker', 
  'mermaid': 'mermaid',
  'svg': 'svg',
  'vue': 'vue',
  'svelte': 'svelte', // Not in list but good to have mapping if added
  'angular': 'angular',
  'react': 'javascript-react',
  'vb': 'vbnet',
  'vbnet': 'vbnet',
  'matlab': 'matlab',
  'assembly': 'assembly',
  'asm': 'assembly',
  'clojure': 'clojure',
  'cobol': 'cobol',
  'crystal': 'crystal',
  'd': 'dlang',
  'elixir': 'elixir',
  'erlang': 'erlang',
  'fortran': 'fortran',
  'groovy': 'groovy',
  'haskell': 'haskell', 
  'hs': 'haskell',
  'julia': 'julia',
  'lisp': 'lisp',
  'nim': 'nim',
  'objc': 'objectivec',
  'objectivec': 'objectivec',
  'ocaml': 'ocaml',
  'prolog': 'prolog',
  'solidity': 'solidity',
  'sol': 'solidity',
  'terraform': 'terraform',
  'tf': 'terraform',
};

// Markdown渲染器组件（内部实现）
const MarkdownRenderer = ({ content, isStreaming = false }) => {
  const containerRef = useRef(null);
  const lastTextLengthRef = useRef(0);
  const chunkMetaRef = useRef([]);
  const blockMathCacheRef = useRef(new Map());
  const inlineMathCacheRef = useRef(new Map());
  const iconLoadCacheRef = useRef(new Set());
  
  // Keep track of streaming state in a ref for async access
  const isStreamingRef = useRef(isStreaming);
  useEffect(() => {
    isStreamingRef.current = isStreaming;
  }, [isStreaming]);

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
  // 缓存每个Mermaid、SVG和HTML代码块最近一次成功渲染的快照，避免失效片段导致闪烁
  const mermaidSnapshotRef = useRef(new Map()); // key: mermaid块序号, value: svg string
  const svgSnapshotRef = useRef(new Map()); // key: svg块序号, value: svg string
  const htmlSnapshotRef = useRef(new Map()); // key: html块序号, value: html string

  const togglePreviewMode = useCallback((blockKey, forcedMode) => {
    if (!blockKey || !containerRef.current) return;
    const blockContainer = containerRef.current.querySelector(`.code-block-container[data-block-key="${blockKey}"]`);
    if (!blockContainer) return;
    const previewContainer = blockContainer.querySelector('.mermaid-preview, .svg-preview, .html-preview');
    if (!previewContainer) return;
    // 获取代码包装器（包含行号和pre）
    const codeWrapper = blockContainer.querySelector('.code-block-wrapper');
    if (!codeWrapper) return;
    const toggleButton = blockContainer.querySelector(`[data-preview-toggle="${blockKey}"]`);
    // 检查是否是HTML预览块，用于决定按钮内容
    const isHtmlBlock = previewContainer.classList.contains('html-preview');

    const currentMode = previewContainer.dataset.viewMode === 'code' ? 'code'
      : (previewContainer.style.display === 'none' ? 'code' : 'preview');
    const nextMode = forcedMode || (currentMode === 'preview' ? 'code' : 'preview');
    const showPreview = nextMode === 'preview';
    const preferredDisplay = previewContainer.dataset.previewDisplay || 'block';

    previewContainer.style.display = showPreview ? preferredDisplay : 'none';
    previewContainer.dataset.viewMode = nextMode;
    // 控制整个代码包装器的显示/隐藏，而不只是pre
    codeWrapper.style.display = showPreview ? 'none' : 'flex';
    previewViewModeRef.current.set(blockKey, nextMode);

    // HTML块特殊处理：每次切换到预览时重新渲染，切换回代码时清空iframe
    if (isHtmlBlock) {
      const iframe = previewContainer.querySelector('iframe');
      if (iframe) {
        if (showPreview) {
          // 切换到预览：重新渲染iframe内容
          const codeElement = blockContainer.querySelector('pre code');
          const codeContent = codeElement?.textContent || '';
          if (codeContent.trim()) {
            let htmlDoc = '';
            if (/^\s*<!DOCTYPE|^\s*<html/i.test(codeContent)) {
              if (/<\/body>/i.test(codeContent)) {
                htmlDoc = codeContent.replace(/<\/body>/i, CUSTOM_ALERT_HTML + '</body>');
              } else {
                htmlDoc = codeContent + CUSTOM_ALERT_HTML;
              }
            } else {
              htmlDoc = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; }
    body { 
      font-family: system-ui, -apple-system, sans-serif;
      line-height: 1.5;
      overflow: auto;
    }
  </style>
</head>
<body>
${codeContent}
${CUSTOM_ALERT_HTML}
</body>
</html>`;
            }
            // Transform synchronous confirm/prompt patterns to async/await
            htmlDoc = transformSyncDialogsToAsync(htmlDoc);
            iframe.srcdoc = htmlDoc;
          }
        } else {
          // 切换回代码：清空iframe内容，停止执行
          iframe.srcdoc = '';
        }
      }
    }

    if (toggleButton) {
      // 按钮显示的是"点击后会发生什么"
      // 当前显示预览 -> 按钮显示"代码"（点击后切换到代码）
      // 当前显示代码 -> 按钮显示"预览"（点击后切换到预览）
      if (isHtmlBlock) {
        toggleButton.innerHTML = showPreview ? BUTTON_CONTENT.RUN_OFF : BUTTON_CONTENT.RUN_ON;
      } else {
        toggleButton.innerHTML = showPreview ? BUTTON_CONTENT.PREVIEW_OFF : BUTTON_CONTENT.PREVIEW_ON;
      }
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
      iconLoadCacheRef.current.clear();
      return;
    }
    
    // Capture scroll positions before re-render - REMOVED

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

    const replacements = new Map();

    // 配置Prism自动加载器
    if (window.Prism?.plugins?.autoloader) {
      window.Prism.plugins.autoloader.languages_path =
        'https://cdn.jsdelivr.net/npm/prismjs/components/';
      // 禁用 worker 以避免跨域安全错误
      window.Prism.plugins.autoloader.use_worker = false;
    }

    // 配置markdown-it
    const md = window.markdownit({ 
      html: false, // 禁用 HTML，确保安全性并让 linkify 在默认模式下工作
      linkify: true,  
      typographer: false 
    });

    // 自定义表格渲染规则：添加滚动容器
    md.renderer.rules.table_open = function(tokens, idx, options, env, self) {
      return '<div class="table-wrapper"><table>';
    };
    md.renderer.rules.table_close = function(tokens, idx, options, env, self) {
      return '</table></div>';
    };

    // 自定义插件：在 html: false 模式下，手动识别并恢复允许的标签 (<p>, <br>, <ul>, <ol>, <li>)
    // 这比使用 sanitize_html 更安全且不干扰 linkify
    md.core.ruler.push('enable_specific_tags', (state) => {
      state.tokens.forEach((token) => {
        if (token.type === 'inline' && token.children) {
          const newChildren = [];
          token.children.forEach((child) => {
            if (child.type === 'text') {
              // 正则匹配允许的HTML标签 (忽略大小写)
              const tagRegex = /<(\/?)(p|br|ul|ol|li|strong|em|b|i|u|s|del|sub|sup|mark|code|pre|kbd|blockquote|hr|a|span|details|summary|h[1-6]|table|thead|tbody|tr|th|td)([^>]*)>/gi;
              let lastIndex = 0;
              let match;
              
              while ((match = tagRegex.exec(child.content)) !== null) {
                // 添加标签前的文本
                if (match.index > lastIndex) {
                  const textToken = new state.Token('text', '', 0);
                  textToken.content = child.content.slice(lastIndex, match.index);
                  newChildren.push(textToken);
                }
                
                // 添加 HTML 标签 token
                const htmlToken = new state.Token('html_inline', '', 0);
                htmlToken.content = match[0]; // 直接使用匹配到的标签内容
                newChildren.push(htmlToken);
                
                lastIndex = tagRegex.lastIndex;
              }
              
              // 添加剩余文本
              if (lastIndex < child.content.length) {
                const textToken = new state.Token('text', '', 0);
                textToken.content = child.content.slice(lastIndex);
                newChildren.push(textToken);
              }
            } else {
              newChildren.push(child);
            }
          });
          token.children = newChildren;
        }
      });
    });
    
    // 自定义链接渲染规则，确保内部链接使用绝对路径
    const defaultRender = md.renderer.rules.link_open || function(tokens, idx, options, env, self) {
      return self.renderToken(tokens, idx, options);
    };
    
    md.renderer.rules.link_open = function(tokens, idx, options, env, self) {
      const token = tokens[idx];
      const hrefIndex = token.attrIndex('href');
      
      if (hrefIndex >= 0) {
        let href = token.attrs[hrefIndex][1];
        
        // 修复可能被错误处理的hash链接
        if (href && href.startsWith('#/')) {
          href = href.substring(1); // 移除开头的 #
          token.attrs[hrefIndex][1] = href;
        }
        
        // 标记内部链接
        if (href && href.startsWith('/') && !href.startsWith('//')) {
          token.attrPush(['data-internal-link', 'true']);
        }
      }
      
      return defaultRender(tokens, idx, options, env, self);
    };
    
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
        
        // 使用 %% 而不是 __，避免被识别为粗体
        const placeholder = `%%LATEX_PROTECT_BLOCK_${id}%%`;
        replacements.set(placeholder, `<!-- ${id} --><div class="latex-block-protected" data-latex-id="${id}"></div><!-- /${id} -->`);
        return placeholder;
      });
      
      // 保护 \[ ... \] 块
      result = result.replace(/\\\[([\s\S]*?)\\\]/g, (match, latex) => {
        const id = `latex-block-${blockIndex}`;
        protectedBlocks.push({ id, latex: latex.trim(), type: 'block' });
        blockIndex++;
        
        const placeholder = `%%LATEX_PROTECT_BLOCK_${id}%%`;
        replacements.set(placeholder, `<!-- ${id} --><div class="latex-block-protected" data-latex-id="${id}"></div><!-- /${id} -->`);
        return placeholder;
      });
      
      return { text: result, protectedBlocks };
    };

    // 保护流式渲染中不完整的表格，避免渲染混乱
    // 核心策略：根据表头行确定列数，对后续行进行列数补齐
    const protectIncompleteTables = (text) => {
      const lines = text.split('\n');
      let result = [];
      let tableBuffer = [];
      let inTable = false;
      let hasSeparator = false;
      let headerColumnCount = 0; // 表头确定的列数
      let inCodeBlock = false;   // 标记是否在代码块中

      const isTableRow = (line) => {
        if (inCodeBlock) return false;
        const trimmed = line.trim();
        // 表格行特征：包含 | 且不是代码块
        return trimmed.includes('|') && !trimmed.startsWith('```');
      };
      
      const isSeparatorRow = (line) => {
        const trimmed = line.trim();
        // 分隔行特征：只包含 |、-、: 和空格
        return /^\|?[\s\-:|]+\|?$/.test(trimmed) && trimmed.includes('-');
      };
      
      // 计算行的列数（基于 | 分隔符）
      const getColumnCount = (line) => {
        const trimmed = line.trim();
        // 移除首尾的 |，然后按 | 分割
        let content = trimmed;
        if (content.startsWith('|')) content = content.slice(1);
        if (content.endsWith('|')) content = content.slice(0, -1);
        return content.split('|').length;
      };
      
      // 补齐行到指定列数
      const padRowToColumns = (line, targetColumns) => {
        const trimmed = line.trim();
        const currentColumns = getColumnCount(line);
        
        if (currentColumns >= targetColumns) {
          return line; // 已经足够，无需补齐
        }
        
        // 需要补齐的列数
        const missingColumns = targetColumns - currentColumns;
        
        // 判断原始行的格式（是否以 | 结尾）
        const endsWithPipe = trimmed.endsWith('|');
        // const startsWithPipe = trimmed.startsWith('|'); // unused
        
        // 构建补齐的空单元格
        const padding = ' |'.repeat(missingColumns);
        
        if (endsWithPipe) {
          // 如果已经以 | 结尾，在结尾 | 之前插入空单元格
          return line.slice(0, -1) + padding + '|';
        } else {
          // 如果没有以 | 结尾，直接追加
          return line + padding;
        }
      };
      
      const flushTable = () => {
        if (tableBuffer.length === 0) return;
        
        // 检查表格是否完整（至少有表头行、分隔行）
        const isComplete = hasSeparator && tableBuffer.length >= 2;
        
        if (isComplete && headerColumnCount > 0) {
          // 完整表格，对每一行进行列数补齐后输出
          const paddedTable = tableBuffer.map(row => {
            if (isSeparatorRow(row)) {
              // 分隔行也需要补齐
              return padRowToColumns(row, headerColumnCount);
            }
            return padRowToColumns(row, headerColumnCount);
          });
          result.push(...paddedTable);
        } else {
          // 不完整表格，包装成占位符
          const placeholderKey = `%%TABLE_PLACEHOLDER_${replacements.size}%%`;
          // 对表格内容进行HTML转义，防止内部字符被解析
          const safeContent = tableBuffer.join('\n').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          const placeholderHtml = `<div class="streaming-table-placeholder" style="font-family: monospace; background: #f9fafb; padding: 0.75em 1em; border-radius: 6px; border: 1px dashed #d1d5db; color: #6b7280; white-space: pre-wrap; margin: 0.5em 0;">${safeContent}</div>`;
          replacements.set(placeholderKey, placeholderHtml);
          result.push(placeholderKey);
        }
        
        tableBuffer = [];
        hasSeparator = false;
        inTable = false;
        headerColumnCount = 0;
      };
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // 代码块检测：如果遇到代码块围栏，切换状态
        const fenceMatch = line.trim().match(/^(`{3,}|~{3,})/);
        if (fenceMatch) {
            if (inTable) flushTable(); // 代码块开始会打断表格
            inCodeBlock = !inCodeBlock;
            result.push(line);
            continue;
        }

        if (inCodeBlock) {
            result.push(line);
            continue;
        }

        if (isTableRow(line)) {
          if (!inTable) {
            inTable = true;
            // 第一行是表头，确定列数
            headerColumnCount = getColumnCount(line);
          }
          if (isSeparatorRow(line)) {
            hasSeparator = true;
          }
          tableBuffer.push(line);
        } else {
          if (inTable) {
            // 表格结束
            flushTable();
          }
          result.push(line);
        }
      }
      
      // 处理文末的表格
      if (tableBuffer.length > 0) {
        flushTable();
      }
      
      return result.join('\n');
    };

    // 渲染Markdown（先保护 LaTeX）
    const normalizedContent = normalizeQuotesInString(content);
    const inlineReadyContent = normalizeInlineMathDelimiters(normalizedContent);
    const latexReadyContent = normalizeBlockMathDelimiters(inlineReadyContent);
    const dedentedContent = dedent(latexReadyContent);
    
    // 保护 LaTeX 块
    const { text: protectedContent, protectedBlocks } = protectLatexBlocks(dedentedContent);
    
    // 保护不完整的表格（流式渲染优化）
    const tableProtectedContent = protectIncompleteTables(protectedContent);
    
    // 渲染 Markdown
    const renderedHtml = md.render(tableProtectedContent);
    
    // 恢复受保护的内容（LaTeX块、不完整表格等）
    let finalHtml = renderedHtml;
    replacements.forEach((html, placeholder) => {
      // 尝试匹配被<p>包裹的情况（Markdown常见行为），移除多余的<p>
      // 复杂的正则用于匹配 <p>placeholder</p>，允许空白字符
      const wrappedRegex = new RegExp(`<p>\\s*${placeholder}\\s*</p>`, 'g');
      if (wrappedRegex.test(finalHtml)) {
        finalHtml = finalHtml.replace(wrappedRegex, html);
      } else {
        finalHtml = finalHtml.replace(placeholder, html);
      }
    });

    // 设置 HTML
    const tempDiv = document.createElement('div');
    tempDiv.className = 'markdown-content';
    tempDiv.innerHTML = finalHtml;
    
    // 处理Markdown中的链接，让它们使用Next.js路由而不是浏览器默认行为
    const links = tempDiv.querySelectorAll('a[href]');
    links.forEach(link => {
      let href = link.getAttribute('href');
      
      // 修复被错误渲染为hash链接的情况
      if (href && href.startsWith('#/')) {
        href = href.substring(1); // 移除开头的 #
        link.setAttribute('href', href);
      }
      
      // 处理内部链接（以 / 开头但不是 // 开头的）
      if (href && href.startsWith('/') && !href.startsWith('//')) {
        // 移除可能存在的旧事件监听器
        const newLink = link.cloneNode(true);
        link.parentNode.replaceChild(newLink, link);
        
        // 添加新的点击事件
        newLink.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          
          // 使用window.location进行导航（最可靠的方式）
          if (typeof window !== 'undefined') {
            window.location.href = href;
          }
        }, { capture: true });
        
        // 添加视觉反馈样式
        newLink.style.cursor = 'pointer';
        newLink.style.textDecoration = 'underline';
      }
    });
    
    // 在 DOM 中恢复受保护的 LaTeX 块（在后续的 replaceBlockMathWithPlaceholders 中处理）
    // 将 LaTeX 内容存储到 DOM 元素的 dataset 中
    protectedBlocks.forEach(({ id, latex }) => {
      const element = tempDiv.querySelector(`[data-latex-id="${id}"]`);
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
      const ols = Array.from(tempDiv.querySelectorAll('ol'));
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
    const pres = Array.from(tempDiv.querySelectorAll('pre'));
    const activeMermaidKeys = new Set();
    const activePreviewKeys = new Set();
    let mermaidBlockIndex = 0;
    let svgBlockIndex = 0;
    let htmlBlockIndex = 0;
    pres.forEach(pre => {
      if (pre.closest('.code-block-container')) return;

      const code = pre.querySelector('code');
      if (!code) return;

      const languageMatch = /language-(\w+)/.exec(code.className || '');
      const language = languageMatch ? languageMatch[1] : '';
      const isMermaid = language === 'mermaid';
      const isSvg = language === 'svg';
      const isHtml = language === 'html' || language === 'htm';
      const supportsPreview = isMermaid || isSvg || isHtml;
      let blockKey = null;
      if (isMermaid) {
        blockKey = `mermaid-${mermaidBlockIndex++}`;
        activeMermaidKeys.add(blockKey);
      } else if (isSvg) {
        blockKey = `svg-${svgBlockIndex++}`;
      } else if (isHtml) {
        blockKey = `html-${htmlBlockIndex++}`;
      }
      if (supportsPreview && blockKey) {
        activePreviewKeys.add(blockKey);
      }
      
      // 克隆 pre 元素
      const preClone = pre.cloneNode(true);
      const codeClone = preClone.querySelector('code');
      // 移除末尾的换行符
      const codeContent = (codeClone?.textContent || '').replace(/\n$/, '');
      if (codeClone) {
        codeClone.textContent = codeContent;
      }

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
      langSpan.style.display = 'flex';
      langSpan.style.alignItems = 'center';
      langSpan.style.gap = '6px';
      
      if (language) {
        const lowerLang = language.toLowerCase();
        // 使用映射查找文件名，如果没有映射则直接尝试使用小写名称
        const iconName = ICON_MAPPING[lowerLang] || lowerLang;
        
        const iconImg = document.createElement('img');
        // 使用本地图标路径
        const src = `/icons/${iconName}.svg`;
        iconImg.dataset.src = src;
        
        // 先设置为空，避免加载失败时显示占位符
        iconImg.alt = ''; 
        iconImg.style.width = '14px';
        iconImg.style.height = '14px';
        iconImg.style.marginRight = '2px';
        // 移除之前的 filter，因为本地 SVG 图标通常已经有颜色，或者我们希望保持原色
        // 如果原本是纯黑SVG且需要变白，可以保留 filter，但 Usually icons are colored or we should use CSS to style them.
        // User requested to use icons from components/icon (now public/icons). Assuming they are standard colored SVGs.
        // Let's keep a subtle filter or remove if they are colored.
        // Looking at file list (apple.svg, python.svg), they are likely colored brands.
        // Let's remove the heavy inversion filter effectively unless dark mode requires it.
        // But the previous filter was specific. 
        // Let's try without filter first as "original" icons are usually best.
        // iconImg.style.filter = ''; 
        
        // Set src to trigger load
        
        if (iconLoadCacheRef.current.has(src)) {
            // If cached, show immediately
            iconImg.style.display = 'inline-block';
            iconImg.src = src;
        } else {
            // If not cached, hide initially and wait for load
            iconImg.style.display = 'none';
            iconImg.onload = () => {
              iconImg.style.display = 'inline-block';
              iconLoadCacheRef.current.add(src);
            };
            iconImg.onerror = () => {
              // Load fallback icon
              const fallbackSrc = '/icons/square-code.svg';
              if (iconImg.src.endsWith(fallbackSrc)) {
                  // Avoid infinite loop if fallback fails
                  iconImg.style.display = 'none';
                  return;
              }
              iconImg.src = fallbackSrc;
              iconImg.style.display = 'inline-block';
            };
            iconImg.src = src;
        }
        
        langSpan.appendChild(iconImg);
      } else {
        // No language specified, show default icon
        const iconImg = document.createElement('img');
        const src = '/icons/square-code.svg';
        iconImg.alt = '';
        iconImg.style.width = '14px';
        iconImg.style.height = '14px';
        iconImg.style.marginRight = '2px';
        iconImg.style.display = 'inline-block';
        iconImg.src = src;
        langSpan.appendChild(iconImg);
      }

      langSpan.appendChild(document.createTextNode(language || 'code'));
      
      const contentArea = document.createElement('div');
      contentArea.className = 'code-block-content';
      
      // 为支持预览的代码块添加预览按钮
      let previewButton = null;
      // HTML默认不预览（需要手动点击运行），其他类型默认预览
      let showPreview = isHtml ? false : true;
      
      if (supportsPreview && blockKey) {
        const savedViewMode = previewViewModeRef.current.get(blockKey);
        // HTML只有明确保存为preview时才预览，其他类型只有明确保存为code时才显示代码
        if (isHtml) {
          showPreview = savedViewMode === 'preview';
        } else {
          showPreview = savedViewMode !== 'code';
        }

        previewButton = document.createElement('button');
        previewButton.className = 'code-copy-button mermaid-preview-toggle';
        previewButton.style.cssText = 'display: inline-flex; align-items: center; gap: 3px;';
        // 按钮显示的是"点击后会发生什么"
        // 当前显示预览 -> 按钮显示"代码"（点击后切换到代码）
        // 当前显示代码 -> 按钮显示"预览"（点击后切换到预览）
        if (isHtml) {
          previewButton.innerHTML = showPreview ? BUTTON_CONTENT.RUN_OFF : BUTTON_CONTENT.RUN_ON;
        } else {
          previewButton.innerHTML = showPreview ? BUTTON_CONTENT.PREVIEW_OFF : BUTTON_CONTENT.PREVIEW_ON;
        }
        previewButton.setAttribute('aria-label', isHtml ? 'Toggle Run' : 'Toggle Preview');
        previewButton.setAttribute('data-preview-toggle', blockKey);
        previewButton.setAttribute('data-mode', showPreview ? 'preview' : 'code');
      }
      
      const copyButton = document.createElement('button');
      copyButton.className = 'code-copy-button code-copy-btn';
      copyButton.style.cssText = 'display: inline-flex; align-items: center; gap: 3px;';
      copyButton.innerHTML = BUTTON_CONTENT.COPY;
      copyButton.setAttribute('aria-label', 'Copy');

      // 创建Mermaid预览容器（仅对Mermaid图表）
      let mermaidContainer = null;
      if (isMermaid) {
        // 固定预览高度为400px
        const previewHeight = 400;
        
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
          height: ${previewHeight}px;
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
          svgElement.style.margin = '0 auto';
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
          
        // Helper to show error
        const showError = (msg) => {
            let errorBox = mermaidContainer.querySelector('.preview-error-box');
            if (!errorBox) {
                errorBox = document.createElement('div');
                errorBox.className = 'preview-error-box';
                errorBox.style.cssText = `
                    position: absolute;
                    bottom: 10px;
                    left: 10px;
                    background: rgba(220, 38, 38, 0.9);
                    color: white;
                    padding: 8px 12px;
                    border-radius: 6px;
                    font-size: 12px;
                    max-width: 80%;
                    z-index: 20;
                    pointer-events: none;
                `;
                mermaidContainer.appendChild(errorBox);
            }
            errorBox.textContent = msg;
        };

        const hideError = () => {
            const errorBox = mermaidContainer.querySelector('.preview-error-box');
            if (errorBox) errorBox.remove();
        };

          // 异步渲染函数
          const renderChart = async () => {
            // Helper function to try rendering with partial content (removing lines from end)
            const tryRenderRefine = async (content) => {
                const lines = content.split('\n');
                // Try removing last line iteratively until success or empty
                // Limit retries to reasonable amount (e.g., 20 lines) to avoid hanging
                const maxRetries = Math.min(lines.length, 20); 
                
                for (let i = 0; i <= maxRetries; i++) {
                    const currentLines = lines.slice(0, lines.length - i);
                    if (currentLines.length === 0) break;
                    
                    const partialContent = currentLines.join('\n');
                    try {
                         const result = await window.mermaid.render(mermaidId + '-svg', partialContent);
                         if (result && result.svg) {
                             return { success: true, svg: result.svg, error: i === 0 ? null : `Displaying partial content (syntax error at line ${lines.length - i + 1})` };
                         }
                    } catch (e) {
                        // Continue to next iteration
                        if (i === 0) {
                            // Save first error to return if everything fails
                             var firstError = e;
                        }
                    }
                }
                return { success: false, error: firstError };
            };

            try {
              // 渲染前清理一次
              cleanupErrors();
              
              // First attempt full render
              let result;
              try {
                  result = await window.mermaid.render(mermaidId + '-svg', codeContent);
                  hideError(); // Clear error if success
              } catch (fullRenderErr) {
                  // If full render fails, try refinement
                  const refined = await tryRenderRefine(codeContent);
                  if (refined.success) {
                      result = { svg: refined.svg };
                      // Only show warning if we are actually displaying partial content
                      // And generally we want to show this "Partial Success" message even during streaming? 
                      // Maybe suppress it too until done to be super clean? 
                      // User said "don't show ERROR", this is a warning. 
                      // Let's hide it during streaming to be safe and clean.
                      if (!isStreamingRef.current) {
                          showError(`Rendering Partial: Syntax error detected. Displaying valid part.`);
                      } else {
                          hideError();
                      }
                  } else {
                      throw refined.error || fullRenderErr;
                  }
              }
              
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
              
              if (!isStreamingRef.current) {
                   showError(`Syntax Error: ${err.message || 'Invalid syntax'}`);
              } else {
                   hideError();
              }
              
              if (!hasSuccessRender) {
                // 首次渲染失败，静默等待，不显示错误信息，避免流式显示时的闪烁
                // 只在控制台输出调试信息
                console.debug('Mermaid渲染等待中（代码可能未完整接收）:', err.message);
                // Don't show UI error yet, wait for completion or valid partial
                hideError(); 
              } else {
                applyMermaidSnapshot();
                // If we have a snapshot, we are "good" for now, don't flash error
                // unless we want to warn the user that the *new* content is broken
                // For now, suppress to avoid flickering
                hideError();
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
        // 固定预览高度为400px
        const previewHeight = 400;

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
          height: ${previewHeight}px;
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
          
          // 新的SVG渲染逻辑：找到最后一个 /> 并在其后添加 </svg>
          let svgMarkup;
          if (hasClosing) {
            // 如果已经有完整的 </svg>，直接使用
            svgMarkup = codeContent;
          } else {
            // 找到最后一个 /> 的位置
            const lastSelfClosingMatch = codeContent.match(/\/>/g);
            if (lastSelfClosingMatch) {
              const lastIndex = codeContent.lastIndexOf('/>');
              if (lastIndex !== -1) {
                // 在最后一个 /> 之后截取内容并添加 </svg>
                svgMarkup = codeContent.substring(0, lastIndex + 2) + '</svg>';
              } else {
                // 找不到有效的 />，直接在末尾添加 </svg>（降级处理）
                svgMarkup = `${codeContent}</svg>`;
              }
            } else {
              // 没有任何 />，直接在末尾添加 </svg>（降级处理）
              svgMarkup = `${codeContent}</svg>`;
            }
          }
          
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
            // 只有渲染成功时才更新快照，这样失败时会保持上一个成功的状态
            svgSnapshotRef.current.set(blockKey, sanitizedSvg.outerHTML);
            svgContainer.setAttribute('data-render-success', 'true');
          } catch (err) {
            console.debug('SVG渲染等待中（代码可能未完整接收）:', err.message);
            // 渲染失败时，恢复上一次成功的快照，保持界面稳定
            applySnapshotToContainer(svgSnapshotRef.current.get(blockKey));
          }
        };

        renderSvgPreview();
      }

      // HTML 预览容器 - 使用沙箱iframe运行HTML代码
      let htmlContainer = null;
      if (isHtml && blockKey) {
        // 固定预览高度为400px
        const previewHeight = 400;

        htmlContainer = document.createElement('div');
        htmlContainer.className = 'html-preview';
        htmlContainer.setAttribute('data-block-key', blockKey);
        htmlContainer.dataset.viewMode = showPreview ? 'preview' : 'code';
        htmlContainer.dataset.previewDisplay = 'block';
        previewViewModeRef.current.set(blockKey, showPreview ? 'preview' : 'code');
        htmlContainer.style.cssText = `
          background: white;
          border-radius: 0 0 12px 12px;
          display: ${showPreview ? 'block' : 'none'};
          height: ${previewHeight}px;
          overflow: hidden;
          position: relative;
        `;

        // 创建沙箱iframe
        const iframe = document.createElement('iframe');
        iframe.className = 'html-preview-iframe';
        iframe.style.cssText = `
          width: 100%;
          height: ${previewHeight}px;
          border: none;
          border-radius: 0 0 12px 12px;
          background: white;
          display: block;
        `;
        // sandbox属性允许脚本执行，但在隔离的环境中
        // 注意：不包含allow-modals，阻止alert/confirm/prompt弹窗影响父页面
        iframe.setAttribute('sandbox', 'allow-scripts allow-forms allow-popups');
        iframe.setAttribute('title', 'HTML Preview');

        const renderHtmlPreview = () => {
          if (!codeContent?.trim()) return;
          
          try {
            // 将HTML内容注入到iframe中
            // 添加一些基础样式确保内容正常显示
            let htmlDoc = '';
            if (/^\s*<!DOCTYPE|^\s*<html/i.test(codeContent)) {
              if (/<\/body>/i.test(codeContent)) {
                htmlDoc = codeContent.replace(/<\/body>/i, CUSTOM_ALERT_HTML + '</body>');
              } else {
                htmlDoc = codeContent + CUSTOM_ALERT_HTML;
              }
            } else {
              htmlDoc = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; }
    body { 
      font-family: system-ui, -apple-system, sans-serif;
      line-height: 1.5;
      overflow: auto;
    }
  </style>
</head>
<body>
${codeContent}
${CUSTOM_ALERT_HTML}
</body>
</html>`;
            }
            
            // Transform synchronous confirm/prompt patterns to async/await
            htmlDoc = transformSyncDialogsToAsync(htmlDoc);
            
            iframe.srcdoc = htmlDoc;
            htmlSnapshotRef.current.set(blockKey, codeContent);
            htmlContainer.setAttribute('data-render-success', 'true');
          } catch (err) {
            console.debug('HTML渲染等待中（代码可能未完整接收）:', err.message);
          }
        };

        htmlContainer.appendChild(iframe);
        // HTML默认不渲染，只有在showPreview为true时才渲染
        if (showPreview) {
          renderHtmlPreview();
        }
      }

      // 组装结构
      header.appendChild(langSpan);
      
      // 创建按钮容器 - 使用固定属性防止挤压
      const buttonContainer = document.createElement('div');
      buttonContainer.style.cssText = 'display: flex; gap: 4px; flex-shrink: 0;';
      
      if (previewButton) {
        buttonContainer.appendChild(previewButton);
      }
      buttonContainer.appendChild(copyButton);
      header.appendChild(buttonContainer);
      
      // 生成行号（非预览模式下显示）
      const lineCount = (codeContent.match(/\n/g) || []).length + 1;
      const lineNumbersDiv = document.createElement('div');
      lineNumbersDiv.className = 'code-line-numbers';
      for (let i = 1; i <= lineCount; i++) {
        const lineNum = document.createElement('span');
        lineNum.className = 'line-num';
        lineNum.textContent = String(i);
        lineNumbersDiv.appendChild(lineNum);
      }
      
      // 创建包装器，让行号和代码并排显示
      const codeWrapper = document.createElement('div');
      codeWrapper.className = 'code-block-wrapper';
      // 根据预览状态设置初始显示
      if (supportsPreview && blockKey) {
        codeWrapper.style.display = showPreview ? 'none' : 'flex';
      }
      codeWrapper.appendChild(lineNumbersDiv);
      codeWrapper.appendChild(preClone);
      
      // 添加内容到容器
      if (mermaidContainer) {
        contentArea.appendChild(mermaidContainer);
      }
      if (svgContainer) {
        contentArea.appendChild(svgContainer);
      }
      if (htmlContainer) {
        contentArea.appendChild(htmlContainer);
      }
      // 代码包装器（包含行号和pre）
      contentArea.appendChild(codeWrapper);
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



    // Restore scroll positions - REMOVED (Handled by updateDomSmartly)

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
    htmlSnapshotRef.current.forEach((_, key) => {
      if (!activePreviewKeys.has(key)) {
        htmlSnapshotRef.current.delete(key);
      }
    });

    // 流式块级公式渲染（先替换占位，再手动渲染，防止未闭合内容闪烁）
    const blockMathSegments = replaceBlockMathWithPlaceholders(tempDiv);
    renderBlockMathSegments(tempDiv, blockMathSegments, blockMathCacheRef);
    const activeBlockKeys = new Set(blockMathSegments.map((segment) => segment.key));
    blockMathCacheRef.current.forEach((_, key) => {
      if (!activeBlockKeys.has(key)) {
        blockMathCacheRef.current.delete(key);
      }
    });

    const argsInline = tempDiv; // Rename for clarity or direct usage
    const inlineMathSegments = replaceInlineMathWithPlaceholders(tempDiv);
    renderInlineMathSegments(tempDiv, inlineMathSegments, inlineMathCacheRef);
    const activeInlineKeys = new Set(inlineMathSegments.map((segment) => segment.key));
    inlineMathCacheRef.current.forEach((_, key) => {
      if (!activeInlineKeys.has(key)) {
        inlineMathCacheRef.current.delete(key);
      }
    });

    // 引号统一为英文格式，避免中英文混排导致的符号跳变
    normalizeQuotesInElement(tempDiv);

    // Apply Smart DOM Update
    updateDomSmartly(containerRef.current, tempDiv);

    // Clean up caches for removed items (Need to check based on what's active in tempDiv or final result)
    // We already tracked active keys based on tempDiv processing above.
    
    // 清理已经不存在的Mermaid状态，避免ref无限增长 - MOVED HERE
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
    htmlSnapshotRef.current.forEach((_, key) => {
      if (!activePreviewKeys.has(key)) {
        htmlSnapshotRef.current.delete(key);
      }
    });
    
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
  const containerRef = useRef(null);
  const maxHeightRef = useRef(0);
  
  // 为气泡添加高度缓冲机制
  useEffect(() => {
    if (!containerRef.current) return;
    
    const timeoutId = setTimeout(() => {
      if (!containerRef.current) return;
      
      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const currentHeight = entry.contentRect.height;
          
          if (currentHeight > 10 && currentHeight > maxHeightRef.current) {
            maxHeightRef.current = currentHeight;
            const bufferHeight = Math.floor(currentHeight * 0.98);
            containerRef.current.style.minHeight = `${bufferHeight}px`;
          }
        }
      });
      
      if (containerRef.current) {
        resizeObserver.observe(containerRef.current);
      }
      
      return () => {
        resizeObserver.disconnect();
      };
    }, 50);
    
    return () => {
      clearTimeout(timeoutId);
    };
  }, []);
  
  return (
    <div
      ref={containerRef}
      className={cx("flex w-full", me ? "justify-end" : "justify-start")}
      style={{
        transition: 'min-height 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        willChange: 'min-height'
      }}
    >
      <div
        className={cx(
          "max-w-[85%] rounded-[2rem] px-5 py-3.5 text-[15px] leading-relaxed shadow-sm whitespace-pre-wrap transition-all duration-200",
          me
            ? "bg-black text-white"
            : "bg-white text-gray-900 border border-gray-100"
        )}
        style={{
          contain: 'layout style'
        }}
      >
        {children}
      </div>
    </div>
  );
};

const ThinkingBubble = ({ content, isComplete = false, isStopped = false, thinkingDuration = null }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [startTime] = useState(Date.now());
  const [elapsedTime, setElapsedTime] = useState(thinkingDuration || 0);
  
  // 计算思考时长
  useEffect(() => {
    // 如果已经有预设的thinkingDuration（来自历史记录），直接使用
    if (thinkingDuration !== null) {
      setElapsedTime(thinkingDuration);
      return;
    }
    
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
  }, [isComplete, isStopped, startTime, thinkingDuration]);

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
            "inline-flex items-center gap-2 text-[11px] font-semibold tracking-wide text-gray-400 transition-colors w-full select-none",
            isExpanded ? "hover:text-gray-600 cursor-pointer" : ""
          )}
          style={{ userSelect: 'none', WebkitUserSelect: 'none', MozUserSelect: 'none', msUserSelect: 'none' }}
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
              : (isComplete 
                  ? (elapsedTime > 0 ? `Thought for ${elapsedTime.toFixed(1)}s` : "Thought") 
                  : "Thinking")}
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
              <div className="mt-2 whitespace-pre-wrap break-all text-sm text-gray-500">{(content || "").replace(/^\n+/, '') || "…"}</div>
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

// 工具调用卡片组件 - 精致版
const ToolCallCard = ({ 
  tool_call_id, 
  status = "running", 
  function_name = "", 
  arguments_text = "", 
  result_summary = "", 
  error_message = "",
  result_details = ""
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const isRunning = status === "running";
  const isSuccess = status === "success";
  const isError = status === "error";

  const getDisplayName = (name) => {
    const nameMap = {
      'search_products': '搜索商品',
      'update_cart': '更新购物车', 
      'get_cart': '查看购物车',
      'get_category': '浏览分类'
    };
    return nameMap[name] || name;
  };

  const displayName = getDisplayName(function_name);

  // Helper to parse JSON safely - handles strings, objects, and edge cases
  const safeParse = (input) => {
    // If already an object, return it directly
    if (input !== null && typeof input === 'object') {
      return input;
    }
    // Handle undefined, null, or empty string
    if (input === undefined || input === null || input === '') {
      return null;
    }
    // Try to parse string as JSON
    if (typeof input === 'string') {
      try {
        return JSON.parse(input);
      } catch {
        return null;
      }
    }
    return null;
  };

  const args = safeParse(arguments_text);
  const result = safeParse(result_summary);

  // Determine styling based on function name
  const getToolStyle = (name) => {
    if (name === 'search_products') return { icon: Search, color: 'blue', bg: 'bg-blue-50', border: 'border-blue-100', text: 'text-blue-600' };
    if (name === 'update_cart' || name === 'get_cart') return { icon: ShoppingCart, color: 'orange', bg: 'bg-orange-50', border: 'border-orange-100', text: 'text-orange-600' };
    if (name === 'get_category') return { icon: List, color: 'purple', bg: 'bg-purple-50', border: 'border-purple-100', text: 'text-purple-600' };
    return { icon: Terminal, color: 'gray', bg: 'bg-gray-50', border: 'border-gray-100', text: 'text-gray-600' };
  };

  const style = getToolStyle(function_name);
  const Icon = style.icon;

  // Render Input Arguments
  const renderArguments = () => {
    // For tools that typically have no meaningful input for display, skip if empty
    if ((function_name === 'get_cart' || function_name === 'get_category') && (!args || Object.keys(args).length === 0)) {
        return null;
    }

    if (!args) return <div className="font-mono text-xs text-gray-500 break-all">{arguments_text}</div>;

    if (function_name === 'search_products') {
      const q = args.query;
      const queryStr = Array.isArray(q) ? q.join(', ') : q;
      return (
        <div className="flex flex-col gap-1 text-sm">
           <div className="flex gap-2"><span className="text-gray-500 min-w-[4rem]">关键词</span> <span className="font-medium text-gray-900">{queryStr}</span></div>
           {args.price_range && <div className="flex gap-2"><span className="text-gray-500 min-w-[4rem]">价格区间</span> <span className="text-gray-900">{args.price_range}</span></div>}
           {args.sort && <div className="flex gap-2"><span className="text-gray-500 min-w-[4rem]">排序</span> <span className="text-gray-900">{args.sort}</span></div>}
        </div>
      );
    }
    if (function_name === 'update_cart') {
       const actionMap = { add: '添加商品', remove: '移除商品', update: '更新数量', clear: '清空购物车' };
       // 优先从结果中获取商品名称，否则显示商品数量
       const productNames = result?.product_names || [];
       // 新API结构: args.items 是数组，每个元素有 product_id, variant_id?, quantity?
       const itemsArray = Array.isArray(args.items) ? args.items : [];
       const productCount = itemsArray.length;
       
       // 汇总数量显示：如果有多个item显示每个的数量，否则显示单个数量
       const quantities = itemsArray.map(item => item.quantity ?? 1).filter(q => q !== undefined);
       const quantityDisplay = quantities.length > 1 ? quantities.join(', ') : (quantities[0] ?? null);
       const hasQuantity = quantities.length > 0 && args.action !== 'clear';
       
       // 商品名称显示：优先使用结果中的名称，否则显示数量
       let productDisplay = null;
       if (productNames.length > 0) {
           // 最多显示3个商品名称
           const displayNames = productNames.slice(0, 3).join('、');
           const moreCount = productNames.length - 3;
           productDisplay = moreCount > 0 ? `${displayNames} 等${productNames.length}件` : displayNames;
       } else if (productCount > 0) {
           productDisplay = `${productCount} 件商品`;
       }
       
       return (
        <div className="flex flex-col gap-1 text-sm">
           <div className="flex gap-2"><span className="text-gray-500 min-w-[4rem]">操作</span> <span className="font-medium text-gray-900">{actionMap[args.action] || args.action}</span></div>
           {productDisplay && <div className="flex gap-2"><span className="text-gray-500 min-w-[4rem]">商品</span> <span className="text-gray-900">{productDisplay}</span></div>}
           {hasQuantity && <div className="flex gap-2"><span className="text-gray-500 min-w-[4rem]">数量</span> <span className="text-gray-900">{quantityDisplay}</span></div>}
        </div>
       );
    }
    
    // Generic
    if (Object.keys(args).length === 0) return null;

    return (
      <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        {Object.entries(args).map(([k, v]) => (
          <React.Fragment key={k}>
            <span className="text-gray-500">{k}</span>
            <span className="text-gray-900 font-medium break-all">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
          </React.Fragment>
        ))}
      </div>
    );
  };

  // Render Result
  const renderResult = () => {
    if (error_message) return <div className="text-red-600 text-sm">{error_message}</div>;
    
    // 当 result 为 null 时的后备处理
    if (!result) {
      // 如果 result_summary 为空或空白
      if (!result_summary || !result_summary.toString().trim()) {
        return <div className="text-xs text-gray-400">无返回数据</div>;
      }
      
      // 尝试以更友好的方式显示 result_summary
      const summaryStr = typeof result_summary === 'string' ? result_summary : JSON.stringify(result_summary);
      
      // 如果看起来像 JSON，尝试格式化显示
      if (summaryStr.trim().startsWith('{') || summaryStr.trim().startsWith('[')) {
        try {
          const parsed = JSON.parse(summaryStr);
          // 解析成功但之前 safeParse 返回 null（不应该发生，但作为保护）
          return <pre className="font-mono text-xs text-gray-600 whitespace-pre-wrap overflow-x-auto bg-gray-50 p-2 rounded-lg">{JSON.stringify(parsed, null, 2)}</pre>;
        } catch {
          // JSON 解析失败，显示原始文本但截断
          const truncated = summaryStr.length > 500 ? summaryStr.slice(0, 500) + '...' : summaryStr;
          return <div className="font-mono text-xs text-gray-600 whitespace-pre-wrap break-all">{truncated}</div>;
        }
      }
      
      // 普通文本，直接显示
      return <div className="font-mono text-xs text-gray-600 whitespace-pre-wrap break-all">{summaryStr}</div>;
    }

    if (function_name === 'search_products') {
      // 处理多查询结果
      if (result.multi_query && result.results) {
        const allItems = [];
        Object.values(result.results).forEach(queryResult => {
          if (queryResult.items) {
            allItems.push(...queryResult.items);
          }
        });
        
        if (allItems.length === 0) {
          return (
            <div className="flex flex-col items-center justify-center py-4 text-gray-500">
              <Search className="h-8 w-8 mb-2 opacity-20" />
              <span className="text-xs">未找到相关商品</span>
            </div>
          );
        }
        
        const displayItems = allItems.slice(0, 15); // 最多显示15个（5行x3列）
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>共找到 {result.count || allItems.length} 个商品</span>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
              {displayItems.map((item, i) => (
                <div key={i} className="flex flex-col gap-2 bg-white p-2 rounded-lg border border-gray-100 shadow-sm">
                  {item.image && <img src={item.image} className="w-full aspect-square rounded-md object-cover bg-gray-100" alt="" />}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm text-gray-900 line-clamp-2" title={item.name}>
                      {item.name}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs font-semibold text-gray-900">¥{item.price}</span>
                      {item.original_price && parseFloat(item.original_price) > parseFloat(item.price) && <span className="text-xs text-gray-400 line-through">¥{item.original_price}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {allItems.length > 15 && (
              <div className="text-center text-xs text-gray-400 py-1">还有 {allItems.length - 15} 个商品...</div>
            )}
          </div>
        );
      }
      
      // 处理单查询结果
      if (!result.items || result.items.length === 0) {
        return (
          <div className="flex flex-col items-center justify-center py-4 text-gray-500">
            <Search className="h-8 w-8 mb-2 opacity-20" />
            <span className="text-xs">未找到相关商品</span>
          </div>
        );
      }
      
      const displayItems = result.items.slice(0, 15); // 最多显示15个（5行x3列）
      return (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>共找到 {result.count} 个商品</span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
            {displayItems.map((item, i) => (
              <div key={i} className="flex flex-col gap-2 bg-white p-2 rounded-lg border border-gray-100 shadow-sm">
                {item.image && <img src={item.image} className="w-full aspect-square rounded-md object-cover bg-gray-100" alt="" />}
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm text-gray-900 line-clamp-2" title={item.name}>
                    {item.name}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs font-semibold text-gray-900">¥{item.price}</span>
                    {item.original_price && parseFloat(item.original_price) > parseFloat(item.price) && <span className="text-xs text-gray-400 line-through">¥{item.original_price}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {result.items.length > 15 && (
            <div className="text-center text-xs text-gray-400 py-1">还有 {result.items.length - 15} 个商品...</div>
          )}
        </div>
      );
    }

    if (function_name === 'get_cart') {
        if (!result.total_quantity && !result.total_price) {
             return (
              <div className="flex flex-col items-center justify-center py-4 text-gray-500">
                <ShoppingCart className="h-8 w-8 mb-2 opacity-20" />
                <span className="text-xs">购物车是空的</span>
              </div>
            );
        }

        const formatMoney = (value) => {
          if (value === undefined || value === null || value === '') return '¥0';
          const num = Number(value);
          if (Number.isNaN(num)) return `¥${value}`;
          return `¥${num % 1 === 0 ? num.toFixed(0) : num.toFixed(2)}`;
        };

        const totalQuantity = result.total_quantity ?? 0;
        const itemsSubtotal = result.items_subtotal ?? result.total_price ?? 0;
        const shippingFee = result.shipping_fee ?? 0;
        const totalPrice = result.total_price ?? 0;
        const giftThresholds = Array.isArray(result.gift_thresholds) ? result.gift_thresholds : [];
        const visibleGifts = giftThresholds.filter((threshold) => Array.isArray(threshold.items) && threshold.items.length > 0);

        return (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-gray-100 bg-white p-2 text-center">
                  <div className="text-[11px] text-gray-500">总数量</div>
                  <div className="text-lg font-semibold text-gray-900">{totalQuantity}</div>
                </div>
                <div className="rounded-lg border border-gray-100 bg-white p-2 text-center">
                  <div className="text-[11px] text-gray-500">商品小计</div>
                  <div className="text-lg font-semibold text-gray-900">{formatMoney(itemsSubtotal)}</div>
                </div>
                <div className="rounded-lg border border-gray-100 bg-white p-2 text-center">
                  <div className="text-[11px] text-gray-500">配送费</div>
                  <div className="text-lg font-semibold text-gray-900">{formatMoney(shippingFee)}</div>
                </div>
                <div className="rounded-lg border border-gray-100 bg-white p-2 text-center">
                  <div className="text-[11px] text-gray-500">应付金额</div>
                  <div className="text-lg font-semibold text-gray-900">{formatMoney(totalPrice)}</div>
                </div>
              </div>

              {visibleGifts.length > 0 && (
                <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-amber-700">
                    <Package className="h-4 w-4" />
                    <span>本单满额赠品</span>
                  </div>
                  <div className="mt-2 space-y-2">
                    {visibleGifts.map((threshold, idx) => (
                      <div key={`${threshold.threshold_amount || idx}`} className="rounded-lg border border-amber-100 bg-white/80 p-2">
                        <div className="flex items-center justify-between text-[11px] text-amber-700">
                          <span>满 ¥{threshold.threshold_amount}</span>
                          <span>随单配送</span>
                        </div>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          {threshold.items.map((gift, giftIdx) => (
                            <div key={`${gift.name}-${giftIdx}`} className="flex items-start justify-between gap-3 rounded-md border border-gray-100 bg-white p-2">
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-gray-900">{gift.name}</div>
                                {gift.category && <div className="text-[11px] text-gray-500">{gift.category}</div>}
                                {gift.description && <div className="mt-1 text-[11px] text-gray-500">{gift.description}</div>}
                              </div>
                              <div className="text-xs font-semibold text-gray-700 shrink-0">×{gift.quantity ?? 1}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
        )
    }

    if (function_name === 'get_category') {
        if (!result.categories || result.categories.length === 0) {
             return (
              <div className="flex flex-col items-center justify-center py-4 text-gray-500">
                <List className="h-8 w-8 mb-2 opacity-20" />
                <span className="text-xs">暂无分类信息</span>
              </div>
            );
        }
        return (
            <div className="flex flex-wrap gap-2">
                {result.categories.map((c, i) => (
                    <span key={i} className="px-2.5 py-1 bg-gray-100 text-gray-700 rounded-md text-xs font-medium">
                        {typeof c === 'string' ? c : c.name}
                    </span>
                ))}
            </div>
        )
    }

    if (function_name === 'update_cart') {
        const actionLabels = {
            add: '添加',
            remove: '移除',
            update: '更新',
            clear: '清空'
        };
        const actionLabel = actionLabels[result.action] || result.action;
        
        // 处理操作结果
        if (result.action === 'clear') {
            return (
                <div className="flex items-center gap-2 p-2 bg-white rounded-lg border border-gray-100">
                    <div className="flex items-center justify-center w-8 h-8 bg-green-100 rounded-full">
                        <Check className="w-4 h-4 text-green-600" />
                    </div>
                    <span className="text-sm text-gray-700">{result.message || '购物车已清空'}</span>
                </div>
            );
        }
        
        // 批量操作或单个操作
        const processed = result.processed ?? 1;
        const successful = result.successful ?? (result.ok ? 1 : 0);
        const failed = result.failed ?? 0;
        const productNames = result.product_names || [];
        const details = result.details || [];
        const hasErrors = result.has_errors || failed > 0;
        
        // 构建商品名称显示
        let namesDisplay = '';
        if (productNames.length > 0) {
            const displayNames = productNames.slice(0, 3).join('、');
            const moreCount = productNames.length - 3;
            namesDisplay = moreCount > 0 ? `${displayNames} 等${productNames.length}件` : displayNames;
        }
        
        // 提取错误信息
        const errorItems = details.filter(d => d && typeof d === 'object' && !d.success && d.error);
        const successItems = details.filter(d => d && typeof d === 'object' && d.success);
        
        // 判断整体状态
        const isFullSuccess = result.ok && !hasErrors && errorItems.length === 0;
        const isPartialSuccess = result.ok && (hasErrors || errorItems.length > 0);
        const isFailure = !result.ok;
        
        return (
            <div className="flex items-center gap-3 p-2 bg-white rounded-lg border border-gray-100">
                <div className={cx(
                    "flex items-center justify-center w-8 h-8 rounded-full shrink-0",
                    isFullSuccess ? "bg-green-100" :
                    isPartialSuccess ? "bg-yellow-100" :
                    "bg-red-100"
                )}>
                    {isFullSuccess ? (
                        <Check className="w-4 h-4 text-green-600" />
                    ) : isPartialSuccess ? (
                        <AlertTriangle className="w-4 h-4 text-yellow-600" />
                    ) : (
                        <XCircle className="w-4 h-4 text-red-600" />
                    )}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900">
                        {actionLabel}操作{isFullSuccess ? '成功' : isPartialSuccess ? '部分成功' : '失败'}
                    </div>
                    {namesDisplay && (
                        <div className="text-xs text-gray-600 truncate" title={productNames.join('、')}>
                            {namesDisplay}
                        </div>
                    )}
                    {processed > 1 && (
                        <div className="text-xs text-gray-500">
                            处理 {processed} 项，成功 {successful} 项{failed > 0 && `，失败 ${failed} 项`}
                        </div>
                    )}
                    {result.message && (
                        <div className="text-xs text-gray-500">{result.message}</div>
                    )}
                </div>
            </div>
        );
    }

    // Generic JSON - 格式化显示未知工具的结果
    if (result && typeof result === 'object') {
        // 尝试友好地显示通用结果
        if (result.ok !== undefined) {
            return (
                <div className="flex items-center gap-2 p-2 bg-white rounded-lg border border-gray-100">
                    <div className={cx(
                        "flex items-center justify-center w-8 h-8 rounded-full",
                        result.ok ? "bg-green-100" : "bg-red-100"
                    )}>
                        {result.ok ? (
                            <Check className="w-4 h-4 text-green-600" />
                        ) : (
                            <XCircle className="w-4 h-4 text-red-600" />
                        )}
                    </div>
                    <span className="text-sm text-gray-700">
                        {result.message || (result.ok ? '操作成功' : (result.error || '操作失败'))}
                    </span>
                </div>
            );
        }
        return <pre className="font-mono text-xs text-gray-600 whitespace-pre-wrap overflow-x-auto bg-gray-50 p-2 rounded-lg">{JSON.stringify(result, null, 2)}</pre>;
    }
    
    // 最后的后备：显示原始文本
    return <div className="font-mono text-xs text-gray-600 whitespace-pre-wrap break-all">{result_summary || '无返回数据'}</div>;
  };

  // Render Collapsed Summary
  const renderCollapsed = () => {
      if (isRunning) return <span className="text-blue-600 text-xs">正在执行...</span>;
      if (isError) return <span className="text-red-600 text-xs">{error_message || "执行失败"}</span>;
      
      if (function_name === 'search_products') {
          // 处理多查询情况
          if (result?.multi_query && result?.queries) {
              const queryCount = result.queries.length;
              const totalCount = result.count ?? 0;
              const queryStr = result.queries.join(', ');
              
              return (
                  <div className="flex items-center gap-2 overflow-hidden text-xs">
                      <span className="font-medium text-gray-900 shrink-0">搜索 "{queryStr}"</span>
                      <span className="text-gray-300">|</span>
                      <span className="text-gray-600 shrink-0">找到 {totalCount} 个</span>
                  </div>
              );
          }
          
          // 处理单查询情况
          const q = args?.query;
          const queryStr = Array.isArray(q) ? q.join(', ') : q;
          const count = result?.count ?? 0;
          const items = result?.items || [];
          const names = items.slice(0, 2).map(i => i.name).join(', ');
          
          return (
              <div className="flex items-center gap-2 overflow-hidden text-xs">
                  {queryStr && <span className="font-medium text-gray-900 shrink-0">搜索 "{queryStr}"</span>}
                  <span className="text-gray-300">|</span>
                  <span className="text-gray-600 shrink-0">找到 {count} 个</span>
                  {names && <span className="text-gray-400 truncate max-w-[120px]">({names}...)</span>}
              </div>
          );
      }

      if (function_name === 'get_cart') {
          const count = result?.total_quantity ?? 0;
          return (
              <div className="flex items-center gap-2 text-xs">
                  <span className="text-gray-600">找到 {count} 件商品</span>
              </div>
          );
      }

      if (function_name === 'get_category') {
          const count = result?.categories?.length ?? 0;
          return (
              <div className="flex items-center gap-2 text-xs">
                  <span className="text-gray-600">找到 {count} 个分类</span>
              </div>
          );
      }

      if (function_name === 'update_cart') {
          const action = args?.action;
          const actionLabels = { add: '添加购物车', remove: '移除商品', update: '更新数量', clear: '清空购物车' };
          const actionLabel = actionLabels[action] || '更新购物车';
          const productNames = result?.product_names || [];
          const hasErrors = result?.has_errors || result?.failed > 0;
          const failed = result?.failed ?? 0;
          
          // 显示商品名称（最多2个）
          let namesText = '';
          if (productNames.length > 0) {
              const displayNames = productNames.slice(0, 2).join('、');
              const moreCount = productNames.length - 2;
              namesText = moreCount > 0 ? `${displayNames}等${productNames.length}件` : displayNames;
          }
          
          return (
              <div className="flex items-center gap-2 text-xs overflow-hidden">
                  <span className="font-medium text-gray-900 shrink-0">{actionLabel}</span>
                  {namesText && <span className="text-gray-600 truncate max-w-[180px]">{namesText}</span>}
                  {result?.ok === false && <span className="text-red-500 shrink-0">失败</span>}
                  {result?.ok && hasErrors && <span className="text-yellow-600 shrink-0">({failed}项失败)</span>}
              </div>
          )
      }

      // Fallback
      if (result?.message) return <span className="text-xs text-gray-600">{result.message}</span>;
      
      return <span className="text-xs text-gray-500">执行完成</span>;
  }

  const hasArguments = renderArguments() !== null;

  return (
    <div 
      className="flex w-full justify-start -mt-2"
    >
      <div className="w-full max-w-[90%] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all hover:shadow-md">
        {/* Header */}
        <div 
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex cursor-pointer items-center justify-between bg-gray-50/50 px-4 py-3 transition-colors hover:bg-gray-50"
        >
            {/* Left Side: Icon + Title + Summary */}
            <div className="flex items-center gap-3 overflow-hidden">
                <div className={cx(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border shadow-sm",
                  isRunning ? "bg-blue-50 border-blue-100 text-blue-600" :
                  isSuccess ? style.bg + " " + style.border + " " + style.text :
                  "bg-red-50 border-red-100 text-red-600"
                )}>
                  {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> :
                   isSuccess ? <Icon className="h-4 w-4" /> :
                   <XCircle className="h-4 w-4" />}
                </div>
                
                <div className="flex flex-col overflow-hidden">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900">{displayName}</span>
                        {!isExpanded && (
                            <div className="truncate ml-2">
                                {renderCollapsed()}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Right Side: Chevron */}
            <ChevronDown 
              className={cx("h-4 w-4 text-gray-400 transition-transform duration-200 shrink-0", isExpanded ? "rotate-180" : "")} 
            />
        </div>

        {/* Expanded Content */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="border-t border-gray-100 bg-gray-50/30"
            >
              <div className="p-4 space-y-4">
                {/* Input Arguments */}
                {hasArguments && (
                  <div>
                    <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <div className="h-1.5 w-1.5 rounded-full bg-gray-400"></div>
                      Input
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
                      {renderArguments()}
                    </div>
                  </div>
                )}
                
                {/* Output Result */}
                {(result_summary || error_message) && (
                  <div>
                    <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <div className={cx("h-1.5 w-1.5 rounded-full", isError ? "bg-red-400" : "bg-green-400")}></div>
                      Output
                    </div>
                    <div className={cx(
                      "rounded-xl border p-3 shadow-sm overflow-hidden",
                      isError ? "border-red-100 bg-red-50/30" : "border-gray-200 bg-white"
                    )}>
                      {renderResult()}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
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
  const [selectedModel, setSelectedModel] = useState(() => getStoredModelSelection());
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
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window !== 'undefined') {
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
  
  // 【性能优化】用于节流流式更新的refs
  const streamUpdateTimerRef = useRef(null);
  const pendingContentRef = useRef(null);
  const apiBase = useMemo(() => getApiBaseUrl().replace(/\/$/, ""), []);
  const historyEnabled = Boolean(user);
  const routeChatId = router?.query?.chatId ? String(router.query.chatId) : null;
  const derivedChatId = initialConversationId || routeChatId || null;
  const [activeChatId, setActiveChatId] = useState(derivedChatId);
  const activeChatIdRef = useRef(activeChatId);
  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);
  useEffect(() => {
    persistModelSelection(selectedModel);
  }, [selectedModel]);
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
    if (typeof window === 'undefined') return;
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    // 判断是否是新对话URL
    const isNewChatUrl = router?.pathname === '/c' && !router?.query?.chatId;
    
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
          } else if (
            resultJson.total_price !== undefined ||
            resultJson.total_quantity !== undefined ||
            resultJson.items_subtotal !== undefined ||
            resultJson.shipping_fee !== undefined ||
            resultJson.payable_total !== undefined ||
            resultJson.gift_thresholds !== undefined
          ) {
            toolName = "get_cart";
          } else if (resultJson.action !== undefined || resultJson.details !== undefined) {
            toolName = "update_cart";
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
          
          const thinkingText = typeof entry.thinking_content === "string" ? entry.thinking_content : "";
          if (thinkingText && thinkingText.trim()) {
            normalized.push({
              id: genId(),
              role: "assistant_thinking",
              content: thinkingText,
              isComplete: true,
              isStopped: Boolean(entry.is_thinking_stopped),
              thinkingDuration: entry.thinking_duration || null,
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
      
      // 判断是否是新对话状态：URL是/c（没有chatId）
      const isNewChatUrl = (router?.pathname === '/c' && !router?.query?.chatId);
      
      // 移除自动跳转到最近聊天的逻辑，让用户停留在新对话界面
      // 只有在不是正在创建新对话的情况下，才自动选择第一个对话
      // if (!activeChatIdRef.current && list.length > 0 && !isCreatingNewChatRef.current && !isNewChatUrl) {
      //   const fallbackId = list[0].id;
      //   setActiveChatId(fallbackId);
      //   if (router && router.isReady) {
      //     const targetPath = `/c/${fallbackId}`;
      //     if (router.asPath !== targetPath) {
      //       router.replace(targetPath);
      //     }
      //   }
      // }
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
      const processingKey = `chat_processing_${activeChatId}`;
      
      // 检查是否正在处理中（使用sessionStorage持久化状态，防止组件重新挂载时重复处理）
      const isProcessing = sessionStorage.getItem(processingKey);
      if (isProcessing === 'true') {
        console.log('该消息正在处理中，跳过');
        // 跳过加载历史
        skipNextLoadRef.current = true;
        return;
      }
      
      const pendingData = sessionStorage.getItem(pendingKey);
      if (pendingData) {
        const { text, model } = JSON.parse(pendingData);
        
        // 立即标记为处理中并移除pending数据，防止重复触发
        sessionStorage.setItem(processingKey, 'true');
        sessionStorage.removeItem(pendingKey);
        
        // 跳过加载历史，直接发送消息
        skipNextLoadRef.current = true;
        
        // 保存chatId和model到闭包中，避免异步执行时值已变化
        const currentChatId = activeChatId;
        const modelToUse = model || selectedModel;
        
        // 在setTimeout外设置模型，避免触发useEffect重新执行
        if (model && model !== selectedModel) {
          setSelectedModel(model);
        }
        
        // 使用setTimeout确保状态更新在组件完全挂载后执行
        setTimeout(async () => {
          try {
            handleStop();
            setIsLoading(true);
            setShowThinking(true);
            setChatError("");
            thinkingMsgIdRef.current = null;
            
            // 添加用户消息到界面
            push("user", text);
            
            // 更新对话列表预览
            setChats((prev) => {
              const target = prev.find((chat) => chat.id === currentChatId);
              if (!target) return prev;
              const updatedChat = {
                ...target,
                preview: text.slice(0, 8) || target.preview,
              };
              const others = prev.filter((chat) => chat.id !== currentChatId);
              return [updatedChat, ...others];
            });
            
            // 构建消息并发送
            const apiMessages = [{ role: "user", content: text }];
            await sendMessage(apiMessages, modelToUse, currentChatId);
          } catch (error) {
            console.error('发送pending消息失败:', error);
            push("error", `抱歉，发生了错误：${error.message}\n\n请检查网络连接或稍后重试。`);
          } finally {
            // 清理处理标记
            sessionStorage.removeItem(processingKey);
            setIsLoading(false);
            setShowThinking(false);
            abortControllerRef.current = null;
          }
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
      
      // 【性能优化】清理pending更新
      if (streamUpdateTimerRef.current !== null) {
        cancelAnimationFrame(streamUpdateTimerRef.current);
        streamUpdateTimerRef.current = null;
      }
      pendingContentRef.current = null;
      
      setShowThinking(false);
      setIsLoading(false); // 【补充修复】重置加载状态
      thinkingMsgIdRef.current = null; // 【补充修复】重置thinking引用
      
      // 重置新对话标志
      isCreatingNewChatRef.current = false;
      pendingChatIdRef.current = null;
      pendingChatTitleRef.current = null;
      
      // 清理当前对话的pending处理标记
      if (activeChatId) {
        try {
          sessionStorage.removeItem(`chat_processing_${activeChatId}`);
        } catch (e) {
          console.error('清理处理标记失败:', e);
        }
      }
      
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
    
    // 【关键修复】先中止当前正在进行的流式请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    // 【性能优化】清理pending更新
    if (streamUpdateTimerRef.current !== null) {
      cancelAnimationFrame(streamUpdateTimerRef.current);
      streamUpdateTimerRef.current = null;
    }
    pendingContentRef.current = null;
    
    // 重置所有流相关的状态
    setIsLoading(false);
    setShowThinking(false);
    thinkingMsgIdRef.current = null;
    
    // 清理当前对话的pending处理标记
    if (activeChatId) {
      try {
        sessionStorage.removeItem(`chat_pending_${activeChatId}`);
        sessionStorage.removeItem(`chat_processing_${activeChatId}`);
      } catch (e) {
        console.error('清理pending标记失败:', e);
      }
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
      router.push('/c');
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
          const storedSelection = getStoredModelSelection();
          setSelectedModel((prev) => {
            const candidates = [prev, storedSelection];
            for (const candidate of candidates) {
              if (candidate && list.some((item) => item.model === candidate)) {
                return candidate;
              }
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
    
    // 【性能优化】刷新所有pending的更新
    flushPendingUpdate();
    
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
  
  // 【性能优化】立即更新，无节流（用于非流式场景）
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
  
  // 【性能优化】节流更新，用于流式输出（使用RAF批量更新）
  const updateLastMessageThrottled = useCallback((newContent) => {
    // 保存最新内容到ref
    pendingContentRef.current = newContent;
    
    // 如果已经有待处理的更新，直接返回（RAF会使用最新的内容）
    if (streamUpdateTimerRef.current !== null) {
      return;
    }
    
    // 使用RAF确保每帧最多更新一次
    streamUpdateTimerRef.current = requestAnimationFrame(() => {
      const contentToUpdate = pendingContentRef.current;
      if (contentToUpdate !== null) {
        setMsgs((s) => {
          const newMsgs = [...s];
          for (let i = newMsgs.length - 1; i >= 0; i--) {
            if (newMsgs[i].role === "assistant") {
              newMsgs[i] = { ...newMsgs[i], content: contentToUpdate };
              break;
            }
          }
          return newMsgs;
        });
        pendingContentRef.current = null;
      }
      streamUpdateTimerRef.current = null;
    });
  }, []);
  
  // 【性能优化】刷新pending的更新（流结束时调用）
  const flushPendingUpdate = useCallback(() => {
    if (streamUpdateTimerRef.current !== null) {
      cancelAnimationFrame(streamUpdateTimerRef.current);
      streamUpdateTimerRef.current = null;
    }
    if (pendingContentRef.current !== null) {
      const contentToUpdate = pendingContentRef.current;
      setMsgs((s) => {
        const newMsgs = [...s];
        for (let i = newMsgs.length - 1; i >= 0; i--) {
          if (newMsgs[i].role === "assistant") {
            newMsgs[i] = { ...newMsgs[i], content: contentToUpdate };
            break;
          }
        }
        return newMsgs;
      });
      pendingContentRef.current = null;
    }
  }, []);

  // SSE客户端实现
  const sendMessage = async (messages, modelValue, chatId = null) => {
    const API_URL = `${apiBase}/ai/chat`;
    if (!modelValue) {
      throw new Error("缺少有效模型配置");
    }
    
    const controller = new AbortController();
    abortControllerRef.current = controller;
    
    let reader = null; // 【关键修复】用于在finally中释放reader

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

      reader = response.body.getReader(); // 【关键修复】赋值给外部变量
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
                  // 后续delta：更新最后一条assistant消息【使用节流更新】
                  updateLastMessageThrottled(assistantContent);
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
                // 【性能优化】刷新所有pending的更新
                flushPendingUpdate();
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
                // 【性能优化】刷新所有pending的更新
                flushPendingUpdate();
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
        // 【性能优化】刷新所有pending的更新
        flushPendingUpdate();
        return; 
      }
      setShowThinking(false);
      thinkingMsgIdRef.current = null;
      // 【性能优化】刷新所有pending的更新
      flushPendingUpdate();
      // 添加错误消息
      push("error", `抱歉，发生了错误：${error.message}\n\n请检查网络连接或稍后重试。`);
    } finally {
      // 【关键修复】确保 reader 被正确释放
      if (reader) {
        try {
          reader.releaseLock();
        } catch (e) {
          // 如果 reader 已经被释放或关闭，忽略错误
          console.log('Reader already released:', e.message);
        }
      }
      // 【性能优化】最终确保所有pending更新都被刷新
      flushPendingUpdate();
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
      <header className="fixed top-16 z-30 bg-white left-0 right-0 lg:left-[var(--sidebar-width)]" style={{ '--sidebar-width': historyEnabled ? `${sidebarWidth}px` : '0px' }}>
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

  const ALL_SUGGESTIONS = [
    "有些什么零食",
    "哪些东西销量最好",
    "有些什么分类",
    "找找泡面",
    "有哪些饮料",
    "查看购物车",
    "添加一碗泡面到购物车",
    "清空购物车",
    "你有什么推荐"
  ];

  const SUGGESTIONS = useMemo(() => {
    return [...ALL_SUGGESTIONS]
      .sort(() => 0.5 - Math.random())
      .slice(0, 4);
  }, []);

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
                className="fixed top-[120px] left-0 right-0 bottom-0 z-30 bg-black/20 backdrop-blur-sm lg:hidden"
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
              isSidebarOpen ? "translate-x-0 z-[35] lg:z-20" : "-translate-x-full lg:translate-x-0 z-20",
              "overflow-hidden"
            )}
          >
          <div className="flex h-full flex-col" style={{ minWidth: isSidebarOpen ? SIDEBAR_EXPANDED_WIDTH : 'auto' }}>
          <div className={cx(
            "flex items-center gap-2",
            "pt-6 lg:pt-20",
            isSidebarOpen ? "justify-between px-4" : "justify-center px-2"
          )}>
            {isSidebarOpen ? (
              <>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div className="h-10 w-10 flex-shrink-0 bg-white rounded-full p-[3px] shadow-sm border border-gray-300">
                    <img 
                      src={HEADER_LOGO} 
                      alt={SHOP_NAME} 
                      className="h-full w-full rounded-full object-contain"
                    />
                  </div>
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
          </div>
        </motion.aside>
        </>
      )}
      <div className="relative flex flex-1 flex-col">
        {Header}
        <main ref={containerRef} className={cx("absolute left-0 right-0 top-[120px] bottom-0 overflow-y-auto z-20", mainPaddingBottom)} style={{ scrollbarGutter: 'stable' }}>
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
                  <motion.div layoutId="input-container" className="w-full">
                    <InputBar
                      value={inp}
                      onChange={setInp}
                      onSend={handleSend}
                      onStop={handleStop}
                      placeholder="问我任何问题…"
                      autoFocus
                      isLoading={isLoading}
                    />
                  </motion.div>
                  
                  {/* 提示词建议 */}
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5, duration: 0.5 }}
                    className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4"
                  >
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => setInp(s)}
                        className="flex items-center justify-center rounded-full border border-gray-100 bg-gray-50/50 px-4 py-3 text-sm text-gray-600 transition-all hover:bg-white hover:shadow-md hover:border-gray-200 hover:-translate-y-0.5"
                      >
                        <span className="truncate">{s}</span>
                      </button>
                    ))}
                  </motion.div>
                </div>
              </section>
            )}
            {shouldShowChat && (
              <LayoutGroup>
                <div className="mx-auto flex max-w-3xl flex-col gap-4">
                  <AnimatePresence initial={true} mode="popLayout">
                    {msgs.map((m, index) => {
                      let content = null;
                      if (m.role === "assistant") {
                        const isEmpty = !m.content || !m.content.trim();
                        if (isEmpty && m.tool_calls) {
                          return null;
                        }
                        const isLastMessage = index === msgs.length - 1;
                        const isStreaming = isLoading && isLastMessage;
                        content = <MarkdownRendererWrapper content={m.content} isStreaming={isStreaming} />;
                      } else if (m.role === "assistant_thinking") {
                        content = (
                          <ThinkingBubble
                            content={m.content}
                            isComplete={m.isComplete}
                            isStopped={m.isStopped}
                            thinkingDuration={m.thinkingDuration}
                          />
                        );
                      } else if (m.role === "tool_call") {
                        content = (
                          <ToolCallCard
                            tool_call_id={m.tool_call_id}
                            status={m.status}
                            function_name={m.function_name}
                            arguments_text={m.arguments_text}
                            result_summary={m.result_summary}
                            error_message={m.error_message}
                          />
                        );
                      } else if (m.role === "user") {
                        content = (
                          <Bubble role={m.role}>
                            {m.content}
                          </Bubble>
                        );
                      } else if (m.role === "error") {
                        content = <ErrorBubble message={m.content} />;
                      }

                      if (!content) return null;

                      // 优化 stagger delay，让它更平滑自然
                      const staggerDelay = Math.log(index + 1) * 0.05;

                      return (
                        <motion.div 
                          key={m.id}
                          layout="position" // 只对position进行布局动画,不影响size
                          initial={{ opacity: 0, y: 10, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, transition: { duration: 0 } }}
                          transition={{ 
                            opacity: { duration: 0.3, delay: staggerDelay, ease: "easeOut" },
                            y: { type: "spring", stiffness: 600, damping: 30, mass: 0.8, delay: staggerDelay },
                            scale: { type: "spring", stiffness: 600, damping: 30, mass: 0.8, delay: staggerDelay },
                            layout: { 
                              duration: 0.35, 
                              ease: [0.25, 0.1, 0.25, 1], // 使用更平滑的贝塞尔曲线
                              delay: 0.05 // 轻微延迟布局动画,让内容先渲染完成
                            }
                          }}
                          style={{
                            // 为每个消息块添加最小高度缓冲，避免内容变化时的布局抖动
                            minHeight: 'fit-content',
                            willChange: 'transform, opacity',
                            // 确保布局计算稳定
                            contain: 'layout'
                          }}
                        >
                          {content}
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                  <AnimatePresence>
                    {showThinking && (
                      <motion.div
                        layout="position"
                        initial={{ opacity: 0, y: 10, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, transition: { duration: 0 } }}
                        transition={{ 
                          opacity: { duration: 0.3, ease: "easeOut" },
                          y: { type: "spring", stiffness: 600, damping: 30, mass: 0.8 },
                          scale: { type: "spring", stiffness: 600, damping: 30, mass: 0.8 },
                          layout: { duration: 0.2, ease: "easeInOut" }
                        }}
                      >
                        <LoadingIndicator />
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <div ref={endRef} />
                </div>
              </LayoutGroup>
            )}
          </div>
        </main>
        {shouldShowChat && (
          <motion.div
            className="fixed bottom-0 z-30"
            initial={false}
            animate={{
              opacity: isSidebarOpen && !isDesktop ? 0 : 1
            }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            style={
              historyEnabled
                ? { left: isDesktop ? sidebarWidth : 0, right: 0 }
                : { left: 0, right: 0 }
            }
          >
            <div className="mx-auto max-w-4xl px-4 pb-2 bg-white/95 backdrop-blur-sm">
              <motion.div layoutId="input-container" className="w-full">
                <InputBar
                  value={inp}
                  onChange={setInp}
                  onSend={handleSend}
                  onStop={handleStop}
                  placeholder={inputPlaceholder}
                  isLoading={isLoading}
                />
              </motion.div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
