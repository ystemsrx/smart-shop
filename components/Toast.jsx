import React from 'react';

const Toast = ({ message, show = false, onClose = null }) => {
  return (
    <div
      className={`fixed top-5 left-1/2 -translate-x-1/2 z-[1100] transition-all duration-500 ${
        show ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'
      }`}
      aria-live="assertive"
    >
      <div className="pointer-events-auto flex items-center gap-3 rounded-xl border border-rose-300 bg-rose-50/90 px-4 py-3 shadow-2xl backdrop-blur-sm">
        <span className="text-rose-600 flex items-center justify-center">
          <i className="fas fa-exclamation-circle"></i>
        </span>
        <div className="text-sm font-semibold text-rose-700 leading-snug">{message}</div>
        {onClose && (
          <button
            onClick={onClose}
            className="ml-2 text-xs text-rose-400 hover:text-rose-600 transition-colors"
            aria-label="关闭提示"
          >
            <i className="fas fa-times"></i>
          </button>
        )}
      </div>
    </div>
  );
};

export default Toast;
