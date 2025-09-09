import React from 'react';

const Digit = ({ d }) => {
  if (isNaN(parseInt(d)) || d === ' ') {
    return (
      <span className="inline-block mx-0.5" style={{ minWidth: '0.6em' }}>{d}</span>
    );
  }
  const n = parseInt(d);
  const items = Array.from({ length: 10 }, (_, i) => i);
  const height = 1.0; // em
  return (
    <span
      className="inline-block overflow-hidden align-baseline"
      style={{ height: `${height}em`, width: '0.6em' }}
    >
      <span
        className="block transition-transform duration-500 ease-out will-change-transform"
        style={{ transform: `translateY(-${n * height}em)` }}
      >
        {items.map((v) => (
          <span key={v} className="block leading-none" style={{ height: `${height}em` }}>{v}</span>
        ))}
      </span>
    </span>
  );
};

export default function AnimatedPrice({ value, prefix = '¥', className = '', precision = 2 }) {
  const str = (Number.isFinite(value) ? Number(value) : 0).toFixed(precision);
  const txt = `${prefix || ''}${str}`;
  return (
    <span className={className} style={{ fontVariantNumeric: 'tabular-nums' }}>
      {txt.split('').map((ch, idx) => (
        ch >= '0' && ch <= '9' ? <Digit key={idx} d={ch} /> : <span key={idx} className="inline-block mx-0.5">{ch}</span>
      ))}
    </span>
  );
}

