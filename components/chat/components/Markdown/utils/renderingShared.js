import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import java from 'highlight.js/lib/languages/java';
import cpp from 'highlight.js/lib/languages/cpp';
import c from 'highlight.js/lib/languages/c';
import csharp from 'highlight.js/lib/languages/csharp';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import php from 'highlight.js/lib/languages/php';
import ruby from 'highlight.js/lib/languages/ruby';
import swift from 'highlight.js/lib/languages/swift';
import kotlin from 'highlight.js/lib/languages/kotlin';
import sql from 'highlight.js/lib/languages/sql';
import xml from 'highlight.js/lib/languages/xml';
import json from 'highlight.js/lib/languages/json';
import yaml from 'highlight.js/lib/languages/yaml';
import markdown from 'highlight.js/lib/languages/markdown';
import bash from 'highlight.js/lib/languages/bash';
import powershell from 'highlight.js/lib/languages/powershell';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import css from 'highlight.js/lib/languages/css';
import plaintext from 'highlight.js/lib/languages/plaintext';
import objectivec from 'highlight.js/lib/languages/objectivec';
import ini from 'highlight.js/lib/languages/ini';
import diff from 'highlight.js/lib/languages/diff';
import nginx from 'highlight.js/lib/languages/nginx';
import graphql from 'highlight.js/lib/languages/graphql';
import makefile from 'highlight.js/lib/languages/makefile';
import cmake from 'highlight.js/lib/languages/cmake';
import protobuf from 'highlight.js/lib/languages/protobuf';
import latex from 'highlight.js/lib/languages/latex';
import r from 'highlight.js/lib/languages/r';

// highlight.js 语言注册
const HLJS_LANGUAGES = {
  javascript,
  typescript,
  python,
  java,
  cpp,
  c,
  csharp,
  objectivec,
  go,
  rust,
  php,
  ruby,
  swift,
  kotlin,
  sql,
  xml,
  json,
  yaml,
  markdown,
  bash,
  powershell,
  dockerfile,
  css,
  plaintext,
  ini,
  diff,
  nginx,
  graphql,
  makefile,
  cmake,
  protobuf,
  latex,
  r,
};

Object.entries(HLJS_LANGUAGES).forEach(([name, lang]) => {
  try {
    hljs.registerLanguage(name, lang);
  } catch (err) {
    // 忽略重复注册
  }
});

const HLJS_LANGUAGE_ALIASES = {
  'objective-c': 'objectivec',
  proto: 'protobuf',
  text: 'plaintext',
  toml: 'ini',
};

const normalizeHljsLanguage = (lang) => {
  if (!lang) return '';
  const lower = String(lang).trim().toLowerCase();
  return HLJS_LANGUAGE_ALIASES[lower] || lower;
};

const resolveHljsLanguage = (lang) => {
  const normalized = normalizeHljsLanguage(lang);
  if (!normalized) return 'plaintext';
  if (hljs.getLanguage(normalized)) return normalized;
  return 'plaintext';
};

/**
 * Modern AI Chat UI – Flat White, Smart Stadium Composer (React + Tailwind)
 * 2025‑08‑23 • v14 (Markdown & LaTeX support) - Next.js版
 * --------------------------------------------------
 * • 助手消息支持Markdown和LaTeX渲染，不使用气泡样式
 * • 用户消息继续使用气泡样式
 * • 适配Next.js环境变量和SSR
 * --------------------------------------------------
 */

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
  RUN_BUSY: `<svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" class="icon-xs"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v4.25c0 .414.336.75.75.75H13a1 1 0 100-2h-2V7z" clip-rule="evenodd"/></svg><span>运行</span>`,
};

// Silent dialog shim: the iframe sandbox (allow-scripts, no allow-modals) blocks native
// alert/confirm/prompt. Instead of complex async transformation, we simply override them
// with silent no-op stubs that return sensible defaults.
const SILENT_DIALOG_SHIM = `<script>window.alert=function(){};window.confirm=function(){return true;};window.prompt=function(m,d){return d!==undefined?String(d):'';};</script>`;
const DIALOG_CALL_REGEX = /\b(confirm|prompt|alert)\s*\(/i;

// transformSyncDialogsToAsync is kept but unused — dialogs are silently handled
// via SILENT_DIALOG_SHIM. Retained for potential future restoration.
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
  // Skip scripts marked with data-dialog-shim (our own dialog infrastructure)
  result = result.replace(
    /(<script[^>]*>)([\s\S]*?)(<\/script>)/gi,
    (match, openTag, scriptContent, closeTag) => {
      if (!scriptContent.trim()) return match;
      if (/data-dialog-shim/i.test(openTag)) return match;
      
      let transformed = scriptContent;
      
      // Transform function declarations to async
      // Pattern: function name(...) { ... }
      transformed = transformed.replace(
        /function\s+(\w+)\s*\(([^)]*)\)\s*\{/g,
        (funcMatch, funcName, params, offset, fullText) => {
          const before = fullText.slice(0, offset);
          if (/\basync\s*$/.test(before)) {
            return funcMatch;
          }
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

      // Transform addEventListener callbacks to async when needed
      transformed = transformed.replace(
        /(addEventListener\s*\(\s*['"`][^'"`]+['"`]\s*,\s*)(async\s+)?function\s*\(/g,
        (match, prefix, asyncKeyword) => {
          if (asyncKeyword) return match;
          return `${prefix}async function(`;
        }
      );
      transformed = transformed.replace(
        /(addEventListener\s*\(\s*['"`][^'"`]+['"`]\s*,\s*)(async\s+)?(\([^)]*\)|[a-zA-Z_$][a-zA-Z0-9_$]*)\s*=>\s*\{/g,
        (match, prefix, asyncKeyword, params) => {
          if (asyncKeyword) return match;
          return `${prefix}async ${params} => {`;
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

// Legacy CUSTOM_DIALOG_HTML — no longer used (replaced by SILENT_DIALOG_SHIM).
const _UNUSED_CUSTOM_DIALOG_HTML = `
<script data-dialog-shim>
(function() {
  // ---- Inject CSS ----
  var s = document.createElement('style');
  s.textContent = '.custom-dialog-overlay{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:2147483647;opacity:0;pointer-events:none;transition:opacity .2s;backdrop-filter:blur(2px);margin:0;padding:0;box-sizing:border-box;font-family:system-ui,-apple-system,sans-serif}.custom-dialog-overlay.show{opacity:1;pointer-events:auto}.custom-dialog-box{background:#fff;padding:24px;border-radius:12px;box-shadow:0 20px 40px -10px rgba(0,0,0,.15),0 10px 20px -5px rgba(0,0,0,.1);width:300px;text-align:center;transform:scale(.9) translateY(-10px);transition:transform .25s cubic-bezier(.34,1.56,.64,1);min-width:0;box-sizing:border-box}.custom-dialog-overlay.show .custom-dialog-box{transform:scale(1) translateY(0)}.custom-dialog-title{margin-bottom:8px;font-size:16px;font-weight:600;color:#111827}.custom-dialog-msg{margin-bottom:20px;font-size:14px;color:#4b5563;line-height:1.5;word-break:break-word;white-space:pre-wrap}.custom-dialog-input{width:100%;padding:10px 14px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;margin-bottom:16px;outline:none;transition:border-color .2s,box-shadow .2s;box-sizing:border-box}.custom-dialog-input:focus{border-color:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,.15)}.custom-dialog-buttons{display:flex;gap:10px;justify-content:center}.custom-dialog-btn{flex:1;padding:10px 16px;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;transition:all .2s;-webkit-appearance:none;border:none;box-sizing:border-box}.custom-dialog-btn-primary{background:linear-gradient(135deg,#1f2937,#374151);color:#fff}.custom-dialog-btn-primary:hover{background:linear-gradient(135deg,#111827,#1f2937);transform:translateY(-1px)}.custom-dialog-btn-primary:active{transform:translateY(0)}.custom-dialog-btn-secondary{background:#f3f4f6;color:#374151;border:1px solid #e5e7eb}.custom-dialog-btn-secondary:hover{background:#e5e7eb}.custom-dialog-icon{width:48px;height:48px;margin:0 auto 16px;border-radius:50%;display:flex;align-items:center;justify-content:center}.custom-dialog-icon-alert{background:linear-gradient(135deg,#fef3c7,#fde68a);color:#d97706}.custom-dialog-icon-confirm{background:linear-gradient(135deg,#dbeafe,#bfdbfe);color:#2563eb}.custom-dialog-icon-prompt{background:linear-gradient(135deg,#e0e7ff,#c7d2fe);color:#4f46e5}';
  (document.head || document.documentElement).appendChild(s);

  // ---- Build DOM ----
  var overlay = document.createElement('div');
  overlay.className = 'custom-dialog-overlay';
  overlay.innerHTML = '<div class="custom-dialog-box"><div class="custom-dialog-icon custom-dialog-icon-alert" id="cdlg-icon"></div><div class="custom-dialog-title" id="cdlg-title"></div><div class="custom-dialog-msg" id="cdlg-msg"></div><input type="text" class="custom-dialog-input" id="cdlg-input" style="display:none"><div class="custom-dialog-buttons"><button class="custom-dialog-btn custom-dialog-btn-secondary" id="cdlg-cancel" style="display:none">\\u53d6\\u6d88</button><button class="custom-dialog-btn custom-dialog-btn-primary" id="cdlg-ok">\\u786e\\u5b9a</button></div></div>';
  document.body.appendChild(overlay);

  var iconEl = document.getElementById('cdlg-icon');
  var titleEl = document.getElementById('cdlg-title');
  var msgEl = document.getElementById('cdlg-msg');
  var inputEl = document.getElementById('cdlg-input');
  var okBtn = document.getElementById('cdlg-ok');
  var cancelBtn = document.getElementById('cdlg-cancel');

  var icons = {
    a: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    c: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    p: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>'
  };
  var titles = { a: '\\u63d0\\u793a', c: '\\u786e\\u8ba4', p: '\\u8f93\\u5165' };
  var iconCls = { a: 'custom-dialog-icon custom-dialog-icon-alert', c: 'custom-dialog-icon custom-dialog-icon-confirm', p: 'custom-dialog-icon custom-dialog-icon-prompt' };

  // ---- Queue system ----
  var queue = [], busy = false, resolver = null, curType = 'a';

  function show() {
    if (busy || queue.length === 0) return;
    var item = queue.shift();
    busy = true;
    resolver = item.r;
    curType = item.t;
    iconEl.innerHTML = icons[item.t];
    iconEl.className = iconCls[item.t];
    titleEl.textContent = titles[item.t];
    msgEl.textContent = String(item.m);
    if (item.t === 'p') {
      inputEl.style.display = 'block';
      inputEl.value = item.d !== undefined ? String(item.d) : '';
      setTimeout(function() { inputEl.focus(); }, 100);
    } else {
      inputEl.style.display = 'none';
    }
    cancelBtn.style.display = item.t === 'a' ? 'none' : 'block';
    overlay.classList.add('show');
  }

  function enqueue(t, m, d) {
    return new Promise(function(resolve) {
      queue.push({ t: t, m: m, d: d, r: resolve });
      show();
    });
  }

  function close(val) {
    overlay.classList.remove('show');
    busy = false;
    if (resolver) { resolver(val); resolver = null; }
    setTimeout(show, 250);
  }

  okBtn.onclick = function() {
    close(curType === 'p' ? inputEl.value : curType === 'c' ? true : undefined);
  };
  cancelBtn.onclick = function() {
    close(curType === 'p' ? null : false);
  };
  inputEl.onkeydown = function(e) {
    if (e.key === 'Enter') okBtn.onclick();
    else if (e.key === 'Escape') cancelBtn.onclick();
  };
  document.addEventListener('keydown', function(e) {
    if (!overlay.classList.contains('show')) return;
    if (e.key === 'Escape' && curType !== 'a') cancelBtn.onclick();
    else if (e.key === 'Enter' && curType !== 'p') okBtn.onclick();
  });

  // ---- Override native dialogs ----
  window.alert   = function(m) { return enqueue('a', m); };
  window.confirm = function(m) { return enqueue('c', m); };
  window.prompt  = function(m, d) { return enqueue('p', m, d); };
})();
</script>
`;

const CUSTOM_ERROR_OVERLAY_HTML = `
<script>
  (function() {
    const STYLE_ID = 'preview-error-style';
    const CONTAINER_ID = 'preview-error-container';
    const COPIED_ID = 'preview-copied-box';
    const TOAST_DURATION = 8000;
    const EXIT_DURATION = 250;
    const STAGGER_DELAY = 50;
    const TOAST_GAP = 8;
    const TOAST_LIMIT = 5;
    const FADE_SIZE = 16;
    let copiedTimer;
    let pendingErrors = [];
    let isFlushingQueue = false;

    function ensureStyle() {
      if (document.getElementById(STYLE_ID)) return;
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = \`
        .preview-error-container {
          position: fixed;
          bottom: 10px;
          left: 10px;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 8px;
          max-width: 80%;
          max-height: calc(100vh - 20px);
          z-index: 2147483647;
          pointer-events: auto;
          overflow-y: auto;
          touch-action: pan-y;
          -webkit-overflow-scrolling: touch;
          --fade-size: 16px;
          padding: var(--fade-size) 0;
          scrollbar-width: none;
          -ms-overflow-style: none;
          mask-image: linear-gradient(to bottom, rgba(0,0,0,0), rgba(0,0,0,1) var(--fade-size), rgba(0,0,0,1) calc(100% - var(--fade-size)), rgba(0,0,0,0));
          -webkit-mask-image: linear-gradient(to bottom, rgba(0,0,0,0), rgba(0,0,0,1) var(--fade-size), rgba(0,0,0,1) calc(100% - var(--fade-size)), rgba(0,0,0,0));
          mask-size: 100% 100%;
          -webkit-mask-size: 100% 100%;
          mask-repeat: no-repeat;
          -webkit-mask-repeat: no-repeat;
        }
        .preview-error-container::-webkit-scrollbar {
          width: 0;
          height: 0;
        }
        .preview-error-toast {
          background: rgba(220, 38, 38, 0.9);
          color: white;
          padding: 8px 12px;
          border-radius: 6px;
          font-size: 12px;
          font-family: system-ui, -apple-system, sans-serif;
          max-width: 100%;
          max-height: 120px;
          overflow: hidden;
          display: -webkit-box;
          -webkit-line-clamp: 6;
          -webkit-box-orient: vertical;
          flex-shrink: 0;
          pointer-events: auto;
          opacity: 0;
          transform: translateY(16px);
          transition: opacity 0.25s ease, transform 0.25s ease, background 0.2s ease;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
          white-space: pre-wrap;
          word-break: break-word;
          cursor: pointer;
          will-change: transform, opacity;
        }
        .preview-error-toast.show {
          opacity: 1;
          transform: translateY(0);
        }
        .preview-error-toast.hide {
          opacity: 0;
          transform: translateY(6px);
        }
        .preview-copied-box {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%) scale(0.98);
          background: #10b981;
          color: white;
          padding: 6px 10px;
          border-radius: 8px;
          font-size: 13px;
          font-family: system-ui, -apple-system, sans-serif;
          z-index: 2147483647;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.2s ease, transform 0.2s ease;
          box-shadow: 0 6px 18px rgba(0, 0, 0, 0.18);
        }
        .preview-copied-box.show {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1);
        }
      \`;
      (document.head || document.documentElement).appendChild(style);
    }

    function ensureContainer() {
      let container = document.getElementById(CONTAINER_ID);
      if (!container) {
        container = document.createElement('div');
        container.id = CONTAINER_ID;
        container.className = 'preview-error-container';
        (document.body || document.documentElement).appendChild(container);
      }
      container.style.setProperty('--fade-size', FADE_SIZE + 'px');
      return container;
    }

    function ensureCopiedBox() {
      let box = document.getElementById(COPIED_ID);
      if (box) return box;
      box = document.createElement('div');
      box.id = COPIED_ID;
      box.className = 'preview-copied-box';
      (document.body || document.documentElement).appendChild(box);
      return box;
    }

    function copyText(text) {
      const showCopied = () => {
        const copiedBox = ensureCopiedBox();
        if (!copiedBox) return;
        copiedBox.textContent = 'Copied!';
        copiedBox.classList.remove('show');
        void copiedBox.offsetWidth;
        requestAnimationFrame(() => {
          copiedBox.classList.add('show');
        });
        clearTimeout(copiedTimer);
        copiedTimer = setTimeout(() => {
          copiedBox.classList.remove('show');
        }, 1000);
      };

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(showCopied).catch(() => {
          try {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.setAttribute('readonly', '');
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            showCopied();
          } catch (err) {
            // Swallow copy errors silently
          }
        });
      } else {
        try {
          const textarea = document.createElement('textarea');
          textarea.value = text;
          textarea.setAttribute('readonly', '');
          textarea.style.position = 'fixed';
          textarea.style.opacity = '0';
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand('copy');
          document.body.removeChild(textarea);
          showCopied();
        } catch (err) {
          // Swallow copy errors silently
        }
      }
    }

    function updateContainerMaxHeight(container) {
      const toasts = Array.from(container.querySelectorAll('.preview-error-toast'));
      if (toasts.length === 0) {
        container.style.maxHeight = '';
        return;
      }
      const limit = Math.min(TOAST_LIMIT, toasts.length);
      let height = 0;
      for (let i = 0; i < limit; i++) {
        const rect = toasts[i].getBoundingClientRect();
        height += rect.height;
        if (i > 0) height += TOAST_GAP;
      }
      const paddedHeight = height + (FADE_SIZE * 2);
      const viewportLimit = window.innerHeight - 20;
      container.style.maxHeight = \`\${Math.min(Math.ceil(paddedHeight), viewportLimit)}px\`;
    }

    function captureToastPositions(container) {
      const map = new Map();
      const toasts = container.querySelectorAll('.preview-error-toast');
      toasts.forEach((toast) => {
        map.set(toast, toast.getBoundingClientRect());
      });
      return map;
    }

    function applyToastShift(container, previousRects) {
      const toasts = container.querySelectorAll('.preview-error-toast');
      toasts.forEach((toast) => {
        const prev = previousRects.get(toast);
        if (!prev) return;
        const next = toast.getBoundingClientRect();
        const deltaY = prev.top - next.top;
        if (!deltaY) return;
        toast.style.transition = 'none';
        toast.style.transform = \`translateY(\${deltaY}px)\`;
        toast.dataset.shifted = 'true';
      });
    }

    function showErrorNow(msg) {
      ensureStyle();
      const container = ensureContainer();
      if (!container) return;
      const previousRects = captureToastPositions(container);
      const toast = document.createElement('div');
      toast.className = 'preview-error-toast';
      toast.textContent = msg;
      toast.dataset.message = msg;
      toast.addEventListener('click', function() {
        const textToCopy = toast.dataset.message || '';
        if (!textToCopy) return;
        copyText(textToCopy);
      });
      container.appendChild(toast);
      applyToastShift(container, previousRects);
      void container.offsetHeight;
      requestAnimationFrame(() => {
        const shifted = container.querySelectorAll('.preview-error-toast[data-shifted="true"]');
        shifted.forEach((item) => {
          item.style.transition = '';
          item.style.transform = '';
          item.removeAttribute('data-shifted');
        });
        toast.classList.add('show');
        updateContainerMaxHeight(container);
      });
      const hideTimer = setTimeout(() => {
        toast.classList.remove('show');
        toast.classList.add('hide');
        setTimeout(() => {
          toast.remove();
          updateContainerMaxHeight(container);
        }, EXIT_DURATION);
      }, TOAST_DURATION);
      toast._hideTimer = hideTimer;
    }

    function flushErrorQueue() {
      if (pendingErrors.length === 0) {
        isFlushingQueue = false;
        return;
      }
      isFlushingQueue = true;
      const msg = pendingErrors.shift();
      showErrorNow(msg);
      setTimeout(flushErrorQueue, STAGGER_DELAY);
    }

    function showError(msg) {
      pendingErrors.push(msg);
      if (!isFlushingQueue) {
        flushErrorQueue();
      }
    }

    const originalConsoleError = console.error;
    console.error = function(...args) {
      originalConsoleError.apply(console, args);
      const msg = args.map(arg => {
        if (arg instanceof Error) return arg.message;
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg);
          } catch (e) {
            return String(arg);
          }
        }
        return String(arg);
      }).join(' ');
      showError(msg);
    };

    window.addEventListener('error', function(event) {
      showError(event.message || 'Unknown Error');
    });

    window.addEventListener('unhandledrejection', function(event) {
      showError('Unhandled Rejection: ' + (event.reason?.message || event.reason || 'Unknown'));
    });
  })();
</script>
`;

const buildHtmlPreviewDoc = (codeContent = "") => {
  if (!codeContent?.trim()) return "";
  const needsShim = DIALOG_CALL_REGEX.test(codeContent);
  const shim = needsShim ? SILENT_DIALOG_SHIM : "";

  let htmlDoc = "";

  if (/^\s*<!DOCTYPE|^\s*<html/i.test(codeContent)) {
    htmlDoc = codeContent;
    // 若用户 HTML 缺少 viewport meta，注入以确保移动端正确缩放和触摸交互
    const viewportMeta = '<meta name="viewport" content="width=device-width, initial-scale=1.0">';
    const hasViewport = /<meta[^>]*viewport/i.test(htmlDoc);
    const extraHead = (hasViewport ? '' : viewportMeta + '\n') + CUSTOM_ERROR_OVERLAY_HTML;
    if (/<head[^>]*>/i.test(htmlDoc)) {
      htmlDoc = htmlDoc.replace(/<head[^>]*>/i, (match) => `${match}\n${extraHead}`);
    } else if (/<html[^>]*>/i.test(htmlDoc)) {
      htmlDoc = htmlDoc.replace(/<html[^>]*>/i, (match) => `${match}\n<head>${extraHead}</head>`);
    } else {
      htmlDoc = `${extraHead}\n${htmlDoc}`;
    }
    if (shim) {
      if (/<body[^>]*>/i.test(htmlDoc)) {
        htmlDoc = htmlDoc.replace(/<body[^>]*>/i, (match) => `${match}\n${shim}`);
      } else {
        htmlDoc = shim + htmlDoc;
      }
    }
  } else {
    htmlDoc = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${CUSTOM_ERROR_OVERLAY_HTML}
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
${shim}
${codeContent}
</body>
</html>`;
  }

  return htmlDoc;
};

const ensureMermaidCopiedBox = (container) => {
  if (!container || typeof document === 'undefined') return null;
  let box = container.querySelector('.preview-copied-box');
  if (!box) {
    box = document.createElement('div');
    box.className = 'preview-copied-box';
    container.appendChild(box);
  }
  return box;
};

const showMermaidCopiedIndicator = (container) => {
  const box = ensureMermaidCopiedBox(container);
  if (!box) return;
  box.textContent = 'Copied!';
  box.classList.remove('show');
  void box.offsetWidth;
  requestAnimationFrame(() => {
    box.classList.add('show');
  });
  clearTimeout(box._hideTimer);
  box._hideTimer = setTimeout(() => {
    box.classList.remove('show');
  }, 1000);
};

const copyTextWithMermaidFeedback = (text, container) => {
  if (!text) return;
  const onSuccess = () => showMermaidCopiedIndicator(container);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(onSuccess).catch(() => {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        onSuccess();
      } catch (err) {
        // Ignore copy failures
      }
    });
  } else {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      onSuccess();
    } catch (err) {
      // Ignore copy failures
    }
  }
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

export {
  BUTTON_CONTENT,
  STREAM_FADE_DURATION,
  STREAM_FADE_EXEMPT_CLASS,
  autoScaleMathFormula,
  buildHtmlPreviewDoc,
  copyTextWithMermaidFeedback,
  hljs,
  normalizeQuotesInElement,
  normalizeQuotesInString,
  normalizeInlineMathDelimiters,
  normalizeBlockMathDelimiters,
  renderBlockMathSegments,
  renderInlineMathSegments,
  replaceBlockMathWithPlaceholders,
  replaceInlineMathWithPlaceholders,
  resolveHljsLanguage,
};
