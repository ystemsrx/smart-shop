import React, { useCallback, useEffect, useRef, useState } from "react";
import { updateDomSmartly } from "../../../dom_utils";
import {
  BUTTON_CONTENT,
  STREAM_FADE_DURATION,
  STREAM_FADE_EXEMPT_CLASS,
  buildHtmlPreviewDoc,
  copyTextWithMermaidFeedback,
  hljs,
  normalizeBlockMathDelimiters,
  normalizeQuotesInElement,
  normalizeQuotesInString,
  normalizeInlineMathDelimiters,
  renderBlockMathSegments,
  renderInlineMathSegments,
  replaceBlockMathWithPlaceholders,
  replaceInlineMathWithPlaceholders,
  resolveHljsLanguage,
} from "./utils/renderingShared";
import {
  ICON_FALLBACK_SRC,
  ICON_MAPPING,
  ICON_STATUS,
  PYTHON_STATUS_CONFIG,
  cancelPythonTask,
  cleanupPythonStatusForInactive,
  createDeferred,
  enqueuePythonTask,
  hidePythonStatus,
  pythonExecutionState,
  resetPythonButtonState,
  resetPythonPreviewOutput,
  setPythonStatus,
} from "./services/pythonRuntime";

const MarkdownRenderer = ({ content, isStreaming = false }) => {
  const containerRef = useRef(null);
  const lastTextLengthRef = useRef(0);
  const chunkMetaRef = useRef([]);
  const blockMathCacheRef = useRef(new Map());
  const inlineMathCacheRef = useRef(new Map());
  const rendererIdRef = useRef(`mdr-${Math.random().toString(36).slice(2, 10)}`);
  
  
  // Keep track of streaming state in a ref for async access
  const isStreamingRef = useRef(isStreaming);
  useEffect(() => {
    isStreamingRef.current = isStreaming;
  }, [isStreaming]);

  const [vendorVersion, setVendorVersion] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleVendorReady = () => {
      setVendorVersion((prev) => prev + 1);
    };

    if (window.markdownit) {
      handleVendorReady();
    }

    window.addEventListener('chat-vendors-ready', handleVendorReady);
    return () => {
      window.removeEventListener('chat-vendors-ready', handleVendorReady);
    };
  }, []);

  // highlight.js 无需额外预热

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
  const pythonViewModeRef = useRef(new Map()); // key: python uid, value: 'preview' | 'code'

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

    if (previewContainer.classList.contains('mermaid-preview')) {
      const contentArea = blockContainer.querySelector('.code-block-content');
      if (contentArea) {
        if (showPreview) {
          contentArea.style.overflow = 'hidden';
          contentArea.style.scrollbarWidth = 'none';
          contentArea.style.msOverflowStyle = 'none';
        } else {
          contentArea.style.overflow = 'auto';
          contentArea.style.removeProperty('scrollbar-width');
          contentArea.style.removeProperty('-ms-overflow-style');
        }
      }
    }

    // HTML块特殊处理：切换到源码时清空所有状态，切换回预览时强制重建/渲染
    if (isHtmlBlock) {
      const getPreviewHeight = () => {
        const raw = previewContainer.dataset.previewHeight;
        const parsed = raw ? parseInt(raw, 10) : NaN;
        return Number.isFinite(parsed) ? parsed : 400;
      };
      const resetHtmlState = () => {
        const iframe = previewContainer.querySelector('iframe');
        if (iframe) {
          iframe.removeAttribute('srcdoc');
          iframe.removeAttribute('src');
          iframe.srcdoc = '';
          iframe.remove();
        }
        htmlSnapshotRef.current.delete(blockKey);
        previewContainer.removeAttribute('data-render-success');
        previewContainer.dataset.previewCleared = 'true';
      };
      const ensureHtmlIframe = () => {
        let iframe = previewContainer.querySelector('iframe');
        if (!iframe) {
          iframe = document.createElement('iframe');
          iframe.className = 'html-preview-iframe';
          const previewHeight = getPreviewHeight();
          iframe.style.cssText = `
            width: 100%;
            height: ${previewHeight}px;
            border: none;
            border-radius: 0 0 12px 12px;
            background: white;
            display: block;
          `;
          iframe.setAttribute('sandbox', 'allow-scripts allow-forms allow-popups');
          iframe.setAttribute('title', 'HTML Preview');
          previewContainer.appendChild(iframe);
        }
        return iframe;
      };

      if (showPreview) {
        // 切换到预览：重新渲染iframe内容（强制刷新）
        const codeElement = blockContainer.querySelector('pre code');
        const codeContent = codeElement?.textContent || '';
        if (codeContent.trim()) {
          const htmlDoc = buildHtmlPreviewDoc(codeContent);
          if (htmlDoc) {
            const iframe = ensureHtmlIframe();
            iframe.srcdoc = htmlDoc;
            htmlSnapshotRef.current.set(blockKey, codeContent);
            previewContainer.setAttribute('data-render-success', 'true');
            delete previewContainer.dataset.previewCleared;
          }
        }
      } else {
        // 切换回源码：清空所有状态，避免残留导致空白
        resetHtmlState();
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

  const togglePythonRun = useCallback((pythonUid, button) => {
    if (!pythonUid || !button) return;
    const blockContainer = button.closest('.code-block-container');
    if (!blockContainer) return;
    const previewContainer = blockContainer.querySelector('.python-preview');
    const codeWrapper = blockContainer.querySelector('.code-block-wrapper');
    if (!previewContainer || !codeWrapper) return;

    const currentMode = button.getAttribute('data-python-mode') || 'code';
    if (currentMode !== 'code') {
      // 只取消当前任务，不要重置整个运行时，否则会打断其他正在运行的任务
      cancelPythonTask(pythonUid);
      previewContainer.style.display = 'none';
      previewContainer.dataset.viewMode = 'code';
      codeWrapper.style.display = 'flex';
      pythonViewModeRef.current.set(pythonUid, 'code');
      resetPythonButtonState(button, 'code');
      hidePythonStatus(pythonUid);
      resetPythonPreviewOutput(previewContainer);
      return;
    }

    const codeElement = blockContainer.querySelector('pre code');
    const codeContent = codeElement?.textContent || '';
    if (!codeContent.trim()) return;

    previewContainer.style.display = previewContainer.dataset.previewDisplay || 'block';
    previewContainer.dataset.viewMode = 'preview';
    codeWrapper.style.display = 'none';
    pythonViewModeRef.current.set(pythonUid, 'preview');
    resetPythonButtonState(button, 'running');
    setPythonStatus(pythonUid, 'waiting');
    const task = { pythonUid, code: codeContent, cancelled: false };
    task.cancelSignal = createDeferred();
    resetPythonPreviewOutput(previewContainer);
    enqueuePythonTask(task);
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
    if (!containerRef.current) return;
    const root = containerRef.current;
    const handlePointerDown = (event) => {
      const button = event.target.closest('[data-python-toggle]');
      if (!button || !root.contains(button)) return;
      const pythonUid = button.getAttribute('data-python-toggle');
      if (!pythonUid) return;
      event.preventDefault();
      togglePythonRun(pythonUid, button);
    };
    root.addEventListener('pointerdown', handlePointerDown);
    return () => {
      root.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [togglePythonRun]);



  useEffect(() => {
    if (!containerRef.current || typeof window === 'undefined' || !window.markdownit) return;

    // 处理 content 为 null 或空的情况（assistant 消息可能只有 tool_calls 而没有文本内容）
    if (!content || content === null) {
      if (containerRef.current) {
        const statuses = containerRef.current.querySelectorAll('.python-status');
        statuses.forEach((statusEl) => {
          statusEl.textContent = '';
          statusEl.style.display = 'none';
          statusEl.dataset.status = '';
        });
      }
      pythonExecutionState.tasks.clear();
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
    
    // Capture scroll positions before re-render - REMOVED

    const existingPreviews = containerRef.current.querySelectorAll('.mermaid-preview, .svg-preview, .html-preview, .python-preview');
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
      } else if (preview.classList.contains('html-preview')) {
        const codeElement = preview.closest('.code-block-container')?.querySelector('pre code');
        const codeContent = codeElement?.textContent || '';
        if (codeContent.trim()) {
          htmlSnapshotRef.current.set(blockKey, codeContent);
        }
      } else if (preview.classList.contains('python-preview')) {
        const pythonUid = preview.getAttribute('data-python-uid') || preview.closest('.code-block-container')?.getAttribute('data-python-uid');
        if (pythonUid) {
          pythonViewModeRef.current.set(pythonUid, recordedMode);
        }
      }
    });

    const replacements = new Map();

    // highlight.js 已在模块层注册语言，无需额外初始化

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

      const splitBlockquotePrefix = (line) => {
        const match = line.match(/^(\s*(?:>\s*)+)(.*)$/);
        if (!match) return { prefix: '', content: line };
        return { prefix: match[1], content: match[2] };
      };

      const getTableContent = (line) => splitBlockquotePrefix(line).content;

      const stripInlineCode = (line) => {
        const content = getTableContent(line);
        let output = '';
        let i = 0;
        let inCode = false;
        let fence = '';

        while (i < content.length) {
          const char = content[i];
          if (char === '`') {
            let j = i;
            while (j < content.length && content[j] === '`') j += 1;
            const tickSeq = content.slice(i, j);

            if (!inCode) {
              inCode = true;
              fence = tickSeq;
              i = j;
              continue;
            }

            if (tickSeq === fence) {
              inCode = false;
              fence = '';
              i = j;
              continue;
            }
          }

          if (!inCode) {
            output += char;
          }
          i += 1;
        }

        return output;
      };

      const countPipes = (line) => {
        const content = stripInlineCode(line);
        let count = 0;
        for (let i = 0; i < content.length; i += 1) {
          if (content[i] === '|' && content[i - 1] !== '\\') {
            count += 1;
          }
        }
        return count;
      };

      const looksLikeTableRow = (line) => {
        const trimmed = stripInlineCode(line).trim();
        if (!trimmed || trimmed.startsWith('```')) return false;
        const pipeCount = countPipes(line);
        if (pipeCount === 0) return false;
        const startsOrEndsWithPipe = trimmed.startsWith('|') || trimmed.endsWith('|');
        if (startsOrEndsWithPipe) return true;
        if (pipeCount < 2) return false;
        // Require at least one separator-like pipe outside code spans to avoid false positives.
        return /\s\|/.test(trimmed) || /\|\s/.test(trimmed);
      };

      const findNextNonEmptyLine = (linesToScan, startIndex) => {
        for (let j = startIndex; j < linesToScan.length; j += 1) {
          if (linesToScan[j].trim() !== '') return linesToScan[j];
        }
        return null;
      };

      const isTableRow = (line, lineIndex, { allowMinimalPipeRow = false } = {}) => {
        if (inCodeBlock) return false;
        const trimmed = stripInlineCode(line).trim();
        if (!trimmed || !trimmed.includes('|') || trimmed.startsWith('```')) return false;
        if (looksLikeTableRow(line)) return true;
        if (allowMinimalPipeRow) return true;
        const nextLine = findNextNonEmptyLine(lines, lineIndex + 1);
        return !!(nextLine && isSeparatorRow(nextLine));
      };
      
      const isSeparatorRow = (line) => {
        const trimmed = getTableContent(line).trim();
        // 分隔行特征：只包含 |、-、: 和空格
        return /^\|?[\s\-:|]+\|?$/.test(trimmed) && trimmed.includes('-');
      };
      
      // 计算行的列数（基于 | 分隔符）
      const getColumnCount = (line) => {
        const trimmed = getTableContent(line).trim();
        // 移除首尾的 |，然后按 | 分割
        let content = trimmed;
        if (content.startsWith('|')) content = content.slice(1);
        if (content.endsWith('|')) content = content.slice(0, -1);
        return content.split('|').length;
      };
      
      // 补齐行到指定列数
      const padRowToColumns = (line, targetColumns) => {
        const { prefix, content } = splitBlockquotePrefix(line);
        const trimmed = content.trim();
        const currentColumns = getColumnCount(content);
        
        if (currentColumns >= targetColumns) {
          return line; // 已经足够，无需补齐
        }
        
        // 需要补齐的列数
        const missingColumns = targetColumns - currentColumns;
        
        // 判断原始行的格式（是否以 | 结尾）
        const endsWithPipe = trimmed.endsWith('|');
        
        // 构建补齐的空单元格
        const padding = ' |'.repeat(missingColumns);
        
        let paddedContent = content;
        if (endsWithPipe) {
          // 如果已经以 | 结尾，在结尾 | 之前插入空单元格
          const lastPipeIndex = content.lastIndexOf('|');
          if (lastPipeIndex !== -1) {
            paddedContent = content.slice(0, lastPipeIndex) + padding + content.slice(lastPipeIndex);
          } else {
            paddedContent = content + padding;
          }
        } else {
          // 如果没有以 | 结尾，直接追加
          paddedContent = content + padding;
        }
        return `${prefix}${paddedContent}`;
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
        const fenceMatch = getTableContent(line).trim().match(/^(`{3,}|~{3,})/);
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

        if (isTableRow(line, i, { allowMinimalPipeRow: inTable })) {
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
    const activePythonKeys = new Set();
    let mermaidBlockIndex = 0;
    let svgBlockIndex = 0;
    let htmlBlockIndex = 0;
    let pythonBlockIndex = 0;
    let codeBlockIndex = 0;
    pres.forEach(pre => {
      if (pre.closest('.code-block-container')) return;

      const code = pre.querySelector('code');
      if (!code) return;

      const languageMatch = /language-([^\s]+)/.exec(code.className || '');
      const language = languageMatch ? languageMatch[1] : '';
      const normalizedLanguage = String(language || '').toLowerCase();
      const isMermaid = normalizedLanguage === 'mermaid';
      const isSvg = normalizedLanguage === 'svg';
      const isHtml = normalizedLanguage === 'html' || normalizedLanguage === 'htm';
      const isPython = normalizedLanguage === 'python' || normalizedLanguage === 'py';
      const supportsPreview = isMermaid || isSvg || isHtml;
      let blockKey = null;
      let pythonUid = null;
      if (isMermaid) {
        blockKey = `mermaid-${mermaidBlockIndex++}`;
        activeMermaidKeys.add(blockKey);
      } else if (isSvg) {
        blockKey = `svg-${svgBlockIndex++}`;
      } else if (isHtml) {
        blockKey = `html-${htmlBlockIndex++}`;
      } else if (isPython) {
        blockKey = `python-${pythonBlockIndex++}`;
        pythonUid = `${rendererIdRef.current}-${blockKey}`;
        activePythonKeys.add(pythonUid);
      } else {
        blockKey = `code-${codeBlockIndex++}`;
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
      if (blockKey) {
        container.setAttribute('data-block-key', blockKey);
      }
      if (pythonUid) {
        container.setAttribute('data-python-uid', pythonUid);
      }
      
      const header = document.createElement('div');
      header.className = 'code-block-header';

      const langSpan = document.createElement('span');
      langSpan.style.display = 'inline-flex';
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
        
        iconImg.style.display = 'inline-block';

        const cachedStatus = ICON_STATUS.get(iconName);
        if (cachedStatus === 'missing') {
          iconImg.src = ICON_FALLBACK_SRC;
        } else {
          iconImg.onload = () => {
            ICON_STATUS.set(iconName, 'ok');
          };
          iconImg.onerror = () => {
            ICON_STATUS.set(iconName, 'missing');
            if (!iconImg.src.endsWith(ICON_FALLBACK_SRC)) {
              iconImg.src = ICON_FALLBACK_SRC;
            }
          };
          iconImg.src = src;
        }
        
        langSpan.appendChild(iconImg);
      } else {
        // No language specified, show default icon
        const iconImg = document.createElement('img');
        const src = ICON_FALLBACK_SRC;
        iconImg.alt = '';
        iconImg.style.width = '14px';
        iconImg.style.height = '14px';
        iconImg.style.marginRight = '2px';
        iconImg.style.display = 'inline-block';
        iconImg.src = src;
        langSpan.appendChild(iconImg);
      }

      langSpan.appendChild(document.createTextNode(language || 'plaintext'));
      
      const contentArea = document.createElement('div');
      contentArea.className = 'code-block-content';
      const setMermaidPreviewOverflow = (shouldHide) => {
        if (!shouldHide) {
          contentArea.style.overflow = 'auto';
          contentArea.style.removeProperty('scrollbar-width');
          contentArea.style.removeProperty('-ms-overflow-style');
          return;
        }
        contentArea.style.overflow = 'hidden';
        contentArea.style.scrollbarWidth = 'none';
        contentArea.style.msOverflowStyle = 'none';
      };
      
      // 为支持预览的代码块添加预览按钮
      let previewButton = null;
      // HTML默认不预览（需要手动点击运行），其他类型默认预览
      let showPreview = isHtml ? false : true;
      let showPythonPreview = false;
      let pythonExistingTask = null;
      
      if (supportsPreview && blockKey) {
        const savedViewMode = previewViewModeRef.current.get(blockKey);
        // HTML只有明确保存为preview时才预览，其他类型只有明确保存为code时才显示代码
        if (isHtml) {
          showPreview = savedViewMode === 'preview';
        } else {
          showPreview = savedViewMode !== 'code';
        }

        if (isMermaid) {
          setMermaidPreviewOverflow(showPreview);
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
      
      if (isPython && pythonUid) {
        const savedPythonMode = pythonViewModeRef.current.get(pythonUid);
        pythonExistingTask = pythonExecutionState.tasks.get(pythonUid);
        showPythonPreview = savedPythonMode === 'preview' || (pythonExistingTask && (pythonExistingTask.status === 'running' || pythonExistingTask.status === 'queued'));
      }
      
      let pythonRunButton = null;
      if (isPython && pythonUid) {
        pythonRunButton = document.createElement('button');
        pythonRunButton.className = 'code-copy-button python-run-toggle';
        pythonRunButton.style.cssText = 'display: inline-flex; align-items: center; gap: 3px;';
        pythonRunButton.setAttribute('aria-label', 'Run Python');
        pythonRunButton.setAttribute('data-python-toggle', pythonUid);
        pythonRunButton.setAttribute('data-python-mode', showPythonPreview ? 'running' : 'code');
        pythonRunButton.innerHTML = showPythonPreview
          ? BUTTON_CONTENT.RUN_OFF
          : (pythonExecutionState.busy ? BUTTON_CONTENT.RUN_BUSY : BUTTON_CONTENT.RUN_ON);
      }

      const copyButton = document.createElement('button');
      copyButton.className = 'code-copy-button code-copy-btn';
      copyButton.style.cssText = 'display: inline-flex; align-items: center; gap: 3px;';
      copyButton.innerHTML = BUTTON_CONTENT.COPY;
      copyButton.setAttribute('aria-label', 'Copy');

      // 创建Mermaid预览容器（仅对Mermaid图表）
      let mermaidContainer = null;
      let pythonContainer = null;
      if (isMermaid) {
        // 固定预览高度为400px
        const previewHeight = 400;
        
        // 创建Mermaid预览容器，直接作为内容显示
        mermaidContainer = document.createElement('div');
        mermaidContainer.className = 'mermaid-preview';
        mermaidContainer.setAttribute('data-block-key', blockKey);
        mermaidContainer.dataset.viewMode = showPreview ? 'preview' : 'code';
        mermaidContainer.dataset.previewDisplay = 'block';
        mermaidContainer.dataset.streamPhase = isStreamingRef.current ? 'streaming' : 'final';
        previewViewModeRef.current.set(blockKey, showPreview ? 'preview' : 'code');
        mermaidContainer.style.cssText = `
          padding: 20px;
          background: white;
          text-align: center;
          transform-origin: center center;
          transition: transform 0.2s ease;
          cursor: grab;
          user-select: none;
          touch-action: none;
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
        const preventNativeDrag = (event) => {
          event.preventDefault();
        };
        
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
          svgElement.style.userSelect = 'none';
          svgElement.style.webkitUserSelect = 'none';
          svgElement.style.touchAction = 'none';
          svgElement.setAttribute('draggable', 'false');
          svgElement.addEventListener('dragstart', preventNativeDrag);
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
        let activePointerId = null;

        const handlePointerDown = (e) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return;
          if (e.target.closest('button, a, .preview-error-container, .preview-error-toast, .preview-copied-box')) return;
          e.preventDefault();
          isDragging = true;
          activePointerId = e.pointerId;
          dragStart = { x: e.clientX - translate.x, y: e.clientY - translate.y };
          mermaidContainer.style.cursor = 'grabbing';
          if (mermaidContainer.setPointerCapture) {
            mermaidContainer.setPointerCapture(e.pointerId);
          }
        };

        const handlePointerMove = (e) => {
          if (!isDragging || (activePointerId !== null && e.pointerId !== activePointerId)) return;
          e.preventDefault();
          translate.x = e.clientX - dragStart.x;
          translate.y = e.clientY - dragStart.y;
          updateTransform();
        };

        const handlePointerUp = (e) => {
          if (!isDragging || (activePointerId !== null && e.pointerId !== activePointerId)) return;
          isDragging = false;
          mermaidContainer.style.cursor = 'grab';
          if (mermaidContainer.releasePointerCapture) {
            mermaidContainer.releasePointerCapture(e.pointerId);
          }
          activePointerId = null;
        };

        const pointerListenerOptions = { capture: true };
        mermaidContainer.addEventListener('pointerdown', handlePointerDown, pointerListenerOptions);
        mermaidContainer.addEventListener('pointermove', handlePointerMove, pointerListenerOptions);
        mermaidContainer.addEventListener('pointerup', handlePointerUp, pointerListenerOptions);
        mermaidContainer.addEventListener('pointercancel', handlePointerUp, pointerListenerOptions);
        
        // 鼠标滚轮缩放
        const handleWheel = (e) => {
          e.preventDefault();
          const delta = e.deltaY > 0 ? 0.9 : 1.1;
          scale = Math.max(0.3, Math.min(3, scale * delta));
          updateTransform();
        };
        const wheelListenerOptions = { passive: false };
        mermaidContainer.addEventListener('wheel', handleWheel, wheelListenerOptions);
        
        // 存储清理函数以便后续使用
        const cleanupEventListeners = () => {
          mermaidContainer.removeEventListener('pointerdown', handlePointerDown, pointerListenerOptions);
          mermaidContainer.removeEventListener('pointermove', handlePointerMove, pointerListenerOptions);
          mermaidContainer.removeEventListener('pointerup', handlePointerUp, pointerListenerOptions);
          mermaidContainer.removeEventListener('pointercancel', handlePointerUp, pointerListenerOptions);
          mermaidContainer.removeEventListener('wheel', handleWheel, wheelListenerOptions);
          const svgElement = mermaidContainer.querySelector('svg');
          if (svgElement) {
            svgElement.removeEventListener('dragstart', preventNativeDrag);
          }
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
          
        const formatMermaidErrorMessage = (err) => {
            if (!err) return 'Unknown error';
            if (typeof err === 'string') return err;
            if (err instanceof Error && err.message) return err.message;
            if (typeof err.message === 'string') return err.message;
            if (typeof err.str === 'string') return err.str;
            if (typeof err.text === 'string') return err.text;
            if (err.hash && typeof err.hash.text === 'string') return err.hash.text;
            try {
                return JSON.stringify(err);
            } catch (jsonErr) {
                return String(err);
            }
        };

        const clearMermaidRenderState = () => {
            mermaidSnapshotRef.current.delete(blockKey);
            mermaidStatesRef.current.delete(blockKey);
            mermaidContainer.removeAttribute('data-render-success');
            const existingSvg = mermaidContainer.querySelector('svg');
            if (existingSvg) {
                existingSvg.remove();
            }
            scale = 1;
            translate = { x: 0, y: 0 };
            mermaidContainer._transformState = { scale, translate: { ...translate } };
        };

        // Helper to show error — uses inline styles to guarantee visibility
        // regardless of external CSS. Appends to whichever element mermaidContainer
        // currently points to (it may have been moved by updateDomSmartly).
        const showError = (msg) => {
            if (!msg) return;
            // Remove any existing error display first
            const old = mermaidContainer.querySelector('.preview-error-container');
            if (old) old.remove();

            const container = document.createElement('div');
            container.className = 'preview-error-container';
            container.style.cssText = 'position:absolute;bottom:16px;left:16px;display:flex;flex-direction:column;align-items:flex-start;gap:8px;max-width:min(80%, calc(100% - 32px));z-index:20;pointer-events:auto;';

            const toast = document.createElement('div');
            toast.className = 'preview-error-toast';
            toast.style.cssText = 'background:rgba(220,38,38,0.92);color:#fff;padding:8px 14px;border-radius:8px;font-size:12px;line-height:1.5;font-family:system-ui,sans-serif;max-width:100%;white-space:pre-wrap;word-break:break-word;cursor:pointer;text-align:left;box-shadow:0 4px 12px rgba(0,0,0,0.15);';
            toast.textContent = msg;
            toast.dataset.message = msg;
            toast.addEventListener('click', () => {
                const textToCopy = toast.dataset.message || '';
                if (!textToCopy) return;
                copyTextWithMermaidFeedback(textToCopy, mermaidContainer);
            });
            container.appendChild(toast);
            mermaidContainer.appendChild(container);
        };

        const hideError = () => {
            const container = mermaidContainer.querySelector('.preview-error-container');
            if (container) container.remove();
        };

          // 异步渲染函数
          const renderChart = async () => {
            // Helper function to try rendering with partial content (removing lines from end)
            const tryRenderRefine = async (content) => {
                const lines = content.split('\n');
                // Try removing last line iteratively until success or empty
                // Limit retries to reasonable amount (e.g., 20 lines) to avoid hanging
                const maxRetries = Math.min(lines.length, 20); 
                let firstError;
                
                for (let i = 0; i <= maxRetries; i++) {
                    const currentLines = lines.slice(0, lines.length - i);
                    if (currentLines.length === 0) break;
                    
                    const partialContent = currentLines.join('\n');
                    try {
                         const result = await window.mermaid.render(mermaidId + '-svg', partialContent);
                         if (result && result.svg) {
                             return { success: true, svg: result.svg, error: firstError || null };
                         }
                    } catch (e) {
                        // Continue to next iteration
                        if (!firstError) {
                            // Save first error to return if everything fails
                             firstError = e;
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
                      if (!isStreamingRef.current) {
                          const errorMessage = formatMermaidErrorMessage(fullRenderErr || refined.error);
                          showError(errorMessage);
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
                   const errorMessage = formatMermaidErrorMessage(err);
                   clearMermaidRenderState();
                   showError(errorMessage);
              } else {
                   hideError();
                   if (!hasSuccessRender) {
                     // 首次渲染失败时静默等待，避免流式渲染闪烁
                     // Don't show UI error yet, wait for completion or valid partial.
                     hideError(); 
                   } else {
                     applyMermaidSnapshot();
                     // If we have a snapshot, we are "good" for now, don't flash error
                     // unless we want to warn the user that the *new* content is broken
                     // For now, suppress to avoid flickering
                     hideError();
                   }
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
        htmlContainer.dataset.previewHeight = String(previewHeight);
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
            const htmlDoc = buildHtmlPreviewDoc(codeContent);
            if (htmlDoc) {
              iframe.srcdoc = htmlDoc;
            }
            htmlSnapshotRef.current.set(blockKey, codeContent);
            htmlContainer.setAttribute('data-render-success', 'true');
          } catch (err) {
            // 流式内容不完整时保持静默，等待下一次更新
          }
        };

        htmlContainer.appendChild(iframe);
        // HTML默认不渲染，只有在showPreview为true时才渲染
        if (showPreview) {
          renderHtmlPreview();
        }
      }

      if (isPython && blockKey) {
        const previewHeight = 400;
        pythonContainer = document.createElement('div');
        pythonContainer.className = 'python-preview';
        pythonContainer.setAttribute('data-block-key', blockKey);
        if (pythonUid) {
          pythonContainer.setAttribute('data-python-uid', pythonUid);
        }
        pythonContainer.dataset.viewMode = showPythonPreview ? 'preview' : 'code';
        pythonContainer.dataset.previewDisplay = 'block';
        if (pythonUid) {
          pythonViewModeRef.current.set(pythonUid, showPythonPreview ? 'preview' : 'code');
        }
        pythonContainer.style.cssText = `
          background: #0b0f16;
          color: #e5e7eb;
          display: ${showPythonPreview ? 'block' : 'none'};
          height: ${previewHeight}px;
          overflow: hidden;
          position: relative;
        `;
        const terminal = document.createElement('div');
        terminal.className = 'python-terminal';
        const output = document.createElement('div');
        output.className = 'python-terminal-output';
        terminal.appendChild(output);
        pythonContainer.appendChild(terminal);
      }

      // 组装结构
      header.appendChild(langSpan);
      let pythonStatusEl = null;
      if (isPython && pythonUid) {
        pythonStatusEl = document.createElement('span');
        pythonStatusEl.className = 'python-status';
        pythonStatusEl.style.cssText = `
          margin-left: 10px;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.1px;
          user-select: none;
          white-space: nowrap;
          display: ${showPythonPreview ? 'inline-flex' : 'none'};
        `;
        if (showPythonPreview) {
          const statusKey = pythonExistingTask?.status === 'running'
            ? 'running'
            : pythonExistingTask?.status === 'queued'
              ? 'waiting'
              : 'waiting';
          const statusConfig = PYTHON_STATUS_CONFIG[statusKey];
          pythonStatusEl.style.color = statusConfig.color;
          const label = document.createElement('span');
          label.textContent = statusConfig.text + (statusKey === 'running' ? ' ' : '');
          pythonStatusEl.appendChild(label);
          if (statusKey === 'running') {
            const spinner = document.createElement('span');
            spinner.className = 'python-terminal-spinner';
            const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
            frames.forEach((frame) => {
              const frameSpan = document.createElement('span');
              frameSpan.textContent = frame;
              spinner.appendChild(frameSpan);
            });
            pythonStatusEl.appendChild(document.createTextNode(' '));
            pythonStatusEl.appendChild(spinner);
          }
          pythonStatusEl.dataset.status = statusKey;
        } else {
          pythonStatusEl.textContent = '';
          pythonStatusEl.dataset.status = '';
        }
        header.appendChild(pythonStatusEl);
      }
      
      // 创建按钮容器 - 使用固定属性防止挤压
      const buttonContainer = document.createElement('div');
      buttonContainer.style.cssText = 'display: flex; gap: 4px; flex-shrink: 0;';
      
      if (previewButton) {
        buttonContainer.appendChild(previewButton);
      }
      if (pythonRunButton) {
        buttonContainer.appendChild(pythonRunButton);
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
      if ((supportsPreview && blockKey) || (isPython && blockKey)) {
        const hideForPreview = supportsPreview ? showPreview : showPythonPreview;
        codeWrapper.style.display = hideForPreview ? 'none' : 'flex';
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
      if (pythonContainer) {
        contentArea.appendChild(pythonContainer);
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
            console.error('Failed to copy content:', err);
          }
        }
      });

      // 先替换DOM结构
      if (pre.parentNode) {
        pre.parentNode.replaceChild(container, pre);
      }

      // 注意：highlight.js 高亮将在 updateDomSmartly 之后对真实 DOM 执行
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
    pythonViewModeRef.current.forEach((_, key) => {
      if (!activePythonKeys.has(key)) {
        pythonViewModeRef.current.delete(key);
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
    cleanupPythonStatusForInactive(activePythonKeys);

    // 使用 highlight.js 对真实 DOM 中的代码块进行高亮
    const applyHighlighting = () => {
      const root = containerRef.current;
      if (!root) return;

      const codeBlocks = root.querySelectorAll('.code-block-container pre code');
      codeBlocks.forEach((codeElement) => {
        const container = codeElement.closest('.code-block-container');
        if (container?.querySelector('.mermaid-preview')) return;

        const languageMatch = /language-([^\s]+)/.exec(codeElement.className || '');
        const rawLanguage = languageMatch ? languageMatch[1] : '';
        if (rawLanguage.toLowerCase() === 'mermaid') return;
        const resolvedLanguage = resolveHljsLanguage(rawLanguage);

        const codeContent = codeElement.textContent || '';
        if (!codeContent.trim()) return;

        const lastHighlightedContent = codeElement.getAttribute('data-highlighted-content');
        if (lastHighlightedContent === codeContent) return;

        codeElement.removeAttribute('data-highlighted');
        codeElement.classList.remove('hljs');

        try {
          Array.from(codeElement.classList).forEach((cls) => {
            if (cls.startsWith('language-')) {
              codeElement.classList.remove(cls);
            }
          });
          if (resolvedLanguage) {
            codeElement.classList.add(`language-${resolvedLanguage}`);
          }
          const result = hljs.highlight(codeContent, {
            language: resolvedLanguage,
            ignoreIllegals: true,
          });
          codeElement.innerHTML = result.value;
          codeElement.classList.add('hljs');
          codeElement.setAttribute('data-highlighted-content', codeContent);
        } catch (err) {
          console.warn('highlight.js failed to highlight code; keeping raw content:', err);
        }
      });
    };

    applyHighlighting();

    const syncHtmlPreviews = () => {
      const root = containerRef.current;
      if (!root) return;
      const htmlBlocks = root.querySelectorAll('.code-block-container[data-block-key]');
      htmlBlocks.forEach((block) => {
        const preview = block.querySelector('.html-preview');
        if (!preview) return;
        const blockKey = preview.getAttribute('data-block-key');
        if (!blockKey) return;
        const viewMode = preview.dataset.viewMode || (preview.style.display === 'none' ? 'code' : 'preview');
        if (viewMode !== 'preview') return;
        const codeElement = block.querySelector('pre code');
        const codeContent = codeElement?.textContent || '';
        if (!codeContent.trim()) return;
        const lastRendered = htmlSnapshotRef.current.get(blockKey) || '';
        if (codeContent === lastRendered && preview.getAttribute('data-render-success') === 'true') {
          return;
        }
        const iframe = preview.querySelector('iframe');
        if (!iframe) return;
        const htmlDoc = buildHtmlPreviewDoc(codeContent);
        if (!htmlDoc) return;
        iframe.srcdoc = htmlDoc;
        htmlSnapshotRef.current.set(blockKey, codeContent);
        preview.setAttribute('data-render-success', 'true');
      });
    };

    syncHtmlPreviews();

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
    pythonViewModeRef.current.forEach((_, key) => {
      if (!activePythonKeys.has(key)) {
        pythonViewModeRef.current.delete(key);
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
    };
  }, [content, applyFadeToRange, vendorVersion, isStreaming]);

  useEffect(() => {
    return () => {
      const mermaidContainers = containerRef.current?.querySelectorAll('.mermaid-preview') || [];
      mermaidContainers.forEach(container => {
        if (container._cleanupEventListeners) {
          container._cleanupEventListeners();
        }
      });
    };
  }, []);

  return (
    <div className="w-full">
      <div 
        ref={containerRef}
        className="markdown-content text-[15px] leading-relaxed py-2"
      />
    </div>
  );
};

export default MarkdownRenderer;
