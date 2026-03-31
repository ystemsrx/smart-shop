import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, PanelLeft, PanelLeftClose, Pencil, User2 } from "lucide-react";

import {
  HEADER_LOGO,
  SHOP_NAME,
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_EXPANDED_WIDTH,
  cx,
} from "../../utils/shared";

const ChatSidebar = ({
  isSidebarOpen,
  setIsSidebarOpen,
  isLoadingChats,
  chats,
  activeChatId,
  renamingChatId,
  renameValue,
  setRenameValue,
  submitRename,
  cancelRename,
  startRenaming,
  handleChatSelect,
  getDisplayTitle,
  formatRelativeTime,
  user,
}) => {
  return (
    <>
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

      <motion.aside
        animate={{ width: isSidebarOpen ? SIDEBAR_EXPANDED_WIDTH : SIDEBAR_COLLAPSED_WIDTH }}
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
        <div className="flex h-full flex-col" style={{ minWidth: isSidebarOpen ? SIDEBAR_EXPANDED_WIDTH : "auto" }}>
          <div className={cx("flex items-center gap-2", "pt-6 lg:pt-20", isSidebarOpen ? "justify-between px-4" : "justify-center px-2")}>
            {isSidebarOpen ? (
              <>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div className="h-10 w-10 flex-shrink-0 bg-white rounded-full p-[3px] shadow-sm border border-gray-300">
                    <img src={HEADER_LOGO} alt={SHOP_NAME} className="h-full w-full rounded-full object-contain" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900 truncate">{SHOP_NAME}</div>
                    <div className="text-xs text-gray-500">AI Assistant</div>
                  </div>
                </div>
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
          <div className={cx("mt-2 flex-1 overflow-y-auto px-2 pb-4", !isSidebarOpen && "[&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]")}>
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
                          className={cx("flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left transition", isActive ? "bg-white shadow-sm" : "hover:bg-white/70")}
                        >
                          <div className="flex-1 min-w-0">
                            {renamingChatId === chat.id ? (
                              <input
                                value={renameValue}
                                onChange={(event) => setRenameValue(event.target.value)}
                                onBlur={submitRename}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") submitRename();
                                  if (event.key === "Escape") cancelRename();
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
                              onClick={(event) => {
                                event.stopPropagation();
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
            <div className={cx("flex items-center gap-2", !isSidebarOpen && "justify-center")}>
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
  );
};

export default ChatSidebar;
