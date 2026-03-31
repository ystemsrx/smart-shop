import React, { useEffect, useRef, useState } from "react";

import { cx } from "../../utils/shared";

function InputBar({ value, onChange, onSend, onStop, placeholder, autoFocus, isLoading, enableImageUpload, pendingImage, onImageUpload, onClearImage, isUploadingImage }) {
  const ta = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const imageInputRef = useRef(null);

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
    const text = value.trim();
    if (!text || isLoading) return;
    await onSend();
  };

  const handleClick = () => {
    if (isLoading) {
      onStop();
    } else {
      fire();
    }
  };

  const isMobile = () => {
    if (typeof window === "undefined") return false;
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768;
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      if (isMobile()) {
        return;
      }
      event.preventDefault();
      if (!isLoading) {
        fire();
      }
    }
  };

  const handleImageSelect = (event) => {
    const file = event.target.files?.[0];
    if (file && onImageUpload) {
      onImageUpload(file);
    }
    if (event.target) event.target.value = "";
  };

  const radius = expanded ? "rounded-3xl" : "rounded-full";
  const minHeight = expanded ? "min-h-[44px]" : "min-h-[32px]";

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
      {pendingImage && (
        <div className="mb-1.5 flex items-start px-1">
          <div className="relative group">
            <img
              src={pendingImage.url?.startsWith("/") ? `${typeof window !== "undefined" ? window.__API_BASE || "" : ""}${pendingImage.url}` : pendingImage.url}
              alt=""
              className="w-14 h-14 rounded-lg object-cover border border-gray-200 shadow-sm"
            />
            <button
              onClick={onClearImage}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
              title="移除图片"
            >
              <svg width="10" height="10" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M1 1l12 12M13 1L1 13" /></svg>
            </button>
          </div>
        </div>
      )}
      <div
        className={cx(
          "bg-white border border-gray-300 shadow-sm p-1.5 grid gap-1 items-center",
          enableImageUpload ? "[grid-template-areas:'leading_primary_trailing'] grid-cols-[auto_1fr_auto]" : "[grid-template-areas:'primary_trailing'] grid-cols-[1fr_auto]",
          radius
        )}
        aria-label="composer"
      >
        {enableImageUpload && (
          <div className="[grid-area:leading] flex items-center">
            <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
            <button
              onClick={() => imageInputRef.current?.click()}
              disabled={isUploadingImage}
              title="上传图片"
              className={cx(
                "h-8 w-8 flex items-center justify-center rounded-full transition-colors",
                isUploadingImage ? "text-gray-300" : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              )}
            >
              {isUploadingImage ? (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
              )}
            </button>
          </div>
        )}
        <div className={cx(minHeight, "max-h-60 overflow-hidden [grid-area:primary] flex flex-1 items-center")}>
          <textarea
            ref={ta}
            value={value}
            onChange={(event) => onChange(event.target.value)}
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
          title={isLoading ? "停止生成" : isMobile() ? "点击发送" : "发送 (Enter)\n换行 (Shift+Enter)"}
          className={cx(
            "h-9 w-9 flex items-center justify-center rounded-full transition-colors",
            isLoading ? "bg-white text-black border border-gray-300 hover:bg-gray-100" : "bg-black text-white hover:bg-black/80 disabled:opacity-40 disabled:cursor-not-allowed"
          )}
        >
          {isLoading ? stopIcon : sendIcon}
        </button>
      </div>
      <p className="mt-2 text-center text-xs text-gray-400 select-none">
        {isLoading ? "AI 正在响应..." : isMobile() ? "点击发送按钮发送消息" : "Enter 发送 · Shift+Enter 换行"}
      </p>
    </div>
  );
}

export default InputBar;
