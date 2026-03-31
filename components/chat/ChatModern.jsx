import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { getApiBaseUrl } from "../../utils/runtimeConfig";
import { motion } from "framer-motion";
import SharedInputBar from "./components/Input";
import ChatHeader from "./components/Header/ChatHeader";
import {
  Bubble as SharedBubble,
  ThinkingBubble as SharedThinkingBubble,
} from "./components/Messages";
import ChatHeroSection from "./components/Messages/ChatHeroSection";
import ChatMessageList from "./components/Messages/ChatMessageList";
import ChatSidebar from "./components/Sidebar/ChatSidebar";
import {
  MarkdownRendererWrapper,
  preloadCodeIcons,
  resetPythonRuntime,
  warmupPyodideDownload,
} from "./components/Markdown/MarkdownRendererWrapper";
import { useId, useSmartAutoScroll } from "./hooks/useChatShared";
import {
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_EXPANDED_WIDTH,
  buildPreview,
  cx,
  formatRelativeTime,
  getStoredModelSelection,
  persistModelSelection,
} from "./utils/shared";

export default function ChatModern({ user, initialConversationId = null, apiPathPrefix = '/ai', enableImageUpload = false, mode = 'user' }) {
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
  const switchTargetRef = useRef(null); // 手动切换对话的目标ID，阻止derivedChatId同步回弹
  const skipNextLoadRef = useRef(false); // 标记跳过下一次loadConversation（当前msgs已是最新）
  
  // 【性能优化】用于节流流式更新的refs
  const streamUpdateTimerRef = useRef(null);
  const pendingContentRef = useRef(null);
  const triggerPyodideWarmup = useCallback(() => {
    // Fire-and-forget: start downloading Pyodide as soon as chat loads.
    warmupPyodideDownload();
  }, []);
  useEffect(() => {
    preloadCodeIcons();
  }, []);
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
    resetPythonRuntime();
    triggerPyodideWarmup();
    return () => {
      resetPythonRuntime();
    };
  }, [activeChatId, triggerPyodideWarmup]);
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

    // 正在手动切换对话中，等路由追上目标后再解除屏蔽
    if (switchTargetRef.current) {
      if (derivedChatId === switchTargetRef.current) {
        switchTargetRef.current = null;
      }
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
          const userContent = entry.content || "";
          const imgMatch = userContent.match(/\n\n\[已上传图片: ([^\]]+)\]$/);
          const userMsg = {
            id: baseId,
            role: "user",
            content: userContent,
          };
          if (imgMatch) {
            userMsg.image = { url: `/items/${imgMatch[1]}`, path: imgMatch[1] };
          }
          normalized.push(userMsg);
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
      const response = await fetch(`${apiBase}${apiPathPrefix}/chats?limit=100`, {
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
  }, [historyEnabled, apiBase, apiPathPrefix]);

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
        const response = await fetch(`${apiBase}${apiPathPrefix}/chats/${chatId}`, {
          credentials: "include",
        });
        // 请求返回时对话已切走，丢弃过期结果
        if (activeChatIdRef.current !== chatId) return;
        if (response.status === 401) {
          setChatError("无权访问该对话");
          setMsgs([]);
          return;
        }
        if (!response.ok) {
          throw new Error("加载对话失败");
        }
        const data = await response.json();
        if (activeChatIdRef.current !== chatId) return;
        const historyMessages = Array.isArray(data?.messages) ? data.messages : [];
        setMsgs(mapHistoryToMessages(historyMessages));
      } catch (err) {
        if (activeChatIdRef.current !== chatId) return;
        setChatError(err.message || "加载对话失败");
        setMsgs([]);
      } finally {
        if (activeChatIdRef.current === chatId) {
          setIsLoadingHistory(false);
        }
      }
    },
    [historyEnabled, apiBase, apiPathPrefix, mapHistoryToMessages]
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
        // 跳过加载历史
        skipNextLoadRef.current = true;
        return;
      }
      
      const pendingData = sessionStorage.getItem(pendingKey);
      if (pendingData) {
        const { text, model, image: pendingImg } = JSON.parse(pendingData);
        
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
            push("user", text, pendingImg ? { image: pendingImg } : undefined);
            
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
            console.error('Failed to send pending message:', error);
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
      console.error('Failed to restore pending message:', err);
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
          console.error('Failed to clear processing flag:', e);
        }
      }
      
      switchTargetRef.current = chatId;
      setActiveChatId(chatId);
      setMsgs([]);
      setChatError("");

      // 移动端关闭侧边栏
      if (typeof window !== 'undefined' && window.innerWidth < 1024) {
        setIsSidebarOpen(false);
      }

      if (router) {
        if (mode === 'admin') {
          const prefix = apiPathPrefix.startsWith('/agent') ? '/agent' : '/admin';
          router.push(`${prefix}/ai-chat/${chatId}`, undefined, { shallow: true });
        } else {
          router.push(`/c/${chatId}`);
        }
      }
    },
    [historyEnabled, activeChatId, router, mode, apiPathPrefix]
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
        console.error('Failed to clear pending flags:', e);
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
      if (mode === 'admin') {
        const prefix = apiPathPrefix.startsWith('/agent') ? '/agent' : '/admin';
        router.push(`${prefix}/ai-chat`);
      } else {
        router.push('/c');
      }
    }
  }, [historyEnabled, activeChatId, msgs, router, mode, apiPathPrefix]);

  // 实际创建对话的内部函数（不激活）
  const createNewChatSilent = useCallback(async (title = "") => {
    try {
      const response = await fetch(`${apiBase}${apiPathPrefix}/chats`, {
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
      console.error("Failed to create chat:", err);
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
      const response = await fetch(`${apiBase}${apiPathPrefix}/chats/${chatId}`, {
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
        const apiUrl = `${baseUrl.replace(/\/$/, '')}${apiPathPrefix}/models`;
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
        console.error("Failed to load model list:", err);
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

  const push = (role, content, extra) => setMsgs((s) => [...s, { id: genId(), role, content, ...extra }]);
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
    const API_URL = `${apiBase}${apiPathPrefix}/chat`;
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
          timezone_offset_minutes: typeof window !== "undefined" ? new Date().getTimezoneOffset() : 0,
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
        }
      }
      // 【性能优化】最终确保所有pending更新都被刷新
      flushPendingUpdate();
    }
  };

  // ===== 图片上传 (管理员模式) =====
  const [pendingImage, setPendingImage] = useState(null); // { path, url, file }
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const handleImageUpload = useCallback(async (file) => {
    if (!file || !enableImageUpload) return;
    setIsUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`${apiBase}${apiPathPrefix}/upload-image`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (data.ok) {
        setPendingImage({
          path: data.image_path,
          url: data.url,
          name: file.name,
        });
      } else {
        console.error("Image upload failed:", data.error);
      }
    } catch (err) {
      console.error("Image upload error:", err);
    } finally {
      setIsUploadingImage(false);
    }
  }, [apiBase, apiPathPrefix, enableImageUpload]);

  const clearPendingImage = useCallback(() => {
    setPendingImage(null);
  }, []);

  const handleSend = async () => {
    const txt = inp.trim();
    if (!txt || isLoading) return;
    if (!selectedModel) {
      push("error", modelError || "模型未就绪，请稍后重试。");
      return;
    }

    // 处理待上传的图片
    let finalText = txt;
    let sentImage = null;
    if (pendingImage) {
      finalText = `${txt}\n\n[已上传图片: ${pendingImage.path}]`;
      sentImage = { url: pendingImage.url, path: pendingImage.path };
      setPendingImage(null);
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
        const pendingData = {
          text: finalText,
          model: selectedModel,
          skipLoad: true
        };
        if (sentImage) {
          pendingData.image = sentImage;
        }
        sessionStorage.setItem(`chat_pending_${newChatId}`, JSON.stringify(pendingData));
      } catch (err) {
        console.error('Failed to store pending message:', err);
      }
      
      // 立即跳转到新对话URL
      if (router) {
        if (mode === 'admin') {
          const prefix = apiPathPrefix.startsWith('/agent') ? '/agent' : '/admin';
          router.push(`${prefix}/ai-chat/${newChatId}`);
        } else {
          router.push(`/c/${newChatId}`);
        }
      }
      return;
    }

    handleStop();
    setIsLoading(true);
    setShowThinking(true);
    setChatError("");
    thinkingMsgIdRef.current = null;
    push("user", finalText, sentImage ? { image: sentImage } : undefined);
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
      const newMessages = [...msgs, { role: "user", content: finalText }];
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

  const headerActionHandler = historyEnabled ? handleCreateChat : clear;
  const headerActionDisabled = historyEnabled ? isCreatingChat : isLoading;
  const headerActionLabel = historyEnabled ? (isCreatingChat ? "创建中..." : "新对话") : "清空";

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

  const shuffleSuggestions = (items) => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  const [suggestions, setSuggestions] = useState(() => ALL_SUGGESTIONS.slice(0, 4));

  useEffect(() => {
    setSuggestions(shuffleSuggestions(ALL_SUGGESTIONS).slice(0, 4));
  }, []);

  const inputPlaceholder = "继续提问…";
  // 正在切换对话、等待历史加载（侧栏/头部/输入框保持不变，只替换中间内容区）
  const isLoadingChatContent = isLoadingHistory && conversationReady && Boolean(activeChatId);
  const shouldShowPlaceholder = !conversationReady;
  const shouldShowHero = conversationReady && first && !isLoadingChatContent;
  const shouldShowChat = conversationReady && !first;

  // 显示输入框的条件：有消息时，或正在加载对话内容时
  const mainPaddingBottom = (shouldShowChat || isLoadingChatContent) ? "pb-[120px]" : "pb-4";

  return (
    <div className="relative flex h-screen bg-white text-gray-900 overflow-hidden">
      {historyEnabled && (
        <ChatSidebar
          isSidebarOpen={isSidebarOpen}
          setIsSidebarOpen={setIsSidebarOpen}
          isLoadingChats={isLoadingChats}
          chats={chats}
          activeChatId={activeChatId}
          renamingChatId={renamingChatId}
          renameValue={renameValue}
          setRenameValue={setRenameValue}
          submitRename={submitRename}
          cancelRename={cancelRename}
          startRenaming={startRenaming}
          handleChatSelect={handleChatSelect}
          getDisplayTitle={getDisplayTitle}
          formatRelativeTime={formatRelativeTime}
          user={user}
        />
      )}
      <div className="relative flex flex-1 flex-col chat-selection-scope">
        <ChatHeader
          historyEnabled={historyEnabled}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
          isLoading={isLoading}
          isLoadingModels={isLoadingModels}
          models={models}
          selectedModel={selectedModel}
          modelSelectorOpen={modelSelectorOpen}
          onToggleModelSelector={() => setModelSelectorOpen(!modelSelectorOpen)}
          onSelectModel={(modelValue) => {
            setSelectedModel(modelValue);
            setModelSelectorOpen(false);
            if (modelValue) {
              setModelError("");
            }
          }}
          modelError={modelError}
          sidebarWidth={sidebarWidth}
          actionHandler={headerActionHandler}
          actionDisabled={headerActionDisabled}
          actionLabel={headerActionLabel}
        />
        <main ref={containerRef} className={cx("absolute left-0 right-0 top-[120px] bottom-0 overflow-y-auto z-20", mainPaddingBottom)} style={{ scrollbarGutter: 'stable' }}>
          <div className="mx-auto w-full max-w-4xl px-4 pt-4">
            {chatError && (
              <div className="mb-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600">
                {chatError}
              </div>
            )}
            {isLoadingChatContent && (
              <div className="mx-auto flex max-w-3xl flex-col gap-5 pt-2 animate-fade-in-fast">
                <div className="space-y-2.5">
                  <div className="skeleton-shimmer h-4 w-[72%] rounded-md" />
                  <div className="skeleton-shimmer h-4 w-[88%] rounded-md" />
                  <div className="skeleton-shimmer h-4 w-[52%] rounded-md" />
                </div>
                <div className="flex justify-end">
                  <div className="skeleton-shimmer h-10 w-36 rounded-2xl" />
                </div>
                <div className="space-y-2.5">
                  <div className="skeleton-shimmer h-4 w-[62%] rounded-md" />
                  <div className="skeleton-shimmer h-4 w-[80%] rounded-md" />
                  <div className="skeleton-shimmer h-4 w-[45%] rounded-md" />
                  <div className="skeleton-shimmer h-4 w-[70%] rounded-md" />
                </div>
                <div className="flex justify-end">
                  <div className="skeleton-shimmer h-10 w-28 rounded-2xl" />
                </div>
                <div className="space-y-2.5">
                  <div className="skeleton-shimmer h-4 w-[76%] rounded-md" />
                  <div className="skeleton-shimmer h-4 w-[56%] rounded-md" />
                </div>
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
              <ChatHeroSection
                inp={inp}
                setInp={setInp}
                handleSend={handleSend}
                handleStop={handleStop}
                mode={mode}
                isLoading={isLoading}
                enableImageUpload={enableImageUpload}
                pendingImage={pendingImage}
                handleImageUpload={handleImageUpload}
                clearPendingImage={clearPendingImage}
                isUploadingImage={isUploadingImage}
                suggestions={suggestions}
              />
            )}
            {shouldShowChat && (
              <ChatMessageList
                msgs={msgs}
                isLoading={isLoading}
                showThinking={showThinking}
                endRef={endRef}
                apiBase={apiBase}
                MarkdownRendererWrapper={MarkdownRendererWrapper}
              />
            )}
          </div>
        </main>
        {(shouldShowChat || isLoadingChatContent) && (
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
                <SharedInputBar
                  value={inp}
                  onChange={setInp}
                  onSend={handleSend}
                  onStop={handleStop}
                  placeholder={mode === 'admin' ? "输入管理指令…" : inputPlaceholder}
                  isLoading={isLoading}
                  enableImageUpload={enableImageUpload}
                  pendingImage={pendingImage}
                  onImageUpload={handleImageUpload}
                  onClearImage={clearPendingImage}
                  isUploadingImage={isUploadingImage}
                />
              </motion.div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

export { SharedBubble as Bubble, SharedThinkingBubble as ThinkingBubble, MarkdownRendererWrapper };
