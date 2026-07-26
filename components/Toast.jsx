import React from 'react';

const POSITION_CLASSES = {
  'top-center': 'top-4 left-1/2 -translate-x-1/2',
  'top-right': 'top-4 right-4',
};

const VARIANT_STYLES = {
  error: {
    box: 'border-rose-300 bg-rose-50/90',
    icon: 'fas fa-exclamation-circle',
    iconColor: 'text-rose-600',
    text: 'text-rose-700',
    close: 'text-rose-400 hover:text-rose-600',
  },
  success: {
    box: 'border-emerald-300 bg-emerald-50/90',
    icon: 'fas fa-check-circle',
    iconColor: 'text-emerald-600',
    text: 'text-emerald-700',
    close: 'text-emerald-400 hover:text-emerald-600',
  },
  info: {
    box: 'border-stone-300 bg-white/95',
    icon: 'fas fa-circle-info',
    iconColor: 'text-stone-500',
    text: 'text-stone-700',
    close: 'text-stone-400 hover:text-stone-600',
  },
};

const Toast = ({
  message,
  show = false,
  onClose = null,
  position = 'top-center',
  inline = false,
  variant = 'error',
}) => {
  const positionClass = POSITION_CLASSES[position] || POSITION_CLASSES['top-center'];
  const layoutClass = inline ? 'absolute' : 'fixed';
  const variantStyle = VARIANT_STYLES[variant] || VARIANT_STYLES.error;

  return (
    <div
      className={`${layoutClass} ${positionClass} z-[1100] transition-[opacity,transform] duration-200 ${
        show ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'
      }`}
      aria-live="assertive"
    >
      <div className={`pointer-events-auto flex items-center gap-3 rounded-xl border ${variantStyle.box} px-4 py-3 shadow-[0_8px_24px_rgba(20,20,19,0.12)] backdrop-blur-sm`}>
        <span className={`${variantStyle.iconColor} flex items-center justify-center`}>
          <i className={variantStyle.icon}></i>
        </span>
        <div className={`text-sm font-semibold ${variantStyle.text} leading-snug`}>{message}</div>
        {onClose && (
          <button
            onClick={onClose}
            className={`ml-2 p-2 -m-2 text-xs ${variantStyle.close} transition-colors`}
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
