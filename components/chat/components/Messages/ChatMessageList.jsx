import React from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";

import Bubble from "./Bubble";
import ErrorBubble from "./ErrorBubble";
import LoadingIndicator from "./LoadingIndicator";
import ThinkingBubble from "./ThinkingBubble";
import ToolCallCard from "./ToolCallCard";

const ChatMessageList = ({
  msgs,
  isLoading,
  showThinking,
  endRef,
  apiBase,
  MarkdownRendererWrapper,
}) => {
  return (
    <LayoutGroup key="chat-message-list">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <AnimatePresence initial={true} mode="popLayout">
          {msgs.map((message, index) => {
            let content = null;

            if (message.role === "assistant") {
              const isEmpty = !message.content || !message.content.trim();
              if (isEmpty && message.tool_calls) {
                return null;
              }
              const isLastMessage = index === msgs.length - 1;
              const isStreaming = isLoading && isLastMessage;
              content = <MarkdownRendererWrapper content={message.content} isStreaming={isStreaming} />;
            } else if (message.role === "assistant_thinking") {
              content = (
                <ThinkingBubble
                  content={message.content}
                  isComplete={message.isComplete}
                  isStopped={message.isStopped}
                  thinkingDuration={message.thinkingDuration}
                />
              );
            } else if (message.role === "tool_call") {
              content = (
                <ToolCallCard
                  tool_call_id={message.tool_call_id}
                  status={message.status}
                  function_name={message.function_name}
                  arguments_text={message.arguments_text}
                  result_summary={message.result_summary}
                  error_message={message.error_message}
                />
              );
            } else if (message.role === "user") {
              const displayText = message.content.replace(/\n\n\[已上传图片: [^\]]+\]$/, "");
              const imageUrl = message.image?.url;
              const imageSource = imageUrl?.startsWith("/") ? `${apiBase}${imageUrl}` : imageUrl;
              content = (
                <div>
                  {imageUrl && (
                    <div className="flex justify-end mb-1.5">
                      <img
                        src={imageSource}
                        alt=""
                        className="w-20 h-20 rounded-lg object-cover border border-gray-200 shadow-sm"
                        onError={(event) => {
                          event.target.style.display = "none";
                          if (event.target.nextElementSibling) {
                            event.target.nextElementSibling.style.display = "flex";
                          }
                        }}
                      />
                      <div className="hidden w-20 h-20 rounded-lg bg-gray-100 border border-gray-200 items-center justify-center">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                      </div>
                    </div>
                  )}
                  <Bubble role={message.role}>
                    {displayText}
                  </Bubble>
                </div>
              );
            } else if (message.role === "error") {
              content = <ErrorBubble message={message.content} />;
            }

            if (!content) return null;

            const staggerDelay = Math.log(index + 1) * 0.05;

            return (
              <motion.div
                key={message.id}
                layout="position"
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, transition: { duration: 0 } }}
                transition={{
                  opacity: { duration: 0.3, delay: staggerDelay, ease: "easeOut" },
                  y: { type: "spring", stiffness: 600, damping: 30, mass: 0.8, delay: staggerDelay },
                  scale: { type: "spring", stiffness: 600, damping: 30, mass: 0.8, delay: staggerDelay },
                  layout: {
                    duration: 0.35,
                    ease: [0.25, 0.1, 0.25, 1],
                    delay: 0.05,
                  },
                }}
                style={{
                  minHeight: "fit-content",
                  willChange: "transform, opacity",
                  contain: "layout",
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
                layout: { duration: 0.2, ease: "easeInOut" },
              }}
            >
              <LoadingIndicator />
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={endRef} />
      </div>
    </LayoutGroup>
  );
};

export default ChatMessageList;
