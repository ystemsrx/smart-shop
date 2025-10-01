import React from 'react';

const Digit = ({ d }) => {
  if (isNaN(parseInt(d)) || d === ' ') {
    return (
      <span className="inline-block" style={{ minWidth: '0.7em' }}>{d}</span>
    );
  }
  const n = parseInt(d);
  const items = Array.from({ length: 10 }, (_, i) => i);
  const height = 1.2; // em - 增加高度以确保数字不被遮挡
  return (
    <span
      className="inline-block overflow-hidden relative"
      style={{ 
        height: `1em`, 
        width: '0.7em',
        verticalAlign: 'baseline',
        lineHeight: '1'
      }}
    >
      <span
        className="block transition-transform duration-500 ease-out will-change-transform absolute top-0 left-0 right-0"
        style={{ 
          transform: `translateY(-${n * height}em)`,
          lineHeight: `${height}em`
        }}
      >
        {items.map((v) => (
          <span 
            key={v} 
            className="block text-center" 
            style={{ 
              height: `${height}em`,
              lineHeight: `${height}em`
            }}
          >
            {v}
          </span>
        ))}
      </span>
    </span>
  );
};

export default function AnimatedPrice({ value, prefix = '¥', className = '', precision = 2 }) {
  const str = (Number.isFinite(value) ? Number(value) : 0).toFixed(precision);
  const txt = `${prefix || ''}${str}`;
  return (
    <span className={`${className} inline-flex items-baseline`} style={{ fontVariantNumeric: 'tabular-nums' }}>
      {txt.split('').map((ch, idx) => (
        ch >= '0' && ch <= '9' ? <Digit key={idx} d={ch} /> : <span key={idx} className="inline-block">{ch}</span>
      ))}
    </span>
  );
}

