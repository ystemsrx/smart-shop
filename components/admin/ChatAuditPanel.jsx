import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, MessageSquare, ChevronLeft, ChevronDown, Settings2, Clock, User,
  MessageCircle, Loader2, Check, Infinity
} from 'lucide-react';
import ChatVendorScripts from '../ChatVendorScripts';
import { Bubble, ThinkingBubble, MarkdownRendererWrapper } from '../ChatUI';


const RETENTION_OPTIONS = [
  { value: 0, label: '永久保留', icon: <Infinity size={14} /> },
  { value: 7, label: '7 天' },
  { value: 14, label: '14 天' },
  { value: 30, label: '30 天' },
  { value: 90, label: '90 天' },
  { value: 365, label: '365 天' },
];

const PAGE_SIZE = 30;

/**
 * 将后端返回的 SQLite UTC 时间字符串解析为本地 Date 对象。
 * SQLite CURRENT_TIMESTAMP 存储的是 UTC，格式 "YYYY-MM-DD HH:MM:SS"。
 */
function parseUTCTimestamp(val) {
  if (!val) return null;
  if (typeof val === 'number') return new Date(val * 1000);
  // 将 "YYYY-MM-DD HH:MM:SS" 转为 ISO 8601 UTC 格式以确保按 UTC 解析
  const iso = String(val).replace(' ', 'T') + 'Z';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

function formatTime(val) {
  const d = parseUTCTimestamp(val);
  if (!d) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function relativeTime(val) {
  const d = parseUTCTimestamp(val);
  if (!d) return '';
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins}分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}天前`;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}


/* ---- Custom Popover Select for retention settings ---- */

const RetentionSelectPopover = ({ value, onChange, disabled }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState({});
  const [animateState, setAnimateState] = useState('closed');
  const buttonRef = useRef(null);
  const popoverRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target)
      ) {
        setIsOpen(false);
        setAnimateState('closed');
      }
    };
    const handleScroll = () => {
      if (isOpen) {
        setIsOpen(false);
        setAnimateState('closed');
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('scroll', handleScroll, true);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isOpen]);

  const handleToggle = (e) => {
    if (disabled) return;
    e.stopPropagation();
    if (!isOpen) {
      const rect = buttonRef.current.getBoundingClientRect();
      const popoverHeight = 260;
      const popoverWidth = 180;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      let finalLeft = rect.left;
      if (finalLeft + popoverWidth > window.innerWidth) {
        finalLeft = window.innerWidth - popoverWidth - 10;
      }
      if (spaceBelow < popoverHeight && spaceAbove > spaceBelow) {
        setPopoverStyle({
          position: 'fixed',
          bottom: `${window.innerHeight - rect.top + 6}px`,
          left: `${finalLeft}px`,
          transformOrigin: 'bottom left',
        });
      } else {
        setPopoverStyle({
          position: 'fixed',
          top: `${rect.bottom + 6}px`,
          left: `${finalLeft}px`,
          transformOrigin: 'top left',
        });
      }
      setAnimateState('opening');
      setIsOpen(true);
      setTimeout(() => setAnimateState('open'), 10);
    } else {
      setIsOpen(false);
      setAnimateState('closed');
    }
  };

  const currentLabel = RETENTION_OPTIONS.find((o) => o.value === value)?.label || `${value} 天`;

  return (
    <>
      <button
        ref={buttonRef}
        onClick={handleToggle}
        disabled={disabled}
        className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-sm rounded-xl border transition-all duration-200 ${
          isOpen
            ? 'border-blue-300 bg-blue-50 text-blue-700 shadow-sm'
            : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <Clock size={14} className="opacity-60" />
        <span className="font-medium">{currentLabel}</span>
        <ChevronDown
          size={14}
          className={`opacity-50 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && createPortal(
        <div
          ref={popoverRef}
          style={{ ...popoverStyle, zIndex: 9999 }}
          className={`w-44 bg-white rounded-2xl shadow-xl border border-gray-100 p-1.5 transition-all duration-300 ${
            animateState === 'open'
              ? 'opacity-100 scale-100 translate-y-0'
              : 'opacity-0 scale-90 translate-y-2'
          }`}
        >
          {RETENTION_OPTIONS.map((opt) => {
            const isSelected = value === opt.value;
            return (
              <button
                key={opt.value}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(opt.value);
                  setIsOpen(false);
                  setAnimateState('closed');
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all duration-150 ${
                  isSelected
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {opt.icon || <Clock size={14} className="opacity-40" />}
                <span className="flex-1 text-left">{opt.label}</span>
                {isSelected && <Check size={14} className="text-blue-500" />}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
};


export function ChatAuditPanel({ apiRequest, isAdmin }) {
  // ---- Retention settings ----
  const [retentionDays, setRetentionDays] = useState(7);
  const [retentionLoading, setRetentionLoading] = useState(false);
  const [showRetention, setShowRetention] = useState(false);

  // ---- User list ----
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersOffset, setUsersOffset] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const userListRef = useRef(null);
  const loadingMoreRef = useRef(false);

  // ---- Selected user / threads ----
  const [selectedUser, setSelectedUser] = useState(null);
  const [threads, setThreads] = useState([]);
  const [threadsLoading, setThreadsLoading] = useState(false);

  // ---- Selected thread / messages ----
  const [selectedThread, setSelectedThread] = useState(null);
  const [selectedThreadInfo, setSelectedThreadInfo] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  // ---- Debounce search ----
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // ---- Load retention settings ----
  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      try {
        const r = await apiRequest('/admin/chat-settings');
        if (r?.data?.chat_retention_days !== undefined) {
          setRetentionDays(r.data.chat_retention_days);
        }
      } catch {}
    })();
  }, [isAdmin, apiRequest]);

  // ---- Load users ----
  const loadUsers = useCallback(async (offset = 0, append = false) => {
    if (!append) setUsersLoading(true);
    try {
      const q = encodeURIComponent(debouncedQuery);
      const r = await apiRequest(`/admin/chat-audit/users?q=${q}&offset=${offset}&limit=${PAGE_SIZE}`);
      if (r?.data) {
        const newUsers = r.data.users || [];
        if (append) {
          setUsers((prev) => [...prev, ...newUsers]);
        } else {
          setUsers(newUsers);
        }
        setUsersTotal(r.data.total || 0);
        setUsersOffset(offset);
      }
    } catch (e) {
      console.error('Failed to load chat audit users:', e);
    } finally {
      setUsersLoading(false);
      loadingMoreRef.current = false;
    }
  }, [apiRequest, debouncedQuery]);

  useEffect(() => {
    setSelectedUser(null);
    setThreads([]);
    setSelectedThread(null);
    setMessages([]);
    loadUsers(0, false);
  }, [debouncedQuery, loadUsers]);

  // ---- Infinite scroll for user list ----
  const handleUserListScroll = useCallback(() => {
    const el = userListRef.current;
    if (!el || loadingMoreRef.current) return;
    const hasMore = users.length < usersTotal;
    if (!hasMore) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 50) {
      loadingMoreRef.current = true;
      loadUsers(usersOffset + PAGE_SIZE, true);
    }
  }, [users.length, usersTotal, usersOffset, loadUsers]);

  // ---- Load threads for selected user ----
  useEffect(() => {
    if (!selectedUser) {
      setThreads([]);
      return;
    }
    (async () => {
      setThreadsLoading(true);
      setSelectedThread(null);
      setMessages([]);
      try {
        const r = await apiRequest(`/admin/chat-audit/users/${encodeURIComponent(selectedUser.student_id)}/threads`);
        if (r?.data?.threads) {
          setThreads(r.data.threads);
        }
      } catch (e) {
        console.error('Failed to load threads:', e);
      } finally {
        setThreadsLoading(false);
      }
    })();
  }, [selectedUser, apiRequest]);

  // ---- Load messages for selected thread ----
  useEffect(() => {
    if (!selectedThread) {
      setMessages([]);
      return;
    }
    (async () => {
      setMessagesLoading(true);
      try {
        const r = await apiRequest(`/admin/chat-audit/threads/${encodeURIComponent(selectedThread)}/messages`);
        if (r?.data) {
          setMessages(r.data.messages || []);
          setSelectedThreadInfo(r.data.thread || null);
        }
      } catch (e) {
        console.error('Failed to load messages:', e);
      } finally {
        setMessagesLoading(false);
      }
    })();
  }, [selectedThread, apiRequest]);

  // ---- Save retention ----
  const handleRetentionChange = async (val) => {
    setRetentionLoading(true);
    try {
      const r = await apiRequest('/admin/chat-settings', {
        method: 'PUT',
        body: JSON.stringify({ chat_retention_days: val }),
        headers: { 'Content-Type': 'application/json' },
      });
      if (r?.data?.chat_retention_days !== undefined) {
        setRetentionDays(r.data.chat_retention_days);
      }
    } catch (e) {
      console.error('Failed to update retention:', e);
    } finally {
      setRetentionLoading(false);
    }
  };

  const hasMore = users.length < usersTotal;

  return (
    <>
      <ChatVendorScripts />
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <MessageSquare size={20} />
            聊天审计
          </h2>
          {isAdmin && (
            <button
              onClick={() => setShowRetention((v) => !v)}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors px-3 py-1.5 rounded-lg hover:bg-gray-100"
            >
              <Settings2 size={16} />
              保留设置
            </button>
          )}
        </div>

        {/* Retention settings panel */}
        <AnimatePresence>
          {isAdmin && showRetention && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                <div className="flex items-center gap-4">
                  <span className="text-sm text-gray-600 whitespace-nowrap">聊天记录保留时间：</span>
                  <RetentionSelectPopover
                    value={retentionDays}
                    onChange={handleRetentionChange}
                    disabled={retentionLoading}
                  />
                  {retentionLoading && <Loader2 size={16} className="animate-spin text-gray-400" />}
                  <span className="text-xs text-gray-400">
                    {retentionDays === 0 ? '聊天记录将永久保留' : `超过 ${retentionDays} 天的记录将被自动清理`}
                  </span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main content area */}
        <div className="flex gap-4 h-[calc(100vh-14rem)]">
          {/* Left panel - User list */}
          <div className="w-72 flex-shrink-0 bg-white rounded-xl border border-gray-100 shadow-sm flex flex-col overflow-hidden">
            {/* Search */}
            <div className="p-3 border-b border-gray-50">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索用户..."
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition-all"
                />
              </div>
              <div className="text-xs text-gray-400 mt-1.5 px-1">
                共 {usersTotal} 位用户有聊天记录
              </div>
            </div>

            {/* User list with infinite scroll */}
            <div
              ref={userListRef}
              onScroll={handleUserListScroll}
              className="flex-1 overflow-y-auto custom-scrollbar"
            >
              {usersLoading && users.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-gray-400">
                  <Loader2 size={20} className="animate-spin" />
                </div>
              ) : users.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400 text-sm">
                  <MessageCircle size={24} className="mb-2 opacity-50" />
                  暂无聊天记录
                </div>
              ) : (
                <>
                  {users.map((u) => (
                    <button
                      key={u.student_id}
                      onClick={() => setSelectedUser(u)}
                      className={`w-full text-left px-4 py-3 border-b border-gray-50 transition-all hover:bg-gray-50 ${
                        selectedUser?.student_id === u.student_id ? 'bg-blue-50 border-l-2 border-l-blue-400' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                            <User size={14} className="text-gray-500" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-gray-800 truncate">{u.display_name}</div>
                            <div className="text-xs text-gray-400 truncate">{u.student_id}</div>
                          </div>
                        </div>
                        <div className="flex flex-col items-end flex-shrink-0 ml-2">
                          <span className="text-xs bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">
                            {u.thread_count}
                          </span>
                          <span className="text-[10px] text-gray-400 mt-0.5">{relativeTime(u.last_chat_at)}</span>
                        </div>
                      </div>
                    </button>
                  ))}
                  {hasMore && (
                    <div className="flex items-center justify-center py-3 text-gray-400">
                      <Loader2 size={16} className="animate-spin" />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Right panel */}
          <div className="flex-1 bg-white rounded-xl border border-gray-100 shadow-sm flex flex-col overflow-hidden">
            {!selectedUser ? (
              /* Empty state */
              <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                <MessageSquare size={40} className="mb-3 opacity-30" />
                <p className="text-sm">请从左侧选择一个用户查看聊天记录</p>
              </div>
            ) : !selectedThread ? (
              /* Thread list */
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="px-5 py-3.5 border-b border-gray-50 flex items-center gap-2">
                  <User size={16} className="text-gray-500" />
                  <span className="text-sm font-medium text-gray-700">{selectedUser.display_name}</span>
                  <span className="text-xs text-gray-400">({selectedUser.student_id})</span>
                  <span className="text-xs text-gray-400 ml-auto">{threads.length} 个聊天</span>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                  {threadsLoading ? (
                    <div className="flex items-center justify-center py-12 text-gray-400">
                      <Loader2 size={20} className="animate-spin" />
                    </div>
                  ) : threads.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-gray-400 text-sm">
                      暂无聊天记录
                    </div>
                  ) : (
                    threads.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setSelectedThread(t.id)}
                        className="w-full text-left px-5 py-3.5 border-b border-gray-50 hover:bg-gray-50 transition-all group"
                      >
                        <div className="flex items-center justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-gray-700 truncate group-hover:text-blue-600 transition-colors">
                              {t.title || t.preview || '未命名聊天'}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-gray-400 flex-shrink-0 ml-3">
                            <Clock size={12} />
                            {formatTime(t.last_message_at)}
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : (
              /* Message view */
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Message view header */}
                <div className="px-5 py-3 border-b border-gray-50 flex items-center gap-3">
                  <button
                    onClick={() => {
                      setSelectedThread(null);
                      setMessages([]);
                      setSelectedThreadInfo(null);
                    }}
                    className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    <ChevronLeft size={18} />
                    返回
                  </button>
                  <div className="h-4 w-px bg-gray-200" />
                  <span className="text-sm font-medium text-gray-700 truncate">
                    {selectedThreadInfo?.title || selectedThreadInfo?.preview || '聊天内容'}
                  </span>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-4">
                  {messagesLoading ? (
                    <div className="flex items-center justify-center py-12 text-gray-400">
                      <Loader2 size={20} className="animate-spin" />
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-gray-400 text-sm">
                      暂无消息
                    </div>
                  ) : (
                    <div className="flex flex-col gap-4 max-w-3xl mx-auto">
                      {messages.map((m, idx) => {
                        if (m.role === 'user') {
                          return (
                            <div key={m.id || idx}>
                              <Bubble role="user">{m.content}</Bubble>
                            </div>
                          );
                        }
                        if (m.role === 'assistant') {
                          return (
                            <div key={m.id || idx} className="space-y-2">
                              {m.thinking_content && (
                                <ThinkingBubble
                                  content={m.thinking_content}
                                  isComplete={true}
                                  isStopped={!!m.is_thinking_stopped}
                                  thinkingDuration={m.thinking_duration || null}
                                />
                              )}
                              {m.content && m.content.trim() && (
                                <MarkdownRendererWrapper content={m.content} isStreaming={false} />
                              )}
                            </div>
                          );
                        }
                        return null;
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
