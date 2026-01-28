
// DOM智能更新函数
export const updateDomSmartly = (container, newContentDiv) => {
  const oldNodes = Array.from(container.children);
  const newNodes = Array.from(newContentDiv.children);

  for (let i = 0; i < newNodes.length; i++) {
    const newNode = newNodes[i];
    const oldNode = oldNodes[i];

    if (!oldNode) {
      container.appendChild(newNode);
      continue;
    }

    // 检查是否为代码块容器
    const isOldCode = oldNode.classList.contains('code-block-container');
    const isNewCode = newNode.classList.contains('code-block-container');

    // 只有当两个都是代码块，并且Block Key相同时才复用（防止不同代码块互串）
    const oldKey = oldNode.getAttribute('data-block-key');
    const newKey = newNode.getAttribute('data-block-key');
    const sameKey = (oldKey && newKey && oldKey === newKey);

    if (isOldCode && isNewCode && sameKey) {
      // 策略：复用外壳，只更新内容
      
      const oldCodeWrapper = oldNode.querySelector('.code-block-wrapper');
      const newCodeWrapper = newNode.querySelector('.code-block-wrapper');
      
      // 1. 获取代码文本并检查是否发生了变化（在更新前就要检查）
      const oldCodeFn = oldCodeWrapper?.querySelector('pre code');
      const newCodeFn = newCodeWrapper?.querySelector('pre code');
      const oldCodeText = oldCodeFn?.textContent || '';
      const newCodeText = newCodeFn?.textContent || '';
      const codeContentChanged = oldCodeText !== newCodeText;
      
      // 2. 更新代码文本（如果变化了）
      if (oldCodeFn && newCodeFn && codeContentChanged) {
        oldCodeFn.textContent = newCodeFn.textContent;
        // 清理 highlight.js 标记，确保流式更新后可重新高亮
        oldCodeFn.classList.remove('hljs');
        oldCodeFn.removeAttribute('data-highlighted');
        oldCodeFn.removeAttribute('data-highlighted-content');
      }
      
      // 3. 更新行号
      const oldLineNum = oldCodeWrapper?.querySelector('.code-line-numbers');
      const newLineNum = newCodeWrapper?.querySelector('.code-line-numbers');
      if (oldLineNum && newLineNum) {
        if (oldLineNum.innerHTML !== newLineNum.innerHTML) {
             oldLineNum.innerHTML = newLineNum.innerHTML;
        }
      }

      // 4. 更新预览区域 (Mermaid/SVG/HTML)
      const oldPreview = oldNode.querySelector('.mermaid-preview, .svg-preview, .html-preview, .python-preview');
      const newPreview = newNode.querySelector('.mermaid-preview, .svg-preview, .html-preview, .python-preview');

      if (oldPreview && newPreview) {
          if (oldPreview.classList.contains('python-preview') && newPreview.classList.contains('python-preview')) {
              // Python终端输出为状态型内容，保持旧预览以避免输出丢失
              const viewMode = newPreview.dataset.viewMode;
              if (viewMode) {
                  oldPreview.dataset.viewMode = viewMode;
              }
          } else {
          const oldSuccess = oldPreview.getAttribute('data-render-success') === 'true';
          const newSuccess = newPreview.getAttribute('data-render-success') === 'true';
          const oldPhase = oldPreview.dataset ? oldPreview.dataset.streamPhase : null;
          const newPhase = newPreview.dataset ? newPreview.dataset.streamPhase : null;
          const phaseChanged = Boolean(oldPhase && newPhase && oldPhase !== newPhase);

          // 如果代码内容没有变化，且旧的预览已成功渲染，则跳过更新，避免闪烁
          if (!codeContentChanged && oldSuccess && !phaseChanged) {
              // 代码没变，保留旧的预览，不做任何操作
              // 这样可以避免 iframe/mermaid/svg 的无谓重新渲染
          } else if (newSuccess || !oldSuccess) {
              // 决定是否替换预览区域
              // 如果新渲染成功，或者旧渲染也是失败的（都没内容），则使用新的
              // 如果旧的成功，新的失败（流式传输中临时断开/HTML未闭合），则保留旧的以防止闪烁
              
              // 在替换前，清理旧的事件监听器（防止 transform 泄露）
              if (oldPreview._cleanupEventListeners) {
                  oldPreview._cleanupEventListeners();
              }
              
              // 迁移交互状态 (Zoom/Pan)
              if (oldPreview._transformState) {
                  newPreview._transformState = oldPreview._transformState;
                  // 同时应用 visual style
                   if (newPreview.querySelector('svg')) {
                       // Mermaid / SVG
                       // 重新应用 scale / translate
                       const { scale, translate } = oldPreview._transformState;
                       if (scale && translate) {
                           const svg = newPreview.querySelector('svg');
                           svg.style.transform = `translate(${translate.x}px, ${translate.y}px) scale(${scale})`;
                       }
                   }
              }
              // Mermaid preview container 本身的 style transform 也可以保留 (although our CSS uses internal SVG transform)
              
              oldPreview.replaceWith(newPreview);
          }
          }
      } else if (newPreview && !oldPreview) {
          // 之前没有预览，现在有了，插入
          // 找到插入位置：header之后，codeWrapper之前
          const header = oldNode.querySelector('.code-block-header');
          if (header && header.nextSibling) {
              oldNode.insertBefore(newPreview, header.nextSibling);
          }
      } else if (!newPreview && oldPreview) {
          // 新的没有预览（可能切换了模式），移除旧的
          if (oldPreview._cleanupEventListeners) {
              oldPreview._cleanupEventListeners();
          }
          oldPreview.remove();
      }

      // 5. 更新按钮状态文字 (Preview Toggle Button)
      const oldBtn = oldNode.querySelector('[data-preview-toggle]');
      const newBtn = newNode.querySelector('[data-preview-toggle]');
      if (oldBtn && newBtn) {
          if (oldBtn.innerHTML !== newBtn.innerHTML) {
              oldBtn.innerHTML = newBtn.innerHTML;
              oldBtn.setAttribute('data-mode', newBtn.getAttribute('data-mode'));
          }
      }
      
      continue; 
    }

    // 检查是否为表格容器 (fix: preserve scroll position by recycling wrapper)
    const isOldTable = oldNode.classList.contains('table-wrapper');
    const isNewTable = newNode.classList.contains('table-wrapper');

    if (isOldTable && isNewTable) {
      // 策略：复用外壳，只更新表格内容
      const oldTable = oldNode.querySelector('table');
      const newTable = newNode.querySelector('table');
      
      if (oldTable && newTable && oldTable.innerHTML !== newTable.innerHTML) {
        oldTable.innerHTML = newTable.innerHTML;
      }
      continue;
    }

    // 对于非代码块，或者类型不匹配，直接替换
    if (!oldNode.isEqualNode(newNode)) {
      container.replaceChild(newNode, oldNode);
    }
  }

  // 移除多余的旧节点
  while (container.children.length > newNodes.length) {
    container.removeChild(container.lastChild);
  }
};
